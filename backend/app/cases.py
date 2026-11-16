"""D-04 CaseDetail 응답 구성과 allowedActions 계산.

접수(4번)·목록·상세(5번)와 이후 업무 기록 API가 같은 함수로 응답을 만든다.
"""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import UTC, date, datetime
from typing import Any, Literal

from .api.sessions import DemoProfile, Region
from .auth import Account, CamelModel
from .errors import ApiError

_BUSINESS_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")

CaseStatus = Literal[
    "RECEIVED", "SCREENED", "ASSESSED", "PLAN_DRAFTED",
    "PLAN_CONFIRMED", "SERVICE_TRACKING", "FIRST_MONITORING_RECORDED",
]


class Screening(CamelModel):
    screened_on: str
    method: str
    outcome: str


class Assessment(CamelModel):
    assessed_on: str
    result_received_on: str
    outcome: str


class Confirmation(CamelModel):
    meeting_on: str
    outcome: str


class Notice(CamelModel):
    announced_on: str


class Linkage(CamelModel):
    linked_on: str
    method: str
    destination_label: str | None


class Delivery(CamelModel):
    observed_on: str
    status: str
    reason: str | None


class PlanItem(CamelModel):
    id: str
    catalog: dict[str, Any]
    linkage: Linkage | None
    delivery: Delivery | None


class Plan(CamelModel):
    prepared_on: str
    goal: str
    items: list[PlanItem]
    confirmation: Confirmation | None
    notice: Notice | None


class Observation(CamelModel):
    item_id: str
    status: str
    reason: str | None


class Monitoring(CamelModel):
    monitored_on: str
    method: str
    condition: str
    review_needed: bool
    review_reason: str | None
    observations: list[Observation]


class CaseEvent(CamelModel):
    id: str
    action: str
    from_status: str | None
    to_status: str
    actor_display_name: str
    actor_role: str
    recorded_at: str
    version: int
    item_id: str | None
    summary: str


class AllowedAction(CamelModel):
    action: str
    item_id: str | None = None


class CaseSummary(CamelModel):
    id: str
    receipt_number: str
    beneficiary_name: str
    received_on: str
    status: CaseStatus
    version: int
    region: Region


class CaseDetail(CaseSummary):
    profile: DemoProfile
    notice_method: str
    evidence_checked: bool
    screening: Screening | None
    assessment: Assessment | None
    plan: Plan | None
    monitoring: Monitoring | None
    events: list[CaseEvent]
    allowed_actions: list[AllowedAction]


def can_access(account: Account, case_row: sqlite3.Row) -> bool:
    """읍면동은 소속 읍면동 건, 시군구는 소속 시군구 건 (D-05 공통 전환 조건)."""
    if account.role == "TOWN":
        return case_row["district_code"] == account.district_code and case_row["town_code"] == account.town_code
    return account.role == "DISTRICT" and case_row["district_code"] == account.district_code


def accessible_case(conn: sqlite3.Connection, case_id: str, account: Account) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
    if row is None or not can_access(account, row):
        raise ApiError(404, "NOT_FOUND", "신청 건을 찾을 수 없습니다.")
    return row


def validate_business_date(value: str) -> str:
    if not _BUSINESS_DATE.fullmatch(value):
        raise ValueError("YYYY-MM-DD 형식이어야 합니다.")
    date.fromisoformat(value)
    return value


def case_timestamp() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def case_summary(row: sqlite3.Row) -> CaseSummary:
    profile = DemoProfile.model_validate(json.loads(row["profile_snapshot"]))
    return CaseSummary(
        id=row["id"],
        receipt_number=row["receipt_number"],
        beneficiary_name=profile.beneficiary_name,
        received_on=row["received_on"],
        status=row["status"],
        version=row["version"],
        region=profile.region,
    )


def _load_plan(conn: sqlite3.Connection, case_id: str) -> Plan | None:
    plan = conn.execute("SELECT * FROM plans WHERE case_id = ?", (case_id,)).fetchone()
    if plan is None:
        return None
    rows = conn.execute(
        """SELECT i.id, i.catalog_snapshot,
                  l.linked_on, l.method, l.destination_label,
                  d.observed_on, d.status, d.reason
           FROM plan_items i
           LEFT JOIN service_linkages l ON l.plan_item_id = i.id
           LEFT JOIN service_deliveries d ON d.plan_item_id = i.id
           WHERE i.case_id = ? ORDER BY i.position""",
        (case_id,),
    ).fetchall()
    items = []
    for r in rows:
        catalog = json.loads(r["catalog_snapshot"])
        linkage = None
        if r["linked_on"] is not None:
            # 제공기관 의뢰는 선택 시점 기관명, 대상자 안내는 null (D-04 필드 값)
            label = catalog.get("providerName") if r["method"] == "PROVIDER_REFERRAL" else r["destination_label"]
            linkage = Linkage(linked_on=r["linked_on"], method=r["method"], destination_label=label)
        delivery = None
        if r["observed_on"] is not None:
            delivery = Delivery(observed_on=r["observed_on"], status=r["status"], reason=r["reason"])
        items.append(PlanItem(id=r["id"], catalog=catalog, linkage=linkage, delivery=delivery))
    confirmation = (
        Confirmation(meeting_on=plan["meeting_on"], outcome=plan["meeting_outcome"])
        if plan["meeting_on"] is not None else None
    )
    notice = Notice(announced_on=plan["announced_on"]) if plan["announced_on"] is not None else None
    return Plan(prepared_on=plan["prepared_on"], goal=plan["goal"], items=items,
                confirmation=confirmation, notice=notice)


def allowed_actions(account: Account, status: str, plan: Plan | None) -> list[AllowedAction]:
    """D-05 전환 조건으로 현재 계정이 실행할 수 있는 동작. 관할 확인은 호출 전에 끝낸다."""
    town = account.role == "TOWN"
    if status == "RECEIVED":
        return [AllowedAction(action="RECORD_SCREENING")] if town else []
    if status == "SCREENED":
        return [] if town else [AllowedAction(action="RECORD_ASSESSMENT")]
    if status == "ASSESSED":
        return [AllowedAction(action="SAVE_DRAFT")] if town else []
    if status == "PLAN_DRAFTED" and plan is not None and plan.confirmation is None:
        if town:
            return [AllowedAction(action="SAVE_DRAFT")]
        return [AllowedAction(action="CONFIRM_PLAN")] if plan.items else []
    if status in ("PLAN_CONFIRMED", "SERVICE_TRACKING") and plan is not None:
        if town:
            done = status == "SERVICE_TRACKING" and plan.notice is not None and bool(plan.items) and all(
                item.linkage is not None and item.delivery is not None for item in plan.items
            )
            return [AllowedAction(action="RECORD_MONITORING")] if done else []
        if plan.notice is None:
            return [AllowedAction(action="RECORD_NOTICE")] if status == "PLAN_CONFIRMED" else []
        # 항목별로 연계 전이면 연계, 연계 후면 제공 현황(최초 모니터링 전까지 갱신 가능)
        return [
            AllowedAction(action="RECORD_DELIVERY" if i.linkage else "RECORD_LINKAGE", item_id=i.id)
            for i in plan.items
        ]
    return []


def load_case_detail(conn: sqlite3.Connection, case_row: sqlite3.Row, account: Account) -> CaseDetail:
    case_id = case_row["id"]
    screening = conn.execute(
        "SELECT screened_on, method, outcome FROM screenings WHERE case_id = ?", (case_id,)
    ).fetchone()
    assessment = conn.execute(
        "SELECT assessed_on, result_received_on, outcome FROM assessments WHERE case_id = ?", (case_id,)
    ).fetchone()
    monitoring = conn.execute("SELECT * FROM monitorings WHERE case_id = ?", (case_id,)).fetchone()
    events = conn.execute(
        "SELECT * FROM case_events WHERE case_id = ? ORDER BY version DESC", (case_id,)
    ).fetchall()
    plan = _load_plan(conn, case_id)
    summary = case_summary(case_row)
    return CaseDetail(
        **summary.model_dump(),
        profile=DemoProfile.model_validate(json.loads(case_row["profile_snapshot"])),
        notice_method=case_row["notice_method"],
        evidence_checked=bool(case_row["evidence_checked"]),
        screening=Screening(**dict(screening)) if screening else None,
        assessment=Assessment(**dict(assessment)) if assessment else None,
        plan=plan,
        monitoring=Monitoring(
            monitored_on=monitoring["monitored_on"],
            method=monitoring["method"],
            condition=monitoring["condition"],
            review_needed=bool(monitoring["review_needed"]),
            review_reason=monitoring["review_reason"],
            observations=json.loads(monitoring["observations"]),
        ) if monitoring else None,
        events=[
            CaseEvent(
                id=e["id"], action=e["action"], from_status=e["from_status"], to_status=e["to_status"],
                actor_display_name=e["actor_display_name"], actor_role=e["actor_role"],
                recorded_at=e["recorded_at"], version=e["version"], item_id=e["plan_item_id"],
                summary=e["summary"],
            )
            for e in events
        ],
        allowed_actions=allowed_actions(account, case_row["status"], plan),
    )
