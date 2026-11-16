// D-04 사례·업무 기록 API.

import { apiRequest } from './client';
import type {
  Assessment,
  CaseDetail,
  CaseStatus,
  CaseSummary,
  Condition,
  ContactMethod,
  DeliveryStatus,
  DemoProfile,
  LinkageMethod,
  NoticeMethod,
  Page,
  ReviewDecision,
  Screening,
} from './types';

export function getDemoProfiles(signal?: AbortSignal) {
  return apiRequest<{ items: DemoProfile[] }>('/demo-profiles', { signal });
}

export function listCases(query: { status?: CaseStatus | ''; page?: number; pageSize?: number }, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (query.status) {
    params.set('status', query.status);
  }
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 20));
  return apiRequest<Page<CaseSummary>>(`/cases?${params.toString()}`, { signal });
}

export function getCase(caseId: string, signal?: AbortSignal) {
  return apiRequest<CaseDetail>(`/cases/${encodeURIComponent(caseId)}`, { signal });
}

export interface ReceiveInput {
  profileCode: string;
  receivedOn: string;
  noticeMethod: NoticeMethod;
  evidenceChecked: boolean;
}

/** 신청 접수. 같은 요청 키로 재시도하면 서버가 같은 사례를 돌려준다(D-04). */
export function receiveCase(input: ReceiveInput, idempotencyKey: string) {
  return apiRequest<CaseDetail>('/cases', {
    method: 'POST',
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export function recordScreening(
  caseId: string,
  input: { version: number; screenedOn: string; method: ContactMethod; outcome: Screening['outcome'] },
) {
  return apiRequest<CaseDetail>(`/cases/${encodeURIComponent(caseId)}/screening`, { method: 'PUT', body: input });
}

export function recordAssessment(
  caseId: string,
  input: Assessment & { version: number },
) {
  return apiRequest<CaseDetail>(`/cases/${encodeURIComponent(caseId)}/assessment`, { method: 'PUT', body: input });
}

export function saveDraft(
  caseId: string,
  input: { version: number; preparedOn: string; goal: string; serviceIds: string[] },
) {
  return apiRequest<CaseDetail>(`/cases/${encodeURIComponent(caseId)}/plan`, { method: 'PUT', body: input });
}

export function confirmPlan(caseId: string, input: { version: number; meetingOn: string; outcome: 'APPROVED' }) {
  return apiRequest<CaseDetail>(`/cases/${encodeURIComponent(caseId)}/plan/confirmation`, { method: 'PUT', body: input });
}

export function recordNotice(caseId: string, input: { version: number; announcedOn: string }) {
  return apiRequest<CaseDetail>(`/cases/${encodeURIComponent(caseId)}/plan/notice`, { method: 'PUT', body: input });
}

export function recordLinkage(
  caseId: string,
  itemId: string,
  input: { version: number; linkedOn: string; method: LinkageMethod; destinationLabel: string | null },
) {
  return apiRequest<CaseDetail>(
    `/cases/${encodeURIComponent(caseId)}/plan/items/${encodeURIComponent(itemId)}/linkage`,
    { method: 'PUT', body: input },
  );
}

export function recordDelivery(
  caseId: string,
  itemId: string,
  input: { version: number; observedOn: string; status: DeliveryStatus; reason: string | null },
) {
  return apiRequest<CaseDetail>(
    `/cases/${encodeURIComponent(caseId)}/plan/items/${encodeURIComponent(itemId)}/delivery`,
    { method: 'PUT', body: input },
  );
}

export function recordMonitoring(
  caseId: string,
  input: {
    version: number;
    monitoredOn: string;
    method: ContactMethod;
    condition: Condition;
    reviewNeeded: boolean;
    reviewReason: string | null;
    observations: { itemId: string; status: DeliveryStatus; reason: string | null }[];
  },
) {
  return apiRequest<CaseDetail>(`/cases/${encodeURIComponent(caseId)}/monitoring`, { method: 'PUT', body: input });
}

export function recordMonitoringReview(
  caseId: string, sequence: number,
  input: { version: number; reviewedOn: string; decision: ReviewDecision; reason: string },
) {
  return apiRequest<CaseDetail>(`/cases/${encodeURIComponent(caseId)}/monitoring/${sequence}/review`, {
    method: 'PUT', body: input,
  });
}
