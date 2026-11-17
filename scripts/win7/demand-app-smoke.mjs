import assert from "node:assert/strict";
import { access, copyFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { sampleMemory } from "./memory-profile.mjs";

// 仅对当前一次性 CI 用户与合成文档操作，产品权限和真实 MCP 路径保持原状。
export async function runDemandAppSmoke({
  page,
  input,
  rootPid,
  appDir,
  fixtureHome,
  output,
  modelFixture,
}) {
  let candidate = false;
  try {
    await access(join(appDir, "resources/glm/builtin-mcp-catalog.json"));
    candidate = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const report = {
    candidate,
    idleWaitMs: 130000,
    samples: [],
    calls: [],
    wallTimes: [],
    approvals: [],
    scope:
      "One cold app run: text, stateless Word, browser, then open Word. Tool stages are not independent starts. Browser proxy retirement preserves the live Main-owned page and its unsubmitted text; CUA retirement is excluded.",
  };
  const save = () =>
    writeFile(join(output, "memory-demand-tools.json"), JSON.stringify(report, null, 2));
  const sample = async (phase) => {
    const value = await sampleMemory(page, rootPid, phase);
    report.samples.push(value);
    await save();
    if (candidate)
      assert.deepEqual(
        value.processes
          .filter((row) => row.entry === "plugin-host.cjs" && !row.plugin)
          .map((row) => row.pid),
        [],
        "Unmapped plugin host cannot prove demand startup",
      );
    return value;
  };
  const pids = (sample, plugin) =>
    sample.processes.filter((row) => row.plugin === plugin).map((row) => row.pid);
  const identities = (sample, plugin) =>
    sample.processes
      .filter((row) => row.plugin === plugin)
      .map((row) => ({ pid: row.pid, createdAt: row.createdAt }));
  const office = ["documents-plugin", "spreadsheets-plugin", "presentations-plugin", "pdf-plugin"];
  const noOffice = (sample) =>
    office.forEach((plugin) =>
      assert.deepEqual(pids(sample, plugin), [], "Unexpected resident " + plugin),
    );
  const onlyWord = (sample) => {
    assert.equal(pids(sample, "documents-plugin").length, 1);
    office
      .slice(1)
      .concat("node-repl-host")
      .forEach((plugin) =>
        assert.deepEqual(pids(sample, plugin), [], "Unused host started: " + plugin),
      );
  };
  const call = async (stage) => {
    await input.fill(
      `AIBUDDY7SE_DEMAND_${stage}: perform this synthetic acceptance operation. Use the in-app browser only for the loopback fixture; use only demand-fixture.docx for Word. I authorize these fixture actions.`,
    );
    const start = performance.now();
    await page.getByTestId("v4-composer-send").click({ timeout: 60000 });
    const done = page.getByText("AIBUDDY7SE_DEMAND_DONE_" + stage, { exact: true }).last();
    const deadline = Date.now() + 120000;
    while (!(await done.isVisible()) && Date.now() < deadline) {
      const once = page.locator('[role="option"][data-permission-option-kind="allowOnce"]');
      if (await once.isVisible()) {
        assert.equal(
          modelFixture.pendingDemand?.stage,
          stage,
          "Only this issued synthetic tool may receive a one-time UI approval",
        );
        report.approvals.push({ stage, tool: modelFixture.pendingDemand.tool, kind: "allowOnce" });
        // 点击会先聚焦并触发 React 选中，首击可能已经提交；二次点击会追逐已消失的弹窗。
        // 只聚焦 allowOnce，确认选中后按一次 Enter，继续走真实权限响应链。
        await once.focus();
        await page.waitForFunction(
          () =>
            document
              .querySelector('[role="option"][data-permission-option-kind="allowOnce"]')
              ?.getAttribute("aria-selected") === "true",
        );
        await once.press("Enter");
        await once.waitFor({ state: "hidden", timeout: 10000 });
      }
      await delay(200);
    }
    assert.ok(await done.isVisible(), "Synthetic tool response timed out: " + stage);
    const actual = modelFixture.demandRuns.find((run) => run.stage === stage);
    assert.ok(actual?.verified, "Real tool output required: " + stage);
    report.calls.push(actual);
    report.wallTimes.push({ stage, elapsedMs: performance.now() - start });
    return sample(stage.toLowerCase());
  };
  try {
    const before = await sample("demand_before_tools");
    if (candidate) {
      noOffice(before);
      assert.deepEqual(pids(before, "node-repl-host"), []);
    }
    const workspaces = join(fixtureHome, ".aibuddy7se-home/.aibuddy7se/workspace");
    const directories = (await readdir(workspaces, { withFileTypes: true })).filter((item) =>
      item.isDirectory(),
    );
    assert.ok(directories.length, "Synthetic conversation workspace must exist");
    for (const directory of directories)
      await copyFile(
        resolve(
          import.meta.dirname,
          "../../apps/zcode-cli/packages/office-runtime/fixtures/report.docx",
        ),
        join(workspaces, directory.name, "demand-fixture.docx"),
      );
    report.syntheticWorkspaceCopies = directories.length;
    const first = await call("WORD_FIRST");
    if (candidate) onlyWord(first);
    const repeat = await call("WORD_REPEAT");
    if (candidate)
      assert.deepEqual(
        pids(repeat, "documents-plugin"),
        pids(first, "documents-plugin"),
        "Repeated tool must reuse host",
      );
    await delay(report.idleWaitMs);
    const idle = await sample("word_idle");
    if (candidate) noOffice(idle);
    const reuse = await call("WORD_REUSE");
    if (candidate) {
      onlyWord(reuse);
      assert.notDeepEqual(
        identities(reuse, "documents-plugin"),
        identities(first, "documents-plugin"),
      );
    }
    await delay(report.idleWaitMs);
    const retired = await sample("word_reuse_idle");
    if (candidate) noOffice(retired);
    const browser = await call("BROWSER_FIRST");
    if (candidate) {
      noOffice(browser);
      assert.equal(pids(browser, "node-repl-host").length, 1);
    }
    await call("BROWSER_REPEAT");
    await delay(report.idleWaitMs);
    const browserIdle = await sample("browser_open_idle");
    if (candidate)
      assert.deepEqual(
        pids(browserIdle, "node-repl-host"),
        [],
        "Idle proxy must exit without closing the page",
      );
    const browserReuse = await call("BROWSER_REUSE");
    if (candidate) {
      noOffice(browserReuse);
      assert.equal(pids(browserReuse, "node-repl-host").length, 1);
      assert.notDeepEqual(
        identities(browserReuse, "node-repl-host"),
        identities(browser, "node-repl-host"),
      );
    }
    await call("BROWSER_CLOSE");
    await delay(report.idleWaitMs);
    const closedBrowser = await sample("browser_closed_idle");
    if (candidate)
      assert.deepEqual(
        pids(closedBrowser, "node-repl-host"),
        [],
        "Closed-page proxy must also retire",
      );
    const opened = await call("WORD_OPEN");
    await delay(report.idleWaitMs);
    const protectedSample = await sample("word_open_protected");
    if (candidate) {
      assert.equal(pids(opened, "documents-plugin").length, 1);
      assert.deepEqual(
        pids(protectedSample, "documents-plugin"),
        pids(opened, "documents-plugin"),
        "Open document must remain protected",
      );
    }
    report.result = "PASS";
  } catch (error) {
    report.error = String(error.stack ?? error);
    throw error;
  } finally {
    await save();
  }
}
