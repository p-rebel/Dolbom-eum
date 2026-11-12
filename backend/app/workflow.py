"""D-04/D-05 업무 기록의 권한, 버전, 트랜잭션과 처리 이력."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, Literal, TypeVar
from uuid import uuid4

from pydantic import Field, StrictInt, ValidationError
from pydantic.alias_generators import to_camel

from .auth import Account, CamelModel, Role
from .cases import (
    AllowedAction, CaseDetail, CaseEvent, CaseStatus, PlanItem,
    accessible_case, case_timestamp, load_case_detail,
)
from .db import write_transaction
from .errors import ApiError, forbidden


class VersionedRequest(CamelModel):
    version: Annotated[StrictInt, Field(ge=1)]


Body = TypeVar("Body", bound=VersionedRequest)
Action = Literal[
    "RECORD_SCREENING", "RECORD_ASSESSMENT", "SAVE_DRAFT", "CONFIRM_PLAN",
    "RECORD_NOTICE", "RECORD_LINKAGE", "RECORD_DELIVERY", "RECORD_MONITORING",
]


@dataclass(frozen=True)
class WorkflowRequest:
    conn: sqlite3.Connection
    account: Account
    body: bytes


@dataclass(frozen=True)
class ActionSpec:
    role: Role
    status: CaseStatus
    summary: str
    record_path: tuple[str, ...]
    replace: bool = False


_ACTIONS: dict[Action, ActionSpec] = {
    "RECORD_SCREENING": ActionSpec("TOWN", "SCREENED", "사전조사 기록", ("screening",)),
    "RECORD_ASSESSMENT": ActionSpec("DISTRICT", "ASSESSED", "판정 결과 기록", ("assessment",)),
    "SAVE_DRAFT": ActionSpec("TOWN", "PLAN_DRAFTED", "계획 초안 저장", ("plan",), replace=True),
    "CONFIRM_PLAN": ActionSpec("DISTRICT", "PLAN_CONFIRMED", "계획 확정", ("plan", "confirmation")),
    "RECORD_NOTICE": ActionSpec("DISTRICT", "PLAN_CONFIRMED", "계획 안내 기록", ("plan", "notice")),
    "RECORD_LINKAGE": ActionSpec("DISTRICT", "SERVICE_TRACKING", "서비스 연계 기록", ("linkage",)),
    "RECORD_DELIVERY": ActionSpec("DISTRICT", "SERVICE_TRACKING", "제공 현황 기록", ("delivery",), replace=True),
    "RECORD_MONITORING": ActionSpec("TOWN", "FIRST_MONITORING_RECORDED", "최초 모니터링 기록", ("monitoring",)),
}


def invalid_transition() -> ApiError:
    return ApiError(409, "INVALID_TRANSITION", "현재 단계에서 기록할 수 없습니다.")


def invalid_field(field: str | None, message: str = "입력값을 확인해 주세요.") -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", message, field)


def _version_conflict() -> ApiError:
    return ApiError(409, "VERSION_CONFLICT", "다른 변경이 저장되었습니다.")


def _parse(body_type: type[Body], data: bytes) -> Body:
    try:
        return body_type.model_validate_json(data)
    except ValidationError as exc:
        loc = exc.errors(include_input=False, include_context=False, include_url=False)[0]["loc"]
        field = ".".join(to_camel(part) if isinstance(part, str) else str(part) for part in loc)
        raise invalid_field(field or None) from exc


def case_item(case: CaseDetail, item_id: str) -> PlanItem:
    if case.plan is not None:
        for item in case.plan.items:
            if item.id == item_id:
                return item
    raise ApiError(404, "NOT_FOUND", "계획 항목을 찾을 수 없습니다.")


def _snapshot(case: CaseDetail, path: tuple[str, ...], item_id: str | None) -> dict | None:
    record = case if item_id is None else case_item(case, item_id)
    for field in path:
        record = getattr(record, field)
        if record is None:
            return None
    return record.model_dump(mode="json", by_alias=True)


def record_change(
    request: WorkflowRequest,
    case_id: str,
    action: Action,
    body_type: type[Body],
    save: Callable[[CaseDetail, Body], None],
    *,
    item_id: str | None = None,
) -> CaseDetail:
    conn, account = request.conn, request.account
    spec = _ACTIONS[action]
    with write_transaction(conn):
        row = accessible_case(conn, case_id, account)
        if item_id is not None and conn.execute(
            "SELECT 1 FROM plan_items WHERE id = ? AND case_id = ?", (item_id, case_id)
        ).fetchone() is None:
            raise ApiError(404, "NOT_FOUND", "계획 항목을 찾을 수 없습니다.")
        if account.role != spec.role:
            raise forbidden()

        body = _parse(body_type, request.body)
        if body.version != row["version"]:
            raise _version_conflict()
        current = load_case_detail(conn, row, account)
        if AllowedAction(action=action, item_id=item_id) not in current.allowed_actions:
            raise invalid_transition()
        before = _snapshot(current, spec.record_path, item_id)
        if before is not None and not spec.replace:
            raise invalid_transition()

        save(current, body)
        now = case_timestamp()
        updated = conn.execute(
            """UPDATE cases SET status = ?, version = version + 1, updated_at = ?
               WHERE id = ? AND version = ? RETURNING *""",
            (spec.status, now, case_id, body.version),
        ).fetchone()
        if updated is None:
            raise _version_conflict()
        result = load_case_detail(conn, updated, account)
        event = CaseEvent(
            id=str(uuid4()), action=action, from_status=current.status, to_status=result.status,
            actor_display_name=account.display_name, actor_role=account.role, recorded_at=now,
            version=result.version, item_id=item_id, summary=spec.summary,
        )
        details = json.dumps(
            {"before": before, "after": _snapshot(result, spec.record_path, item_id)}, ensure_ascii=False
        )
        conn.execute(
            """INSERT INTO case_events
                   (id, case_id, action, from_status, to_status, actor_account_id, actor_display_name,
                    actor_role, recorded_at, version, summary, details, plan_item_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                event.id, case_id, event.action, event.from_status, event.to_status, account.id,
                event.actor_display_name, event.actor_role, now, event.version, event.summary,
                details, event.item_id,
            ),
        )
        result.events.insert(0, event)
        return result
