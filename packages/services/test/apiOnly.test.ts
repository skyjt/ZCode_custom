import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createOAuthService } from "../src/oauth/oauthService.js";
import { createCredentialService } from "../src/credential/credentialService.js";
import { getAppConfigDir, setDataBaseDir } from "../src/paths.js";

test("product login stays retired without reading old credentials", async () => {
  const credentials = {
    load: async () => {
      throw new Error("Product credentials must not be read");
    },
    save: async () => {
      throw new Error("Product credentials must not be written");
    },
    delete: async () => {
      throw new Error("Old credentials must not be deleted");
    },
  };
  const oauth = createOAuthService(credentials);
  assert.deepEqual(await oauth.getProviders(), []);
  assert.equal(await oauth.getActiveProvider(), null);
  assert.deepEqual(await oauth.restoreCachedSessionState(), { status: "signed-out" });
  assert.equal(await oauth.restoreSession(), null);
  for (const provider of ["zai", "bigmodel"]) {
    await assert.rejects(oauth.startOAuth(provider), /API/);
    await assert.rejects(oauth.startOAuthWithPolling(provider), /API/);
  }
  assert.equal(await oauth.handleCallback("aibuddy://auth/callback?code=obsolete"), null);
  assert.equal(await oauth.pollPendingOAuth(), null);
  await oauth.logoutAll();
});

test("retired product credentials cannot be restored while API and SSH credentials survive", async () => {
  const home = await mkdtemp(join(tmpdir(), "aibuddy-api-only-"));
  setDataBaseDir(home);
  try {
    const file = join(getAppConfigDir(), "credentials.json");
    await mkdir(getAppConfigDir(), { recursive: true });
    const old = { "oauth:zai:access_token": "obsolete", zcodejwttoken: "obsolete" };
    await writeFile(file, JSON.stringify(old));
    const credentials = createCredentialService({
      cipherProvider: { encrypt: (value) => value, decrypt: (value) => value },
    });
    for (const key of Object.keys(old)) {
      assert.equal(await credentials.load(key), null);
      await assert.rejects(credentials.save(key, "replacement"), /API/);
    }
    for (const key of ["ssh:example", "mcp:oauth:example", "api:example"]) {
      await credentials.save(key, "test-only");
      assert.equal(await credentials.load(key), "test-only");
    }
    const stored = JSON.parse(await readFile(file, "utf8"));
    for (const [key, value] of Object.entries(old)) assert.equal(stored[key], value);
  } finally {
    setDataBaseDir(null);
    await rm(home, { recursive: true, force: true });
  }
});

test("CLI credential readers and writes cannot revive product login", async () => {
  const { createSharedAIbuddyCredentialStore, loadSharedAIbuddyCredentialSync } =
    await import("../../../apps/aibuddy-cli/packages/adapters/src/auth/shared-credentials.js");
  const home = await mkdtemp(join(tmpdir(), "aibuddy-cli-api-only-"));
  const filePath = join(home, "credentials.json");
  const options = { filePath, cipher: { encrypt: (value) => value, decrypt: (value) => value } };
  try {
    const old = {
      "oauth:bigmodel:access_token": "obsolete",
      "account-provider:old:api-key": "obsolete",
    };
    await writeFile(filePath, JSON.stringify(old));
    const credentials = createSharedAIbuddyCredentialStore(options);
    for (const key of Object.keys(old)) {
      assert.equal(await credentials.load(key), null);
      assert.equal(loadSharedAIbuddyCredentialSync(key, options), undefined);
      await assert.rejects(credentials.save(key, "replacement"), /API/);
    }
    assert.deepEqual(
      await credentials.loadMany(Object.keys(old)),
      Object.fromEntries(Object.keys(old).map((key) => [key, null])),
    );
    await assert.rejects(credentials.saveMany({ "oauth:zai:access_token": "replacement" }), /API/);
    await credentials.clearZaiLoginCredentials();
    await credentials.save("ssh:example", "test-only");
    assert.equal(await credentials.load("ssh:example"), "test-only");
    const stored = JSON.parse(await readFile(filePath, "utf8"));
    for (const [key, value] of Object.entries(old)) assert.equal(stored[key], value);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("provider resolution retains direct APIs and hides product accounts", async () => {
  const {
    ProviderConfigResolver,
    ProviderConfigMap,
    ProviderConfig,
    ApiKeyAccessConfig,
    ZhipuAccountAccessConfig,
    ModelConfigRules,
  } = await import("@aibuddy/provider");
  const account = new ProviderConfig({ access: new ZhipuAccountAccessConfig({ entitled: true }) });
  const direct = new ProviderConfig({ access: new ApiKeyAccessConfig({ apiKey: "test-only" }) });
  const resolution = new ProviderConfigResolver().resolve({
    aibuddyBuiltinProviders: new ProviderConfigMap([["old-account", account]]),
    personalProviders: new ProviderConfigMap([
      ["self-hosted", direct],
      ["zai-direct", direct],
      ["personal-account", account],
    ]),
    accountProviders: new ProviderConfigMap([["old-account", account]]),
    aibuddyBuiltinModelRules: new ModelConfigRules(),
    personalModels: new ModelConfigRules(),
  });
  assert.deepEqual(resolution.resolvedProviders.map((provider) => provider.providerId).sort(), [
    "self-hosted",
    "zai-direct",
  ]);
  assert.ok(
    resolution.registryProviders.every(
      (provider) => provider.config.access.type !== "zhipu-account",
    ),
  );
});

test("retired CLI commands are absent from parsing and help", async () => {
  const { parseSlashCommand, formatSlashCommandHelp } =
    await import("../../../apps/aibuddy-cli/packages/cli/src/command-center/slash-commands.js");
  for (const command of ["/login", "/logout"])
    assert.equal(parseSlashCommand(command)?.type, "unknown");
  assert.doesNotMatch(formatSlashCommandHelp(), /\/(login|logout)\b/);
});

test("desktop ignores retired auth callbacks and keeps workspace links", async () => {
  const { isOAuthCallbackUrl, isPaymentCallbackUrl, extractWorkspaceOpenPath } =
    await import("../../desktop/src/main/desktopDeepLinkUrl.js");
  assert.equal(isOAuthCallbackUrl(new URL("aibuddy://oauth/callback?state=old&code=old")), false);
  assert.equal(isPaymentCallbackUrl(new URL("aibuddy://payment/callback")), false);
  assert.equal(
    extractWorkspaceOpenPath(new URL("aibuddy://workspace/open?path=%2Ftmp%2Fexample")),
    "/tmp/example",
  );
});

test("Web auth does not restore browser credentials or process old callbacks", async () => {
  const { WebAuthService } = await import("../../web/src/auth/webAuthService.js");
  const auth = new WebAuthService();
  assert.throws(() => auth.startLogin(), /API/);
  assert.equal(auth.getAIbuddyJwtToken(), null);
  assert.equal(await auth.restoreCachedSession(), null);
  assert.equal(await auth.handleCallback("https://example.invalid/share/callback?code=old"), null);
  await auth.logout();
});

test("API provisioning preserves account files, is idempotent and rolls back failed configuration", async () => {
  const { NodePersonalProviderConfigRepository, encodeProviderConfigFile } =
    await import("@aibuddy/provider-node");
  const { ProviderConfig, ProviderConfigMap, ApiKeyAccessConfig, ModelConfigRules } =
    await import("@aibuddy/provider");
  const { createProviderProvisioningSource } =
    await import("../src/model-provider/providerProvisioningSource.js");
  const { createProviderProvisioningTarget } =
    await import("../src/model-provider/providerProvisioningTarget.js");
  const home = await mkdtemp(join(tmpdir(), "aibuddy-api-provision-"));
  const sourcePath = join(home, "source.json"),
    targetPath = join(home, "target.json"),
    credentialsPath = join(home, "credentials.json");
  const sourceRepository = new NodePersonalProviderConfigRepository({
    filePath: sourcePath,
    pollingIntervalMs: false,
  });
  const targetRepository = new NodePersonalProviderConfigRepository({
    filePath: targetPath,
    pollingIntervalMs: false,
  });
  const unusedAccountPort = new Proxy(
    {},
    {
      get() {
        throw new Error("API provisioning must not access account ports");
      },
    },
  );
  try {
    const oldCredentials = '{"oauth:zai:access_token":"obsolete"}';
    await writeFile(credentialsPath, oldCredentials);
    const configure = (id: string) =>
      sourceRepository.update(() => ({
        providers: new ProviderConfigMap([
          [
            id,
            new ProviderConfig({
              group: "standard-personal",
              access: new ApiKeyAccessConfig({ apiKey: "test-only" }),
            }),
          ],
        ]),
        models: new ModelConfigRules(),
      }));
    await configure("self-hosted");
    const source = createProviderProvisioningSource({
      personalRepository: sourceRepository,
      personalConfigFilePath: sourcePath,
      credentialFilePath: credentialsPath,
      settingService: unusedAccountPort,
    });
    const envelope = await source.read("api-sync-1");
    assert.deepEqual(envelope.credentials, []);
    assert.equal(envelope.accountSettings.providerFamilyDomain, null);
    let failNextRefresh = false;
    const target = createProviderProvisioningTarget({
      personalRepository: targetRepository,
      personalConfigFilePath: targetPath,
      stateFilePath: join(home, "state.json"),
      settingService: unusedAccountPort,
      credentialService: unusedAccountPort,
      accountProviderSource: unusedAccountPort,
      providerRuntime: {
        start: async () => {},
        registryService: {
          refresh: async () => {
            if (failNextRefresh) {
              failNextRefresh = false;
              throw new Error("test refresh failure");
            }
            return { sourceRevisions: { config: "test-revision" } };
          },
        },
      },
    });
    assert.equal((await target.apply(envelope)).status, "applied");
    assert.equal((await target.apply(envelope)).status, "already-applied");
    assert.deepEqual(
      encodeProviderConfigFile(await targetRepository.read()).config,
      envelope.personalConfig,
    );
    await assert.rejects(
      target.apply({
        ...envelope,
        syncId: "retired",
        credentials: [{ scope: "oauth-session", key: "oauth:zai:access_token", value: "obsolete" }],
      }),
      /API/,
    );
    await configure("changed-api");
    failNextRefresh = true;
    const failed = await target.apply(await source.read("api-sync-2"));
    assert.equal(failed.status, "failed");
    assert.equal(failed.rolledBack, true);
    assert.deepEqual(
      encodeProviderConfigFile(await targetRepository.read()).config,
      envelope.personalConfig,
    );
    assert.equal(await readFile(credentialsPath, "utf8"), oldCredentials);
  } finally {
    sourceRepository.dispose();
    targetRepository.dispose();
    await rm(home, { recursive: true, force: true });
  }
});
