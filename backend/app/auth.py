"""가상 계정 비밀번호, 세션 발급·조회와 현재 계정 의존성.

다른 업무 API는 `current_account`(로그인 필수)와 `require_role`(역할 제한)을 Depends로 사용한다.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from datetime import UTC, datetime
from typing import Literal

from fastapi import Depends, Request
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from .config import SESSION_COOKIE, SESSION_TTL
from .db import get_connection, write_transaction
from .errors import forbidden, unauthenticated

Role = Literal["TOWN", "DISTRICT"]

# 비밀번호 해시: 표준 라이브러리 scrypt. 형식 scrypt$n$r$p$salt_hex$hash_hex
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P, _SCRYPT_LEN = 2**14, 8, 1, 32


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Account(CamelModel):
    id: str
    display_name: str
    role: Role
    district_code: str
    town_code: str | None


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_SCRYPT_LEN
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = bytes.fromhex(hash_hex)
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, expected)


# 로그인 실패 시에도 같은 시간이 걸리도록 없는 계정은 이 해시로 비교한다.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def account_from_row(row: sqlite3.Row) -> Account:
    return Account(
        id=row["id"],
        display_name=row["display_name"],
        role=row["role"],
        district_code=row["district_code"],
        town_code=row["town_code"],
    )


def authenticate(conn: sqlite3.Connection, username: str, password: str) -> Account | None:
    row = conn.execute("SELECT * FROM demo_accounts WHERE username = ?", (username,)).fetchone()
    stored = row["password_hash"] if row is not None else _DUMMY_HASH
    if not verify_password(password, stored) or row is None:
        return None
    return account_from_row(row)


def start_session(conn: sqlite3.Connection, account_id: str, previous_token: str | None) -> str:
    """새 세션을 발급한다. 이전 쿠키의 세션과 만료된 세션은 같은 트랜잭션에서 지운다."""
    token = secrets.token_urlsafe(32)
    now = _utc_now()
    with write_transaction(conn):
        conn.execute("DELETE FROM demo_sessions WHERE expires_at <= ?", (_iso(now),))
        if previous_token:
            conn.execute("DELETE FROM demo_sessions WHERE token_hash = ?", (token_hash(previous_token),))
        conn.execute(
            "INSERT INTO demo_sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token_hash(token), account_id, _iso(now), _iso(now + SESSION_TTL)),
        )
    return token


def end_session(conn: sqlite3.Connection, token: str | None) -> None:
    if not token:
        return
    with write_transaction(conn):
        conn.execute("DELETE FROM demo_sessions WHERE token_hash = ?", (token_hash(token),))


def account_for_token(conn: sqlite3.Connection, token: str | None) -> Account | None:
    if not token:
        return None
    row = conn.execute(
        """SELECT a.* FROM demo_sessions s JOIN demo_accounts a ON a.id = s.account_id
           WHERE s.token_hash = ? AND s.expires_at > ?""",
        (token_hash(token), _iso(_utc_now())),
    ).fetchone()
    return account_from_row(row) if row is not None else None


def current_account(request: Request, conn: sqlite3.Connection = Depends(get_connection)) -> Account:
    """로그인한 계정. 세션이 없거나 만료되면 401 UNAUTHENTICATED."""
    account = account_for_token(conn, request.cookies.get(SESSION_COOKIE))
    if account is None:
        raise unauthenticated()
    return account


def require_role(*roles: Role):
    """역할 제한 의존성. 예: Depends(require_role("TOWN")). 다른 역할은 403 FORBIDDEN."""

    def dependency(account: Account = Depends(current_account)) -> Account:
        if account.role not in roles:
            raise forbidden()
        return account

    return dependency
