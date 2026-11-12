import assert from "node:assert/strict";
import { test } from "node:test";
import { runChecks } from "../win7/system-self-test.cjs";

test("self-test continues after failure and reports optional and untested capabilities honestly", async () => {
  const checks = await runChecks([
    [
      "broken",
      async () => {
        throw new Error("fixture failure");
      },
    ],
    ["next", async () => "still executed"],
    ["optional", async () => ({ status: "warn", detail: "Git missing" })],
    ["model", async () => ({ status: "not-tested", detail: "no network request" })],
  ]);
  assert.deepEqual(
    checks.map(({ id, status }) => [id, status]),
    [
      ["broken", "fail"],
      ["next", "pass"],
      ["optional", "warn"],
      ["model", "not-tested"],
    ],
  );
  assert.equal(checks[1].detail, "still executed");
  assert.ok(checks.every(({ durationMs }) => durationMs >= 0));
});
