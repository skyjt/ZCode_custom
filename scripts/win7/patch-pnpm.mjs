import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function patchPnpmInstallSource(source) {
  const before =
    "const nonBuiltHoistedDeps = hoistedLocationsOfDep?.filter((hoistedLocation) => hoistedLocation !== currentHoistedLocation);";
  assert.equal(source.split(before).length, 2, "Unexpected pnpm install source; refusing to patch");
  // 上游 #13646：patch 的 chdir 会影响 worker；在主线程按 lockfileDir 固定绝对目标路径。
  return source.replace(
    before,
    before.slice(0, -1) +
      ".map((hoistedLocation) => path_1.default.join(opts.lockfileDir, hoistedLocation));",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const file = resolve(process.argv[2]);
  const metadata = JSON.parse(await readFile(join(dirname(file), "../package.json"), "utf8"));
  assert.equal(metadata.name, "pnpm");
  assert.equal(metadata.version, "10.33.2", "Remove the CI patch when upgrading pnpm");
  await writeFile(file, patchPnpmInstallSource(await readFile(file, "utf8")));
  console.log("Applied pnpm 10.33.2 upstream absolute hoisted destination fix");
}
