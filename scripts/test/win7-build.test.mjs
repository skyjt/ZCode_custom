import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { join, win32 } from "node:path";
import { runInNewContext } from "node:vm";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { offlineRuntime, prepareOfflineTools } from "../win7/prepare-offline-tools.mjs";
import { verifyRuntimeArchive, win7BuildEnv } from "../win7/build.mjs";
import { configureWin7Environment, configureOfflineTools } from "../win7/win7-environment.mjs";
import { patchPnpmInstallSource } from "../win7/patch-pnpm.mjs";

test("CI pnpm fix passes only absolute destinations to hoisted copy workers", () => {
  const source =
    "const nonBuiltHoistedDeps = hoistedLocationsOfDep?.filter((hoistedLocation) => hoistedLocation !== currentHoistedLocation);\nnonBuiltHoistedDeps;";
  const result = runInNewContext(patchPnpmInstallSource(source), {
    path_1: { default: win32 },
    opts: { lockfileDir: "C:\\repo" },
    hoistedLocationsOfDep: ["node_modules\\esbuild", "node_modules\\vite\\node_modules\\esbuild"],
    currentHoistedLocation: "node_modules\\esbuild",
  });
  assert.deepEqual(Array.from(result), ["C:\\repo\\node_modules\\vite\\node_modules\\esbuild"]);
  assert.throws(() => patchPnpmInstallSource("unknown source"), /Unexpected pnpm/);
  assert.throws(() => patchPnpmInstallSource(source + source), /Unexpected pnpm/);
});

test("offline staging rejects a tampered cached runtime before extracting or executing it", async () => {
  const root = await mkdtemp(join(tmpdir(), "offline-staging-"));
  try {
    await mkdir(join(root, "scripts/win7/offline-tools"), { recursive: true });
    await mkdir(join(root, ".cache/win7-offline-downloads"), { recursive: true });
    await writeFile(
      join(root, ".cache/win7-offline-downloads", offlineRuntime.assets[0].name),
      "corrupt",
    );
    await assert.rejects(prepareOfflineTools(root, {}), /Offline asset SHA-256 mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("offline tools use application PATH without duplicate Windows path keys or user Python", () => {
  const env = { Path: "C:\\Windows", PATH: "wrong", HOME: "/home", PYTHONPATH: "user-python" };
  configureOfflineTools("/resources", env);
  assert.equal(env.PATH, undefined);
  assert.ok(env.Path.startsWith(join("/resources", "offline-tools/python")));
  assert.ok(env.Path.endsWith("C:\\Windows"));
  assert.equal(env.HOME, "/home");
  assert.equal(env.PYTHONPATH, undefined);
  assert.equal(env.PIP_NO_INDEX, "1");
  assert.equal(env.ZCODE_OFFLINE_TOOLS, join("/resources", "offline-tools"));
  const path = env.Path;
  configureOfflineTools("/resources", env);
  assert.equal(env.Path, path);
});

test("smoke launcher propagates a non-Electron runtime failure", () => {
  const result = spawnSync(
    process.execPath,
    [join(import.meta.dirname, "../win7/run-runtime-smoke.mjs"), process.execPath, process.cwd()],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Runtime smoke must exit successfully/);
});

test("Win7 isolates Agent databases without redirecting Git or SSH home", () => {
  const env = {
    HOME: "/real-home",
    USERPROFILE: "/real-home",
    ZCODE_SESSION_DB: "/formal.db",
    ZCODE_SESSION_DB_PATH: "/formal-other.db",
  };
  const home = configureWin7Environment(env, "/test-home");
  assert.equal(env.HOME, "/real-home");
  assert.equal(env.USERPROFILE, "/real-home");
  assert.equal(env.ZCODE_SESSION_DB, undefined);
  assert.equal(env.ZCODE_SESSION_DB_PATH, join(home, ".zcode/cli/db/db.sqlite"));
  assert.equal(env.ZCODE_STORAGE_DIR, join(home, ".zcode"));
  assert.equal(env.ZCODE_DATA_BASE_DIR, home);
});

test("Win7 runtime rejects modified archives and cannot enable modern auto-update", () => {
  const bytes = Buffer.from("pinned source archive");
  verifyRuntimeArchive(bytes, createHash("sha256").update(bytes).digest("hex"));
  assert.throws(
    () =>
      verifyRuntimeArchive(
        Buffer.from("modified"),
        createHash("sha256").update(bytes).digest("hex"),
      ),
    /SHA-256/,
  );
  assert.throws(() => verifyRuntimeArchive(Buffer.from("corrupt")), /SHA-256/);
  const env = win7BuildEnv({ ZCODE_AUTO_UPDATE: "1", ZCODE_TARGET_ARCH: "arm64" });
  assert.equal(env.ZCODE_AUTO_UPDATE, "0");
  assert.equal(env.ZCODE_PREVIEW_IDENTITY, "1");
  assert.equal(env.ZCODE_TARGET_ARCH, "x64");
  assert.equal(env.ZCODE_TARGET_OS, "win32");
});
