"""공단 v1.4 정제 CSV를 nhis_catalog에 적재한다 (D-03 공단 자료 적재와 검색, 작업 7).

적재 전 필수 헤더·행 수·ID 고유성을 확인하고, 적재 후 DB 행 수를 다시 센다.
여러 번 실행해도 같은 버전의 행을 갱신한다. 계획 항목이 참조 중인 행은 지우지 않는다.
"""

from __future__ import annotations

import csv
import sqlite3
from pathlib import Path

from .connection import write_transaction

DATASET_VERSION = "v1.4"
EXPECTED_ROWS = 90_081  # 621f082 data/processed/nhis_services.csv
DEFAULT_CSV = Path(__file__).resolve().parents[3] / "data" / "processed" / "nhis_services.csv"

COLUMNS = (
    "nhis_service_id", "source_row_number", "source_name", "reference_date", "source_url",
    "sido_raw", "sigungu_raw", "sido", "sigungu", "sigungu_gu", "sido_current", "sido_legacy",
    "region_std_status", "region_std_note", "region_std_basis",
    "provider_name", "provider_phone", "phone_format", "provider_address", "address_sido_check",
    "category_large", "category_middle", "program_name", "duplicate_group_id", "is_duplicate_extra",
)


class CatalogLoadError(RuntimeError):
    pass


def read_nhis_csv(path: Path | str = DEFAULT_CSV, expected_rows: int = EXPECTED_ROWS) -> list[tuple]:
    """CSV를 검사하고 INSERT용 튜플 목록으로 바꾼다. 빈 값은 None, 전화번호는 문자열 그대로."""
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = set(COLUMNS) - set(reader.fieldnames or ())
        if missing:
            raise CatalogLoadError(f"필수 헤더 누락: {', '.join(sorted(missing))}")
        rows = [tuple(r[c] if r[c] != "" else None for c in COLUMNS) for r in reader]
    if len(rows) != expected_rows:
        raise CatalogLoadError(f"행 수 {len(rows):,}이 기대값 {expected_rows:,}과 다릅니다: {path}")
    ids = {r[0] for r in rows}
    if None in ids or len(ids) != len(rows):
        raise CatalogLoadError(f"nhis_service_id가 비었거나 중복입니다 (고유 {len(ids - {None}):,}개 / {len(rows):,}행)")
    # source_row_number는 STRICT INTEGER 컬럼이라 정수로 바꾼다
    return [(r[0], int(r[1]), *r[2:]) for r in rows]


def load_nhis_catalog(
    conn: sqlite3.Connection, path: Path | str = DEFAULT_CSV, expected_rows: int = EXPECTED_ROWS
) -> dict[str, int]:
    rows = read_nhis_csv(path, expected_rows)
    cols = ", ".join(("dataset_version", *COLUMNS))
    marks = ", ".join("?" * (len(COLUMNS) + 1))
    updates = ", ".join(f"{c} = excluded.{c}" for c in COLUMNS[1:])
    with write_transaction(conn):
        conn.executemany(
            f"INSERT INTO nhis_catalog ({cols}) VALUES ({marks}) "
            f"ON CONFLICT (dataset_version, nhis_service_id) DO UPDATE SET {updates}",
            [(DATASET_VERSION, *r) for r in rows],
        )
        counts = conn.execute(
            """SELECT count(*), count(DISTINCT nhis_service_id),
                      coalesce(sum(is_duplicate_extra = 'N'), 0), coalesce(sum(is_duplicate_extra = 'Y'), 0)
               FROM nhis_catalog WHERE dataset_version = ?""",
            (DATASET_VERSION,),
        ).fetchone()
        summary = {"csvRows": len(rows), "dbRows": counts[0], "uniqueIds": counts[1], "visible": counts[2], "hidden": counts[3]}
        if summary["dbRows"] != len(rows):
            raise CatalogLoadError(f"적재 후 DB 행 수가 다릅니다: {summary}")  # 트랜잭션 롤백
    return summary
