"""설계의 C-01·C-06을 실제 API로 실행하고, 초안 충돌을 두 세션에서 재현한다."""

import json
import re
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack, closing
from pathlib import Path
from threading import Barrier
from urllib.parse import unquote

import pytest
from fastapi.testclient import TestClient

from app.config import APP_ORIGINS_ENV, COOKIE_SECURE_ENV
from app.db import DB_PATH_ENV, connect, init_db
from app.db.nhis import load_nhis_catalog
from app.db.seed import seed_demo_data
from app.main import app

FIXTURE = Path(__file__).resolve().parents[2] / "docs/design/fixtures/C-01_C-06.json"
EXAMPLES = json.loads(FIXTURE.read_text(encoding="utf-8"))
ORIGIN = {"Origin": "http://127.0.0.1:5173"}
PASSWORD = "workflow-test-password"
VARIABLE = re.compile(r"\{\{(\w+)\}\}")


@pytest.fixture
def clients(tmp_path, monkeypatch):
    path = init_db(tmp_path / "workflow.sqlite3")
    monkeypatch.setenv(DB_PATH_ENV, str(path))
    monkeypatch.delenv(APP_ORIGINS_ENV, raising=False)
    monkeypatch.delenv(COOKIE_SECURE_ENV, raising=False)
    with closing(connect(path)) as conn:
        seed_demo_data(conn, PASSWORD)
        load_nhis_catalog(conn)

    with ExitStack() as stack:
        sessions = {}
        accounts = {actor: account["username"] for actor, account in EXAMPLES["accounts"].items()}
        accounts["secondTown"] = accounts["town"]
        for actor, username in accounts.items():
            client = stack.enter_context(TestClient(app, headers=ORIGIN))
            assert client.post("/api/v1/session", json={"username": username, "password": PASSWORD}).status_code == 200
            sessions[actor] = client
        yield sessions


def resolve(value, captures):
    if isinstance(value, str):
        match = VARIABLE.fullmatch(value)
        if match:
            return captures[match[1]]
        return VARIABLE.sub(lambda token: str(captures[token[1]]), value)
    if isinstance(value, list):
        return [resolve(item, captures) for item in value]
    if isinstance(value, dict):
        return {key: resolve(item, captures) for key, item in value.items()}
    return value


def assert_expected(actual, expected):
    if isinstance(expected, dict):
        for key, value in expected.items():
            assert_expected(actual[key], value)
    elif isinstance(expected, list):
        assert len(actual) == len(expected)
        for item, value in zip(actual, expected, strict=True):
            assert_expected(item, value)
    else:
        assert actual == expected


def run_step(clients, step, captures):
    client = clients[step["actor"]]
    method = step["method"]
    path = EXAMPLES["basePath"] + resolve(step["path"], captures)
    response = client.request(
        method, path, headers=step.get("headers"), params=step.get("query"),
        json=resolve(step.get("body"), captures),
    )
    expected = step["expect"]
    assert response.status_code == expected["http"], (method, path, response.text)
    actual = response.json()
    if "errorCode" in expected:
        assert actual["error"]["code"] == expected["errorCode"]
    if "body" in expected:
        assert_expected(actual, resolve(expected["body"], captures))
    for name, pointer in step.get("capture", {}).items():
        value = actual
        for key in pointer.split("/")[1:]:
            value = value[int(key)] if isinstance(value, list) else value[key]
        captures[name] = value
    if method == "PUT" and response.status_code == 200:
        assert client.get(f"/api/v1/cases/{actual['id']}").json() == actual


@pytest.mark.parametrize("scenario", ["C-01", "C-06"])
def test_workflow_examples(clients, scenario):
    captures = {}
    for step in [*EXAMPLES["commonSteps"], *EXAMPLES["scenarios"][scenario], EXAMPLES["finalCheck"]]:
        run_step(clients, step, captures)


def test_draft_concurrency_and_replacement(clients):
    captures = {}
    for step in EXAMPLES["commonSteps"]:
        if step["path"] == "/cases/{{caseId}}/plan" and step["body"]["version"] == 3:
            break
        run_step(clients, step, captures)

    path = f"/api/v1/cases/{captures['caseId']}/plan"
    first = "nhis_20260630_r00001"
    second = "nhis_20260630_r52411"
    barrier = Barrier(2)

    def draft(actor, service_id, goal):
        barrier.wait(timeout=10)
        return clients[actor].put(path, json={
            "version": 3, "preparedOn": "2026-11-04", "goal": goal, "serviceIds": [service_id],
        })

    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(draft, "town", first, "가상 초안 A")
        b = pool.submit(draft, "secondTown", second, "가상 초안 B")
        success, conflict = sorted([a.result(), b.result()], key=lambda response: response.status_code)

    assert success.status_code == 200 and conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "VERSION_CONFLICT"
    town = clients["town"]
    saved = town.get(path.removesuffix("/plan")).json()
    assert saved == success.json()
    assert saved["version"] == len(saved["events"]) == 4
    assert saved["events"][0]["action"] == "SAVE_DRAFT"

    body = {"version": 4, "preparedOn": "2026-11-04", "goal": " 새 초안 ", "serviceIds": [second, first]}
    invalid = town.put(path, json={**body, "serviceIds": [second, "nhis_20260630_r00931"]})
    assert invalid.status_code == 422 and invalid.json()["error"]["field"] == "serviceIds.1"
    assert town.get(path.removesuffix("/plan")).json() == saved

    replacement = town.put(path, json=body)
    assert replacement.status_code == 200, replacement.text
    result = replacement.json()
    assert result["version"] == len(result["events"]) == 5
    assert result["plan"]["goal"] == "새 초안"
    assert [item["catalog"]["id"] for item in result["plan"]["items"]] == [second, first]
    assert saved["plan"]["items"][0]["id"] not in {item["id"] for item in result["plan"]["items"]}


def test_workflow_checks_jurisdiction_and_role_before_body(clients):
    captures = {}
    run_step(clients, EXAMPLES["commonSteps"][0], captures)
    path = f"/api/v1/cases/{captures['caseId']}/screening"
    headers = {"Content-Type": "application/json"}
    for actor, status in [("outside", 404), ("otherTown", 404), ("district", 403), ("town", 422)]:
        assert clients[actor].put(path, content=b"{", headers=headers).status_code == status

    invalid = clients["town"].put(path, json={
        "version": 1, "screened_on": "2026-11-32", "method": "PHONE", "outcome": "NHIS_ASSESSMENT_REQUIRED",
    })
    assert invalid.status_code == 422
    assert invalid.json()["error"]["field"] == "screenedOn"
    with TestClient(app, headers=ORIGIN) as signed_out:
        assert signed_out.put(path, json={}).status_code == 401
    assert clients["town"].put(path, json={}, headers={"Origin": "http://127.0.0.1:5174"}).status_code == 403
    assert clients["town"].put(path, content=b"{}", headers={"Content-Type": "text/plain"}).status_code == 415


def test_town_case_and_profile_scope_includes_district(clients):
    with closing(connect()) as conn:
        conn.execute("UPDATE demo_accounts SET town_code = 'DEMO-A-1' WHERE id = 'demo-town-b'")
        conn.execute(
            """INSERT INTO demo_profiles VALUES ('DEMO-ELDER-B', '가상 대상자 B', '신청인 B', '안내대상 B',
                   'DEMO-B', 'DEMO-A-1', '충청북도', '진천군')"""
        )

    captures = {}
    run_step(clients, EXAMPLES["commonSteps"][0], captures)
    outside = clients["outside"]
    outside_receipt = outside.post(
        "/api/v1/cases", headers={"Idempotency-Key": "district-b-receive"},
        json={"profileCode": "DEMO-ELDER-B", "receivedOn": "2026-11-01", "noticeMethod": "SMS", "evidenceChecked": True},
    )
    assert outside_receipt.status_code == 201, outside_receipt.text

    town = clients["town"]
    assert [case["id"] for case in town.get("/api/v1/cases").json()["items"]] == [captures["caseId"]]
    assert [profile["code"] for profile in town.get("/api/v1/demo-profiles").json()["items"]] == ["DEMO-ELDER-01"]
    wrong_district = town.post(
        "/api/v1/cases", headers={"Idempotency-Key": "wrong-district"},
        json={"profileCode": "DEMO-ELDER-B", "receivedOn": "2026-11-01", "noticeMethod": "SMS", "evidenceChecked": True},
    )
    assert wrong_district.status_code == 422
    assert wrong_district.json()["error"]["field"] == "profileCode"

    case_path = f"/api/v1/cases/{outside_receipt.json()['id']}"
    assert town.get(case_path).status_code == 404
    assert town.put(f"{case_path}/screening", json={}).status_code == 404


def test_workflow_rolls_back_if_history_cannot_be_written(clients):
    captures = {}
    run_step(clients, EXAMPLES["commonSteps"][0], captures)
    with closing(connect()) as conn:
        conn.execute(
            """CREATE TRIGGER fail_screening_event BEFORE INSERT ON case_events
               WHEN NEW.action = 'RECORD_SCREENING'
               BEGIN SELECT RAISE(ABORT, 'test event insert failure'); END"""
        )

    town = clients["town"]
    case_path = f"/api/v1/cases/{captures['caseId']}"
    before = town.get(case_path).json()
    body = {"version": 1, "screenedOn": "2026-11-02", "method": "PHONE", "outcome": "NHIS_ASSESSMENT_REQUIRED"}
    with TestClient(app, headers=ORIGIN, raise_server_exceptions=False) as failing_client:
        assert failing_client.post(
            "/api/v1/session", json={"username": EXAMPLES["accounts"]["town"]["username"], "password": PASSWORD}
        ).status_code == 200
        failed = failing_client.put(f"{case_path}/screening", json=body)
    assert failed.status_code == 500
    assert failed.json()["error"]["code"] == "INTERNAL_ERROR"
    assert town.get(case_path).json() == before

    with closing(connect()) as conn:
        conn.execute("DROP TRIGGER fail_screening_event")
    retry = town.put(f"{case_path}/screening", json=body)
    assert retry.status_code == 200, retry.text
    assert retry.json()["version"] == len(retry.json()["events"]) == 2


def test_delivery_updates_preserve_history_and_are_scoped_to_the_case(clients):
    captures = {}
    for step in EXAMPLES["commonSteps"]:
        run_step(clients, step, captures)
    for step in EXAMPLES["scenarios"]["C-06"][:3]:
        run_step(clients, step, captures)

    other = {}
    receive = EXAMPLES["commonSteps"][0]
    run_step(clients, {**receive, "headers": {"Idempotency-Key": "another-case"}}, other)
    item_path = f"plan/items/{captures['itemB']}/delivery"
    district = clients["district"]
    response = district.put(f"/api/v1/cases/{other['caseId']}/{item_path}", json={"version": 1})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"

    response = district.put(f"/api/v1/cases/{captures['caseId']}/{item_path}", json={
        "version": 12, "observedOn": "2026-11-09", "status": "DECLINED", "reason": " 가상 이용 거부 ",
    })
    assert response.status_code == 200, response.text
    saved = response.json()
    delivery = {"observedOn": "2026-11-09", "status": "DECLINED", "reason": "가상 이용 거부"}
    assert saved["version"] == len(saved["events"]) == 13
    assert saved["plan"]["items"][1]["delivery"] == delivery
    assert saved["events"][0]["itemId"] == captures["itemB"]

    with closing(connect()) as conn:
        rows = conn.execute(
            "SELECT details FROM case_events WHERE case_id = ? AND plan_item_id = ? AND action = 'RECORD_DELIVERY' "
            "ORDER BY version",
            (captures["caseId"], captures["itemB"]),
        ).fetchall()
    assert [json.loads(row["details"]) for row in rows] == [
        {"before": None, "after": captures["itemBDelivery"]},
        {"before": captures["itemBDelivery"], "after": delivery},
    ]


def test_workflow_openapi_documents_error_shape_and_dates():
    document = app.openapi()
    routes = [methods["put"] for methods in document["paths"].values() if "put" in methods]
    assert len(routes) == 8
    for route in routes:
        for code in ("401", "403", "404", "409", "415", "422", "500"):
            schema = route["responses"][code]["content"]["application/json"]["schema"]
            error = document["components"]["schemas"][schema["$ref"].rsplit("/", 1)[-1]]
            assert error["required"] == ["error"]

    route = document["paths"]["/api/v1/cases/{case_id}/monitoring"]["put"]
    request = route["requestBody"]["content"]["application/json"]["schema"]
    assert request["properties"]["monitoredOn"]["format"] == "date"
    ref = request["properties"]["observations"]["items"]["$ref"]
    observation = document
    for part in unquote(ref.removeprefix("#/")).split("/"):
        observation = observation[part.replace("~1", "/").replace("~0", "~")]
    assert observation["required"] == ["itemId", "status"]
