import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { sampleMemory } from "./memory-profile.mjs";

// 成包/对照包运行同一真实 MCP 流程，不读取用户文档、不调用 Office COM 或外部模型。
const app = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const nodeOnly = process.argv.includes("--node");
const fixtureRoot = resolve(
  import.meta.dirname,
  "../../apps/zcode-cli/packages/office-runtime/fixtures",
);
const reports = [];
await mkdir(output, { recursive: true });
const formats = [
  { plugin: "documents", file: "report.docx", marker: "Quarterly Report" },
  { plugin: "spreadsheets", file: "budget.xlsx", marker: "Revenue" },
  { plugin: "presentations", file: "launch.pptx", marker: "Launch" },
  { plugin: "pdf", file: "paper.pdf", marker: "Research Paper" },
];

async function sample(pid, phase) {
  if (process.platform === "win32") return sampleMemory(null, pid, phase);
  const status = await readFile(`/proc/${pid}/status`, "utf8");
  return {
    phase,
    sampledAt: new Date().toISOString(),
    pid,
    workingSetBytes: Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]) * 1024,
    privateBytes: null,
    scope: "Linux RSS only; not Windows working set or private bytes",
  };
}

for (const { plugin, file, marker } of formats) {
  const workspace = await mkdtemp(join(tmpdir(), "aibuddy7se-office-memory-"));
  const extension = file.slice(file.lastIndexOf("."));
  const source = await readFile(join(fixtureRoot, file));
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const sourceHash = digest(source);
  const filename = `中文 输入${extension}`;
  await writeFile(join(workspace, filename), source);
  await writeFile(join(workspace, `损坏${extension}`), "invalid fixture file");
  for (let i = 0; i < 8; i++)
    await cp(join(workspace, filename), join(workspace, `repeat-${i}${extension}`));
  const pluginRoot = nodeOnly
    ? join(app, "apps/zcode-cli/packages", `${plugin}-plugin`)
    : join(app, "resources/glm/packages", `${plugin}-plugin`);
  const transport = new StdioClientTransport({
    command: nodeOnly ? process.execPath : join(app, "aibuddy7se.exe"),
    args: nodeOnly
      ? [join(pluginRoot, "dist/server.mjs")]
      : [
          join(app, "resources/glm/plugin-host.cjs"),
          "__aibuddy7se-plugin-host",
          join(pluginRoot, "dist/server.mjs"),
        ],
    cwd: workspace,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      ZCODE_WORKSPACE_ROOT: workspace,
      AIBUDDY7SE_WORKSPACE_ROOT: workspace,
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (data) => {
    stderr = (stderr + data).slice(-8000);
  });
  const client = new Client({ name: "office-memory-acceptance", version: "1" });
  const call = (name, args) => client.callTool({ name, arguments: args });
  const ok = async (name, args) => {
    const result = await call(name, args);
    assert.ok(!result.isError, `${plugin}/${name}: ${JSON.stringify(result.content)}`);
    return result;
  };
  try {
    const connectStarted = performance.now();
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.ok(tools.some((tool) => tool.name === "read_document"));
    const discoveryMs = performance.now() - connectStarted;
    const samples = [await sample(transport.pid, `${plugin}-catalog`)];
    let started = performance.now();
    await ok("open_document", { path: filename });
    const firstOpenMs = performance.now() - started;
    started = performance.now();
    const read = await ok("read_document", { anchor: filename });
    const firstReadMs = performance.now() - started;
    assert.ok(
      read.content.some((item) => item.type === "text" && item.text.includes(marker)),
      `${plugin} must parse actual content`,
    );
    samples.push(await sample(transport.pid, `${plugin}-first-read`));
    const repeatReadMs = [];
    for (let i = 0; i < 5; i++) {
      started = performance.now();
      const result = await ok("read_document", { anchor: filename });
      repeatReadMs.push(performance.now() - started);
      assert.deepEqual(result.content, read.content);
    }
    // 超过原 6 项文档缓存，检查轮换使用与原文保留；不靠无限复用同一个缓存项得出增长结论。
    const rotationReads = plugin === "documents" ? 60 : 20;
    const rotationReadMs = [];
    for (let i = 0; i < rotationReads; i++) {
      started = performance.now();
      await ok("read_document", { anchor: `repeat-${i % 8}${extension}` });
      rotationReadMs.push(performance.now() - started);
      if (i === 19 || i === rotationReads - 1)
        samples.push(await sample(transport.pid, `${plugin}-rotated-${i + 1}`));
    }
    const corrupt = await call("open_document", { path: `损坏${extension}` });
    assert.equal(corrupt.isError, true);
    assert.equal(corrupt.structuredContent.error.code, "corrupt_file");
    const escape = await call("open_document", { path: `../outside${extension}` });
    assert.equal(escape.isError, true);
    assert.equal(escape.structuredContent.error.code, "path_outside_workspace");
    assert.equal(digest(await readFile(join(workspace, filename))), sourceHash);
    for (let i = 0; i < 8; i++)
      assert.equal(digest(await readFile(join(workspace, `repeat-${i}${extension}`))), sourceHash);
    await delay(5000);
    samples.push(await sample(transport.pid, `${plugin}-idle-5s`));
    reports.push({
      plugin,
      result: "PASS",
      discoveryMs,
      firstOpenMs,
      firstReadMs,
      repeatReadMs,
      rotationReads,
      rotationReadMs,
      sourceHash,
      originalsUnchanged: true,
      corruptRejected: true,
      escapeRejected: true,
      samples,
    });
    console.log(
      `Office ${plugin}: discovery ${discoveryMs.toFixed(1)}ms; first open ${firstOpenMs.toFixed(1)}ms; first read ${firstReadMs.toFixed(1)}ms; repeat ${repeatReadMs.map((ms) => ms.toFixed(1)).join(",")}ms`,
    );
  } catch (error) {
    await writeFile(join(output, `${plugin}-stderr.txt`), stderr);
    throw error;
  } finally {
    await client.close();
    await rm(workspace, { recursive: true, force: true });
    await writeFile(
      join(output, "office-memory.json"),
      JSON.stringify(
        {
          scope: nodeOnly
            ? "Local Node validation"
            : "Packaged Windows Server 2022; not Office 2013 COM or real Win7",
          reports,
        },
        null,
        2,
      ),
    );
  }
}
