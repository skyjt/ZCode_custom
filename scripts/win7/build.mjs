import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { runCommand } from "../spawn-command.mjs";

const root = resolve(import.meta.dirname, "../..");
export const runtime = JSON.parse(
  await readFile(new URL("./runtime.json", import.meta.url), "utf8"),
);

export function verifyRuntimeArchive(bytes) {
  if (createHash("sha256").update(bytes).digest("hex") !== runtime.sha256) {
    throw new Error("Win7 Electron SHA-256 mismatch; refusing to package");
  }
}

export function win7BuildEnv(base = process.env) {
  return {
    ...base,
    ZCODE_ENV: "production",
    ZCODE_PREVIEW_IDENTITY: "1",
    ZCODE_AUTO_UPDATE: "0",
    ZCODE_TARGET_OS: "win32",
    ZCODE_TARGET_ARCH: "x64",
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
    ZCODE_ENABLE_WINDOWS_SIGN: "0",
    ZCODE_DESKTOP_DIST_DIR: "dist/win7",
  };
}

async function build() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Build on Windows x64 (GitHub Actions windows-2022); target is Win7 SP1 x64");
  }
  const env = win7BuildEnv();
  const cache = join(root, ".cache/win7-runtime");
  const archive = join(cache, `electron-${runtime.version}.zip`);
  const dist = join(cache, "electron");
  await mkdir(cache, { recursive: true });
  let bytes;
  try {
    bytes = await readFile(archive);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const response = await fetch(runtime.url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok) throw new Error(`Electron download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  verifyRuntimeArchive(bytes);
  await writeFile(archive, bytes);
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  runCommand("tar", ["-xf", archive, "-C", dist]);
  const version = (await readFile(join(dist, "version"), "utf8")).trim().replace(/^v/, "");
  if (version !== runtime.version)
    throw new Error(`Unexpected extracted Electron version: ${version}`);
  env.ZCODE_WIN7_ELECTRON_DIST = dist;
  const electron = join(dist, "electron.exe");
  runCommand(electron, [join(root, "scripts/win7/runtime-smoke.cjs"), root], {
    cwd: root,
    env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    timeout: 30000,
  });
  runCommand("pnpm", ["--filter", "@zcode/desktop", "build"], { cwd: root, env });
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
  await copyFile(
    join(searchRoot, "bin/rg.exe"),
    join(root, "packages/desktop/bundled-tools/win32-x64/ripgrep/rg.exe"),
  );
  await copyFile(
    join(root, "scripts/win7/bootstrap.mjs"),
    join(root, "packages/desktop/out/win7-bootstrap.mjs"),
  );
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await build();
