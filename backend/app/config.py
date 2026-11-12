"""서버 환경값. 요청 시점에 읽어 테스트와 배포 환경에서 바꿀 수 있게 한다."""

from __future__ import annotations

import os
from datetime import timedelta

APP_ORIGINS_ENV = "DOLBOMEUM_APP_ORIGINS"
COOKIE_SECURE_ENV = "DOLBOMEUM_COOKIE_SECURE"
DEMO_PASSWORD_ENV = "DOLBOMEUM_DEMO_PASSWORD"

# 로컬 개발: Vite 개발 서버 주소. localhost와 127.0.0.1은 다른 출처다.
DEFAULT_APP_ORIGINS = ("http://127.0.0.1:5173",)

SESSION_COOKIE = "dolbom_session"
SESSION_COOKIE_PATH = "/api/v1"
SESSION_TTL = timedelta(hours=8)


def app_origins() -> frozenset[str]:
    raw = os.environ.get(APP_ORIGINS_ENV)
    if not raw:
        return frozenset(DEFAULT_APP_ORIGINS)
    return frozenset(origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip())


def cookie_secure() -> bool:
    return os.environ.get(COOKIE_SECURE_ENV, "").strip().lower() in {"1", "true", "yes"}
