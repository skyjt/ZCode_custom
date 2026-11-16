import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

// Build-time inspection only: known packaged runtimes, no user configuration or remote servers.
export async function buildMcpCatalog(app, { idleTimeoutMs = 120_000 } = {}) {
  const root = join(app, "resources/glm");
  const workspace = await mkdtemp(join(tmpdir(), "aibuddy7se-catalog-rebuild-"));
  const plugins = [];
  try {
    for (const id of ["documents", "spreadsheets", "presentations", "pdf", "node-repl-host"]) {
      const packageRoot = join(root, "packages", id === "node-repl-host" ? id : `${id}-plugin`);
      const entry = id === "node-repl-host" ? "dist/mcp/server.js" : "dist/server.mjs";
      const files = {};
      async function visit(directory) {
        for (const item of await readdir(directory, { withFileTypes: true })) {
          if (item.name === "ui") continue;
          const path = join(directory, item.name);
          assert.ok(!item.isSymbolicLink(), "Catalog runtime must not contain symlinks");
          if (item.isDirectory()) await visit(path);
          else
            files[relative(packageRoot, path).replaceAll("\\", "/")] = createHash("sha256")
              .update(await readFile(path))
              .digest("hex");
        }
      }
      await visit(join(packageRoot, "dist"));
      assert.ok(files[entry]);
      const client = new Client(
        { name: "aibuddy7se-build-catalog", version: "1" },
        {
          versionNegotiation: { mode: id === "node-repl-host" ? { pin: "2026-07-28" } : "legacy" },
        },
      );
      const transport = new StdioClientTransport({
        command: join(app, "aibuddy7se.exe"),
        args: [join(root, "plugin-host.cjs"), "__aibuddy7se-plugin-host", join(packageRoot, entry)],
        cwd: workspace,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", AIBUDDY7SE_WORKSPACE_ROOT: workspace },
        stderr: "pipe",
      });
      try {
        await client.connect(transport, { timeout: 30_000 });
        const { tools } = await client.listTools({}, { timeout: 30_000 });
        assert.ok(tools.length && tools.every((tool) => tool.name && tool.inputSchema));
        let idleResourceUri;
        if (id !== "node-repl-host") {
          const listed = await client.listResources();
          idleResourceUri = listed.resources.find(
            (resource) => resource.name === "runtime-idle",
          )?.uri;
          assert.equal(idleResourceUri, "aibuddy7se://runtime/idle");
          const state = await client.readResource({ uri: idleResourceUri });
          assert.equal(state.contents[0]?.text, '{"safeToStop":true}');
        }
        plugins.push({ id, entry, files, tools, ...(idleResourceUri ? { idleResourceUri } : {}) });
      } finally {
        await client.close();
        await transport.close();
      }
    }
    const catalog = { version: 1, idleTimeoutMs, plugins };
    await writeFile(
      join(root, "builtin-mcp-catalog.json"),
      JSON.stringify(catalog, null, 2) + "\n",
    );
    return catalog;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
