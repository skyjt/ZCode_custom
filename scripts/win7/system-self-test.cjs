// Fixed offline probes, executed in an isolated Electron-as-Node child, never in Main.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const { mkdtemp, readFile, writeFile, rm } = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { tmpdir, homedir, release } = require("node:os");
const { join, resolve } = require("node:path");
const exec = promisify(execFile);

function safeDetail(value) {
  let detail = String(value);
  for (const path of [homedir(), tmpdir(), process.resourcesPath].filter(Boolean)) {
    detail = detail.split(path).join("<local>");
  }
  return detail.slice(0, 1200);
}

async function runChecks(probes) {
  const checks = [];
  for (const [id, probe] of probes) {
    const started = Date.now();
    let result;
    try {
      const value = await probe();
      result = typeof value === "string" ? { status: "pass", detail: value } : value;
    } catch (error) {
      result = { status: "fail", detail: safeDetail(error.message) };
    }
    checks.push({
      id,
      ...result,
      detail: safeDetail(result.detail),
      durationMs: Date.now() - started,
    });
  }
  return checks;
}

async function main(resources) {
  const started = Date.now();
  const folder = await mkdtemp(join(tmpdir(), "aibuddy7se-self-test-"));
  const load = createRequire(join(resources, "app.asar/package.json"));
  const run = async (file, args) =>
    (
      await exec(file, args, {
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 128 * 1024,
        windowsHide: true,
        cwd: folder,
        env: { ...process.env, PYTHONUTF8: "1", PYTHONDONTWRITEBYTECODE: "1", PIP_NO_INDEX: "1" },
      })
    ).stdout.trim();
  const keyring = (requireModule) => async () => {
    const { AsyncEntry } = requireModule("@napi-rs/keyring");
    const entry = new AsyncEntry("aibuddy7se self-test", randomUUID());
    try {
      await entry.setPassword("fictional-self-test-value");
      assert.equal(await entry.getPassword(), "fictional-self-test-value");
    } finally {
      await entry.deleteCredential();
    }
    assert.equal(await entry.getPassword(), null);
    return "Temporary credential write/read/delete";
  };
  let checks;
  try {
    checks = await runChecks([
      [
        "system",
        async () => {
          assert.equal(process.platform, "win32");
          assert.equal(process.arch, "x64");
          assert.ok(process.versions.electron);
          return {
            status: release().startsWith("6.1.7601") ? "pass" : "warn",
            detail: `Windows ${release()}, ${process.arch}; target: Windows 7 SP1 x64`,
          };
        },
      ],
      [
        "files",
        async () => {
          const file = join(folder, "中文 文件.txt");
          await writeFile(file, "中文读写", "utf8");
          assert.equal(await readFile(file, "utf8"), "中文读写");
          return "Unicode file path and UTF-8 read/write";
        },
      ],
      [
        "sqlite",
        async () => {
          const { DatabaseSync } = require("node:sqlite");
          const file = join(folder, "中文.sqlite");
          const db = new DatabaseSync(file);
          try {
            db.exec("CREATE TABLE sample(value TEXT); BEGIN");
            db.prepare("INSERT INTO sample VALUES (?)").run("中文");
            db.exec("COMMIT; BEGIN; DELETE FROM sample; ROLLBACK");
          } finally {
            db.close();
          }
          const reopened = new DatabaseSync(file);
          try {
            assert.equal(reopened.prepare("SELECT value FROM sample").get().value, "中文");
          } finally {
            reopened.close();
          }
          return "Transaction, rollback, reopen, Unicode";
        },
      ],
      [
        "terminal",
        async () => {
          const pty = load("node-pty");
          await new Promise((done, fail) => {
            const term = pty.spawn(
              process.env.ComSpec || "cmd.exe",
              ["/d", "/c", "echo AIBUDDY_WINPTY_OK"],
              {
                cwd: folder,
                env: process.env,
                cols: 80,
                rows: 24,
                useConpty: false,
                useConptyDll: false,
              },
            );
            let output = "";
            const timer = setTimeout(() => {
              term.kill();
              fail(new Error("WinPTY timeout"));
            }, 10000);
            term.onData((data) => {
              output += data;
            });
            term.onExit(({ exitCode }) => {
              clearTimeout(timer);
              try {
                assert.equal(exitCode, 0);
                assert.match(output, /AIBUDDY_WINPTY_OK/);
                done();
              } catch (error) {
                fail(error);
              }
            });
            term.resize(100, 30);
          });
          return "WinPTY spawn, output, resize, exit";
        },
      ],
      ["desktopCredentials", keyring(load)],
      ["agentCredentials", keyring(createRequire(join(resources, "glm/zcode.cjs")))],
      [
        "search",
        async () => {
          await writeFile(join(folder, "搜索.txt"), "中文搜索验证\n");
          const result = await run(join(resources, "tools/ripgrep/rg.exe"), [
            "--json",
            "中文搜索验证",
            join(folder, "搜索.txt"),
          ]);
          assert.ok(
            result
              .split(/\r?\n/)
              .filter(Boolean)
              .map((line) => JSON.parse(line))
              .some((item) => item.type === "match"),
          );
          return `Unicode ripgrep search; ${(await run(join(resources, "tools/ugrep/ugrep.exe"), ["--version"])).split(/\r?\n/)[0]}`;
        },
      ],
      [
        "pythonOffice",
        async () => {
          const result = JSON.parse(
            await run(join(resources, "offline-tools/python/python.exe"), [
              "-B",
              "-X",
              "utf8",
              join(resources, "offline-tools/smoke.py"),
            ]),
          );
          assert.equal(result.result, "PASS");
          return `Python ${result.python.split(" ")[0]}; ${result.checks.join(", ")}`;
        },
      ],
      [
        "powershell",
        async () => {
          const script =
            "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding; $p=Get-WmiObject Win32_Process -Filter ('ProcessId='+$PID); if(!$p){throw 'WMI unavailable'}; Add-Type -AssemblyName System.Web.Extensions; $j=New-Object System.Web.Script.Serialization.JavaScriptSerializer; if($j.Serialize(@{ok=1}) -notmatch 'ok'){throw 'JSON unavailable'}; Write-Output ('PowerShell '+$PSVersionTable.PSVersion.ToString()+'; WMI and .NET JSON OK')";
          return await run(
            join(
              process.env.SystemRoot || "C:\\Windows",
              "System32/WindowsPowerShell/v1.0/powershell.exe",
            ),
            ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
          );
        },
      ],
      [
        "ssh",
        async () => {
          const results = [];
          for (const tool of ["plink", "pscp", "psftp"])
            results.push(
              (await run(join(resources, `offline-tools/putty/${tool}.exe`), ["-V"])).split(
                /\r?\n/,
              )[0],
            );
          return results.join("; ");
        },
      ],
      [
        "git",
        async () => {
          try {
            return await run("git.exe", ["--version"]);
          } catch {
            return {
              status: "warn",
              detail: "Optional Git unavailable; not required for chat or Office tasks",
            };
          }
        },
      ],
      [
        "connections",
        async () => ({
          status: "not-tested",
          detail:
            "Model API, real SSH/SFTP server and GPU/driver interaction require manual testing; no network requests made",
        }),
      ],
    ]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    system: {
      platform: process.platform,
      release: release(),
      arch: process.arch,
      electron: process.versions.electron || "",
      node: process.versions.node,
    },
    checks,
  };
}

module.exports = { runChecks };
if (require.main === module) {
  main(resolve(process.argv[2])).then(
    (report) => process.stdout.write(JSON.stringify(report)),
    (error) => {
      process.stderr.write(safeDetail(error.message));
      process.exitCode = 1;
    },
  );
}
