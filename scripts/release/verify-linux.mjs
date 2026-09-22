import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, open, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const run = promisify(execFile);
const baselines = { GLIBC: "2.28", GLIBCXX: "3.4.25", CXXABI: "1.3.11" };

export function findAbiViolations(versionNeeds) {
  const violations = new Set();
  for (const [, family, version] of versionNeeds.matchAll(/\b(GLIBC|GLIBCXX|CXXABI)_([\d.]+)\b/g)) {
    if (version.localeCompare(baselines[family], "en", { numeric: true }) > 0) {
      violations.add(`${family}_${version} exceeds ${baselines[family]}`);
    }
  }
  // DT_RELR 需要新版动态加载器，仅比较数字版 GLIBC 会漏掉这类依赖。
  if (/GLIBC_ABI_DT_RELR|GLIBC_PRIVATE/.test(versionNeeds)) {
    violations.add("Unsupported glibc loader/private ABI");
  }
  return [...violations];
}

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

async function verifyDeb(deb, arch, output) {
  assert.ok(["x64", "arm64"].includes(arch));
  const expectedMachine = arch === "x64" ? 62 : 183;
  const { stdout: architecture } = await run("dpkg-deb", ["--field", deb, "Architecture"]);
  assert.equal(architecture.trim(), arch === "x64" ? "amd64" : "arm64");
  await mkdir(output, { recursive: true });
  await run("dpkg-deb", ["--extract", deb, output]);
  const app = join(output, "opt/AIbuddy");
  await run("pnpm", [
    "exec",
    "asar",
    "extract",
    join(app, "resources/app.asar"),
    join(output, "asar"),
  ]);
  const binaries = [];
  for await (const path of walk(output)) {
    const handle = await open(path, "r");
    const header = Buffer.alloc(20);
    try {
      await handle.read(header, 0, 20, 0);
    } finally {
      await handle.close();
    }
    if (header.toString("hex", 0, 4) !== "7f454c46") continue;
    assert.equal(header[4], 2, `Not ELF64: ${path}`);
    assert.equal(header[5], 1, `Not little-endian ELF: ${path}`);
    assert.equal(header.readUInt16LE(18), expectedMachine, `Foreign architecture: ${path}`);
    const { stdout } = await run("readelf", ["--wide", "--version-info", path], {
      env: { ...process.env, LC_ALL: "C" },
      maxBuffer: 32 * 1024 * 1024,
    });
    const needs = stdout.split("Version needs section")[1] ?? "";
    assert.deepEqual(findAbiViolations(needs), [], `Debian 10 ABI: ${relative(output, path)}`);
    binaries.push({
      path: relative(output, path),
      versions: [...new Set(needs.match(/\b(?:GLIBC|GLIBCXX|CXXABI)_[\d.]+\b/g) ?? [])].sort(),
    });
  }
  assert.ok(binaries.length >= 5, "Expected Electron, native modules and search binaries");
  await writeFile(
    `release/abi-linux-${arch}.json`,
    `${JSON.stringify({ arch, baselines, binaries }, null, 2)}\n`,
  );
  console.log(`Debian 10 ABI verified: ${binaries.length} ELF files (${arch})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [deb, arch, output] = process.argv.slice(2);
  assert.ok(deb && output, "Usage: verify-linux.mjs <deb> <x64|arm64> <temporary-output>");
  await verifyDeb(resolve(deb), arch, resolve(output));
}
