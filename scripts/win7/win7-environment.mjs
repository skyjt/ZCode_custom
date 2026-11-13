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
  env.AIBUDDY7SE_OFFLINE_TOOLS = tools;
  delete env.PYTHONPATH;
  delete env.PYTHONHOME;
  env.PYTHONUTF8 = "1";
  env.PYTHONDONTWRITEBYTECODE = "1";
  env.PIP_NO_INDEX = "1";
  env.PIP_DISABLE_PIP_VERSION_CHECK = "1";
  env.AIBUDDY7SE_MODEL_TELEMETRY_ENABLED = "false";
}

export function configureWin7Environment(
  env = process.env,
  userHome = homedir(),
  appData = env.APPDATA,
) {
  const home = join(userHome, ".aibuddy7se-home");
  env.AIBUDDY7SE_DESKTOP_HOME_DIR = home;
  env.AIBUDDY7SE_DATA_BASE_DIR = home;
  // CLI 的默认存储不读取 DATA_BASE_DIR；覆盖两个既有入口并移除可反向覆盖的旧别名。
  delete env.AIBUDDY7SE_SESSION_DB;
  env.AIBUDDY7SE_SESSION_DB_PATH = join(home, ".aibuddy7se/cli/db/db.sqlite");
  env.AIBUDDY7SE_STORAGE_DIR = join(home, ".aibuddy7se");
  // Bootstrap 完成迁移后才启用新目录，保持所有进程的存储入口一致。
  if (appData) env.AIBUDDY7SE_DESKTOP_USER_DATA_DIR = join(appData, "aibuddy7se");
  env.AIBUDDY7SE_WIN7_EDITION = "1";
  env.AIBUDDY7SE_DESKTOP_APPLICATION_NAME = "aibuddy7se";
  env.AIBUDDY7SE_DESKTOP_APP_ID = "dev.aibuddy7se.app";
  return home;
}
