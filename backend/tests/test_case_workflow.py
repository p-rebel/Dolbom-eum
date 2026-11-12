"""설계의 C-01·C-06을 실제 API로 실행하고, 초안 충돌을 두 세션에서 재현한다."""

import json
import re
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack, closing
from pathlib import Path
from threading import Barrier

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
