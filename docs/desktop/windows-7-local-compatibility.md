# Windows 7 SP1 x64 本地试验版

源码基线：`b95ebaffeab641907b38652f45c1502bd762972d`，ZCode `3.18.0`。规格日期：2026-11-11。

## 已确认的选择

用户选择社区移植运行时路线，接受兼容性与维护不确定性；必须在 Win7 本机读写项目、运行终端与 Agent。GitHub Actions 在现代 Windows 上构建，用户在自己的 Win7 SP1 x64 电脑安装验收。现代 Windows CI 通过不代表 Win7 验收通过。

保留 React、Tailwind、Node SQLite、现有 Host/Agent 和业务依赖。官方 Electron 23 起不支持 Win7；降级 Electron 22 会同时退回 Node 16 / Chromium 108，无法直接运行当前 ESM、`node:sqlite` 与 Tailwind 4。Tauri/WebView2 109 也不解决本机 Node 后端问题。[Electron 公告](https://www.electronjs.org/blog/windows-7-to-8-1-deprecation-notice)、[Node SQLite](https://nodejs.org/api/sqlite.html)、[Tailwind 浏览器要求](https://tailwindcss.com/docs/upgrade-guide)。

固定试验运行时，不修改现代版 Electron 44.7.0 与锁文件：

| 项       | 固定值                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| 来源     | [e3kskoy7wqk/Electron-for-windows-7 v44.2.0](https://github.com/e3kskoy7wqk/Electron-for-windows-7/releases/tag/v44.2.0) |
| 上游提交 | `1086a0a7c6b7105f300a4af8724e6d996ce3c347`                                                                               |
| 运行时   | Electron 44.2.0 / Chromium 152.0.7977.76 / Node 24.20.0                                                                  |
| 发布资产 | `dist.zip`，win32-x64，158905110 字节                                                                                    |
| SHA-256  | `c50ba2c10c87331ab961f60569e4d906c8514921ac17e138fd0da21ee4ddb2b1`                                                       |

下载必须校验固定 SHA-256，禁止失败时回退到官方新运行时。社区声明是候选依据，实际依赖和机器兼容性仍须验证。[其他项目采用同一运行时的移植记录](https://github.com/factfinding/dsh-win7/blob/main/docs/porting.md)仅作参考，不算 ZCode 的测试证据。

## 产品规则与范围

1. 独立名称 `ZCode Win7 Experimental`、appId、安装目录与 Electron userData。默认业务目录为 `%USERPROFILE%/.zcode-win7-home/.zcode`，不导入正式版数据库。
2. 复用既有 `ZCODE_DESKTOP_HOME_DIR` / `ZCODE_DATA_BASE_DIR` 隔离机制；早期设置读取、默认工作区与设置服务必须使用同一隔离 home。CLI 的默认数据库和 storage.dir 不读取 DATA_BASE_DIR，入口必须同时设置已有的 `ZCODE_SESSION_DB_PATH` / `ZCODE_STORAGE_DIR`，清除旧别名 `ZCODE_SESSION_DB`，避免写正式版会话库。入口与 Agent smoke 共用同一环境构造，验收路径必须等于指定临时数据库。
3. 编译期关闭自动更新；不发布到现代版更新源。产物是未签名试验 NSIS 安装器与 zip；每次手动测试升级，卸载不删除项目或业务数据。
4. 核心目标：打开工作区、文件编辑/搜索、模型对话/流式输出、工具审批/取消、本地终端、基本 Git、历史重启恢复。Windows 7 的 Git/外部 MCP/外部 shell 需由用户安装其兼容版本，包内 Agent 不依赖系统 Node。
5. 当前 `packages/zcode-cua` 明确为占位包，不恢复已删除的 Computer Use 实现。复杂浏览器预览和其他扩展只按实测声明支持。
6. 不关闭 TLS 校验、Chromium sandbox、权限检查或凭据保护来换取启动成功。

沿用原有 `zcode://` OAuth/工作区 deep link。与现有 Preview 一样，最后启动/注册的版本会成为该链接的处理器；数据目录和安装身份独立，但 deep link 并非独立通道。

保留操作系统 HOME/USERPROFILE，Git、SSH 等用户工具使用真实用户目录。因此用户级 `.zcode/AGENTS.md` 和 CLI `config.json`（MCP/插件等）仍按原规则共享；不要把试验版当作完全隔离的用户账户。试验版数据库、应用设置和凭据文件使用独立目录。

## 状态与平台边界

Main 仍负责窗口/转发，window-scoped Local Host 负责 owner/lease 与路由，CLI `CommandInbox` 负责串行 admission。`workspaceIdentity?.trim() || workspacePath`、remoteSessionId、stale run 防护不变。Desktop 连续流与手机 replayable 恢复语义不变；本次不修改协议、数据库 schema 或会话所有者。

### 终端

复用 node-pty 1.1.0 自带 WinPTY 预构建。Windows build < 18309 选择 `useConpty:false,useConptyDll:false` 并向 xterm 返回 `winpty`；现代 Windows 保持现有 ConPTY 与 DLL 加载失败回退。未知 build 按 node-pty 的 WinPTY 下限策略处理。分界来自锁定版本 node-pty 的实现；系统 [ConPTY 从 Windows 10 1809 引入](https://learn.microsoft.com/en-us/windows/console/createpseudoconsole)。WinPTY 文件必须随包解压部署。

CI 已复现 node-pty 1.1.0 的 WinPTY 在 shell 退出后未释放 ConoutConnection worker，所有检查输出 PASS 后 Node 进程仍不退出。对锁定依赖保留一个 pnpm patch：仅 WinPTY 输出 socket close 时调用已有的 connection.dispose，保持原有 drain/worker termination 实现；不强制 process.exit 掩盖泄漏。smoke 的外层进程超时是失败判据，必须自然退出才通过。

### 搜索工具

仓库的 ripgrep 14.1.1 Windows 预构建与该版本上游官方预构建均静态导入 `api-ms-win-core-synch-l1-2-0.dll` 的 `WaitOnAddress` / `WakeByAddress*` 和 `bcryptprimitives.dll` 的 `ProcessPrng`，不能在原生 Win7 加载（`llvm-objdump -p` 已确认）。试验构建使用 Rust 1.77.2、ripgrep 14.1.1 的发布 Cargo.lock、PCRE2 与静态 CRT，替换试验 staging 的 `rg.exe`；现代构建资产不变。包内 smoke 必须执行一次真实中文内容的 JSON 搜索。node-pty 的 WinPTY 组件与 ugrep 预构建未发现上述静态导入；这不替代真机加载测试。

### 系统凭据

`@napi-rs/keyring` 2.1.2 的 Windows 预构建还静态导入上述新 API 与 `GetSystemTimePreciseAsFileTime`。保留同版本、同 API、同 Windows Credential Manager 后端，按上游提交 `52184fbebffeef8a061234f60f313c479b954f9f` 重编译 binding。固定 `nightly-2026-11-01`，使用 [Rust 的 Win7 Tier 3 target](https://doc.rust-lang.org/rustc/platform-support/win7-windows-msvc.html) `x86_64-win7-windows-msvc` 和 `-Z build-std`、静态 CRT；源 archive 的 SHA-256 见 `scripts/win7/runtime.json`。

只在 Win7 构建和打包期间替换原生文件，使桌面和 Agent staging 使用同一兼容 binding，打包结束恢复安装目录的原文件。现有凭据加密所有者、cipher/密钥存储接口和目录摘要标识不变，不改成明文或另建凭据数据库。包内 smoke 分别加载桌面和 Agent binding，对唯一临时名称执行系统凭据库写/读/删，不接触用户现有条目；最终 PE 检查拒绝已知 Win8+ 静态导入。

### Agent 进程归属

Windows 10+ 保持 `PROC_THREAD_ATTRIBUTE_JOB_LIST` 创建时归组。Win7 不支持此属性，采用同一 helper 的短命 bootstrap 子进程，不能把普通 CLI spawn 后再 attach 当成安全实现。

```mermaid
sequenceDiagram
    participant Host as Local Host
    participant Helper as supervisor（Job 所有者）
    participant Boot as bootstrap（不执行用户代码）
    participant CLI as 本机 CLI / CommandInbox
    Host->>Helper: 独立控制管道 + stdio
    Helper->>Helper: 验证 Host 身份，创建 KILL_ON_JOB_CLOSE Job
    Helper->>Boot: 仅继承 stdio、Job、结果管道、supervisor 句柄
    Boot->>Boot: self-assign Job，关闭继承的 Job 句柄
    Boot->>CLI: CREATE_SUSPENDED（内核继承 Job）
    Boot->>Helper: DuplicateHandle 交回进程/线程句柄与 PID
    Boot->>Boot: 退出，不保留 Job 句柄
    Helper->>Helper: 核验归属
    Helper-->>Host: ready（真实 CLI PID）
    Host->>Helper: 安装监听后 start
    Helper->>CLI: ResumeThread
    Host->>Helper: EOF / close
    Helper->>CLI: 1800ms 宽限后 TerminateJobObject
    Helper-->>Host: 内核 ActiveProcesses=0 后 empty
```

bootstrap 在归组前崩溃不会创建 CLI；supervisor 在此时崩溃，bootstrap 归组并关闭最后一个 Job 句柄时被内核终止。归组之后所有后代从创建起就在 Job 中。supervisor 始终是唯一长期持有者，bootstrap 只是有限交接；不依赖 PID/PPID 枚举补杀。继承句柄用显式 HANDLE_LIST 限定，用户 CLI 只继承 stdio。

若 supervisor 已在其他 Job 中，先查询外层 Job 的限制；允许 breakaway 时使用 `CREATE_BREAKAWAY_FROM_JOB`，否则必须通过 bootstrap self-assign 证明可嵌套（现代 CI runner 的 Job）。Win7 无嵌套支持且无法脱离时明确拒绝，不执行未归组的 CLI。ready/start/close/root/empty 协议、幂等关闭、deadline 不释放归属等现有 TS 契约不变。现代 CI 使用单独的强制旧路径验收 binary，额外注入 before-join、after-join、after-create 三个 supervisor 崩溃点；避免只验证 Win10 快路径。

## 修改覆盖面与验证

- 平台：`terminalService.ts` 的统一选择；native `main.cpp` / CMake、现有 native 与 Host acceptance。
- 隔离：打包入口与配置，早期数据设置和默认工作区读取；复用现有身份/路径 override。
- 分发：独立构建脚本、固定运行时清单、GitHub Actions；复用已有 runtime staging 与 builder 校验。
- 验证：工程脚本回归、native acceptance（现代及 legacy）、实际社区 Electron 下 SQLite/PTY/原生模块 smoke、打包构建、typecheck、lint、架构检查。不得新增已退役的 App 业务单测。
- 范围外：旧 Node/SQLite 驱动移植、UI 重写、新会话状态、已删除的内部服务、正式更新通道发布。

## Win7 真机验收清单（由用户执行）

从本次 Actions 的 `ZCode-Win7-Experimental-x64` artifact 下载并解压，先安装其中的 `.exe`；也可解压内部应用 `.zip`，运行 `ZCode Win7 Experimental.exe`。安装器完成后不自动启动，手动从开始菜单或解压目录启动。包不自带 Git，基本 Git 功能需要已有 Win7 兼容 Git。

若启动或终端失败，在应用安装/解压目录打开 `cmd.exe`，执行以下命令，将 `%TEMP%/zcode-win7-check.txt` 中的错误提供给维护者。诊断使用包内 Electron，无需另装 Node，也不会请求模型或读取凭据：

```bat
set ELECTRON_RUN_AS_NODE=1
"ZCode Win7 Experimental.exe" "resources\win7\runtime-smoke.cjs" "resources\app.asar" > "%TEMP%\zcode-win7-check.txt" 2>&1
set ELECTRON_RUN_AS_NODE=
```

默认应用日志位于 `%USERPROFILE%/.zcode-win7-home/.zcode/v2/logs`；只提供相关报错段，删除凭据、私有文件内容和内部地址。

安装前记录 `winver`、CPU、显卡、系统补丁、VC 运行库、Git 与 shell 版本。使用虚构文件与测试模型；日志不能包含凭据。

| 场景      | 合格标准                                                   |
| --------- | ---------------------------------------------------------- |
| 安装/启动 | 无系统 Node 时能打开窗口；错误保留完整诊断                 |
| 隔离      | 正式版数据不变，试验版重启读取自己的历史                   |
| 本地项目  | 中文/空格路径可打开、读写保存、搜索                        |
| Agent     | 流式对话；批准一次工具调用；拒绝一次；取消运行有效         |
| 输入时序  | running 时追加输入不重复执行、重启可恢复历史               |
| 终端      | 中文输出、输入、调整尺寸、Ctrl+C、关闭均正常               |
| Git       | 兼容 Git 的 status/diff 正确                               |
| 故障      | 强制结束 Host/helper 后所属 Agent/后代退出，不误杀其他程序 |
| 界面      | 编辑器、菜单、终端、差异页、明暗主题可用                   |
| 卸载      | 项目与业务数据保留                                         |

## 验证记录

基线 freshness 通过。已按 mise.toml 安装 Node 24.14.0 / pnpm 10.33.2 的冻结依赖；架构基线 0 违规。社区 zip 已在 macOS 下载并校验 SHA-256。实现、CI 结果与未通过项在交付时补录；这些准备步骤不构成 Win7 运行验证。
