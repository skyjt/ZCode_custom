import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cp, mkdir, readdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { extractAll, extractFile, listPackage, statFile, uncache } from "@electron/asar";
import { replaceAppAsarFromStaging } from "../../packages/desktop/scripts/app-asar-repack.mjs";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const asarCli = join(dirname(require.resolve("@electron/asar/package.json")), "bin/asar.js");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const entries = [
  ...["main", "host", "scheduler", "extension-host"].map((role) => [
    role,
    "out/" + role + "/index.js",
  ]),
  ["host-storage-worker", "out/host/tasksStorageWorker.js"],
  ["main-storage-worker", "out/main/storageScanWorker.js"],
  ["main-data-size-worker", "out/main/aibuddy7seDataSizeWorker.js"],
];
export function insertProbe(source, statement) {
  const shebang = /^#![^\n]*\n/.exec(source)?.[0] || "";
  return shebang + statement + "\n" + source.slice(shebang.length);
}
function disjoint(a, b) {
  const inside = (parent, child) => {
    const path = relative(parent, child);
    return path === "" || (path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path));
  };
  assert.ok(!inside(a, b) && !inside(b, a), "Diagnostic copy must be disjoint from source");
}
function archiveFiles(archive) {
  const result = new Map();
  for (const entry of listPackage(archive)) {
    const name = entry.replaceAll("\\", "/").replace(/^\/+/, "");
    const metadata = statFile(archive, name, false);
    if (!metadata.files && !metadata.link) result.set(name, metadata);
  }
  return result;
}
export async function prepareDiagnosticCopy(source, destination, directory) {
  source = resolve(source);
  destination = resolve(destination);
  directory = resolve(directory);
  disjoint(source, destination);
  disjoint(source, directory);
  disjoint(destination, directory);
  await assert.rejects(
    access(destination),
    { code: "ENOENT" },
    "Refuse to overwrite an existing copy",
  );
  const archive = join(source, "resources/app.asar");
  const originalArchiveHash = digest(await readFile(archive));
  await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
  await mkdir(directory, { recursive: true });
  const bootstrapDir = join(destination, "resources/heap-bootstrap");
  await mkdir(bootstrapDir, { recursive: false });
  await cp(new URL("./heap-probe.cjs", import.meta.url), join(bootstrapDir, "heap-probe.cjs"));
  const bootstrap = async (role) => {
    const file = join(bootstrapDir, role + ".cjs");
    await writeFile(
      file,
      "module.exports = require('./heap-probe.cjs').start(" +
        JSON.stringify({ directory, role }) +
        ");\n",
    );
    return file;
  };
  const patched = new Map();
  const staging = join(directory, "asar-staging");
  await mkdir(staging);
  extractAll(archive, staging);
  for (const [role, name] of entries) {
    const sourceCode = await readFile(join(staging, name), "utf8");
    const init = await bootstrap(role);
    const statement =
      "import heapProbeReady from " +
      JSON.stringify(pathToFileURL(init).href) +
      ";\nawait heapProbeReady;";
    // Separate import dependency starts the probe before entry-module evaluation.
    await writeFile(join(staging, name), insertProbe(sourceCode, statement));
    patched.set(name, digest(Buffer.from(sourceCode)));
  }
  const copiedArchive = join(destination, "resources/app.asar");
  await replaceAppAsarFromStaging({
    sourceDir: staging,
    appAsarPath: copiedArchive,
    targetPlatformKey: "win32-x64",
    runAsarCommand: (args) =>
      execFileSync(process.execPath, [asarCli, ...args], { stdio: "inherit" }),
  });
  uncache(copiedArchive);
  const before = archiveFiles(archive),
    after = archiveFiles(copiedArchive);
  assert.deepEqual([...before.keys()].sort(), [...after.keys()].sort(), "ASAR inventory changed");
  let unchangedFiles = 0,
    nativeUnpackedFiles = 0;
  for (const [name, original] of before) {
    assert.equal(
      Boolean(after.get(name).unpacked),
      Boolean(original.unpacked),
      "Pack state changed: " + name,
    );
    if (original.unpacked) nativeUnpackedFiles++;
    if (!patched.has(name)) {
      assert.equal(
        digest(extractFile(copiedArchive, name)),
        digest(extractFile(archive, name)),
        "Unrelated file changed: " + name,
      );
      unchangedFiles++;
    }
  }
  for (const [role, name] of [
    ["agent", "aibuddy7se.cjs"],
    ["plugin-host", "plugin-host.cjs"],
  ]) {
    const original = join(source, "resources/glm", name);
    const copy = join(destination, "resources/glm", name);
    const content = await readFile(original, "utf8");
    const init = await bootstrap(role);
    await writeFile(copy, insertProbe(content, "require(" + JSON.stringify(init) + ");"));
    patched.set("resources/glm/" + name, digest(Buffer.from(content)));
    assert.equal(digest(await readFile(original)), patched.get("resources/glm/" + name));
  }
  assert.equal(digest(await readFile(archive)), originalArchiveHash, "Source archive changed");
  await rm(staging, { recursive: true });
  const manifest = {
    diagnosticOnly: true,
    originalArchiveHash,
    copiedArchiveHash: digest(await readFile(copiedArchive)),
    patchedEntries: Object.fromEntries(patched),
    unchangedFiles,
    nativeUnpackedFiles,
    source: "Previously accepted installer; no source product change",
    collector: "In-process inspector; no listening port",
  };
  await mkdir(join(directory, "summary"), { recursive: true });
  await writeFile(join(directory, "summary/prepare.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
export async function captureHeapCheckpoint(directory, sample, requiredRoles = ["main", "host"]) {
  directory = resolve(directory);
  assert.match(sample.phase, /^[a-z0-9-]+$/);
  const processes = new Map(sample.processes.map((p) => [p.pid, p]));
  const targetFiles = await readdir(join(directory, "targets"));
  const targets = [];
  const excludedWorkerTargets = [];
  for (const name of targetFiles.filter((name) => name.endsWith(".json"))) {
    const target = JSON.parse(await readFile(join(directory, "targets", name), "utf8"));
    if (!processes.has(target.pid)) continue;
    assert.ok(!target.error, target.error);
    if (target.threadId > 0) {
      let heartbeat;
      try {
        heartbeat = JSON.parse(
          await readFile(join(directory, "heartbeats", target.id + ".json"), "utf8"),
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (heartbeat?.token !== target.token || Date.now() - heartbeat.sampledAt > 20000) {
        excludedWorkerTargets.push({
          id: target.id,
          pid: target.pid,
          threadId: target.threadId,
          role: target.role,
          reason:
            "No recent isolate heartbeat; a live OS PID does not prove this worker still exists. No heap measured.",
        });
        continue;
      }
    }
    assert.equal(target.parentPid, processes.get(target.pid).parentPid, "Target parent changed");
    assert.match(target.id, /^[a-z-]+-\d+-[a-f0-9-]+$/);
    assert.match(target.token, /^[a-f0-9-]+$/);
    assert.ok(
      !targets.some((other) => other.pid === target.pid && other.threadId === target.threadId),
      "Ambiguous process/isolate identity",
    );
    targets.push(target);
  }
  for (const role of requiredRoles)
    assert.ok(
      targets.some((target) => target.role === role),
      "Missing live heap target: " + role,
    );
  const captured = [];
  for (const target of targets) {
    const request = { token: target.token, sequence: Date.now(), phase: sample.phase };
    const requestFile = join(directory, "requests", target.id + ".json");
    await writeFile(requestFile + ".next", JSON.stringify(request));
    const { rename } = await import("node:fs/promises");
    await rename(requestFile + ".next", requestFile);
    const deadline = Date.now() + 120000;
    let ack;
    while (Date.now() < deadline) {
      try {
        ack = JSON.parse(await readFile(join(directory, "acks", target.id + ".json"), "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (ack?.sequence === request.sequence && ack?.token === target.token) break;
      await delay(100);
    }
    assert.equal(ack?.sequence, request.sequence, "Heap checkpoint timed out: " + target.id);
    assert.equal(ack?.token, target.token);
    assert.ok(!ack.error, ack.error);
    const summaryFile = join(directory, "summary", sample.phase + "-" + target.id + ".json");
    const expectedPrefix = join(directory, "private", target.id, sample.phase);
    assert.equal(ack.snapshot, expectedPrefix + ".heapsnapshot");
    assert.equal(ack.profile, expectedPrefix + ".heapprofile");
    await exec(
      process.execPath,
      [
        "--max-old-space-size=4096",
        resolve(import.meta.dirname, "heap-summary.mjs"),
        ack.snapshot,
        ack.profile,
        summaryFile,
      ],
      { timeout: 300000, maxBuffer: 1024 * 1024 },
    );
    captured.push({
      ...target,
      ...ack,
      profile: undefined,
      snapshot: undefined,
      summaryFile: sample.phase + "-" + target.id + ".json",
    });
    // Raw snapshots never enter the uploaded artifact; discard only after successful summarization.
    await rm(ack.snapshot);
    await rm(ack.profile);
  }
  const output = {
    diagnosticOnly: true,
    snapshotMayCollectGarbage: true,
    phase: sample.phase,
    excludedWorkerTargets,
    windowsSampleBeforeProfiling: sample,
    captured,
    processesWithoutJsHeap: sample.processes.filter((p) => !targets.some((t) => t.pid === p.pid)),
    limitations:
      "Native processes, renderer and uninstrumented worker isolates are outside this Node heap collector; not zero memory. RSS is process-wide and must not be added across thread targets. Profiler runs are not performance acceptance.",
  };
  await writeFile(
    join(directory, "summary", sample.phase + "-targets.json"),
    JSON.stringify(output, null, 2),
  );
  return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv[2], "prepare");
  await prepareDiagnosticCopy(...process.argv.slice(3, 6));
}
