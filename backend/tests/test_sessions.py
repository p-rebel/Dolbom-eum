"""3번 가상 계정 로그인: D-04 세션·프로필 API, 쿠키, 출처·콘텐츠 형식 검사, 시드."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.auth import hash_password, token_hash, verify_password
from app.config import APP_ORIGINS_ENV, COOKIE_SECURE_ENV, DEMO_PASSWORD_ENV
from app.db import DB_PATH_ENV, connect, init_db
from app.db.seed import DEMO_ACCOUNTS, MissingPasswordError, seed_demo_data
from app.main import app

PASSWORD = "demo-pass-1234"
ORIGIN = "http://127.0.0.1:5173"
JSON_HEADERS = {"Origin": ORIGIN}


@pytest.fixture()
def db_file(tmp_path, monkeypatch):
    path = init_db(tmp_path / "app.sqlite3")
    monkeypatch.setenv(DB_PATH_ENV, str(path))
    monkeypatch.delenv(APP_ORIGINS_ENV, raising=False)
    monkeypatch.delenv(COOKIE_SECURE_ENV, raising=False)
    conn = connect(path)
    seed_demo_data(conn, PASSWORD)
    conn.close()
    return path


@pytest.fixture()
def client(db_file):
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def login(client, username="demo-town-a", password=PASSWORD):
    return client.post("/api/v1/session", json={"username": username, "password": password}, headers=JSON_HEADERS)


# 로그인 ---------------------------------------------------------------------


def test_login_returns_account_and_sets_session_cookie(client, db_file):
    res = login(client)
    assert res.status_code == 200
    assert res.json() == {
        "id": "demo-town-a",
        "displayName": "가상 읍면동 담당자 A-1",
        "role": "TOWN",
        "districtCode": "DEMO-A",
        "townCode": "DEMO-A-1",
    }
    cookie = res.headers["set-cookie"]
    assert cookie.startswith("dolbom_session=")
    for attr in ("HttpOnly", "Max-Age=28800", "Path=/api/v1", "SameSite=strict"):
        assert attr.lower() in cookie.lower()
    assert "secure" not in cookie.lower()

    # DB에는 토큰 원문이 아니라 해시만 저장한다
    token = client.cookies.get("dolbom_session")
    conn = connect(db_file)
    stored = [r[0] for r in conn.execute("SELECT token_hash FROM demo_sessions")]
    conn.close()
    assert stored == [token_hash(token)]


def test_district_account_has_null_town_code(client):
    res = login(client, "demo-district-a")
    assert res.status_code == 200
    assert res.json()["role"] == "DISTRICT"
    assert res.json()["townCode"] is None


@pytest.mark.parametrize("username,password", [("demo-town-a", "wrong-password"), ("no-such-user", PASSWORD)])
def test_login_failure_is_401_without_cookie(client, username, password):
    res = login(client, username, password)
    assert res.status_code == 401
    assert res.json() == {
        "error": {"code": "UNAUTHENTICATED", "message": "계정명 또는 비밀번호가 올바르지 않습니다.", "field": None}
    }
    assert "set-cookie" not in res.headers


def test_login_missing_field_is_422_with_field(client):
    res = client.post("/api/v1/session", json={"username": "demo-town-a"}, headers=JSON_HEADERS)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"
    assert res.json()["error"]["field"] == "password"


def test_login_non_string_password_is_422(client):
    res = client.post("/api/v1/session", json={"username": "demo-town-a", "password": 12345678}, headers=JSON_HEADERS)
    assert res.status_code == 422
    assert res.json()["error"]["field"] == "password"


def test_relogin_issues_new_session_and_revokes_previous(client):
    login(client)
    first = client.cookies.get("dolbom_session")
    login(client)
    second = client.cookies.get("dolbom_session")
    assert first != second
    client.cookies.set("dolbom_session", first, path="/api/v1")
    assert client.get("/api/v1/session").status_code == 401


def test_secure_cookie_when_enabled(client, monkeypatch):
    monkeypatch.setenv(COOKIE_SECURE_ENV, "true")
    res = login(client)
    assert "secure" in res.headers["set-cookie"].lower()


# 세션 조회와 로그아웃 ------------------------------------------------------------


def test_get_session_requires_login(client):
    res = client.get("/api/v1/session")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHENTICATED"


def test_get_session_returns_current_account(client):
    login(client, "demo-district-a")
    res = client.get("/api/v1/session")
    assert res.status_code == 200
    assert res.json()["id"] == "demo-district-a"


def test_expired_session_is_401(client, db_file):
    login(client)
    conn = connect(db_file)
    conn.execute(
        "UPDATE demo_sessions SET created_at = '2000-01-01T00:00:00Z', expires_at = '2000-01-01T08:00:00Z'"
    )
    conn.close()
    assert client.get("/api/v1/session").status_code == 401


def test_logout_deletes_session_and_clears_cookie(client, db_file):
    login(client)
    token = client.cookies.get("dolbom_session")
    res = client.delete("/api/v1/session", headers=JSON_HEADERS)
    assert res.status_code == 204
    assert 'dolbom_session=""' in res.headers["set-cookie"] or "max-age=0" in res.headers["set-cookie"].lower()
    conn = connect(db_file)
    assert conn.execute("SELECT count(*) FROM demo_sessions").fetchone()[0] == 0
    conn.close()
    client.cookies.set("dolbom_session", token, path="/api/v1")
    assert client.get("/api/v1/session").status_code == 401


def test_logout_without_session_is_204(client):
    assert client.delete("/api/v1/session", headers=JSON_HEADERS).status_code == 204


# 출처와 콘텐츠 형식 ------------------------------------------------------------


@pytest.mark.parametrize("headers", [{}, {"Origin": "http://localhost:5173"}, {"Origin": "https://evil.example"}])
def test_state_change_from_other_origin_is_403(client, headers):
    res = client.post("/api/v1/session", json={"username": "demo-town-a", "password": PASSWORD}, headers=headers)
    assert res.status_code == 403
    assert res.json()["error"] == {"code": "FORBIDDEN", "message": "허용되지 않은 출처의 요청입니다.", "field": None}
    assert "set-cookie" not in res.headers


def test_allowed_origins_come_from_env(client, monkeypatch):
    monkeypatch.setenv(APP_ORIGINS_ENV, "https://demo.example, http://127.0.0.1:8000")
    res = client.post(
        "/api/v1/session",
        json={"username": "demo-town-a", "password": PASSWORD},
        headers={"Origin": "https://demo.example"},
    )
    assert res.status_code == 200


def test_read_requests_do_not_need_origin(client):
    assert client.get("/api/v1/health").status_code == 200


def test_non_json_body_is_415(client):
    res = client.post(
        "/api/v1/session",
        content="username=demo-town-a",
        headers={"Origin": ORIGIN, "Content-Type": "application/x-www-form-urlencoded"},
    )
    assert res.status_code == 415
    assert res.json()["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_json_with_charset_is_accepted(client):
    res = client.post(
        "/api/v1/session",
        content='{"username": "demo-town-a", "password": "%s"}' % PASSWORD,
        headers={"Origin": ORIGIN, "Content-Type": "application/json; charset=utf-8"},
    )
    assert res.status_code == 200


# 가상 프로필 -----------------------------------------------------------------


def test_town_sees_only_profiles_in_its_town(client, db_file):
    conn = connect(db_file)
    conn.execute(
        "INSERT INTO demo_profiles VALUES ('DEMO-ELDER-A2', '가상 대상자 A2', '신청인', '안내대상', "
        "'DEMO-A', 'DEMO-A-2', '충청북도', '음성군')"
    )
    conn.close()
    login(client)
    res = client.get("/api/v1/demo-profiles")
    assert res.status_code == 200
    assert res.json() == {
        "items": [
            {
                "code": "DEMO-ELDER-01",
                "beneficiaryName": "가상 대상자 01",
                "applicantName": "가상 대리 신청인 01",
                "noticeRecipientName": "가상 대리 신청인 01",
                "region": {"districtCode": "DEMO-A", "townCode": "DEMO-A-1", "sido": "충청북도", "sigungu": "음성군"},
            }
        ]
    }


def test_other_town_sees_no_profiles(client):
    login(client, "demo-town-b")
    assert client.get("/api/v1/demo-profiles").json() == {"items": []}


def test_district_cannot_list_profiles(client):
    login(client, "demo-district-a")
    res = client.get("/api/v1/demo-profiles")
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"


def test_profiles_require_login(client):
    assert client.get("/api/v1/demo-profiles").status_code == 401


# 공통 오류 형식 ----------------------------------------------------------------


def test_unknown_route_uses_error_format(client):
    res = client.get("/api/v1/no-such-route")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"


# 시드와 비밀번호 ---------------------------------------------------------------


def test_seed_is_repeatable_and_matches_fixture_accounts(db_file):
    conn = connect(db_file)
    seed_demo_data(conn, "another-pass-99")
    rows = conn.execute("SELECT username, role, district_code, town_code, password_hash FROM demo_accounts ORDER BY username").fetchall()
    conn.close()
    assert [r["username"] for r in rows] == sorted(a[0] for a in DEMO_ACCOUNTS)
    by_name = {r["username"]: r for r in rows}
    # 예제(C-01_C-06.json)의 계정 관할
    assert (by_name["demo-town-a"]["district_code"], by_name["demo-town-a"]["town_code"]) == ("DEMO-A", "DEMO-A-1")
    assert (by_name["demo-town-a2"]["district_code"], by_name["demo-town-a2"]["town_code"]) == ("DEMO-A", "DEMO-A-2")
    assert (by_name["demo-district-a"]["role"], by_name["demo-district-a"]["town_code"]) == ("DISTRICT", None)
    assert (by_name["demo-town-b"]["district_code"], by_name["demo-town-b"]["town_code"]) == ("DEMO-B", "DEMO-B-1")
    assert all(verify_password("another-pass-99", r["password_hash"]) for r in rows)
    assert not any("another-pass-99" in r["password_hash"] for r in rows)


def test_seed_requires_password_env(db_file, monkeypatch):
    monkeypatch.delenv(DEMO_PASSWORD_ENV, raising=False)
    conn = connect(db_file)
    with pytest.raises(MissingPasswordError):
        seed_demo_data(conn)
    conn.close()


def test_password_hash_roundtrip():
    stored = hash_password("비밀번호-예시-123")
    assert stored.startswith("scrypt$")
    assert verify_password("비밀번호-예시-123", stored)
    assert not verify_password("다른-비밀번호", stored)
    assert not verify_password("x", "not-a-hash")
