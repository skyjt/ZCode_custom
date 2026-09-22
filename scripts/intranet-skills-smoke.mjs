// Run with: node --import tsx scripts/intranet-skills-smoke.mjs [--staged-root <glm>]
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { mock } from "node:test";
import { fileURLToPath } from "node:url";
import { collectSeaOfficialPluginAssets } from "../apps/aibuddy-cli/packages/cli/scripts/sea-official-plugin-assets.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliRoot = join(repoRoot, "apps/aibuddy-cli");
const stagedIndex = process.argv.indexOf("--staged-root");
const seedRoot = stagedIndex < 0 ? cliRoot : resolve(process.argv[stagedIndex + 1]);
const pluginName = "intranet-skills";
const marketplace = "zcode-plugins-official";
const pluginId = `${pluginName}@${marketplace}`;
const expectedNames = [
  "intranet-code-review",
  "intranet-data-check",
  "intranet-log-triage",
  "intranet-sql-review",
  "intranet-tech-docs",
  "uos-linux-diagnostics",
].sort();
const temporary = await mkdtemp(join(tmpdir(), "aibuddy-intranet-skills-"));
const originalEntry = process.argv[1];
const networkAttempts = [];
function rejectNetwork() {
  networkAttempts.push(true);
  throw new Error("This check must work offline");
}
mock.method(globalThis, "fetch", rejectNetwork);
mock.method(http, "request", rejectNetwork);
mock.method(https, "request", rejectNetwork);

try {
  const {
    getAIbuddyPluginsOverview,
    installAIbuddyMarketplacePlugin,
    listAIbuddyPlugins,
    setAIbuddyPluginEnabled,
    uninstallAIbuddyMarketplacePlugin,
  } = await import("../apps/aibuddy-cli/packages/bootstrap/src/index.ts");
  const { createNodeSkillAdapter } =
    await import("../apps/aibuddy-cli/packages/adapters/src/skills/index.ts");
  const { DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS } =
    await import("../packages/shared/src/plugin-marketplaces.ts");
  // 模拟安装后的入口目录，工作区与配置均隔离，防止读取开发者已安装插件掩盖漏打包。
  process.argv[1] = join(seedRoot, "aibuddy.cjs");
  const options = {
    env: {},
    pluginStorageRoot: join(temporary, "plugins"),
    userConfigPath: join(temporary, "config.json"),
    projectConfigPath: join(temporary, "project.json"),
    workingDirectory: temporary,
  };
  let outcome = listAIbuddyPlugins(options);
  const plugin = outcome.plugins.find((item) => item.id === pluginId);
  assert.ok(plugin, "bundled intranet plugin must be discoverable");
  assert.equal(plugin.enabled, true);
  assert.equal(plugin.version, "1.0.0");
  assert.equal(plugin.skillCount, expectedNames.length);
  assert.equal(plugin.commandRootCount, 0);
  assert.deepEqual(plugin.declaredMcpServerNames, []);
  assert.deepEqual(plugin.hookDetails, []);
  assert.ok(DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS.has(pluginId));

  const roots = outcome.skillRoots.filter((root) => root.pluginId === pluginId);
  const request = { roots, workingDirectory: temporary };
  const adapter = createNodeSkillAdapter();
  if (stagedIndex >= 0) {
    const officeId = `officecli@${marketplace}`;
    const office = outcome.plugins.find((item) => item.id === officeId);
    assert.ok(office?.enabled, "staged OfficeCLI must be enabled and discoverable");
    assert.equal(office.version, "1.0.152");
    assert.equal(office.skillCount, 1);
    assert.ok(DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS.has(officeId));
    const loaded = await adapter.loadSkill({
      workingDirectory: temporary,
      roots: outcome.skillRoots.filter((root) => root.pluginId === officeId),
      name: "officecli",
    });
    assert.equal(loaded.truncated, false);
    assert.ok(loaded.content.includes("scripts/officecli.sh"));
  }
  const skills = await adapter.discoverSkills(request);
  assert.deepEqual(skills.diagnostics, []);
  assert.deepEqual(skills.skills.map((skill) => skill.name).sort(), expectedNames);
  for (const skill of skills.skills) {
    assert.equal(skill.safeToAutoLoad, true);
    const loaded = await adapter.loadSkill({ ...request, name: skill.qualifiedName });
    assert.equal(loaded.truncated, false);
    assert.ok(loaded.content.length > 200);
    const source = await readFile(
      join(seedRoot, "packages/intranet-skills-plugin/skills", skill.name, "SKILL.md"),
      "utf8",
    );
    assert.equal(await readFile(skill.path, "utf8"), source);
  }
  const disabledPath = skills.skills[0].path;
  const individual = await createNodeSkillAdapter({ disabledPaths: [disabledPath] }).discoverSkills(
    request,
  );
  assert.equal(individual.skills.length, expectedNames.length - 1);
  assert.ok(individual.skills.every((skill) => skill.path !== disabledPath));

  await setAIbuddyPluginEnabled({ ...options, plugin: pluginId, enabled: false });
  outcome = listAIbuddyPlugins(options);
  assert.equal(outcome.plugins.find((item) => item.id === pluginId).enabled, false);
  assert.ok(outcome.skillRoots.every((root) => root.pluginId !== pluginId));
  await uninstallAIbuddyMarketplacePlugin({ ...options, pluginId });
  assert.ok(listAIbuddyPlugins(options).plugins.every((item) => item.id !== pluginId));
  assert.ok(
    getAIbuddyPluginsOverview(options).restorableBuiltins.some((item) => item.id === pluginId),
  );
  const restored = await installAIbuddyMarketplacePlugin({ ...options, marketplace, pluginName });
  assert.deepEqual(restored.diagnostics, []);
  assert.equal(
    listAIbuddyPlugins(options).plugins.find((item) => item.id === pluginId).enabled,
    true,
  );
  assert.equal(networkAttempts.length, 0);

  const sea = await collectSeaOfficialPluginAssets({
    root: cliRoot,
    stagingDirectory: join(temporary, "sea"),
  });
  const packaged = sea.manifest.plugins.find((item) => item.name === pluginName);
  assert.equal(packaged.version, plugin.version);
  assert.deepEqual(
    packaged.files.map((file) => file.path).sort(),
    [
      ".aibuddy-plugin/plugin.json",
      ...expectedNames.map((name) => `skills/${name}/SKILL.md`),
    ].sort(),
  );
  const incompleteRoot = join(temporary, "incomplete");
  const incompletePlugin = join(incompleteRoot, "packages/intranet-skills-plugin");
  await cp(join(cliRoot, "packages/intranet-skills-plugin"), incompletePlugin, { recursive: true });
  await rm(join(incompletePlugin, "skills", expectedNames[0], "SKILL.md"));
  await assert.rejects(
    collectSeaOfficialPluginAssets({
      root: incompleteRoot,
      stagingDirectory: join(temporary, "bad-sea"),
    }),
    /Missing intranet-skills required seed asset/,
  );
  console.log("PASS: six skills load offline; disable, uninstall, restore and SEA assets verified");
} finally {
  process.argv[1] = originalEntry;
  mock.restoreAll();
  await rm(temporary, { recursive: true, force: true });
}
