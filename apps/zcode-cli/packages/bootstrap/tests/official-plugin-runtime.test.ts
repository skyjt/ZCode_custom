import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  officialPluginHostPrefixArgs,
  resolveTrustedBuiltinMcpCatalog,
  writeOfficialPluginRuntimeManifest,
} from "../src/app/official-plugin-runtime.js";

describe("official plugin runtime manifest", () => {
  const cleanups: string[] = [];
  const originalEntrypoint = process.argv[1];

  afterEach(async () => {
    process.argv[1] = originalEntrypoint;
    await Promise.all(cleanups.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  });

  it.each(["documents", "node-repl-host"])(
    "accepts only a verified %s catalog and detects runtime tampering",
    async (id) => {
      const root = await mkdtemp(join(tmpdir(), "zcode-demand-catalog-"));
      cleanups.push(root);
      process.argv[1] = join(root, "zcode.cjs");
      const target = join(root, "cache", id);
      const relativeEntry = id === "node-repl-host" ? "dist/mcp/server.js" : "dist/server.mjs";
      const entry = join(target, relativeEntry);
      await writeJson(join(target, ".zcode-plugin/plugin.json"), { name: id });
      await writeJson(entry, { fixture: true });
      const digest = createHash("sha256")
        .update(await readFile(entry))
        .digest("hex");
      const catalog = {
        version: 1,
        idleTimeoutMs: 120_000,
        plugins: [
          {
            id,
            entry: relativeEntry,
            files: { [relativeEntry]: digest },
            tools: [{ name: "read_document", inputSchema: { type: "object" } }],
            idleResourceUri: "zcode://runtime/idle",
          },
        ],
      };
      await writeJson(join(root, "builtin-mcp-catalog.json"), catalog);
      const config = {
        type: "stdio" as const,
        command: process.execPath,
        args: [...officialPluginHostPrefixArgs()!, entry],
        source: { kind: "builtin" as const },
      };
      expect(await resolveTrustedBuiltinMcpCatalog("documents", config)).toEqual({
        tools: catalog.plugins[0].tools,
        idleTimeoutMs: 120_000,
        idleResourceUri: "zcode://runtime/idle",
      });
      expect(
        await resolveTrustedBuiltinMcpCatalog("third-party", {
          ...config,
          source: { kind: "user" },
        }),
      ).toBeUndefined();
      expect(
        await resolveTrustedBuiltinMcpCatalog("extra-argv", {
          ...config,
          args: [...config.args, "--flag"],
        }),
      ).toBeUndefined();
      const mixedEntry = target + "/" + relativeEntry;
      expect(
        await resolveTrustedBuiltinMcpCatalog("mixed-entry", {
          ...config,
          args: [...officialPluginHostPrefixArgs()!, mixedEntry],
        }),
      ).toEqual({
        tools: catalog.plugins[0].tools,
        idleTimeoutMs: 120_000,
        idleResourceUri: "zcode://runtime/idle",
      });
      expect(
        await resolveTrustedBuiltinMcpCatalog("relative-entry", {
          ...config,
          args: [...officialPluginHostPrefixArgs()!, "dist/server.mjs"],
        }),
      ).toBeUndefined();
      await writeFile(entry, "changed runtime");
      await expect(resolveTrustedBuiltinMcpCatalog("documents", config)).rejects.toThrow(
        "integrity",
      );
    },
  );

  it("uses the adjacent lightweight host and retains the standalone CLI fallback", async () => {
    const root = await mkdtemp(join(tmpdir(), "zcode-plugin-host-"));
    cleanups.push(root);
    process.argv[1] = join(root, "zcode.cjs");
    expect(officialPluginHostPrefixArgs()?.slice(-2)).toEqual([
      process.argv[1],
      "__zcode-plugin-host",
    ]);
    await writeFile(join(root, "plugin-host.cjs"), "// bundled fixture");
    expect(officialPluginHostPrefixArgs()?.slice(-2)).toEqual([
      join(root, "plugin-host.cjs"),
      "__zcode-plugin-host",
    ]);
    await rm(join(root, "plugin-host.cjs"));
    expect(officialPluginHostPrefixArgs()?.slice(-2)).toEqual([
      process.argv[1],
      "__zcode-plugin-host",
    ]);
  });

  it("does not rewrite an unchanged runtime manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "zcode-plugin-runtime-manifest-"));
    cleanups.push(root);
    const manifestPath = join(root, ".zcode-plugin", "plugin.json");
    await writeJson(manifestPath, {
      mcpServers: {
        "browser-use": {
          args: [],
          command: "old-node",
        },
      },
      name: "browser-use",
    });
    process.argv[1] = join(root, "zcode.cjs");

    await writeOfficialPluginRuntimeManifest({
      pluginName: "browser-use",
      rootPath: root,
    });
    const expectedContents = await readFile(manifestPath, "utf8");
    const firstStat = await stat(manifestPath);
    await delay(30);

    await writeOfficialPluginRuntimeManifest({
      pluginName: "browser-use",
      rootPath: root,
    });
    const secondStat = await stat(manifestPath);

    expect(await readFile(manifestPath, "utf8")).toBe(expectedContents);
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
  });

  it("repairs cached entries from the seed and leaves HTTP servers untouched", async () => {
    const root = await mkdtemp(join(tmpdir(), "zcode-plugin-entry-"));
    cleanups.push(root);
    const manifestPath = join(root, ".zcode-plugin", "plugin.json");
    await writeJson(manifestPath, { mcpServers: { pdf: { command: "node", args: ["wrong.js"] } } });
    process.argv[1] = join(root, "zcode.cjs");
    const remote = { type: "http", url: "https://example.com/mcp" };
    const sourceManifestContents = JSON.stringify({
      mcpServers: {
        pdf: { command: "node", args: ["${ZCODE_PLUGIN_ROOT}/dist/server.mjs", "--flag"] },
        search: remote,
      },
    });
    const input = { pluginName: "pdf", rootPath: root, sourceManifestContents };
    await writeOfficialPluginRuntimeManifest(input);
    const contents = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(contents);
    // manifest 占位符替换保留输入的 /，Windows 接受混合分隔符；检查路径身份和原始额外参数。
    expect(normalize(manifest.mcpServers.pdf.args.at(-2))).toBe(join(root, "dist/server.mjs"));
    expect(manifest.mcpServers.pdf.args.at(-1)).toBe("--flag");
    expect(manifest.mcpServers.pdf.env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(manifest.mcpServers.search).toEqual(remote);
    await writeOfficialPluginRuntimeManifest(input);
    expect(await readFile(manifestPath, "utf8")).toBe(contents);
  });

  it("keeps invalid mcpServers structural errors fatal", async () => {
    const root = await mkdtemp(join(tmpdir(), "zcode-plugin-runtime-invalid-"));
    cleanups.push(root);
    await writeJson(join(root, ".zcode-plugin", "plugin.json"), {
      mcpServers: "invalid",
      name: "browser-use",
    });
    process.argv[1] = join(root, "zcode.cjs");

    await expect(
      (async () =>
        await writeOfficialPluginRuntimeManifest({
          pluginName: "browser-use",
          rootPath: root,
        }))(),
    ).rejects.toThrow("Official plugin manifest has invalid mcpServers.");
  });
});

async function writeJson(path: string, value: unknown): Promise<void> {
  await import("node:fs/promises").then(({ mkdir }) => mkdir(dirname(path), { recursive: true }));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
