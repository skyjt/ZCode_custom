export const OFFICIAL_OFFICECLI_PLUGIN = {
  name: "officecli",
  version: "1.0.152",
  defaultEnabled: true,
  listing: {
    author: { name: "OfficeCLI / goworm", url: "https://github.com/iOfficeAI/OfficeCLI" },
    category: "productivity",
    displayName: "OfficeCLI",
    description_i18n: {
      "zh-CN": "内置适配当前系统的 OfficeCLI，读写 Word、Excel、PowerPoint；无需另装 Office。",
    },
  },
  rootCandidates: [
    "packages/officecli-plugin",
    "../officecli-plugin",
    "../../officecli-plugin",
    "../../../officecli-plugin",
  ],
  runtimeTopLevelPaths: ["bin"],
  requiredSeedPaths: [
    "skills/officecli/SKILL.md",
    "scripts/officecli.sh",
    "scripts/officecli.cmd",
    "docs/LICENSE",
    "docs/NOTICE",
    "docs/THIRD-PARTY-NOTICES.txt",
    process.platform === "win32" ? "bin/officecli.exe" : "bin/officecli",
  ],
};
