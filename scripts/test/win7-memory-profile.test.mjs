import assert from "node:assert/strict";
import { test } from "node:test";
import { selectProcessTree } from "../win7/memory-profile.mjs";
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
