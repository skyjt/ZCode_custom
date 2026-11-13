import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { brandText } from "./brand-package.mjs";

export async function prepareBrand(root) {
  const out = join(root, "packages/desktop/out");
  await mkdir(out, { recursive: true });
  await build({
    stdin: {
      contents: `
      export { createSystemCredentialCipher as createCipher, createLegacyCredentialCipher } from '@zcode/shared/credential-security';
      export { withFileLock } from '@zcode/shared/node';
      import { SQLITE_MIGRATIONS } from './apps/zcode-cli/packages/adapters/src/storage/session-store/migrations.ts';
      import { DEFAULT_WORKSPACE_CANDIDATES_SQL } from './packages/services/src/project-storage/default-workspace/migration.ts';
      export const migrations = [...SQLITE_MIGRATIONS, {
        id: '0006_default_workspace_tasks',
        sql: DEFAULT_WORKSPACE_CANDIDATES_SQL + '\\n-- v1 clear project ownership and soft-delete the unedited system container; preserve task facts'
      }];
      import { AsyncEntry } from '@napi-rs/keyring';
      export function keyStore(service, account) {
        const entry = new AsyncEntry(service, account);
        return { get: () => entry.getPassword(), set: value => entry.setPassword(value) };
      }
    `,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["@napi-rs/keyring"],
    nodePaths: [join(root, "packages/desktop/node_modules")],
    outfile: join(out, "legacy-data.cjs"),
    logLevel: "warning",
  });
  await copyFile(
    join(root, "scripts/win7/legacy-migration.mjs"),
    join(out, "legacy-migration.mjs"),
  );
  const htmlPath = join(out, "renderer/index.html");
  try {
    let html = await readFile(htmlPath, "utf8");
    if (!html.includes('src="./legacy-storage.js"'))
      html = html.replace("<head>", '<head>\n<script src="./legacy-storage.js"></script>');
    await writeFile(htmlPath, html);
    await copyFile(
      join(root, "scripts/win7/legacy-storage.js"),
      join(out, "renderer/legacy-storage.js"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const directory = join(root, ".cache/win7-brand");
  await mkdir(directory, { recursive: true });
  let installer = brandText(
    await readFile(join(root, "packages/desktop/build/installer.nsh"), "utf8"),
  );
  // 旧安装器的清单和数据目录只用于安全识别，不能因改名绕过防误删检查。
  const anchor = '    IfFileExists "$R9\\.aibuddy7se\\*.*" 0 +2';
  if (!installer.includes(anchor)) throw new Error("Installer data guard anchor missing");
  installer = installer.replace(
    anchor,
    [
      '    IfFileExists "$R9\\.zcode" 0 +2',
      '      StrCpy $R2 "$R9\\.zcode"',
      '    StrCmp $R2 "" 0 aibuddy7seFindNestedDataDirDone',
      anchor,
    ].join("\n"),
  );
  await writeFile(join(directory, "installer.nsh"), installer);
}
