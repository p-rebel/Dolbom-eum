"""Fields shared by the mock submission, the PDF forms, and the inbox."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from pydantic import Field, StrictBool, StringConstraints, field_validator, model_validator

from .auth import CamelModel

DemoName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=14, pattern=r"^가상 [가-힣A-Za-z0-9 ]+$")]
DemoAddress = Annotated[str, StringConstraints(strip_whitespace=True, max_length=52, pattern=r"^가상[가-힣A-Za-z0-9 .(), -]+$")]
DemoMobile = Annotated[str, StringConstraints(pattern=r"^000-0000-[0-9]{4}$")]
DemoId = Annotated[str, StringConstraints(pattern=r"^DEMO-[A-Z0-9]{2,12}(?:-[A-Z0-9]{1,8})?$")]
BusinessDate = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
Relationship = Literal["SPOUSE", "PARENT", "CHILD", "RELATIVE", "GUARDIAN", "OTHER"]
EvidenceKind = Literal["IDENTITY", "FAMILY_RELATION", "GUARDIANSHIP", "RESIDENCE"]

RELATIONSHIPS = {
    "SPOUSE": "배우자", "PARENT": "부모", "CHILD": "자녀",
    "RELATIVE": "그 외의 친족", "GUARDIAN": "후견인", "OTHER": "기타",
}
EVIDENCE_LABELS = {
    "IDENTITY": "신청인 신분 확인",
    "FAMILY_RELATION": "친족 관계 증빙",
    "GUARDIANSHIP": "후견등기 증빙",
    "RESIDENCE": "대상자 등본 확인",
}


class SubmissionRegion(CamelModel):
    code: str
    district_code: str
    name: str


REGIONS = {
    "DEMO-A-1": SubmissionRegion(code="DEMO-A-1", district_code="DEMO-A", name="가상 A시 A-1동"),
    "DEMO-B-1": SubmissionRegion(code="DEMO-B-1", district_code="DEMO-B", name="가상 B시 B-1동"),
}


class Person(CamelModel):
    name: DemoName
    address: DemoAddress
    mobile: DemoMobile


class Beneficiary(Person):
    demo_id: DemoId
    birth_date: BusinessDate
    sex: Literal["FEMALE", "MALE"] | None = None
    residence: DemoAddress | None = None

    @field_validator("birth_date")
    @classmethod
    def _validate_birth_date(cls, value: str) -> str:
        if date.fromisoformat(value) > date.today():
            raise ValueError("생년월일을 확인해 주세요.")
        return value


class RelatedPerson(Person):
    relationship: Relationship


class Consents(CamelModel):
    family_record: StrictBool | None = None
    administrative: StrictBool
    personal: StrictBool
    sensitive: StrictBool
    unique_id: StrictBool


class ApplicationForm(CamelModel):
    application_type: Literal["SELF", "FAMILY", "GUARDIAN"]
    region_code: Literal["DEMO-A-1", "DEMO-B-1"]
    beneficiary: Beneficiary
    applicant: RelatedPerson | None = None
    caregiver: RelatedPerson | None = None
    notice_recipient: Literal["BENEFICIARY", "APPLICANT"]
    notice_method: Literal["SMS", "MAIL"]
    care_needs: list[Literal["HEALTH", "MEAL", "MOBILITY", "DAILY", "HOUSING"]] = Field(min_length=1, max_length=5)
    consents: Consents
    evidence: list[EvidenceKind] = Field(default_factory=list, max_length=4)
    confirmed: Literal[True]

    def required_evidence(self) -> list[EvidenceKind]:
        evidence: list[EvidenceKind] = []
        if self.application_type != "SELF":
            evidence.append("IDENTITY")
        if self.application_type == "GUARDIAN":
            evidence.append("GUARDIANSHIP")
        if self.application_type == "FAMILY" and self.consents.family_record is False:
            evidence.append("FAMILY_RELATION")
        if not self.consents.administrative:
            evidence.append("RESIDENCE")
        return evidence

    @model_validator(mode="after")
    def _matched_fields(self) -> ApplicationForm:
        if self.application_type == "SELF":
            if self.applicant is not None or self.notice_recipient != "BENEFICIARY":
                raise ValueError("본인 신청은 대상자 본인을 안내 대상으로 선택해 주세요.")
        elif self.applicant is None:
            raise ValueError("대리 신청인의 정보를 입력해 주세요.")
        elif self.application_type == "GUARDIAN":
            if self.applicant.relationship != "GUARDIAN":
                raise ValueError("후견인 관계를 확인해 주세요.")
        elif self.applicant.relationship not in ("SPOUSE", "PARENT", "CHILD", "RELATIVE"):
            raise ValueError("친족 관계를 확인해 주세요.")

        if (self.application_type == "FAMILY") != (self.consents.family_record is not None):
            raise ValueError("가족관계정보 제공 동의 항목을 확인해 주세요.")
        if len(self.care_needs) != len(set(self.care_needs)):
            raise ValueError("같은 돌봄 영역을 중복 선택할 수 없습니다.")
        if sorted(self.evidence) != sorted(self.required_evidence()):
            raise ValueError("신청 유형과 동의 선택에 필요한 가상 증빙을 준비해 주세요.")
        return self
