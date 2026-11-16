import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  officialPluginHostPrefixArgs,
  writeOfficialPluginRuntimeManifest,
} from "../src/app/official-plugin-runtime.js";

describe("official plugin runtime manifest", () => {
  const cleanups: string[] = [];
  const originalEntrypoint = process.argv[1];

  afterEach(async () => {
    process.argv[1] = originalEntrypoint;
    await Promise.all(cleanups.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  });

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
    expect(manifest.mcpServers.pdf.args.slice(-2)).toEqual([
      join(root, "dist/server.mjs"),
      "--flag",
    ]);
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
