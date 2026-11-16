import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { createPackageWithOptions, extractFile, statFile } from "@electron/asar";
import { summarizeSnapshot, summarizeAllocation } from "../win7/heap-summary.mjs";
import {
  captureHeapCheckpoint,
  insertProbe,
  prepareDiagnosticCopy,
} from "../win7/heap-diagnostics.mjs";

test("strong dominators handle shared references, weak edges and value redaction", () => {
  const strings = ["root", "HolderA", "HolderB", "Owned", "Shared", "Secret user content"];
  const links = [
    [
      [1, 0],
      [2, 0],
      [5, 1],
    ],
    [
      [3, 0],
      [4, 0],
    ],
    [[4, 0]],
    [],
    [],
    [],
  ];
  const snapshot = {
    snapshot: {
      meta: {
        node_fields: ["type", "name", "id", "self_size", "edge_count"],
        node_types: [["synthetic", "object", "string"], "string", "number", "number", "number"],
        edge_fields: ["type", "name_or_index", "to_node"],
        edge_types: [["property", "weak"], "string_or_number", "node"],
      },
    },
    nodes: [],
    edges: [],
    strings,
  };
  for (let i = 0; i < links.length; i++) {
    snapshot.nodes.push(i === 0 ? 0 : i === 5 ? 2 : 1, i, i * 2 + 1, i * 10, links[i].length);
    for (const [to, weak] of links[i]) snapshot.edges.push(weak, 0, to * 5);
  }
  const summary = summarizeSnapshot(snapshot);
  assert.equal(summary.strongSelfBytes, 100);
  assert.equal(summary.stronglyReachableNodes, 5);
  assert.equal(summary.topRetainers.find((r) => r.name === "HolderA").retainedBytes, 40);
  assert.equal(summary.topRetainers.find((r) => r.name === "HolderB").retainedBytes, 20);
  assert.equal(
    summary.topRetainers.find((r) => r.name === "Shared").dominatorChain.at(-1).name,
    "root",
  );
  assert.ok(!JSON.stringify(summary).includes("Secret user content"));
  const scriptSnapshot = structuredClone(snapshot);
  scriptSnapshot.snapshot.meta.node_types[0].push("code");
  scriptSnapshot.nodes[5] = 3;
  scriptSnapshot.strings[1] =
    "system / Script / file:///C:/Users/private/app.asar/out/main/index.js";
  const scriptSummary = JSON.stringify(summarizeSnapshot(scriptSnapshot));
  assert.ok(!scriptSummary.includes("Users/private"));
  assert.ok(scriptSummary.includes("app.asar/out/main/index.js"));
  const allocation = summarizeAllocation({
    head: {
      selfSize: 0,
      callFrame: {},
      children: [
        {
          selfSize: 1024,
          callFrame: {
            functionName: "retain",
            url: "C:/Users/private/app.asar/out/main/index.js",
            lineNumber: 12,
            columnNumber: 3,
          },
        },
      ],
    },
  });
  assert.equal(allocation.sampledBytes, 1024);
  assert.equal(allocation.topStacks[0].stack.at(-1).url, "app.asar/out/main/index.js");
});

test("diagnostic copy preserves originals, native pack state and executable shebang", async () => {
  const dir = await mkdtemp(join(tmpdir(), "heap-package-"));
  try {
    const source = join(dir, "original"),
      staging = join(dir, "staging"),
      copy = join(dir, "copy"),
      output = join(dir, "output");
    await mkdir(join(source, "resources/glm"), { recursive: true });
    await mkdir(join(staging, "node_modules/native"), { recursive: true });
    await writeFile(join(staging, "package.json"), '{"type":"module","main":"out/main/index.js"}');
    for (const role of ["main", "host", "scheduler", "extension-host"]) {
      await mkdir(join(staging, "out", role), { recursive: true });
      await writeFile(join(staging, "out", role, "index.js"), "export const original = true;\n");
    }
    for (const name of [
      "host/tasksStorageWorker.js",
      "main/storageScanWorker.js",
      "main/aibuddy7seDataSizeWorker.js",
    ])
      await writeFile(join(staging, "out", name), "export const worker = true;\n");
    await writeFile(
      join(staging, join("node_modules", "native", "addon.node")),
      "native fixture bytes",
    );
    const archive = join(source, "resources/app.asar");
    await createPackageWithOptions(staging, archive, { unpack: "*.{node,dll,dylib,exe}" });
    for (const name of ["aibuddy7se.cjs", "plugin-host.cjs"])
      await writeFile(
        join(source, "resources/glm", name),
        "#!/usr/bin/env node\nmodule.exports = 1;\n",
      );
    const digest = async (file) =>
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex");
    const before = await digest(archive);
    const manifest = await prepareDiagnosticCopy(source, copy, output);
    assert.equal(await digest(archive), before);
    assert.equal(manifest.nativeUnpackedFiles, 1);
    assert.equal(manifest.unchangedFiles, 2);
    assert.equal(
      statFile(join(copy, "resources/app.asar"), join("node_modules", "native", "addon.node"))
        .unpacked,
      true,
    );
    assert.equal(
      extractFile(
        join(copy, "resources/app.asar"),
        join("node_modules", "native", "addon.node"),
      ).toString(),
      "native fixture bytes",
    );
    assert.match(
      await readFile(join(copy, "resources/glm/aibuddy7se.cjs"), "utf8"),
      /^#![^\n]+\nrequire\(/,
    );
    assert.match(
      extractFile(join(copy, "resources/app.asar"), join("out", "main", "index.js")).toString(),
      /^import heapProbeReady/,
    );
    await assert.rejects(prepareDiagnosticCopy(source, source, output), /disjoint/);
    await assert.rejects(prepareDiagnosticCopy(source, copy, output), /overwrite/);
    assert.equal(insertProbe("#!node\noriginal();", "probe();"), "#!node\nprobe();\noriginal();");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("real isolated Node probe captures allocations and retained heap without listening socket", async () => {
  const dir = await mkdtemp(join(tmpdir(), "heap-runtime-"));
  const fixture = join(dir, "fixture.cjs");
  const probe = resolve("scripts/win7/heap-probe.cjs");
  const output = join(dir, "profile");
  await mkdir(join(output, "summary"), { recursive: true });
  await writeFile(
    fixture,
    "require(" +
      JSON.stringify(probe) +
      ").start(" +
      JSON.stringify({ directory: output, role: "main" }) +
      ").then(() => {" +
      "class RetainedFixture { constructor(i) { this.value = i; this.payload = Array(20).fill(i); } }" +
      "global.retained = Array.from({length:30000},(_,i) => new RetainedFixture(i));" +
      "setInterval(() => {},1000); });",
  );
  const workerSource =
    "require(" +
    JSON.stringify(probe) +
    ").start(" +
    JSON.stringify({ directory: output, role: "host-storage-worker" }) +
    ").then(() => { global.workerObjects = Array(20000).fill(42); setInterval(()=>{},1000); });";
  const originalFixture = await readFile(fixture, "utf8");
  await writeFile(
    fixture,
    originalFixture +
      "\nnew (require('node:worker_threads').Worker)(" +
      JSON.stringify(workerSource) +
      ", {eval:true});",
  );
  const child = spawn(process.execPath, [fixture], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  const exited = new Promise((done) => child.on("exit", done));
  try {
    let names = [];
    for (let i = 0; i < 100; i++) {
      try {
        names = (await readdir(join(output, "targets"))).filter((n) => n.endsWith(".json"));
      } catch {}
      if (names.length === 2) break;
      await delay(50);
    }
    assert.equal(names.length, 2, stderr);
    const metadata = await Promise.all(
      names.map(async (name) => JSON.parse(await readFile(join(output, "targets", name), "utf8"))),
    );
    const target = metadata.find((row) => row.role === "main");
    assert.ok(metadata.some((row) => row.pid === target.pid && row.threadId > 0));
    // Incorrect tokens and stale sequences must not trigger a snapshot.
    await writeFile(
      join(output, "requests", target.id + ".json"),
      JSON.stringify({ token: "wrong", sequence: 1, phase: "wrong" }),
    );
    await delay(400);
    assert.deepEqual(await readdir(join(output, "acks")), []);
    const sample = {
      phase: "fixture",
      processes: [{ pid: child.pid, parentPid: process.pid }],
      workingSetBytes: null,
      privateBytes: null,
    };
    const result = await captureHeapCheckpoint(output, sample, ["main", "host-storage-worker"]);
    assert.equal(result.captured.length, 2);
    const report = JSON.parse(
      await readFile(
        join(output, "summary", result.captured.find((row) => row.role === "main").summaryFile),
        "utf8",
      ),
    );
    assert.ok(report.allocation.sampledBytes > 1000000);
    assert.ok(
      report.heap.topGroups.some((row) => row.name === "RetainedFixture" && row.count === 30000),
    );
    assert.ok(report.heap.strongSelfBytes > 1000000);
    assert.doesNotMatch(stderr, /Debugger listening/);
    const ack = await readFile(join(output, "acks", target.id + ".json"), "utf8");
    await writeFile(
      join(output, "requests", target.id + ".json"),
      JSON.stringify({ token: target.token, sequence: 1, phase: "stale" }),
    );
    await delay(400);
    assert.equal(await readFile(join(output, "acks", target.id + ".json"), "utf8"), ack);
    await assert.rejects(
      captureHeapCheckpoint(output, { ...sample, phase: "missing", processes: [] }),
      /Missing live heap target/,
    );
  } finally {
    child.kill();
    await exited;
    await rm(dir, { recursive: true, force: true });
  }
});

test("cold comparison balances order and never treats three snapshots as independent trials", async () => {
  const { summarizePairs } = await import("../win7/cold-comparison.mjs");
  const pairs = [
    { order: ["old", "new"], old: { ram: 100 }, new: { ram: 90 } },
    { order: ["new", "old"], old: { ram: 200 }, new: { ram: 220 } },
  ];
  const summary = summarizePairs(pairs);
  assert.equal(summary.independentRunsPerVersion, 2);
  assert.equal(summary.metrics.ram.pairedPercentMedian, 0);
  assert.deepEqual(summary.metrics.ram.pairedPercent, [-10, 10]);
  assert.throws(() => summarizePairs(pairs.slice(0, 1)), /balanced/);
  assert.throws(() => summarizePairs([pairs[0], pairs[0]]));
  assert.throws(() => summarizePairs([pairs[0], { ...pairs[1], new: {} }]));
});
