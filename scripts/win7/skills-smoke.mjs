import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { configureOfflineTools, configureWin7Environment } from "./win7-environment.mjs";

const app = resolve(process.argv[2]);
const home = await mkdtemp(join(tmpdir(), "zcode-skills-"));
const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
configureWin7Environment(env, home);
configureOfflineTools(join(app, "resources"), env);
try {
  const execute = promisify(execFile);
  for (const name of ["offline-toolkit", "ssh-sftp", "docx", "xlsx", "pptx", "pdf"]) {
    const { stdout } = await execute(
      join(app, "ZCode Win7 Experimental.exe"),
      [join(app, "resources/glm/zcode.cjs"), "skills", "inspect", name, "--json"],
      { cwd: home, env, timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    const result = JSON.parse(stdout);
    assert.ok(
      result.skill?.content?.includes("ZCODE_OFFLINE_TOOLS"),
      `${name} must resolve offline guidance`,
    );
  }
  console.log(
    "PASS packaged Agent discovers offline toolkit, SSH/SFTP and four Office skill branches",
  );
} finally {
  await rm(home, { recursive: true, force: true });
}
