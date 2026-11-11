// D-04 사례·업무 기록 API.

import { apiRequest } from './client';
import type { CaseDetail, CaseStatus, CaseSummary, ContactMethod, DemoProfile, NoticeMethod, Page } from './types';

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
  input: { version: number; screenedOn: string; method: ContactMethod; outcome: 'NHIS_ASSESSMENT_REQUIRED' },
) {
  return apiRequest<CaseDetail>(`/cases/${encodeURIComponent(caseId)}/screening`, { method: 'PUT', body: input });
}

export function recordAssessment(
  caseId: string,
  input: { version: number; assessedOn: string; resultReceivedOn: string; outcome: 'SUPPORT_PLAN_REQUIRED' },
) {
  return apiRequest<CaseDetail>(`/cases/${encodeURIComponent(caseId)}/assessment`, { method: 'PUT', body: input });
}

export function saveDraft(
  caseId: string,
  input: { version: number; preparedOn: string; goal: string; serviceIds: string[] },
) {
  return apiRequest<CaseDetail>(`/cases/${encodeURIComponent(caseId)}/plan`, { method: 'PUT', body: input });
}
