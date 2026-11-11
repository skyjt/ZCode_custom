# Win7 离线 Office 操作

本指南替代通用 Office skill 中的在线 setup、pip/npm install、LibreOffice/Poppler 下载步骤。依赖已随包安装；使用 `python`（应用 PATH 指向随包 Python 3.11）。先把脚本写入用户工作区，再执行 `python -B -X utf8 script.py`。Windows 默认 CMD 不支持 Bash heredoc；不要直接粘贴 `python <<EOF`。

可以用 `python -c "import os; print(os.environ['ZCODE_OFFLINE_TOOLS'])"` 查询工具包位置。依赖诊断执行该目录的 `smoke.py`；不向安装目录写文件，不修改系统 Python。

## 必须遵守

- 读取原文件，修改副本并重读验证，除非用户明确要求覆盖。输出使用用户给出的目录；保留备份。
- 修改现有 DOCX/PPTX 的具体 run、单元格或 OOXML 节点，避免整段替换导致格式丢失。复杂对象不受库支持时，说明限制，不把重建后的文件称为无损编辑。
- XLSX 用 `load_workbook(path, data_only=False)` 保留公式文本；`keep_vba=True` 仅用于明确要求保留 VBA 的 XLSM，不能声称执行了宏。openpyxl 不计算公式：用 Python 核验业务计算，保留公式并说明需要 Excel/兼容引擎重算。
- 查看器只读。生成后用现有 `*-viewer` 技能打开文档，无法完成视觉检查就明确说明；没有 LibreOffice/Poppler/Office 时不声称排版保真或 PDF 转换成功。
- DOC/XLS/PPT 二进制格式必须先由用户的兼容办公软件另存为 OOXML；不能改扩展名假装转换。
- 不从公网下载依赖、模板或字体。中文 PDF 可使用获授权的本机字体路径；未取得字体不要伪造视觉效果。

## 随包 API

| 内容 | Python 库/入口 |
| --- | --- |
| DOCX 创建、段落、表格、样式、图片 | `from docx import Document` |
| XLSX 创建、修改、样式、公式文本 | `from openpyxl import Workbook, load_workbook` |
| PPTX 页面、文本、图片、图形、表格 | `from pptx import Presentation` |
| 精细 OOXML 修改 | `zipfile` + `lxml.etree`，保留其他 ZIP 条目 |
| PDF 读取文本、合并、拆页、旋转 | `from pypdf import PdfReader, PdfWriter` |
| 新建 PDF | `from reportlab.pdfgen.canvas import Canvas` |
| 图片处理 | `from PIL import Image` |

示例（按实际内容调整，路径来自用户）：

```python
from pathlib import Path
from docx import Document
from openpyxl import load_workbook
from pptx import Presentation

source = Path('报告.docx')
doc = Document(source)
for paragraph in doc.paragraphs:
    for run in paragraph.runs:
        run.text = run.text.replace('旧标题', '新标题')
target = source.with_name(source.stem + '-修改.docx')
doc.save(target)
assert any('新标题' in p.text for p in Document(target).paragraphs)

book = load_workbook('预算.xlsx', data_only=False)
book.active['B2'] = 120
book.save('预算-修改.xlsx')
assert load_workbook('预算-修改.xlsx').active['B2'].value == 120

slides = Presentation('汇报.pptx')
for shape in slides.slides[0].shapes:
    if shape.has_text_frame:
        for paragraph in shape.text_frame.paragraphs:
            for run in paragraph.runs:
                run.text = run.text.replace('旧标题', '新标题')
slides.save('汇报-修改.pptx')
```

运行成功并重读核对后报告产物路径和实际检查内容，不将库成功保存当作视觉验收。
