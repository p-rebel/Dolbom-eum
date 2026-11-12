"""D-04 신청 접수: POST /cases (작업 4)."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import StrictBool, StrictStr, field_validator

from ..auth import Account, CamelModel, require_role
from ..cases import CaseDetail, load_case_detail
from ..db import get_connection, write_transaction
from ..errors import ApiError
from .sessions import profile_from_row

router = APIRouter()

_IDEMPOTENCY_KEY = re.compile(r"\S{1,128}")
_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


class ReceiveRequest(CamelModel):
    profile_code: StrictStr
    received_on: StrictStr
    notice_method: Literal["SMS", "MAIL"]
    evidence_checked: StrictBool

    @field_validator("received_on")
    @classmethod
    def _business_date(cls, value: str) -> str:
        # fromisoformat만으로는 20261101 같은 형식도 통과하므로 YYYY-MM-DD를 먼저 확인한다
        if not _DATE.fullmatch(value):
            raise ValueError("YYYY-MM-DD 형식이어야 합니다.")
        date.fromisoformat(value)
        return value

    @field_validator("evidence_checked")
    @classmethod
    def _evidence_required(cls, value: bool) -> bool:
        if not value:
            raise ValueError("증빙 확인이 필요합니다.")
        return value


def request_hash(body: ReceiveRequest) -> str:
    """D-03: 접수 4개 필드를 키 정렬·공백 없는 UTF-8 JSON으로 만든 SHA-256."""
    canonical = json.dumps(
        body.model_dump(by_alias=True), sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.post("/cases", status_code=201, response_model=CaseDetail)
def receive_case(
    body: ReceiveRequest,
    request: Request,
    response: Response,
    account: Account = Depends(require_role("TOWN")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> CaseDetail:
    key = request.headers.get("idempotency-key")
    if key is None or not _IDEMPOTENCY_KEY.fullmatch(key):
        raise ApiError(422, "VALIDATION_ERROR", "요청 키를 확인해 주세요.", "Idempotency-Key")
    digest = request_hash(body)

    with write_transaction(conn):
        profile_row = conn.execute(
            "SELECT * FROM demo_profiles WHERE code = ? AND town_code = ?",
            (body.profile_code, account.town_code),
        ).fetchone()
        if profile_row is None:
            raise ApiError(422, "VALIDATION_ERROR", "관할 내 가상 프로필을 선택해 주세요.", "profileCode")

        existing = conn.execute(
            "SELECT * FROM cases WHERE created_by = ? AND idempotency_key = ?", (account.id, key)
        ).fetchone()
        if existing is not None:
            if existing["request_hash"] != digest:
                raise ApiError(409, "IDEMPOTENCY_CONFLICT", "같은 요청 키로 다른 접수 내용이 이미 저장되었습니다.")
            response.status_code = 200
            return load_case_detail(conn, existing, account)

        profile = profile_from_row(profile_row)
        seq = conn.execute("SELECT coalesce(max(receipt_seq), 0) + 1 FROM cases").fetchone()[0]
        case_id = str(uuid.uuid4())
        now = _now()
        conn.execute(
            """INSERT INTO cases (id, receipt_seq, receipt_number, profile_code, profile_snapshot,
                   district_code, town_code, created_by, idempotency_key, request_hash,
                   received_on, notice_method, evidence_checked, status, version, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'RECEIVED', 1, ?, ?)""",
            (
                case_id, seq, f"DEMO-{seq:04d}", profile.code,
                profile.model_dump_json(by_alias=True),
                profile.region.district_code, profile.region.town_code,
                account.id, key, digest, body.received_on, body.notice_method, now, now,
            ),
        )
        conn.execute(
            """INSERT INTO case_events (id, case_id, action, from_status, to_status, actor_account_id,
                   actor_display_name, actor_role, recorded_at, version, summary)
               VALUES (?, ?, 'RECEIVE', NULL, 'RECEIVED', ?, ?, ?, ?, 1, '신청 접수')""",
            (str(uuid.uuid4()), case_id, account.id, account.display_name, account.role, now),
        )
        row = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        return load_case_detail(conn, row, account)
