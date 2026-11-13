import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { profileStartupMemory, sampleMemory } from "./memory-profile.mjs";

// 在一次性 Windows CI 用户下启动最终产物；不向模型发请求，不访问开发者的数据。
const appDir = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const fixtureHome = await mkdtemp(join(tmpdir(), "aibuddy7se-gui-migration-"));
const fixtureScript = resolve(import.meta.dirname, "migration-smoke.cjs");
execFileSync(join(appDir, "aibuddy7se.exe"), [fixtureScript, appDir, fixtureHome, "seed"], {
  env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: "inherit",
  timeout: 30000,
});
env.USERPROFILE = fixtureHome;
env.HOME = fixtureHome;
// 只改 USERPROFILE 会使 Electron 在进入 Bootstrap 前找不到 appData，必须创建完整的测试用户目录。
env.APPDATA = join(fixtureHome, "AppData", "Roaming");
env.LOCALAPPDATA = join(fixtureHome, "AppData", "Local");
await Promise.all([env.APPDATA, env.LOCALAPPDATA].map((path) => mkdir(path, { recursive: true })));
const legacyShellKey = "HKCU\\Software\\Classes\\Directory\\shell\\ZCode.OpenInZCode";
const newShellKey = "HKCU\\Software\\Classes\\Directory\\shell\\Aibuddy7se.OpenInAibuddy7se";
// 一次性 CI 用户下模拟同一安装路径的旧菜单，验证实际注册表迁移而不是只检查源码。
execFileSync(
  "reg.exe",
  [
    "add",
    `${legacyShellKey}\\command`,
    "/ve",
    "/d",
    `"${join(appDir, "aibuddy7se.exe")}" --open-workspace "%1"`,
    "/f",
  ],
  { stdio: "ignore" },
);
const child = spawn(
  join(appDir, "aibuddy7se.exe"),
  ["--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1"],
  { cwd: tmpdir(), env, stdio: ["ignore", "pipe", "pipe"] },
);
let log = "";
let browser;
let page;
const interactionMemory = [];
try {
  const endpoint = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error("Packaged app startup timed out")), 60000);
    const capture = (data) => {
      log += data;
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(log);
      if (match) {
        clearTimeout(timer);
        done(match[1]);
      }
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`App exited during startup: ${code}`));
    });
  });
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  page = context.pages()[0] || (await context.waitForEvent("page", { timeout: 30000 }));
  // Playwright 默认模拟 no-preference，会覆盖产品实际动效偏好；清除模拟再验收。
  await page.emulateMedia({ reducedMotion: null, colorScheme: null });
  // 内网版必须直接进入真实工作区；不能再靠跳过登录或关闭引导通过验收。
  await page.getByTestId("sidebar").waitFor({ state: "visible", timeout: 90000 });
  if (process.argv.includes("--measure-memory")) {
    const samples = await profileStartupMemory(page, child.pid, output);
    if (!process.argv.includes("--baseline")) {
      assert.equal(samples.at(-1).diffWorkers, 1, "Win7 must use one functioning diff worker");
      assert.equal(
        await page.evaluate(() =>
          performance
            .getEntriesByType("resource")
            .some((entry) => /\/SettingsPage-[^/]+\.js/.test(entry.name)),
        ),
        false,
        "Settings must not load before opening them",
      );
    }
  }
  assert.throws(
    () => execFileSync("reg.exe", ["query", legacyShellKey], { stdio: "ignore" }),
    (error) => error.status === 1,
  );
  const shellCommand = execFileSync("reg.exe", ["query", `${newShellKey}\\command`, "/ve"], {
    encoding: "utf8",
  });
  assert.ok(shellCommand.includes(join(appDir, "aibuddy7se.exe")));
  assert.equal(await page.getByTestId("login-use-api-key-button").count(), 0);
  assert.equal(await page.getByTestId("onboarding-page").count(), 0);
  assert.equal(await page.title(), "aibuddy7se · Win7 特别版");
  const migrated = JSON.parse(
    await readFile(join(fixtureHome, ".aibuddy7se-home/.aibuddy7se/v2/credentials.json"), "utf8"),
  );
  assert.match(migrated["fixture-key"], /^enc:v2:os:/);
  const reducedMotion = await page.evaluate(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  console.log(`Actual reduced-motion preference: ${reducedMotion}`);
  assert.equal(await page.getByTestId("onboarding-page").locator("canvas").count(), 0);
  await page.getByTestId("sidebar").waitFor({ state: "visible", timeout: 30000 });
  await page.getByTestId("login-api-key-skip-button").waitFor({ state: "hidden" });
  assert.equal(await page.getByTestId("database-startup-status").count(), 0);
  assert.equal(await page.evaluate(() => typeof window.aibuddy7se), "object");
  assert.equal(await page.evaluate(() => typeof window.zcode), "undefined");
  assert.doesNotMatch(await page.locator("body").innerText(), /zcode/i);
  assert.ok((await page.locator('[data-app-logo="aibuddy7se"]').count()) > 0);
  const preferences = page.getByTestId("sidebar").getByTestId("login-trigger");
  assert.equal((await preferences.innerText()).trim(), "aibuddy7se");
  await preferences.click();
  assert.equal(await page.getByTestId("login-menu-item").count(), 0);
  assert.equal(await page.getByTestId("rewards-menu-item").count(), 0);
  await page.keyboard.press("Escape");
  await page.getByTestId("task-settings-button").click();
  await page.getByTestId("settings-locale-select-trigger").click();
  await page.getByTestId("settings-locale-select-item-en-US").click();
  await page.getByTestId("settings-back-button").click();
  const missingModelBanner = page.getByTestId("chat-error-banner");
  await missingModelBanner.waitFor();
  assert.match(await missingModelBanner.innerText(), /Configure a custom model/);
  assert.equal(
    await missingModelBanner.getByRole("button", { name: "Upgrade", exact: true }).count(),
    0,
  );
  await page.getByTestId("workspace-help-menu-trigger").click();
  for (const name of ["Feedback", "Request a feature", "Product docs", "Community"]) {
    assert.equal(await page.getByRole("menuitem", { name, exact: true }).count(), 0);
  }
  assert.doesNotMatch(await page.getByRole("menu").innerText(), /zcode/i);
  await page.screenshot({ path: join(output, "help-menu.png") });
  const [about] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("menuitem", { name: /^About/ }).click(),
  ]);
  await about.locator("#about-title").waitFor();
  assert.match(
    await about.locator("#about-title").innerText(),
    /^aibuddy7se\s+(?:version|版本)\s+\d+\.\d+\.\d+/i,
  );
  assert.doesNotMatch(await about.locator("body").innerText(), /zcode/i);
  assert.ok((await about.locator('img[src^="data:image/png"]').count()) > 0);
  await about.screenshot({ path: join(output, "about.png") });
  await about.close();
  await page.getByTestId("task-settings-button").click();
  await page.getByTestId("system-self-test-run").click();
  const reports = await page.evaluate(() =>
    Promise.all([window.aibuddy7se.runSystemSelfTest(), window.aibuddy7se.runSystemSelfTest()]),
  );
  await page.getByTestId("system-self-test-results").waitFor({ timeout: 150000 });
  assert.deepEqual(reports[0], reports[1], "Main must share the in-flight report");
  await writeFile(join(output, "system-self-test.json"), JSON.stringify(reports[0], null, 2));
  const checks = page.locator("[data-self-test-status]");
  assert.ok((await checks.count()) >= 10);
  assert.equal(await page.locator('[data-self-test-status="fail"]').count(), 0);
  assert.ok((await page.locator('[data-self-test-status="not-tested"]').count()) > 0);
  assert.equal(await page.getByTestId("system-self-test-export").isEnabled(), true);
  await writeFile(
    join(output, "self-test-ui.txt"),
    await page.getByTestId("system-self-test-results").innerText(),
  );
  for (const theme of ["Light theme", "Dark theme"]) {
    await page.getByTestId("settings-page").getByTestId("login-trigger").click();
    await page.getByRole("menuitem", { name: "App theme", exact: true }).hover();
    await page.getByRole("menuitemradio", { name: theme, exact: true }).click();
    await page.waitForFunction(
      (dark) => document.documentElement.classList.contains("dark") === dark,
      theme === "Dark theme",
    );
    await page.screenshot({
      path: join(output, theme === "Dark theme" ? "self-test-dark.png" : "self-test-light.png"),
    });
    await page.getByTestId("settings-section-nav-appearance").click();
    await page
      .getByTestId("settings-page")
      .locator("diffs-container")
      .first()
      .scrollIntoViewIfNeeded();
    // 真实设置页的两份代码预览必须完成 token 渲染，单 Worker 不能只启动不处理队列。
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("diffs-container")].filter(
          (element) =>
            element.shadowRoot?.textContent?.includes("themePreview") &&
            element.shadowRoot.querySelector("span[style*='--']"),
        ).length >= 2,
    );
    await page.screenshot({
      path: join(
        output,
        theme === "Dark theme" ? "code-preview-dark.png" : "code-preview-light.png",
      ),
    });
    if (process.argv.includes("--measure-memory")) {
      interactionMemory.push(await sampleMemory(page, child.pid, `code-preview-${theme}`));
    }
    await page.getByTestId("settings-section-nav-general").click();
  }
  assert.equal(await page.getByTestId("settings-mobile-push-switch").count(), 0);
  assert.equal(await page.getByTestId("settings-section-nav-usage").count(), 0);
  assert.equal(await page.getByTestId("settings-section-nav-shares").count(), 0);
  assert.doesNotMatch(await page.locator("body").innerText(), /zcode/i);
  await page.getByTestId("settings-section-nav-modelProvider").click();
  await page.getByTestId("model-provider-add-provider-button").click();
  assert.equal(await page.locator('[data-testid^="model-provider-template-item-"]').count(), 1);
  await page.getByTestId("model-provider-template-item-custom").click();
  await page.getByTestId("model-provider-actions-button").click();
  await page.getByTestId("model-provider-name-edit-button").click();
  await page.getByTestId("model-provider-name-input").fill("Intranet smoke");
  await page.getByTestId("model-provider-name-input").blur();
  const provider = page
    .locator('[data-testid^="model-provider-nav-item-custom:"]')
    .filter({ hasText: "Intranet smoke" });
  await provider.waitFor();
  const providerTestId = await provider.getAttribute("data-testid");
  const baseUrl = "http://127.0.0.1:17439/v1";
  await page.getByTestId("model-provider-base-url-input").fill(baseUrl);
  await page.getByTestId("model-provider-api-key-input").fill("fictional-intranet-smoke-key");
  await page.getByTestId("model-provider-api-key-input").blur();
  await page.getByTestId("model-provider-add-model-button").click();
  await page
    .getByRole("dialog")
    .getByPlaceholder("Model ID", { exact: true })
    .fill("intranet-smoke-model");
  await page.getByRole("dialog").getByRole("button", { name: /^Save/ }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByTestId("settings-back-button").click();
  await page.reload();
  await page.getByTestId("sidebar").waitFor({ timeout: 60000 });
  assert.equal(await page.getByTestId("login-use-api-key-button").count(), 0);
  await page.getByTestId("task-settings-button").click();
  assert.doesNotMatch(await page.locator("body").innerText(), /zcode/i);
  await page.getByTestId("settings-section-nav-modelProvider").click();
  await page.getByTestId(providerTestId).click();
  assert.equal(await page.getByTestId("model-provider-base-url-input").inputValue(), baseUrl);
  assert.equal(
    await page.getByTestId("model-provider-api-key-input").inputValue(),
    "fictional-intranet-smoke-key",
  );
  await page.getByText("intranet-smoke-model", { exact: true }).first().waitFor();
  await page.screenshot({ path: join(output, "intranet-provider.png") });
  // 不向此虚构 API 发模型请求；这里只验证自定义配置编辑与重新加载。
  await page.getByTestId("settings-section-nav-general").click();
  await page.getByTestId("settings-locale-select-trigger").click();
  await page.getByTestId("settings-locale-select-item-zh-CN").click();
  await page.getByText("系统能力自测 · Win7 特别版", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "startup.png") });
  assert.equal(reducedMotion, true, "Win7 must enable the actual reduced-motion preference");
  await writeFile(
    join(output, "startup.json"),
    JSON.stringify(
      {
        result: "PASS",
        url: page.url(),
        title: await page.title(),
        text: (await page.locator("body").innerText()).slice(0, 3000),
        scope:
          "Windows Server 2022: offline direct workspace without login/onboarding, intranet preferences, custom API/key/model edit and renderer reload, self-test, English/Chinese and light/dark UI; full app upgrade/restart, Win7 hardware, native export dialog and model response remain untested",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS intranet workspace without login, reduced motion, offline self-test, concurrent admission and translated/theme UI",
  );
  if (process.argv.includes("--measure-memory")) {
    await page.getByTestId("settings-back-button").click();
    await delay(30000);
    interactionMemory.push(await sampleMemory(page, child.pid, "settings-closed-30s"));
    await writeFile(
      join(output, "memory-interaction.json"),
      JSON.stringify({ samples: interactionMemory }, null, 2),
    );
  }
} catch (error) {
  // DevTools 未就绪时保留原生错误窗口，必须在 finally 终止测试进程之前截图。
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `
      Add-Type -AssemblyName System.Windows.Forms,System.Drawing
      $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
      $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $bitmap.Save($env:AIBUDDY7SE_SMOKE_SCREENSHOT)
      } finally { $graphics.Dispose(); $bitmap.Dispose() }
    `,
      ],
      {
        env: {
          ...process.env,
          AIBUDDY7SE_SMOKE_SCREENSHOT: join(output, "windows-startup-failure.png"),
        },
        timeout: 10000,
        stdio: "inherit",
      },
    );
  } catch {
    console.error("Unable to capture native startup failure");
  }
  if (page && !page.isClosed()) {
    await page.screenshot({ path: join(output, "startup-failure.png") });
    await writeFile(
      join(output, "startup-failure.json"),
      JSON.stringify(
        { error: String(error), text: await page.locator("body").innerText() },
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (child.exitCode === null && child.pid) {
    try {
      execFileSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } catch {
      /* 应用已正常退出时 taskkill 会返回非零。 */
    }
  }
  await writeFile(join(output, "startup.log"), log);
  execFileSync(join(appDir, "aibuddy7se.exe"), [fixtureScript, appDir, fixtureHome, "cleanup"], {
    env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
    timeout: 30000,
  });
}
