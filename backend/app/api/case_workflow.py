"""D-04 사전조사부터 최초 모니터링까지의 업무 기록 API."""

from __future__ import annotations

import json
import sqlite3
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from pydantic import AfterValidator, Field, StrictBool, StrictStr

from ..auth import Account, CamelModel, current_account
from ..cases import CaseDetail, Observation, validate_business_date
from ..db import get_connection
from ..workflow import (
    VersionedRequest, WorkflowRequest, case_item, invalid_field, invalid_transition, record_change,
)
from .catalog import find_catalog_item

router = APIRouter(prefix="/cases")

BusinessDate = Annotated[StrictStr, AfterValidator(validate_business_date)]
ContactMethod = Literal["PHONE", "VISIT"]
DeliveryStatus = Literal["UNKNOWN", "IN_USE", "NOT_STARTED", "DECLINED"]


class ScreeningRequest(VersionedRequest):
    screened_on: BusinessDate
    method: ContactMethod
    outcome: Literal["NHIS_ASSESSMENT_REQUIRED"]


class AssessmentRequest(VersionedRequest):
    assessed_on: BusinessDate
    result_received_on: BusinessDate
    outcome: Literal["SUPPORT_PLAN_REQUIRED"]


class DraftRequest(VersionedRequest):
    prepared_on: BusinessDate
    goal: StrictStr
    service_ids: list[StrictStr]


class ConfirmationRequest(VersionedRequest):
    meeting_on: BusinessDate
    outcome: Literal["APPROVED"]


class NoticeRequest(VersionedRequest):
    announced_on: BusinessDate


class LinkageRequest(VersionedRequest):
    linked_on: BusinessDate
    method: Literal["DEPARTMENT_REFERRAL", "PROVIDER_REFERRAL", "PERSON_GUIDANCE"]
    destination_label: StrictStr | None = None


class DeliveryRequest(VersionedRequest):
    observed_on: BusinessDate
    status: DeliveryStatus
    reason: StrictStr | None = None


class ObservationRequest(CamelModel):
    item_id: StrictStr
    status: DeliveryStatus
    reason: StrictStr | None = None


class MonitoringRequest(VersionedRequest):
    monitored_on: BusinessDate
    method: ContactMethod
    condition: Literal["UNCHANGED", "IMPROVED", "WORSENED"]
    review_needed: StrictBool
    review_reason: StrictStr | None = None
    observations: list[ObservationRequest] = Field(default_factory=list)


async def _workflow_request(
    request: Request,
    account: Account = Depends(current_account),
    conn: sqlite3.Connection = Depends(get_connection),
) -> WorkflowRequest:
    # 권한과 항목 소속을 확인한 뒤에만 본문을 파싱한다.
    return WorkflowRequest(conn, account, await request.body())


WorkflowInput = Annotated[WorkflowRequest, Depends(_workflow_request)]


def _put(path: str, body_type: type[VersionedRequest]):
    # 본문을 직접 검증하는 경로도 OpenAPI에 요청 모델을 제공한다.
    pointer = ("/api/v1/cases" + path).replace("/", "~1").replace("{", "{{").replace("}", "}}")
    schema_path = f"#/paths/{pointer}/put/requestBody/content/application~1json/schema"
    schema = body_type.model_json_schema(ref_template=f"{schema_path}/$defs/{{model}}")
    return router.put(path, response_model=CaseDetail, openapi_extra={
        "requestBody": {"required": True, "content": {"application/json": {"schema": schema}}},
    })


def _date_after(value: str, minimum: str, field: str) -> None:
    if value < minimum:
        raise invalid_field(field, "이전 업무일과 같거나 이후 날짜를 입력해 주세요.")


def _text(value: str | None, field: str, *, required: bool = False, limit: int = 200) -> str | None:
    cleaned = value.strip() if value is not None else ""
    if (required and not cleaned) or len(cleaned) > limit or "\x00" in cleaned:
        raise invalid_field(field)
    return cleaned or None


def _delivery_reason(status: DeliveryStatus, reason: str | None, field: str) -> str | None:
    return _text(reason, field, required=status in ("NOT_STARTED", "DECLINED"))


@_put("/{case_id}/screening", ScreeningRequest)
def record_screening(case_id: str, request: WorkflowInput) -> CaseDetail:
    def save(case: CaseDetail, body: ScreeningRequest) -> None:
        _date_after(body.screened_on, case.received_on, "screenedOn")
        request.conn.execute(
            "INSERT INTO screenings (case_id, screened_on, method, outcome) VALUES (?, ?, ?, ?)",
            (case.id, body.screened_on, body.method, body.outcome),
        )

    return record_change(request, case_id, "RECORD_SCREENING", ScreeningRequest, save)


@_put("/{case_id}/assessment", AssessmentRequest)
def record_assessment(case_id: str, request: WorkflowInput) -> CaseDetail:
    def save(case: CaseDetail, body: AssessmentRequest) -> None:
        if case.screening is None:
            raise invalid_transition()
        _date_after(body.assessed_on, case.screening.screened_on, "assessedOn")
        _date_after(body.result_received_on, body.assessed_on, "resultReceivedOn")
        request.conn.execute(
            "INSERT INTO assessments (case_id, assessed_on, result_received_on, outcome) VALUES (?, ?, ?, ?)",
            (case.id, body.assessed_on, body.result_received_on, body.outcome),
        )

    return record_change(request, case_id, "RECORD_ASSESSMENT", AssessmentRequest, save)


@_put("/{case_id}/plan", DraftRequest)
def save_draft(case_id: str, request: WorkflowInput) -> CaseDetail:
    def save(case: CaseDetail, body: DraftRequest) -> None:
        if case.assessment is None:
            raise invalid_transition()
        _date_after(body.prepared_on, case.assessment.result_received_on, "preparedOn")
        goal = _text(body.goal, "goal", required=True)
        if not 1 <= len(body.service_ids) <= 5:
            raise invalid_field("serviceIds")

        items = []
        seen = set()
        for index, service_id in enumerate(body.service_ids):
            if service_id in seen:
                raise invalid_field(f"serviceIds.{index}", "같은 서비스를 두 번 선택할 수 없습니다.")
            catalog = find_catalog_item(request.conn, service_id)
            if catalog is None:
                raise invalid_field(f"serviceIds.{index}", "조회 가능한 공단 서비스를 선택해 주세요.")
            seen.add(service_id)
            items.append((
                str(uuid4()), case.id, index + 1, catalog.dataset_version,
                catalog.id, catalog.model_dump_json(by_alias=True),
            ))
        request.conn.execute(
            """INSERT INTO plans (case_id, prepared_on, goal) VALUES (?, ?, ?)
               ON CONFLICT (case_id) DO UPDATE SET prepared_on = excluded.prepared_on, goal = excluded.goal""",
            (case.id, body.prepared_on, goal),
        )
        request.conn.execute("DELETE FROM plan_items WHERE case_id = ?", (case.id,))
        request.conn.executemany(
            """INSERT INTO plan_items (id, case_id, position, dataset_version, nhis_service_id, catalog_snapshot)
               VALUES (?, ?, ?, ?, ?, ?)""",
            items,
        )

    return record_change(request, case_id, "SAVE_DRAFT", DraftRequest, save)


@_put("/{case_id}/plan/confirmation", ConfirmationRequest)
def confirm_plan(case_id: str, request: WorkflowInput) -> CaseDetail:
    def save(case: CaseDetail, body: ConfirmationRequest) -> None:
        assert case.plan is not None
        _date_after(body.meeting_on, case.plan.prepared_on, "meetingOn")
        request.conn.execute(
            "UPDATE plans SET meeting_on = ?, meeting_outcome = ?, confirmed_by = ? WHERE case_id = ?",
            (body.meeting_on, body.outcome, request.account.id, case.id),
        )

    return record_change(request, case_id, "CONFIRM_PLAN", ConfirmationRequest, save)


@_put("/{case_id}/plan/notice", NoticeRequest)
def record_notice(case_id: str, request: WorkflowInput) -> CaseDetail:
    def save(case: CaseDetail, body: NoticeRequest) -> None:
        if case.plan is None or case.plan.confirmation is None:
            raise invalid_transition()
        _date_after(body.announced_on, case.plan.confirmation.meeting_on, "announcedOn")
        request.conn.execute("UPDATE plans SET announced_on = ? WHERE case_id = ?", (body.announced_on, case.id))

    return record_change(request, case_id, "RECORD_NOTICE", NoticeRequest, save)


@_put("/{case_id}/plan/items/{item_id}/linkage", LinkageRequest)
def record_linkage(case_id: str, item_id: str, request: WorkflowInput) -> CaseDetail:
    def save(case: CaseDetail, body: LinkageRequest) -> None:
        assert case.plan is not None and case.plan.notice is not None
        item = case_item(case, item_id)
        _date_after(body.linked_on, case.plan.notice.announced_on, "linkedOn")
        destination = None
        if body.method == "DEPARTMENT_REFERRAL":
            destination = _text(body.destination_label, "destinationLabel", required=True, limit=80)
        elif body.destination_label is not None:
            raise invalid_field("destinationLabel")
        if body.method == "PROVIDER_REFERRAL" and not (item.catalog.get("providerName") or "").strip():
            raise invalid_field("method", "제공기관명이 있는 서비스만 기관에 의뢰할 수 있습니다.")
        request.conn.execute(
            "INSERT INTO service_linkages (plan_item_id, linked_on, method, destination_label) VALUES (?, ?, ?, ?)",
            (item.id, body.linked_on, body.method, destination),
        )

    return record_change(request, case_id, "RECORD_LINKAGE", LinkageRequest, save, item_id=item_id)


@_put("/{case_id}/plan/items/{item_id}/delivery", DeliveryRequest)
def record_delivery(case_id: str, item_id: str, request: WorkflowInput) -> CaseDetail:
    def save(case: CaseDetail, body: DeliveryRequest) -> None:
        item = case_item(case, item_id)
        assert item.linkage is not None
        _date_after(body.observed_on, item.linkage.linked_on, "observedOn")
        reason = _delivery_reason(body.status, body.reason, "reason")
        request.conn.execute(
            """INSERT INTO service_deliveries (plan_item_id, observed_on, status, reason) VALUES (?, ?, ?, ?)
               ON CONFLICT (plan_item_id) DO UPDATE SET observed_on = excluded.observed_on,
                   status = excluded.status, reason = excluded.reason""",
            (item.id, body.observed_on, body.status, reason),
        )

    return record_change(request, case_id, "RECORD_DELIVERY", DeliveryRequest, save, item_id=item_id)


@_put("/{case_id}/monitoring", MonitoringRequest)
def record_monitoring(case_id: str, request: WorkflowInput) -> CaseDetail:
    def save(case: CaseDetail, body: MonitoringRequest) -> None:
        assert case.plan is not None
        review_reason = _text(body.review_reason, "reviewReason", required=body.review_needed)
        observations = {}
        for item in case.plan.items:
            assert item.delivery is not None
            _date_after(body.monitored_on, item.delivery.observed_on, "monitoredOn")
            observations[item.id] = Observation(
                item_id=item.id, status=item.delivery.status, reason=item.delivery.reason,
            )

        seen = set()
        for index, observed in enumerate(body.observations):
            field = f"observations.{index}"
            if observed.item_id not in observations or observed.item_id in seen:
                raise invalid_field(f"{field}.itemId")
            reason = _delivery_reason(observed.status, observed.reason, f"{field}.reason")
            seen.add(observed.item_id)
            observations[observed.item_id] = Observation(item_id=observed.item_id, status=observed.status, reason=reason)
        data = [observation.model_dump(by_alias=True) for observation in observations.values()]
        request.conn.execute(
            """INSERT INTO monitorings
                   (case_id, monitored_on, method, condition, review_needed, review_reason, observations)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                case.id, body.monitored_on, body.method, body.condition, body.review_needed,
                review_reason, json.dumps(data, ensure_ascii=False),
            ),
        )

    return record_change(request, case_id, "RECORD_MONITORING", MonitoringRequest, save)
