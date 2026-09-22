import { recordArmsCustomEventForE2E } from "@aibuddy/ui";
import { DesktopCommandIds, buildLocalMediaPreviewUrl, type IPlatformService } from "@aibuddy/shared";

import { desktopBrowserPlatformBridge } from "./desktopBrowserPlatformBridge.js";

export function createDesktopPlatform(options: {
  isLocalDevelopmentRuntime: boolean;
}): IPlatformService {
  return {
    canSelectFilePath: true,
    createLocalMediaPreviewUrl: buildLocalMediaPreviewUrl,
    isLocalDevelopmentRuntime: options.isLocalDevelopmentRuntime,
    selectDirectory: () => window.aibuddy.selectDirectory(),
    selectFile: () => window.aibuddy.selectFile(),
    selectFiles: () => window.aibuddy.selectFiles?.() ?? Promise.resolve([]),
    createTempTextAttachment: (payload) => window.aibuddy.createTempTextAttachment(payload),
    onRemoteConnectionLog: (handler) => window.aibuddy.onRemoteConnectionLog(handler),
    onRemoteSessionClosed: (handler) => window.aibuddy.onRemoteSessionClosed(handler),
    activateOrSetWorkspace: (path) =>
      window.aibuddy.activateOrSetWorkspace?.(path) ?? Promise.resolve({ activated: false }),
    connectRemote: (remoteOptions, requestId, context) =>
      window.aibuddy.connectRemote(remoteOptions, requestId, context),
    cancelPendingRemoteConnection: (requestId) =>
      window.aibuddy.cancelPendingRemoteConnection?.(requestId) ?? Promise.resolve(),
    bindRemoteWorkspaceSessionContext: (context) =>
      window.aibuddy.bindRemoteWorkspaceSessionContext?.(context) ?? Promise.resolve(),
    disposeRemoteSession: (sessionId) => window.aibuddy.disposeRemoteSession(sessionId),
    isDockerAvailable: () => window.aibuddy.isDockerAvailable(),
    listWSLDistros: () => window.aibuddy.listWSLDistros(),
    listDockerContainers: () => window.aibuddy.listDockerContainers(),
    listSSHConfigAliases: () => window.aibuddy.listSSHConfigAliases(),
    loadMcpFromUserDirectory: (payload) => window.aibuddy.loadMcpFromUserDirectory(payload),
    saveMcpToUserDirectory: (payload) => window.aibuddy.saveMcpToUserDirectory(payload),
    migrateLegacyCommonMcp: (payload) => window.aibuddy.migrateLegacyCommonMcp(payload),
    openExternal: (url) => window.aibuddy.openExternal(url),
    openFeedback: () => window.aibuddy.executeDesktopCommand(DesktopCommandIds.OpenFeedback),
    openCommunity: () => window.aibuddy.executeDesktopCommand(DesktopCommandIds.OpenCommunity),
    canOpenCommunity: (locale) => window.aibuddy.canOpenCommunity(locale),
    openInFileManager: (path) => window.aibuddy.openInFileManager(path),
    openExternalFile: (path) => window.aibuddy.openExternalFile(path),
    openCuaPermissionOnboarding: window.aibuddy.openCuaPermissionOnboarding
      ? (permissionOptions) =>
          window.aibuddy.openCuaPermissionOnboarding?.(permissionOptions) ??
          Promise.resolve({ success: false, error: "not_supported" })
      : undefined,
    prepareCuaHelperPermissionDrag: window.aibuddy.prepareCuaHelperPermissionDrag
      ? () =>
          window.aibuddy.prepareCuaHelperPermissionDrag?.() ??
          Promise.resolve({ success: false, error: "not_supported" })
      : undefined,
    startCuaHelperPermissionDrag: window.aibuddy.startCuaHelperPermissionDrag
      ? () => window.aibuddy.startCuaHelperPermissionDrag?.()
      : undefined,
    registerOAuthState: (payload) => window.aibuddy.registerOAuthState(payload),
    onOAuthCallback: (callback) => window.aibuddy.onOAuthCallback(callback),
    onPaymentCallback: (callback) => window.aibuddy.onPaymentCallback(callback),
    onShareImport: (callback) => window.aibuddy.onShareImport?.(callback) ?? (() => {}),
    notifyRendererReady: () => window.aibuddy.notifyRendererReady(),
    reportTelemetryEvent: (payload) => window.aibuddy.reportTelemetryEvent(payload),
    reportArmsCustomEvent: (payload) => {
      recordArmsCustomEventForE2E(payload);
      return window.aibuddy.reportArmsCustomEvent(payload);
    },
    getRendererActionTraceConfig: window.aibuddy.getRendererActionTraceConfig
      ? () => window.aibuddy.getRendererActionTraceConfig!()
      : undefined,
    onRendererActionTraceConfigChanged: window.aibuddy.onRendererActionTraceConfigChanged
      ? (callback) => window.aibuddy.onRendererActionTraceConfigChanged!(callback)
      : undefined,
    reportLocalTtftBatch: (batch) => window.aibuddy.reportLocalTtftBatch(batch),
    reportRendererActionTraceBatch: window.aibuddy.reportRendererActionTraceBatch
      ? (batch) => window.aibuddy.reportRendererActionTraceBatch!(batch)
      : undefined,
    reportRendererHeapSample: window.aibuddy.reportRendererHeapSample
      ? (sample) => window.aibuddy.reportRendererHeapSample!(sample)
      : undefined,
    showTaskNotification: (payload) => window.aibuddy.showTaskNotification(payload),
    syncWindowTabs: (paths) => window.aibuddy.syncWindowTabs(paths),
    syncWindowUnreadCount: (count) => window.aibuddy.syncWindowUnreadCount(count),
    syncActiveTaskSession: (sessionId) => window.aibuddy.syncActiveTaskSession(sessionId),
    syncAppSettings: (patch) => window.aibuddy.syncAppSettings?.(patch),
    setShortcutRecordingActive: (active) => window.aibuddy.setShortcutRecordingActive?.(active),
    onFocusTab: (handler) => window.aibuddy.onFocusTab(handler),
    onNewTab: (handler) => window.aibuddy.onNewTab(handler),
    onCloseActiveContextRequest: (handler) =>
      window.aibuddy.onCloseActiveContextRequest?.(handler) ?? (() => {}),
    onOpenBrowserUrl: (handler) => window.aibuddy.onOpenBrowserUrl?.(handler) ?? (() => {}),
    onBrowserViewScreenshotSurfacePrepare: (handler) =>
      window.aibuddy.onBrowserViewScreenshotSurfacePrepare?.(handler) ?? (() => {}),
    onBrowserViewScreenshotSurfaceRelease: (handler) =>
      window.aibuddy.onBrowserViewScreenshotSurfaceRelease?.(handler) ?? (() => {}),
    browserViewScreenshotSurfaceReady: (payload) =>
      window.aibuddy.browserViewScreenshotSurfaceReady?.(payload),
    ...desktopBrowserPlatformBridge,
    onNewTask: (handler) => window.aibuddy.onNewTask(handler),
    onOpenWorkspace: (handler) => {
      // 开发态或升级后的旧窗口可能仍运行未暴露 onOpenWorkspace 的 preload，
      // renderer 直接调用会在启动时崩溃。这里和 activateOrSetWorkspace 一样做兼容兜底，
      // 缺少该 bridge 时只禁用原生菜单回调，不影响应用继续打开。
      return window.aibuddy.onOpenWorkspace?.(handler) ?? (() => {});
    },
    onOpenWorkspacePath: (handler) => window.aibuddy.onOpenWorkspacePath?.(handler) ?? (() => {}),
    onOpenFeedbackDialog: (handler) => window.aibuddy.onOpenFeedbackDialog?.(handler) ?? (() => {}),
    onOpenTicketsPanel: (handler) => window.aibuddy.onOpenTicketsPanel?.(handler) ?? (() => {}),
    onWindowFullscreenChanged: (handler) => window.aibuddy.onWindowFullscreenChanged(handler),
    getDesktopWindowChromeState: window.aibuddy.getDesktopWindowChromeState
      ? () => window.aibuddy.getDesktopWindowChromeState!()
      : undefined,
    onDesktopWindowChromeStateChanged: window.aibuddy.onDesktopWindowChromeStateChanged
      ? (handler) => window.aibuddy.onDesktopWindowChromeStateChanged!(handler)
      : undefined,
    getWindowControlsOverlayMetrics: () => window.aibuddy.getWindowControlsOverlayMetrics?.() ?? null,
    onWindowControlsOverlayChanged: (handler) =>
      window.aibuddy.onWindowControlsOverlayChanged?.(handler) ?? (() => {}),
    getDesktopZoomLevel: () =>
      window.aibuddy.getDesktopZoomLevel?.() ?? Promise.resolve({ zoomLevel: 0 }),
    onDesktopZoomLevelChanged: (handler) =>
      window.aibuddy.onDesktopZoomLevelChanged?.(handler) ?? (() => {}),
    onTaskNotificationClick: (handler) => window.aibuddy.onTaskNotificationClick(handler),
    exportLogs: () => window.aibuddy.exportLogs(),
    captureWindowScreenshot: () =>
      window.aibuddy.captureWindowScreenshot?.() ?? Promise.resolve(null),
    onUpdateReady: (callback) => window.aibuddy.onUpdateReady(callback),
    onUpdateCheckResult: (callback) => window.aibuddy.onUpdateCheckResult(callback),
    onUpdateStateChanged: (callback) => window.aibuddy.onUpdateStateChanged?.(callback) ?? (() => {}),
    getUpdateState: () =>
      window.aibuddy.getUpdateState?.() ?? Promise.resolve({ kind: "idle", enabled: true }),
    downloadUpdate: () => window.aibuddy.downloadUpdate?.() ?? Promise.resolve(),
    cancelUpdateDownload: () => window.aibuddy.cancelUpdateDownload?.() ?? Promise.resolve(),
    openUpdateStatusWindow: () => window.aibuddy.openUpdateStatusWindow?.() ?? Promise.resolve(),
    getAutoUpdatePreferences: () =>
      window.aibuddy.getAutoUpdatePreferences?.() ??
      Promise.resolve({ autoDownloadAndInstallUpdates: false }),
    setAutoDownloadAndInstallUpdates: (enabled) =>
      window.aibuddy.setAutoDownloadAndInstallUpdates?.(enabled) ?? Promise.resolve(),
    getDesktopSessionActivity: () =>
      window.aibuddy.getDesktopSessionActivity?.() ??
      Promise.resolve({ runningAgentSessionCount: 0 }),
    getAIbuddyStdioTapDevState: () =>
      window.aibuddy.getAIbuddyStdioTapDevState?.() ??
      Promise.resolve({ enabled: false, visible: false, logDir: "", statePath: "" }),
    onSettingsChanged: (callback) => window.aibuddy.onSettingsChanged?.(callback) ?? (() => {}),
    onApplicationLocaleChanged: (callback) =>
      window.aibuddy.onApplicationLocaleChanged?.(callback) ?? (() => {}),
    onPostUpdateReleaseNotes: (callback) => window.aibuddy.onPostUpdateReleaseNotes(callback),
    acknowledgePostUpdateReleaseNotes: (version) =>
      window.aibuddy.acknowledgePostUpdateReleaseNotes(version),
    skipUpdateVersion: (version) => window.aibuddy.skipUpdateVersion?.(version) ?? Promise.resolve(),
    quitAndInstallUpdate: () => window.aibuddy.quitAndInstallUpdate(),
    getInstalledEditors: () => window.aibuddy.getInstalledEditors(),
    getApplicationIcon: (bundleId) =>
      window.aibuddy.getApplicationIcon?.(bundleId) ?? Promise.resolve(null),
    openInEditor: (editorId, path, editorOptions) =>
      window.aibuddy.openInEditor(editorId, path, editorOptions),
    executeDesktopCommand: (command) => window.aibuddy.executeDesktopCommand(command),
    setApplicationLocale: (locale) => window.aibuddy.setApplicationLocale(locale),
    getSystemLocale: () =>
      window.aibuddy.getSystemLocale?.() ??
      Promise.resolve(navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US"),
    setTitleBarTheme: (theme) => window.aibuddy.setTitleBarTheme(theme),
    getDeviceId: () =>
      (window as Window & { __AIBUDDY_DEVICE_ID__?: string }).__AIBUDDY_DEVICE_ID__ ?? "",
  };
}
