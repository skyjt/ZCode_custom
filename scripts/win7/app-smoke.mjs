import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright-core";

// 在一次性 Windows CI 用户下启动最终产物；不向模型发请求，不访问开发者的数据。
const appDir = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  join(appDir, "aibuddy7se.exe"),
  ["--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1"],
  { cwd: tmpdir(), env, stdio: ["ignore", "pipe", "pipe"] },
);
let log = "";
let browser;
let page;
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
  // 初始化页也有正文和 preload；必须走到真实工作区，不能把“正在初始化”当作启动成功。
  await page.getByTestId("login-use-api-key-button").waitFor({ timeout: 90000 });
  await page.getByTestId("login-use-api-key-button").click();
  await page.getByTestId("login-api-key-skip-button").click();
  // 首次安装的职业引导替换工作区正文；使用现有 Escape 关闭入口，不绕过应用状态。
  await page.getByTestId("onboarding-page").waitFor({ timeout: 30000 });
  assert.equal(await page.title(), "aibuddy7se · Win7 特别版");
  const reducedMotion = await page.evaluate(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  assert.equal(await page.getByTestId("onboarding-page").locator("canvas").count(), 0);
  await page.keyboard.press("Escape");
  await page.getByTestId("sidebar").waitFor({ state: "visible", timeout: 30000 });
  await page.getByTestId("login-api-key-skip-button").waitFor({ state: "hidden" });
  assert.equal(await page.getByTestId("database-startup-status").count(), 0);
  assert.equal(await page.evaluate(() => typeof window.zcode), "object");
  assert.ok((await page.locator('[data-app-logo="aibuddy7se"]').count()) > 0);
  await page.getByTestId("task-settings-button").click();
  await page.getByTestId("settings-locale-select-trigger").click();
  await page.getByTestId("settings-locale-select-item-en-US").click();
  await page.getByTestId("system-self-test-run").click();
  const reports = await page.evaluate(() =>
    Promise.all([window.zcode.runSystemSelfTest(), window.zcode.runSystemSelfTest()]),
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
    await page.getByTestId("login-trigger").click();
    await page.getByRole("menuitem", { name: "App theme", exact: true }).hover();
    await page.getByRole("menuitemradio", { name: theme, exact: true }).click();
    await page.waitForFunction(
      (dark) => document.documentElement.classList.contains("dark") === dark,
      theme === "Dark theme",
    );
    await page.screenshot({
      path: join(output, theme === "Dark theme" ? "self-test-dark.png" : "self-test-light.png"),
    });
  }
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
          "Windows Server 2022: branded workspace, reduced motion, no onboarding Canvas, offline self-test results, English/Chinese and light/dark UI; Win7 hardware, native export dialog and model API remain untested",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS branded workspace, reduced motion, offline self-test, concurrent admission and translated/theme UI",
  );
} catch (error) {
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
}
