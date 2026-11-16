"""가상 계정·프로필 시드. 계정과 관할은 C-01·C-06 예제(docs/design/fixtures/C-01_C-06.json)를 따른다.

비밀번호는 저장소에 두지 않는다. DOLBOMEUM_DEMO_PASSWORD 환경값을 읽어 해시로만 저장한다.
여러 번 실행해도 같은 계정·프로필을 갱신한다.
"""

from __future__ import annotations

import json
import os
import sqlite3

from ..auth import hash_password
from ..config import DEMO_PASSWORD_ENV
from .connection import write_transaction

# (id·계정명, 표시명, 역할, 시군구 코드, 읍면동 코드)
DEMO_ACCOUNTS = (
    ("demo-town-a", "가상 읍면동 담당자 A-1", "TOWN", "DEMO-A", "DEMO-A-1"),
    ("demo-town-a2", "가상 읍면동 담당자 A-2", "TOWN", "DEMO-A", "DEMO-A-2"),
    ("demo-district-a", "가상 시군구 담당자 A", "DISTRICT", "DEMO-A", None),
    ("demo-town-b", "가상 읍면동 담당자 B-1", "TOWN", "DEMO-B", "DEMO-B-1"),
    ("demo-applicant-a", "가상 신청자 A", "APPLICANT", None, None),
    ("demo-applicant-b", "가상 신청자 B", "APPLICANT", None, None),
)

# (코드, 대상자, 대리 신청인, 안내대상, 시군구 코드, 읍면동 코드, 시도, 시군구)
DEMO_PROFILES = (
    ("DEMO-ELDER-01", "가상 대상자 01", "가상 대리 신청인 01", "가상 대리 신청인 01",
     "DEMO-A", "DEMO-A-1", "충청북도", "음성군"),
)

APPLICANT_PROFILES = (
    ("demo-applicant-a", "DEMO-A-1", {
        "name": "가상 신청자 A", "address": "가상 A시 신청로 20", "mobile": "000-0000-0202",
        "demoId": "DEMO-SELF-0101", "birthDate": "1945-05-03",
    }),
    ("demo-applicant-b", "DEMO-B-1", {
        "name": "가상 신청자 B", "address": "가상 B시 신청로 20", "mobile": "000-0000-0203",
        "demoId": "DEMO-SELF-0201", "birthDate": "1946-06-04",
    }),
)


class MissingPasswordError(RuntimeError):
    pass


def demo_password() -> str:
    password = os.environ.get(DEMO_PASSWORD_ENV, "")
    if len(password) < 8:
        raise MissingPasswordError(f"{DEMO_PASSWORD_ENV} 환경값에 8자 이상의 가상 계정 비밀번호를 지정해야 합니다.")
    return password


def seed_demo_data(conn: sqlite3.Connection, password: str | None = None) -> None:
    pw = password if password is not None else demo_password()
    with write_transaction(conn):
        for account_id, display_name, role, district_code, town_code in DEMO_ACCOUNTS:
            conn.execute(
                """INSERT INTO demo_accounts (id, username, display_name, password_hash, role, district_code, town_code)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (id) DO UPDATE SET
                       username = excluded.username, display_name = excluded.display_name,
                       password_hash = excluded.password_hash, role = excluded.role,
                       district_code = excluded.district_code, town_code = excluded.town_code""",
                (account_id, account_id, display_name, hash_password(pw), role, district_code, town_code),
            )
        conn.executemany(
            """INSERT INTO applicant_profiles (account_id, region_code, beneficiary) VALUES (?, ?, ?)
               ON CONFLICT (account_id) DO NOTHING""",
            [(account, region, json.dumps(person, ensure_ascii=False))
             for account, region, person in APPLICANT_PROFILES],
        )
        for row in DEMO_PROFILES:
            conn.execute(
                """INSERT INTO demo_profiles (code, beneficiary_name, applicant_name, notice_recipient_name,
                       district_code, town_code, sido, sigungu)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (code) DO UPDATE SET
                       beneficiary_name = excluded.beneficiary_name, applicant_name = excluded.applicant_name,
                       notice_recipient_name = excluded.notice_recipient_name,
                       district_code = excluded.district_code, town_code = excluded.town_code,
                       sido = excluded.sido, sigungu = excluded.sigungu""",
                row,
            )
