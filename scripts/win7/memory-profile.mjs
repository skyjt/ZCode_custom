import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

// 只按父子关系采集本次成包的进程；同名的其他应用和采样工具不能混入总量。
export function selectProcessTree(processes, rootPid) {
  assert.ok(Number.isInteger(rootPid) && rootPid > 0);
  const byPid = new Map(processes.map((row) => [row.pid, row]));
  const selected = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (
        selected.has(process.parentPid) &&
        !selected.has(process.pid) &&
        (!process.createdAt ||
          !byPid.get(process.parentPid)?.createdAt ||
          Date.parse(process.createdAt) >= Date.parse(byPid.get(process.parentPid).createdAt))
      ) {
        selected.add(process.pid);
        changed = true;
      }
    }
  }
  const rows = processes.filter((process) => selected.has(process.pid));
  assert.ok(
    rows.some((process) => process.pid === rootPid),
    "Application exited during sample",
  );
  for (const row of rows) {
    assert.ok(Number.isFinite(row.workingSetBytes) && row.workingSetBytes >= 0);
    assert.ok(Number.isFinite(row.privateBytes) && row.privateBytes >= 0);
  }
  return {
    processes: rows,
    workingSetBytes: rows.reduce((sum, row) => sum + row.workingSetBytes, 0),
    privateBytes: rows.reduce((sum, row) => sum + row.privateBytes, 0),
  };
}

export async function sampleMemory(page, rootPid, phase) {
  // 不输出完整命令行/用户路径，也不调用 GC 或修改工作集；private bytes 是提交量，不是物理驻留量。
  const script = String.raw`
$rows = @(Get-CimInstance Win32_Process | ForEach-Object {
  $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  if ($p) {
    $role = 'native-or-node'
    if ($_.CommandLine -match '--type=([a-z-]+)') { $role = $Matches[1] }
    $entry = $null
    $plugin = $null
    if ($_.CommandLine -match 'plugin-host\.cjs') {
      $entry = 'plugin-host.cjs'
      if ($_.CommandLine -match '[\\/]packages[\\/](documents-plugin|spreadsheets-plugin|presentations-plugin|pdf-plugin|node-repl-host|sites-plugin)[\\/]') { $plugin = $Matches[1] }
      elseif ($_.CommandLine -match '[\\/]cache[\\/]aibuddy7se-plugins-official[\\/](documents|spreadsheets|presentations|pdf|node-repl-host|sites)[\\/][^\\/\s\"]+[\\/]dist[\\/]') { $plugin = $Matches[1]; if ($plugin -ne 'node-repl-host') { $plugin += '-plugin' } }
    } elseif ($_.CommandLine -match 'aibuddy7se\.cjs') { $entry = 'aibuddy7se.cjs' }
    elseif ($_.CommandLine -match '[\\/]out[\\/](host|extension-host|scheduler)[\\/]index\.js') { $entry = $Matches[1] + '/index.js'; $role = $Matches[1] }
    if ($_.ProcessId -eq ROOT_PID) { $role = 'main' }
    [PSCustomObject]@{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId;
      name = $_.Name; role = $role; entry = $entry; plugin = $plugin; createdAt = $_.CreationDate.ToUniversalTime().ToString('o'); workingSetBytes = [double]$p.WorkingSet64;
      privateBytes = [double]$p.PrivateMemorySize64 }
  }
})
ConvertTo-Json -InputObject $rows -Compress
`;
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script.replace("ROOT_PID", String(rootPid)), "utf16le").toString("base64"),
    ],
    { encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024 },
  );
  let heap;
  if (page) {
    const session = await page.context().newCDPSession(page);
    try {
      heap = await session.send("Runtime.getHeapUsage");
    } finally {
      await session.detach();
    }
  }
  const result = {
    phase,
    sampledAt: new Date().toISOString(),
    ...selectProcessTree(JSON.parse(stdout), rootPid),
    rendererHeap: heap,
    diffWorkers: page
      ? page.workers().filter((worker) => /diffs\.worker/.test(worker.url())).length
      : 0,
  };
  console.log(
    `Memory ${phase}: working set ${(result.workingSetBytes / 1048576).toFixed(1)} MiB; private ${(result.privateBytes / 1048576).toFixed(1)} MiB; diff workers ${result.diffWorkers}`,
  );
  return result;
}

export async function profileStartupMemory(page, rootPid, output) {
  const readyAt = Date.now();
  const samples = [];
  for (const seconds of [30, 90]) {
    await delay(Math.max(0, readyAt + seconds * 1000 - Date.now()));
    samples.push(await sampleMemory(page, rootPid, `workspace-ready-${seconds}s`));
    await writeFile(
      join(output, "memory.json"),
      JSON.stringify(
        {
          scope:
            "Windows CI fictional migrated workspace; summed working sets include shared pages; private bytes are committed memory. No forced GC. Not real Win7/task/browser usage.",
          samples,
        },
        null,
        2,
      ),
    );
  }
  return samples;
}
