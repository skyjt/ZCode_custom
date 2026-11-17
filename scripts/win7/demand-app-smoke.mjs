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
    scope:
      "One cold app run: text, stateless Word, browser, then open Word. Tool stages are not independent starts. Browser host retirement is not implemented; closed-tab retention is observed, not passed as reclamation.",
  };
  const save = () =>
    writeFile(join(output, "memory-demand-tools.json"), JSON.stringify(report, null, 2));
  const sample = async (phase) => {
    const value = await sampleMemory(page, rootPid, phase);
    report.samples.push(value);
    await save();
    return value;
  };
  const pids = (sample, plugin) =>
    sample.processes.filter((row) => row.plugin === plugin).map((row) => row.pid);
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
    await page
      .getByText("AIBUDDY7SE_DEMAND_DONE_" + stage, { exact: true })
      .last()
      .waitFor({ timeout: 120000 });
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
      assert.notEqual(pids(reuse, "documents-plugin")[0], pids(first, "documents-plugin")[0]);
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
    await call("BROWSER_CLOSE");
    await delay(report.idleWaitMs);
    await sample("browser_closed_idle");
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
