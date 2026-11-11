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
  // 嵌入版只读取随包依赖；锁定 wheel 无库数据重定位，XlsxWriter 的 VBA 提取脚本不作为命令安装。
  await writeFile(
    join(destination, "python/python311._pth"),
    "python311.zip\n.\nLib/site-packages\n",
  );
  await cp(join(root, "scripts/win7/offline-runtime.json"), join(destination, "manifest.json"));
  runCommand(
    join(destination, "python/python.exe"),
    ["-B", "-X", "utf8", join(destination, "smoke.py")],
    { env, timeout: 60000 },
  );
  return destination;
}
