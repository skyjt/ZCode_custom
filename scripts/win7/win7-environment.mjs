import { homedir } from "node:os";
import { join } from "node:path";

export function configureWin7Environment(env = process.env, userHome = homedir()) {
  const home = join(userHome, ".zcode-win7-home");
  env.ZCODE_DESKTOP_HOME_DIR = home;
  env.ZCODE_DATA_BASE_DIR = home;
  // CLI 的默认存储不读取 DATA_BASE_DIR；覆盖两个既有入口并移除可反向覆盖的旧别名。
  delete env.ZCODE_SESSION_DB;
  env.ZCODE_SESSION_DB_PATH = join(home, ".zcode/cli/db/db.sqlite");
  env.ZCODE_STORAGE_DIR = join(home, ".zcode");
  env.ZCODE_DESKTOP_APPLICATION_NAME = "ZCode Win7 Experimental";
  env.ZCODE_DESKTOP_APP_ID = "dev.zcode.app.win7.experimental";
  return home;
}
