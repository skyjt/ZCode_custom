import assert from "node:assert/strict";
import { test } from "node:test";
import { runChecks } from "../win7/system-self-test.cjs";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import probes from "../win7/system-self-test.cjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("self-test continues after failure and reports optional and untested capabilities honestly", async () => {
  const checks = await runChecks([
    [
      "broken",
      async () => {
        throw new Error("fixture failure");
      },
    ],
    ["next", async () => "still executed"],
    ["optional", async () => ({ status: "warn", detail: "JDK missing" })],
    ["model", async () => ({ status: "not-tested", detail: "no network request" })],
  ]);
  assert.deepEqual(
    checks.map(({ id, status }) => [id, status]),
    [
      ["broken", "fail"],
      ["next", "pass"],
      ["optional", "warn"],
      ["model", "not-tested"],
    ],
  );
  assert.equal(checks[1].detail, "still executed");
  assert.ok(checks.every(({ durationMs }) => durationMs >= 0));
});

test("developer probes report missing local tools without installing or changing the environment", async () => {
  const folder = await mkdtemp(join(tmpdir(), "developer-missing-"));
  try {
    const env = { PATH: folder, JAVA_HOME: join(folder, "missing-jdk"), MAVEN_HOME: "unchanged" };
    const before = { ...env };
    assert.equal((await probes.probeJavaEnvironment(folder, env)).status, "warn");
    assert.equal((await probes.probeMavenEnvironment(folder, env)).status, "warn");
    assert.deepEqual(env, before);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test(
  "native Maven version probe handles shell metacharacters and cannot run inherited extra goals",
  { skip: process.platform !== "win32" },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "开发 & (x) %UNDEFINED_PROBE% ! "));
    try {
      const bin = join(folder, "bin");
      await mkdir(bin);
      const script = join(bin, "mvn.cmd");
      const fixture =
        '@echo off\r\nif not "%~1"=="--version" exit /b 51\r\nif not "%JAVA_TOOL_OPTIONS%"=="" exit /b 52\r\nif not "%MAVEN_ARGS%"=="" exit /b 53\r\nif not "%MAVEN_SKIP_RC%"=="1" exit /b 54\r\necho Apache Maven 3.9.16\r\necho Java version: 1.8.0_492, vendor: fixture\r\n';
      await writeFile(script, fixture);
      const env = {
        ...process.env,
        PATH: bin,
        Path: undefined,
        MAVEN_ARGS: "deploy -Dpassword=fixture-secret",
        MAVEN_OPTS: "-Dpassword=fixture-secret",
        JAVA_TOOL_OPTIONS: "-javaagent:fixture-secret",
        _JAVA_OPTIONS: "-Dpassword=fixture-secret",
      };
      const before = { ...env };
      const report = await probes.probeMavenEnvironment(folder, env);
      assert.equal(report.status, "pass", report.detail);
      assert.match(report.detail, /Maven 3\.9\.16/);
      assert.ok(report.detail.includes(script));
      assert.doesNotMatch(report.detail, /fixture-secret/);
      assert.deepEqual(env, before);
      await writeFile(script, fixture.replace("1.8.0_492", "17.0.1"));
      assert.equal((await probes.probeMavenEnvironment(folder, env)).status, "warn");
      await writeFile(script, "@echo off\r\necho fixture-secret\r\nexit /b 1\r\n");
      const failed = await probes.probeMavenEnvironment(folder, env);
      assert.equal(failed.status, "warn");
      assert.doesNotMatch(failed.detail, /fixture-secret/);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);

test(
  "native JDK 8 probe compiles UTF-8 source and flags a different PATH Java",
  { skip: process.platform !== "win32" },
  async (t) => {
    const folder = await mkdtemp(join(tmpdir(), "Java 中文 & (x) %PATH% ! "));
    try {
      assert.ok(process.env.JAVA_HOME_8_X64 || process.env.JAVA_HOME, "CI must provide JDK 8");
      const home = join(folder, "jdk8");
      await symlink(process.env.JAVA_HOME_8_X64 || process.env.JAVA_HOME, home, "junction");
      const env = {
        ...process.env,
        JAVA_HOME: home,
        Path: undefined,
        PATH: join(home, "bin"),
        JAVA_TOOL_OPTIONS: "-javaagent:must-not-run",
      };
      const report = await probes.probeJavaEnvironment(folder, env);
      if (report.status !== "pass") {
        // 仅输出固定 CI fixture 的诊断；产品报告不回显实际用户命令输出。
        const diagnosticEnv = { ...env };
        for (const name of Object.keys(diagnosticEnv))
          if (/OPTIONS|OPTS|CLASSPATH/i.test(name)) delete diagnosticEnv[name];
        for (const executable of ["java.exe", "javac.exe"]) {
          try {
            t.diagnostic(
              JSON.stringify(
                await promisify(execFile)(join(home, "bin", executable), ["-version"], {
                  env: diagnosticEnv,
                  cwd: folder,
                  timeout: 15000,
                  encoding: "utf8",
                }),
              ),
            );
          } catch (error) {
            t.diagnostic(
              JSON.stringify({
                executable,
                code: error.code,
                stdout: error.stdout,
                stderr: error.stderr,
              }),
            );
          }
        }
      }
      assert.equal(report.status, "pass", report.detail);
      assert.match(report.detail, /compiled and ran/);
      assert.doesNotMatch(report.detail, /must-not-run/);
      const conflict = { ...env, PATH: `${join(folder, "different")}/bin${delimiter}${env.PATH}` };
      await mkdir(join(folder, "different", "bin"), { recursive: true });
      // 独立存在的 java 候选就应揭示 PATH 与 JAVA_HOME 不同，不能悄悄修正用户环境。
      await writeFile(join(folder, "different", "bin", "java.exe"), "not a Java executable");
      assert.equal((await probes.probeJavaEnvironment(folder, conflict)).status, "warn");
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);
