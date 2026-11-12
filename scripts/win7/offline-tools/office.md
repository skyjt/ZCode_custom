# Win7 离线 Office 操作

本指南替代通用 Office skill 中的在线 setup、pip/npm install、LibreOffice/Poppler 下载步骤，以及强制安装 LibreOffice 的要求。内容编辑使用随包 Python；原生转换、公式重算和 PDF 导出使用用户已安装的 Microsoft Office 2013。不要下载另一套 Office、pywin32 或在线 MCP。先把脚本写入用户工作区，再执行 `python -B -X utf8 script.py`。Windows 默认 CMD 不支持 Bash heredoc。

可以用 `python -c "import os; print(os.environ['ZCODE_OFFLINE_TOOLS'])"` 查询工具包位置。依赖诊断执行该目录的 `smoke.py`；不向安装目录写文件，不修改系统 Python。

## 必须遵守

- 读取原文件，修改副本并重读验证，除非用户明确要求覆盖。输出使用用户给出的目录；保留备份。
- 修改现有 DOCX/PPTX 的具体 run、单元格或 OOXML 节点，避免整段替换导致格式丢失。复杂对象不受库支持时，说明限制，不把重建后的文件称为无损编辑。
- XLSX 用 `load_workbook(path, data_only=False)` 保留公式；openpyxl 不计算公式。修改后用下述 `recalc` 调用 Excel 保存新副本，再用 `data_only=True` 重读缓存值、核对公式错误与业务合计。重算后的文件不要再经 openpyxl 保存，否则可能丢失计算缓存。
- 查看器只读。生成后用现有 `*-viewer` 技能打开文档；需要检查排版时先原生导出 PDF。无法完成视觉检查就明确说明，原生导出也不代表字体、分页与内容都正确。
- DOC/XLS/PPT 先用下述 `convert` 转换为 OOXML，再编辑副本；不能改扩展名假装转换。原生转换拒绝把带 VBA 的旧文件保存为无宏格式。XLSM/DOCM/PPTM 不交给此工具，不声称执行或完整保留宏。
- 不从公网下载依赖、模板或字体。中文 PDF 可使用获授权的本机字体路径；未取得字体不要伪造视觉效果。

## Office 2013 原生工具

先用前面的 Python 命令得到工具目录，以下 `<工具目录>` 必须替换为其实际绝对路径。命令适用于 CMD/PowerShell，不用 shell 环境变量展开。

```text
python -B -X utf8 "<工具目录>\office_native.py" probe
python -B -X utf8 "<工具目录>\office_native.py" convert "D:\工作\旧报告.doc" "D:\工作\报告-转换.docx"
python -B -X utf8 "<工具目录>\office_native.py" convert "D:\工作\旧报表.xls" "D:\工作\报表-转换.xlsx"
python -B -X utf8 "<工具目录>\office_native.py" convert "D:\工作\旧汇报.ppt" "D:\工作\汇报-转换.pptx"
python -B -X utf8 "<工具目录>\office_native.py" recalc "D:\工作\报表-修改.xlsx" "D:\工作\报表-已重算.xlsx"
python -B -X utf8 "<工具目录>\office_native.py" pdf "D:\工作\报告-修改.docx" "D:\工作\报告.pdf"
python -B -X utf8 "<工具目录>\office_native.py" pdf "D:\工作\报表-已重算.xlsx" "D:\工作\报表.pdf"
python -B -X utf8 "<工具目录>\office_native.py" pdf "D:\工作\汇报-修改.pptx" "D:\工作\汇报.pdf"
```

- `probe` 的 true 只表示 COM 注册存在。首次使用前让用户手动完成 Word/Excel/PowerPoint 的激活和首次启动；实际转换才能证明可用。
- 操作前请用户保存并关闭对应 Office 组件。工具发现同一会话中的组件已运行会拒绝，不接管当前文档、不自动关闭窗口、不按进程名结束程序。批量处理按顺序调用，每次检查真实退出码，不并行启动同一组件。
- 输入是本机文件，输出目录须存在，输出文件须不存在。成功返回 JSON 中的 `output`；失败退出码为 1。不把任意暂存文件或仅注册成功当成交付。
- `recalc` 和 XLS→XLSX 返回 `formulaErrors.count/samples`。大于 0 时定位原公式并修复副本，再重算；不得用 IFERROR 或写死数值掩盖错误。样本的 `worksheetPart` 是 XLSX 内部工作表路径，结合 workbook.xml 的关系映射定位显示表名。
- 不刷新外链/外部数据，不执行 VBA，不降低 Protected View/组织安全策略。加密、加载项弹窗、Excel 4.0 宏、外部数据连接、IRM 文件不保证自动处理；Office 阻塞时停止任务并说明原因。强制取消可能留下 Office 进程，须人工检查，不盲杀所有 Office 进程。
- 原生工具仅增强用户已安装 Office 的 Win7 环境。缺失组件时继续提供现有 Python 内容处理，明确标出未执行的转换、重算或导出，不回到联网安装分支。

## 常用处理路线

| 用户任务                     | 内容处理                                                                                                            | 最后验证                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Word 模板、通知/报告批量生成 | python-docx 读取用户模板副本，维护段落样式、表格、页眉页脚、页边距；占位符跨 run 时先识别完整文本再保留所需格式替换 | 重读关键字段、表格行数；原生 PDF 后检查分页、字体、表格溢出 |
| Excel 清洗、合并、分类汇总   | csv/openpyxl；新报表可用已随包的 XlsxWriter；保留公式、日期/金额类型和工作表名称                                    | 核对输入输出行数/合计，Excel 重算，读取缓存，检查错误单元格 |
| PPT 模板改稿、批量汇报       | python-pptx 复用现有母版/版式，修改具体文本、图片与表格，保留不受支持对象                                           | 重读页数和关键文本；PowerPoint PDF 检查溢出、遮挡和字体     |
| 老格式编辑                   | 原生 convert → Python 修改转换副本                                                                                  | 保留旧原件，重读修改项，按需求 PDF                          |
| 批量 Office→PDF              | 每个文件按所属组件调用 pdf，不经 Python 重建文档                                                                    | 实际 PDF 数量/文件名、原件摘要、用现有 PDF 查看器核对页面   |

复杂图表、数据透视表、嵌入对象或修订记录不一定被 Python 库完整保留。仅转换/导出时直接交原文件给 Office，不先用 Python 读写一遍。Office 2013 不支持 XLOOKUP/FILTER/LET 等新版函数，生成公式时使用其支持的函数。

## 随包 API

| 内容                               | Python 库/入口                                 |
| ---------------------------------- | ---------------------------------------------- |
| DOCX 创建、段落、表格、样式、图片  | `from docx import Document`                    |
| XLSX 创建、修改、样式、公式文本    | `from openpyxl import Workbook, load_workbook` |
| 新建 XLSX 图表、条件格式与打印设置 | `import xlsxwriter`（不读取/编辑已有文件）     |
| PPTX 页面、文本、图片、图形、表格  | `from pptx import Presentation`                |
| 精细 OOXML 修改                    | `zipfile` + `lxml.etree`，保留其他 ZIP 条目    |
| PDF 读取文本、合并、拆页、旋转     | `from pypdf import PdfReader, PdfWriter`       |
| 新建 PDF                           | `from reportlab.pdfgen.canvas import Canvas`   |
| 图片处理                           | `from PIL import Image`                        |

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

## Win7 / Office 2013 首次验收

使用虚构材料，保留原件：一份含中文表格/页眉页脚的 DOC、一份含 SUM 和 IF 公式的 XLS、一份含图片/文本/表格的 PPT。依次转换成新格式、修改副本、导出三份 PDF。Excel 修改输入值后执行 recalc，用 openpyxl `data_only=True` 确认结果随之改变；另建 `=1/0` 的测试单元格，确认报告非零错误。核对原件 SHA-256 未变化，已有同名输出会被拒绝；打开对应 Office 组件后再次执行，应明确拒绝且不关闭窗口。结束后确认没有工具残留的 Office 实例。

本工具不能替代真机验收。自动化 PDF 导出支持不等于所见即所得编辑器，目录/域更新、修订处理、宏执行、OCR 和复杂数据连接不在本次新增接口中。
