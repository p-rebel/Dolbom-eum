"""가상 신청자 가입, 세션과 접근 권한."""

from __future__ import annotations

import sqlite3
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Request, Response
from pydantic import ConfigDict, StrictStr, StringConstraints

from ..auth import Account, CamelModel, authenticate, current_account, end_session, hash_password, require_role, start_session
from ..config import SESSION_COOKIE, SESSION_COOKIE_PATH, SESSION_TTL, cookie_secure
from ..db import get_connection, write_transaction
from ..db.seed import DEMO_ACCOUNTS
from ..errors import ApiError

router = APIRouter()
_SEEDED_USERNAMES = frozenset(account[0] for account in DEMO_ACCOUNTS)


class SignupRequest(CamelModel):
    model_config = ConfigDict(extra="forbid")

    username: Annotated[
        str, StringConstraints(strict=True, strip_whitespace=True, pattern=r"^[A-Za-z0-9_.-]{3,40}$")
    ]
    display_name: Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=60)]
    password: Annotated[str, StringConstraints(strict=True, min_length=8, max_length=128)]


class LoginRequest(CamelModel):
    username: StrictStr
    password: StrictStr
    audience: Literal["applicant", "staff"] | None = None


class Region(CamelModel):
    district_code: str
    town_code: str
    sido: str
    sigungu: str


class DemoProfile(CamelModel):
    code: str
    beneficiary_name: str
    applicant_name: str
    notice_recipient_name: str
    region: Region


class DemoProfileList(CamelModel):
    items: list[DemoProfile]


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        path=SESSION_COOKIE_PATH,
        httponly=True,
        samesite="strict",
        secure=cookie_secure(),
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        path=SESSION_COOKIE_PATH,
        httponly=True,
        samesite="strict",
        secure=cookie_secure(),
    )


@router.post("/signup", status_code=201, response_model=Account)
def signup(body: SignupRequest, conn: sqlite3.Connection = Depends(get_connection)) -> Account:
    duplicate_username = ApiError(409, "USERNAME_TAKEN", "이미 사용 중인 계정명입니다.", "username")
    if body.username in _SEEDED_USERNAMES:
        raise duplicate_username

    account = Account(
        id=str(uuid4()), display_name=body.display_name, role="APPLICANT", district_code=None, town_code=None
    )
    password_hash = hash_password(body.password)
    with write_transaction(conn):
        result = conn.execute(
            """INSERT INTO demo_accounts (id, username, display_name, password_hash, role, district_code, town_code)
               VALUES (?, ?, ?, ?, ?, NULL, NULL)
               ON CONFLICT (username) DO NOTHING""",
            (account.id, body.username, account.display_name, password_hash, account.role),
        )
        if result.rowcount == 0:
            raise duplicate_username
    return account


@router.post("/session", response_model=Account)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    conn: sqlite3.Connection = Depends(get_connection),
) -> Account:
    account = authenticate(conn, body.username, body.password)
    if account is None:
        raise ApiError(401, "UNAUTHENTICATED", "계정명 또는 비밀번호가 올바르지 않습니다.")
    if body.audience is not None and (account.role == "APPLICANT") != (body.audience == "applicant"):
        raise ApiError(403, "FORBIDDEN", "이 계정의 역할에 맞는 로그인 화면을 이용해 주세요.")
    token = start_session(conn, account.id, request.cookies.get(SESSION_COOKIE))
    _set_session_cookie(response, token)
    return account


@router.get("/session", response_model=Account)
def read_session(account: Account = Depends(current_account)) -> Account:
    return account


@router.delete("/session", status_code=204)
def logout(request: Request, conn: sqlite3.Connection = Depends(get_connection)) -> Response:
    """세션이 없거나 이미 만료됐어도 204로 응답해 로그아웃을 반복할 수 있게 한다."""
    end_session(conn, request.cookies.get(SESSION_COOKIE))
    response = Response(status_code=204)
    _clear_session_cookie(response)
    return response


@router.get("/demo-profiles", response_model=DemoProfileList)
def list_demo_profiles(
    account: Account = Depends(require_role("TOWN")),
    conn: sqlite3.Connection = Depends(get_connection),
) -> DemoProfileList:
    rows = conn.execute(
        "SELECT * FROM demo_profiles WHERE district_code = ? AND town_code = ? ORDER BY code",
        (account.district_code, account.town_code),
    ).fetchall()
    return DemoProfileList(items=[profile_from_row(row) for row in rows])


def profile_from_row(row: sqlite3.Row) -> DemoProfile:
    """접수 API(4번)가 접수 시점의 프로필 사본을 만들 때도 사용한다."""
    return DemoProfile(
        code=row["code"],
        beneficiary_name=row["beneficiary_name"],
        applicant_name=row["applicant_name"],
        notice_recipient_name=row["notice_recipient_name"],
        region=Region(
            district_code=row["district_code"],
            town_code=row["town_code"],
            sido=row["sido"],
            sigungu=row["sigungu"],
        ),
    )
