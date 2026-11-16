"""Applicant submissions and the read-only mock inbox for jurisdiction staff."""

from __future__ import annotations

import base64
import hashlib
import re
import sqlite3
import uuid
from datetime import UTC, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from ..auth import Account, CamelModel, current_account, require_role
from ..db import get_connection, write_transaction
from ..errors import ApiError
from ..registration import REGIONS, ApplicationForm, SubmissionRegion
from ..registration_pdf import render_forms

router = APIRouter()
DocumentKind = Literal["application", "privacy-consent"]
_SEOUL = timezone(timedelta(hours=9))
_REQUEST_KEY = re.compile(r"\S{1,128}")


class SubmissionSummary(CamelModel):
    id: str
    submission_number: str
    submitted_at: str
    beneficiary_name: str
    application_type: Literal["SELF", "FAMILY", "GUARDIAN"]
    region: SubmissionRegion


class Submission(SubmissionSummary):
    form: ApplicationForm


class SubmissionPage(CamelModel):
    items: list[SubmissionSummary]
    page: int
    page_size: int
    total: int


def _summary(row: sqlite3.Row, form: ApplicationForm) -> SubmissionSummary:
    return SubmissionSummary(
        id=row["id"],
        submission_number=row["submission_number"],
        submitted_at=row["submitted_at"],
        beneficiary_name=form.beneficiary.name,
        application_type=form.application_type,
        region=REGIONS[row["town_code"]],
    )


def _detail(row: sqlite3.Row) -> Submission:
    form = ApplicationForm.model_validate_json(row["form_snapshot"])
    return Submission(**_summary(row, form).model_dump(), form=form)


def _scope(account: Account) -> tuple[str, tuple[str | None, ...]]:
    if account.role == "APPLICANT":
        return "owner_id = ?", (account.id,)
    if account.role == "TOWN":
        return "district_code = ? AND town_code = ?", (account.district_code, account.town_code)
    return "district_code = ?", (account.district_code,)


def _find(conn: sqlite3.Connection, account: Account, application_id: str, *columns: str) -> sqlite3.Row:
    where, params = _scope(account)
    projection = ", ".join(columns) if columns else "id, submission_number, submitted_at, form_snapshot, town_code"
    row = conn.execute(
        f"SELECT {projection} FROM mock_applications WHERE id = ? AND {where}", (application_id, *params),
    ).fetchone()
    if row is None:
        raise ApiError(404, "NOT_FOUND", "모의 신청을 찾을 수 없습니다.")
    return row


@router.get("/application-regions", response_model=list[SubmissionRegion])
def regions() -> list[SubmissionRegion]:
    return list(REGIONS.values())


@router.post("/applications/preview")
def preview(
    body: ApplicationForm,
    _: Account = Depends(require_role("APPLICANT")),
) -> dict[str, str]:
    application, consent = render_forms(body, datetime.now(_SEOUL).date().isoformat())
    return {
        "application": base64.b64encode(application).decode("ascii"),
        "privacyConsent": base64.b64encode(consent).decode("ascii"),
    }


@router.post("/applications", status_code=201, response_model=Submission)
def submit(
    body: ApplicationForm,
    request: Request,
    response: Response,
    account: Account = Depends(require_role("APPLICANT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Submission:
    key = request.headers.get("idempotency-key")
    if key is None or not _REQUEST_KEY.fullmatch(key):
        raise ApiError(422, "VALIDATION_ERROR", "요청 키를 확인해 주세요.", "Idempotency-Key")
    snapshot = body.model_dump_json(by_alias=True)
    digest = hashlib.sha256(snapshot.encode("utf-8")).hexdigest()
    with write_transaction(conn):
        existing = conn.execute(
            """SELECT id, submission_number, submitted_at, form_snapshot, town_code, request_hash
               FROM mock_applications WHERE owner_id = ? AND idempotency_key = ?""",
            (account.id, key),
        ).fetchone()
        if existing is not None:
            if existing["request_hash"] != digest:
                raise ApiError(409, "IDEMPOTENCY_CONFLICT", "같은 요청 키로 다른 신청서를 제출했습니다.")
            response.status_code = 200
            return _detail(existing)

        now = datetime.now(UTC)
        local_day = now.astimezone(_SEOUL).date()
        prefix = f"SIM-{local_day:%Y%m%d}-"
        sequence = conn.execute(
            """SELECT coalesce(max(CAST(substr(submission_number, ?) AS INTEGER)), 0) + 1
               FROM mock_applications WHERE submission_number LIKE ?""",
            (len(prefix) + 1, prefix + "%"),
        ).fetchone()[0]
        application, consent = render_forms(body, local_day.isoformat())
        region = REGIONS[body.region_code]
        application_id = str(uuid.uuid4())
        row = conn.execute(
            """INSERT INTO mock_applications (
                   id, submission_number, owner_id, district_code, town_code, submitted_at,
                   idempotency_key, request_hash, form_snapshot, application_pdf, consent_pdf
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               RETURNING id, submission_number, submitted_at, form_snapshot, town_code""",
            (
                application_id, f"{prefix}{sequence:04d}", account.id, region.district_code, region.code,
                now.isoformat(timespec="seconds"), key, digest, snapshot, application, consent,
            ),
        ).fetchone()
        return _detail(row)


def _list(conn: sqlite3.Connection, account: Account, page: int, page_size: int) -> SubmissionPage:
    where, params = _scope(account)
    total = conn.execute(f"SELECT count(*) FROM mock_applications WHERE {where}", params).fetchone()[0]
    offset = (page - 1) * page_size
    rows = [] if offset >= total else conn.execute(
        f"""SELECT id, submission_number, submitted_at, form_snapshot, town_code
            FROM mock_applications WHERE {where}
            ORDER BY submitted_at DESC, submission_number DESC LIMIT ? OFFSET ?""",
        (*params, page_size, offset),
    )
    return SubmissionPage(
        items=[_summary(row, ApplicationForm.model_validate_json(row["form_snapshot"])) for row in rows],
        total=total, page=page, page_size=page_size,
    )


@router.get("/applications", response_model=SubmissionPage)
def applicant_submissions(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=50, alias="pageSize"),
    account: Account = Depends(require_role("APPLICANT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> SubmissionPage:
    return _list(conn, account, page, page_size)


@router.get("/intake", response_model=SubmissionPage)
def inbox(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=50, alias="pageSize"),
    account: Account = Depends(require_role("TOWN", "DISTRICT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> SubmissionPage:
    return _list(conn, account, page, page_size)


@router.get("/applications/{application_id}", response_model=Submission)
def applicant_detail(
    application_id: str,
    account: Account = Depends(require_role("APPLICANT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Submission:
    return _detail(_find(conn, account, application_id))


@router.get("/intake/{application_id}", response_model=Submission)
def inbox_detail(
    application_id: str,
    account: Account = Depends(require_role("TOWN", "DISTRICT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Submission:
    return _detail(_find(conn, account, application_id))


@router.get("/applications/{application_id}/documents/{kind}", response_class=Response)
def document(
    application_id: str,
    kind: DocumentKind,
    account: Account = Depends(current_account),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Response:
    column = "application_pdf" if kind == "application" else "consent_pdf"
    row = _find(conn, account, application_id, "submission_number", column)
    filename = f"{row['submission_number']}-{kind}.pdf"
    return Response(
        row[column], media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"', "Cache-Control": "private, no-store"},
    )
