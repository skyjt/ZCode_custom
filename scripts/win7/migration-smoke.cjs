// 使用成包 Electron 与真实 Windows Credential Manager，全部数据为一次性虚构 fixture。
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const { mkdtemp, mkdir, writeFile, readFile, rm } = require("node:fs/promises");
const { join, resolve, dirname } = require("node:path");
const { tmpdir } = require("node:os");
const { DatabaseSync } = require("node:sqlite");

(async () => {
  const archive = join(resolve(process.argv[2]), "resources/app.asar");
  const load = createRequire(join(archive, "package.json"));
  const helpers = load("./out/legacy-data.cjs");
  const { migrateWin7Data } = await import(
    pathToFileURL(join(archive, "out/legacy-migration.mjs"))
  );
  const { AsyncEntry } = load("@napi-rs/keyring");
  const mode = process.argv[4];
  const directory = process.argv[3]
    ? resolve(process.argv[3])
    : await mkdtemp(join(tmpdir(), "aibuddy7se-migration-"));
  const source = join(directory, ".zcode-win7-home/.zcode/v2/credentials.json");
  const target = join(directory, ".aibuddy7se-home/.aibuddy7se/v2/credentials.json");
  const account = (path) => createHash("sha256").update(resolve(path)).digest("hex");
  const entries = [
    ["ZCode Credential Encryption", source],
    ["Aibuddy7se Credential Encryption", target],
  ];
  try {
    if (mode === "cleanup") return;
    await mkdir(dirname(source), { recursive: true });
    const oldCipher = helpers.createCipher({
      filePath: source,
      env: {},
      keyStore: helpers.keyStore(entries[0][0], account(source)),
    });
    const bytes = JSON.stringify({
      "fixture-key": await oldCipher.encrypt("fictional-upgrade-api-key"),
    });
    await writeFile(source, bytes);
    if (mode === "seed") {
      const path = join(directory, ".zcode-win7-home/.zcode/cli/db/db.sqlite");
      await mkdir(dirname(path), { recursive: true });
      const db = new DatabaseSync(path);
      try {
        db.exec(
          await readFile(
            resolve(
              __dirname,
              "../../apps/zcode-cli/packages/adapters/src/storage/session-store/schema.baseline.sql",
            ),
            "utf8",
          ),
        );
        for (const migration of helpers.migrations.filter(
          (item) => item.id !== "0006_default_workspace_tasks",
        )) {
          db.prepare("INSERT INTO schema_migration(id,checksum,time_applied) VALUES(?,?,0)").run(
            migration.id,
            createHash("sha256").update(migration.sql.trim()).digest("hex"),
          );
        }
      } finally {
        db.close();
      }
      console.log("Prepared fictional legacy GUI fixture");
      return;
    }
    await migrateWin7Data({ userHome: directory, helpers, env: {} });
    const cipher = helpers.createCipher({
      filePath: target,
      env: {},
      keyStore: helpers.keyStore(entries[1][0], account(target)),
    });
    assert.equal(
      await cipher.decrypt(JSON.parse(await readFile(target, "utf8"))["fixture-key"]),
      "fictional-upgrade-api-key",
    );
    assert.equal(await readFile(source, "utf8"), bytes);
    await migrateWin7Data({ userHome: directory, helpers, env: {} });
    console.log(
      "PASS packaged migration: real OS key namespaces, absolute-path handoff, original preservation and repeated startup",
    );
  } finally {
    if (mode !== "seed") {
      for (const [service, path] of entries) {
        const entry = new AsyncEntry(service, account(path));
        if ((await entry.getPassword()) !== null) await entry.deleteCredential();
      }
      await rm(directory, { recursive: true, force: true });
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
