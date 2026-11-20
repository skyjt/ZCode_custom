/** 资源管理器的 Host 采样、Desktop 窗口适配和 UI 展示边界。 */
export const resourceManagerModule = {
  id: "resource-manager",
  requires: ["shared", "ui", "desktop"],
  provides: ["resource-manager"],
  publicEntrypoints: [
    "ResourceManagerApp.tsx",
    "contract.ts",
    "resourceUsageView.ts",
    "processResourceSampler.ts",
    "resourceManagerWindow.ts",
  ],
} as const;
