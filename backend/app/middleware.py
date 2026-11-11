"""상태 변경 요청의 앱 출처(403)와 JSON 콘텐츠 형식(415) 검사 (D-04 세션과 접근 권한)."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from .config import SESSION_COOKIE_PATH, app_origins
from .errors import error_response

_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_BODY_METHODS = {"POST", "PUT", "PATCH"}


def _has_body(request: Request) -> bool:
    length = request.headers.get("content-length")
    if length is not None:
        return length.strip() not in {"", "0"}
    return "transfer-encoding" in request.headers


class RequestGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path.startswith(SESSION_COOKIE_PATH) and request.method in _UNSAFE_METHODS:
            origin = (request.headers.get("origin") or "").rstrip("/")
            if origin not in app_origins():
                return error_response(403, "FORBIDDEN", "허용되지 않은 출처의 요청입니다.")
            if request.method in _BODY_METHODS and _has_body(request):
                content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
                if content_type != "application/json":
                    return error_response(415, "UNSUPPORTED_MEDIA_TYPE", "JSON 형식으로 요청해야 합니다.")
        return await call_next(request)
