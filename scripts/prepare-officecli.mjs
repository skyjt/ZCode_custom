import { createHash, randomUUID } from "node:crypto";
import { chmod, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyNativeSearchBinaryTarget } from "./native-search-tools-verify.mjs";
import { readWindowsPeMetadata } from "./native-search-tools-windows-pe.mjs";

export const OFFICECLI_RELEASE = "1.0.152";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginSource = join(repositoryRoot, "apps/aibuddy-cli/packages/officecli-plugin");
// Upstream v1.0.152 Release asset digests, pinned with the vendored skill and notices.
const assets = {
  "darwin-arm64": [
    "officecli-mac-arm64",
    "e2ed6eba5cd46d6800139f2835097828b8ccd7c8c9b679463b50e45ba2f1dbf5",
  ],
  "darwin-x64": [
    "officecli-mac-x64",
    "5071abef56c1d4a4d60e28ed12bc66183d8dc6a9783529c3f1a9cf6bdfe6c2dd",
  ],
  "linux-arm64": [
    "officecli-linux-arm64",
    "bc06deaa0ad931f5208717a40b94018dc44cdff0d8eefa842c4f4daf89fb35a8",
  ],
  "linux-x64": [
    "officecli-linux-x64",
    "e54d3c1d248372365f0634aac56d6f1918bd04d6e71afc792ad50e075f56cfe9",
  ],
  "win32-arm64": [
    "officecli-win-arm64.exe",
    "82408eca64c0f7a79679754162320aae510b26f4cf93933c9304dbd07a379c83",
  ],
  "win32-x64": [
    "officecli-win-x64.exe",
    "047705402974c3690a4437e55f620d03afac4beba4fdd28fdb59af610a3afff2",
  ],
};

export function resolveOfficeCliAsset(platform = process.platform, arch = process.arch) {
  const asset = assets[`${platform}-${arch}`];
  if (!asset) throw new Error(`Unsupported OfficeCLI target: ${platform}-${arch}`);
  return { filename: asset[0], sha256: asset[1] };
}

export async function prepareOfficeCliPlugin({
  platform = process.platform,
  arch = process.arch,
  cacheDir = join(repositoryRoot, ".cache/officecli"),
  outputDir,
} = {}) {
  if (!outputDir) throw new Error("OfficeCLI plugin outputDir is required");
  const asset = resolveOfficeCliAsset(platform, arch);
  const cacheRoot = join(cacheDir, OFFICECLI_RELEASE);
  const cachedBinary = join(cacheRoot, asset.filename);
  let bytes;
  try {
    bytes = await readFile(cachedBinary);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const response = await fetch(
      `https://github.com/iOfficeAI/OfficeCLI/releases/download/v${OFFICECLI_RELEASE}/${asset.filename}`,
      { signal: AbortSignal.timeout(120_000) },
    );
    if (!response.ok) throw new Error(`OfficeCLI download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    assertDigest(bytes, asset);
    await mkdir(cacheRoot, { recursive: true });
    const temporary = `${cachedBinary}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, cachedBinary);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  assertDigest(bytes, asset);
  // OfficeCLI 使用 Windows 自带 UCRT，不能套用搜索工具“全静态 CRT”的额外约束。
  if (platform === "win32") {
    const expectedMachine = arch === "arm64" ? 0xaa64 : 0x8664;
    if (readWindowsPeMetadata(cachedBinary).machine !== expectedMachine) {
      throw new Error(`OfficeCLI PE architecture mismatch: ${asset.filename}`);
    }
  } else {
    verifyNativeSearchBinaryTarget(cachedBinary, { platform, arch });
  }
  await mkdir(outputDir, { recursive: true });
  await cp(pluginSource, outputDir, { recursive: true });
  const binDir = join(outputDir, "bin");
  await rm(binDir, { recursive: true, force: true });
  await mkdir(binDir, { recursive: true });
  const executable = join(binDir, platform === "win32" ? "officecli.exe" : "officecli");
  await writeFile(executable, bytes);
  if (platform !== "win32") await chmod(executable, 0o755);
  await chmod(join(outputDir, "scripts/officecli.sh"), 0o755);
  return outputDir;
}

function assertDigest(bytes, asset) {
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
    throw new Error(
      `OfficeCLI SHA-256 mismatch: ${asset.filename}. Restore the pinned Release asset before packaging.`,
    );
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const [platform = process.platform, arch = process.arch, outputDir] = process.argv.slice(2);
  if (!outputDir)
    throw new Error(
      "Usage: node scripts/prepare-officecli.mjs <platform> <arch> <plugin-output-dir>",
    );
  await prepareOfficeCliPlugin({ platform, arch, outputDir: resolve(outputDir) });
  console.log(`OfficeCLI ${OFFICECLI_RELEASE} prepared for ${platform}-${arch}`);
}
