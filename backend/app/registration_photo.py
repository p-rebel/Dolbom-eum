"""Validate an applicant's photo while retaining the exact submitted bytes."""

from __future__ import annotations

import binascii
from base64 import b64decode
from io import BytesIO
from typing import Annotated

from PIL import Image
from pydantic import Field

from .errors import ApiError
from .registration import SignedApplicationForm

MAX_PHOTO_BYTES = 8 * 1024 * 1024
MAX_ENCODED_PHOTO = 4 * ((MAX_PHOTO_BYTES + 2) // 3)
MAX_SUBMISSION_BYTES = MAX_ENCODED_PHOTO + 32 * 1024
_MEDIA_TYPES = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}


class ApplicationSubmission(SignedApplicationForm):
    evidence_photo: Annotated[str, Field(min_length=1, max_length=MAX_ENCODED_PHOTO)] | None = None


def uploaded_photo(encoded: str) -> tuple[bytes, str]:
    try:
        image = b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ApiError(422, "VALIDATION_ERROR", "가상 증빙 사진을 다시 선택해 주세요.", "evidencePhoto") from exc
    if len(image) > MAX_PHOTO_BYTES:
        raise ApiError(413, "PAYLOAD_TOO_LARGE", "8MB 이하의 사진을 첨부해 주세요.", "evidencePhoto")
    try:
        with Image.open(BytesIO(image), formats=list(_MEDIA_TYPES)) as opened:
            if max(opened.size) > 8192 or opened.width * opened.height > 24_000_000:
                raise ApiError(422, "VALIDATION_ERROR", "가로·세로 8,192픽셀 이하, 2,400만 화소 이하의 사진을 첨부해 주세요.", "evidencePhoto")
            if getattr(opened, "n_frames", 1) != 1:
                raise ValueError("Expected a still image")
            media_type = _MEDIA_TYPES[opened.format]
            opened.verify()
        with Image.open(BytesIO(image), formats=list(_MEDIA_TYPES)) as opened:
            opened.load()
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise ApiError(422, "VALIDATION_ERROR", "열 수 있는 JPG, PNG, WebP 사진을 첨부해 주세요.", "evidencePhoto") from exc
    return image, media_type
