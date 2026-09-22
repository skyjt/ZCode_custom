import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { parse } from "yaml";
import { findAbiViolations } from "./verify-linux.mjs";

test("collector normalizes Debian amd64 filenames and hashes the exact installer", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "aibuddy-release-collect-"));
  const bytes = Buffer.alloc(1_000_001, "a");
  try {
    await mkdir(join(cwd, "packages/desktop/dist"), { recursive: true });
    await writeFile(join(cwd, "package.json"), JSON.stringify({ version: "1.2.3" }));
    await writeFile(join(cwd, "packages/desktop/dist/AIbuddy-1.2.3-linux-amd64.deb"), bytes);
    await promisify(execFile)(
      process.execPath,
      [resolve("scripts/release/collect-artifacts.mjs"), "linux", "x64"],
      { cwd },
    );
    assert.deepEqual(await readFile(join(cwd, "release/AIbuddy-1.2.3-linux-x64.deb")), bytes);
    assert.equal(
      await readFile(join(cwd, "release/checksums-linux-x64.txt"), "utf8"),
      `${createHash("sha256").update(bytes).digest("hex")}  AIbuddy-1.2.3-linux-x64.deb\n`,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

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
