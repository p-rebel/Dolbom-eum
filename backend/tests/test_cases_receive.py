"""4번 신청 접수 API: C-01 공통 단계 [0]~[2], 입력 검증, 권한, allowedActions."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.auth import Account
from app.cases import Delivery, Linkage, Notice, Plan, PlanItem, allowed_actions
from app.config import APP_ORIGINS_ENV
from app.db import DB_PATH_ENV, connect, init_db
from app.db.seed import seed_demo_data
from app.main import app

PASSWORD = "demo-pass-1234"
HEADERS = {"Origin": "http://127.0.0.1:5173"}
BODY = {"profileCode": "DEMO-ELDER-01", "receivedOn": "2026-11-01", "noticeMethod": "SMS", "evidenceChecked": True}


@pytest.fixture()
def db_file(tmp_path, monkeypatch):
    path = init_db(tmp_path / "app.sqlite3")
    monkeypatch.setenv(DB_PATH_ENV, str(path))
    monkeypatch.delenv(APP_ORIGINS_ENV, raising=False)
    conn = connect(path)
    seed_demo_data(conn, PASSWORD)
    conn.close()
    return path


@pytest.fixture()
def client(db_file):
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def login(client, username="demo-town-a"):
    res = client.post("/api/v1/session", json={"username": username, "password": PASSWORD}, headers=HEADERS)
    assert res.status_code == 200


def receive(client, body=BODY, key="demo-receive-01"):
    headers = dict(HEADERS) if key is None else {**HEADERS, "Idempotency-Key": key}
    return client.post("/api/v1/cases", json=body, headers=headers)


def counts(db_file):
    conn = connect(db_file)
    try:
        return tuple(conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in ("cases", "case_events"))
    finally:
        conn.close()


# C-01 공통 단계 [0]~[2] ---------------------------------------------------------


def test_receive_creates_case_version_1(client, db_file):
    login(client)
    res = receive(client)
    assert res.status_code == 201
    body = res.json()
    assert body["receiptNumber"] == "DEMO-0001"
    assert body["status"] == "RECEIVED" and body["version"] == 1
    assert body["beneficiaryName"] == "가상 대상자 01"
    assert (body["receivedOn"], body["noticeMethod"], body["evidenceChecked"]) == ("2026-11-01", "SMS", True)
    assert body["region"] == {"districtCode": "DEMO-A", "townCode": "DEMO-A-1", "sido": "충청북도", "sigungu": "음성군"}
    assert body["profile"] == {
        "code": "DEMO-ELDER-01",
        "beneficiaryName": "가상 대상자 01",
        "applicantName": "가상 대리 신청인 01",
        "noticeRecipientName": "가상 대리 신청인 01",
        "region": body["region"],
    }
    assert [body[k] for k in ("screening", "assessment", "plan", "monitoring")] == [None] * 4
    [event] = body["events"]
    assert {k: event[k] for k in ("action", "fromStatus", "toStatus", "actorRole", "version", "itemId")} == {
        "action": "RECEIVE", "fromStatus": None, "toStatus": "RECEIVED", "actorRole": "TOWN", "version": 1, "itemId": None,
    }
    assert event["actorDisplayName"] == "가상 읍면동 담당자 A-1"
    assert event["recordedAt"].endswith("Z")
    assert body["allowedActions"] == [{"action": "RECORD_SCREENING", "itemId": None}]
    assert counts(db_file) == (1, 1)


def test_same_key_and_body_returns_same_case_200(client, db_file):
    login(client)
    first = receive(client).json()
    res = receive(client)
    assert res.status_code == 200
    assert (res.json()["id"], res.json()["receiptNumber"], res.json()["version"]) == (
        first["id"], first["receiptNumber"], 1,
    )
    assert len(res.json()["events"]) == 1
    assert counts(db_file) == (1, 1)


def test_same_key_with_changed_body_is_409(client, db_file):
    login(client)
    receive(client)
    res = receive(client, {**BODY, "receivedOn": "2026-11-02"})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert res.json()["error"]["field"] is None
    assert counts(db_file) == (1, 1)
    conn = connect(db_file)
    assert conn.execute("SELECT received_on FROM cases").fetchone()[0] == "2026-11-01"
    conn.close()


def test_new_key_issues_next_receipt_number(client):
    login(client)
    receive(client)
    res = receive(client, key="demo-receive-02")
    assert res.status_code == 201
    assert res.json()["receiptNumber"] == "DEMO-0002"


def test_idempotency_key_is_scoped_per_account(client, db_file):
    conn = connect(db_file)
    conn.execute(
        "INSERT INTO demo_profiles VALUES ('DEMO-ELDER-A2', '가상 대상자 A2', '신청인', '안내대상', "
        "'DEMO-A', 'DEMO-A-2', '충청북도', '음성군')"
    )
    conn.close()
    login(client)
    receive(client)
    login(client, "demo-town-a2")
    res = receive(client, {**BODY, "profileCode": "DEMO-ELDER-A2"})
    assert res.status_code == 201
    assert counts(db_file) == (2, 2)


# 입력 검증 ----------------------------------------------------------------------


@pytest.mark.parametrize("key", [None, "", "has space", "x" * 129])
def test_bad_idempotency_key_is_422(client, db_file, key):
    login(client)
    res = receive(client, key=key)
    assert res.status_code == 422
    assert res.json()["error"]["field"] == "Idempotency-Key"
    assert counts(db_file) == (0, 0)


@pytest.mark.parametrize(
    "change,field",
    [
        ({"profileCode": None}, "profileCode"),
        ({"receivedOn": "20261101"}, "receivedOn"),
        ({"receivedOn": "2026-02-30"}, "receivedOn"),
        ({"noticeMethod": "FAX"}, "noticeMethod"),
        ({"evidenceChecked": False}, "evidenceChecked"),
        ({"evidenceChecked": "true"}, "evidenceChecked"),
    ],
)
def test_invalid_body_is_422_with_field(client, db_file, change, field):
    login(client)
    body = {k: v for k, v in {**BODY, **change}.items() if v is not None}
    res = receive(client, body)
    assert res.status_code == 422
    assert res.json()["error"] == {"code": "VALIDATION_ERROR", "message": "입력값을 확인해 주세요.", "field": field}
    assert counts(db_file) == (0, 0)


@pytest.mark.parametrize("username,code", [("demo-town-a", "NO-SUCH"), ("demo-town-b", "DEMO-ELDER-01")])
def test_profile_outside_town_is_422(client, db_file, username, code):
    login(client, username)
    res = receive(client, {**BODY, "profileCode": code})
    assert res.status_code == 422
    assert res.json()["error"]["field"] == "profileCode"
    assert counts(db_file) == (0, 0)


# 권한 ---------------------------------------------------------------------------


def test_receive_requires_login(client):
    assert receive(client).status_code == 401


def test_district_cannot_receive(client, db_file):
    login(client, "demo-district-a")
    res = receive(client)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"
    assert counts(db_file) == (0, 0)


# allowedActions (D-04 화면에서 사용할 동작, 예제의 기대값) --------------------------

TOWN = Account(id="t", display_name="t", role="TOWN", district_code="DEMO-A", town_code="DEMO-A-1")
DISTRICT = Account(id="d", display_name="d", role="DISTRICT", district_code="DEMO-A", town_code=None)
LINK = Linkage(linked_on="2026-11-06", method="PERSON_GUIDANCE", destination_label=None)
SEEN = Delivery(observed_on="2026-11-08", status="IN_USE", reason=None)


def plan(*items, notice=True):
    return Plan(
        prepared_on="2026-11-04", goal="g", confirmation=None,
        notice=Notice(announced_on="2026-11-05") if notice else None,
        items=[PlanItem(id=f"i{n}", catalog={}, linkage=lk, delivery=dv) for n, (lk, dv) in enumerate(items)],
    )


def actions(account, status, p=None):
    return [(a.action, a.item_id) for a in allowed_actions(account, status, p)]


def test_allowed_actions_follow_workflow():
    assert actions(TOWN, "RECEIVED") == [("RECORD_SCREENING", None)]
    assert actions(DISTRICT, "RECEIVED") == []
    assert actions(TOWN, "SCREENED") == []
    assert actions(DISTRICT, "SCREENED") == [("RECORD_ASSESSMENT", None)]
    assert actions(TOWN, "ASSESSED") == [("SAVE_DRAFT", None)]
    draft = plan((None, None))
    assert actions(TOWN, "PLAN_DRAFTED", draft) == [("SAVE_DRAFT", None)]
    assert actions(DISTRICT, "PLAN_DRAFTED", draft) == [("CONFIRM_PLAN", None)]
    assert actions(DISTRICT, "PLAN_CONFIRMED", plan((None, None), notice=False)) == [("RECORD_NOTICE", None)]
    assert actions(DISTRICT, "PLAN_CONFIRMED", plan((None, None), (None, None))) == [
        ("RECORD_LINKAGE", "i0"), ("RECORD_LINKAGE", "i1"),
    ]
    tracking = plan((LINK, SEEN), (LINK, None), (None, None))
    assert actions(DISTRICT, "SERVICE_TRACKING", tracking) == [
        ("RECORD_DELIVERY", "i0"), ("RECORD_DELIVERY", "i1"), ("RECORD_LINKAGE", "i2"),
    ]
    assert actions(TOWN, "SERVICE_TRACKING", tracking) == []
    assert actions(TOWN, "SERVICE_TRACKING", plan((LINK, SEEN), (LINK, SEEN))) == [("RECORD_MONITORING", None)]
    assert actions(TOWN, "FIRST_MONITORING_RECORDED", tracking) == []
    assert actions(DISTRICT, "FIRST_MONITORING_RECORDED", tracking) == []
