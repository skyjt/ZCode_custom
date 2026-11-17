import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { runDemandAppSmoke } from "./demand-app-smoke.mjs";
import { profileStartupMemory, sampleMemory } from "./memory-profile.mjs";
import { startMemoryModelFixture, MEMORY_MODEL_REPLY } from "./memory-model-fixture.mjs";

// 在一次性 Windows CI 用户下启动最终产物；仅向本机虚构模型发验收请求，不访问开发者的数据。
const appDir = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const heapArgument = process.argv.indexOf("--heap-diagnostics");
const heapDirectory = heapArgument < 0 ? null : resolve(process.argv[heapArgument + 1]);
if (heapDirectory) assert.ok(process.argv.includes("--measure-memory"));
const heapCheckpoint = heapDirectory
  ? (await import("./heap-diagnostics.mjs")).captureHeapCheckpoint
  : null;
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
const modelFixture = await startMemoryModelFixture();
const launchStarted = performance.now();
const child = spawn(
  join(appDir, "aibuddy7se.exe"),
  ["--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1"],
  { cwd: tmpdir(), env, stdio: ["ignore", "pipe", "pipe"] },
);
let log = "";
let browser;
let page;
const interactionMemory = [];
const mcpStatusRequestCount = () =>
  log.split("\n").filter((line) => /mcp-sync\.listWorkspaceMcpServerStatuses OK/.test(line)).length;
const mcpStatusStarts = () =>
  log.split("\n").filter((line) => /agent process started.*"lane":"mcp-status"/.test(line)).length;
async function waitForMcpStatusRequest(previousCount) {
  const deadline = Date.now() + 60_000;
  while (mcpStatusRequestCount() <= previousCount && Date.now() < deadline) await delay(100);
  assert.ok(mcpStatusRequestCount() > previousCount, "Real MCP status request must complete");
}
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
  await writeFile(
    join(output, "startup-timing.json"),
    JSON.stringify(
      {
        spawnToWorkspaceReadyMs: performance.now() - launchStarted,
        diagnosticOnly: Boolean(heapDirectory),
        scope: "Spawn to visible workspace sidebar; excludes fixture setup; OS cache not cleared",
      },
      null,
      2,
    ),
  );
  if (process.argv.includes("--measure-memory")) {
    const samples = await profileStartupMemory(page, child.pid, output);
    if (heapCheckpoint) await heapCheckpoint(heapDirectory, samples.at(-1));
    assert.match(
      log,
      /cron scheduler started/,
      "Memory optimization must retain the live scheduler",
    );
    if (!process.argv.includes("--baseline")) {
      assert.equal(samples.at(-1).diffWorkers, 1, "Win7 must use one functioning diff worker");
      assert.match(
        log,
        /agent process idle timeout; reclaiming.*plugin-workspace/,
        "Plugin management lane must reclaim after idle",
      );
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
  if (!process.argv.includes("--baseline") || process.argv.includes("--baseline-first-send")) {
    for (const id of ["git", "java", "maven"]) {
      const check = reports[0].checks.find((item) => item.id === id);
      assert.ok(check, `Missing developer tool check: ${id}`);
      assert.equal(check.status, "pass", `${id}: ${check.detail}`);
    }
    assert.match(
      reports[0].checks.find((item) => item.id === "git").detail,
      /2\.46\.2\.windows\.1/,
    );
    await page
      .getByText("Java 8 development environment", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, "developer-tools.png") });
  }
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
  const baseUrl = modelFixture.baseUrl;
  await page.getByTestId("model-provider-api-format-trigger").click();
  await page.getByTestId("model-provider-api-format-item-openai-chat-completions").click();
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
  // 先验证配置与 reload；本机虚构模型的首次发送留到空闲内存采样之后。
  await page.getByTestId("settings-section-nav-general").click();
  await page.getByTestId("settings-locale-select-trigger").click();
  await page.getByTestId("settings-locale-select-item-zh-CN").click();
  await page.getByText("系统能力自测 · Win7 特别版", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "startup.png") });
  if (!process.argv.includes("--baseline") || process.argv.includes("--baseline-first-send")) {
    // reload 后重新执行实际自测，验证新增三行的中文界面，而不只检查语言选择器。
    await page.getByTestId("system-self-test-run").click();
    await page.getByTestId("system-self-test-results").waitFor({ timeout: 150000 });
    for (const label of ["内置 Git", "Java 8 开发环境", "Maven 构建环境"]) {
      await page.getByText(label, { exact: true }).waitFor();
    }
    assert.equal(await page.locator('[data-self-test-status="fail"]').count(), 0);
    await page.getByText("Java 8 开发环境", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, "developer-tools-zh.png") });
  }
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
          "Windows Server 2022: offline direct workspace without login/onboarding, intranet preferences, custom API/key/model edit and renderer reload, self-test, English/Chinese and light/dark UI; full app upgrade/restart, Win7 hardware, native export dialog and real model response remain untested",
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
  if (!process.argv.includes("--baseline") || process.argv.includes("--baseline-first-send")) {
    if (await page.getByTestId("settings-page").isVisible()) {
      await page.getByTestId("settings-back-button").click();
    }
    assert.doesNotMatch(
      log,
      /agent process started.*shared-local-tasks/,
      "Empty draft and model configuration must not prestart the chat Agent",
    );
    assert.match(
      log,
      /workspace\/readPresentation 完成.*"slashCommandCount":[1-9][0-9]*/,
      "On-demand startup must retain the real workspace command catalog",
    );
    // 90 秒启动采样后插件管理 lane 已退出，设置页必须能按需重建并读取真实安装清单。
    const beforePluginStatus = mcpStatusRequestCount();
    await page.getByTestId("task-settings-button").click();
    await page.getByTestId("settings-section-nav-plugin").click();
    await page.getByTestId("plugin-settings-plugin-row").first().waitFor({ timeout: 60000 });
    await waitForMcpStatusRequest(beforePluginStatus);
    if (!process.argv.includes("--baseline")) {
      assert.equal(
        mcpStatusStarts(),
        0,
        "Passive plugin display must not start a MCP checking tree",
      );
    }
    await page.getByTestId("settings-back-button").click();
    assert.doesNotMatch(
      log,
      /agent process started.*shared-local-tasks/,
      "Plugin management must not prestart the chat Agent",
    );
    assert.equal(
      modelFixture.requests.filter((request) => request.path === "/v1/chat/completions").length,
      0,
      "Settings must not send a model completion request",
    );
    const input = page
      .locator(
        '[data-testid="v4-composer-input"][contenteditable="true"], [data-testid="v4-composer-input"] [contenteditable="true"]',
      )
      .first();
    await input.fill("Reply exactly AIBUDDY7SE_MEMORY_FIRST_SEND_OK, without tools.");
    const firstSendStarted = performance.now();
    await page.getByTestId("v4-composer-send").click({ timeout: 60000 });
    await page.getByText(MEMORY_MODEL_REPLY, { exact: true }).last().waitFor({ timeout: 120000 });
    const firstReplyMs = performance.now() - firstSendStarted;
    const starts = log
      .split("\n")
      .filter((line) => /agent process started.*shared-local-tasks/.test(line));
    assert.equal(starts.length, 1, "First send must start exactly one shared chat runtime");
    assert.ok(modelFixture.requests.some((request) => request.path === "/v1/chat/completions"));
    await writeFile(
      join(output, "first-send.json"),
      JSON.stringify(
        {
          result: "PASS",
          runtimeStarts: starts.length,
          firstReplyMs,
          diagnosticOnly: Boolean(heapDirectory),
          requests: modelFixture.requests,
          scope: "Loopback fictional OpenAI model only; real model not tested",
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: join(output, "first-send.png") });
    if (process.argv.includes("--measure-memory")) {
      // 延迟分配不等于任务阶段的内存降幅；保留首次实际回复后的整棵进程树证据。
      await delay(30_000);
      const replySamples = [await sampleMemory(page, child.pid, "first-reply-30s")];
      await writeFile(
        join(output, "memory-after-first-send.json"),
        JSON.stringify(replySamples[0], null, 2),
      );
      for (let repeat = 1; repeat <= 2; repeat++) {
        await delay(5_000);
        replySamples.push(await sampleMemory(page, child.pid, `first-reply-followup-${repeat}`));
      }
      await writeFile(
        join(output, "memory-after-first-send-series.json"),
        JSON.stringify({ samples: replySamples }, null, 2),
      );
      if (heapCheckpoint)
        await heapCheckpoint(heapDirectory, replySamples.at(-1), [
          "main",
          "host",
          "agent",
          "plugin-host",
        ]);
      const toolWallTimes = [];
      const toolSamples = [];
      for (let number = 1; number <= 5; number++) {
        await input.fill(
          `AIBUDDY7SE_TOOL_PROBE_${number}: execute the requested read-only echo once.`,
        );
        const started = performance.now();
        await page.getByTestId("v4-composer-send").click({ timeout: 60000 });
        await page
          .getByText(`AIBUDDY7SE_TOOL_DONE_${number}`, { exact: true })
          .last()
          .waitFor({ timeout: 120000 });
        toolWallTimes.push({ number, elapsedMs: performance.now() - started });
        assert.ok(modelFixture.toolRuns.some((run) => run.number === number && run.verified));
        if (number === 1 || number === 5)
          toolSamples.push(await sampleMemory(page, child.pid, `tool-round-${number}`));
      }
      await delay(15000);
      toolSamples.push(await sampleMemory(page, child.pid, "tools-idle-15s"));
      if (heapCheckpoint)
        await heapCheckpoint(heapDirectory, toolSamples.at(-1), [
          "main",
          "host",
          "agent",
          "plugin-host",
        ]);
      assert.equal(
        log.split("\n").filter((line) => /agent process started.*shared-local-tasks/.test(line))
          .length,
        1,
        "Repeated tool use must preserve the shared chat runtime",
      );
      await writeFile(
        join(output, "memory-tool-roundtrips.json"),
        JSON.stringify(
          {
            tool: "Bash",
            calls: modelFixture.toolRuns,
            wallTimes: toolWallTimes,
            samples: toolSamples,
            scope:
              "Five real read-only echo executions through the packaged GUI and loopback fixture; no real model, network or project workload",
          },
          null,
          2,
        ),
      );
      await page.screenshot({ path: join(output, "repeated-tools.png") });
      if (process.argv.includes("--demand-tools"))
        await runDemandAppSmoke({
          page,
          input,
          rootPid: child.pid,
          appDir,
          fixtureHome,
          output,
          modelFixture,
        });
    }
    if (!process.argv.includes("--baseline")) {
      // 在采样之后执行主动检查；不能通过删除真实连接能力来获得更低的纯文本内存。
      const beforeManualPageStatus = mcpStatusRequestCount();
      await page.getByTestId("task-settings-button").click();
      await page.getByTestId("settings-section-nav-plugin").click();
      await page.getByRole("tab", { name: /^MCP/ }).click();
      await waitForMcpStatusRequest(beforeManualPageStatus);
      const beforeManualStatus = mcpStatusRequestCount();
      await page.getByTestId("mcp-settings-refresh").click();
      await page
        .locator('[data-testid="mcp-settings-refresh"]:not(:disabled)')
        .waitFor({ timeout: 60000 });
      await waitForMcpStatusRequest(beforeManualStatus);
      assert.equal(mcpStatusStarts(), 1, "Manual refresh must start the real independent MCP lane");
      await page.screenshot({ path: join(output, "mcp-manual-check.png") });
      await page.getByTestId("settings-back-button").click();
      const beforeReopenStatus = mcpStatusRequestCount();
      await page.getByTestId("task-settings-button").click();
      await page.getByTestId("settings-section-nav-plugin").click();
      await waitForMcpStatusRequest(beforeReopenStatus);
      assert.equal(
        mcpStatusStarts(),
        1,
        "Reopening settings must reuse the existing checking owner",
      );
      await writeFile(
        join(output, "mcp-passive-status.json"),
        JSON.stringify(
          {
            result: "PASS",
            passiveStarts: 0,
            manualStarts: 1,
            reopenedStarts: mcpStatusStarts(),
          },
          null,
          2,
        ),
      );
    }
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
  await modelFixture.close();
  await writeFile(
    join(output, "model-fixture.json"),
    JSON.stringify({ requests: modelFixture.requests, calls: modelFixture.toolRuns }, null, 2),
  );
  await writeFile(join(output, "startup.log"), log);
  if (heapDirectory) {
    for (const name of await readdir(output)) {
      if (!/^memory.*\.json$/.test(name)) continue;
      const report = JSON.parse(await readFile(join(output, name), "utf8"));
      report.diagnosticOnly = true;
      report.scope =
        "Instrumented diagnostic run; snapshots may force GC and alter timing/RAM. Not performance acceptance.";
      await writeFile(join(output, name), JSON.stringify(report, null, 2));
    }
  }
  execFileSync(join(appDir, "aibuddy7se.exe"), [fixtureScript, appDir, fixtureHome, "cleanup"], {
    env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
    timeout: 30000,
  });
}
