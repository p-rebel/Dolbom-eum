"""DB 관리 명령.

    python -m app.db init             # 스키마 생성 (기존 DB는 유지)
    python -m app.db init --reset     # 지정 경로의 DB를 지우고 새로 생성
    python -m app.db backup <파일>     # 백업 API로 사본 생성

경로는 DOLBOMEUM_DB_PATH 환경값, 없으면 저장소의 var/dolbomeum.sqlite3이다.
backend 폴더에서 실행하거나 --app-dir 대신 PYTHONPATH=backend를 지정한다.
"""

from __future__ import annotations

import argparse

from .connection import backup_db, db_path, init_db


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.db")
    sub = parser.add_subparsers(dest="command", required=True)

    init_cmd = sub.add_parser("init", help="스키마 생성")
    init_cmd.add_argument("--reset", action="store_true", help="기존 DB를 지우고 새로 생성")

    backup_cmd = sub.add_parser("backup", help="DB 백업")
    backup_cmd.add_argument("dest", help="백업 파일 경로")

    args = parser.parse_args()
    if args.command == "init":
        path = init_db(reset=args.reset)
        print(f"초기화 완료: {path}{' (reset)' if args.reset else ''}")
    elif args.command == "backup":
        out = backup_db(args.dest)
        print(f"백업 완료: {db_path()} -> {out}")


if __name__ == "__main__":
    main()
