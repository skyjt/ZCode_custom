import assert from "node:assert/strict";
import { test } from "node:test";
import { selectProcessTree } from "../win7/memory-profile.mjs";

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
