const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { createInterface } = require("node:readline");

const app = resolve(process.argv[2]);
const { spawnWindowsRuntimeHost } = require(resolve(process.argv[3]));
process.env.ZCODE_RUNTIME_HOST_PATH = join(
  app,
  "resources/tools/runtime-host/zcode-runtime-host.exe",
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
      command: join(app, "ZCode Win7 Experimental.exe"),
      args: [join(app, "resources/glm/zcode.cjs"), "app-server", "--stdio", "--prepare-storage"],
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
            assert.equal(resolve(message.params.path), env.ZCODE_SESSION_DB_PATH);
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
