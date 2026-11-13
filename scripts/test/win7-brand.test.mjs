import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { prepareBrand } from "../win7/prepare-brand.mjs";
import { brandText, brandTree } from "../win7/brand-package.mjs";
import {
  migrateWin7Data,
  migrateDatabase,
  withLegacyInstanceLock,
  migrateLegacyEnvironment,
} from "../win7/legacy-migration.mjs";

const root = join(import.meta.dirname, "../..");
await prepareBrand(root);
const helpers = createRequire(import.meta.url)(join(root, "packages/desktop/out/legacy-data.cjs"));
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("custom roots, task path keys and user documents migrate without rewriting user content", async () => {
  const directory = await mkdtemp(join(tmpdir(), "brand-custom-"));
  try {
    const oldHome = join(directory, ".zcode-win7-home"),
      custom = join(directory, "custom");
    const oldRoot = join(custom, ".zcode"),
      newRoot = join(custom, ".aibuddy7se");
    await mkdir(join(oldHome, ".zcode/v2"), { recursive: true });
    await mkdir(join(oldRoot, "workspace/default"), { recursive: true });
    await writeFile(
      join(oldHome, ".zcode/v2/setting.json"),
      JSON.stringify({ dataBaseDir: custom }),
    );
    const document = '{ "zcode": "ZCode 用户内容", "modelId": "zcode-user-model" }';
    await writeFile(join(oldRoot, "workspace/default/user.json"), document);
    await mkdir(join(oldRoot, "v2"));
    const db = new DatabaseSync(join(oldRoot, "v2/tasks-index.sqlite"));
    db.exec(
      await readFile(
        join(root, "packages/services/src/project-storage/schema.baseline.sql"),
        "utf8",
      ),
    );
    const migration = helpers.migrations.find((m) => m.id === "0006_default_workspace_tasks");
    db.prepare("INSERT INTO schema_migration(id,checksum,applied_at) VALUES(?,?,0)").run(
      migration.id,
      hash(migration.sql.trim()),
    );
    db.prepare(
      "INSERT INTO tasks(workspace_key,workspace_path,task_id,title,created_at,updated_at) VALUES(?,?,?,'ZCode 原文',0,0)",
    ).run(join(oldRoot, "workspace/default"), join(oldRoot, "workspace/default"), "task-1");
    db.close();
    await migrateWin7Data({ userHome: directory, helpers });
    assert.equal(await readFile(join(newRoot, "workspace/default/user.json"), "utf8"), document);
    const migrated = new DatabaseSync(join(newRoot, "v2/tasks-index.sqlite"));
    const task = migrated.prepare("SELECT workspace_key, workspace_path, title FROM tasks").get();
    assert.equal(task.workspace_key, join(newRoot, "workspace/default"));
    assert.equal(task.workspace_path, task.workspace_key);
    assert.equal(task.title, "ZCode 原文");
    assert.equal(
      migrated.prepare("SELECT checksum FROM schema_migration WHERE id=?").get(migration.id)
        .checksum,
      hash(brandText(migration.sql).trim()),
    );
    migrated.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("running old instance blocks migration and environment handoff removes legacy keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "brand-lock-"));
  try {
    await mkdir(join(directory, "ZCode Win7 Experimental"));
    let path = "new-path",
      called = false;
    const app = {
      getPath: () => path,
      setPath: (_key, value) => {
        path = value;
      },
      requestSingleInstanceLock: () => false,
    };
    await assert.rejects(
      withLegacyInstanceLock(app, directory, async () => {
        called = true;
      }),
      /退出旧版/,
    );
    assert.equal(called, false);
    assert.equal(path, "new-path");
    const env = {
      ZCODE_CREDENTIAL_SECRET: "fictional",
      ZCODE_HOME: "old",
      AIBUDDY7SE_HOME: "new",
      HOME: "real",
    };
    migrateLegacyEnvironment(env);
    assert.deepEqual(env, {
      AIBUDDY7SE_CREDENTIAL_SECRET: "fictional",
      AIBUDDY7SE_HOME: "new",
      HOME: "real",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("package branding renames references and paths, preserves binary bytes, rejects collisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "brand-package-"));
  try {
    await mkdir(join(root, "@zcode"));
    await writeFile(join(root, "@zcode/zcode.js"), 'window.zcode; process.env.ZCODE_HOME; "ZCode"');
    const bytes = Buffer.from([0, 255, 90, 67, 111, 100, 101]);
    await writeFile(join(root, "zcode.exe"), bytes);
    await brandTree(root);
    assert.equal(
      await readFile(join(root, "@aibuddy7se/aibuddy7se.js"), "utf8"),
      brandText('window.zcode; process.env.ZCODE_HOME; "ZCode"'),
    );
    assert.deepEqual(await readFile(join(root, "aibuddy7se.exe")), bytes);
    await writeFile(join(root, "zcode.exe"), bytes);
    await assert.rejects(brandTree(root), /collision/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real frozen session schema and migration ledger survive branding; corrupt checksums fail closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "brand-schema-"));
  try {
    const source = join(directory, "old.sqlite"),
      destination = join(directory, "new.sqlite");
    const db = new DatabaseSync(source);
    db.exec(
      await readFile(
        join(
          root,
          "apps/zcode-cli/packages/adapters/src/storage/session-store/schema.baseline.sql",
        ),
        "utf8",
      ),
    );
    for (const migration of helpers.migrations.filter(
      (m) => m.id !== "0006_default_workspace_tasks",
    )) {
      db.prepare("INSERT INTO schema_migration(id,checksum,time_applied) VALUES(?,?,0)").run(
        migration.id,
        hash(migration.sql.trim()),
      );
    }
    db.close();
    await migrateDatabase(source, destination, [], helpers.migrations);
    const result = new DatabaseSync(destination);
    assert.equal(result.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(
      result.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE '%zcode%'").get().n,
      0,
    );
    for (const migration of helpers.migrations.filter(
      (m) => m.id !== "0006_default_workspace_tasks",
    ))
      assert.equal(
        result.prepare("SELECT checksum FROM schema_migration WHERE id=?").get(migration.id)
          .checksum,
        hash(brandText(migration.sql).trim()),
      );
    result.close();
    const bad = new DatabaseSync(source);
    bad
      .prepare("UPDATE schema_migration SET checksum='bad' WHERE id=?")
      .run(helpers.migrations[0].id);
    bad.close();
    await assert.rejects(
      migrateDatabase(source, join(directory, "bad.sqlite"), [], helpers.migrations),
      /Unrecognized migration checksum/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const version of ["v1", "v2"])
  test(`credential ${version} migrates with the real cipher and final path key; missing key preserves source`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "brand-credential-"));
    const old = join(directory, ".zcode-win7-home/.zcode/v2/credentials.json");
    const target = join(directory, ".aibuddy7se-home/.aibuddy7se/v2/credentials.json");
    const keys = new Map();
    const keyStore = (service, account) => ({
      get: async () => keys.get(service + account) ?? null,
      set: async (value) => {
        keys.set(service + account, value);
      },
    });
    const migrationHelpers = { ...helpers, keyStore };
    try {
      await mkdir(join(old, ".."), { recursive: true });
      const cipher =
        version === "v1"
          ? helpers.createLegacyCredentialCipher({})
          : helpers.createCipher({
              filePath: old,
              env: {},
              keyStore: keyStore("ZCode Credential Encryption", hash(old)),
            });
      const encrypted = await cipher.encrypt("fictional-test-key");
      const raw = JSON.stringify({ "zcode:fixture": encrypted });
      await writeFile(old, raw);
      if (version === "v2") {
        const saved = new Map(keys);
        keys.clear();
        await assert.rejects(
          migrateWin7Data({
            userHome: directory,
            helpers: migrationHelpers,
            env: {},
          }),
        );
        await assert.rejects(readFile(target), { code: "ENOENT" });
        for (const [key, value] of saved) keys.set(key, value);
      }
      await migrateWin7Data({
        userHome: directory,
        helpers: migrationHelpers,
        env: {},
      });
      assert.equal(await readFile(old, "utf8"), raw);
      const migrated = JSON.parse(await readFile(target, "utf8"));
      const newCipher = helpers.createCipher({
        filePath: target,
        env: {},
        keyStore: keyStore("Aibuddy7se Credential Encryption", hash(target)),
      });
      assert.match(migrated["aibuddy7se:fixture"], /^enc:v2:os:/);
      assert.equal(await newCipher.decrypt(migrated["aibuddy7se:fixture"]), "fictional-test-key");
      await migrateWin7Data({
        userHome: directory,
        helpers: migrationHelpers,
        env: {},
      });
      assert.equal(await newCipher.decrypt(migrated["aibuddy7se:fixture"]), "fictional-test-key");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

test("old data migrates atomically, preserves user text/identity, and refuses existing destinations", async () => {
  const root = await mkdtemp(join(tmpdir(), "brand-migrate-"));
  const userHome = join(root, "home");
  const appData = join(root, "appdata");
  const old = join(userHome, ".zcode-win7-home/.zcode");
  const target = join(userHome, ".aibuddy7se-home/.aibuddy7se");
  const helpers = {
    migrations: [],
    withFileLock: async (_path, operation) => operation(),
  };
  try {
    await mkdir(join(old, "v2"), { recursive: true });
    await writeFile(
      join(old, "v2/setting.json"),
      JSON.stringify({
        theme: "dark",
        note: "ZCode 用户原文",
        workspaceIdentity: "ssh:ZCode/project",
        workspacePath: "/projects/ZCode",
      }),
    );
    const db = new DatabaseSync(join(old, "session.sqlite"));
    db.exec(
      "CREATE TABLE zcode_database_identity(scope TEXT, identity TEXT); INSERT INTO zcode_database_identity VALUES('session', 'same-id'); CREATE TABLE message(data TEXT)",
    );
    db.prepare("INSERT INTO message VALUES (?)").run(
      JSON.stringify({ text: "ZCode 原文", url: "zcode-artifact://id/file" }),
    );
    db.close();
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "user.txt"), "do not overwrite");
    await assert.rejects(migrateWin7Data({ userHome, appData, helpers }), /already exists/);
    assert.equal(await readFile(join(target, "user.txt"), "utf8"), "do not overwrite");
    await rm(join(userHome, ".aibuddy7se-home"), { recursive: true });
    await migrateWin7Data({ userHome, appData, helpers });
    const settings = JSON.parse(await readFile(join(target, "v2/setting.json"), "utf8"));
    assert.equal(settings.note, "ZCode 用户原文");
    assert.equal(settings.workspaceIdentity, "ssh:ZCode/project");
    assert.equal(settings.workspacePath, "/projects/ZCode");
    const migrated = new DatabaseSync(join(target, "session.sqlite"));
    assert.equal(
      migrated.prepare("SELECT identity FROM aibuddy7se_database_identity").get().identity,
      "same-id",
    );
    assert.deepEqual(JSON.parse(migrated.prepare("SELECT data FROM message").get().data), {
      text: "ZCode 原文",
      url: "aibuddy7se-artifact://id/file",
    });
    migrated.close();
    await writeFile(join(target, "new.txt"), "new data");
    await migrateWin7Data({ userHome, appData, helpers });
    assert.equal(await readFile(join(target, "new.txt"), "utf8"), "new data");
    assert.ok((await readdir(old)).includes("session.sqlite"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
