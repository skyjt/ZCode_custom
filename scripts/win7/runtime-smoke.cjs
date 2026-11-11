// ELECTRON_RUN_AS_NODE=1 electron.exe runtime-smoke.cjs <repo root | resources/app.asar>
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const { tmpdir, release } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

(async () => {
  assert.equal(process.platform, "win32");
  assert.equal(process.arch, "x64");
  assert.equal(process.versions.electron, "44.2.0");
  assert.equal(process.versions.node, "24.20.0");
  const folder = await mkdtemp(join(tmpdir(), "zcode-win7-smoke-"));
  try {
    const file = join(folder, "sqlite-中文.db");
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE sample (value TEXT); BEGIN");
    db.prepare("INSERT INTO sample VALUES (?)").run("中文");
    db.exec("COMMIT; BEGIN; DELETE FROM sample; ROLLBACK");
    db.close();
    const reopened = new DatabaseSync(file);
    assert.equal(reopened.prepare("SELECT value FROM sample").get().value, "中文");
    reopened.close();
    const load = createRequire(join(resolve(process.argv[2]), "package.json"));
    if (process.argv[2].endsWith("app.asar")) {
      for (const requireKeyring of [
        load,
        createRequire(join(dirname(resolve(process.argv[2])), "glm/zcode.cjs")),
      ]) {
        const { AsyncEntry } = requireKeyring("@napi-rs/keyring");
        const entry = new AsyncEntry("ZCode Win7 runtime acceptance", randomUUID());
        try {
          await entry.setPassword("fictional-win7-smoke-value");
          assert.equal(await entry.getPassword(), "fictional-win7-smoke-value");
        } finally {
          await entry.deleteCredential();
        }
        assert.equal(await entry.getPassword(), null);
      }
      console.log("PASS desktop and Agent Windows Credential Manager write/read/delete");
      const tools = join(dirname(resolve(process.argv[2])), "tools");
      await writeFile(join(folder, "搜索.txt"), "中文搜索验证\n");
      const result = execFileSync(
        join(tools, "ripgrep/rg.exe"),
        ["--json", "中文搜索验证", folder],
        { encoding: "utf8" },
      );
      assert.ok(
        result
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .some((item) => item.type === "match"),
      );
      execFileSync(join(tools, "ugrep/ugrep.exe"), ["--version"], { stdio: "inherit" });
      console.log("PASS packaged ripgrep Unicode JSON search and ugrep load");
    }
    const pty = load("node-pty");
    await new Promise((done, fail) => {
      const term = pty.spawn(
        process.env.ComSpec || "cmd.exe",
        ["/d", "/c", "echo ZCODE_WINPTY_OK"],
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
        fail(new Error("WinPTY timed out"));
      }, 10000);
      term.onData((data) => {
        output += data;
      });
      term.onExit(({ exitCode }) => {
        clearTimeout(timer);
        try {
          assert.equal(exitCode, 0);
          assert.match(output, /ZCODE_WINPTY_OK/);
          done();
        } catch (error) {
          fail(error);
        }
      });
      term.resize(100, 30);
    });
    console.log(
      JSON.stringify(
        {
          result: "PASS",
          os: release(),
          versions: process.versions,
          checks: [
            "SQLite transaction/rollback/reopen/Unicode path",
            "WinPTY spawn/output/resize/exit",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
