"""Applicant submissions and evidence review in the mock inbox for jurisdiction staff."""

from __future__ import annotations

import base64
import hashlib
import json
import re
import sqlite3
import uuid
from datetime import UTC, datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import Field, StrictBool, StrictInt, StringConstraints

from ..auth import Account, CamelModel, current_account, require_role
from ..db import get_connection, write_transaction
from ..errors import ApiError
from ..registration import REGIONS, ApplicationForm, Beneficiary, SignedApplicationForm, SubmissionRegion
from ..registration_pdf import render_forms
from ..registration_photo import ApplicationSubmission, uploaded_photo
from ..registration_verification import (
    ManualReview, Observations, ReviewRequest, Verification, compare, compare_evidence, evidence_image,
)

router = APIRouter()
DocumentKind = Literal["application", "privacy-consent"]
_SEOUL = timezone(timedelta(hours=9))
_REQUEST_KEY = re.compile(r"\S{1,128}")
_MAX_REVISION = (1 << 63) - 1
RevisionNumber = Annotated[StrictInt, Field(ge=1, le=_MAX_REVISION)]
_LATEST = """coalesce((SELECT max(r.supersedes) + 1
                        FROM mock_application_resubmissions r WHERE r.application_id = a.id), 1)"""


class SubmissionSummary(CamelModel):
    id: str
    submission_number: str
    submitted_at: str
    beneficiary_name: str
    application_type: Literal["SELF", "FAMILY", "GUARDIAN"]
    region: SubmissionRegion
    revision: int
    status: Literal["SUBMITTED", "CHANGES_REQUESTED"]


class Revision(CamelModel):
    revision: int
    submitted_at: str


class CorrectionRequest(CamelModel):
    revision: RevisionNumber
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class Resubmission(ApplicationSubmission):
    revision: RevisionNumber
    retain_evidence: StrictBool = False


class ApplicantProfile(CamelModel):
    region: SubmissionRegion
    beneficiary: Beneficiary


class Submission(SubmissionSummary):
    form: ApplicationForm
    evidence_source: Literal["SAMPLE", "UPLOAD"] | None = None
    correction_reason: str | None
    latest: bool
    revisions: list[Revision]


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
        revision=row["revision"],
        status="CHANGES_REQUESTED" if row["revision"] == row["latest_revision"] and row["reason"] else "SUBMITTED",
    )


def _detail(conn: sqlite3.Connection, row: sqlite3.Row) -> Submission:
    form = ApplicationForm.model_validate_json(row["form_snapshot"])
    source = ("SAMPLE" if form.evidence_sample else "UPLOAD") if row["has_evidence"] else None
    revisions = conn.execute(
        """SELECT revision, submitted_at FROM mock_application_versions
           WHERE id = ? ORDER BY revision DESC""", (row["id"],),
    ).fetchall()
    return Submission(
        **_summary(row, form).model_dump(), form=form, evidence_source=source,
        correction_reason=row["reason"], latest=row["revision"] == row["latest_revision"],
        revisions=[Revision(**dict(revision)) for revision in revisions],
    )


def _scope(account: Account) -> tuple[str, tuple[str | None, ...]]:
    if account.role == "APPLICANT":
        return "a.owner_id = ?", (account.id,)
    if account.role == "TOWN":
        return "a.district_code = ? AND a.town_code = ?", (account.district_code, account.town_code)
    return "a.district_code = ?", (account.district_code,)


_SUBMISSIONS = f"""SELECT a.id, a.submission_number, a.town_code, v.revision, v.submitted_at,
                          v.form_snapshot, v.image IS NOT NULL AS has_evidence,
                          c.reason, {_LATEST} AS latest_revision
                   FROM mock_applications a JOIN mock_application_versions v ON v.id = a.id
                   LEFT JOIN mock_application_corrections c ON c.application_id = a.id AND c.revision = v.revision"""


def _find(conn: sqlite3.Connection, account: Account, application_id: str, revision: int | None = None) -> sqlite3.Row:
    where, params = _scope(account)
    row = conn.execute(
        f"{_SUBMISSIONS} WHERE a.id = ? AND {where} AND v.revision = coalesce(?, {_LATEST})",
        (application_id, *params, revision),
    ).fetchone()
    if row is None:
        raise ApiError(404, "NOT_FOUND", "모의 신청을 찾을 수 없습니다.")
    return row


def _request_key(request: Request) -> str:
    key = request.headers.get("idempotency-key")
    if key is None or not _REQUEST_KEY.fullmatch(key):
        raise ApiError(422, "VALIDATION_ERROR", "요청 키를 확인해 주세요.", "Idempotency-Key")
    return key


def _evidence(conn: sqlite3.Connection, application_id: str, revision: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT image, media_type FROM mock_application_versions WHERE id = ? AND revision = ? AND image IS NOT NULL",
        (application_id, revision),
    ).fetchone()


def _submission_content(
    body: ApplicationSubmission, retained: sqlite3.Row | None = None,
) -> tuple[str, str, tuple[bytes, str] | None]:
    if body.evidence_sample is not None and (body.evidence_photo is not None or retained is not None):
        raise ApiError(422, "VALIDATION_ERROR", "예시 확인서 또는 직접 첨부한 사진 중 하나를 선택해 주세요.", "evidencePhoto")
    photo = uploaded_photo(body.evidence_photo) if body.evidence_photo is not None else None
    if retained is not None:
        photo = (retained["image"], retained["media_type"])
    excluded = {"signatures", "evidence_photo", "revision", "retain_evidence"}
    if body.evidence_sample is None:
        excluded.add("evidence_sample")
    snapshot = body.model_dump_json(by_alias=True, exclude=excluded)
    digest = hashlib.sha256(snapshot.encode("utf-8"))
    if body.signatures is not None:
        digest.update(b"\0")
        digest.update(body.signatures.model_dump_json(by_alias=True).encode("utf-8"))
    if photo:
        digest.update(b"\0")
        digest.update(photo[0])
    if body.evidence_sample is not None:
        photo = (evidence_image(body.evidence_sample), "image/png")
    return snapshot, digest.hexdigest(), photo


def _check_retry(previous: sqlite3.Row, digest: str) -> None:
    if previous["request_hash"] != digest:
        raise ApiError(409, "IDEMPOTENCY_CONFLICT", "같은 요청 키로 다른 신청서를 제출했습니다.")


@router.get("/applicant-profile", response_model=ApplicantProfile | None)
def own_profile(
    account: Account = Depends(require_role("APPLICANT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> ApplicantProfile | None:
    row = conn.execute(
        "SELECT region_code, beneficiary FROM applicant_profiles WHERE account_id = ?", (account.id,),
    ).fetchone()
    if row is None:
        return None
    return ApplicantProfile(
        region=REGIONS[row["region_code"]], beneficiary=Beneficiary.model_validate_json(row["beneficiary"]),
    )


@router.get("/application-regions", response_model=list[SubmissionRegion])
def regions() -> list[SubmissionRegion]:
    return list(REGIONS.values())


@router.post("/applications/preview")
def preview(
    body: SignedApplicationForm,
    _: Account = Depends(require_role("APPLICANT")),
) -> dict[str, str]:
    application, consent = render_forms(body, datetime.now(_SEOUL).date().isoformat(), body.require_signatures())
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
    key = _request_key(request)
    snapshot, digest, photo = _submission_content(body)
    with write_transaction(conn):
        existing = conn.execute(
            """SELECT id, submission_number, submitted_at, form_snapshot, town_code, request_hash
               FROM mock_applications WHERE owner_id = ? AND idempotency_key = ?""",
            (account.id, key),
        ).fetchone()
        if existing is not None:
            _check_retry(existing, digest)
            response.status_code = 200
            return _detail(conn, _find(conn, account, existing["id"], 1))

        now = datetime.now(UTC)
        local_day = now.astimezone(_SEOUL).date()
        prefix = f"SIM-{local_day:%Y%m%d}-"
        sequence = conn.execute(
            """SELECT coalesce(max(CAST(substr(submission_number, ?) AS INTEGER)), 0) + 1
               FROM mock_applications WHERE submission_number LIKE ?""",
            (len(prefix) + 1, prefix + "%"),
        ).fetchone()[0]
        application, consent = render_forms(body, local_day.isoformat(), body.require_signatures())
        region = REGIONS[body.region_code]
        application_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO mock_applications (
                   id, submission_number, owner_id, district_code, town_code, submitted_at,
                   idempotency_key, request_hash, form_snapshot, application_pdf, consent_pdf
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                application_id, f"{prefix}{sequence:04d}", account.id, region.district_code, region.code,
                now.isoformat(timespec="seconds"), key, digest, snapshot, application, consent,
            ),
        )
        if photo:
            conn.execute(
                "INSERT INTO mock_application_evidence (application_id, image, media_type) VALUES (?, ?, ?)",
                (application_id, *photo),
            )
        return _detail(conn, _find(conn, account, application_id))


@router.post("/intake/{application_id}/corrections", response_model=Submission)
def request_correction(
    application_id: str,
    body: CorrectionRequest,
    account: Account = Depends(require_role("TOWN", "DISTRICT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Submission:
    with write_transaction(conn):
        current = _find(conn, account, application_id)
        if current["revision"] != body.revision or (current["reason"] and current["reason"] != body.reason):
            raise ApiError(409, "VERSION_CONFLICT", "신청이 변경되었습니다. 최신 제출본을 확인해 주세요.")
        if not current["reason"]:
            conn.execute(
                """INSERT INTO mock_application_corrections
                   (application_id, revision, reason, requested_by, requested_at) VALUES (?, ?, ?, ?, ?)""",
                (application_id, body.revision, body.reason, account.id, datetime.now(UTC).isoformat(timespec="seconds")),
            )
        return _detail(conn, _find(conn, account, application_id))


@router.post("/applications/{application_id}/revisions", status_code=201, response_model=Submission)
def resubmit(
    application_id: str,
    body: Resubmission,
    request: Request,
    response: Response,
    account: Account = Depends(require_role("APPLICANT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Submission:
    key = _request_key(request)
    with write_transaction(conn):
        original = _find(conn, account, application_id, body.revision)
        if body.region_code != original["town_code"]:
            raise ApiError(422, "VALIDATION_ERROR", "보완 제출 시 기존 관할을 유지해 주세요.", "regionCode")
        retained = None
        if body.retain_evidence:
            prior = ApplicationForm.model_validate_json(original["form_snapshot"])
            retained = _evidence(conn, application_id, body.revision)
            if retained is None or prior.evidence_sample is not None or body.evidence_photo is not None:
                raise ApiError(422, "VALIDATION_ERROR", "기존 첨부와 새 증빙 중 하나를 선택해 주세요.", "evidencePhoto")
        snapshot, digest, photo = _submission_content(body, retained)
        existing = conn.execute(
            """SELECT supersedes, request_hash FROM mock_application_resubmissions
               WHERE application_id = ? AND idempotency_key = ?""", (application_id, key),
        ).fetchone()
        if existing is not None:
            if existing["supersedes"] != body.revision:
                raise ApiError(409, "IDEMPOTENCY_CONFLICT", "같은 요청 키로 다른 제출본을 수정했습니다.")
            _check_retry(existing, digest)
            response.status_code = 200
            return _detail(conn, _find(conn, account, application_id, body.revision + 1))
        if original["latest_revision"] != body.revision or not original["reason"]:
            raise ApiError(409, "INVALID_TRANSITION", "최신 제출본에 보완 요청이 있을 때 다시 제출할 수 있습니다.")
        now = datetime.now(UTC)
        application, consent = render_forms(body, now.astimezone(_SEOUL).date().isoformat(), body.require_signatures())
        conn.execute(
            """INSERT INTO mock_application_resubmissions
               (application_id, supersedes, submitted_at, idempotency_key, request_hash,
                form_snapshot, application_pdf, consent_pdf, image, media_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (application_id, body.revision, now.isoformat(timespec="seconds"), key, digest,
             snapshot, application, consent, *(photo or (None, None))),
        )
        return _detail(conn, _find(conn, account, application_id))


def _list(conn: sqlite3.Connection, account: Account, page: int, page_size: int) -> SubmissionPage:
    where, params = _scope(account)
    total = conn.execute(f"SELECT count(*) FROM mock_applications a WHERE {where}", params).fetchone()[0]
    offset = (page - 1) * page_size
    rows = [] if offset >= total else conn.execute(
        f"""{_SUBMISSIONS} WHERE {where} AND v.revision = {_LATEST}
            ORDER BY v.submitted_at DESC, a.submission_number DESC LIMIT ? OFFSET ?""",
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
    revision: int | None = Query(default=None, ge=1, le=_MAX_REVISION),
    account: Account = Depends(require_role("APPLICANT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Submission:
    with conn:
        conn.execute("BEGIN")
        return _detail(conn, _find(conn, account, application_id, revision))


@router.get("/intake/{application_id}", response_model=Submission)
def inbox_detail(
    application_id: str,
    revision: int | None = Query(default=None, ge=1, le=_MAX_REVISION),
    account: Account = Depends(require_role("TOWN", "DISTRICT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Submission:
    with conn:
        conn.execute("BEGIN")
        return _detail(conn, _find(conn, account, application_id, revision))


@router.get("/applications/{application_id}/documents/{kind}", response_class=Response)
def document(
    application_id: str,
    kind: DocumentKind,
    revision: int | None = Query(default=None, ge=1, le=_MAX_REVISION),
    account: Account = Depends(current_account),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Response:
    column = "application_pdf" if kind == "application" else "consent_pdf"
    row = _find(conn, account, application_id, revision)
    pdf = conn.execute(
        f"SELECT {column} FROM mock_application_versions WHERE id = ? AND revision = ?",
        (application_id, row["revision"]),
    ).fetchone()[0]
    version_suffix = f"-r{row['revision']}" if row["revision"] > 1 else ""
    filename = f"{row['submission_number']}{version_suffix}-{kind}.pdf"
    return Response(
        pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"', "Cache-Control": "private, no-store"},
    )


@router.get("/applications/{application_id}/evidence", response_class=Response)
def read_evidence(
    application_id: str,
    revision: int | None = Query(default=None, ge=1, le=_MAX_REVISION),
    account: Account = Depends(current_account),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Response:
    application = _find(conn, account, application_id, revision)
    row = _evidence(conn, application_id, application["revision"])
    if row is None:
        raise ApiError(404, "NOT_FOUND", "첨부된 가상 증빙이 없습니다.")
    return Response(
        row["image"], media_type=row["media_type"],
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


def _latest_attempt(conn: sqlite3.Connection, application_id: str, revision: int) -> Verification | None:
    row = conn.execute(
        """SELECT id, compared_at, comparison, review
           FROM mock_verification_attempts WHERE application_id = ? AND revision = ? ORDER BY id DESC LIMIT 1""",
        (application_id, revision),
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
    revision: int | None = Query(default=None, ge=1, le=_MAX_REVISION),
    account: Account = Depends(require_role("TOWN", "DISTRICT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Verification | None:
    application = _find(conn, account, application_id, revision)
    return _latest_attempt(conn, application_id, application["revision"])


@router.post("/intake/{application_id}/verification", status_code=201, response_model=Verification)
def verify_submission(
    application_id: str,
    body: Observations,
    revision: int | None = Query(default=None, ge=1, le=_MAX_REVISION),
    account: Account = Depends(require_role("TOWN", "DISTRICT")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> Verification:
    with write_transaction(conn):
        application = _find(conn, account, application_id)
        if revision is not None and revision != application["revision"]:
            raise ApiError(409, "VERSION_CONFLICT", "최신 제출본을 확인해 주세요.")
        if not application["has_evidence"]:
            raise ApiError(404, "NOT_FOUND", "대조할 가상 증빙이 없습니다.")
        form = ApplicationForm.model_validate_json(application["form_snapshot"])
        rows = compare_evidence(form.beneficiary, body, sample=form.evidence_sample)
        now = datetime.now(UTC).isoformat(timespec="seconds")
        previous = _latest_attempt(conn, application_id, application["revision"])
        reviews = previous.reviews if previous else {}
        cursor = conn.execute(
            """INSERT INTO mock_verification_attempts
               (application_id, revision, compared_by, compared_at, comparison, review)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                application_id, application["revision"], account.id, now,
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
    with write_transaction(conn):
        application = _find(conn, account, application_id)
        verification = _latest_attempt(conn, application_id, application["revision"])
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
