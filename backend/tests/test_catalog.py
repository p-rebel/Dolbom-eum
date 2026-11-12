"""7번 공단 v1.4 적재와 8번 검색 API: 행 수·ID 검증, C-01 공통 단계 공단 조회, 필터·페이지·검증."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import APP_ORIGINS_ENV
from app.db import DB_PATH_ENV, connect, init_db
from app.db.nhis import COLUMNS, CatalogLoadError, load_nhis_catalog, read_nhis_csv
from app.db.seed import seed_demo_data
from app.main import app

PASSWORD = "demo-pass-1234"
HEADERS = {"Origin": "http://127.0.0.1:5173"}
FIXTURE = Path(__file__).resolve().parents[2] / "docs" / "design" / "fixtures" / "C-01_C-06.json"
SERVICES = "/api/v1/catalog/nhis-services"


@pytest.fixture(scope="module")
def loaded_db(tmp_path_factory):
    """조회 테스트는 읽기만 하므로 실제 CSV를 모듈당 한 번 적재한다."""
    path = init_db(tmp_path_factory.mktemp("catalog") / "app.sqlite3")
    conn = connect(path)
    seed_demo_data(conn, PASSWORD)
    summary = load_nhis_catalog(conn)
    conn.close()
    return path, summary


@pytest.fixture()
def client(loaded_db, monkeypatch):
    monkeypatch.setenv(DB_PATH_ENV, str(loaded_db[0]))
    monkeypatch.delenv(APP_ORIGINS_ENV, raising=False)
    with TestClient(app, raise_server_exceptions=False) as c:
        assert c.post(
            "/api/v1/session", json={"username": "demo-town-a", "password": PASSWORD}, headers=HEADERS
        ).status_code == 200
        yield c


def matches(expected, actual) -> bool:
    """C-01 예제 비교 규칙: 객체는 명시한 키만, 배열은 길이와 순서까지 비교한다."""
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(k in actual and matches(v, actual[k]) for k, v in expected.items())
    if isinstance(expected, list):
        return isinstance(actual, list) and len(expected) == len(actual) and all(map(matches, expected, actual))
    return expected == actual


# --- 7번 적재 ---------------------------------------------------------------


def test_load_counts_match_expected_results(loaded_db):
    # expected-results: CSV 90,081행·고유 ID 90,081개, 조회 대상 N 89,738행, 숨김 Y 343행
    assert loaded_db[1] == {"csvRows": 90081, "dbRows": 90081, "uniqueIds": 90081, "visible": 89738, "hidden": 343}


def test_reload_is_idempotent_and_keeps_referenced_rows(tmp_path):
    path = init_db(tmp_path / "reload.sqlite3")
    conn = connect(path)
    first = load_nhis_catalog(conn)
    # 계획 항목이 참조하는 행이 있어도 재적재가 FK 오류 없이 갱신만 한다
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute(
        "INSERT INTO plan_items (id, case_id, position, dataset_version, nhis_service_id, catalog_snapshot) "
        "VALUES ('item-1', 'case-x', 1, 'v1.4', 'nhis_20260630_r00001', '{}')"
    )
    conn.execute("PRAGMA foreign_keys = ON")
    assert load_nhis_catalog(conn) == first
    row = conn.execute(
        "SELECT source_row_number, provider_phone FROM nhis_catalog WHERE nhis_service_id = 'nhis_20260630_r00015'"
    ).fetchone()
    assert row["source_row_number"] == 15 and row["provider_phone"] is None
    conn.close()


def _write_csv(path: Path, rows: list[dict], columns=COLUMNS) -> Path:
    lines = [",".join(columns)] + [",".join(r.get(c, "") for c in columns) for r in rows]
    path.write_text("﻿" + "\n".join(lines) + "\n", encoding="utf-8")
    return path


def _row(n: int) -> dict:
    return {
        "nhis_service_id": f"nhis_test_r{n:05d}", "source_row_number": str(n), "source_name": "출처",
        "reference_date": "2026-06-30", "source_url": "https://example.test", "is_duplicate_extra": "N",
    }


def test_csv_checks_reject_bad_input(tmp_path):
    with pytest.raises(CatalogLoadError, match="필수 헤더"):
        read_nhis_csv(_write_csv(tmp_path / "h.csv", [_row(1)], COLUMNS[:-1]), expected_rows=1)
    with pytest.raises(CatalogLoadError, match="행 수"):
        read_nhis_csv(_write_csv(tmp_path / "n.csv", [_row(1)]))
    with pytest.raises(CatalogLoadError, match="중복"):
        read_nhis_csv(_write_csv(tmp_path / "d.csv", [_row(1), _row(1)]), expected_rows=2)
    rows = read_nhis_csv(_write_csv(tmp_path / "ok.csv", [_row(1)]), expected_rows=1)
    assert rows[0][1] == 1 and rows[0][COLUMNS.index("provider_phone")] is None


# --- 8번 검색 API: C-01 공통 단계의 공단 조회 --------------------------------


def _catalog_steps():
    steps = json.loads(FIXTURE.read_text(encoding="utf-8"))["commonSteps"]
    return [s for s in steps if s["path"].startswith("/catalog/")]


@pytest.mark.parametrize("step", _catalog_steps(), ids=lambda s: s["path"] + json.dumps(s.get("query", {}), ensure_ascii=False))
def test_fixture_catalog_steps(client, step):
    res = client.get(f"/api/v1{step['path']}", params=step.get("query"))
    assert res.status_code == step["expect"]["http"], res.text
    if "body" in step["expect"]:
        assert matches(step["expect"]["body"], res.json()), res.text
    if "errorCode" in step["expect"]:
        error = res.json()["error"]
        assert error["code"] == step["expect"]["errorCode"] and error["field"] is None


def test_fixture_has_all_catalog_steps():
    assert len(_catalog_steps()) == 6


def test_item_has_all_d04_keys(client):
    item = client.get(f"{SERVICES}/nhis_20260630_r00001").json()
    assert set(item) == {
        "id", "datasetVersion", "programName", "providerName", "providerAddress", "providerPhone",
        "categoryLarge", "categoryMiddle", "sido", "sigungu", "sigunguGu", "sourceName", "sourceUrl", "referenceDate",
    }
    assert item["sigunguGu"] is None and item["datasetVersion"] == "v1.4"


def test_sejong_standard_sigungu(client):
    item = client.get(f"{SERVICES}/nhis_20260630_r00016").json()
    assert item["sido"] == item["sigungu"] == "세종특별자치시"
    # 원본 시군구가 공란이어도 표준 시군구로 조회된다 (ID 오름차순이라 첫 페이지에 있음)
    res = client.get(SERVICES, params={"sido": "세종특별자치시", "sigungu": "세종특별자치시", "pageSize": 50}).json()
    assert "nhis_20260630_r00016" in {i["id"] for i in res["items"]}


def test_sido_matches_legacy_alias(client):
    # 원본 '전남광주통합특별시' 행은 이전 표기 '전라남도'로도 조회된다
    legacy = client.get(SERVICES, params={"sido": "전라남도", "pageSize": 1}).json()
    assert legacy["total"] > 0
    assert client.get(f"{SERVICES}/nhis_20260630_r00002").json()["sido"] == "전남광주통합특별시"
    ids = {i["id"] for i in client.get(SERVICES, params={"sido": "전라남도", "sigungu": "장흥군", "pageSize": 50}).json()["items"]}
    assert "nhis_20260630_r00002" in ids


def test_duplicate_extra_rows_are_hidden_from_search(client):
    total = client.get(SERVICES, params={"pageSize": 1}).json()["total"]
    assert total == 89738


def test_results_sorted_by_id_and_paged(client):
    query = {"sido": "충청북도", "sigungu": "음성군", "categoryLarge": "보건의료"}
    first = client.get(SERVICES, params={**query, "pageSize": 50}).json()
    ids = [i["id"] for i in first["items"]]
    assert first["total"] == 32 and ids == sorted(ids) and ids[1] == "nhis_20260630_r52406"
    after = client.get(SERVICES, params={**query, "page": 2, "pageSize": 50}).json()
    assert after == {"items": [], "page": 2, "pageSize": 50, "total": 32}


def test_query_text_is_trimmed_and_blank_ignored(client):
    base = {"sido": "충청북도", "sigungu": "음성군"}
    total = client.get(SERVICES, params=base).json()["total"]
    assert client.get(SERVICES, params={**base, "q": "   "}).json()["total"] == total
    assert client.get(SERVICES, params={**base, "q": "  다제약물  "}).json()["total"] == 1
    assert client.get(SERVICES, params={**base, "q": "%"}).json()["total"] == 0  # 와일드카드가 아님
    # 기관명으로도 찾는다
    assert client.get(SERVICES, params={**base, "q": "국민건강보험공단"}).json()["total"] >= 1


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"q": "가" * 101}, "q"),
        ({"pageSize": 0}, "pageSize"),
        ({"pageSize": 51}, "pageSize"),
        ({"pageSize": "x"}, "pageSize"),
        ({"page": 0}, "page"),
    ],
)
def test_invalid_query_returns_422(client, params, field):
    res = client.get(SERVICES, params=params)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR" and res.json()["error"]["field"] == field


def test_q_of_exactly_100_chars_after_trim_is_allowed(client):
    assert client.get(SERVICES, params={"q": f"  {'가' * 100}  "}).status_code == 200


def test_huge_page_returns_empty_not_500(client):
    res = client.get(SERVICES, params={"page": 10**19})
    assert res.status_code == 200 and res.json()["items"] == []


def test_filters_without_sido(client):
    body = client.get("/api/v1/catalog/nhis-filters").json()
    assert body["sigungus"] == []
    assert body["sidos"] == sorted(body["sidos"]) and len(body["sidos"]) == len(set(body["sidos"]))
    assert "충청북도" in body["sidos"] and "" not in body["sidos"]
    assert len(body["categoriesLarge"]) == 6


def test_missing_item_is_404(client):
    res = client.get(f"{SERVICES}/nhis_없는_행")
    assert res.status_code == 404 and res.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.parametrize("path", [SERVICES, f"{SERVICES}/nhis_20260630_r00001", "/api/v1/catalog/nhis-filters"])
def test_requires_session(loaded_db, monkeypatch, path):
    monkeypatch.setenv(DB_PATH_ENV, str(loaded_db[0]))
    with TestClient(app, raise_server_exceptions=False) as c:
        res = c.get(path)
    assert res.status_code == 401 and res.json()["error"]["code"] == "UNAUTHENTICATED"
