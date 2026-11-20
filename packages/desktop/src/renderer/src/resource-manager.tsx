import { createRoot } from "react-dom/client";
import type {
  NetworkCaptureBridge,
  ResourceUsageSnapshot,
  StorageManagementBridge,
} from "@zcode/shared";
import "@zcode/ui/styles.css";
import { applyTheme, loadThemePreference, THEME_STORAGE_KEY } from "@zcode/ui/useTheme";
import {
  ResourceManagerApp,
  ZCodeIntlProvider,
  applyUiFontSizePx,
  loadUiFontSizePx,
  subscribeToUiFontSizeStorageChanges,
} from "@zcode/ui";

declare global {
  interface Window {
    resourceManager?: {
      getSnapshot: () => Promise<ResourceUsageSnapshot>;
      setSamplingActive: (active: boolean) => void;
      storage?: StorageManagementBridge;
      network?: NetworkCaptureBridge;
    };
  }
}

function applyResourceManagerTheme(): void {
  applyTheme(loadThemePreference());
}

applyResourceManagerTheme();
// 独立窗口不持有主窗口 store；读取同一个偏好即可同步，也覆盖清除设置和系统配色变化。
window.addEventListener("storage", (event) => {
  if (event.key === THEME_STORAGE_KEY || event.key === null) applyResourceManagerTheme();
});
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", applyResourceManagerTheme);
// 资源管理器不创建主窗口的 Zustand store，text-ui-* 无法自动获得持久化基准。
// 首屏前显式应用，运行中再由 storage 事件同步，且不改变 html font-size 或接入业务 Host。
applyUiFontSizePx(loadUiFontSizePx());
subscribeToUiFontSizeStorageChanges();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    // 语言沿用主窗口写入 localStorage 的偏好；不接 settingService，避免独立窗口再起一份 RPC。
    <ZCodeIntlProvider>
      <ResourceManagerApp
        setSamplingActive={window.resourceManager?.setSamplingActive}
        getSnapshot={
          window.resourceManager ? () => window.resourceManager!.getSnapshot() : undefined
        }
        storage={window.resourceManager?.storage}
        network={window.resourceManager?.network}
      />
    </ZCodeIntlProvider>,
  );
}
