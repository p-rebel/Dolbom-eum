"""SQLite 연결, 쓰기 트랜잭션, 초기화와 백업 (D-03 무결성과 저장 방식)."""

from __future__ import annotations

import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from importlib import resources
from pathlib import Path

DB_PATH_ENV = "DOLBOMEUM_DB_PATH"
SCHEMA_VERSION = 2
BUSY_TIMEOUT_MS = 5000

# 로컬 개발 기본 경로: 저장소 루트의 var/ (git 제외). 팀 서버는 환경값으로 저장소 밖 경로를 지정한다.
_DEFAULT_DB_PATH = Path(__file__).resolve().parents[3] / "var" / "dolbomeum.sqlite3"

EXPECTED_TABLES = frozenset(
    {
        "demo_accounts",
        "demo_sessions",
        "demo_profiles",
        "mock_applications",
        "nhis_catalog",
        "cases",
        "screenings",
        "assessments",
        "plans",
        "plan_items",
        "service_linkages",
        "service_deliveries",
        "monitorings",
        "case_events",
    }
)


def db_path() -> Path:
    value = os.environ.get(DB_PATH_ENV)
    return Path(value) if value else _DEFAULT_DB_PATH


def connect(path: Path | str | None = None) -> sqlite3.Connection:
    """설정을 마친 연결을 연다.

    - isolation_level=None: Python sqlite3의 암묵적 트랜잭션을 끄고 BEGIN IMMEDIATE를 직접 실행한다.
    - busy_timeout: 동시 쓰기에서 후행 요청이 잠금 오류 대신 대기한 뒤 버전 충돌로 판정되게 한다.
    """
    target = Path(path) if path is not None else db_path()
    conn = sqlite3.connect(
        target,
        isolation_level=None,
        timeout=BUSY_TIMEOUT_MS / 1000,
        check_same_thread=False,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(f"PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}")
    return conn


@contextmanager
def write_transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """사례 생성·상태 변경용 쓰기 트랜잭션. 예외가 나면 관련 기록과 이력을 함께 되돌린다."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def get_connection() -> Iterator[sqlite3.Connection]:
    """FastAPI Depends용. 요청마다 연결을 열고 닫는다."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def _schema_sql() -> str:
    return resources.files(__package__).joinpath("schema.sql").read_text(encoding="utf-8")


def init_db(path: Path | str | None = None, *, reset: bool = False) -> Path:
    """스키마를 만들거나 갱신한다. reset=True면 지정 경로의 DB를 지우고 새로 만든다."""
    target = Path(path) if path is not None else db_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    if reset:
        for suffix in ("", "-wal", "-shm"):
            Path(f"{target}{suffix}").unlink(missing_ok=True)

    conn = connect(target)
    try:
        current = conn.execute("PRAGMA user_version").fetchone()[0]
        if current > SCHEMA_VERSION:
            raise RuntimeError(f"DB 스키마 버전 {current}이 코드의 {SCHEMA_VERSION}보다 높습니다: {target}")
        conn.execute("PRAGMA journal_mode = WAL")
        migration = ""
        if current == 1:
            # 참조하는 행을 유지하면서 계정 테이블의 역할 제약을 교체한다.
            conn.execute("PRAGMA foreign_keys = OFF")
            migration = resources.files(__package__).joinpath("migrate_v1.sql").read_text(encoding="utf-8") + "\n"
        conn.executescript("BEGIN IMMEDIATE;\n" + migration + _schema_sql())
        if migration and conn.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise RuntimeError("계정 마이그레이션 중 기존 DB 참조를 보존하지 못했습니다.")
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        conn.execute("COMMIT")
    finally:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        conn.close()
    return target


def backup_db(dest: Path | str, source: Path | str | None = None) -> Path:
    """실행 중에도 일관된 사본을 만든다. WAL 모드에서 파일만 복사하면 -wal의 변경이 빠진다."""
    dest_path = Path(dest)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    src = connect(source)
    try:
        out = sqlite3.connect(dest_path)
        try:
            src.backup(out)
        finally:
            out.close()
    finally:
        src.close()
    return dest_path
