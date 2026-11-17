import assert from "node:assert/strict";
import { test } from "node:test";
import { demandCall, verifyDemandResult } from "../win7/demand-tool-fixture.mjs";
import { execFileSync } from "node:child_process";
import { memoryProcessScript, selectProcessTree } from "../win7/memory-profile.mjs";
import { startMemoryModelFixture, MEMORY_MODEL_REPLY } from "../win7/memory-model-fixture.mjs";

test("local memory model fixture completes stream and refuses unexpected routes", async () => {
  const fixture = await startMemoryModelFixture();
  try {
    const response = await fetch(`${fixture.baseUrl}/chat/completions`, {
      method: "POST",
      body: JSON.stringify({ model: "fictional", stream: true }),
    });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes(MEMORY_MODEL_REPLY));
    assert.ok(body.endsWith("data: [DONE]\n\n"));
    assert.equal((await fetch(`${fixture.baseUrl}/unknown`)).status, 404);
  } finally {
    await fixture.close();
  }
});

for (const stream of [false, true])
  test(`memory fixture verifies actual Bash output (stream=${stream})`, async () => {
    const fixture = await startMemoryModelFixture();
    const messages = [
      { role: "user", content: "AIBUDDY7SE_TOOL_PROBE_1" },
      // 实际 Agent 可在用户输入后追加 user-role reminder；最后一条 user 不一定是用户正文。
      {
        role: "user",
        content: [{ type: "text", text: "<system-reminder>Tools ready</system-reminder>" }],
      },
    ];
    const post = async () => {
      const response = await fetch(`${fixture.baseUrl}/chat/completions`, {
        method: "POST",
        body: JSON.stringify({
          model: "fictional",
          stream,
          messages,
          tools: [{ type: "function", function: { name: "Bash" } }],
        }),
      });
      assert.equal(response.status, 200);
      if (!stream) return (await response.json()).choices[0];
      const body = await response.text();
      assert.ok(body.endsWith("data: [DONE]\n\n"));
      const chunks = body
        .split("\n\n")
        .filter((line) => line.startsWith("data: {"))
        .map((line) => JSON.parse(line.slice(6)).choices[0]);
      return { message: chunks[0].delta, finish_reason: chunks.at(-1).finish_reason };
    };
    try {
      const first = await post();
      assert.equal(first.finish_reason, "tool_calls");
      const call = first.message.tool_calls[0];
      assert.equal(call.function.name, "Bash");
      assert.equal(JSON.parse(call.function.arguments).command, "echo AIBUDDY7SE_TOOL_OUTPUT_1");
      assert.equal(fixture.toolRuns.length, 0);
      messages.push(first.message, {
        role: "tool",
        tool_call_id: call.id,
        content: "Permission denied for echo AIBUDDY7SE_TOOL_OUTPUT_1",
      });
      const denied = await fetch(`${fixture.baseUrl}/chat/completions`, {
        method: "POST",
        body: JSON.stringify({
          model: "fictional",
          stream,
          messages,
          tools: [{ type: "function", function: { name: "Bash" } }],
        }),
      });
      assert.equal(denied.status, 500);
      assert.equal(fixture.toolRuns.length, 0);
      messages.at(-1).content = "AIBUDDY7SE_TOOL_OUTPUT_1";
      messages.push({
        role: "user",
        content: "<system-reminder>Command settled</system-reminder>",
      });
      assert.equal((await post()).message.content, "AIBUDDY7SE_TOOL_DONE_1");
      assert.equal(fixture.toolRuns.length, 1);
      assert.ok(fixture.toolRuns[0].elapsedMs >= 0);
    } finally {
      await fixture.close();
    }
  });

test("memory acceptance counts nested app children without same-name unrelated processes", () => {
  const row = (pid, parentPid, bytes) => ({
    pid,
    parentPid,
    name: "aibuddy7se.exe",
    workingSetBytes: bytes,
    privateBytes: bytes * 2,
  });
  const result = selectProcessTree(
    [row(7, 4, 100), row(99, 1, 10000), row(4, 2, 20), row(2, 1, 30), row(1, 0, 9999)],
    2,
  );
  assert.deepEqual(
    result.processes.map((process) => process.pid),
    [7, 4, 2],
  );
  assert.equal(result.workingSetBytes, 150);
  assert.equal(result.privateBytes, 300);
});

test("memory acceptance rejects an exited root and invalid counters instead of reporting zero", () => {
  assert.throws(() => selectProcessTree([], 123), /exited/);
  assert.throws(() =>
    selectProcessTree([{ pid: 123, workingSetBytes: NaN, privateBytes: 0 }], 123),
  );
});

test("process tree excludes older orphan after parent PID reuse", () => {
  const row = (pid, parentPid, createdAt) => ({
    pid,
    parentPid,
    createdAt,
    workingSetBytes: 10,
    privateBytes: 20,
  });
  const result = selectProcessTree(
    [
      row(1, 0, "2026-11-17T02:00:00Z"),
      row(2, 1, "2026-11-17T01:00:00Z"),
      row(3, 1, "2026-11-17T02:01:00Z"),
    ],
    1,
  );
  assert.deepEqual(
    result.processes.map((row) => row.pid),
    [1, 3],
  );
});

test("demand fixture refuses missing tools, denied outputs and replay", async () => {
  const fixture = await startMemoryModelFixture();
  const tools = [
    { type: "function", function: { name: "mcp__plugin_documents_documents__read_document" } },
  ];
  const messages = [{ role: "user", content: "AIBUDDY7SE_DEMAND_WORD_FIRST" }];
  const post = () =>
    fetch(fixture.baseUrl + "/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "fictional", messages, tools }),
    });
  try {
    assert.match(
      await (await fetch(fixture.baseUrl.replace(/\/v1$/, "/demand-browser"))).text(),
      /AIBUDDY7SE_BROWSER_PAGE_OK/,
    );
    const call = (await (await post()).json()).choices[0].message.tool_calls[0];
    assert.equal(call.function.name, tools[0].function.name);
    assert.deepEqual(JSON.parse(call.function.arguments), { anchor: "demand-fixture.docx" });
    assert.equal((await post()).status, 500);
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: "Permission denied for Quarterly Report",
    });
    assert.equal((await post()).status, 500);
    assert.equal(fixture.demandRuns.length, 0);
    messages.at(-1).content = "Quarterly Report\nRevenue: 100";
    assert.equal(
      (await (await post()).json()).choices[0].message.content,
      "AIBUDDY7SE_DEMAND_DONE_WORD_FIRST",
    );
    assert.equal(fixture.demandRuns.length, 1);
  } finally {
    await fixture.close();
  }
});

test("demand fixture discovers local schemas before using the deferred call bridge", async () => {
  const fixture = await startMemoryModelFixture();
  const name = "mcp__plugin_documents_documents__read_document";
  const tools = ["LocalToolSearch", "DeferredToolCall"].map((name) => ({
    type: "function",
    function: { name },
  }));
  const messages = [
    { role: "user", content: "AIBUDDY7SE_DEMAND_WORD_FIRST" },
    { role: "user", content: "Available deferred tool: " + name },
  ];
  const post = () =>
    fetch(fixture.baseUrl + "/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "fictional", messages, tools }),
    });
  try {
    const search = (await (await post()).json()).choices[0].message.tool_calls[0];
    assert.equal(search.function.name, "LocalToolSearch");
    assert.deepEqual(JSON.parse(search.function.arguments), {
      query: "select:" + name,
      max_results: 1,
    });
    assert.equal(fixture.pendingDemand, null);
    messages.push({
      role: "tool",
      tool_call_id: search.id,
      content:
        "<functions><function>" +
        JSON.stringify({ name, parameters: { type: "object" } }) +
        "</function></functions>",
    });
    const call = (await (await post()).json()).choices[0].message.tool_calls[0];
    assert.equal(call.function.name, "DeferredToolCall");
    assert.deepEqual(JSON.parse(call.function.arguments), {
      name,
      input: { anchor: "demand-fixture.docx" },
    });
    assert.equal(fixture.pendingDemand.tool, name);
    messages.push({ role: "tool", tool_call_id: call.id, content: "Quarterly Report" });
    assert.equal((await post()).status, 200);
    assert.equal(fixture.pendingDemand, null);
  } finally {
    await fixture.close();
  }
});

test("browser reuse requires live page state and refuses denied or missing state", () => {
  const page = "AIBUDDY7SE_BROWSER_PAGE_OK";
  const value = "UNSAVED_SYNTHETIC_DRAFT";
  for (const stage of ["BROWSER_FIRST", "BROWSER_REPEAT", "BROWSER_REUSE"]) {
    assert.throws(() => verifyDemandResult(stage, page), /Live unsubmitted/);
    assert.throws(() => verifyDemandResult(stage, value), /Real fixture/);
    assert.throws(() => verifyDemandResult(stage, `Permission denied ${page} ${value}`));
    assert.doesNotThrow(() => verifyDemandResult(stage, `${page}\n${value}`));
    const call = demandCall(stage, "http://127.0.0.1:1234/demand-browser", ["mcp__node_repl__js"]);
    const args = JSON.parse(call.arguments);
    assert.ok(args.title);
    assert.match(args.code, /playwright.evaluate/);
    if (stage !== "BROWSER_FIRST") {
      assert.doesNotMatch(args.code, /\.fill\(|tabs.new\(/);
      assert.doesNotMatch(args.code, /UNSAVED_SYNTHETIC_DRAFT/);
    }
  }
});

test(
  "Windows sampler maps actual branded plugin cache paths without exposing command lines",
  { skip: process.platform !== "win32" },
  () => {
    const entries = [
      [
        "C:/fixture/cache/aibuddy7se-plugins-official/documents/0.7.0/dist/server.mjs",
        "documents-plugin",
      ],
      [
        "C:/fixture/cache/aibuddy7se-plugins-official/spreadsheets/0.7.0/dist/server.mjs",
        "spreadsheets-plugin",
      ],
      [
        "C:/fixture/cache/aibuddy7se-plugins-official/presentations/0.7.0/dist/server.mjs",
        "presentations-plugin",
      ],
      ["C:/fixture/cache/aibuddy7se-plugins-official/pdf/0.7.0/dist/server.mjs", "pdf-plugin"],
      [
        "C:/fixture/cache/aibuddy7se-plugins-official/node-repl-host/0.7.1/dist/mcp/server.js",
        "node-repl-host",
      ],
      [
        "C:/fixture/cache/aibuddy7se-plugins-official/aibuddy7se-site/0.5.1/dist/server.mjs",
        "sites-plugin",
      ],
      ["C:/fixture/packages/zcode-site-plugin/dist/server.mjs", "sites-plugin"],
      ["C:/fixture/packages/aibuddy7se-site-plugin/dist/server.mjs", "sites-plugin"],
      ["C:/fixture/unrelated/server.mjs", null],
    ];
    const rows = entries.map(([path], i) => ({
      ProcessId: i + 1,
      ParentProcessId: 0,
      Name: "aibuddy7se.exe",
      CommandLine: '"C:/fixture/plugin-host.cjs" "' + path.replaceAll("/", "\\") + '"',
    }));
    const encoded = Buffer.from(JSON.stringify(rows)).toString("base64");
    const fixture = `function Get-CimInstance { $items = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json; $items | ForEach-Object { $_ | Add-Member CreationDate ([DateTime]::UtcNow); $_ } }
function Get-Process { [PSCustomObject]@{ WorkingSet64=1024; PrivateMemorySize64=2048 } }
`;
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(fixture + memoryProcessScript(1), "utf16le").toString("base64"),
      ],
      { encoding: "utf8", timeout: 20000 },
    );
    const actual = JSON.parse(output);
    assert.deepEqual(
      actual.map((row) => row.plugin),
      entries.map(([, plugin]) => plugin),
    );
    assert.ok(actual.every((row) => !Object.hasOwn(row, "CommandLine")));
    assert.ok(actual.every((row) => row.workingSetBytes === 1024 && row.privateBytes === 2048));
  },
);
