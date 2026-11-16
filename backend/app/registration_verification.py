"""Compare OCR observations from a fictional evidence scan with submitted and reference data."""

from __future__ import annotations

import re
import unicodedata
from datetime import date
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from .auth import CamelModel
from .registration import Beneficiary, EvidenceSample

ComparedField = Literal["name", "birthDate", "demoId", "address"]
ComparisonStatus = Literal["MATCH", "DIFFERENT", "NEEDS_REVIEW"]
ObservationText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]
_FIELD_ORDER: tuple[ComparedField, ...] = ("name", "birthDate", "demoId", "address")
_MIN_CONFIDENCE = 80
_DISPLAY_HYPHENS = str.maketrans({"‐": "-", "‑": "-", "–": "-", "−": "-"})
_ASSETS = Path(__file__).with_name("assets") / "registration"
_SAMPLE_FILES: dict[EvidenceSample, str] = {
    "BENEFICIARY_A": "beneficiary-a-v1.png",
    "ADDRESS_DIFFERENT": "beneficiary-a-address-v1.png",
    "ID_BLURRY": "beneficiary-a-blurry-v1.png",
}

# All three sample images concern the same fictional person. The reference is never taken from the submission or OCR.
_REFERENCE: dict[ComparedField, str] = {
    "name": "가상 대상자 A",
    "birthDate": "1945-05-03",
    "demoId": "DEMO-ID-0101",
    "address": "가상 A시 돌봄로 10",
}


def evidence_image(sample: EvidenceSample) -> bytes:
    return (_ASSETS / _SAMPLE_FILES[sample]).read_bytes()


class Observation(CamelModel):
    value: ObservationText | None = None
    confidence: float = Field(ge=0, le=100, allow_inf_nan=False)


class Observations(CamelModel):
    name: Observation
    birth_date: Observation
    demo_id: Observation
    address: Observation


class ComparisonRow(CamelModel):
    field: ComparedField
    submitted: str
    scanned: str | None
    reference: str | None
    confidence: float
    evidence_result: ComparisonStatus
    reference_result: ComparisonStatus | None


class ReviewRequest(CamelModel):
    field: ComparedField
    value: ObservationText | None
    note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class ManualReview(CamelModel):
    value: str | None
    result: ComparisonStatus
    note: str
    reviewer: str
    reviewed_at: str


class Verification(CamelModel):
    id: int
    compared_at: str
    rows: list[ComparisonRow]
    reviews: dict[ComparedField, ManualReview]


def _normalize(field: ComparedField, text: str | None) -> str | None:
    if not text:
        return None
    value = re.sub(r"\s+", "", unicodedata.normalize("NFC", text)).translate(_DISPLAY_HYPHENS)
    if field == "birthDate":
        value = value.replace("년", "-").replace("월", "-").replace("일", "")
        parts = re.fullmatch(r"([0-9]{4})[-./]?([0-9]{1,2})[-./]?([0-9]{1,2})\.?", value)
        if parts is None:
            return None
        try:
            return date(*map(int, parts.groups())).isoformat()
        except ValueError:
            return None
    if field == "demoId":
        value = value.upper()
        if not re.fullmatch(r"DEMO-[A-Z0-9]{2,12}(?:-[A-Z0-9]{1,8})?", value):
            return None
    if field == "name" and not re.fullmatch(r"가상[가-힣A-Za-z0-9]+", value):
        return None
    if field == "address" and not re.fullmatch(r"가상[가-힣A-Za-z0-9.(),\-]+", value):
        return None
    return value or None


def compare(field: ComparedField, submitted: str, value: str | None) -> ComparisonStatus:
    normalized = _normalize(field, value)
    if normalized is None:
        return "NEEDS_REVIEW"
    return "MATCH" if _normalize(field, submitted) == normalized else "DIFFERENT"


def compare_evidence(beneficiary: Beneficiary, readings: Observations, *, sample: EvidenceSample | None) -> list[ComparisonRow]:
    submitted = beneficiary.model_dump(by_alias=True)
    observations = readings.model_dump(by_alias=True)
    rows: list[ComparisonRow] = []
    for field in _FIELD_ORDER:
        observation = observations[field]
        value = observation["value"]
        confidence = observation["confidence"]
        reference = _REFERENCE[field] if sample is not None else None
        rows.append(ComparisonRow(
            field=field,
            submitted=submitted[field],
            scanned=value,
            reference=reference,
            confidence=confidence,
            evidence_result=compare(field, submitted[field], value) if confidence >= _MIN_CONFIDENCE else "NEEDS_REVIEW",
            reference_result=compare(field, submitted[field], reference) if reference is not None else None,
        ))
    return rows
