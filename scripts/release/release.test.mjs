import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { findAbiViolations } from "./verify-linux.mjs";

test("Debian 10 gate handles numeric versions and loader requirements", () => {
  assert.deepEqual(findAbiViolations("GLIBC_2.9 GLIBC_2.28 GLIBCXX_3.4.25 CXXABI_1.3.11"), []);
  assert.equal(findAbiViolations("GLIBC_2.29 GLIBCXX_3.4.26 CXXABI_1.3.12").length, 3);
  assert.equal(findAbiViolations("GLIBC_ABI_DT_RELR").length, 1);
  assert.equal(findAbiViolations("GLIBC_PRIVATE").length, 1);
});

test("release workflow covers the five requested targets and gates publication", async () => {
  const workflow = parse(await readFile(".github/workflows/release.yml", "utf8"));
  assert.deepEqual(
    workflow.jobs.build.strategy.matrix.include.map(({ platform, arch }) => `${platform}-${arch}`),
    ["linux-x64", "linux-arm64", "win-x64", "mac-x64", "mac-arm64"],
  );
  assert.equal(workflow.jobs.publish.needs, "build");
  assert.equal(workflow.jobs.publish.if, "inputs.publish");
  assert.equal(workflow.on.workflow_dispatch.inputs.publish.default, false);
  const steps = workflow.jobs.build.steps.map((step) => step.name);
  const prepareIndex = steps.indexOf("Prepare local runtime");
  assert.ok(prepareIndex >= 0 && prepareIndex < steps.indexOf("Check source"));
});
