// 화면에 표시하는 코드값 문구. 검증 기준인 docs/design/expected-results.md의 표시 문구와 맞춘다.

import type {
  ActionCode,
  CaseDetail,
  CaseStatus,
  Condition,
  ContactMethod,
  DeliveryStatus,
  LinkageMethod,
  NoticeMethod,
} from './types';

export const STATUS_LABEL: Record<CaseStatus, string> = {
  RECEIVED: '접수',
  SCREENED: '사전조사 완료',
  ASSESSED: '판정 기록 완료',
  PLAN_DRAFTED: '초안',
  PLAN_CONFIRMED: '확정',
  SERVICE_TRACKING: '연계·제공 기록 중',
  FIRST_MONITORING_RECORDED: '최초 모니터링 기록 완료',
};

/** 상태 배지 색. 상태는 색과 텍스트를 함께 표시한다(D-02). */
export const STATUS_BADGE: Record<CaseStatus, string> = {
  RECEIVED: 'bg-light-gray',
  SCREENED: 'bg-light-information',
  ASSESSED: 'bg-light-information',
  PLAN_DRAFTED: 'bg-light-warning',
  PLAN_CONFIRMED: 'bg-light-primary',
  SERVICE_TRACKING: 'bg-light-primary',
  FIRST_MONITORING_RECORDED: 'bg-light-success',
};

export const STATUS_ORDER: CaseStatus[] = [
  'RECEIVED',
  'SCREENED',
  'ASSESSED',
  'PLAN_DRAFTED',
  'PLAN_CONFIRMED',
  'SERVICE_TRACKING',
  'FIRST_MONITORING_RECORDED',
];

export const NOTICE_METHOD_LABEL: Record<NoticeMethod, string> = {
  SMS: '문자',
  MAIL: '우편',
};

export const CONTACT_METHOD_LABEL: Record<ContactMethod, string> = {
  PHONE: '유선',
  VISIT: '방문',
};

export const SCREENING_OUTCOME_LABEL = { NHIS_ASSESSMENT_REQUIRED: '통합판정조사군' } as const;
export const ASSESSMENT_OUTCOME_LABEL = { SUPPORT_PLAN_REQUIRED: '지원계획 수립 대상' } as const;
export const MEETING_OUTCOME_LABEL = { APPROVED: '승인' } as const;

export const LINKAGE_METHOD_LABEL: Record<LinkageMethod, string> = {
  DEPARTMENT_REFERRAL: '부서·공단 의뢰',
  PROVIDER_REFERRAL: '제공기관 의뢰',
  PERSON_GUIDANCE: '대상자 안내',
};

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  UNKNOWN: '확인 중',
  IN_USE: '이용 중',
  NOT_STARTED: '미개시',
  DECLINED: '이용 거부',
};

export const CONDITION_LABEL: Record<Condition, string> = {
  UNCHANGED: '상태 변화 없음',
  IMPROVED: '상태 호전',
  WORSENED: '상태 악화',
};

export const ACTION_LABEL: Record<ActionCode, string> = {
  RECEIVE: '신청 접수',
  RECORD_SCREENING: '사전조사 기록',
  RECORD_ASSESSMENT: '판정 결과 기록',
  SAVE_DRAFT: '지원계획 초안 저장',
  CONFIRM_PLAN: '계획 확정',
  RECORD_NOTICE: '계획 안내 기록',
  RECORD_LINKAGE: '연계 기록',
  RECORD_DELIVERY: '제공 현황 기록',
  RECORD_MONITORING: '최초 모니터링 기록',
};

/** 다음 작업 문구. 동작할 수 있으면 동작 이름, 아니면 다음 담당 역할의 대기 문구를 표시한다(D-02). */
export function nextStepLabel(detail: CaseDetail): string {
  const first = detail.allowedActions[0];
  if (first) {
    if (first.action === 'SAVE_DRAFT' && detail.plan) {
      return '초안 저장';
    }
    return ACTION_LABEL[first.action];
  }
  switch (detail.status) {
    case 'RECEIVED':
      return '읍면동 사전조사 기록 대기';
    case 'SCREENED':
      return '시군구 판정 결과 기록 대기';
    case 'ASSESSED':
      return '읍면동 지원계획 초안 저장 대기';
    case 'PLAN_DRAFTED':
      return '시군구 계획 확정 대기';
    case 'PLAN_CONFIRMED':
      return detail.plan?.notice ? '시군구 연계 기록 대기' : '시군구 계획 안내 기록 대기';
    case 'SERVICE_TRACKING': {
      const allRecorded = detail.plan?.items.every((item) => item.linkage && item.delivery) ?? false;
      return allRecorded ? '읍면동 최초 모니터링 기록 대기' : '시군구 연계·제공 현황 기록 대기';
    }
    case 'FIRST_MONITORING_RECORDED':
      return '최초 모니터링 기록 완료';
  }
}

/** 값이 없을 때 표시(D-02: 결측값은 ‘자료 없음’). */
export function orMissing(value: string | null | undefined): string {
  return value && value.trim() !== '' ? value : '자료 없음';
}

/** 처리 시각(UTC)을 한국 시간으로 표시한다(D-03). */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
