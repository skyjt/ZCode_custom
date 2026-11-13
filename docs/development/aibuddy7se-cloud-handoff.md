# aibuddy7se 云端开发交接（2026-11-13）

用户要求将项目转到云端继续开发，电脑将离线。唯一推送目标为 `https://github.com/skyjt/ZCode_custom.git` 的 `codex/win7-experimental` 分支，禁止推到上游 `zai-org/ZCode`。本次交接前运行时代码提交为 `dbe5ac6b37a3e346cd1284676bacb19ce0d0f9d8`。本文件随历史验收记录同步，不改变运行时代码。

## 必须继续完成的目标

- Win7 SP1 x64 内网版使用 aibuddy7se 名称、Logo、安装元数据、内部标识、目录和协议；首次启动迁移旧配置、会话、SQLite、凭据、浏览器偏好，保留原始数据，冲突/无法解密时拒绝覆盖。具体规则在 `specs/aibuddy7se-brand-migration.md`。
- 只生成离线 EXE，不生成便携 ZIP。现有 Python/Office/SSH/离线技能必须保留。目标用户已安装 Office 2013；不得把无 Office 的 Server 2022 检查称为真实 Office 2013 转换验收。
- 修复当前失败，跑通 Windows Actions 全部成包验收，再交付经过 SHA-256 核对的 EXE 与下载位置。不能将尚未通过验收的产物当成成品。
- 继续使用现有 Actions；已将品牌转换合并入 sourcemap 清理的同一次 ASAR 解包/封装，保留原生依赖检查。首轮对应阶段约 161 秒，合并后某次约 103 秒；整体 runner 耗时仍有波动，勿承诺固定总时长。

## 当前阻塞：注册表精确匹配测试失败

[Actions 43406675895](https://github.com/skyjt/ZCode_custom/actions/runs/43406675895)，job `131822577764`，在 Engineering regression 阶段失败：25 项中 24 通过，`native registry exact searches preserve Unicode paths and reject different commands` 的不匹配场景得到 `true !== false`。本轮未打包/发布。

定位入口：`scripts/win7/legacy-migration.mjs` 的 `migrateLegacyWindowsShell` 和 `scripts/test/win7-brand.test.mjs`。当前 `reg query /ve /f ... /d /e /t REG_SZ` 在真实 Windows 上仍返回不匹配的默认值；不能依赖该过滤结果删除旧键。修复必须读取并严格核对默认 command，正确支持中文路径、Windows 7 自带工具，并保留指向其他安装位置、开发入口、用户改写的旧键。删除失败不得冒充成功。保留或改进真实 Windows 的负例，不得删除测试、放宽断言或只保留 mock。相关代码尚未有通过 Windows 的最终交付。

旧键是 HKCU 的 Directory/Drive `ZCode.OpenInZCode` 与 `zcode` URL 协议；只有完全指向当前 EXE 的旧命令才属于迁移范围。Main 沿用现有注册路径写入新名称。此逻辑用于修复已有右键菜单不会因源码/安装包改名自动移除的遗漏。

## 已有证据与此前失败原因

- `79b810a3` 的 [Actions 43393978408](https://github.com/skyjt/ZCode_custom/actions/runs/43393978408) 全通过：包内文本扫描、成包运行时/Agent/SQLite/WinPTY、Windows OS 凭据迁移、离线 Office 库/SSH/技能、防火墙阻断 GUI。此版本早于后续迁移与菜单补充，不能冒充当前版本已通过。
- `b9be8345` 的 43398459608、`c2f9ceac` 的 43401763520：GUI 尚未进入 Bootstrap，截图明确为 `Failed to get 'appData' path`。测试只覆盖 USERPROFILE/HOME 而未创建完整 AppData 导致；`cb3c65f9` 已创建 Roaming/Local 并设置 APPDATA/LOCALAPPDATA。
- `cb3c65f9` 的 [Actions 43404254541](https://github.com/skyjt/ZCode_custom/actions/runs/43404254541) 已从旧 SQLite/真实 OS 密文进入工作区，新 preload/目录/模型配置路径正常，帮助菜单和关于窗口实际显示新 Logo/名称。随后测试在 `getByText('aibuddy7se', {exact:true})` 失败，因为产品名与版本同属一个 h1；`dbe5ac6b` 已改为校验 `#about-title` 的完整内容，并保留截图与无旧名称断言。
- 该截图还显示缺模型横幅残留 Upgrade；`dbe5ac6b` 已给 `ChatErrorBanner.tsx` 的 Win7 分支隐藏升级/云反馈，改为中英文自定义模型提示。对应 GUI 断言已补；仍需下一轮实际成包通过。
- 首轮品牌扫描 28,547 个文本文件通过；仅 `legacy-data.cjs`、`legacy-migration.mjs`、`legacy-storage.js` 作为旧数据识别保留旧字符串。用户文档、原始数据副本、真实项目路径、workspaceIdentity 和上游开发源码/历史不做盲目替换。

## 工程约束与已执行验证

先读根 AGENTS.md 及 architecture-governance skill；新增行为先更新对应 spec。不要恢复已退役的 App 业务单测。Node `24.14.0`、pnpm `10.33.2` 以 mise.toml 为准，勿使用其他 pnpm 导致锁文件/依赖变化。

本地最近：`pnpm typecheck` 通过；`pnpm lint` 为 538 条既有告警、0 错误；此次修改的 ChatErrorBanner 单独 Oxlint 为 0 告警/0 错误，未改变 Hooks 调用顺序或依赖。架构检查新增/基线违规均 0，正常 pre-push 门禁通过。工程入口：

```sh
node scripts/check-workspace-freshness.mjs
node --test scripts/test/win7-brand.test.mjs scripts/test/win7-build.test.mjs scripts/test/win7-self-test.test.mjs scripts/test/windows-runtime-host-build.test.mjs
pnpm typecheck
pnpm lint
pnpm architecture:check --changed
```

macOS 最近工程结果为 25 项中 24 通过、1 项 Windows 原生注册表测试跳过；Windows 该项已实际失败，不能写成全通过。推送正常执行 pre-push，不绕过门禁。

## 完成时应留下的记录

更新 `specs/aibuddy7se-brand-migration.md` 当前仍待执行的验收表，记录最终代码提交、CI URL、EXE SHA-256 和实际优化耗时。查看最新 diagnostics 的 `startup.png`、`about.png`、`help-menu.png` 与 brand-audit，不只看绿灯。仅文档记录提交可用 `[skip ci]` 避免无意义重打包；代码修改不得跳过验证。

GitHub artifact 下载外层 ZIP 只是传输容器，安装器产物必须恰为一个 EXE，无便携 ZIP。最终给用户 EXE 下载位置，不要声称云端文件已写到已离线的本机 Downloads。保留旧数据，避免泄露真实用户配置/凭据。

Win7 真机、真实 Office 2013 导出、真实模型调用、真实内网 SSH 和实际旧 NSIS 安装器覆盖升级尚未验收；Server 2022/虚构数据结果不能替代这些边界。
