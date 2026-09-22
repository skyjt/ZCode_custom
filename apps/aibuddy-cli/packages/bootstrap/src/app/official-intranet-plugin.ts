export const OFFICIAL_INTRANET_PLUGIN = {
  name: "intranet-skills",
  version: "1.0.0",
  defaultEnabled: true,
  listing: {
    author: { name: "AIbuddy" },
    category: "productivity",
    displayName: "Intranet Skills",
    displayName_i18n: { "zh-CN": "内网工作技能" },
    description_i18n: {
      "zh-CN":
        "代码审查、SQL 排查、日志分析、数据校验、技术文档和 UOS/Linux 诊断；无需额外下载或后台服务。",
    },
    examplePrompts: ["Review this SQL query", "Diagnose this UOS application's CPU usage"],
    examplePrompts_i18n: {
      "zh-CN": ["检查这段 SQL 的关联和汇总逻辑", "分析日志中的首次故障", "排查 UOS 上的应用卡顿"],
    },
  },
  rootCandidates: [
    "packages/intranet-skills-plugin",
    "../intranet-skills-plugin",
    "../../intranet-skills-plugin",
    "../../../intranet-skills-plugin",
  ],
  requiredSeedPaths: [
    "skills/intranet-code-review/SKILL.md",
    "skills/intranet-sql-review/SKILL.md",
    "skills/intranet-log-triage/SKILL.md",
    "skills/intranet-data-check/SKILL.md",
    "skills/intranet-tech-docs/SKILL.md",
    "skills/uos-linux-diagnostics/SKILL.md",
  ],
};
