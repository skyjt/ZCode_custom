import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const average = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};
export function summarizePairs(pairs) {
  assert.ok(
    pairs.length >= 2 && pairs.length % 2 === 0,
    "Use a balanced even number of independent pairs",
  );
  const keys = Object.keys(pairs[0].old);
  const metrics = {};
  pairs.forEach((pair, index) => {
    assert.deepEqual(pair.order, index % 2 ? ["new", "old"] : ["old", "new"]);
    assert.deepEqual(Object.keys(pair.old).sort(), keys.slice().sort());
    assert.deepEqual(Object.keys(pair.new).sort(), keys.slice().sort());
  });
  for (const key of keys) {
    const oldValues = pairs.map((pair) => pair.old[key]),
      newValues = pairs.map((pair) => pair.new[key]);
    assert.ok(
      [...oldValues, ...newValues].every((x) => Number.isFinite(x) && x > 0),
      "Missing/invalid metric " + key,
    );
    const percent = oldValues.map((value, i) => ((newValues[i] - value) / value) * 100);
    metrics[key] = {
      old: oldValues,
      new: newValues,
      pairedPercent: percent,
      oldMedian: median(oldValues),
      newMedian: median(newValues),
      pairedPercentMedian: median(percent),
      pairedPercentMin: Math.min(...percent),
      pairedPercentMax: Math.max(...percent),
    };
  }
  return {
    independentRunsPerVersion: pairs.length,
    pairOrder: pairs.map((p) => p.order),
    metrics,
    scope:
      "One sample unit is a complete fresh-process/fresh-fixture run. Within-run reply snapshots are averaged first. Same runner, balanced AB/BA order; OS/file cache is not cleared. No profiler or forced GC; working sets include shared pages, private bytes are commit. Small sample, no causal or statistical-significance claim.",
  };
}
async function collectMetrics(directory) {
  const json = async (file) => JSON.parse(await readFile(join(directory, file), "utf8"));
  const metrics = {};
  const startupTiming = await json("startup-timing.json");
  const firstSend = await json("first-send.json");
  assert.ok(!startupTiming.diagnosticOnly && !firstSend.diagnosticOnly);
  metrics["startup.spawnToWorkspaceReadyMs"] = startupTiming.spawnToWorkspaceReadyMs;
  metrics["text.firstReplyMs"] = firstSend.firstReplyMs;
  const add = (name, sample) => {
    assert.ok(!sample.diagnosticOnly, "Profiler data must not enter acceptance");
    metrics[name + ".workingSetBytes"] = sample.workingSetBytes;
    metrics[name + ".privateBytes"] = sample.privateBytes;
  };
  for (const sample of (await json("memory.json")).samples) add(sample.phase, sample);
  const text = await json("memory-after-first-send-series.json");
  assert.ok(!text.diagnosticOnly);
  assert.equal(text.samples.length, 3);
  add(
    "text",
    Object.fromEntries(
      ["workingSetBytes", "privateBytes"].map((key) => [
        key,
        average(text.samples.map((s) => s[key])),
      ]),
    ),
  );
  const tool = await json("memory-tool-roundtrips.json");
  for (const sample of tool.samples) add(sample.phase, sample);
  assert.equal(tool.calls.length, 5);
  assert.ok(tool.calls.every((call) => call.verified));
  metrics["tool.firstUiMs"] = tool.wallTimes[0].elapsedMs;
  metrics["tool.laterUiMeanMs"] = average(tool.wallTimes.slice(1).map((x) => x.elapsedMs));
  for (const office of (await json("office-memory.json")).reports) {
    assert.equal(office.result, "PASS");
    assert.ok(office.originalsUnchanged && office.corruptRejected && office.escapeRejected);
    metrics[office.plugin + ".firstUsableMs"] = office.firstOpenMs + office.firstReadMs;
    metrics[office.plugin + ".rotationMeanMs"] = average(office.rotationReadMs);
    for (const sample of office.samples) add(sample.phase, sample);
  }
  return metrics;
}
async function assertApplicationStopped(application) {
  const executable = join(application, "aibuddy7se.exe");
  const script =
    "$p = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $env:ZCODE_COMPARISON_EXE }); if ($p.Count) { throw 'Owned application processes remain after run' }";
  await exec(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    {
      env: { ...process.env, ZCODE_COMPARISON_EXE: executable },
      timeout: 20000,
    },
  );
}
export async function runColdComparison(oldApp, newApp, output, pairCount = 4) {
  assert.equal(process.platform, "win32", "Packaged cold comparison requires Windows");
  assert.ok(
    Number.isSafeInteger(pairCount) && pairCount >= 2 && pairCount <= 6 && pairCount % 2 === 0,
  );
  const apps = { old: resolve(oldApp), new: resolve(newApp) };
  const pairs = [];
  output = resolve(output);
  await mkdir(output, { recursive: true });
  for (let i = 0; i < pairCount; i++) {
    const pair = { order: i % 2 ? ["new", "old"] : ["old", "new"] };
    for (const version of pair.order) {
      const directory = join(output, "pair-" + (i + 1), version);
      await mkdir(directory, { recursive: true });
      await assertApplicationStopped(apps[version]);
      for (const [script, args] of [
        ["app-smoke.mjs", [apps[version], directory, "--measure-memory"]],
        ["office-memory-smoke.mjs", [apps[version], directory]],
      ]) {
        try {
          const result = await exec(
            process.execPath,
            [resolve(import.meta.dirname, script), ...args],
            { timeout: 720000, maxBuffer: 32 * 1024 * 1024 },
          );
          await writeFile(join(directory, script + ".log"), result.stdout + result.stderr);
        } catch (error) {
          await writeFile(
            join(directory, script + ".log"),
            String(error.stdout || "") + String(error.stderr || "") + String(error),
          );
          throw error;
        }
      }
      await assertApplicationStopped(apps[version]);
      pair[version] = await collectMetrics(directory);
      console.log("Completed independent pair " + (i + 1) + " " + version);
    }
    pairs.push(pair);
    await writeFile(join(output, "pairs.json"), JSON.stringify(pairs, null, 2));
  }
  const summary = summarizePairs(pairs);
  await writeFile(join(output, "summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runColdComparison(...process.argv.slice(2, 5), Number(process.argv[5] || 4));
}
