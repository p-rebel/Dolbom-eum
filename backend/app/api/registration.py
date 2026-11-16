"""Applicant submissions and evidence review in the mock inbox for jurisdiction staff."""

from __future__ import annotations

import base64
import hashlib
import json
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
from ..registration_photo import ApplicationSubmission, uploaded_photo
from ..registration_verification import (
    ManualReview, Observations, ReviewRequest, Verification, compare, compare_evidence, evidence_image,
)

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
    evidence_source: Literal["SAMPLE", "UPLOAD"] | None = None


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


def _detail(conn: sqlite3.Connection, row: sqlite3.Row) -> Submission:
    form = ApplicationForm.model_validate_json(row["form_snapshot"])
    evidence = conn.execute(
        "SELECT 1 FROM mock_application_evidence WHERE application_id = ?", (row["id"],),
    ).fetchone()
    source = ("SAMPLE" if form.evidence_sample else "UPLOAD") if evidence else None
    return Submission(**_summary(row, form).model_dump(), form=form, evidence_source=source)


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
    body: ApplicationSubmission,
    request: Request,
    response: Response,
    account: Account = Depends(require_role("APPLICANT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Submission:
    key = request.headers.get("idempotency-key")
    if key is None or not _REQUEST_KEY.fullmatch(key):
        raise ApiError(422, "VALIDATION_ERROR", "요청 키를 확인해 주세요.", "Idempotency-Key")
    if body.evidence_sample is not None and body.evidence_photo is not None:
        raise ApiError(422, "VALIDATION_ERROR", "예시 확인서 또는 직접 첨부한 사진 중 하나를 선택해 주세요.", "evidencePhoto")
    photo = uploaded_photo(body.evidence_photo) if body.evidence_photo is not None else None
    omitted = {"evidence_photo"}
    if body.evidence_sample is None:
        omitted.add("evidence_sample")
    snapshot = body.model_dump_json(by_alias=True, exclude=omitted)
    request_hash = hashlib.sha256(snapshot.encode("utf-8"))
    if photo:
        request_hash.update(b"\0")
        request_hash.update(photo[0])
    digest = request_hash.hexdigest()
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
            return _detail(conn, existing)

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
        if body.evidence_sample is not None:
            photo = (evidence_image(body.evidence_sample), "image/png")
        if photo:
            conn.execute(
                "INSERT INTO mock_application_evidence (application_id, image, media_type) VALUES (?, ?, ?)",
                (application_id, *photo),
            )
        return _detail(conn, row)


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
    return _detail(conn, _find(conn, account, application_id))


@router.get("/intake/{application_id}", response_model=Submission)
def inbox_detail(
    application_id: str,
    account: Account = Depends(require_role("TOWN", "DISTRICT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Submission:
    return _detail(conn, _find(conn, account, application_id))


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


@router.get("/applications/{application_id}/evidence", response_class=Response)
def read_evidence(
    application_id: str,
    account: Account = Depends(current_account),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Response:
    _find(conn, account, application_id, "id")
    row = conn.execute(
        "SELECT image, media_type FROM mock_application_evidence WHERE application_id = ?", (application_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "NOT_FOUND", "첨부된 가상 증빙이 없습니다.")
    return Response(
        row["image"], media_type=row["media_type"],
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


def _latest_attempt(conn: sqlite3.Connection, application_id: str) -> Verification | None:
    row = conn.execute(
        """SELECT id, compared_at, comparison, review
           FROM mock_verification_attempts WHERE application_id = ? ORDER BY id DESC LIMIT 1""",
        (application_id,),
    ).fetchone()
    if row is None:
        return None
    return Verification(
        id=row["id"], compared_at=row["compared_at"], rows=json.loads(row["comparison"]),
        reviews=json.loads(row["review"]) if row["review"] else {},
    )


@router.get("/intake/{application_id}/verification", response_model=Verification | None)
def current_verification(
    application_id: str,
    account: Account = Depends(require_role("TOWN", "DISTRICT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Verification | None:
    _find(conn, account, application_id, "id")
    return _latest_attempt(conn, application_id)


@router.post("/intake/{application_id}/verification", status_code=201, response_model=Verification)
def verify_submission(
    application_id: str,
    body: Observations,
    account: Account = Depends(require_role("TOWN", "DISTRICT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Verification:
    application = _find(conn, account, application_id, "form_snapshot")
    exists = conn.execute(
        "SELECT 1 FROM mock_application_evidence WHERE application_id = ?", (application_id,),
    ).fetchone()
    if exists is None:
        raise ApiError(404, "NOT_FOUND", "대조할 가상 증빙이 없습니다.")
    form = ApplicationForm.model_validate_json(application["form_snapshot"])
    rows = compare_evidence(form.beneficiary, body, sample=form.evidence_sample)
    now = datetime.now(UTC).isoformat(timespec="seconds")
    with write_transaction(conn):
        previous = _latest_attempt(conn, application_id)
        reviews = previous.reviews if previous else {}
        cursor = conn.execute(
            """INSERT INTO mock_verification_attempts (application_id, compared_by, compared_at, comparison, review)
               VALUES (?, ?, ?, ?, ?)""",
            (
                application_id, account.id, now,
                json.dumps([row.model_dump(by_alias=True) for row in rows], ensure_ascii=False),
                json.dumps({field: review.model_dump(by_alias=True) for field, review in reviews.items()}, ensure_ascii=False),
            ),
        )
        return Verification(id=cursor.lastrowid, compared_at=now, rows=rows, reviews=reviews)


@router.put("/intake/{application_id}/verification/{attempt_id}/review", response_model=Verification)
def save_evidence_review(
    application_id: str,
    attempt_id: int,
    body: ReviewRequest,
    account: Account = Depends(require_role("TOWN", "DISTRICT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Verification:
    _find(conn, account, application_id, "id")
    with write_transaction(conn):
        verification = _latest_attempt(conn, application_id)
        if verification is None or verification.id != attempt_id:
            raise ApiError(409, "VERSION_CONFLICT", "더 최근 대조 결과가 있습니다. 새로 불러온 뒤 확인해 주세요.")
        row = next(item for item in verification.rows if item.field == body.field)
        verification.reviews[body.field] = ManualReview(
            value=body.value,
            result=compare(body.field, row.submitted, body.value),
            note=body.note,
            reviewer=account.display_name,
            reviewed_at=datetime.now(UTC).isoformat(timespec="seconds"),
        )
        reviews = {field: review.model_dump(by_alias=True) for field, review in verification.reviews.items()}
        conn.execute(
            "UPDATE mock_verification_attempts SET review = ? WHERE id = ?",
            (json.dumps(reviews, ensure_ascii=False), attempt_id),
        )
        return verification
