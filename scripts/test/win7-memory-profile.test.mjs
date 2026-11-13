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
