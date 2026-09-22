// Run after preparing the host cache: node scripts/officecli-smoke.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { mock } from "node:test";
import {
  OFFICECLI_RELEASE,
  prepareOfficeCliPlugin,
  resolveOfficeCliAsset,
} from "./prepare-officecli.mjs";
import { collectSeaOfficialPluginAssets } from "../apps/aibuddy-cli/packages/cli/scripts/sea-official-plugin-assets.mjs";

const run = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), "aibuddy-officecli-"));
const noNetwork = mock.method(globalThis, "fetch", () => {
  throw new Error("Offline check attempted a download");
});
try {
  for (const platform of ["darwin", "linux", "win32"]) {
    for (const arch of ["x64", "arm64"]) {
      const asset = resolveOfficeCliAsset(platform, arch);
      assert.equal(
        asset.filename,
        `officecli-${platform === "darwin" ? "mac" : platform === "win32" ? "win" : platform}-${arch}${platform === "win32" ? ".exe" : ""}`,
      );
      assert.match(asset.sha256, /^[a-f0-9]{64}$/);
      const stagedPlugin = join(temporary, `${platform}-${arch}`);
      await prepareOfficeCliPlugin({ platform, arch, outputDir: stagedPlugin });
      const binary = platform === "win32" ? "bin/officecli.exe" : "bin/officecli";
      const { manifest } = await collectSeaOfficialPluginAssets({
        root: fileURLToPath(new URL("../apps/aibuddy-cli/", import.meta.url)),
        stagingDirectory: join(temporary, `sea-${platform}-${arch}`),
        target: `${platform === "win32" ? "win" : platform}-${arch}`,
        pluginRoots: { officecli: stagedPlugin },
        requireRuntime: true,
      });
      const files = manifest.plugins.find((plugin) => plugin.name === "officecli").files;
      assert.deepEqual(
        files.filter((file) => file.path.startsWith("bin/")).map((file) => file.path),
        [binary],
      );
      assert.ok(files.some((file) => file.path === "docs/NOTICE"));
    }
  }
  assert.throws(() => resolveOfficeCliAsset("linux", "loong64"), /Unsupported/);
  assert.throws(() => resolveOfficeCliAsset("freebsd", "x64"), /Unsupported/);

  const corruptCache = join(temporary, "cache");
  await mkdir(join(corruptCache, OFFICECLI_RELEASE), { recursive: true });
  await writeFile(
    join(corruptCache, OFFICECLI_RELEASE, resolveOfficeCliAsset().filename),
    "corrupt",
  );
  await assert.rejects(
    prepareOfficeCliPlugin({ cacheDir: corruptCache, outputDir: join(temporary, "bad") }),
    /SHA-256/,
  );
  const pluginRoot = join(temporary, "plugin with spaces");
  await prepareOfficeCliPlugin({ outputDir: pluginRoot });
  const binaryName = process.platform === "win32" ? "officecli.exe" : "officecli";
  assert.deepEqual(await readdir(join(pluginRoot, "bin")), [binaryName]);
  for (const name of ["LICENSE", "NOTICE", "THIRD-PARTY-NOTICES.txt"]) {
    assert.ok((await readFile(join(pluginRoot, "docs", name), "utf8")).length > 100);
  }
  const launcher = join(
    pluginRoot,
    "scripts",
    process.platform === "win32" ? "officecli.cmd" : "officecli.sh",
  );
  async function officecli(args) {
    if (process.platform === "win32") {
      return run("cmd.exe", [
        "/d",
        "/s",
        "/c",
        `""${launcher}" ${args.map((arg) => `"${arg}"`).join(" ")}"`,
      ]);
    }
    return run("/bin/sh", [launcher, ...args], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  }
  assert.equal((await officecli(["--version"])).stdout.trim(), OFFICECLI_RELEASE);
  for (const extension of ["docx", "xlsx", "pptx"]) {
    const file = join(temporary, `sample document.${extension}`);
    await officecli(["create", file]);
    const text = "内网验证 00123";
    if (extension === "docx") {
      await officecli(["add", file, "/body", "--type", "paragraph", "--prop", `text=${text}`]);
    } else if (extension === "xlsx") {
      await officecli(["set", file, "/Sheet1/A1", "--prop", `value=${text}`]);
    } else {
      await officecli(["add", file, "/", "--type", "slide", "--prop", `title=${text}`]);
    }
    assert.ok((await officecli(["view", file, "text"])).stdout.includes(text));
    await officecli(["validate", file]);
  }
  assert.equal(noNetwork.mock.callCount(), 0);
  await rm(join(pluginRoot, "bin", binaryName));
  await assert.rejects(officecli(["--version"]));
  console.log(
    "PASS: platform map, corrupt cache rejection, offline staging, launcher and DOCX/XLSX/PPTX round trips",
  );
} finally {
  mock.restoreAll();
  await rm(temporary, { recursive: true, force: true });
}
