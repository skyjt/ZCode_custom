import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { verifyRuntimeArchive, win7BuildEnv } from "../win7/build.mjs";
import { configureWin7Environment } from "../win7/win7-environment.mjs";

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
