import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { app } from "electron";

// 在 ESM main 导入前完成隔离，避免静态导入先捕获正式版的数据路径；保留系统 HOME 给 Git/SSH。
const home = join(homedir(), ".zcode-win7-home");
await mkdir(home, { recursive: true });
process.env.ZCODE_DESKTOP_HOME_DIR = home;
process.env.ZCODE_DATA_BASE_DIR = home;
process.env.ZCODE_DESKTOP_APPLICATION_NAME = "ZCode Win7 Experimental";
process.env.ZCODE_DESKTOP_APP_ID = "dev.zcode.app.win7.experimental";

// Electron 会等待 ESM 入口的顶层 await；CJS 中动态导入可能晚于 ready，导致协议注册失败。
try {
  await import("./main/index.js");
} catch (error) {
  console.error("[win7-bootstrap]", error);
  app.exit(1);
}
