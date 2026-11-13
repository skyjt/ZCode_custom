import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { app, dialog } from "electron";
import { configureWin7Environment, configureOfflineTools } from "./win7-environment.mjs";
import {
  migrateWin7Data,
  withLegacyInstanceLock,
  migrateLegacyEnvironment,
} from "./legacy-migration.mjs";
import helpers from "./legacy-data.cjs";

// 在 ESM main 导入前完成隔离，避免静态导入先捕获正式版的数据路径；保留系统 HOME 给 Git/SSH。
const appData = app.getPath("appData");
app.commandLine.appendSwitch("force-prefers-reduced-motion");
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");

// Electron 会等待 ESM 入口的顶层 await；CJS 中动态导入可能晚于 ready，导致协议注册失败。
try {
  await withLegacyInstanceLock(app, appData, () =>
    migrateWin7Data({ userHome: homedir(), appData, helpers }),
  );
  migrateLegacyEnvironment(process.env);
  const home = configureWin7Environment(process.env, undefined, appData);
  configureOfflineTools(process.resourcesPath);
  await mkdir(home, { recursive: true });
  await import("./main/index.js");
} catch (error) {
  console.error("[win7-bootstrap]", error);
  dialog.showErrorBox("aibuddy7se 启动失败", `旧数据已保留，未进入应用。\n${error.message}`);
  app.exit(1);
}
