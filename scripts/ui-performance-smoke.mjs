import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { chromium, _electron } from "playwright-core";
import electron from "electron";

// 用真实浏览器验证按需加载与绘制；不依赖模型服务或用户数据。
const root = resolve(import.meta.dirname, "..");
const output = await mkdtemp(join(tmpdir(), "aibuddy-ui-performance-"));
const fixtureId = "virtual:ui-performance-smoke";
const fixtureSource = `
import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { AIbuddyIntlProvider } from "@/i18n/IntlProvider.js";
import { MermaidBlock } from "@/components/ai-elements/mermaid-block.js";
import "@/styles.css";
function Fixture() {
  const [code, setCode] = useState(null);
  const [theme, setTheme] = useState("light");
  const [previews, setPreviews] = useState(0);
  const switchTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", next === "dark");
    setTheme(next);
  };
  return h(AIbuddyIntlProvider, { initialLocale: "zh-CN" },
    h("div", { className: theme === "dark" ? "dark" : "", style: { padding: 16 } },
      h("button", { id: "show", onClick: () => setCode("graph TD; A[开始]-->B[完成]") }, "图表"),
      h("button", { id: "theme", onClick: switchTheme }, "主题"),
      h("button", { id: "invalid", onClick: () => setCode("invalid diagram") }, "无效语法"),
      h("button", { id: "replace", onClick: () => setCode("graph LR; C[更新]-->D[最新]") }, "替换"),
      h("output", { id: "previews" }, previews),
      ...["animated-gradient-text", "cua-group-gradient-text", "wf-ws-shine"].map(className =>
        h("p", { key: className, className, "data-status": true }, "正在执行工具")),
      code && h(MermaidBlock, { code, theme, onOpenPreview: () => setPreviews(value => value + 1) })
    ));
}
createRoot(document.getElementById("root")).render(h(Fixture));
`;
const server = await createServer({
  configFile: resolve(root, "packages/desktop/vite.config.ts"),
  server: { host: "127.0.0.1", port: 0, open: false },
  plugins: [
    {
      name: "ui-performance-smoke",
      resolveId(id) {
        if (id === fixtureId) return `\0${fixtureId}`;
      },
      load(id) {
        if (id === `\0${fixtureId}`) return fixtureSource;
      },
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== "/__ui-performance") return next();
          try {
            res.setHeader("Content-Type", "text/html");
            res.end(
              await vite.transformIndexHtml(
                req.url,
                `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/${fixtureId}"></script></body></html>`,
              ),
            );
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const requests = [];
  const errors = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}__ui-performance`);
  await page.locator("[data-status]").first().waitFor();
  assert.equal(
    requests.some((url) => /@streamdown_mermaid|mermaid_dist|mermaid\.js/.test(url)),
    false,
    "Mermaid must stay unloaded before a diagram is requested",
  );
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.locator("#theme").click();
    for (const reducedMotion of ["no-preference", "reduce"]) {
      await page.emulateMedia({ reducedMotion });
      const statuses = await page.locator("[data-status]").evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          return {
            animation: style.animationName,
            color: style.color,
            fill: style.webkitTextFillColor,
            text: element.textContent,
          };
        }),
      );
      for (const status of statuses) {
        assert.equal(status.animation, "none");
        assert.notEqual(status.color, "rgba(0, 0, 0, 0)");
        assert.notEqual(status.fill, "rgba(0, 0, 0, 0)");
        assert.equal(status.text, "正在执行工具");
      }
    }
  }
  // 在首次下载尚未完成时替换内容，验证旧异步结果不会覆盖当前图表。
  const importGate = Promise.withResolvers();
  await page.route(/@streamdown_mermaid\.js/, async (route) => {
    await importGate.promise;
    await route.continue();
  });
  const importRequest = page.waitForRequest((request) =>
    /@streamdown_mermaid\.js/.test(request.url()),
  );
  await page.locator("#show").click();
  await importRequest;
  await page.locator("#replace").click();
  importGate.resolve();
  const diagram = page.locator('[data-mermaid-block] [role="img"] svg');
  await diagram.waitFor({ timeout: 30_000 });
  assert.match(await diagram.textContent(), /最新/);
  await page.locator("#show").click();
  await page.waitForFunction(() =>
    document.querySelector('[data-mermaid-block] [role="img"] svg')?.textContent.includes("开始"),
  );
  assert.match(await diagram.textContent(), /开始/);
  await page.locator('[data-mermaid-block] [role="img"]').dblclick();
  assert.equal(await page.locator("#previews").textContent(), "1");
  const darkNodeFill = await diagram
    .locator(".node rect")
    .first()
    .evaluate((node) => getComputedStyle(node).fill);
  await page.locator("#theme").click();
  await page.waitForFunction((previous) => {
    const node = document.querySelector('[data-mermaid-block] [role="img"] svg .node rect');
    return node && getComputedStyle(node).fill !== previous;
  }, darkNodeFill);
  await page.locator("#invalid").click();
  await page.locator("[data-mermaid-block] pre").waitFor();
  assert.equal(await page.locator("[data-mermaid-block] pre").textContent(), "invalid diagram");
  await page.locator("#show").click();
  await page.locator("#replace").click();
  await diagram.waitFor();
  await page.waitForFunction(() =>
    document.querySelector('[data-mermaid-block] [role="img"] svg')?.textContent.includes("最新"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: join(output, "browser.png") });
  await writeFile(
    join(output, "result.json"),
    JSON.stringify({ passed: true, requests: requests.length }),
  );
  console.log(`UI performance smoke passed: ${output}`);
} finally {
  await browser?.close();
  await server.close();
}

if (process.argv.includes("--desktop")) {
  const desktopHome = join(output, "desktop-home");
  const env = {
    ...process.env,
    AIBUDDY_DATA_BASE_DIR: desktopHome,
    AIBUDDY_DESKTOP_HOME_DIR: desktopHome,
    AIBUDDY_DESKTOP_USER_DATA_DIR: join(desktopHome, "user-data"),
    AIBUDDY_DESKTOP_SESSION_DATA_DIR: join(desktopHome, "session"),
    AIBUDDY_DISABLE_FIXED_REMOTE_DEBUGGING_PORT: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const application = await _electron.launch({
    executablePath: electron,
    args: [resolve(root, "packages/desktop")],
    env,
    timeout: 60_000,
  });
  try {
    const page = await application.firstWindow();
    // Electron file:// 下 Resource Timing 为空，直接检查 V8 实际加载的模块。
    const cdp = await page.context().newCDPSession(page);
    const settingsModules = new Set();
    cdp.on("Debugger.scriptParsed", ({ url }) => {
      if (/\/SettingsPage-[^/]+\.js/.test(url)) settingsModules.add(url);
    });
    await cdp.send("Debugger.enable");
    await page.locator("[data-v4-draft-greeting]").waitFor({ timeout: 60_000 });
    assert.equal(settingsModules.size, 0, "Settings must stay unloaded on the home screen");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    await page.getByTestId("settings-page").waitFor();
    assert.ok(settingsModules.size > 0, "Opening settings must load its deferred module");
    const settingsLoads = settingsModules.size;
    const section = page.locator('[data-testid^="settings-section-nav-"]').nth(1);
    await section.click();
    assert.equal(await section.getAttribute("aria-current"), "page");
    await page.getByTestId("settings-back-button").click();
    await page.getByTestId("settings-page").waitFor({ state: "hidden" });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    await page.getByTestId("settings-page").waitFor();
    assert.equal(settingsModules.size, settingsLoads, "Reopening settings must reuse the module");
    await page.screenshot({ path: join(output, "desktop-settings.png") });
    await writeFile(
      join(output, "desktop-result.json"),
      JSON.stringify({ passed: true, settingsLoads }),
    );
    console.log(`Desktop settings smoke passed: ${output}`);
  } finally {
    await application.close();
  }
}
