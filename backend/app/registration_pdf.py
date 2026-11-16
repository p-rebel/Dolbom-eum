"""Overlay the submitted demo values on the two MOHW source PDFs."""

from __future__ import annotations

from functools import lru_cache
from io import BytesIO
from pathlib import Path
from threading import Lock

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

from .registration import RELATIONSHIPS, ApplicationForm

_ASSETS = Path(__file__).with_name("assets") / "registration"
# The template positions use the original PDF pages rendered at 100 dpi, measured from the upper-left.
_POINT = 72 / 100
_FONT = "RegistrationNanumGothic"
_BLUE = HexColor("#164B88")
_DRAW_LOCK = Lock()


@lru_cache(maxsize=2)
def _source(name: str) -> bytes:
    return (_ASSETS / name).read_bytes()


class Overlay:
    def __init__(self, width: float, height: float):
        if _FONT not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(_FONT, str(_ASSETS / "NanumGothic-Regular.ttf")))
        self.stream = BytesIO()
        self.canvas = Canvas(self.stream, pagesize=(width, height))
        self.height = height
        self.canvas.setFillColor(HexColor("#EAF1FA"))
        self.canvas.rect(64, height - 44, width - 128, 18, fill=1, stroke=0)
        self.text(100, 54, "돌봄e음  |  모의 제출용 · 가상 정보", 440, size=9)

    def text(self, x: int, y: int, value: str, max_width: int, *, size: float = 8.5) -> None:
        width = pdfmetrics.stringWidth(value, _FONT, size)
        if width > max_width * _POINT:
            size *= max_width * _POINT / width
        self.canvas.setFont(_FONT, size)
        self.canvas.setFillColor(_BLUE)
        self.canvas.drawString(x * _POINT, self.height - y * _POINT, value)

    def check(self, x: int, y: int) -> None:
        cx, cy = x * _POINT, self.height - (y - 4) * _POINT
        self.canvas.setStrokeColor(_BLUE)
        self.canvas.setLineWidth(1.25)
        self.canvas.setLineCap(1)
        path = self.canvas.beginPath()
        path.moveTo(cx - 2.6, cy)
        path.lineTo(cx - 0.6, cy - 2.1)
        path.lineTo(cx + 3.1, cy + 2.8)
        self.canvas.drawPath(path)

    def date(self, value: str, x: tuple[int, int, int], y: int) -> None:
        for part, position in zip(value.split("-"), x, strict=True):
            self.text(position, y, part, 22 if len(part) == 4 else 13, size=7.6)

    def finish(self):
        self.canvas.showPage()
        self.canvas.save()
        self.stream.seek(0)
        return PdfReader(self.stream).pages[0]


def _application_front(page: Overlay, form: ApplicationForm, day: str) -> None:
    person = form.beneficiary
    page.text(184, 309, person.name, 82)
    page.text(281, 312, person.demo_id, 195)
    page.text(553, 320, person.mobile, 116)
    page.text(229, 367, person.address, 440)
    if person.residence:
        page.text(374, 396, person.residence, 295)

    if form.applicant:
        applicant = form.applicant
        page.text(183, 503, applicant.name, 82)
        page.text(514, 503, applicant.mobile, 155)
        page.text(224, 538, applicant.address, 445)
        x, y = {
            "SPOUSE": (300, 498), "PARENT": (355, 498), "CHILD": (401, 498),
            "RELATIVE": (304, 514), "GUARDIAN": (388, 514),
        }[applicant.relationship]
        page.check(x, y)
    if form.caregiver:
        caregiver = form.caregiver
        page.text(181, 793, caregiver.name, 72)
        page.text(325, 793, RELATIONSHIPS[caregiver.relationship], 71)
        page.text(472, 792, caregiver.mobile, 197)

    page.check(286 if form.notice_recipient == "BENEFICIARY" else 375, 691)
    page.check(285 if form.notice_method == "MAIL" else 440, 710)
    page.check(232 if form.application_type == "SELF" else 276, 849)
    page.date(day, (557, 604, 641), 873)
    signer = form.applicant or person
    page.text(429, 892, f"{signer.name} · 모의 확인", 171)


def _application_back(page: Overlay, form: ApplicationForm, _day: str) -> None:
    signer = form.applicant or form.beneficiary
    if form.consents.family_record is not None:
        page.check(202 if form.consents.family_record else 275, 551)
        page.text(464, 550, f"{signer.name} · 모의 확인", 139)
    page.check(202 if form.consents.administrative else 275, 685)
    page.text(464, 684, f"{signer.name} · 모의 확인", 139)


def _consent_front(page: Overlay, form: ApplicationForm, day: str) -> None:
    person = form.beneficiary
    page.text(219, 252, person.name, 103)
    page.text(174, 287, person.demo_id, 147)
    page.text(382, 283, person.mobile, 283)
    page.text(221, 309, person.address, 447)
    page.date(day, (568, 609, 632), 252)
    if person.sex:
        page.check(454 if person.sex == "FEMALE" else 399, 253)
    if form.caregiver:
        caregiver = form.caregiver
        page.text(221, 342, caregiver.name, 103)
        page.text(376, 342, RELATIONSHIPS[caregiver.relationship], 117)
        page.text(548, 342, caregiver.mobile, 119)
        page.text(221, 367, caregiver.address, 447)
    page.check(580 if form.consents.personal else 629, 696)


def _consent_back(page: Overlay, form: ApplicationForm, day: str) -> None:
    page.check(580 if form.consents.sensitive else 629, 274)
    page.check(580 if form.consents.unique_id else 629, 677)
    page.date(day, (538, 594, 640), 799)
    signer = form.caregiver or form.beneficiary
    page.text(391, 824, signer.name, 140)
    page.text(542, 824, "모의 확인", 61)


def _document(name: str, pages, form: ApplicationForm, day: str) -> bytes:
    writer = PdfWriter()
    source = PdfReader(BytesIO(_source(name)))
    for original, fill in zip(source.pages, pages, strict=True):
        page = writer.add_page(original)
        overlay = Overlay(float(page.mediabox.width), float(page.mediabox.height))
        fill(overlay, form, day)
        page.merge_page(overlay.finish())
    stream = BytesIO()
    writer.write(stream)
    return stream.getvalue()


def render_forms(form: ApplicationForm, day: str) -> tuple[bytes, bytes]:
    # ReportLab shares its registered font objects between canvases.
    with _DRAW_LOCK:
        return (
            _document("application.pdf", (_application_front, _application_back), form, day),
            _document("privacy-consent.pdf", (_consent_front, _consent_back), form, day),
        )
