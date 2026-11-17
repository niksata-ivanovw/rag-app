"""
Upload validation: decides from the file's bytes, not its name, whether it is a real PDF/DOCX.

Two checks, both before anything is stored or indexed:
  1. magic bytes (via `filetype`) must match the type the extension claims,
     so "report.pdf" that is really a ZIP, PNG or text file is rejected;
  2. the file must actually open, so a truncated or corrupted file with a valid header is rejected too.
"""
import io
import os
import zipfile
from dataclasses import dataclass
from typing import Optional

import filetype
import pypdfium2 as pdfium
from docx import Document

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

ALLOWED_TYPES = {".pdf": PDF_MIME, ".docx": DOCX_MIME}


@dataclass
class InvalidFileError(Exception):
    """Raised for files that must be refused with 415 Unsupported Media Type."""

    code: str  # unsupported_extension | empty_file | content_mismatch | corrupted_file
    message: str
    detected_mime: Optional[str] = None

    def __str__(self) -> str:
        return self.message

    def to_detail(self) -> dict:
        return {"code": self.code, "message": self.message, "detected_mime": self.detected_mime}


def _check_pdf_opens(data: bytes) -> None:
    pdf = pdfium.PdfDocument(data)
    try:
        if len(pdf) == 0:
            raise ValueError("PDF has no pages")
    finally:
        pdf.close()


def _check_docx_opens(data: bytes) -> None:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        bad_member = zf.testzip()  # CRC-checks every entry
        if bad_member is not None:
            raise ValueError(f"corrupted archive entry: {bad_member}")
        if "word/document.xml" not in zf.namelist():
            raise ValueError("missing word/document.xml")
    Document(io.BytesIO(data))


_STRUCTURE_CHECKS = {PDF_MIME: _check_pdf_opens, DOCX_MIME: _check_docx_opens}


def validate_document(filename: str, data: bytes) -> str:
    """Returns the verified MIME type, or raises InvalidFileError."""
    ext = os.path.splitext(filename)[1].lower()
    expected = ALLOWED_TYPES.get(ext)
    if expected is None:
        raise InvalidFileError(
            "unsupported_extension",
            f"Only {', '.join(ALLOWED_TYPES)} files are supported, got '{ext or 'no extension'}'.",
        )

    if not data:
        raise InvalidFileError("empty_file", "The file is empty.")

    kind = filetype.guess(data)
    detected = kind.mime if kind else None
    if detected != expected:
        raise InvalidFileError(
            "content_mismatch",
            f"The file is named '{ext}' but its content is {detected or 'not a recognized format'}.",
            detected_mime=detected,
        )

    try:
        _STRUCTURE_CHECKS[expected](data)
    except Exception as e:  # each library raises its own error types
        raise InvalidFileError(
            "corrupted_file",
            f"The file looks like {ext} but could not be opened ({e}). It may be corrupted or password-protected.",
            detected_mime=detected,
        ) from e

    return expected
