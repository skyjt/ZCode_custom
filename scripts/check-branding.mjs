import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveDesktopProductIdentity,
  resolveWindowsAppUserModelId,
} from "../packages/desktop/scripts/desktop-product-identity.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(resolve(root, path), "utf8");
const json = async (path) => JSON.parse(await read(path));

const production = { AIBUDDY_ENV: "production" };
assert.equal(resolveDesktopProductIdentity(production).productName, "AIbuddy");
assert.equal(resolveDesktopProductIdentity(production).appId, "dev.aibuddy.app");
assert.equal(resolveDesktopProductIdentity(production).linuxExecutableName, "aibuddy");
assert.equal(resolveDesktopProductIdentity(production).linuxPackageName, "aibuddy");
assert.equal(resolveWindowsAppUserModelId(production), "dev.aibuddy.app");
assert.equal(
  resolveWindowsAppUserModelId(production, { isPackaged: false }),
  "dev.aibuddy.app.dev",
);
assert.equal(resolveDesktopProductIdentity({ AIBUDDY_ENV: "test" }).productName, "AIbuddy Preview");
assert.equal(
  resolveDesktopProductIdentity({ ...production, AIBUDDY_PREVIEW_IDENTITY: "1" }).appId,
  "dev.aibuddy.app.preview",
);
assert.throws(() =>
  resolveDesktopProductIdentity({ ...production, AIBUDDY_PREVIEW_IDENTITY: "true" }),
);

const processNames = await import("../packages/shared/src/process-names.ts");
assert.equal(processNames.formatAIbuddyHostProcessName("Local"), "aibuddy-host-local");
assert.equal(processNames.formatAIbuddyRendererProcessName("AIbuddy"), "aibuddy-renderer-main");
assert.equal(
  processNames.formatAIbuddyAgentProcessName("cli", "C:\\work\\My App"),
  "aibuddy-agent-cli-my-app",
);
const cli = await import("../apps/aibuddy-cli/packages/cli/src/process-name.ts");
const title = { title: "node" };
cli.setCliProcessTitle(title);
assert.equal(title.title, "aibuddy-cli");
assert.equal(cli.CLI_COMMAND_NAME, "aibuddy");

for (const [path, name] of [
  ["package.json", "aibuddy"],
  ["packages/desktop/package.json", "@aibuddy/desktop"],
  ["packages/shared/package.json", "@aibuddy/shared"],
  ["apps/aibuddy-cli/packages/cli/package.json", "@aibuddy/cli"],
  ["packages/aibuddy-server-cli/package.json", "@aibuddy/server-cli"],
]) {
  assert.equal((await json(path)).name, name, path);
}
assert.equal((await json("packages/desktop/package.json")).productName, "AIbuddy");
assert.equal(
  (await json("apps/aibuddy-cli/packages/cli/package.json")).bin.aibuddy,
  "./dist/aibuddy.cjs",
);
for (const path of ["packages/web/index.html", "packages/desktop/src/renderer/index.html"]) {
  assert.match(await read(path), /<title>AIbuddy<\/title>/, path);
  assert.match(await read(path), /aibuddy-icon\.png/, path);
  assert.doesNotMatch(await read(path), /M134\.4 0\.130152/, path);
}
// 产品位图只有一套，各平台副本和图标尺寸必须一致，防止某个安装入口留在旧品牌。
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
  const source = await readFile(resolve(root, `public/logo/icons/${size}x${size}.png`));
  assert.equal(source.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(source.readUInt32BE(16), size);
  assert.equal(source.readUInt32BE(20), size);
  assert.deepEqual(
    await readFile(resolve(root, `packages/desktop/build/icons/${size}x${size}.png`)),
    source,
  );
}
for (const [sourcePath, copies] of [
  [
    "public/logo/icons/1024x1024.png",
    [
      "public/icon_512@2x.png",
      "packages/desktop/build/icon.png",
      "packages/desktop/build/icon_windows.png",
      "packages/desktop/build/icon_installer.png",
    ],
  ],
  ["public/logo/icons/256x256.png", ["packages/ui/src/assets/aibuddy-icon.png"]],
  [
    "public/logo/icons/icon.ico",
    [
      "packages/desktop/build/icon.ico",
      "packages/desktop/build/icon_installer.ico",
      "packages/web/public/favicon.ico",
    ],
  ],
  [
    "public/logo/icons/icon.icns",
    ["packages/desktop/build/icon.icns", "packages/desktop/build/icon_installer.icns"],
  ],
]) {
  const source = await readFile(resolve(root, sourcePath));
  for (const path of copies) assert.deepEqual(await readFile(resolve(root, path)), source, path);
}
const { createCustomAboutDialogHtml } = await import("../packages/desktop/src/main/aboutWindow.ts");
const ico = await readFile(resolve(root, "public/logo/icons/icon.ico"));
assert.equal(ico.readUInt16LE(2), 1);
const icoSizes = [];
for (let index = 0; index < ico.readUInt16LE(4); index++) {
  const entry = 6 + index * 16;
  const offset = ico.readUInt32LE(entry + 12);
  const length = ico.readUInt32LE(entry + 8);
  assert.ok(offset + length <= ico.length);
  assert.equal(ico.subarray(offset, offset + 8).toString("hex"), "89504e470d0a1a0a");
  icoSizes.push(ico[entry] || 256);
}
assert.deepEqual(icoSizes, [16, 24, 32, 48, 64, 128, 256]);
const iconDataUrl = `data:image/png;base64,${(await readFile(resolve(root, "public/logo/icons/256x256.png"))).toString("base64")}`;
const aboutHtml = createCustomAboutDialogHtml({
  iconDataUrl,
  applicationName: "AIbuddy",
  appVersion: "3.14.0",
  copyright: "AIbuddy",
  optimizationLine: "",
  versionLabel: "Version",
  okButtonLabel: "OK",
});
assert.ok(aboutHtml.includes(`src="${iconDataUrl}"`));
assert.doesNotMatch(aboutHtml, /M134\.4 0\.130152/);
const emptyState = await read("packages/ui/src/v4/ConversationDraftEmptyState.tsx");
assert.match(emptyState, /<AIbuddyAboutLogo/);
assert.doesNotMatch(emptyState, /assets\/Z\.svg|M398\.97/);
const endpoint = await import("../packages/shared/src/aibuddyEndpoint.ts");
assert.equal(endpoint.DEFAULT_AIBUDDY_ENDPOINT_ORIGIN, "https://zcode.z.ai");
assert.equal(
  endpoint.buildAIbuddyEndpointUrls("https://zcode.z.ai").aibuddyPlanAnthropicBaseUrl,
  "https://zcode.z.ai/api/v1/zcode-plan/anthropic",
);
const auth = await import("../packages/shared/src/official-mcp-auth.ts");
assert.equal(auth.OFFICIAL_MCP_AUTH_META_KEY, "com.zcode/official-mcp-auth");
assert.equal(auth.AIBUDDY_OFFICIAL_MCP_AUTH_TYPE, "zcode_official");
const mcp = await import("../packages/shared/src/mcp.ts");
for (const command of ["aibuddy-cua", "zcode-cua", "zcode_cua.server", "zcode-cua@1.0.0"]) {
  assert.equal(mcp.isAIbuddyCuaMcpCommand(command), true, command);
}
assert.equal(mcp.isAIbuddyCuaMcpCommand("zcode-cua-proxy"), false);
const runtimeEnv = await import("../packages/shared/src/runtimeEnv.ts");
for (const prefix of ["AIBUDDY", "ZCODE"]) {
  for (const suffix of [
    "CUA_PERMISSION_BROKER_TOKEN",
    "CUA_PERMISSION_BROKER_SOCKET",
    "CUA_PERMISSION_BROKER_REFRESH_MARKER",
    "CUA_PLUGIN_AUTHORITY",
  ]) {
    const key = `${prefix}_${suffix}`;
    assert.equal(runtimeEnv.shouldSanitizeAIbuddyRuntimeEnvKey(key), true, key);
    assert.equal(runtimeEnv.shouldCaptureAIbuddyToolEnvPassthroughKey(key), false, key);
    assert.deepEqual(runtimeEnv.sanitizeAIbuddyRuntimeEnv({ [key]: "test-only", PATH: "/bin" }), {
      PATH: "/bin",
    });
    assert.deepEqual(
      runtimeEnv.buildAIbuddyToolEnvPassthroughEnv({
        [key]: "test-only",
        AIBUDDY_TOOL_ENV_PASSTHROUGH_JSON: JSON.stringify({ [key]: "test-only" }),
      }),
      {},
      key,
    );
  }
}
const paths = await import("../packages/services/src/paths.ts");
paths.setDataBaseDir(root);
assert.equal(paths.getAIbuddyDataRootDir(), resolve(root, ".aibuddy"));
paths.setDataBaseDir(null);
const cdn = await import("../packages/desktop/src/main/remoteCdn.ts");
assert.deepEqual(cdn.resolveRemoteCdnBaseUrls(), []);
assert.deepEqual(
  cdn.resolveRemoteCdnBaseUrls({
    overrideBaseUrl: "https://downloads.example.com/aibuddy/3.14.0/",
  }),
  ["https://downloads.example.com/aibuddy/3.14.0"],
);
assert.throws(() => cdn.resolveRemoteCdnBaseUrls({ overrideBaseUrl: "file:///tmp/runtime" }));
const { ManifestUpdateProvider } =
  await import("../packages/desktop/src/main/manifestUpdateProvider.ts");
let updateRequests = 0;
const updaterRuntime = {
  platform: "darwin",
  executor: {
    request: async () => {
      updateRequests++;
      return "version: 3.15.0\nfiles: []\n";
    },
  },
};
const upstreamUpdater = new ManifestUpdateProvider({}, {}, updaterRuntime);
await assert.rejects(upstreamUpdater.getLatestVersion(), /Configure an AIbuddy update source/);
assert.equal(updateRequests, 0);
const ownUpdater = new ManifestUpdateProvider(
  { endpointOrigin: "https://downloads.example.com" },
  {},
  updaterRuntime,
);
assert.equal((await ownUpdater.getLatestVersion()).version, "3.15.0");
assert.equal(updateRequests, 1);
const plugins = await import("../apps/aibuddy-cli/packages/adapters/src/plugins/marketplace.ts");
const pluginConfig = await import("../apps/aibuddy-cli/packages/adapters/src/config/schema.ts");
assert.equal(
  pluginConfig.canonicalizePluginId("zcode-cua@zcode-plugins-official"),
  "computer-use@zcode-plugins-official",
);
const pluginMcp = await import("../apps/aibuddy-cli/packages/adapters/src/plugins/mcp.ts");
const diagnostics = [];
const servers = pluginMcp.resolvePluginMcpServers({
  dataPath: "/plugin-data",
  definitions: {
    sample: {
      command: "node",
      args: ["${ZCODE_PLUGIN_ROOT}/server.js", "${AIBUDDY_PLUGIN_DATA}"],
      env: { ZCODE_PLUGIN_ID: "forged", AIBUDDY_PLUGIN_ID: "forged" },
    },
  },
  diagnostics,
  env: {},
  loaded: {
    id: "brand-check@inline",
    manifest: { name: "brand-check", version: "1.0.0" },
    manifestPath: "/plugin/.aibuddy-plugin/plugin.json",
    marketplace: "inline",
    rootPath: "/plugin",
    source: "inline",
  },
  options: {},
  workingDirectory: "/workspace",
});
assert.deepEqual(diagnostics, []);
const pluginServer = servers["plugin:brand-check:sample"];
assert.deepEqual(pluginServer.args, ["/plugin/server.js", "/plugin-data"]);
assert.equal(pluginServer.env.AIBUDDY_PLUGIN_ID, "brand-check@inline");
assert.equal(pluginServer.env.ZCODE_PLUGIN_ID, "brand-check@inline");
const temporaryRoot = await mkdtemp(resolve(tmpdir(), "aibuddy-branding-"));
try {
  for (const format of [".aibuddy-plugin", ".zcode-plugin"]) {
    const pluginRoot = resolve(temporaryRoot, format);
    await mkdir(resolve(pluginRoot, format), { recursive: true });
    await writeFile(
      resolve(pluginRoot, format, "plugin.json"),
      JSON.stringify({ name: "brand-check", version: "1.0.0", description: "Branding check" }),
    );
    const diagnostics = await plugins.validateLocalPluginPath({
      path: pluginRoot,
      storageRoot: temporaryRoot,
    });
    assert.deepEqual(
      diagnostics.filter((item) => item.severity === "error"),
      [],
      format,
    );
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
console.log("AIbuddy branding: identity, processes, packages, pages and upstream contracts OK");
