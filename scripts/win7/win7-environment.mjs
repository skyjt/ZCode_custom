import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export function configureOfflineTools(resourcesPath, env = process.env) {
  const tools = join(resourcesPath, "offline-tools");
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  const original = env[pathKey] || "";
  // Windows 环境键不区分大小写；两个 PATH 会让子进程随机得到未配置的那份。
  for (const key of Object.keys(env)) {
    if (key !== pathKey && key.toLowerCase() === "path") delete env[key];
  }
  env[pathKey] = [
    ...new Set([join(tools, "python"), join(tools, "putty"), ...original.split(delimiter)]),
  ].join(delimiter);
  env.ZCODE_OFFLINE_TOOLS = tools;
  delete env.PYTHONPATH;
  delete env.PYTHONHOME;
  env.PYTHONUTF8 = "1";
  env.PYTHONDONTWRITEBYTECODE = "1";
  env.PIP_NO_INDEX = "1";
  env.PIP_DISABLE_PIP_VERSION_CHECK = "1";
  env.ZCODE_MODEL_TELEMETRY_ENABLED = "false";
}

export function configureWin7Environment(
  env = process.env,
  userHome = homedir(),
  appData = env.APPDATA,
) {
  const home = join(userHome, ".zcode-win7-home");
  env.ZCODE_DESKTOP_HOME_DIR = home;
  env.ZCODE_DATA_BASE_DIR = home;
  // CLI 的默认存储不读取 DATA_BASE_DIR；覆盖两个既有入口并移除可反向覆盖的旧别名。
  delete env.ZCODE_SESSION_DB;
  env.ZCODE_SESSION_DB_PATH = join(home, ".zcode/cli/db/db.sqlite");
  env.ZCODE_STORAGE_DIR = join(home, ".zcode");
  // 改名只影响展示，保留旧包 userData，避免升级后会话和设置看似丢失。
  if (appData) env.ZCODE_DESKTOP_USER_DATA_DIR = join(appData, "ZCode Win7 Experimental");
  env.ZCODE_DESKTOP_APPLICATION_NAME = "aibuddy7se";
  env.ZCODE_DESKTOP_APP_ID = "dev.zcode.app.win7.experimental";
  return home;
}
