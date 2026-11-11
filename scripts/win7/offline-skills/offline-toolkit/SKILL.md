---
name: offline-toolkit
description: Win7 内网离线环境中处理 Office、PDF、CSV/JSON/YAML、SQLite、ZIP、图片和哈希，使用随包 Python；不联网安装依赖。
---

# 离线工具包

仅在 `ZCODE_OFFLINE_TOOLS` 存在的 Win7 离线版本使用。`python` 已指向随包运行时；用现有 Bash 工具按原权限执行，先写 `.py` 文件再运行，不依赖 Bash heredoc。`python -c "import os; print(os.environ.get('ZCODE_OFFLINE_TOOLS', ''))"` 可查询目录。

Office/PDF 任务先读取该目录的 `office.md`，并使用已有文档预览技能。SSH/SFTP 读取 `ssh-sftp` 技能。

常用能力已就绪：

- Python 标准库 `csv/json/sqlite3/zipfile/tarfile/hashlib/pathlib`：表格文本、数据查询、归档、校验；CSV 明确编码和分隔符，中文 Windows 交付可使用 UTF-8 BOM。
- `yaml.safe_load` / `safe_dump`：YAML，不使用不可信内容的 unsafe loader。
- `requests`：仅访问用户授权的内网接口，保留 TLS 校验；内网 CA 使用用户证书文件，不设置 `verify=False`。
- `PIL.Image`：图片缩放/裁剪/格式转换，另存副本。
- Office 库：python-docx/openpyxl/python-pptx/lxml；PDF：pypdf/ReportLab。

不得执行在线 pip/npm/setup 安装；当前包没提供的能力先报告缺项。用户需要新增依赖时由外网构建机制作带版本和摘要的新离线包。不能把工具包称为本地 AI 模型；推理由用户配置的模型服务提供。

用户文件与数据库默认只读或另存；归档解压前校验条目路径不得逃逸目标目录，禁止覆盖未知文件。无需任务相关的系统环境修改不要做。
