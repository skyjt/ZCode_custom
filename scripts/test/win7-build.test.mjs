import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyRuntimeArchive, win7BuildEnv } from "../win7/build.mjs";

test("Win7 runtime rejects modified archives and cannot enable modern auto-update", () => {
  assert.throws(() => verifyRuntimeArchive(Buffer.from("corrupt")), /SHA-256/);
  const env = win7BuildEnv({ ZCODE_AUTO_UPDATE: "1", ZCODE_TARGET_ARCH: "arm64" });
  assert.equal(env.ZCODE_AUTO_UPDATE, "0");
  assert.equal(env.ZCODE_PREVIEW_IDENTITY, "1");
  assert.equal(env.ZCODE_TARGET_ARCH, "x64");
  assert.equal(env.ZCODE_TARGET_OS, "win32");
});
