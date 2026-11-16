// Fixed offline probes, executed in an isolated Electron-as-Node child, never in Main.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const { mkdtemp, readFile, writeFile, rm, stat, realpath } = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify, stripVTControlCharacters } = require("node:util");
const { tmpdir, homedir, release } = require("node:os");
const { join, resolve, dirname, delimiter, isAbsolute } = require("node:path");
const exec = promisify(execFile);

function environmentValue(env, name) {
  const key = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase() && env[key]);
  return key ? env[key].trim() : "";
}

async function isFile(path) {
  if (!path) return false;
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}

async function findDeveloperExecutable(name, env) {
  for (const entry of environmentValue(env, "PATH").split(delimiter)) {
    const directory = entry.trim().replace(/^"(.*)"$/, "$1");
    if (!isAbsolute(directory)) continue;
    const path = join(directory, name);
    if (await isFile(path)) return path;
  }
  return undefined;
}

function developerProbeEnvironment(env) {
  const result = { ...env };
  // 版本探针不能被用户的额外 goal/agent 参数变成构建或泄露参数；只隔离该探针的副本。
  const excluded =
    /^(CLASSPATH|JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS|JDK_JAVAC_OPTIONS|MAVEN_ARGS|MAVEN_OPTS|MAVEN_DEBUG_OPTS|MAVEN_PROJECTBASEDIR|MAVEN_CMD_LINE_ARGS|MAVEN_BATCH_PAUSE|MAVEN_BATCH_ECHO|MAVEN_SKIP_RC)$/i;
  for (const key of Object.keys(result)) if (excluded.test(key)) delete result[key];
  result.MAVEN_SKIP_RC = "1";
  return result;
}

async function sameExecutable(a, b) {
  if (!a || !b) return false;
  const paths = await Promise.all([realpath(a), realpath(b)]);
  return paths[0].toLowerCase() === paths[1].toLowerCase();
}

async function probeJavaEnvironment(folder, env = process.env) {
  const home = environmentValue(env, "JAVA_HOME");
  const pathJava = await findDeveloperExecutable("java.exe", env);
  const pathJavac = await findDeveloperExecutable("javac.exe", env);
  const java = home ? join(home, "bin/java.exe") : pathJava;
  const javac = home ? join(home, "bin/javac.exe") : pathJavac;
  const location = `JAVA_HOME: ${home || "not set"}; PATH java: ${pathJava || "not found"}; PATH javac: ${pathJavac || "not found"}`;
  if (!(await isFile(java)) || !(await isFile(javac))) {
    return {
      status: "warn",
      detail: `${location}; complete local JDK 8 not found; no installation or configuration changes made`,
    };
  }
  const options = {
    cwd: folder,
    env: developerProbeEnvironment(env),
    windowsHide: true,
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 64 * 1024,
  };
  let stage = "versions";
  try {
    // 任一版本命令失败时也必须等另一个退出，否则 Windows 的 cwd 句柄会阻止临时目录清理。
    const versions = await Promise.allSettled([
      exec(java, ["-version"], options),
      exec(javac, ["-version"], options),
    ]);
    for (const [index, result] of versions.entries()) {
      if (result.status === "rejected") {
        stage = index === 0 ? "java version" : "javac version";
        throw result.reason;
      }
    }
    const [runtime, compiler] = versions.map((result) => result.value);
    const javaVersion = /(?:openjdk|java) version "([^"]+)"/.exec(
      runtime.stdout + runtime.stderr,
    )?.[1];
    const javacVersion = /\bjavac\s+(\S+)/.exec(compiler.stdout + compiler.stderr)?.[1];
    const versionDetail = `Java ${javaVersion || "unknown"}; javac ${javacVersion || "unknown"}`;
    if (!javaVersion?.startsWith("1.8.") || !javacVersion?.startsWith("1.8.")) {
      return {
        status: "warn",
        detail: `${location}; ${versionDetail}; expected Java 8; existing installation unchanged`,
      };
    }
    const file = join(folder, "AibuddyDeveloperProbe.java");
    await writeFile(
      file,
      'public class AibuddyDeveloperProbe { public static void main(String[] args) { if ("中文".length() != 2) throw new AssertionError(); System.out.print("AIBUDDY7SE_JAVA8_OK"); } }',
      "utf8",
    );
    stage = "compile";
    // 临时目录已经是 cwd，固定相对文件名不再经过旧 JDK 的本机参数编码转换。
    await exec(
      javac,
      ["-proc:none", "-encoding", "UTF-8", "-d", ".", "AibuddyDeveloperProbe.java"],
      options,
    );
    stage = "run";
    const result = await exec(java, ["-cp", ".", "AibuddyDeveloperProbe"], options);
    assert.equal(result.stdout.trim(), "AIBUDDY7SE_JAVA8_OK");
    const consistent =
      (await sameExecutable(java, pathJava)) && (await sameExecutable(javac, pathJavac));
    return {
      status: consistent ? "pass" : "warn",
      detail: `${location}; ${versionDetail}; UTF-8 sample compiled and ran${consistent ? "" : "; JAVA_HOME and PATH disagree or PATH is incomplete; choose the intended JDK before building"}`,
    };
  } catch (error) {
    // 不回传工具原始错误输出，其中可能包含本机脚本回显的配置或秘密。
    return {
      status: "warn",
      detail: `${location}; JDK ${stage} probe failed (${error.code || "invalid output"}); no project built`,
    };
  }
}

async function probeMavenEnvironment(folder, env = process.env) {
  const executable = await findDeveloperExecutable("mvn.cmd", env);
  if (!executable)
    return {
      status: "warn",
      detail:
        "Local mvn.cmd not found on PATH; reuse your Maven installation; no download or configuration changes made",
    };
  const probeEnv = developerProbeEnvironment(env);
  probeEnv.AIBUDDY7SE_MAVEN_PROBE = executable;
  try {
    // CMD 只收到固定程序文本；路径通过一次变量展开置于引号内，禁用 delayed expansion。
    // 避免中文/空格/&/%/! 路径被当成命令，也不使用会重复展开的 CALL。
    const result = await exec(
      join(environmentValue(env, "SystemRoot") || "C:\\Windows", "System32/cmd.exe"),
      ["/d", "/s", "/v:off", "/c", '""%AIBUDDY7SE_MAVEN_PROBE%" --version"'],
      {
        cwd: folder,
        env: probeEnv,
        windowsHide: true,
        windowsVerbatimArguments: true,
        encoding: "utf8",
        timeout: 20000,
        maxBuffer: 64 * 1024,
      },
    );
    const output = stripVTControlCharacters(result.stdout);
    const version = /^Apache Maven ([^\s]+)/m.exec(output)?.[1];
    const javaVersion = /^Java version:\s*([^,\s]+)/m.exec(output)?.[1];
    const userSettings = join(homedir(), ".m2/settings.xml");
    const installSettings = join(dirname(dirname(executable)), "conf/settings.xml");
    const settings = await Promise.all(
      [userSettings, installSettings].map(
        async (path) => `${path} (${(await isFile(path)) ? "present" : "absent"})`,
      ),
    );
    return {
      status: version && javaVersion?.startsWith("1.8.") ? "pass" : "warn",
      detail: `${executable}; Apache Maven ${version || "unknown"}; runtime Java ${javaVersion || "unknown"}${javaVersion?.startsWith("1.8.") ? "" : " (expected Java 8)"}; settings candidates (contents not read): ${settings.join("; ")}; version only, project dependencies/repositories not tested`,
    };
  } catch (error) {
    return {
      status: "warn",
      detail: `${executable}; Maven version probe failed (${error.code || "invalid output"}); configuration unchanged; project not built`,
    };
  }
}

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
        async () =>
          `Bundled ${await run(join(resources, "offline-tools/git/cmd/git.exe"), ["--version"])}`,
      ],
      ["java", () => probeJavaEnvironment(folder)],
      ["maven", () => probeMavenEnvironment(folder)],
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

module.exports = { runChecks, probeJavaEnvironment, probeMavenEnvironment };
if (require.main === module) {
  main(resolve(process.argv[2])).then(
    (report) => process.stdout.write(JSON.stringify(report)),
    (error) => {
      process.stderr.write(safeDetail(error.message));
      process.exitCode = 1;
    },
  );
}
