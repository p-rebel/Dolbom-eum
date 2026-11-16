from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.db import connect, init_db
from app.db.seed import seed_demo_data
from app.main import app

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
