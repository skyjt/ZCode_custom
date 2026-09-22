const assert = require("node:assert/strict");
const { mkdtemp, mkdir, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { _electron } = require("playwright-core");

(async () => {
  const [platform, requestedArch] = process.argv.slice(2);
  const arch = requestedArch || process.arch;
  const output = resolve(process.env.AIBUDDY_SMOKE_OUTPUT || "release");
  const home = await mkdtemp(join(tmpdir(), "aibuddy-release-smoke-"));
  const executablePath =
    process.env.AIBUDDY_SMOKE_EXECUTABLE ||
    resolve(
      "packages/desktop/dist",
      platform === "mac"
        ? `${arch === "arm64" ? "mac-arm64" : "mac"}/AIbuddy.app/Contents/MacOS/AIbuddy`
        : "win-unpacked/AIbuddy.exe",
    );
  const env = {
    ...process.env,
    HOME: home,
    AIBUDDY_DATA_BASE_DIR: home,
    AIBUDDY_DESKTOP_HOME_DIR: home,
    AIBUDDY_DESKTOP_USER_DATA_DIR: join(home, "user-data"),
    AIBUDDY_DESKTOP_SESSION_DATA_DIR: join(home, "session"),
    AIBUDDY_DISABLE_FIXED_REMOTE_DEBUGGING_PORT: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  await mkdir(output, { recursive: true });
  let application;
  let logs = "";
  try {
    application = await _electron.launch({
      executablePath,
      args: platform === "linux" ? ["--no-sandbox", "--disable-gpu"] : [],
      cwd: home,
      env,
      timeout: 90_000,
    });
    application.process().stderr.on("data", (chunk) => {
      logs = (logs + chunk).slice(-1_000_000);
    });
    const page = await application.firstWindow();
    await page.locator("[data-v4-draft-greeting]").waitFor({ state: "visible", timeout: 90_000 });
    const logo = page.locator('img[src*="aibuddy-icon"]');
    await logo.first().evaluate((image) => image.decode());
    const runtime = await application.evaluate(async ({ app }) => {
      const { createRequire } = process.getBuiltinModule("node:module");
      const appRequire = createRequire(app.getAppPath() + "/package.json");
      const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
      const db = new DatabaseSync(":memory:");
      const sqlite = db.prepare("SELECT 1 AS value").get().value;
      db.close();
      const pty = appRequire("node-pty");
      const terminal = await new Promise((resolveTerminal, reject) => {
        const win = process.platform === "win32";
        const child = pty.spawn(
          win ? process.env.ComSpec || "cmd.exe" : "/bin/sh",
          win ? ["/d", "/c", "echo AIBUDDY_PTY_OK"] : ["-c", "printf AIBUDDY_PTY_OK"],
          { cwd: app.getPath("home"), env: process.env },
        );
        let text = "";
        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error("PTY smoke timed out"));
        }, 10_000);
        child.onData((chunk) => {
          text += chunk;
        });
        child.onExit(({ exitCode }) => {
          clearTimeout(timeout);
          if (exitCode === 0 && text.includes("AIBUDDY_PTY_OK")) resolveTerminal(true);
          else reject(new Error(`PTY failed (${exitCode}): ${text}`));
        });
      });
      const { join: joinPath } = process.getBuiltinModule("node:path");
      const run = process
        .getBuiltinModule("node:util")
        .promisify(process.getBuiltinModule("node:child_process").execFile);
      const win = process.platform === "win32";
      const launcher = joinPath(
        process.resourcesPath,
        "glm",
        "packages",
        "officecli-plugin",
        "scripts",
        win ? "officecli.cmd" : "officecli.sh",
      );
      const officecli = (args) =>
        run(
          win ? process.env.ComSpec || "cmd.exe" : "/bin/sh",
          win
            ? ["/d", "/s", "/c", `""${launcher}" ${args.map((arg) => `"${arg}"`).join(" ")}"`]
            : [launcher, ...args],
          { timeout: 30_000, maxBuffer: 1024 * 1024, windowsVerbatimArguments: win },
        );
      const officeVersion = (await officecli(["--version"])).stdout.trim();
      const officeFormats = [];
      for (const extension of ["docx", "xlsx", "pptx"]) {
        const file = joinPath(app.getPath("home"), `内网验证 sample.${extension}`);
        const text = "内网验证 00123";
        await officecli(["create", file]);
        const edit =
          extension === "docx"
            ? ["add", file, "/body", "--type", "paragraph", "--prop", `text=${text}`]
            : extension === "xlsx"
              ? ["set", file, "/Sheet1/A1", "--prop", `value=${text}`]
              : ["add", file, "/", "--type", "slide", "--prop", `title=${text}`];
        await officecli(edit);
        if (!(await officecli(["view", file, "text"])).stdout.includes(text)) {
          throw new Error(`OfficeCLI ${extension} round trip failed`);
        }
        await officecli(["validate", file]);
        officeFormats.push(extension);
      }
      return {
        name: app.getName(),
        version: app.getVersion(),
        packaged: app.isPackaged,
        arch: process.arch,
        node: process.versions.node,
        sqlite,
        terminal,
        officeVersion,
        officeFormats,
      };
    });
    assert.equal(runtime.name, "AIbuddy");
    assert.equal(runtime.version, require("../../package.json").version);
    assert.equal(runtime.packaged, true);
    assert.equal(runtime.arch, arch);
    assert.equal(runtime.sqlite, 1);
    assert.equal(runtime.terminal, true);
    const { OFFICECLI_RELEASE } = await import("../prepare-officecli.mjs");
    assert.equal(runtime.officeVersion, OFFICECLI_RELEASE);
    assert.deepEqual(runtime.officeFormats, ["docx", "xlsx", "pptx"]);
    await page.screenshot({ path: join(output, `smoke-${platform}-${arch}.png`) });
    await writeFile(
      join(output, `smoke-${platform}-${arch}.json`),
      JSON.stringify(runtime, null, 2),
    );
    console.log(`Packaged runtime passed: ${JSON.stringify(runtime)}`);
  } finally {
    await application?.close();
    await writeFile(join(output, `smoke-${platform}-${arch}.log`), logs);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
