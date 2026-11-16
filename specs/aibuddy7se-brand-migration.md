# aibuddy7se 完整品牌与升级迁移

## 2026-11-16 Word 解析优化后复验

当前已通过功能验收的代码为 `cf8022914ae6f4e4186a007e91b317cf48feea4e`，仅推送用户 fork
`skyjt/ZCode_custom` 的 `codex/win7-experimental`。
[Windows Actions 43838023557](https://github.com/skyjt/ZCode_custom/actions/runs/43838023557)
（job `133199473145`）全部通过：Windows 工程 36/36、零跳过；真实注册表中文路径、不同
command、其它安装位置/自定义入口负例保留。旧 SQLite/OS 密文迁移、原始数据/冲突保护、
Agent/WinPTY/进程归属、轻量宿主权限、离线 Office/Python/SSH/SFTP/Git、现有 JDK 8/Maven、
技能、PE 与防火墙阻断成包 GUI 均通过，没有新增常驻 JVM。

本轮只减少 Word 文本解析时不参与标题/样式继承的格式子树展开，原文件和查看面板仍保留
格式，文档缓存/所有者/权限边界不变。新旧包同一 Server 2022 runner 完成五轮真实 Bash、
Word 60 次和其它 Office 各 20 次轮换，文件内容、损坏/越界拒绝与原文哈希均通过。
Word 60 次后 working set **123.65 → 104.05 MiB**，private bytes **140.90 → 121.03 MiB**，
平均轮换读取 **27.0 → 16.7 ms**；首次打开 **137.8 → 184.0 ms**、随后首次读取 **2.4 →
35.3 ms**，第 20 到 60 次仍有增长。整体启动 90 秒 working set **957.98 → 954.88 MiB**，
文字均值 **1594.36 → 1689.57 MiB**，没有证明整体 RAM 改善。详细对照、不利结果和下一步
见[内存验收](aibuddy7se-memory.md#2026-11-16-word-样式解析成包验收)。

13 张最终截图已逐一检查，名称/Logo、关于/帮助、中英文自测、深浅代码预览、模型配置、
文字/工具回复与手动 MCP 正常。品牌扫描 28,572 个文本文件，仅 `legacy-data.cjs`、
`legacy-migration.mjs`、`legacy-storage.js` 保留旧识别字符串。自测 12 通过、1 注意、0
失败、1 未测；自动/手动/重进 MCP 检查进程为 0/1/1。根/CLI 类型检查、Office 84 项及
完整 MCP smoke、正常 pre-push 通过；根 Lint 526 既有告警/0 错误，CLI 86 既有告警/0
错误，架构新增/基线违规 0。

[当前验证版单个离线 EXE](https://github.com/skyjt/ZCode_custom/actions/runs/43838023557/artifacts/14212254898)：
`aibuddy7se-3.18.0-win7-intranet-x64.exe`，291,429,328 字节；Actions 外层 ZIP 恰含一个
EXE，没有便携包。实际下载 SHA-256 与 runner 一致：
`b743f9096c863505f73c6b4702371d7e671a093a6225c48d1958bc18147365bf`。
[诊断/截图/同机新旧原始数据](https://github.com/skyjt/ZCode_custom/actions/runs/43838023557/artifacts/14213128002)
保留至 2026-11-30 09:40 UTC（北京时间 17:40）。构建步骤 11 分 36 秒，完整 job 25 分
08 秒（双版本 GUI/Office 对照 8 分 59 秒）；未削减门禁，没有发布 Release 或部署。

真实 Win7、Office 2013、真实模型/内网 SSH/Git/Maven 项目及企业认证、实际旧 NSIS 覆盖
安装仍未验收；Server 2022 与虚构数据不能替代这些验收。后续文档提交不改变安装器源码。
下面保留历史记录；当前下载和结论以本节为准。

## 2026-11-16 调度器与 Office 后复验

该轮已通过功能验收的代码为 `3fce87dd116956f0c20253b5e2172edcdd5907fd`，仅推送用户 fork
`skyjt/ZCode_custom` 的 `codex/win7-experimental`。
[Windows Actions 43829709499](https://github.com/skyjt/ZCode_custom/actions/runs/43829709499)
（job `133171871338`）全部通过：工程 36/36，零跳过；真实注册表中文路径、不同 command、
其它安装位置/自定义入口负例保持执行。旧 SQLite/OS 密文迁移、原数据保留、冲突拒绝、
Agent/WinPTY/进程归属、轻量宿主、离线 Office/Python/SSH/SFTP/Git、现有 JDK 8/Maven、
技能、PE 与防火墙阻断成包 GUI 门禁均保留并通过。

本轮缩小调度器导入范围，四类 Office 解析器改为首次文件访问加载。新旧包在同一 runner
各完成五轮真实只读 Bash、四类 Office 的中文文件读取、20 次轮换、损坏/越界拒绝及原文件
哈希核对。**功能验收通过不等于整体内存优化达标**：启动 90 秒 working set 为
956.38 → 955.58 MiB，文字回复三次均值为 1593.90 → 1663.63 MiB（本次上升 4.37%），
private bytes 为 1448.67 → 1437.09 MiB。Office 首次打开变慢，Word 轮换读取后的占用更高；
局部收益、完整数据及限制见[内存验收](aibuddy7se-memory.md#2026-11-16-调度器与-office-成包对照验收)。

13 张最终截图逐一核对：名称、Logo、关于、帮助、中英文自测、深浅代码预览、模型配置、
文字/工具回复与手动 MCP 连接正常。品牌扫描 28,572 个文本文件，仅 `legacy-data.cjs`、
`legacy-migration.mjs`、`legacy-storage.js` 允许旧识别字符串。新解析器入口和共享 chunk
纳入原品牌转换；自测 12 通过、1 注意、0 失败、1 未测。正常 pre-push 通过，根类型检查
通过，Lint 526 既有告警/0 错误，架构新增/基线违规 0。

[该轮验证版单个离线 EXE](https://github.com/skyjt/ZCode_custom/actions/runs/43829709499/artifacts/14209257226)：
`aibuddy7se-3.18.0-win7-intranet-x64.exe`，291,424,932 字节；外层 Actions ZIP 恰含一个
EXE，没有便携包。实际下载校验与 runner 一致：
`5004501678705a84b17d89eaff96fe92a6caceac278961a2a29c7952f2edd17c`。
[诊断/截图/新旧原始内存数据](https://github.com/skyjt/ZCode_custom/actions/runs/43829709499/artifacts/14209486465)
保留至 2026-11-30 08:38 UTC（北京时间 16:38）。构建步骤 10 分 43 秒，完整 job 23 分
54 秒（含双版本 GUI/Office 对照 9 分 05 秒）。没有发布 Release、部署或写入离线电脑 Downloads。

真实 Win7/Office 2013、真实模型/内网 SSH/Git/Maven 项目及企业认证、实际旧 NSIS 覆盖安装
和完整退出重启升级仍未验收；不将 Server 2022 与虚构样本当作这些验收。随后文档提交不改变
上述安装器对应代码。下面保留此前各轮历史记录。

## 2026-11-16 设置查询与轻量宿主后复验

该轮已验收运行时代码 `a44a27aa3a97c18425c95a745447aefcd4832d6d`，仅推送用户 fork 的
`codex/win7-experimental`。[Windows Actions 43812974790](https://github.com/skyjt/ZCode_custom/actions/runs/43812974790)
（job `133118609641`）全绿：工程 33/33，真实注册表安全负例未删除/放宽；旧 SQLite/OS 凭据
迁移、原始数据/冲突保护、Agent/WinPTY、Office/Python、SSH/SFTP、Git/JDK 8/Maven、技能、
PE 和防火墙 GUI 门禁均通过。新增轻量宿主 stdio/中文参数/环境清洗及授权正负例通过；自动
插件页不启动 MCP 检查树，手动检查与再次进入复用原 owner 的 GUI 回归通过。

12 张最终截图逐一核对，名称、Logo、关于与帮助正确，中英文自测和深浅代码预览正常。
品牌扫描 28,563 个文本文件，仅原三份迁移识别模块允许旧标识；新 `plugin-host.cjs` 已纳入
同一构建品牌转换。成包自测 12 通过、1 注意、0 失败、1 未测。

[该轮单个离线 EXE](https://github.com/skyjt/ZCode_custom/actions/runs/43812974790/artifacts/14201458321)：
`aibuddy7se-3.18.0-win7-intranet-x64.exe`，291,499,677 字节；Actions 外层 ZIP 恰含一个 EXE，
没有便携包。实际下载文件 SHA-256 与 runner 一致：
`45942d5603520c8fb3b36aea9144f7ef43d0bc1e2d63b9ca7b5fe8123e2a3110`。
[诊断/截图](https://github.com/skyjt/ZCode_custom/actions/runs/43812974790/artifacts/14201612658)
保留至 2026-11-30 06:09 UTC（北京时间 14:09）。未写入离线电脑 Downloads。

同 runner 对照旧包 43805639768：插件页与首次纯文本回复后的三次 working set 均值由
2869.14 降为 1663.59 MiB（−42.02%），private bytes 由 2363.48 降为 1458.59 MiB（−38.29%），
24 个进程变为 16 个。启动 90 秒仍为 950.22 MiB，基础高占用尚未解决；完整测量边界见
[内存验收](aibuddy7se-memory.md#2026-11-16-设置查询与轻量宿主成包验收)。

真实 Win7/Office 2013、真实模型/内网 SSH/Git/Maven 项目与企业认证、实际旧 NSIS 覆盖安装
仍未验收。随后文档提交不改变以上安装器对应代码；历史验收记录保留如下。

## 产品规则

用户明确要求内部标识改名并迁移旧数据。Win7 发布包使用 aibuddy7se：名称、图标、元数据、IPC/preload、环境变量、协议、资源/插件路径及数据库身份表。仅迁移识别代码可以保留旧标识；法律署名保留原作者 Z.AI。开发仓库路径、上游源码包名和 Git 历史不属于安装产品，现代构建不变。

构建拥有发布身份：复用 base.afterPack 的 sourcemap 清理 staging，仅转换 Win7 的 UTF-8 代码和资源路径，在同一次 ASAR 封装中完成品牌转换；既有原生依赖检查照常执行，extraResources 随后转换并刷新安装清单。禁止修改第三方二进制内容；必须实际启动转换后的 Host/Agent/UI。源码级名称继续供上游工程使用，不能通过另一个 UI 状态副本处理品牌。安装器 GUID 固定为旧版的同一不透明 UUID，确保覆盖升级；新 appId 为 dev.aibuddy7se.app，协议为 aibuddy7se。仅生成离线 EXE，不生成便携 ZIP。

默认业务目录从 ~/.zcode-win7-home/.zcode 迁至 ~/.aibuddy7se-home/.aibuddy7se；Electron userData 从 APPDATA/ZCode Win7 Experimental 迁至 APPDATA/aibuddy7se。自定义 dataBaseDir 下的 .zcode 迁为 .aibuddy7se；用户共享配置 ~/.zcode 复制至 ~/.aibuddy7se。HOME、USERPROFILE、真实工作区路径、workspaceIdentity、用户文档/消息、API 地址和密钥明文不能做品牌替换。已有源目录保留，作为升级前副本。

Bootstrap 是唯一迁移所有者，在导入 Main/Host 前执行。旧实例仍运行时拒绝迁移。每个目标目录使用同级临时副本和完成标记，验证后原子 rename 发布；已有未标记目标拒绝覆盖。重复启动跳过已完成目标；中途失败只清除本次临时副本，不删源/目标。SQLite 使用在线备份 API 取得一致快照，再事务迁移 schema/结构化内部标识；历史迁移 checksum 只接受当前源码生成的旧值，匹配后转换为新值，未知值立即失败。会话 ID、消息正文和 workspace identity 保持。

凭据不能直接移动：OS 密钥项由服务名和凭据文件绝对路径的 SHA-256 共同定位。迁移验证旧密文可解密，将同一随机密钥写到新服务/新路径，读取复核；已有不一致目标密钥拒绝覆盖。v1 使用旧解码器认证后转成 v2，禁止把解密失败当作明文、禁止日志记录凭据。旧识别字符串仅留在独立 migration 模块。

Bootstrap 在数据迁移成功后、加载 Main 前，清理 HKCU 中指向当前可执行文件的旧 Directory/Drive 右键菜单及旧 URL 协议键；Main 沿用现有唯一注册路径创建新名称入口。只接受旧版本实际生成的完整 command（路径比较不区分大小写），其它安装位置、开发入口或用户自定义命令不删。不存在的键视为已完成，删除失败拒绝进入应用；重复启动无副作用。

默认 command 由 Win7 自带 PowerShell 2.0 / .NET Registry API 读取，仅接受 REG_SZ；UTF-8 内容经 Base64 输出，避免系统代码页损坏中文路径。在 JavaScript 中核对完整命令（不区分大小写），不能以 reg query 的过滤结果或退出码判断归属。读取错误拒绝迁移；缺少值/非 REG_SZ/不同命令保留。工程门禁使用隔离的真实 Windows 注册表键验证中文路径、不同安装位置、自定义参数及非字符串值。

```mermaid
sequenceDiagram
  participant Bootstrap as Bootstrap（唯一迁移所有者）
  participant Old as 旧实例/旧目录
  participant Stage as 临时副本 + 系统凭据库
  participant Main as 新版 Main/Host/Agent
  Bootstrap->>Old: 取得旧实例锁；读取目录和 settings
  Bootstrap->>Stage: 一致备份、结构化迁移、密钥复制与验证
  Stage-->>Bootstrap: 数据验证成功
  Bootstrap->>Stage: 完成标记 + 原子发布
  Bootstrap->>Old: 释放实例锁（保留源数据）
  Bootstrap->>Old: 移除指向本 EXE 的旧 Windows 菜单/协议键
  Bootstrap->>Main: 新环境/目录，导入主程序
```

## 影响及验收

升级 GUI 验收必须实际从旧 SQLite 和 OS 密文启动。若在 DevTools/窗口出现前失败，Bootstrap 输出不含路径或密钥的阶段日志，Windows CI 保存一次性 runner 的桌面错误窗口截图；不能增加等待时间或改回无旧数据的新装来绕过失败。

Windows 虚构用户 fixture 必须在启动前创建 AppData/Roaming、AppData/Local 并设置 APPDATA/LOCALAPPDATA，不能只覆盖 HOME/USERPROFILE。运行 43401763520 的原生错误截图确认，缺少这些目录会使 Electron 在进入迁移前抛出 `Failed to get 'appData' path`；此证据不能归因为迁移数据库或密钥失败。

验收当前实际挂载的工作区帮助菜单（旧 WindowsCaptionMenuButton 已无调用）：保留关于、资源管理器和导出日志；不提供上游反馈、需求、社区和产品文档入口，也不探测社区。仅更换 URL 中的名称会产生不存在的品牌域名，因此不能以文本替换代替入口清理。

缺少模型时，Win7 错误横幅只引导配置自定义模型，保留设置按钮，移除云套餐升级按钮；其它错误保留复制、详情、重试/重连，不提供云反馈按钮。现代/Web 文案与动作不变。运行 43404254541 的真实 GUI 暴露了该遗漏，并证明旧 SQLite/密文迁移已正常进入工作区；关于窗口标题将产品名与版本放在同一个 h1，验收按完整 heading 校验，不按单独的文本元素查找产品名。

实际依赖以 rg 与受控模块上下文核对（本环境无 Codegraph）。入口：Win7 builder/installer/bootstrap → credential-security、session SQLite → preload/UI、Agent、离线工具。现代/Web 不改变运行语义；Desktop continuous 与远端 replayable 仍由既有 owner 管理。远端独立旧版服务不升级成新版协议，需使用相同品牌版本。

| 场景                             | 必须断言                                      | 证据                                                                      |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| 新装、重复启动                   | 新标识/新目录，只有新 preload，启动自测可运行 | 43408181317：工程 + 成包 GUI 通过（新装/系统自测；迁移 fixture 重复运行） |
| 默认/自定义旧数据                | 原文/路径/身份不变，新表/协议/键有效，源不变  | 43408181317：真实 schema 的虚构 SQLite/JSON fixture 通过                  |
| 密文 v1/v2、缺失 OS key          | 可验证读取；缺密钥拒绝且不发布目标            | 43408181317：v1/v2、缺 key 工程回归及成包 Windows OS 密钥迁移通过         |
| 目标已有数据、重复迁移、失败重试 | 无覆盖、无丢失、幂等完成                      | 43408181317：冲突、幂等及失败保留源数据工程回归通过                       |
| 成包资源/安装元数据              | 无活跃旧标识，迁移识别允许；新图标，EXE-only  | 43408181317：28,547 文本扫描 + Server 2022 成包 GUI 通过，EXE-only        |
| Win7 / Office 2013 实机          | 真机安装、旧配置/会话、Office/PDF             | 本地环境不可验证，不以 Server 2022 替代                                   |

## 2026-11-13 云端验收记录

运行时代码为 `4e336a8bbbe1b564c228053987735f887e4e2bf6`，已正常推送到用户 fork 的 `codex/win7-experimental`，未推送上游。[Windows Actions 43408181317](https://github.com/skyjt/ZCode_custom/actions/runs/43408181317) 全部通过（job `131827629878`）。记录提交仅更新文档，不改变该产物对应的运行时代码。

- 修复证据：此前 43406675895 在真实 Windows 的不同 command 负例失败（`true !== false`）。现改为 .NET 读取默认 REG_SZ，经 Base64 传输 Unicode；真实 Windows 原生中文路径、不同安装路径、自定义参数、REG_EXPAND_SZ 拒绝及键不存在检查全部通过。工程回归 25/25 通过，无跳过；安全负例保留。
- 云端 Linux：Node 24.14.0、pnpm 10.33.2；`pnpm typecheck` 通过；`pnpm lint` 538 条既有告警、0 错误，本次工程文件专项扫描 0 告警/错误；架构新增/基线违规均 0；正常 pre-push 门禁通过。Linux 工程回归 24 通过、1 项 Windows 原生检查跳过，另由上述 Windows 运行全部验证。
- 成包检查：Windows 系统 API、现代/legacy 进程归属、Agent stdio/SQLite/Job、WinPTY、真实 Windows Credential Manager 与旧密文迁移、离线 Python/Office 库、SSH 命令/错误 host key 拒绝/SFTP 字节回环、离线技能发现、PE 静态导入全部通过。Firewall 启用后阻断应用出站，旧 SQLite/OS 密文 fixture 实际进入工作区，GUI 检查通过。
- 人工查看 diagnostics 的 `startup.png`、`about.png`、`help-menu.png`：新 Logo/名称正确，关于标题包含版本 3.18.0，帮助菜单无上游反馈/社区/文档，缺模型提示为配置自定义模型且无 Upgrade。`brand-audit.json` 扫描 28,547 个文本文件通过；仅三份迁移识别文件保留旧名称。
- 下载后的外层 artifact ZIP 恰含一个 `aibuddy7se-3.18.0-win7-intranet-x64.exe`（254,572,283 字节），无便携 ZIP。实际 EXE SHA-256 与 runner `SHA256SUMS.txt` 一致：`1c266bf0387b055934b0d3952a0c0e924726612a09b1586d69e8d93010b2768b`。[EXE 下载 artifact](https://github.com/skyjt/ZCode_custom/actions/runs/43408181317/artifacts/14028309752)；[诊断截图与校验记录](https://github.com/skyjt/ZCode_custom/actions/runs/43408181317/artifacts/14028967414)。Artifacts 保留 14 天，外层 ZIP 仅为 GitHub 传输容器。
- 优化实测：继续沿用品牌与 sourcemap 同一次 ASAR 解封装，完整处理耗时 109,846 ms（解包 32,561 ms，重新封装 47,726 ms），原生依赖检查照常执行。安装器构建步骤 11 分 43 秒，整个 job 16 分 05 秒；不能把单阶段优化称为整体耗时固定下降。本次未移除或放宽任何 Actions 门禁。

仍未验收：Win7 SP1 x64 真机/PowerShell 2.0/.NET 3.5、真实 Office 2013 导出、真实模型与内网 SSH、实际旧 NSIS 覆盖升级和完整应用退出后重启升级。Server 2022 的虚构 fixture 与无 Office 的 COM 探针不能替代这些验收；已有原始数据保留规则仍适用。

## 2026-11-13 内存优化后复验

该轮交付运行时代码为 `ddd6e31003b6ca4b6e5d4a18fd9110928840254a`，已正常推送到 `skyjt/ZCode_custom` 的 `codex/win7-experimental`，未推送上游。[Windows Actions 43485739797](https://github.com/skyjt/ZCode_custom/actions/runs/43485739797) 全部通过（job `132093688183`）；此记录现为历史证据，当前下载见下方 2026-11-16 记录。

- 原有迁移、安全负例与离线能力门禁全部保留并重新通过。Windows 工程回归现为 29/29，无跳过，真实注册表不同 command 负例仍执行；真实旧 SQLite/OS 密文、源数据保留、冲突拒绝、Agent/WinPTY、Office 库、SSH/SFTP、技能、PE 导入及防火墙阻断成包 GUI 均通过。
- 最终本地 Node 24.14.0 / pnpm 10.33.2 类型检查通过，Lint 533 条既有告警、0 错误，架构新增/基线违规 0，正常 pre-push 门禁通过。Linux 工程回归 27 通过、2 项 Windows 原生检查跳过；上述 Windows 运行补齐验证。
- 人工查看最终启动、关于、帮助菜单、浅色/深色代码预览、系统自测、模型设置和首次回复截图；名称/Logo/版本正确，缺模型提示只引导自定义模型，没有云升级或上游社区入口。首次发送真实经过 UI 与共享 Agent 到本机虚构模型并显示回复，只有一个聊天 runtime；不是实际内网模型验收。
- `brand-audit.json` 扫描 28,553 个文本文件通过，仍仅 `legacy-data.cjs`、`legacy-migration.mjs`、`legacy-storage.js` 保留旧识别字符串。新版没有修改原始数据保留及 Windows 自定义入口保护规则。
- [该轮 EXE 下载](https://github.com/skyjt/ZCode_custom/actions/runs/43485739797/artifacts/14069470959)外层 artifact ZIP 恰含一个 `aibuddy7se-3.18.0-win7-intranet-x64.exe`，254,611,286 字节，无便携包。下载后实际 SHA-256 与 runner 记录一致：`512861188eb378e6adfe78e2f9e2d027039eea645a1907f601204ff795be08ae`。[该轮诊断与截图](https://github.com/skyjt/ZCode_custom/actions/runs/43485739797/artifacts/14068442796)，保留期 14 天。
- 同机对照：启动就绪 90 秒工作集合计由 1166.57 降至 929.41 MiB；配置模型但未发送时由 2480.32 降至 944.85 MiB。启动 30 秒仍约 1372 MiB，打开插件页并首次回复后仍约 2910 MiB；本轮不能声称活动任务或真实浏览器内存已解决。口径、完整数据与取舍见[内存优化 spec](aibuddy7se-memory.md#2026-11-13-最终成包验收)。

上方 Win7 真机、PowerShell 2.0/.NET 3.5、真实 Office 2013、真实模型/内网 SSH、实际旧 NSIS 覆盖安装及完整退出重启升级的未验收范围仍然成立。文档记录提交不改变此已验收 EXE 对应的运行时代码。

## 2026-11-16 Git 与 Java 开发能力后复验

该轮交付运行时代码为 `121ad70a55273e1327175f3867b1d19743035234`，已正常推送到用户 fork 的 `codex/win7-experimental`，未推送上游。[Windows Actions 43805639768](https://github.com/skyjt/ZCode_custom/actions/runs/43805639768) 全部通过（job `133095663892`）。本轮加入随包 Git，并按用户选择复用已安装 JDK 8/Maven；具体行为、原生 wincred 修复与完整证据见 [Java 开发环境 spec](aibuddy7se-java-development.md#2026-11-16-最终成包验收)。

- Windows 工程 33/33，无跳过。原注册表不同 command/安装位置/自定义入口安全负例、旧 SQLite/真实 OS 密文迁移、源数据保留与冲突拒绝重新通过。Agent/WinPTY、Office/Python 库、SSH/SFTP、技能、PE 导入及防火墙阻断 GUI 门禁全部保留并通过。
- 打包前与成包后原生 Git 均通过：中文路径仓库操作、SSH/HTTPS clone 和新提交 push、远端 ref 核对、错误主机/证书拒绝；原生 wincred 保留错误密码不删除、正确密码删除和 Unicode/OAuth 字段的真实凭据断言。Java 8 固定 UTF-8 样本编译/运行及 Maven 版本探测通过，不等于真实项目构建已验收。
- 本地类型检查通过，正常 pre-push 的 Lint 为 533 条既有告警、0 错误，schema/工程/架构门禁通过。人工逐一核对最终中英文开发自测、启动、关于、帮助、深浅代码预览/设置、模型配置与首次回复截图：名称/Logo/版本正确，无云升级或上游社区入口。成包自测 12 通过、1 注意、0 失败、1 未测；真实 UI 经共享 Agent 到虚构模型首次回复通过，只启动一个聊天 runtime。
- `brand-audit.json` 扫描 28,562 个文本文件，仅三份原迁移识别模块允许旧字符串。旧原始数据保留和其它安装位置/自定义 Windows 入口保护规则不变。
- [该轮 EXE 下载](https://github.com/skyjt/ZCode_custom/actions/runs/43805639768/artifacts/14198479433)：外层 ZIP 恰含一个 `aibuddy7se-3.18.0-win7-intranet-x64.exe`，291,404,424 字节，无便携包。实际下载文件的 SHA-256 与 runner 一致：`29b5a141c608a79d7ae330d77ac224d33fb001441683288a1f4e9b3a75b86ae4`。[该轮诊断与截图](https://github.com/skyjt/ZCode_custom/actions/runs/43805639768/artifacts/14198972317)，保留至 2026-11-30 04:58 UTC。
- 本轮保留已有内存优化，但没有旧包同机对照。工作区就绪 30/90 秒工作集合计为 1374.40/963.14 MiB，配置模型未发送为 959.16 MiB，插件页与首次回复后为 2916.21 MiB；所有采样均无 java/javac 常驻进程。不能声称初始启动和任务高占用已经解决。

Win7 真机/PowerShell 2.0/.NET 3.5、真实 Office 2013、真实 Java 项目/内网 Git/Maven 及企业认证、真实模型/内网 SSH、实际旧 NSIS 覆盖安装与完整退出升级重启仍未验收。此记录提交仅改文档，安装器对应代码仍为上述 `121ad70a`。
