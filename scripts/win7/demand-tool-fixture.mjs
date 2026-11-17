import assert from "node:assert/strict";

export const DEMAND_PATTERN =
  /\bAIBUDDY7SE_DEMAND_(WORD_FIRST|WORD_REPEAT|WORD_REUSE|WORD_OPEN|BROWSER_FIRST|BROWSER_REPEAT|BROWSER_CLOSE)\b/;
export function demandCall(stage, url, names) {
  if (stage.startsWith("WORD_")) {
    const name = names.find(
      (name) =>
        /^mcp__plugin_documents_[a-z_]+__(read_document|open_document)$/.test(name) &&
        name.endsWith(stage === "WORD_OPEN" ? "__open_document" : "__read_document"),
    );
    assert.ok(name, "Real documents tool must be advertised");
    return {
      name,
      arguments: JSON.stringify(
        stage === "WORD_OPEN" ? { path: "demand-fixture.docx" } : { anchor: "demand-fixture.docx" },
      ),
    };
  }
  assert.ok(names.includes("mcp__node_repl__js"), "Real browser host tool must be advertised");
  const bootstrap = `const root = process.env.AIBUDDY7SE_PLUGIN_ROOT ?? process.env.ZCODE_PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT;
if (!root) throw new Error("Browser plugin root unavailable");
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");
const { setupBrowserRuntime } = await import(pathToFileURL(join(root, "scripts", "browser-client.mjs")).href);
await setupBrowserRuntime({ globals: globalThis });
const browser = await agent.browsers.get("iab");
const url = ${JSON.stringify(url)};`;
  const action =
    stage === "BROWSER_FIRST"
      ? `const tab = await browser.tabs.new();
await tab.goto(url);
await tab.playwright.waitForLoadState({state:"domcontentloaded"});
nodeRepl.write(await tab.playwright.domSnapshot());`
      : `const tabs = await browser.tabs.list();
const matches = tabs.filter(t => t.url === url);
if (matches.length !== 1) throw new Error("Expected one owned fixture tab");
const tab = await browser.tabs.get(matches[0].id);
${stage === "BROWSER_CLOSE" ? 'await tab.close(); if ((await browser.tabs.list()).some(t => t.url === url)) throw new Error("Fixture tab remains"); nodeRepl.write("AIBUDDY7SE_BROWSER_CLOSED_OK");' : "nodeRepl.write(await tab.playwright.domSnapshot());"}`;
  return {
    name: "mcp__node_repl__js",
    arguments: JSON.stringify({ code: bootstrap + "\n" + action, title: "检查本机浏览器测试页" }),
  };
}
export function verifyDemandResult(stage, output) {
  assert.doesNotMatch(
    output,
    /permission denied|permission_required|isError["']?\s*:\s*true|tool execution failed/i,
  );
  assert.ok(
    output.includes(
      stage.startsWith("WORD_")
        ? "Quarterly Report"
        : stage === "BROWSER_CLOSE"
          ? "AIBUDDY7SE_BROWSER_CLOSED_OK"
          : "AIBUDDY7SE_BROWSER_PAGE_OK",
    ),
    "Real fixture content or verified closed-tab marker must be returned",
  );
}
