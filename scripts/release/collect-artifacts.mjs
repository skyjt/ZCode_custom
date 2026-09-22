import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [platform, arch] = process.argv.slice(2);
const extensions = { linux: "deb", win: "exe", mac: "dmg" };
assert.ok(Object.hasOwn(extensions, platform));
assert.ok(["x64", "arm64"].includes(arch));
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const name = `AIbuddy-${version}-${platform}-${arch}.${extensions[platform]}`;
// deb target 使用 Debian 的 amd64 命名；对外发布仍统一为 x64，避免收集阶段找不到成包。
const sourceArch = platform === "linux" && arch === "x64" ? "amd64" : arch;
const source = resolve(
  "packages/desktop/dist",
  `AIbuddy-${version}-${platform}-${sourceArch}.${extensions[platform]}`,
);
assert.ok((await stat(source)).size > 1_000_000, "Installer is unexpectedly small");
await mkdir("release", { recursive: true });
await copyFile(source, resolve("release", name));
const hash = createHash("sha256");
for await (const chunk of createReadStream(source)) hash.update(chunk);
await writeFile(`release/checksums-${platform}-${arch}.txt`, `${hash.digest("hex")}  ${name}\n`);
console.log(`Collected ${name}`);
