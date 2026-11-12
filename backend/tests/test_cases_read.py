"""5번 신청 목록·상세 조회: 관할 제한, 정렬·페이지, 쿼리 검증, 후속 단계가 저장된 상세."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.config import APP_ORIGINS_ENV
from app.db import DB_PATH_ENV, connect, init_db
from app.db.seed import seed_demo_data
from app.main import app

PASSWORD = "demo-pass-1234"
HEADERS = {"Origin": "http://127.0.0.1:5173"}


@pytest.fixture()
def db_file(tmp_path, monkeypatch):
    path = init_db(tmp_path / "app.sqlite3")
    monkeypatch.setenv(DB_PATH_ENV, str(path))
    monkeypatch.delenv(APP_ORIGINS_ENV, raising=False)
    conn = connect(path)
    seed_demo_data(conn, PASSWORD)
    conn.execute(
        "INSERT INTO demo_profiles VALUES ('DEMO-ELDER-A2', '가상 대상자 A2', '신청인 A2', '안내대상 A2', "
        "'DEMO-A', 'DEMO-A-2', '충청북도', '음성군')"
    )
    conn.close()
    return path


@pytest.fixture()
def client(db_file):
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def login(client, username="demo-town-a"):
    assert client.post(
        "/api/v1/session", json={"username": username, "password": PASSWORD}, headers=HEADERS
    ).status_code == 200


def receive(client, received_on, key, profile="DEMO-ELDER-01"):
    res = client.post(
        "/api/v1/cases",
        json={"profileCode": profile, "receivedOn": received_on, "noticeMethod": "SMS", "evidenceChecked": True},
        headers={**HEADERS, "Idempotency-Key": key},
    )
    assert res.status_code == 201
    return res.json()


def ids(res):
    return [item["id"] for item in res.json()["items"]]


@pytest.fixture()
def three_cases(client):
    """A-1에 2건(11/01, 11/03), A-2에 1건(11/02)."""
    login(client)
    a = receive(client, "2026-11-01", "k1")
    b = receive(client, "2026-11-03", "k2")
    login(client, "demo-town-a2")
    c = receive(client, "2026-11-02", "k3", "DEMO-ELDER-A2")
    return a, b, c


# 목록 ---------------------------------------------------------------------------


def test_town_lists_own_town_newest_first(client, three_cases):
    a, b, _ = three_cases
    login(client)
    res = client.get("/api/v1/cases")
    assert res.status_code == 200
    assert res.json()["items"][0] == {
        k: b[k] for k in ("id", "receiptNumber", "beneficiaryName", "receivedOn", "status", "version", "region")
    }
    assert ids(res) == [b["id"], a["id"]]
    assert (res.json()["page"], res.json()["pageSize"], res.json()["total"]) == (1, 20, 2)


def test_district_lists_all_towns_in_district(client, three_cases):
    a, b, c = three_cases
    login(client, "demo-district-a")
    assert ids(client.get("/api/v1/cases")) == [b["id"], c["id"], a["id"]]


def test_outside_district_sees_nothing(client, three_cases):
    login(client, "demo-town-b")
    assert client.get("/api/v1/cases").json() == {"items": [], "page": 1, "pageSize": 20, "total": 0}


def test_same_received_on_breaks_tie_by_id(client):
    login(client)
    first = receive(client, "2026-11-01", "k1")
    second = receive(client, "2026-11-01", "k2")
    assert ids(client.get("/api/v1/cases")) == sorted([first["id"], second["id"]])


def test_pagination_and_past_last_page(client, three_cases):
    a, b, c = three_cases
    login(client, "demo-district-a")
    res = client.get("/api/v1/cases", params={"page": 2, "pageSize": 2})
    assert ids(res) == [a["id"]]
    assert (res.json()["page"], res.json()["pageSize"], res.json()["total"]) == (2, 2, 3)
    past = client.get("/api/v1/cases", params={"page": 5, "pageSize": 2})
    assert past.status_code == 200
    assert past.json() == {"items": [], "page": 5, "pageSize": 2, "total": 3}


def test_status_filter(client, three_cases, db_file):
    a, _, _ = three_cases
    conn = connect(db_file)
    conn.execute("UPDATE cases SET status = 'SCREENED' WHERE id = ?", (a["id"],))
    conn.close()
    login(client)
    res = client.get("/api/v1/cases", params={"status": "SCREENED"})
    assert ids(res) == [a["id"]]
    assert res.json()["total"] == 1


@pytest.mark.parametrize(
    "params,field",
    [
        ({"pageSize": 0}, "pageSize"),
        ({"pageSize": 51}, "pageSize"),
        ({"pageSize": "abc"}, "pageSize"),
        ({"page": 0}, "page"),
        ({"status": "DONE"}, "status"),
    ],
)
def test_bad_query_is_422_with_field(client, params, field):
    login(client)
    res = client.get("/api/v1/cases", params=params)
    assert res.status_code == 422
    assert res.json()["error"]["field"] == field


def test_list_requires_login(client):
    assert client.get("/api/v1/cases").status_code == 401


# 상세 ---------------------------------------------------------------------------


def test_detail_matches_receive_response(client, three_cases):
    a, _, _ = three_cases
    login(client)
    res = client.get(f"/api/v1/cases/{a['id']}")
    assert res.status_code == 200
    assert res.json() == a


def test_district_reads_detail_without_actions_while_received(client, three_cases):
    a, _, _ = three_cases
    login(client, "demo-district-a")
    res = client.get(f"/api/v1/cases/{a['id']}")
    assert res.status_code == 200
    assert res.json()["allowedActions"] == []


@pytest.mark.parametrize("username", ["demo-town-b", "demo-town-a2"])
def test_detail_outside_jurisdiction_is_404(client, three_cases, username):
    a, _, _ = three_cases
    login(client, username)
    res = client.get(f"/api/v1/cases/{a['id']}")
    assert res.status_code == 404
    assert res.json()["error"] == {"code": "NOT_FOUND", "message": "신청 건을 찾을 수 없습니다.", "field": None}


def test_unknown_case_is_404(client):
    login(client)
    assert client.get("/api/v1/cases/no-such-case").status_code == 404


def test_detail_requires_login(client):
    assert client.get("/api/v1/cases/anything").status_code == 401


def catalog(service_id, provider):
    return {
        "id": service_id, "datasetVersion": "v1.4", "programName": f"프로그램 {service_id}",
        "providerName": provider, "providerAddress": None, "providerPhone": None,
        "categoryLarge": "보건의료", "categoryMiddle": None, "sido": "충청북도", "sigungu": "음성군",
        "sigunguGu": None, "sourceName": "공단", "sourceUrl": "https://example.invalid", "referenceDate": "2026-06-30",
    }


def test_detail_with_later_stages_saved(client, db_file):
    """10번 이후 API가 저장할 기록을 DB에 직접 넣고 상세 응답 구성을 확인한다 (C-01 버전 13 모양)."""
    login(client)
    case = receive(client, "2026-11-01", "k1")
    cid = case["id"]
    conn = connect(db_file)
    actor = ("demo-district-a", "가상 시군구 담당자 A", "DISTRICT")
    items = [("item-a", "svc-a", "기관 A"), ("item-b", "svc-b", "기관 B"), ("item-c", "svc-c", None)]
    for _, sid, provider in items:
        conn.execute(
            "INSERT INTO nhis_catalog (dataset_version, nhis_service_id, source_row_number, source_name, source_url,"
            " reference_date, provider_name, is_duplicate_extra) VALUES ('v1.4', ?, 1, '공단', 'u', '2026-06-30', ?, 'N')",
            (sid, provider),
        )
    conn.execute("UPDATE cases SET status = 'FIRST_MONITORING_RECORDED', version = 13 WHERE id = ?", (cid,))
    conn.execute("INSERT INTO screenings VALUES (?, '2026-11-02', 'PHONE', 'NHIS_ASSESSMENT_REQUIRED')", (cid,))
    conn.execute("INSERT INTO assessments VALUES (?, '2026-11-03', '2026-11-03', 'SUPPORT_PLAN_REQUIRED')", (cid,))
    conn.execute(
        "INSERT INTO plans VALUES (?, '2026-11-04', '가상 목표', '2026-11-05', 'APPROVED', 'demo-district-a', '2026-11-05')",
        (cid,),
    )
    for pos, (iid, sid, provider) in enumerate(items, start=1):
        conn.execute(
            "INSERT INTO plan_items VALUES (?, ?, ?, 'v1.4', ?, ?)",
            (iid, cid, pos, sid, json.dumps(catalog(sid, provider), ensure_ascii=False)),
        )
    conn.execute("INSERT INTO service_linkages VALUES ('item-a', '2026-11-06', 'DEPARTMENT_REFERRAL', '가상 담당부서')")
    conn.execute("INSERT INTO service_linkages VALUES ('item-b', '2026-11-06', 'PROVIDER_REFERRAL', NULL)")
    conn.execute("INSERT INTO service_linkages VALUES ('item-c', '2026-11-06', 'PERSON_GUIDANCE', NULL)")
    conn.execute("INSERT INTO service_deliveries VALUES ('item-a', '2026-11-08', 'IN_USE', NULL)")
    conn.execute("INSERT INTO service_deliveries VALUES ('item-c', '2026-11-08', 'UNKNOWN', '검토 중')")
    observations = [
        {"itemId": "item-a", "status": "IN_USE", "reason": None},
        {"itemId": "item-b", "status": "NOT_STARTED", "reason": "가상 개시일 미정"},
        {"itemId": "item-c", "status": "UNKNOWN", "reason": "검토 중"},
    ]
    conn.execute(
        "INSERT INTO monitorings VALUES (?, '2026-11-09', 'VISIT', 'UNCHANGED', 1, '후속 검토', ?)",
        (cid, json.dumps(observations, ensure_ascii=False)),
    )
    conn.execute(
        "INSERT INTO case_events (id, case_id, action, from_status, to_status, actor_account_id, actor_display_name,"
        " actor_role, recorded_at, version, summary, plan_item_id)"
        " VALUES ('ev-2', ?, 'RECORD_LINKAGE', 'PLAN_CONFIRMED', 'SERVICE_TRACKING', ?, ?, ?, '2026-11-06T00:00:00Z', 2,"
        " '연계 기록', 'item-a')",
        (cid, *actor),
    )
    conn.close()

    body = client.get(f"/api/v1/cases/{cid}").json()
    assert body["status"] == "FIRST_MONITORING_RECORDED" and body["version"] == 13
    assert body["screening"] == {"screenedOn": "2026-11-02", "method": "PHONE", "outcome": "NHIS_ASSESSMENT_REQUIRED"}
    assert body["assessment"] == {
        "assessedOn": "2026-11-03", "resultReceivedOn": "2026-11-03", "outcome": "SUPPORT_PLAN_REQUIRED",
    }
    plan = body["plan"]
    assert (plan["preparedOn"], plan["goal"]) == ("2026-11-04", "가상 목표")
    assert plan["confirmation"] == {"meetingOn": "2026-11-05", "outcome": "APPROVED"}
    assert plan["notice"] == {"announcedOn": "2026-11-05"}
    assert [i["id"] for i in plan["items"]] == ["item-a", "item-b", "item-c"]
    assert plan["items"][0]["catalog"] == catalog("svc-a", "기관 A")
    # 부서 의뢰는 입력한 수신처, 제공기관 의뢰는 선택 시점 기관명, 대상자 안내는 null
    assert [i["linkage"]["destinationLabel"] for i in plan["items"]] == ["가상 담당부서", "기관 B", None]
    assert [i["delivery"] for i in plan["items"]] == [
        {"observedOn": "2026-11-08", "status": "IN_USE", "reason": None},
        None,
        {"observedOn": "2026-11-08", "status": "UNKNOWN", "reason": "검토 중"},
    ]
    assert body["monitoring"] == {
        "monitoredOn": "2026-11-09", "method": "VISIT", "condition": "UNCHANGED",
        "reviewNeeded": True, "reviewReason": "후속 검토", "observations": observations,
    }
    assert [(e["version"], e["action"], e["itemId"]) for e in body["events"]] == [
        (2, "RECORD_LINKAGE", "item-a"), (1, "RECEIVE", None),
    ]
    assert body["allowedActions"] == []
