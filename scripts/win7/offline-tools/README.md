# Win7 离线工具包

本目录随 aibuddy7se（Win7 特别版）安装，Python、Office 库和 PuTTY 均已就绪。无需在内网执行 pip/npm 下载。模型服务仍需在应用设置中配置为可达的内网 API。

首次部署到 Win7 SP1 x64 时，管理员先检查并按需安装 `prerequisites/Windows6.1-KB3063858-x64.msu`（替代 KB2533623）和 `prerequisites/vc_redist.x64.exe`（VS 2019 x64 运行库，含 UCRT 安装支持），按安装器提示重启。已有更新可能提示“不适用/已安装”，不要卸载现有系统更新。两个文件来自微软；`manifest.json` 提供固定下载来源和 SHA-256。应用不会自动提权或修改系统补丁。

如果应用还不能启动，可先解压同版本 ZIP，在 `resources/offline-tools/prerequisites` 找到前置包。不要把缺失 DLL 从网上随意复制到系统目录。

在 aibuddy7se 终端运行：

```bat
python -B -X utf8 -c "from docx import Document; from openpyxl import Workbook; from pptx import Presentation; print('Office ready')"
plink.exe -V
psftp.exe -V
```

完整本机诊断（CMD/PowerShell/Git Bash）：

```bat
python -B -X utf8 -c "import os,runpy; runpy.run_path(os.path.join(os.environ['ZCODE_OFFLINE_TOOLS'],'smoke.py'),run_name='__main__')"
```

Office 操作见 `office.md`；SSH/SFTP 在聊天中使用 `ssh-sftp` 内置技能，或直接打开 `putty/PUTTY.EXE`。安装目录只读，所有文档和脚本输出到自己的工作区。

包含 DOCX/XLSX/PPTX 内容编辑、PDF 读写/拆合、图片、CSV/JSON/YAML、SQLite、ZIP 与 SHA256。公式文本可以保留但不计算；没有内置 LibreOffice、Microsoft Office、Poppler、OCR 或模型权重。既有预览不等于完整 Office 编辑器。详细能力和验收见交付包的 `Win7-offline-guide.md`。

许可：Python 自带 LICENSE.txt；Python 库的许可保留在各 `.dist-info` 目录；PuTTY、PythonVista、路径兼容 shim 许可见 `licenses`。前置包保留微软原安装器及其许可。此包中为兼容性固定了部分旧库，更新时必须重新通过 Win7 和文档回归。
