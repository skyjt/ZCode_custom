"""Offline Office automation; content editing stays with the existing Python tools."""
import argparse
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from zipfile import ZipFile, BadZipFile

FORMATS = {
    ".doc": ("word", ".docx"), ".docx": ("word", ".docx"),
    ".xls": ("excel", ".xlsx"), ".xlsx": ("excel", ".xlsx"),
    ".ppt": ("powerpoint", ".pptx"), ".pptx": ("powerpoint", ".pptx"),
}
PARTS = {".docx": "word/document.xml", ".xlsx": "xl/workbook.xml", ".pptx": "ppt/presentation.xml"}
OLE_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def _validate_file(path):
    extension = path.suffix.lower()
    if extension in (".doc", ".xls", ".ppt", ".pdf"):
        with path.open("rb") as stream:
            header = stream.read(8)
        signature = b"%PDF-" if extension == ".pdf" else OLE_SIGNATURE
        if not header.startswith(signature):
            raise ValueError("File contents do not match " + extension)
        return
    try:
        with ZipFile(path) as archive:
            archive.getinfo("[Content_Types].xml")
            ET.fromstring(archive.read(PARTS[extension]))
            if any(name.lower().endswith("vbaproject.bin") for name in archive.namelist()):
                raise ValueError("Macro-enabled OOXML is outside this tool's supported formats")
    except (BadZipFile, KeyError, ET.ParseError) as error:
        raise ValueError("Invalid " + extension + " document") from error


def _formula_errors(path):
    count, samples = 0, []
    namespace = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    with ZipFile(path) as archive:
        for name in archive.namelist():
            if not (name.startswith("xl/worksheets/") and name.endswith(".xml")):
                continue
            with archive.open(name) as stream:
                for _, element in ET.iterparse(stream, events=("end",)):
                    if element.tag == namespace + "c":
                        if element.get("t") == "e":
                            count += 1
                            if len(samples) < 20:
                                samples.append({"worksheetPart": name, "cell": element.get("r"),
                                                "error": element.findtext(namespace + "v")})
                        element.clear()
                    elif element.tag == namespace + "row":
                        element.clear()
    return {"count": count, "samples": samples}


def _run_powershell(request):
    if os.name != "nt":
        raise RuntimeError("Native Office operations require Windows and installed Microsoft Office")
    script = Path(__file__).with_suffix(".ps1").read_text(encoding="utf-8-sig")
    environment = dict(os.environ)
    environment["ZCODE_OFFICE_REQUEST"] = base64.b64encode(
        json.dumps(request, ensure_ascii=False).encode("utf-8")
    ).decode("ascii")
    # 文件名只放入 JSON 环境值，不作为 PowerShell 源码拼接。
    result = subprocess.run(
        ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-STA",
         "-EncodedCommand", base64.b64encode(script.encode("utf-16le")).decode("ascii")],
        env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace").strip()[:1500]
                           or "Office automation failed")
    return json.loads(result.stdout.decode("utf-8-sig"))


def execute(action, source=None, destination=None):
    if action == "probe":
        if source is not None or destination is not None:
            raise ValueError("probe does not accept document paths")
        return _run_powershell({"action": action})
    if action not in ("convert", "pdf", "recalc") or source is None or destination is None:
        raise ValueError("convert/pdf/recalc require an input and a new output path")
    source = Path(source).resolve(strict=True)
    target = Path(destination)
    destination = target.parent.resolve(strict=True) / target.name
    if not source.is_file():
        raise ValueError("Input must be a regular document file")
    if source.drive.startswith("\\\\") or destination.drive.startswith("\\\\"):
        raise ValueError("Copy documents to a local workspace before native Office processing")
    if str(source).casefold() == str(destination).casefold():
        raise ValueError("Input and output must be different files")
    if destination.exists() or destination.is_symlink():
        raise FileExistsError("Output already exists; choose a new file name")
    extension = source.suffix.lower()
    if extension not in FORMATS:
        raise ValueError("Supported inputs: DOC/DOCX, XLS/XLSX, PPT/PPTX")
    application, modern_extension = FORMATS[extension]
    if action == "convert" and extension not in (".doc", ".xls", ".ppt"):
        raise ValueError("convert requires a legacy DOC/XLS/PPT input")
    if action == "recalc" and extension != ".xlsx":
        raise ValueError("recalc requires XLSX; convert legacy XLS first")
    expected = ".pdf" if action == "pdf" else modern_extension
    if destination.suffix.lower() != expected:
        raise ValueError("Expected output extension: " + expected)
    _validate_file(source)
    with tempfile.TemporaryDirectory(prefix=".office-", dir=destination.parent) as folder:
        staged = Path(folder) / ("result" + expected)
        report = _run_powershell({"action": action, "application": application,
                                  "input": str(source), "output": str(staged)})
        _validate_file(staged)
        if expected == ".xlsx":
            report["formulaErrors"] = _formula_errors(staged)
        # xb 在提交时再次拒绝已存在目标，保护校验之后其他进程新建的文件。
        created = False
        try:
            with staged.open("rb") as reader, destination.open("xb") as writer:
                created = True
                shutil.copyfileobj(reader, writer)
        except BaseException:
            if created:
                destination.unlink()
            raise
    return {**report, "action": action, "output": str(destination)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("probe", "convert", "pdf", "recalc"))
    parser.add_argument("input", nargs="?")
    parser.add_argument("output", nargs="?")
    args = parser.parse_args()
    try:
        print(json.dumps(execute(args.action, args.input, args.output), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
