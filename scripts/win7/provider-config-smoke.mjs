import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, stat, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Session } from "node:inspector";
const exec = promisify(execFile);
const [bundle, fixture, output, mode] = process.argv.slice(2);
const {
  NodeZCodeBuiltinProviderConfigSource: Source,
  decodeZCodeBuiltinRelease: decode,
  encodeZCodeBuiltinRelease: encode,
} = createRequire(import.meta.url)(resolve(bundle));
const original = JSON.parse(await readFile(fixture, "utf8"));
const version = (revision, conflict = false) => {
  const data = structuredClone(original);
  data.revision = revision;
  if (conflict)
    data.config.modelConfigRules.modelRules.push({
      modelMatch: "__LOCAL_SMOKE_ONLY__",
      config: {},
    });
  return data;
};
if (mode === "--writer") {
  const source = new Source({
    bundledFilePath: join(output, "bundled.json"),
    activeFilePath: join(output, "active.json"),
    watch: false,
  });
  try {
    await source.applyRemoteRelease(decode(version(Number(process.argv[6]))));
  } finally {
    source.dispose();
  }
} else {
  const root = await mkdtemp(join(tmpdir(), "aibuddy7se-provider-"));
  const bundledFilePath = join(root, "bundled.json"),
    activeFilePath = join(root, "active.json");
  const sources = [];
  const make = (options = {}) => {
    const source = new Source({ bundledFilePath, activeFilePath, watch: false, ...options });
    sources.push(source);
    return source;
  };
  const save = (path, value) => writeFile(path, JSON.stringify(value));
  const readActive = async () => JSON.parse(await readFile(activeFilePath, "utf8"));
  const canonical = (value) => JSON.stringify(encode(decode(value)));
  const checks = [];
  try {
    await save(bundledFilePath, original);
    const source = make();
    if (mode === "--benchmark") {
      const session = new Session();
      session.connect();
      const post = (method, args = {}) =>
        new Promise((ok, fail) =>
          session.post(method, args, (error, result) => (error ? fail(error) : ok(result))),
        );
      await post("HeapProfiler.enable");
      await post("HeapProfiler.startSampling", {
        samplingInterval: 32768,
        includeObjectsCollectedByMajorGC: true,
        includeObjectsCollectedByMinorGC: true,
      });
      const before = process.memoryUsage(),
        elapsedMs = [];
      for (let i = 0; i < 12; i++) {
        const started = performance.now();
        await source.read();
        elapsedMs.push(performance.now() - started);
      }
      const after = process.memoryUsage();
      const { profile } = await post("HeapProfiler.getSamplingProfile");
      const total = (node) =>
        node.selfSize + (node.children || []).reduce((sum, child) => sum + total(child), 0);
      const sampledBytes = total(profile.head);
      session.disconnect();
      await mkdir(output, { recursive: true });
      await writeFile(
        join(output, "provider-benchmark.json"),
        JSON.stringify(
          {
            diagnosticOnly: true,
            scope:
              "12 real filesystem reads in one fresh Node process; sampled cumulative allocations, no forced GC or heap snapshots; not packaged application RAM",
            before,
            after,
            elapsedMs,
            sampledBytes,
            activeHash: createHash("sha256")
              .update(canonical(await readActive()))
              .digest("hex"),
          },
          null,
          2,
        ),
      );
    } else {
      await source.read();
      assert.equal(canonical(await readActive()), canonical(original));
      const initialTime = (await stat(activeFilePath, { bigint: true })).mtimeNs;
      await source.read();
      assert.equal((await stat(activeFilePath, { bigint: true })).mtimeNs, initialTime);
      assert.equal(await source.applyRemoteRelease(decode(original)), "unchanged");
      await assert.rejects(
        source.applyRemoteRelease(decode(version(original.revision, true))),
        /相同 revision/,
      );
      checks.push("materialize/no-op/same-revision rejection");
      await save(activeFilePath, version(original.revision, true));
      await source.read();
      assert.equal(canonical(await readActive()), canonical(original));
      await writeFile(activeFilePath, "{broken");
      await source.read();
      assert.equal(canonical(await readActive()), canonical(original));
      checks.push("conflicting and corrupt Active repaired from Bundled");
      const next = original.revision + 1;
      assert.equal(await source.applyRemoteRelease(decode(version(next))), "updated");
      assert.equal(await source.applyRemoteRelease(decode(original)), "stale");
      assert.equal((await readActive()).revision, next);
      const mutable = { ...decode(version(next + 1)) };
      assert.equal(await source.applyRemoteRelease(mutable), "updated");
      mutable.revision = next + 2;
      assert.equal(await source.applyRemoteRelease(mutable), "updated");
      assert.equal((await readActive()).revision, next + 2);
      mutable.config = decode(version(next + 2, true)).config;
      await assert.rejects(source.applyRemoteRelease(mutable), /相同 revision/);
      checks.push("monotonic revisions and no cross-operation object cache");
      await Promise.all(
        [next + 3, next + 4].map((revision) =>
          exec(
            process.execPath,
            [
              resolve(import.meta.filename),
              resolve(bundle),
              resolve(fixture),
              root,
              "--writer",
              String(revision),
            ],
            { timeout: 30000 },
          ),
        ),
      );
      assert.equal((await readActive()).revision, next + 4);
      checks.push("two real writers retain the highest revision");
      const other = make({ activeFilePath: join(root, "other-endpoint.json") });
      assert.notEqual(
        (await other.read()).revision,
        (await make({ activeFilePath: bundledFilePath }).read()).revision,
      );
      checks.push("endpoint path identity remains isolated");
      await rm(bundledFilePath);
      await rm(activeFilePath);
      await source.read();
      assert.equal(canonical(await readActive()), canonical(original));
      await writeFile(bundledFilePath, "{broken");
      await writeFile(activeFilePath, "{broken");
      await assert.rejects(source.read());
      checks.push("missing Bundled LKG fallback and corrupt-both rejection");
      await save(bundledFilePath, original);
      await rm(activeFilePath);
      const watched = make({ watch: true });
      await watched.read();
      const changed = new Promise((ok, fail) => {
        const timer = setTimeout(() => fail(new Error("watch event missing")), 10000);
        watched.onDidChange((reason) => {
          if (reason === "file-changed") {
            clearTimeout(timer);
            ok();
          }
        });
      });
      await save(activeFilePath + ".replacement", version(next + 5));
      await rename(activeFilePath + ".replacement", activeFilePath);
      await changed;
      assert.equal((await readActive()).revision, next + 5);
      watched.dispose();
      await assert.rejects(watched.read(), /dispose/);
      checks.push("atomic replacement watcher and disposed-source rejection");
      await mkdir(output, { recursive: true });
      await writeFile(
        join(output, "provider-config-smoke.json"),
        JSON.stringify(
          {
            result: "PASS",
            platform: process.platform,
            versions: process.versions,
            checks,
            scope:
              "Actual temporary files, two writer processes and fs.watch; synthetic configuration only. No network or real account data.",
          },
          null,
          2,
        ),
      );
      console.log("Provider config filesystem acceptance: PASS (" + checks.length + " groups)");
    }
  } finally {
    for (const source of sources) source.dispose();
    await rm(root, { recursive: true, force: true });
  }
}
