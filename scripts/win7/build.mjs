import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { runCommand } from "../spawn-command.mjs";
import { runRuntimeSmoke } from "./run-runtime-smoke.mjs";
import { prepareOfflineTools } from "./prepare-offline-tools.mjs";
import { prepareBrand } from "./prepare-brand.mjs";

const root = resolve(import.meta.dirname, "../..");
export const runtime = JSON.parse(
  await readFile(new URL("./runtime.json", import.meta.url), "utf8"),
);

export function verifyRuntimeArchive(bytes, expected = runtime.sha256) {
  if (createHash("sha256").update(bytes).digest("hex") !== expected) {
    throw new Error("Win7 archive SHA-256 mismatch; refusing to package");
  }
}

export function win7BuildEnv(base = process.env) {
  return {
    ...base,
    ZCODE_ENV: "production",
    ZCODE_PREVIEW_IDENTITY: "1",
    ZCODE_WIN7_EDITION: "1",
    ZCODE_AUTO_UPDATE: "0",
    ZCODE_ARMS_RUM_ENDPOINT: "",
    ZCODE_TELEMETRY_REPORT_ENDPOINT: "",
    ZCODE_MODEL_TELEMETRY_ENABLED: "false",
    ZCODE_TARGET_OS: "win32",
    ZCODE_TARGET_ARCH: "x64",
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
    ZCODE_ENABLE_WINDOWS_SIGN: "0",
    ZCODE_DESKTOP_DIST_DIR: "dist/win7",
    // CI 的默认 7z 高压缩耗时较长；只降低试验离线包压缩强度，保留全部资源。
    ELECTRON_BUILDER_COMPRESSION_LEVEL: "5",
  };
}

async function extractPinnedZip(metadata, name) {
  const cache = join(root, ".cache/win7-runtime");
  const archive = join(cache, `${name}-${metadata.version}.zip`);
  const dist = join(cache, name);
  await mkdir(cache, { recursive: true });
  let bytes;
  try {
    bytes = await readFile(archive);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const response = await fetch(metadata.url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok) throw new Error(`${name} download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  verifyRuntimeArchive(bytes, metadata.sha256);
  await writeFile(archive, bytes);
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  runCommand("tar", ["-xf", archive, "-C", dist]);
  return dist;
}

async function build() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Build on Windows x64 (GitHub Actions windows-2022); target is Win7 SP1 x64");
  }
  const env = win7BuildEnv();
  await prepareOfflineTools(root, env);
  const dist = await extractPinnedZip(runtime, "electron");
  const version = (await readFile(join(dist, "version"), "utf8")).trim().replace(/^v/, "");
  if (version !== runtime.version)
    throw new Error(`Unexpected extracted Electron version: ${version}`);
  env.ZCODE_WIN7_ELECTRON_DIST = dist;
  const electron = join(dist, "electron.exe");
  runRuntimeSmoke(electron, root, env);
  // 同版本预构建使用了 Win8+ 的 Rust 同步/随机 API；只替换试验版 staging，不改现代资产。
  runCommand(
    "rustup",
    ["toolchain", "install", runtime.ripgrep.rust, "--profile", "minimal", "--no-self-update"],
    { cwd: root, env },
  );
  const searchRoot = join(root, ".cache/win7-ripgrep");
  runCommand(
    "cargo",
    [
      `+${runtime.ripgrep.rust}`,
      "install",
      "ripgrep",
      "--version",
      runtime.ripgrep.version,
      "--locked",
      "--features",
      runtime.ripgrep.features.join(","),
      "--root",
      searchRoot,
    ],
    {
      cwd: root,
      env: { ...env, RUSTFLAGS: "-C target-feature=+crt-static" },
    },
  );
  const keyring = runtime.keyring;
  const keyringRoot = join(
    await extractPinnedZip(keyring, "keyring"),
    `keyring-node-${keyring.sourceCommit}`,
  );
  runCommand(
    "rustup",
    [
      "toolchain",
      "install",
      keyring.rust,
      "--profile",
      "minimal",
      "--component",
      "rust-src",
      "--no-self-update",
    ],
    { cwd: root, env },
  );
  runCommand(
    "cargo",
    [
      `+${keyring.rust}`,
      "build",
      "--locked",
      "--release",
      "--target",
      keyring.target,
      "-Z",
      "build-std",
    ],
    {
      cwd: keyringRoot,
      env: { ...env, RUSTFLAGS: "-C target-feature=+crt-static" },
    },
  );
  const binding = join(
    root,
    "node_modules/@napi-rs/keyring-win32-x64-msvc/keyring.win32-x64-msvc.node",
  );
  const original = await readFile(binding);
  try {
    await copyFile(
      join(keyringRoot, "target", keyring.target, "release/napi_keyring.dll"),
      binding,
    );
    // Agent staging 会复制凭据绑定，必须在桌面构建前替换，避免只修好主进程。
    runCommand("pnpm", ["--filter", "@zcode/desktop", "build"], { cwd: root, env });
    await copyFile(
      join(searchRoot, "bin/rg.exe"),
      join(root, "packages/desktop/bundled-tools/win32-x64/ripgrep/rg.exe"),
    );
    await copyFile(
      join(root, "scripts/win7/bootstrap.mjs"),
      join(root, "packages/desktop/out/win7-bootstrap.mjs"),
    );
    await copyFile(
      join(root, "scripts/win7/win7-environment.mjs"),
      join(root, "packages/desktop/out/win7-environment.mjs"),
    );
    await prepareBrand(root);
    runCommand(
      "pnpm",
      [
        "exec",
        "electron-builder",
        "--config",
        join(root, "scripts/win7/electron-builder.config.mjs"),
        "--win",
        "--x64",
        "--publish",
        "never",
      ],
      { cwd: join(root, "packages/desktop"), env },
    );
  } finally {
    await writeFile(binding, original);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await build();
