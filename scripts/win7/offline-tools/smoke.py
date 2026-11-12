"""Run the shipped runtime, not CI's Python. Never contact the network."""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import zipfile
from contextlib import closing

from docx import Document
from openpyxl import Workbook, load_workbook
from pptx import Presentation
from pptx.util import Inches
from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen.canvas import Canvas
import lxml.etree
import requests
import yaml


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


with tempfile.TemporaryDirectory(prefix="ZCode 离线 ") as folder:
    root = Path(folder)
    doc = Document()
    doc.add_paragraph("原始文档")
    doc.save(root / "原始.docx")
    original_doc = digest(root / "原始.docx")
    doc = Document(root / "原始.docx")
    doc.paragraphs[0].runs[0].text = "已修改 Word"
    doc.save(root / "编辑.docx")
    assert Document(root / "编辑.docx").paragraphs[0].text == "已修改 Word"
    assert digest(root / "原始.docx") == original_doc

    book = Workbook()
    book.active.append(["数量", "价格", "合计"])
    book.active.append([2, 3, "=A2*B2"])
    book.save(root / "原始.xlsx")
    original_book = digest(root / "原始.xlsx")
    book = load_workbook(root / "原始.xlsx")
    book.active["A2"] = 4
    book.save(root / "编辑.xlsx")
    changed = load_workbook(root / "编辑.xlsx", data_only=False)
    assert changed.active["A2"].value == 4 and changed.active["C2"].value == "=A2*B2"
    assert digest(root / "原始.xlsx") == original_book

    slides = Presentation()
    slide = slides.slides.add_slide(slides.slide_layouts[6])
    slide.shapes.add_textbox(Inches(1), Inches(1), Inches(5), Inches(1)).text = "原始演示"
    slides.save(root / "原始.pptx")
    original_slides = digest(root / "原始.pptx")
    slides = Presentation(root / "原始.pptx")
    slides.slides[0].shapes[0].text_frame.paragraphs[0].runs[0].text = "已修改 PPT"
    slides.save(root / "编辑.pptx")
    assert Presentation(root / "编辑.pptx").slides[0].shapes[0].text == "已修改 PPT"
    assert digest(root / "原始.pptx") == original_slides

    pdf = Canvas(str(root / "原始.pdf"))
    pdf.drawString(40, 700, "Offline PDF")
    pdf.save()
    assert "Offline PDF" in PdfReader(root / "原始.pdf").pages[0].extract_text()
    writer = PdfWriter()
    writer.append(root / "原始.pdf")
    writer.write(root / "编辑.pdf")
    assert len(PdfReader(root / "编辑.pdf").pages) == 1
    Image.new("RGB", (10, 10), "blue").save(root / "图片.png")
    with Image.open(root / "图片.png") as image:
        assert image.size == (10, 10)
    # sqlite3 的 with 只提交事务，不关闭连接；Windows 删除临时目录前必须释放句柄。
    with closing(sqlite3.connect(root / "数据.sqlite")) as db:
        assert db.execute("select 1").fetchone()[0] == 1
    with zipfile.ZipFile(root / "归档.zip", "w") as archive:
        archive.write(root / "编辑.docx", "编辑.docx")
    assert yaml.safe_load("name: 离线")["name"] == "离线"
    assert json.loads(json.dumps({"值": 1}))["值"] == 1

    # 验证随包解释器的 UTF-8 路径与 argv，不靠 shell 展开或现代 PowerShell 命令。
    script = root / "参数 检查.py"
    script.write_text("import json, sys; print(json.dumps(sys.argv[1:], ensure_ascii=False))", encoding="utf-8")
    argument = '中文 & 引号" %变量%'
    result = subprocess.run([os.sys.executable, "-B", "-X", "utf8", str(script), argument],
                            shell=False, check=True, capture_output=True, encoding="utf-8", timeout=10)
    assert json.loads(result.stdout) == [argument]
    with zipfile.ZipFile(root / "归档.zip") as archive:
        assert hashlib.sha256(archive.read("编辑.docx")).hexdigest() == digest(root / "编辑.docx")

print(json.dumps({"result": "PASS", "python": os.sys.version, "checks": [
    "DOCX create/edit/read", "XLSX formulas preserved (not evaluated)",
    "PPTX create/edit/read", "originals unchanged", "PDF read/write", "PNG", "SQLite", "ZIP/hash roundtrip", "YAML", "JSON", "Python UTF-8 path and argv"
]}, ensure_ascii=False))
