import { cp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prepareOfflineTools } from "./prepare-offline-tools.mjs";

// 复用唯一资产准备入口，先验证真实 Git/凭据/Java，再花时间构建 Electron 安装器。
// 独立目录与报告明确标识预检，后面的最终成包验收仍然全部执行。
const root = resolve(import.meta.dirname, "../..");
const tools = await prepareOfflineTools(root, process.env);
const app = join(root, ".cache/win7-developer-preflight");
await rm(app, { recursive: true, force: true });
await mkdir(join(app, "resources/offline-tools"), { recursive: true });
await cp(join(tools, "git"), join(app, "resources/offline-tools/git"), { recursive: true });
await mkdir(join(root, ".cache/win7-acceptance"), { recursive: true });
