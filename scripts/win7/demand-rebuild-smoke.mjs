import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createMcpAdapter } from "../../apps/zcode-cli/packages/adapters/dist/mcp/index.js";

// Local rebuild experiment, not a Windows app benchmark. Build adapters + documents-plugin first.
const root = resolve(import.meta.dirname, "../..");
const entry = resolve(root, "apps/zcode-cli/packages/documents-plugin/dist/server.mjs");
const cwd = resolve(root, "apps/zcode-cli/packages/office-runtime/fixtures");
const output = process.argv[2];
assert.ok(output, "Pass a local JSON output path");
const report = {
  version: "rebuild-local",
  platform: process.platform,
  node: process.version,
  scope: "one real Word MCP child, synthetic fixture; not whole application memory",
  stages: [],
};
const config = {
  type: "stdio",
  command: process.execPath,
  args: [entry],
  cwd,
  env: { ZCODE_WORKSPACE_ROOT: cwd },
  protocolVersion: "2025-11-25",
};
const probe = new Client(
  { name: "local-rebuild-catalog", version: "1" },
  { versionNegotiation: { mode: "legacy" } },
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
  cwd,
  env: { ...process.env, ZCODE_WORKSPACE_ROOT: cwd },
  stderr: "pipe",
});
let catalog;
try {
  await probe.connect(transport);
  catalog = await probe.listTools();
} finally {
  await probe.close();
  await transport.close();
}
let pid;
const pids = [];
const logger = {
  child: () => logger,
  debug() {},
  warn(message, fields) {
    console.error(message, fields);
  },
  error() {},
  info(_message, fields) {
    if (fields?.event === "mcp.server.connected") {
      pid = fields.mcpTransportPid;
      pids.push(pid);
    }
  },
};
const adapter = createMcpAdapter({
  logger,
  workingDirectory: cwd,
  trustedCatalog: async () => ({
    tools: catalog.tools,
    idleTimeoutMs: 30_000,
    idleResourceUri: "zcode://runtime/idle",
  }),
});
function alive(target) {
  if (!target) return false;
  try {
    process.kill(target, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}
async function sample(stage, elapsedMs) {
  const status = (await adapter.status()).office;
  report.stages.push({
    stage,
    pid: pid ?? null,
    processAlive: alive(pid),
    status: status?.status,
    toolCount: status?.toolCount ?? 0,
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
  });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}
async function call(stage, toolName = "read_document", args = { anchor: "report.docx" }) {
  const started = performance.now();
  const result = await adapter.callTool({ serverName: "office", toolName, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result));
  assert.ok(
    JSON.stringify(result).includes("Quarterly Report"),
    "real fixture content must be returned",
  );
  await sample(stage, performance.now() - started);
}
try {
  const snapshot = await adapter.connectConfiguredServers({ office: config });
  assert.ok(snapshot.tools.length > 0);
  assert.equal(pids.length, 0);
  await sample("catalog_ready");
  await call("first_word");
  const firstPid = pid;
  assert.ok(alive(firstPid));
  await call("repeat_word");
  assert.equal(pid, firstPid);
  const deadline = Date.now() + 40_000;
  while ((await adapter.status()).office.status !== "disconnected" && Date.now() < deadline)
    await delay(100);
  assert.equal((await adapter.status()).office.status, "disconnected");
  assert.equal(alive(firstPid), false);
  await sample("after_idle");
  await call("reuse_word");
  assert.notEqual(pid, firstPid);
  await call("open_document", "open_document", { path: "report.docx" });
  await delay(31_000);
  assert.equal((await adapter.status()).office.status, "connected");
  assert.ok(alive(pid));
  await sample("document_protected_after_idle");
} catch (error) {
  report.error = error.stack ?? String(error);
  throw error;
} finally {
  await adapter.close();
  for (const target of pids)
    assert.equal(alive(target), false, "owned child must be gone after close");
  report.closedPids = pids;
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report));
