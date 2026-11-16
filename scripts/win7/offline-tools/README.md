# Win7 离线工具包

本目录随 aibuddy7se（Win7 特别版）安装，Python、Office 库、PuTTY 和 Git 均已就绪。无需在内网执行 pip/npm 下载。模型服务仍需在应用设置中配置为可达的内网 API。

首次部署到 Win7 SP1 x64 时，管理员先检查并按需安装 `prerequisites/Windows6.1-KB3063858-x64.msu`（替代 KB2533623）和 `prerequisites/vc_redist.x64.exe`（VS 2019 x64 运行库，含 UCRT 安装支持），按安装器提示重启。已有更新可能提示“不适用/已安装”，不要卸载现有系统更新。两个文件来自微软；`manifest.json` 提供固定下载来源和 SHA-256。应用不会自动提权或修改系统补丁。

仅交付离线 EXE 安装器。如果应用还不能启动，可在安装目录的 `resources/offline-tools/prerequisites` 找到前置包；也可用已有 7-Zip 打开 EXE，提取其中 `app-64.7z` 的内容。不要把缺失 DLL 从网上随意复制到系统目录。

在 aibuddy7se 终端运行：

```bat
python -B -X utf8 -c "from docx import Document; from openpyxl import Workbook; from pptx import Presentation; print('Office ready')"
plink.exe -V
psftp.exe -V
```

完整本机诊断（CMD/PowerShell/Git Bash）：

```bat
python -B -X utf8 -c "import os,runpy; runpy.run_path(os.path.join(os.environ['AIBUDDY7SE_OFFLINE_TOOLS'],'smoke.py'),run_name='__main__')"
```

Office 操作见 `office.md`；SSH/SFTP 在聊天中使用 `ssh-sftp` 内置技能，或直接打开 `putty/PUTTY.EXE`。安装目录只读，所有文档和脚本输出到自己的工作区。

## Java 开发环境

随包 `git/cmd/git.exe`（MinGit 2.46.2）自动加入本应用 PATH，复用现有 Git 界面和终端；不改系统 PATH 或用户 `.gitconfig`。默认凭据使用 Windows 原生 wincred；不依赖 GCM/.NET 4.7.2。MinGit 未附交互式 Git Bash 和 Git LFS，终端仍使用已有 Git Bash 或 CMD。

wincred 组件使用已修复缓冲区问题的固定上游源码构建，源码与构建说明保留在 `git/sources/wincred`。HTTPS 使用 Schannel 和 Windows 证书信任，企业 CA 仍由原环境管理；应用不关闭证书或 SSH 主机验证。

JDK 8 和 Maven 使用电脑现有安装。设置 → 常规 → 系统能力自测会显示 Git、Java/javac 和 Maven 版本；JDK 8 会编译运行一次临时 UTF-8 样本。JAVA_HOME 与 PATH 不一致时报告注意，不自动切换。Maven 仅检查版本及默认 settings.xml 是否存在，不读取凭据、不修改 `.m2`、不下载依赖，也不代表真实项目能离线构建。企业仓库、证书、项目 Wrapper 和依赖继续使用原项目配置。

## Office 和许可

已有 Microsoft Office 2013 时，可用 `office_native.py` 做 DOC/XLS/PPT 转新格式、Excel 公式重算和三类 PDF 导出。该工具不需要安装 LibreOffice 或 pywin32，先运行 `probe` 检查组件注册，再按 `office.md` 做真机验收；操作前保存并关闭对应 Office 组件。现有 Python 内容编辑无需 Office。

包含 DOCX/XLSX/PPTX 内容编辑、PDF 读写/拆合、图片、CSV/JSON/YAML、SQLite、ZIP 与 SHA256。Python 库只保留公式文本，计算需调用已安装 Excel；没有内置 LibreOffice、Microsoft Office、Poppler、OCR 或模型权重。既有预览不等于完整 Office 编辑器。包内操作说明见 `office.md`，完整验证指南随 GitHub Actions 的诊断产物提供。

许可：Python 自带 LICENSE.txt；Python 库的许可保留在各 `.dist-info` 目录；Git 许可见 `git/LICENSE.txt`，依赖许可保留在 Git 原发行目录；PuTTY、PythonVista、路径兼容 shim 许可见 `licenses`。前置包保留微软原安装器及其许可。此包中为兼容性固定了部分旧库，更新时必须重新通过 Win7 和文档回归。
