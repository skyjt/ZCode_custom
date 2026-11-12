"""File/commit regressions; the Windows probe does not require installed Office."""
import importlib.util
import base64
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "office_native", ROOT / "scripts/win7/offline-tools/office_native.py"
)
office = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(office)


def write_xlsx(path, error=False):
    with ZipFile(path, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("xl/workbook.xml", "<workbook/>")
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheetData><row r="1"><c r="A1" t="' + ("e" if error else "n")
            + '"><f>1/0</f><v>' + ("#DIV/0!" if error else "42")
            + "</v></c></row></sheetData></worksheet>",
        )


class NativeOfficeFiles(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "中文 空格 ' 源.xlsx"
        write_xlsx(self.source)
        self.original = self.source.read_bytes()
        self.output = self.root / "计算后.xlsx"

    def tearDown(self):
        self.temp.cleanup()

    def test_recalc_publishes_valid_copy_and_reports_formula_errors(self):
        def run(request):
            self.assertEqual(request["input"], str(self.source.resolve()))
            write_xlsx(request["output"], error=True)
            return {"application": "excel", "version": "15.0"}

        with patch.object(office, "_run_powershell", side_effect=run):
            result = office.execute("recalc", self.source, self.output)
        self.assertEqual(result["formulaErrors"]["count"], 1)
        self.assertEqual(result["formulaErrors"]["samples"][0]["cell"], "A1")
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assertTrue(self.output.is_file())
        self.assertFalse(list(self.root.glob(".office-*")))

    def test_rejects_existing_target_and_in_place_edit_before_starting_office(self):
        self.output.write_bytes(b"existing user file")
        with patch.object(office, "_run_powershell") as run:
            for output in (self.output, self.source):
                with self.assertRaises((ValueError, FileExistsError)):
                    office.execute("recalc", self.source, output)
            run.assert_not_called()
        self.assertEqual(self.output.read_bytes(), b"existing user file")
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_failure_and_invalid_artifact_never_publish(self):
        def invalid(request):
            Path(request["output"]).write_bytes(b"not an xlsx")
            return {"version": "15.0"}

        for effect in (RuntimeError("Office unavailable"), invalid):
            with patch.object(office, "_run_powershell", side_effect=effect):
                with self.assertRaises(Exception):
                    office.execute("recalc", self.source, self.output)
            self.assertFalse(self.output.exists())
            self.assertFalse(list(self.root.glob(".office-*")))
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_concurrent_target_creation_cannot_be_overwritten(self):
        def run(request):
            write_xlsx(request["output"])
            self.output.write_bytes(b"created by another writer")
            return {}

        with patch.object(office, "_run_powershell", side_effect=run):
            with self.assertRaises(FileExistsError):
                office.execute("recalc", self.source, self.output)
        self.assertEqual(self.output.read_bytes(), b"created by another writer")

    def test_partial_publication_is_removed_on_write_failure(self):
        def run(request):
            write_xlsx(request["output"])
            return {}

        with patch.object(office, "_run_powershell", side_effect=run), patch.object(
            office.shutil, "copyfileobj", side_effect=OSError("disk full")
        ):
            with self.assertRaises(OSError):
                office.execute("recalc", self.source, self.output)
        self.assertFalse(self.output.exists())
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_format_mismatch_and_fake_legacy_file_are_rejected(self):
        fake = self.root / "fake.doc"
        fake.write_text("not an OLE document")
        with patch.object(office, "_run_powershell") as run:
            for action, source, target in (
                ("convert", self.source, self.root / "wrong.docx"),
                ("pdf", self.source, self.root / "wrong.xlsx"),
                ("convert", fake, self.root / "fake.docx"),
            ):
                with self.assertRaises(ValueError):
                    office.execute(action, source, target)
            run.assert_not_called()

    def test_request_data_never_becomes_powershell_code(self):
        request = {"action": "pdf", "input": '中文\"; $(not-code)', "output": "新 PDF.pdf"}
        with patch.object(office, "os", SimpleNamespace(name="nt", environ=dict(os.environ))), patch.object(
            office.subprocess, "run",
            return_value=SimpleNamespace(returncode=0, stdout=b'{"version":"15.0"}', stderr=b""),
        ) as run:
            self.assertEqual(office._run_powershell(request)["version"], "15.0")
        args, options = run.call_args
        script = base64.b64decode(args[0][-1]).decode("utf-16le")
        self.assertNotIn(request["input"], script)
        self.assertNotIn("ExecutionPolicy", script)
        self.assertNotIn("ConvertTo-Json", script)
        self.assertEqual(json.loads(base64.b64decode(options["env"]["ZCODE_OFFICE_REQUEST"])), request)

    @unittest.skipUnless(os.name == "nt", "Windows PowerShell COM registration probe")
    def test_real_windows_probe_parses_fixed_worker_without_launching_office(self):
        result = office.execute("probe")
        self.assertEqual(set(result["components"]), {"word", "excel", "powerpoint"})
        self.assertTrue(all(isinstance(value, bool) for value in result["components"].values()))
        json.dumps(result)


if __name__ == "__main__":
    unittest.main()
