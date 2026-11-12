import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";

assert.equal(process.platform, "win32", "Run the system API acceptance on Windows");
const root = resolve(import.meta.dirname, "../..");
const folder = await mkdtemp(join(tmpdir(), "zcode-legacy-api-"));
const marker = `ZCodeCompat-${process.pid}`;
let child;
try {
  const bundle = join(folder, "compat.cjs");
  await build({
    absWorkingDir: root,
    stdin: {
      resolveDir: root,
      contents: [
        'export { createProcessResourceTableReader } from "./packages/services/src/process/processResourceSampler.ts";',
        'export { readWindowsProcessListAsync, verifyWindowsProcessIdentityAsync } from "./packages/services/src/process/windowsProcessListAsync.ts";',
        'export { captureProcessTreeSnapshot } from "./packages/services/src/process/processTreeSnapshot.ts";',
        'export { findWindowsProcessesReferencingResourceMarkers } from "./packages/desktop/src/main/windowsInstallResourceLocks.ts";',
        'export { createNativeApplicationAdapter } from "./packages/desktop/src/main/file-open-apps/native.ts";',
        'export { WINDOWS_APPLICATION_SCRIPT } from "./packages/desktop/src/main/file-open-apps/windows.ts";',
        'export { createFileWorkspaceHookTrustStore } from "./apps/zcode-cli/packages/adapters/src/storage/workspace-hook-trust-store.ts";',
      ].join("\n"),
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: bundle,
    logLevel: "warning",
  });
  const api = createRequire(import.meta.url)(bundle);
  const liveStorePath = join(folder, "live-owner.json");
  child = spawn(process.execPath, [
    "-e",
    "const api = require(process.argv[1]); api.createFileWorkspaceHookTrustStore({filePath: process.argv[2], beforeRename: async () => {console.log('ready'); await new Promise(() => {})}}).grant([]).catch(error => {console.error(error); process.exit(1)}); setInterval(() => {}, 1000)",
    bundle,
    liveStorePath,
    marker,
  ]);
  await once(child.stdout, "data");
  const table = await api.createProcessResourceTableReader()();
  const sampled = table?.find((row) => row.pid === child.pid);
  assert.ok(sampled && sampled.rssKb > 0 && sampled.cpuTimeMs >= 0);
  const identity = (await api.readWindowsProcessListAsync({})).find((row) => row.pid === child.pid);
  assert.ok(identity);
  assert.equal(await api.verifyWindowsProcessIdentityAsync(identity, 5000), true);
  assert.equal(
    await api.verifyWindowsProcessIdentityAsync({ ...identity, startTime: "invalid" }, 5000),
    false,
  );
  assert.ok(api.captureProcessTreeSnapshot(child)?.identities.some((row) => row.pid === child.pid));
  const matches = await api.findWindowsProcessesReferencingResourceMarkers([marker], 10000);
  assert.deepEqual(
    matches.map((row) => row.pid),
    [child.pid],
  );
  assert.deepEqual(
    await api.findWindowsProcessesReferencingResourceMarkers([`${marker}-absent`], 10000),
    [],
  );
  console.log(
    "PASS legacy WMI sampling, creation identity, resource query and mismatched PID rejection",
  );

  const path = join(folder, "中文 & 文档.txt");
  await writeFile(path, "fictional compatibility fixture");
  const apps = await api.createNativeApplicationAdapter().query(path);
  assert.ok(apps.length > 0 && apps.every((app) => typeof app.name === "string"));
  assert.doesNotMatch(
    api.WINDOWS_APPLICATION_SCRIPT,
    /ConvertTo-Json|IsNullOrWhiteSpace|bool includeIcons =/,
  );
  const declaration = api.WINDOWS_APPLICATION_SCRIPT.split("if ($env:ZCODE_FILE_APP_ACTION")[0];
  const text = '中文 "引号" \\ path';
  const script = `${declaration}\n$q = New-Object FileApplicationQuery\n$r = New-Object FileAppRecord\n$r.name = $env:ZCODE_COMPAT_TEXT\n[void]$q.applications.Add($r)\n(New-Object System.Web.Script.Serialization.JavaScriptSerializer).Serialize($q)`;
  const { stdout } = await promisify(execFile)(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { env: { ...process.env, ZCODE_COMPAT_TEXT: text }, encoding: "utf8", timeout: 15000 },
  );
  assert.equal(JSON.parse(stdout).applications[0].name, text);
  console.log("PASS native file associations and legacy JSON Unicode/quote/backslash roundtrip");

  const liveLockPath = `${liveStorePath}.lock`;
  const liveOwner = await readFile(liveLockPath, "utf8");
  await utimes(liveLockPath, new Date(0), new Date(0));
  const contender = api.createFileWorkspaceHookTrustStore({
    filePath: liveStorePath,
    staleLockMs: 1,
    lockTimeoutMs: 300,
  });
  await assert.rejects(contender.grant([]), /Timed out acquiring/);
  assert.equal(await readFile(liveLockPath, "utf8"), liveOwner);
  console.log("PASS a real live owner keeps its aged lock across processes");

  const storePath = join(folder, "trust.json");
  const lockPath = `${storePath}.lock`;
  await writeFile(
    lockPath,
    JSON.stringify({ pid: child.pid, startTime: 1, token: "fictional-old-owner" }),
  );
  await utimes(lockPath, new Date(0), new Date(0));
  const store = api.createFileWorkspaceHookTrustStore({ filePath: storePath, staleLockMs: 1 });
  await store.grant([]);
  console.log(
    "PASS real Windows process start time allows stale lock recovery without killing the live process",
  );
} finally {
  if (child && child.exitCode === null) {
    const closed = once(child, "close");
    child.kill();
    await closed;
  }
  await rm(folder, { recursive: true, force: true });
}
