AIbuddy 桌面版：统一应用、进程、配置和图标品牌；移除产品账号登录与套餐入口，直接在「设置 → 模型设置」接入自建或第三方 API。

| 系统                | 安装包            |
| ------------------- | ----------------- |
| Debian 10 x64       | `linux-x64.deb`   |
| Debian 10 arm64     | `linux-arm64.deb` |
| Windows x64         | `win-x64.exe`     |
| macOS Intel         | `mac-x64.dmg`     |
| macOS Apple Silicon | `mac-arm64.dmg`   |

Linux 包经过 glibc 2.28 基线扫描及 Debian 10 容器安装/启动检查。各平台成包均检查首页、SQLite 和终端启动；真实 API、硬件加速及系统权限相关功能仍取决于目标环境。

macOS 与 Windows 安装包没有开发者发布签名，macOS 包未经过 Apple 公证。请从本仓库 Release 下载，并用 `SHA256SUMS` 核对文件。

AIbuddy 使用独立的 `.aibuddy` 数据目录，不自动覆盖或迁移旧 ZCode 数据。此发行版沿用上游开源许可及第三方署名。
