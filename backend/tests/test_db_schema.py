"""2번 DB 스키마: D-03 테이블·제약, 쓰기 트랜잭션, 동시 저장, 백업을 확인한다."""

from __future__ import annotations

import json
import sqlite3
import threading
import time

import pytest

from app.db import EXPECTED_TABLES, SCHEMA_VERSION, backup_db, connect, init_db, write_transaction

NOW = "2026-11-11T00:00:00Z"
CATALOG_ID = "nhis_20260630_r00001"


@pytest.fixture()
def db_file(tmp_path):
    return init_db(tmp_path / "test.sqlite3")


@pytest.fixture()
def conn(db_file):
    c = connect(db_file)
    _seed(c)
    yield c
    c.close()


def _seed(c: sqlite3.Connection) -> None:
    c.executemany(
        "INSERT INTO demo_accounts VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            ("acc-town", "demo-town-a", "읍면동 담당자 A", "hash", "TOWN", "DEMO-A", "DEMO-A-1"),
            ("acc-district", "demo-district-a", "시군구 담당자 A", "hash", "DISTRICT", "DEMO-A", None),
        ],
    )
    c.execute(
        "INSERT INTO demo_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("DEMO-ELDER-01", "가상 대상자 01", "가상 대리 신청인 01", "가상 대리 신청인 01",
         "DEMO-A", "DEMO-A-1", "충청북도", "음성군"),
    )
    c.execute(
        """INSERT INTO nhis_catalog (dataset_version, nhis_service_id, source_row_number, source_name,
               source_url, reference_date, sido, sigungu, provider_name, category_large, program_name,
               is_duplicate_extra)
           VALUES ('v1.4', ?, 1, '국민건강보험공단_통합돌봄 서비스 자원',
               'https://www.data.go.kr/data/15173720/fileData.do', '2026-06-30', '충청북도', '음성군',
               '국민건강보험공단', '건강관리예방', '다제약물 관리사업', 'N')""",
        (CATALOG_ID,),
    )


def _insert_case(c, case_id="case-1", seq=1, key="demo-receive-01", **overrides):
    row = {
        "id": case_id,
        "receipt_seq": seq,
        "receipt_number": f"DEMO-{seq:04d}",
        "profile_code": "DEMO-ELDER-01",
        "profile_snapshot": json.dumps({"code": "DEMO-ELDER-01"}),
        "district_code": "DEMO-A",
        "town_code": "DEMO-A-1",
        "created_by": "acc-town",
        "idempotency_key": key,
        "request_hash": "h",
        "received_on": "2026-11-01",
        "notice_method": "SMS",
        "evidence_checked": 1,
        "status": "RECEIVED",
        "version": 1,
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    cols = ", ".join(row)
    marks = ", ".join("?" for _ in row)
    c.execute(f"INSERT INTO cases ({cols}) VALUES ({marks})", tuple(row.values()))


def _event(c, case_id, version, action, from_status, to_status, item_id=None, actor="acc-town", role="TOWN"):
    c.execute(
        """INSERT INTO case_events (id, case_id, action, from_status, to_status, actor_account_id,
               actor_display_name, actor_role, recorded_at, version, summary, plan_item_id)
           VALUES (?, ?, ?, ?, ?, ?, '담당자', ?, ?, ?, '요약', ?)""",
        (f"ev-{case_id}-{version}", case_id, action, from_status, to_status, actor, role, NOW, version, item_id),
    )


# 초기화 --------------------------------------------------------------------


def test_init_creates_all_tables_and_is_repeatable(db_file):
    init_db(db_file)  # 두 번 실행해도 기존 DB를 유지한다
    c = connect(db_file)
    tables = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert tables == EXPECTED_TABLES
    assert c.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION
    assert c.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert c.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    c.close()


def test_reset_removes_existing_data(db_file):
    c = connect(db_file)
    _seed(c)
    c.close()
    init_db(db_file, reset=True)
    c = connect(db_file)
    assert c.execute("SELECT count(*) FROM demo_accounts").fetchone()[0] == 0
    c.close()


def test_newer_schema_version_is_rejected(db_file):
    c = connect(db_file)
    c.execute(f"PRAGMA user_version = {SCHEMA_VERSION + 1}")
    c.close()
    with pytest.raises(RuntimeError):
        init_db(db_file)


# 제약 ----------------------------------------------------------------------


def test_foreign_keys_are_enforced(conn):
    with pytest.raises(sqlite3.IntegrityError):
        _insert_case(conn, profile_code="NO-SUCH-PROFILE")


def test_account_role_and_town_code_must_match(conn):
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO demo_accounts VALUES ('x', 'x', 'x', 'h', 'DISTRICT', 'DEMO-A', 'DEMO-A-1')"
        )


@pytest.mark.parametrize(
    "overrides",
    [
        {"evidence_checked": 0},
        {"notice_method": "EMAIL"},
        {"received_on": "2026-13-01"},
        {"received_on": "2026/11/01"},
        {"status": "CLOSED"},
        {"version": 0},
        {"profile_snapshot": "not json"},
    ],
)
def test_case_column_checks(conn, overrides):
    with pytest.raises(sqlite3.IntegrityError):
        _insert_case(conn, **overrides)


def test_idempotency_key_is_unique_per_account(conn):
    _insert_case(conn)
    with pytest.raises(sqlite3.IntegrityError):
        _insert_case(conn, case_id="case-2", seq=2)
    # 다른 계정은 같은 키를 쓸 수 있다
    _insert_case(conn, case_id="case-3", seq=3, created_by="acc-district")


def test_event_version_is_unique_per_case(conn):
    _insert_case(conn)
    _event(conn, "case-1", 1, "RECEIVE", None, "RECEIVED")
    with pytest.raises(sqlite3.IntegrityError):
        _event(conn, "case-1", 1, "RECORD_SCREENING", "RECEIVED", "SCREENED")


def test_delivery_reason_required_for_not_started(conn):
    _build_through_linkage(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO service_deliveries VALUES ('item-a', '2026-11-08', 'NOT_STARTED', NULL)")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO service_deliveries VALUES ('item-a', '2026-11-08', 'DECLINED', '   ')")
    conn.execute("INSERT INTO service_deliveries VALUES ('item-a', '2026-11-08', 'UNKNOWN', NULL)")


def test_linkage_destination_rules(conn):
    _build_through_draft(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO service_linkages VALUES ('item-a', '2026-11-06', 'DEPARTMENT_REFERRAL', NULL)")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO service_linkages VALUES ('item-a', '2026-11-06', 'PERSON_GUIDANCE', '보건소')")


def test_delivery_requires_linkage(conn):
    _build_through_draft(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO service_deliveries VALUES ('item-a', '2026-11-08', 'IN_USE', NULL)")


def test_monitoring_review_reason_required(conn):
    _insert_case(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO monitorings (case_id, monitored_on, method, condition, review_needed, review_reason, observations) VALUES ('case-1', '2026-11-09', 'VISIT', 'UNCHANGED', 1, '  ', '[]')"
        )
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO monitorings (case_id, monitored_on, method, condition, review_needed, review_reason, observations) VALUES ('case-1', '2026-11-09', 'VISIT', 'UNCHANGED', 1, NULL, '[]')"
        )
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO monitorings (case_id, monitored_on, method, condition, review_needed, review_reason, observations) VALUES ('case-1', '2026-11-09', 'VISIT', 'UNCHANGED', 0, NULL, '{}')"
        )


def test_plan_item_must_reference_catalog_and_be_unique(conn):
    _build_through_draft(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO plan_items VALUES ('item-x', 'case-1', 2, 'v1.4', 'nhis_missing', '{}')"
        )
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO plan_items VALUES ('item-y', 'case-1', 2, 'v1.4', ?, '{}')", (CATALOG_ID,)
        )


def test_notice_requires_confirmation(conn):
    _build_through_draft(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE plans SET announced_on = '2026-11-05' WHERE case_id = 'case-1'")


# C-01 버전 1→4 -------------------------------------------------------------


def _build_through_draft(c):
    with write_transaction(c):
        _insert_case(c)
        _event(c, "case-1", 1, "RECEIVE", None, "RECEIVED")
    with write_transaction(c):
        c.execute("INSERT INTO screenings VALUES ('case-1', '2026-11-02', 'PHONE', 'NHIS_ASSESSMENT_REQUIRED')")
        c.execute("UPDATE cases SET status = 'SCREENED', version = 2 WHERE id = 'case-1' AND version = 1")
        _event(c, "case-1", 2, "RECORD_SCREENING", "RECEIVED", "SCREENED")
    with write_transaction(c):
        c.execute("INSERT INTO assessments (case_id, assessed_on, result_received_on, outcome) VALUES ('case-1', '2026-11-03', '2026-11-03', 'SUPPORT_PLAN_REQUIRED')")
        c.execute("UPDATE cases SET status = 'ASSESSED', version = 3 WHERE id = 'case-1' AND version = 2")
        _event(c, "case-1", 3, "RECORD_ASSESSMENT", "SCREENED", "ASSESSED", actor="acc-district", role="DISTRICT")
    with write_transaction(c):
        c.execute(
            "INSERT INTO plans (case_id, prepared_on, goal) VALUES "
            "('case-1', '2026-11-04', '가상 사례의 약 복용과 일상생활 지원을 확인한다.')"
        )
        c.execute(
            "INSERT INTO plan_items VALUES ('item-a', 'case-1', 1, 'v1.4', ?, ?)",
            (CATALOG_ID, json.dumps({"id": CATALOG_ID, "datasetVersion": "v1.4"})),
        )
        c.execute("UPDATE cases SET status = 'PLAN_DRAFTED', version = 4 WHERE id = 'case-1' AND version = 3")
        _event(c, "case-1", 4, "SAVE_DRAFT", "ASSESSED", "PLAN_DRAFTED")


def _build_through_linkage(c):
    _build_through_draft(c)
    c.execute(
        "UPDATE plans SET meeting_on = '2026-11-05', meeting_outcome = 'APPROVED', "
        "confirmed_by = 'acc-district', announced_on = '2026-11-05' WHERE case_id = 'case-1'"
    )
    c.execute("INSERT INTO service_linkages VALUES ('item-a', '2026-11-06', 'PROVIDER_REFERRAL', NULL)")


def test_c01_version_1_to_4_is_stored(conn):
    _build_through_draft(conn)
    case = conn.execute("SELECT status, version FROM cases WHERE id = 'case-1'").fetchone()
    assert (case["status"], case["version"]) == ("PLAN_DRAFTED", 4)
    versions = [r[0] for r in conn.execute("SELECT version FROM case_events WHERE case_id = 'case-1' ORDER BY version DESC")]
    assert versions == [4, 3, 2, 1]
    item = conn.execute("SELECT nhis_service_id, catalog_snapshot FROM plan_items WHERE case_id = 'case-1'").fetchone()
    assert item["nhis_service_id"] == CATALOG_ID
    assert json.loads(item["catalog_snapshot"])["datasetVersion"] == "v1.4"


# 트랜잭션 ------------------------------------------------------------------


def test_write_transaction_rolls_back_record_and_event_together(conn):
    with write_transaction(conn):
        _insert_case(conn)
        _event(conn, "case-1", 1, "RECEIVE", None, "RECEIVED")
    with pytest.raises(sqlite3.IntegrityError):
        with write_transaction(conn):
            conn.execute("INSERT INTO screenings VALUES ('case-1', '2026-11-02', 'PHONE', 'NHIS_ASSESSMENT_REQUIRED')")
            conn.execute("UPDATE cases SET status = 'SCREENED', version = 2 WHERE id = 'case-1'")
            _event(conn, "case-1", 1, "RECORD_SCREENING", "RECEIVED", "SCREENED")  # 버전 중복으로 실패
    assert conn.execute("SELECT version FROM cases WHERE id = 'case-1'").fetchone()[0] == 1
    assert conn.execute("SELECT count(*) FROM screenings").fetchone()[0] == 0


def test_concurrent_writers_wait_and_see_new_version(db_file, conn):
    """AC-03: 같은 버전의 두 저장에서 후행 요청은 잠금 오류 없이 대기하고, 올라간 버전을 읽어 충돌로 판정된다."""
    _insert_case(conn, version=3, status="ASSESSED")
    first_has_lock = threading.Event()
    results: dict[str, object] = {}

    def first():
        c = connect(db_file)
        with write_transaction(c):
            first_has_lock.set()
            time.sleep(0.5)
            results["first_rows"] = c.execute(
                "UPDATE cases SET version = 4 WHERE id = 'case-1' AND version = 3"
            ).rowcount
        c.close()

    def second():
        first_has_lock.wait()
        c = connect(db_file)
        try:
            with write_transaction(c):
                results["second_rows"] = c.execute(
                    "UPDATE cases SET version = 4 WHERE id = 'case-1' AND version = 3"
                ).rowcount
        except sqlite3.OperationalError as exc:  # pragma: no cover - 실패 시 원인 표시
            results["second_error"] = str(exc)
        c.close()

    threads = [threading.Thread(target=first), threading.Thread(target=second)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert "second_error" not in results
    assert results == {"first_rows": 1, "second_rows": 0}


# 백업 ----------------------------------------------------------------------


def test_backup_includes_uncheckpointed_wal_changes(db_file, conn, tmp_path):
    _insert_case(conn)  # 연결이 열린 상태라 변경이 -wal 파일에 남아 있다
    out = backup_db(tmp_path / "backup.sqlite3", db_file)
    b = sqlite3.connect(out)
    assert b.execute("SELECT receipt_number FROM cases").fetchall() == [("DEMO-0001",)]
    b.close()
