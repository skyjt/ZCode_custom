AIbuddy v3.16.0 面向内网使用和低配置机器，包含以下更新：

- 设置页和 Mermaid 图表改为按需加载，减少首次加载的 JavaScript；精简持续运行的装饰动画，保留状态反馈和原有功能。
- 默认内置六项中文技能：代码审查、SQL 审查、日志排查、数据检查、技术文档和 UOS/Linux 诊断。可在插件设置中按需关闭。
- 按系统和 CPU 架构内置 OfficeCLI 1.0.152，可在本机创建和编辑 DOCX、XLSX、PPTX。安装后无需联网下载 OfficeCLI，默认关闭其更新检查、自动安装和常驻进程。

技能和 OfficeCLI 运行文件均随安装包提供。AI 对话仍需要配置可访问的模型 API。

| 系统                | 安装包            |
| ------------------- | ----------------- |
| Debian 10 x64       | `linux-x64.deb`   |
| Debian 10 arm64     | `linux-arm64.deb` |
| Windows x64         | `win-x64.exe`     |
| macOS Intel         | `mac-x64.dmg`     |
| macOS Apple Silicon | `mac-arm64.dmg`   |

Linux 包经过 glibc 2.28 基线扫描及 Debian 10 容器安装/启动检查。五个平台成包均检查首页、SQLite、终端启动，以及 OfficeCLI 的 Word/Excel/PPT 中文内容读写。UOS 20 实机性能、Office/WPS 排版效果、真实 API、硬件加速及系统权限相关功能仍需在目标环境验证；本次未提供龙芯 LoongArch 或 MIPS 安装包。

macOS 与 Windows 安装包没有开发者发布签名，macOS 包未经过 Apple 公证。请从本仓库 Release 下载，并用 `SHA256SUMS` 核对文件。

AIbuddy 使用独立的 `.aibuddy` 数据目录，不自动覆盖或迁移旧 ZCode 数据。此发行版沿用上游开源许可及第三方署名。
