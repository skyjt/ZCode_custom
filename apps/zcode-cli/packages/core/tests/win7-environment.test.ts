import { describe, expect, it } from "vitest";
import {
  buildEnvInfoSection,
  buildEnvironmentAnnouncement,
  environmentSnapshot,
} from "../src/context/sections/env-info.js";

const win7 = {
  cwd: "C:\\Work\\中文 project",
  platform: "win32",
  shell: "cmd.exe",
  osVersion: "win32 6.1.7601 x64",
  nodeVersion: "v24.20.0",
};

describe("Win7 Python guidance", () => {
  it("uses the actual shell and adds bounded Python guidance without repeating it", () => {
    const content = buildEnvInfoSection(win7).content;
    expect(content).toContain("Shell: cmd.exe");
    expect(content).toContain("python -B -X utf8");
    expect(content).toContain("ZCODE_OFFLINE_TOOLS");
    expect(content).toContain("permissions");
    const snapshot = environmentSnapshot(win7);
    expect(buildEnvironmentAnnouncement(snapshot, snapshot, true)).toBeNull();
  });

  it.each([
    ["win32", "win32 10.0.19045 x64"],
    ["linux", "linux 6.1.0 x64"],
    ["darwin", "darwin 25.0.0 arm64"],
  ])("does not add Win7 guidance to %s / %s", (platform, osVersion) => {
    expect(buildEnvInfoSection({ ...win7, platform, osVersion }).content).not.toContain(
      "ZCODE_OFFLINE_TOOLS",
    );
  });
});
