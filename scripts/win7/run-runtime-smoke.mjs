import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function runRuntimeSmoke(executable, moduleRoot, env = process.env) {
  // PowerShell 对 GUI exe 的退出状态不可靠；等待真实进程并要求完整结果，错误不能变绿。
  const result = spawnSync(
    executable,
    [resolve(import.meta.dirname, "runtime-smoke.cjs"), moduleRoot],
    {
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "Runtime smoke must exit successfully");
  assert.match(result.stdout, /"result": "PASS"/, "Runtime smoke must finish all checks");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runRuntimeSmoke(resolve(process.argv[2]), resolve(process.argv[3]));
