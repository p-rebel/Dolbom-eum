from base64 import b64encode
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader

from app.db import connect, init_db
from app.db.seed import seed_demo_data
from app.main import app
from app.registration_photo import MAX_SUBMISSION_BYTES

ORIGIN = {"Origin": "http://127.0.0.1:5173"}
PASSWORD = "registration-test"
FORM = {
    "applicationType": "FAMILY",
    "regionCode": "DEMO-A-1",
    "beneficiary": {
        "name": "가상 대상자 A",
        "address": "가상 A시 돌봄로 10",
        "mobile": "000-0000-0101",
        "demoId": "DEMO-ID-0101",
        "birthDate": "1945-05-03",
        "sex": "FEMALE",
    },
    "applicant": {
        "name": "가상 신청인 B",
        "address": "가상 A시 신청로 20",
        "mobile": "000-0000-0202",
        "relationship": "CHILD",
    },
    "caregiver": {
        "name": "가상 보호자 C",
        "address": "가상 A시 보호로 30",
        "mobile": "000-0000-0303",
        "relationship": "CHILD",
    },
    "noticeRecipient": "APPLICANT",
    "noticeMethod": "SMS",
    "careNeeds": ["MEAL", "DAILY"],
    "consents": {
        "familyRecord": True, "administrative": True, "personal": True, "sensitive": False, "uniqueId": True,
    },
    "evidence": ["IDENTITY"],
    "confirmed": True,
}


@pytest.fixture
def db_file(tmp_path, monkeypatch):
    path = tmp_path / "registration.sqlite3"
    monkeypatch.setenv("DOLBOMEUM_DB_PATH", str(path))
    monkeypatch.setenv("DOLBOMEUM_APP_ORIGINS", ORIGIN["Origin"])
    init_db(path)
    conn = connect(path)
    try:
        seed_demo_data(conn, PASSWORD)
    finally:
        conn.close()
    return path


def login(client, username, audience):
    return client.post(
        "/api/v1/session", json={"username": username, "password": PASSWORD, "audience": audience}, headers=ORIGIN,
    )


def test_submitted_forms_are_visible_only_to_owner_and_jurisdiction(db_file):
    with TestClient(app) as applicant, TestClient(app) as staff, TestClient(app) as other:
        assert login(applicant, "demo-applicant-a", "applicant").status_code == 200
        assert applicant.get("/api/v1/cases").status_code == 403
        assert applicant.get("/api/v1/intake").status_code == 403

        assert applicant.post("/api/v1/applications/preview", json=FORM, headers=ORIGIN).status_code == 200
        assert applicant.get("/api/v1/applications").json()["total"] == 0
        headers = {**ORIGIN, "Idempotency-Key": "registration-form-test"}
        submitted = applicant.post("/api/v1/applications", json=FORM, headers=headers)
        assert submitted.status_code == 201, submitted.text
        detail = submitted.json()
        assert detail["submissionNumber"].startswith("SIM-")
        retry = applicant.post("/api/v1/applications", json=FORM, headers=headers)
        assert retry.status_code == 200
        assert retry.json()["id"] == detail["id"]
        changed = {**FORM, "noticeMethod": "MAIL"}
        assert applicant.post("/api/v1/applications", json=changed, headers=headers).status_code == 409

        assert login(staff, "demo-town-a", "staff").status_code == 200
        assert staff.get("/api/v1/intake").json()["items"][0]["id"] == detail["id"]
        assert staff.get(f"/api/v1/intake/{detail['id']}").json() == detail
        assert staff.get("/api/v1/cases").json()["total"] == 0
        for kind in ("application", "privacy-consent"):
            url = f"/api/v1/applications/{detail['id']}/documents/{kind}"
            own_pdf = applicant.get(url)
            staff_pdf = staff.get(url)
            assert own_pdf.status_code == staff_pdf.status_code == 200
            assert own_pdf.content == staff_pdf.content
            pdf = PdfReader(BytesIO(own_pdf.content))
            assert len(pdf.pages) == 2
            assert all("모의 제출용" in page.extract_text() for page in pdf.pages)
            assert "가상 대상자 A" in pdf.pages[0].extract_text()
            assert "가상 A시 돌봄로 10" in pdf.pages[0].extract_text()

            assert login(other, "demo-applicant-b", "applicant").status_code == 200
            assert other.get(url).status_code == 404
            assert login(other, "demo-town-a2", "staff").status_code == 200
            assert other.get(url).status_code == 404


def test_login_audience_and_evidence_are_checked_before_submission(db_file):
    with TestClient(app) as client:
        assert login(client, "demo-applicant-a", "staff").status_code == 403
        assert client.get("/api/v1/session").status_code == 401
        assert login(client, "demo-town-a", "applicant").status_code == 403
        assert login(client, "demo-applicant-a", "applicant").status_code == 200
        invalid_form = {**FORM, "evidence": []}
        headers = {**ORIGIN, "Idempotency-Key": "registration-evidence-test"}
        assert client.post("/api/v1/applications", json=invalid_form, headers=headers).status_code == 422
        assert client.get("/api/v1/applications").json()["total"] == 0


def test_staff_compare_and_review_attached_evidence_in_jurisdiction(db_file):
    with TestClient(app) as applicant, TestClient(app) as staff, TestClient(app) as other:
        assert login(applicant, "demo-applicant-a", "applicant").status_code == 200
        form = {**FORM, "evidenceSample": "ADDRESS_DIFFERENT"}
        headers = {**ORIGIN, "Idempotency-Key": "registration-attached-evidence"}
        submitted = applicant.post("/api/v1/applications", json=form, headers=headers)
        assert submitted.status_code == 201, submitted.text
        application_id = submitted.json()["id"]
        evidence_url = f"/api/v1/applications/{application_id}/evidence"
        verification_url = f"/api/v1/intake/{application_id}/verification"

        applicant_scan = applicant.get(evidence_url)
        assert applicant_scan.headers["content-type"] == "image/png"
        assert applicant_scan.content.startswith(b"\x89PNG")
        assert login(staff, "demo-town-a", "staff").status_code == 200
        assert staff.get(evidence_url).content == applicant_scan.content
        assert staff.get(verification_url).json() is None
        assert login(other, "demo-town-a2", "staff").status_code == 200
        assert other.get(evidence_url).status_code == 404
        assert other.get(verification_url).status_code == 404

        readings = {
            "name": {"value": "가상대상자 A", "confidence": 96},
            "birthDate": {"value": "1945–05–03", "confidence": 91},
            "demoId": {"value": "DEMO-ID-0101", "confidence": 55},
            "address": {"value": "가상 A시 돌봄로 30", "confidence": 92},
        }
        assert applicant.post(verification_url, json=readings, headers=ORIGIN).status_code == 403
        assert other.post(verification_url, json=readings, headers=ORIGIN).status_code == 404
        created = staff.post(verification_url, json=readings, headers=ORIGIN)
        assert created.status_code == 201, created.text
        attempt = created.json()
        rows = {row["field"]: row for row in attempt["rows"]}
        assert [row["evidenceResult"] for row in rows.values()] == ["MATCH", "MATCH", "NEEDS_REVIEW", "DIFFERENT"]
        assert {row["referenceResult"] for row in rows.values()} == {"MATCH"}

        review_url = f"{verification_url}/{attempt['id']}/review"
        review = {"field": "demoId", "value": "DEMO-ID-0101", "note": "원본 식별자 확인"}
        assert other.put(review_url, json=review, headers=ORIGIN).status_code == 404
        assert applicant.put(review_url, json=review, headers=ORIGIN).status_code == 403
        saved = staff.put(review_url, json=review, headers=ORIGIN)
        assert saved.status_code == 200, saved.text
        assert saved.json()["reviews"]["demoId"]["result"] == "MATCH"
        assert saved.json()["rows"] == attempt["rows"]
        assert staff.get(verification_url).json() == saved.json()
        assert staff.get(evidence_url).content == applicant_scan.content

        rerun = staff.post(verification_url, json=readings, headers=ORIGIN).json()
        assert rerun["id"] != attempt["id"]
        assert rerun["reviews"] == saved.json()["reviews"]
        assert staff.put(review_url, json=review, headers=ORIGIN).status_code == 409


def test_uploaded_photo_is_saved_with_submission_and_compared_with_applicant_values(db_file):
    photo = BytesIO()
    Image.new("RGB", (72, 48), "white").save(photo, format="JPEG")
    image = photo.getvalue()
    encoded = b64encode(image).decode("ascii")
    with TestClient(app) as applicant, TestClient(app) as staff, TestClient(app) as other:
        assert login(applicant, "demo-applicant-a", "applicant").status_code == 200
        headers = {**ORIGIN, "Idempotency-Key": "registration-upload"}
        form = {**FORM, "evidencePhoto": encoded}
        submission = applicant.post("/api/v1/applications", json=form, headers=headers)
        assert submission.status_code == 201, submission.text
        detail = submission.json()
        assert detail["evidenceSource"] == "UPLOAD"
        assert "evidencePhoto" not in detail["form"]
        assert applicant.post("/api/v1/applications", json=form, headers=headers).status_code == 200
        assert applicant.post("/api/v1/applications", json=FORM, headers=headers).status_code == 409
        assert applicant.get("/api/v1/applications").json()["total"] == 1
        application_id = detail["id"]
        evidence_url = f"/api/v1/applications/{application_id}/evidence"
        verification_url = f"/api/v1/intake/{application_id}/verification"
        assert login(staff, "demo-town-a", "staff").status_code == 200
        assert login(other, "demo-town-a2", "staff").status_code == 200
        assert other.get(evidence_url).status_code == 404
        assert login(other, "demo-applicant-b", "applicant").status_code == 200
        assert other.get(evidence_url).status_code == 404
        for viewer in (applicant, staff):
            original = viewer.get(evidence_url)
            assert original.status_code == 200
            assert original.content == image
            assert original.headers["content-type"] == "image/jpeg"
            assert original.headers["cache-control"] == "private, no-store"

        readings = {
            "name": {"value": "가상 대상자 A", "confidence": 95},
            "birthDate": {"value": "1945년 5월 3일", "confidence": 91},
            "demoId": {"value": None, "confidence": 0},
            "address": {"value": "가상 A시 돌봄로 30", "confidence": 92},
        }
        checked = staff.post(verification_url, json=readings, headers=ORIGIN)
        assert checked.status_code == 201, checked.text
        rows = checked.json()["rows"]
        assert [row["evidenceResult"] for row in rows] == ["MATCH", "MATCH", "NEEDS_REVIEW", "DIFFERENT"]
        assert all(row["reference"] is None and row["referenceResult"] is None for row in rows)


def test_invalid_or_oversized_photo_leaves_no_submission(db_file):
    with TestClient(app) as applicant:
        assert login(applicant, "demo-applicant-a", "applicant").status_code == 200
        headers = {**ORIGIN, "Idempotency-Key": "registration-upload-invalid"}
        encoded = b64encode(b"<svg>not a photo</svg>").decode("ascii")
        invalid = applicant.post("/api/v1/applications", json={**FORM, "evidencePhoto": encoded}, headers=headers)
        assert invalid.status_code == 422
        assert invalid.json()["error"]["field"] == "evidencePhoto"
        too_large = applicant.post(
            "/api/v1/applications",
            content=b" " * (MAX_SUBMISSION_BYTES + 1),
            headers={**headers, "Content-Type": "application/json"},
        )
        assert too_large.status_code == 413, too_large.text
        assert applicant.get("/api/v1/applications").json()["total"] == 0
