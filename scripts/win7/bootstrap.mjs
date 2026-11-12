import { mkdir } from "node:fs/promises";
import { app } from "electron";
import { configureWin7Environment, configureOfflineTools } from "./win7-environment.mjs";

// 在 ESM main 导入前完成隔离，避免静态导入先捕获正式版的数据路径；保留系统 HOME 给 Git/SSH。
const home = configureWin7Environment(process.env, undefined, app.getPath("appData"));
app.commandLine.appendSwitch("force-prefers-reduced-motion");
configureOfflineTools(process.resourcesPath);
await mkdir(home, { recursive: true });

// Electron 会等待 ESM 入口的顶层 await；CJS 中动态导入可能晚于 ready，导致协议注册失败。
try {
  await import("./main/index.js");
} catch (error) {
  console.error("[win7-bootstrap]", error);
  app.exit(1);
}
