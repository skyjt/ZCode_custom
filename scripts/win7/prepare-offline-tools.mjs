import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCommand } from "../spawn-command.mjs";

export const offlineRuntime = JSON.parse(
  await readFile(new URL("./offline-runtime.json", import.meta.url), "utf8"),
);

export async function prepareOfflineTools(root, env) {
  const cache = join(root, ".cache/win7-offline-downloads");
  const destination = join(root, ".cache/win7-offline-tools");
  await mkdir(cache, { recursive: true });
  await rm(destination, { recursive: true, force: true });
  await cp(join(root, "scripts/win7/offline-tools"), destination, { recursive: true });
  for (const asset of offlineRuntime.assets) {
    const archive = join(cache, asset.name);
    let bytes;
    try {
      bytes = await readFile(archive);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(300000) });
      if (!response.ok)
        throw new Error(`Offline asset download failed: ${asset.name} ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
      throw new Error(`Offline asset SHA-256 mismatch: ${asset.name}`);
    }
    await writeFile(archive, bytes);
    const target = join(destination, asset.destination);
    await mkdir(target, { recursive: true });
    if (asset.extract) runCommand("tar", ["-xf", archive, "-C", target], { env });
    else await writeFile(join(target, asset.name), bytes);
  }
  // 2.46.2 的 wincred 在读/删密码时存在已确认的堆越界；使用锁定的上游修复源码，
  // 仍按 Win7/x64/静态 CRT 构建，不能通过跳过 erase 或改用明文存储绕过真实失败。
  const helperSource = join(destination, "git/sources/wincred");
  const helperBuild = join(root, ".cache/win7-wincred-build");
  await cp(join(root, "scripts/win7/git-wincred"), helperSource, { recursive: true });
  runCommand(
    "cmake",
    ["-S", helperSource, "-B", helperBuild, "-G", "Visual Studio 17 2022", "-A", "x64"],
    { env },
  );
  runCommand("cmake", ["--build", helperBuild, "--config", "Release"], { env });
  await cp(
    join(helperBuild, "Release/git-credential-wincred.exe"),
    join(destination, "git/mingw64/bin/git-credential-wincred.exe"),
  );
  // 嵌入版只读取随包依赖；锁定 wheel 无库数据重定位，XlsxWriter 的 VBA 提取脚本不作为命令安装。
  await writeFile(
    join(destination, "python/python311._pth"),
    "python311.zip\n.\nLib/site-packages\n",
  );
  // MinGit 默认 GCM 需要额外 .NET 4.7.2；只调整随包配置，使用 Win7 原生凭据库。
  // 用户及仓库的 helper 配置仍由 Git 自身覆盖，此处不读写真实用户配置。
  runCommand(
    join(destination, "git/cmd/git.exe"),
    [
      "config",
      "--file",
      join(destination, "git/etc/gitconfig"),
      "--replace-all",
      "credential.helper",
      "wincred",
    ],
    { env },
  );
  // MinGit 默认还包含其他 Git 安装的系统配置；移除这两个硬编码 include，
  // 防止继承另一个版本的 helper/路径。用户 ~/.gitconfig 和仓库配置完全保留。
  runCommand(
    join(destination, "git/cmd/git.exe"),
    ["config", "--file", join(destination, "git/etc/gitconfig"), "--remove-section", "include"],
    { env },
  );
  await cp(join(root, "scripts/win7/offline-runtime.json"), join(destination, "manifest.json"));
  runCommand(
    join(destination, "python/python.exe"),
    ["-B", "-X", "utf8", join(destination, "smoke.py")],
    { env, timeout: 60000 },
  );
  return destination;
}
