const { homedir } = require("node:os");
const { join } = require("node:path");
const { mkdirSync } = require("node:fs");

// 在 ESM main 导入前完成隔离，避免静态导入先捕获正式版的数据路径；保留系统 HOME 给 Git/SSH。
const home = join(homedir(), ".zcode-win7-home");
mkdirSync(home, { recursive: true });
process.env.ZCODE_DESKTOP_HOME_DIR = home;
process.env.ZCODE_DATA_BASE_DIR = home;
process.env.ZCODE_DESKTOP_APPLICATION_NAME = "ZCode Win7 Experimental";
process.env.ZCODE_DESKTOP_APP_ID = "dev.zcode.app.win7.experimental";

import("./main/index.js").catch((error) => {
  console.error("[win7-bootstrap]", error);
  require("electron").app.exit(1);
});
