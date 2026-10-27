import io
import tempfile
from pathlib import Path

from pdf2docx import Converter


def convert_pdf_to_docx(pdf_content):
    with tempfile.TemporaryDirectory() as temp_dir:
        pdf_path = Path(temp_dir) / "source.pdf"
        docx_path = Path(temp_dir) / "converted.docx"
        pdf_path.write_bytes(pdf_content)
        converter = Converter(str(pdf_path))
        try:
            converter.convert(str(docx_path))
        finally:
            converter.close()

        converted_document = io.BytesIO(docx_path.read_bytes())

    converted_document.seek(0)
    return converted_document
