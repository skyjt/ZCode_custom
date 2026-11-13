// 旧名称仅用于识别和迁移；本模块不参与发布包的品牌文本转换。
import {
  access,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";

const marker = ".aibuddy7se-migration.json";
const brand = (s) =>
  s.replace(/zcode/gi, (m) =>
    m === "ZCODE"
      ? "AIBUDDY7SE"
      : m === "ZCode"
        ? "Aibuddy7se"
        : m === "zCode"
          ? "aiBuddy7se"
          : "aibuddy7se",
  );
const hash = (s) => createHash("sha256").update(s).digest("hex");
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function ownedValue(value, moves, key = "") {
  if (typeof value === "string") {
    if (
      /^(workspace_?identity|title|text|content|prompt|base_?url|identity|id|model|modelId|modelName|name|description|api_?key)$/i.test(
        key,
      )
    )
      return value;
    for (const [from, to] of moves) {
      if (value === from || value.startsWith(from + sep) || value.startsWith(from + "/"))
        return to + value.slice(from.length);
    }
    if (value === "zcode" && /^(provider|agent|type|kind)$/.test(key)) return "aibuddy7se";
    if (
      /^(zcode-artifact:\/\/|zcode:\/\/)/.test(value) ||
      (/^(provider|agent|agentProvider|type|kind|pluginId|configFileKind|engine)$/.test(key) &&
        /^(zcode|@zcode|ZCODE)/.test(value))
    )
      return brand(value);
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => ownedValue(item, moves, key));
  if (value && typeof value === "object") {
    const result = Object.create(null);
    for (const [name, item] of Object.entries(value)) {
      const next = brand(name);
      if (Object.hasOwn(result, next)) throw new Error("Conflicting migrated configuration keys");
      result[next] = ownedValue(item, moves, name);
    }
    return result;
  }
  return value;
}

export async function migrateDatabase(
  source,
  destination,
  moves,
  migrations,
  preserveSchema = false,
) {
  const original = new DatabaseSync(source, { readOnly: true });
  try {
    console.info("[brand-migration] database backup starting");
    await backup(original, destination);
    console.info("[brand-migration] database backup complete");
  } finally {
    original.close();
  }
  // Chromium 数据属于浏览器和网站；不能把其 schema、Cookie 或书签当应用内部标识改写。
  if (preserveSchema) return;
  const db = new DatabaseSync(destination);
  try {
    db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
    const schema = db
      .prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL")
      .all();
    // 触发器与数据一起切换，避免旧 URI 触发器错误清除迁移中的附件引用。
    for (const row of schema.filter((row) => row.type === "trigger"))
      db.exec(`DROP TRIGGER ${quote(row.name)}`);
    for (const row of schema.filter((row) => row.type === "table")) {
      if (row.name.startsWith("sqlite_") || /virtual table/i.test(row.sql)) continue;
      const table = brand(row.name);
      if (table !== row.name) db.exec(`ALTER TABLE ${quote(row.name)} RENAME TO ${quote(table)}`);
      if (table === "schema_migration") {
        for (const migration of migrations) {
          const applied = db
            .prepare("SELECT checksum FROM schema_migration WHERE id=?")
            .get(migration.id);
          if (!applied) continue;
          const before = hash(migration.sql.trim()),
            after = hash(brand(migration.sql).trim());
          if (applied.checksum !== before && applied.checksum !== after)
            throw new Error(`Unrecognized migration checksum: ${migration.id}`);
          db.prepare("UPDATE schema_migration SET checksum=? WHERE id=?").run(after, migration.id);
        }
        continue;
      }
      const columns = db.prepare(`PRAGMA table_info(${quote(table)})`).all();
      const keys = columns
        .filter((column) => column.pk)
        .sort((a, b) => a.pk - b.pk)
        .map((column) => column.name);
      const selection = keys.length ? "*" : "rowid AS __migration_rowid, *";
      const rows = db.prepare(`SELECT ${selection} FROM ${quote(table)}`).all();
      for (const rowData of rows) {
        for (const column of columns) {
          const before = rowData[column.name];
          if (typeof before !== "string") continue;
          let after = before;
          try {
            const parsed = JSON.parse(before),
              next = ownedValue(parsed, moves, column.name);
            if (JSON.stringify(parsed) !== JSON.stringify(next)) after = JSON.stringify(next);
          } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
            after = ownedValue(before, moves, column.name);
          }
          if (after === before) continue;
          const ids = keys.length ? keys : ["__migration_rowid"];
          const where = ids
            .map((id) => `${id === "__migration_rowid" ? "rowid" : quote(id)} IS ?`)
            .join(" AND ");
          db.prepare(`UPDATE ${quote(table)} SET ${quote(column.name)}=? WHERE ${where}`).run(
            after,
            ...ids.map((id) => rowData[id]),
          );
          rowData[column.name] = after;
        }
      }
    }
    for (const row of schema.filter((row) => row.type === "trigger")) db.exec(brand(row.sql));
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw new Error("Migrated database integrity check failed");
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("Migrated database reference check failed");
    db.exec("COMMIT");
  } finally {
    db.close();
  }
}

async function migrateCredentials(source, staged, destination, helpers, env) {
  console.info("[brand-migration] credential migration starting");
  const record = JSON.parse(await readFile(source, "utf8"));
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw new Error("Invalid credential record");
  await copyFile(source, staged);
  const oldPort = helpers.keyStore("ZCode Credential Encryption", hash(resolve(source)));
  let oldKey;
  const oldStore = {
    get: async () => (oldKey = await oldPort.get()),
    set: async (value) => {
      await oldPort.set(value);
      oldKey = value;
    },
  };
  const newStore = helpers.keyStore("Aibuddy7se Credential Encryption", hash(resolve(destination)));
  // 仅在副本上调用 decoder，原容器和 source pin 不被初始化逻辑改写。
  const oldCipher = helpers.createCipher({
    filePath: staged,
    env,
    keyStore: oldStore,
  });
  const values = [];
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string") throw new Error("Invalid credential value");
    values.push([brand(key), await oldCipher.decrypt(value)]);
  }
  if (oldKey) {
    const newKey = await newStore.get();
    if (newKey && newKey !== oldKey)
      throw new Error("Target credential key already exists and differs");
    if (!newKey) await newStore.set(oldKey);
    if ((await newStore.get()) !== oldKey) throw new Error("Credential key verification failed");
  }
  // staging 路径不能参与 OS 寻址；注入最终绝对路径对应的密钥端口。
  const newCipher = helpers.createCipher({
    filePath: staged,
    env,
    keyStore: newStore,
  });
  const result = Object.create(null);
  for (const [key, plain] of values) {
    const encrypted = await newCipher.encrypt(plain);
    if ((await newCipher.decrypt(encrypted)) !== plain)
      throw new Error("Credential verification failed");
    if (Object.hasOwn(result, key)) throw new Error("Conflicting credential names");
    result[key] = encrypted;
  }
  await writeFile(staged, JSON.stringify(result, null, 2) + "\n", {
    mode: 0o600,
  });
  console.info("[brand-migration] credential migration complete");
}

async function copyMigrated(source, stage, destination, options, chromium = false) {
  await mkdir(stage, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  // 先复制来源 pin / secret，避免迁移时生成与旧密文无关的密钥。
  entries.sort(
    (a, b) => Number(a.name === "credentials.json") - Number(b.name === "credentials.json"),
  );
  for (const entry of entries) {
    if (
      entry.name.endsWith("-wal") ||
      entry.name.endsWith("-shm") ||
      entry.name.endsWith(".lock") ||
      entry.name === marker
    )
      continue;
    if (
      chromium &&
      /^(Cache|Code Cache|GPUCache|Dawn.*Cache|Crashpad|Singleton.*)$/.test(entry.name)
    )
      continue;
    if (entry.isSymbolicLink())
      throw new Error("Migration refuses symbolic links; source data preserved");
    let name = /^(\.zcode(?:[-.]|$)|@zcode$|zcode[-.])/.test(entry.name)
      ? brand(entry.name)
      : entry.name;
    if (basename(source) === "sessions") name = options.workspaceHashes.get(name) ?? name;
    const from = join(source, entry.name),
      to = join(stage, name),
      final = join(destination, name);
    if (await exists(to)) throw new Error("Migration path collision");
    if (entry.isDirectory()) {
      if (
        !chromium &&
        /^(workspace|worktrees|artifacts|attachments|backup|snapshots|logs|git-checkpoint-index)$/.test(
          entry.name,
        )
      ) {
        // 用户文件和回滚副本按字节复制；其中的 JSON/SQLite 也不能当产品配置改写。
        await cp(from, to, { recursive: true, verbatimSymlinks: true });
      } else
        await copyMigrated(
          from,
          to,
          final,
          {
            ...options,
            productPlugin:
              options.productPlugin ||
              (/[/\\]plugins[/\\]/.test(from) && /^@?zcode(?:$|[-_.])/.test(entry.name)),
          },
          chromium,
        );
      continue;
    }
    if (!entry.isFile()) throw new Error("Unsupported migration file type");
    // 大型二进制文件只读 magic；不能为判断 SQLite 把附件/浏览器数据整份装进内存。
    const header = Buffer.alloc(16);
    const file = await open(from, "r");
    try {
      await file.read(header, 0, header.length, 0);
    } finally {
      await file.close();
    }
    if (header.toString() === "SQLite format 3\0")
      await migrateDatabase(from, to, options.moves, options.helpers.migrations, chromium);
    else if (entry.name === "credentials.json")
      await migrateCredentials(from, to, final, options.helpers, options.env);
    else if (
      options.productPlugin &&
      [
        ".js",
        ".cjs",
        ".mjs",
        ".json",
        ".md",
        ".yaml",
        ".yml",
        ".toml",
        ".html",
        ".css",
        ".svg",
      ].includes(extname(entry.name))
    ) {
      // 自有命名空间插件的代码引用必须与目录一起切换，否则包名已改、require 仍找旧路径。
      await writeFile(to, brand(await readFile(from, "utf8")), { mode: 0o600 });
    } else if (!chromium && entry.name.endsWith(".json")) {
      let parsed;
      try {
        parsed = JSON.parse(await readFile(from, "utf8"));
      } catch {
        throw new Error(`Invalid JSON during migration: ${entry.name}`);
      }
      await writeFile(to, JSON.stringify(ownedValue(parsed, options.moves), null, 2) + "\n", {
        mode: 0o600,
      });
    } else await copyFile(from, to);
  }
}

export async function migrateWin7Data({
  userHome,
  agentHome = userHome,
  appData,
  helpers,
  env = process.env,
}) {
  env = {
    ...env,
    ZCODE_CREDENTIAL_SECRET: env.AIBUDDY7SE_CREDENTIAL_SECRET ?? env.ZCODE_CREDENTIAL_SECRET,
    ZCODE_CREDENTIAL_SECRET_FILE:
      env.AIBUDDY7SE_CREDENTIAL_SECRET_FILE ?? env.ZCODE_CREDENTIAL_SECRET_FILE,
  };
  const oldHome = join(userHome, ".zcode-win7-home"),
    newHome = join(userHome, ".aibuddy7se-home");
  const plan = [
    [oldHome, newHome],
    [join(agentHome, ".zcode"), join(agentHome, ".aibuddy7se")],
  ];
  const settings = join(oldHome, ".zcode/v2/setting.json");
  if (await exists(settings)) {
    const { dataBaseDir } = JSON.parse(await readFile(settings, "utf8"));
    if (
      typeof dataBaseDir === "string" &&
      dataBaseDir.trim() &&
      resolve(dataBaseDir.trim()) !== resolve(oldHome)
    )
      plan.push([join(dataBaseDir.trim(), ".zcode"), join(dataBaseDir.trim(), ".aibuddy7se")]);
  }
  if (appData)
    plan.push([join(appData, "ZCode Win7 Experimental"), join(appData, "aibuddy7se"), true]);
  const moves = plan.flatMap(([from, to]) => [
    [join(from, ".zcode"), join(to, ".aibuddy7se")],
    [from, to],
  ]);
  // 自定义数据根可能就是 HOME；同一物理目标只发布一次，保留显式配置的路径写法。
  const pathKey = (path) =>
    process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  const uniqueRoots = new Map();
  for (const item of plan) {
    const previous = uniqueRoots.get(pathKey(item[1]));
    if (previous && pathKey(previous[0]) !== pathKey(item[0]))
      throw new Error("Conflicting migration roots");
    uniqueRoots.set(pathKey(item[1]), item);
  }
  const workspaceHashes = new Map(
    moves
      .filter(([from]) => basename(from) === ".zcode")
      .map(([from, to]) => [
        hash(join(from, "workspace/default")).slice(0, 12),
        hash(join(to, "workspace/default")).slice(0, 12),
      ]),
  );
  await helpers.withFileLock(join(userHome, ".aibuddy7se-migration"), async () => {
    const pending = [];
    for (const [source, destination, chromium] of uniqueRoots.values()) {
      if (!(await exists(source))) continue;
      if (await exists(destination)) {
        const completed = join(destination, marker);
        if (
          (await exists(completed)) &&
          JSON.parse(await readFile(completed, "utf8")).source === source
        )
          continue;
        throw new Error(
          `Migration destination already exists; preserved without overwrite: ${destination}`,
        );
      }
      pending.push({ source, destination, chromium });
    }
    const stages = [];
    try {
      for (const item of pending) {
        await mkdir(dirname(item.destination), { recursive: true });
        const stage = await mkdtemp(join(dirname(item.destination), ".aibuddy7se-migrate-"));
        stages.push(stage);
        await copyMigrated(
          item.source,
          stage,
          item.destination,
          { moves, helpers, env, workspaceHashes },
          item.chromium,
        );
        await writeFile(join(stage, marker), JSON.stringify({ version: 1, source: item.source }));
      }
      for (let index = 0; index < pending.length; index++) {
        if (await exists(pending[index].destination))
          throw new Error("Migration destination appeared concurrently");
        await rename(stages[index], pending[index].destination);
      }
    } finally {
      for (const stage of stages) await rm(stage, { recursive: true, force: true });
    }
  });
}

export async function withLegacyInstanceLock(app, appData, operation) {
  const old = join(appData, "ZCode Win7 Experimental");
  if (!(await exists(old))) return operation();
  const current = app.getPath("userData");
  app.setPath("userData", old);
  if (!app.requestSingleInstanceLock()) {
    app.setPath("userData", current);
    throw new Error("请先完全退出旧版应用，再启动 aibuddy7se 迁移数据。");
  }
  try {
    return await operation();
  } finally {
    app.releaseSingleInstanceLock();
    app.setPath("userData", current);
  }
}

export function migrateLegacyEnvironment(env) {
  for (const key of Object.keys(env)) {
    if (!key.startsWith("ZCODE_")) continue;
    const target = key.replace(/^ZCODE_/, "AIBUDDY7SE_");
    if (env[target] === undefined) env[target] = env[key];
    delete env[key];
  }
}
