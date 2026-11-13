import { lazy, Suspense, useEffect } from "react";
import { ServiceProvider } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";
import type { WorkspaceSettingsLayerProps } from "@/root/types.js";
import { RootStartupLoading } from "@/root/RootStartupLoading.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

// 两个设置入口都必须延迟加载，否则此处的静态 import 仍会把设置模块拉进首屏。
const SettingsPage = lazy(() =>
  import("@/SettingsPage.js").then((module) => ({ default: module.SettingsPage })),
);

export function WorkspaceSettingsLayer({
  workspaceScopedServices,
  isDesktop,
  isMacDesktop,
  isWindowsDesktop,
  isWebRemoteControl,
  windowsWindowControlsRightPaddingPx,
  captionWorkspacePath,
  onBack,
  onOpenTask,
  onCreateTask,
  onOpenWorkspace,
  onOpenRemoteWorkspace,
  allowOpenWorkspace,
  onLogin,
  onLogout,
  user,
}: WorkspaceSettingsLayerProps) {
  const { intl } = useZCodeIntl();
  useEffect(() => {
    logger.info("[Root] settings layer mounted");
    return () => {
      logger.info("[Root] settings layer unmounted");
    };
  }, []);

  return (
    <div className="absolute inset-0 z-10">
      <Suspense
        fallback={<RootStartupLoading label={intl.formatMessage({ id: "common.loading" })} />}
      >
        {workspaceScopedServices ? (
          <ServiceProvider services={workspaceScopedServices}>
            <SettingsPage
              isDesktop={isDesktop}
              isMacDesktop={isMacDesktop}
              isWindowsDesktop={isWindowsDesktop}
              isWebRemoteControl={isWebRemoteControl}
              windowsWindowControlsRightPaddingPx={windowsWindowControlsRightPaddingPx}
              captionWorkspacePath={captionWorkspacePath}
              onBack={onBack}
              onOpenTask={onOpenTask}
              onCreateTask={onCreateTask}
              onOpenWorkspace={onOpenWorkspace}
              onOpenRemoteWorkspace={onOpenRemoteWorkspace}
              allowOpenWorkspace={allowOpenWorkspace}
              onLogin={onLogin}
              onLogout={onLogout}
              user={user}
            />
          </ServiceProvider>
        ) : (
          <SettingsPage
            isDesktop={isDesktop}
            isMacDesktop={isMacDesktop}
            isWindowsDesktop={isWindowsDesktop}
            isWebRemoteControl={isWebRemoteControl}
            windowsWindowControlsRightPaddingPx={windowsWindowControlsRightPaddingPx}
            captionWorkspacePath={captionWorkspacePath}
            onBack={onBack}
            onOpenTask={onOpenTask}
            onCreateTask={onCreateTask}
            onOpenWorkspace={onOpenWorkspace}
            onOpenRemoteWorkspace={onOpenRemoteWorkspace}
            allowOpenWorkspace={allowOpenWorkspace}
            onLogin={onLogin}
            onLogout={onLogout}
            user={user}
          />
        )}
      </Suspense>
    </div>
  );
}
