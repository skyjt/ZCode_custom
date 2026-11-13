import { mkdir, readdir, readFile, writeFile, rename, access } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const textExtensions = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".css",
  ".svg",
  ".md",
  ".txt",
  ".yaml",
  ".yml",
  ".toml",
  ".sql",
  ".py",
  ".ps1",
  ".cmd",
  ".bat",
  ".nsh",
  ".xml",
]);
const migrationFiles = new Set(["legacy-data.cjs", "legacy-migration.mjs", "legacy-storage.js"]);
export function brandText(value) {
  return value.replace(/zcode/gi, (match) =>
    match === "ZCODE"
      ? "AIBUDDY7SE"
      : match === "ZCode"
        ? "Aibuddy7se"
        : match === "zCode"
          ? "aiBuddy7se"
          : "aibuddy7se",
  );
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function brandTree(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (
      migrationFiles.has(entry.name) ||
      entry.name === "app.asar" ||
      entry.name === "app.asar.unpacked"
    )
      continue;
    let path = join(root, entry.name);
    const name = brandText(entry.name);
    if (name !== entry.name) {
      const target = join(root, name);
      if (await exists(target)) throw new Error(`Brand path collision: ${target}`);
      await rename(path, target);
      path = target;
    }
    if (entry.isDirectory()) await brandTree(path);
    else if (
      entry.isFile() &&
      (textExtensions.has(extname(name).toLowerCase()) ||
        /^licen[cs]e|notice$/i.test(name) ||
        name.startsWith(".aibuddy7se-"))
    ) {
      const bytes = await readFile(path);
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const branded = brandText(source);
      if (source !== branded) await writeFile(path, branded);
    }
  }
}

export async function auditBrandTree(root, report = { textFiles: 0, migrationFiles: [] }) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (/zcode/i.test(entry.name)) throw new Error(`Legacy package path: ${entry.name}`);
    const path = join(root, entry.name);
    if (migrationFiles.has(entry.name)) {
      report.migrationFiles.push(entry.name);
      continue;
    }
    if (entry.isDirectory()) await auditBrandTree(path, report);
    else if (entry.isFile() && textExtensions.has(extname(entry.name).toLowerCase())) {
      if (/zcode/i.test(await readFile(path, "utf8")))
        throw new Error(`Legacy package content: ${path}`);
      report.textFiles++;
    }
  }
  return report;
}

export async function brandPackagedApplication(context, report) {
  await brandTree(context.appOutDir);
  await auditBrandTree(context.appOutDir, report);
  const evidence = resolve(import.meta.dirname, "../../.cache/win7-acceptance");
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, "brand-audit.json"), JSON.stringify(report, null, 2));
  const paths = [];
  async function list(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await list(path);
      else if (entry.name !== ".aibuddy7se-install-manifest")
        paths.push(relative(context.appOutDir, path).replaceAll("/", "\\"));
    }
  }
  await list(context.appOutDir);
  await writeFile(
    join(context.appOutDir, ".aibuddy7se-install-manifest"),
    paths.sort().join("\r\n") + "\r\n",
  );
}
