"""D-04 오류 형식 {"error": {"code", "message", "field"}}와 공통 예외 처리."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

_HTTP_CODES = {
    401: ("UNAUTHENTICATED", "로그인이 필요합니다."),
    403: ("FORBIDDEN", "처리 권한이 없습니다."),
    404: ("NOT_FOUND", "찾을 수 없습니다."),
    405: ("METHOD_NOT_ALLOWED", "허용되지 않은 요청 방식입니다."),
    415: ("UNSUPPORTED_MEDIA_TYPE", "JSON 형식으로 요청해야 합니다."),
}


class ApiError(Exception):
    """업무 API가 던지는 오류. 상태 코드와 D-04 오류 코드를 함께 가진다."""

    def __init__(self, status_code: int, code: str, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field = field


class ErrorDetail(BaseModel):
    code: str
    message: str
    field: str | None


class ErrorResponse(BaseModel):
    error: ErrorDetail


def error_response(status_code: int, code: str, message: str, field: str | None = None) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=code, message=message, field=field))
    return JSONResponse(status_code=status_code, content=body.model_dump())


def unauthenticated() -> ApiError:
    return ApiError(401, "UNAUTHENTICATED", "로그인이 필요합니다.")


def forbidden(message: str = "처리 권한이 없습니다.") -> ApiError:
    return ApiError(403, "FORBIDDEN", message)


def _field_from_loc(loc: tuple) -> str | None:
    """FastAPI 검증 위치를 D-04 field 경로로 바꾼다. 예: ('body', 'observations', 0, 'reason') → observations.0.reason"""
    if len(loc) < 2:
        return None
    source, *path = loc
    if source == "header":
        return "-".join(part.capitalize() for part in str(path[0]).split("-"))
    if source == "body" and path and isinstance(path[0], int):
        return None  # JSON 구문 오류 위치
    return ".".join(str(part) for part in path)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message, exc.field)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        field = _field_from_loc(tuple(first.get("loc", ())))
        return error_response(422, "VALIDATION_ERROR", "입력값을 확인해 주세요.", field)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code, message = _HTTP_CODES.get(exc.status_code, ("HTTP_ERROR", "요청을 처리할 수 없습니다."))
        return error_response(exc.status_code, code, message)

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("처리 중 오류", exc_info=exc)
        return error_response(500, "INTERNAL_ERROR", "처리 중 오류가 발생했습니다. 저장 여부를 조회한 뒤 다시 시도해 주세요.")
