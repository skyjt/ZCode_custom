---
name: offline-toolkit
description: Win7/PowerShell 2.0 环境优先用随包 Python 处理批量文件、JSON/CSV/YAML、哈希、ZIP、Office/PDF、SQLite 和图片；不联网安装依赖。
---

# 离线工具包

仅在 `ZCODE_OFFLINE_TOOLS` 存在的 Win7 离线版本使用。`python` 已指向随包运行时；用现有 Bash 工具按原权限执行，先写 `.py` 文件再运行，不依赖 Bash heredoc。`python -c "import os; print(os.environ.get('ZCODE_OFFLINE_TOOLS', ''))"` 可查询目录。

## 执行顺序

1. 单个文件的读取、搜索、精确修改先用既有 Read/Edit/搜索工具。结构化数据、批量处理和需要库的操作再写 Python，保持原工具审批与取消规则。
2. 用 Write/Edit 把 UTF-8 `.py` 写入用户工作区，执行 `python -B -X utf8 "脚本路径.py"`；Python 读取 `os.environ`，不混用 CMD 的 `%变量%`、PowerShell 的 `$env:` 或 Bash heredoc。不要反复尝试 PS2 不支持的 `Get-CimInstance`、`ConvertTo-Json`、`Get-FileHash`、`Invoke-WebRequest` 等命令。
3. 复用 `pathlib/shutil` 做路径和文件、`json/csv` 做数据、`hashlib` 做哈希、`zipfile` 做归档、`datetime` 做时间；Office 使用下表已有库。先列明将改动的文件，按已有用户授权写入；不可用时报告真实缺项，不自行升级 PowerShell 或安装包。
4. 调用 PuTTY/Git 等程序使用 `subprocess.run([程序, 参数...], shell=False, check=True, ...)`，设置适合任务的超时。用户提供的路径/参数保持独立参数，不拼成 shell 字符串；`shell=False` 只保护本机参数，远端 SSH 命令仍须按远端 shell 规则处理。命令失败保留退出码和有界 stderr，不把失败当空结果。
5. 同一批同类数据尽量一次脚本处理；输出 JSON 摘要、文件数、产物路径和验证结论。大表/完整日志写文件，只返回摘要；失败到具体文件即报告，不循环盲试同一不兼容命令。接触下载/解压内容时遵守环境公告的 `-I` 和目录隔离要求。

简单自检（CMD、PowerShell 和 Git Bash 均无需环境变量展开）：

```text
python -B -X utf8 -c "import os,runpy; runpy.run_path(os.path.join(os.environ['ZCODE_OFFLINE_TOOLS'],'smoke.py'),run_name='__main__')"
```

Office/PDF 任务先读取该目录的 `office.md`，并使用已有文档预览技能。SSH/SFTP 读取 `ssh-sftp` 技能。

常用能力已就绪：

- Python 标准库 `csv/json/sqlite3/zipfile/tarfile/hashlib/pathlib`：表格文本、数据查询、归档、校验；CSV 明确编码和分隔符，中文 Windows 交付可使用 UTF-8 BOM。
- `yaml.safe_load` / `safe_dump`：YAML，不使用不可信内容的 unsafe loader。
- `requests`：仅访问用户授权的内网接口，保留 TLS 校验；内网 CA 使用用户证书文件，不设置 `verify=False`。
- `PIL.Image`：图片缩放/裁剪/格式转换，另存副本。
- Office 库：python-docx/openpyxl/python-pptx/lxml；PDF：pypdf/ReportLab。

不得执行在线 pip/npm/setup 安装；当前包没提供的能力先报告缺项。用户需要新增依赖时由外网构建机制作带版本和摘要的新离线包。不能把工具包称为本地 AI 模型；推理由用户配置的模型服务提供。

用户文件与数据库默认只读或另存；归档解压前校验条目路径不得逃逸目标目录，禁止覆盖未知文件。无需任务相关的系统环境修改不要做。
