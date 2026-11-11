import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

// 在一次性 Windows CI 用户下启动最终产物；不向模型发请求，不访问开发者的数据。
const appDir = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  join(appDir, "ZCode Win7 Experimental.exe"),
  ["--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1"],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
let log = "";
let browser;
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
  const page = context.pages()[0] || (await context.waitForEvent("page", { timeout: 30000 }));
  // 初始化页也有正文和 preload；必须走到真实工作区，不能把“正在初始化”当作启动成功。
  await page.getByTestId("login-use-api-key-button").waitFor({ timeout: 90000 });
  await page.getByTestId("login-use-api-key-button").click();
  await page.getByTestId("login-api-key-skip-button").click();
  await page.getByTestId("sidebar").waitFor({ state: "visible", timeout: 30000 });
  assert.equal(await page.getByTestId("database-startup-status").count(), 0);
  assert.equal(await page.evaluate(() => typeof window.zcode), "object");
  await page.screenshot({ path: join(output, "startup.png") });
  await writeFile(
    join(output, "startup.json"),
    JSON.stringify(
      {
        result: "PASS",
        url: page.url(),
        title: await page.title(),
        text: (await page.locator("body").innerText()).slice(0, 3000),
        scope:
          "Windows Server 2022: initialization completes, API Key skip enters workspace while app outbound traffic is blocked; Win7 and intranet model remain untested",
      },
      null,
      2,
    ),
  );
  console.log("PASS packaged app enters workspace without cloud login, with preload bridge");
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
