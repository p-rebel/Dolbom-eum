"""DB 관리 명령.

    python -m app.db init             # 스키마 생성 (기존 DB는 유지)
    python -m app.db init --reset     # 지정 경로의 DB를 지우고 새로 생성
    python -m app.db seed             # 가상 계정·프로필 생성·갱신 (DOLBOMEUM_DEMO_PASSWORD 필요)
    python -m app.db load-nhis [CSV]  # 공단 v1.4 CSV 적재 (기본 data/processed/nhis_services.csv)
    python -m app.db backup <파일>     # 백업 API로 사본 생성

경로는 DOLBOMEUM_DB_PATH 환경값, 없으면 저장소의 var/dolbomeum.sqlite3이다.
backend 폴더에서 실행하거나 PYTHONPATH=backend를 지정한다.
"""

from __future__ import annotations

import argparse
import sys

from .connection import backup_db, connect, db_path, init_db


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.db")
    sub = parser.add_subparsers(dest="command", required=True)

    init_cmd = sub.add_parser("init", help="스키마 생성")
    init_cmd.add_argument("--reset", action="store_true", help="기존 DB를 지우고 새로 생성")

    sub.add_parser("seed", help="가상 계정·프로필 생성")

    nhis_cmd = sub.add_parser("load-nhis", help="공단 v1.4 CSV 적재")
    nhis_cmd.add_argument("csv", nargs="?", help="CSV 경로 (기본 data/processed/nhis_services.csv)")

    backup_cmd = sub.add_parser("backup", help="DB 백업")
    backup_cmd.add_argument("dest", help="백업 파일 경로")

    args = parser.parse_args()
    if args.command == "init":
        path = init_db(reset=args.reset)
        print(f"초기화 완료: {path}{' (reset)' if args.reset else ''}")
    elif args.command == "seed":
        from .seed import DEMO_ACCOUNTS, MissingPasswordError, seed_demo_data

        conn = connect()
        try:
            seed_demo_data(conn)
        except MissingPasswordError as exc:
            sys.exit(str(exc))
        finally:
            conn.close()
        print(f"시드 완료: 계정 {len(DEMO_ACCOUNTS)}개 → {db_path()}")
    elif args.command == "load-nhis":
        from .nhis import DATASET_VERSION, DEFAULT_CSV, CatalogLoadError, load_nhis_catalog

        source = args.csv or DEFAULT_CSV
        conn = connect()
        try:
            s = load_nhis_catalog(conn, source)
        except (CatalogLoadError, FileNotFoundError) as exc:
            sys.exit(f"적재 실패: {exc}")
        finally:
            conn.close()
        print(
            f"공단 {DATASET_VERSION} 적재 완료: {source} → {db_path()}\n"
            f"  CSV {s['csvRows']:,}행, DB {s['dbRows']:,}행, 고유 ID {s['uniqueIds']:,}개, "
            f"조회 대상(N) {s['visible']:,}행, 숨김(Y) {s['hidden']:,}행"
        )
    elif args.command == "backup":
        out = backup_db(args.dest)
        print(f"백업 완료: {db_path()} -> {out}")


if __name__ == "__main__":
    main()
