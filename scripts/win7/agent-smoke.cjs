const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { setTimeout: delay } = require("node:timers/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { createInterface } = require("node:readline");

const app = resolve(process.argv[2]);
const { spawnWindowsRuntimeHost } = require(resolve(process.argv[3]));
process.env.ZCODE_RUNTIME_HOST_PATH = join(
  app,
  "resources/tools/runtime-host/aibuddy7se-runtime-host.exe",
);

(async () => {
  const folder = await mkdtemp(join(tmpdir(), "zcode-win7-agent-"));
  const { configureWin7Environment } = await import("./win7-environment.mjs");
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
  configureWin7Environment(env, folder);
  let runtime;
  let lines;
  let timer;
  try {
    runtime = await spawnWindowsRuntimeHost({
      command: join(app, "aibuddy7se.exe"),
      args: [
        join(app, "resources/glm/aibuddy7se.cjs"),
        "app-server",
        "--stdio",
        "--prepare-storage",
      ],
      cwd: folder,
      env,
      signal: new AbortController().signal,
    });
    runtime.child.stderr.on("data", (data) => process.stderr.write(data));
    await runtime.ready();
    const exited = new Promise((done) => runtime.onRootExit(done));
    lines = createInterface({ input: runtime.child.stdout });
    const prepared = new Promise((done, fail) => {
      timer = setTimeout(() => fail(new Error("Packaged Agent storage startup timed out")), 30000);
      let observed = false;
      lines.on("line", (line) => {
        try {
          const message = JSON.parse(line);
          if (message.method === "startup/storagePath") {
            assert.equal(resolve(message.params.path), env.AIBUDDY7SE_SESSION_DB_PATH);
            observed = true;
            runtime.child.stdin.write(
              JSON.stringify({ method: "startup/storagePathReady" }) + "\n",
            );
          }
          if (message.method === "startup/storageState")
            assert.notEqual(message.params.phase, "failed");
          if (message.method === "startup/storagePrepared") {
            assert.ok(observed);
            done();
          }
        } catch (error) {
          fail(error);
        }
      });
      lines.once("close", () => fail(new Error("Agent exited before storage preparation")));
    });
    await runtime.start();
    await prepared;
    clearTimeout(timer);
    await runtime.close(Date.now() + 5000);
    assert.equal(await exited, 0);
    console.log("PASS packaged Agent stdio, real SQLite migrations, isolated path and Job cleanup");
    lines.close();
    const server = join(folder, "插件宿主 fixture.mjs");
    await writeFile(
      server,
      `import { createInterface } from "node:readline";
export async function main() {
  const args = process.argv.slice(2);
  createInterface({ input: process.stdin }).on("line", (request) => {
    process.stdout.write(JSON.stringify({ request, args, cleanEnv: process.env.NODE_ENV === undefined }) + "\\n");
  });
}`,
    );
    runtime = await spawnWindowsRuntimeHost({
      command: join(app, "aibuddy7se.exe"),
      args: [
        join(app, "resources/glm/plugin-host.cjs"),
        "__aibuddy7se-plugin-host",
        server,
        "中文参数",
      ],
      cwd: folder,
      env: { ...env, NODE_ENV: "untrusted" },
      signal: new AbortController().signal,
    });
    runtime.child.stderr.on("data", (data) => process.stderr.write(data));
    await runtime.ready();
    lines = createInterface({ input: runtime.child.stdout });
    const response = new Promise((done, fail) => {
      timer = setTimeout(() => fail(new Error("Lightweight plugin host stdio timed out")), 15000);
      lines.once("line", done);
      lines.once("close", () => fail(new Error("Plugin host exited before its stdio request")));
    });
    // 立即挂拒绝处理，避免提前退出在 delay 期间成为未处理 rejection。
    response.catch(() => {});
    await runtime.start();
    await delay(2000);
    runtime.child.stdin.write("fixture-ping\n");
    assert.deepEqual(JSON.parse(await response), {
      request: "fixture-ping",
      args: ["中文参数"],
      cleanEnv: true,
    });
    clearTimeout(timer);
    await runtime.close(Date.now() + 5000);
    console.log(
      "PASS packaged lightweight plugin host, Unicode argv, environment sanitation and live stdio after main returns",
    );
  } finally {
    clearTimeout(timer);
    lines?.close();
    if (runtime) await runtime.close(Date.now() + 5000);
    await rm(folder, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
