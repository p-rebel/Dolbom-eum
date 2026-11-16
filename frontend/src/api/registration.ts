import { ApiError, apiRequest } from './client';
import type { Page } from './types';

export type ApplicationType = 'SELF' | 'FAMILY' | 'GUARDIAN';
export type Relationship = 'SPOUSE' | 'PARENT' | 'CHILD' | 'RELATIVE' | 'GUARDIAN' | 'OTHER';
export type CareNeed = 'HEALTH' | 'MEAL' | 'MOBILITY' | 'DAILY' | 'HOUSING';
export type Evidence = 'IDENTITY' | 'FAMILY_RELATION' | 'GUARDIANSHIP' | 'RESIDENCE';
export type EvidenceSample = 'BENEFICIARY_A' | 'ADDRESS_DIFFERENT' | 'ID_BLURRY';
export type DocumentKind = 'application' | 'privacy-consent';
export type SubmissionAudience = 'applicant' | 'staff';

export interface Person {
  name: string;
  address: string;
  mobile: string;
}
export interface Beneficiary extends Person {
  demoId: string;
  birthDate: string;
  sex: 'FEMALE' | 'MALE' | null;
  residence: string | null;
}
export interface RelatedPerson extends Person {
  relationship: Relationship;
}
export interface ApplicationForm {
  applicationType: ApplicationType;
  regionCode: string;
  beneficiary: Beneficiary;
  applicant: RelatedPerson | null;
  caregiver: RelatedPerson | null;
  noticeRecipient: 'BENEFICIARY' | 'APPLICANT';
  noticeMethod: 'SMS' | 'MAIL';
  careNeeds: CareNeed[];
  consents: { familyRecord: boolean | null; administrative: boolean; personal: boolean; sensitive: boolean; uniqueId: boolean };
  evidence: Evidence[];
  evidenceSample?: EvidenceSample | null;
  confirmed: true;
}
export interface SubmissionRegion {
  code: string;
  districtCode: string;
  name: string;
}
export interface SubmissionSummary {
  id: string;
  submissionNumber: string;
  submittedAt: string;
  beneficiaryName: string;
  applicationType: ApplicationType;
  region: SubmissionRegion;
  revision: number;
  status: 'SUBMITTED' | 'CHANGES_REQUESTED';
}
export interface Submission extends SubmissionSummary {
  form: ApplicationForm;
  evidenceSource: 'SAMPLE' | 'UPLOAD' | null;
  correctionReason: string | null;
  latest: boolean;
  revisions: { revision: number; submittedAt: string }[];
}
export interface FormPreviews {
  application: string;
  privacyConsent: string;
}

export const VERIFICATION_FIELDS = {
  name: '성명', birthDate: '생년월일', demoId: '가상 식별자', address: '주소',
} as const;
export type VerificationField = keyof typeof VERIFICATION_FIELDS;
export type ComparisonStatus = 'MATCH' | 'DIFFERENT' | 'NEEDS_REVIEW';
export type Observations = Record<VerificationField, { value: string | null; confidence: number }>;

export interface ComparisonRow {
  field: VerificationField;
  submitted: string;
  scanned: string | null;
  reference: string | null;
  confidence: number;
  evidenceResult: ComparisonStatus;
  referenceResult: ComparisonStatus | null;
}

export interface ReviewInput {
  value: string | null;
  note: string;
}

interface ManualReview extends ReviewInput {
  result: ComparisonStatus;
  reviewer: string;
  reviewedAt: string;
}

export interface Verification {
  id: number;
  comparedAt: string;
  rows: ComparisonRow[];
  reviews: Partial<Record<VerificationField, ManualReview>>;
}

export const APPLICATION_TYPES: Record<ApplicationType, string> = {
  SELF: '본인 신청', FAMILY: '가족 대리 신청', GUARDIAN: '후견인 신청',
};
export const RELATIONSHIPS: Record<Relationship, string> = {
  SPOUSE: '배우자', PARENT: '부모', CHILD: '자녀', RELATIVE: '그 외의 친족', GUARDIAN: '후견인', OTHER: '기타',
};
export const CARE_NEEDS: Record<CareNeed, string> = {
  HEALTH: '건강·진료', MEAL: '식사', MOBILITY: '이동', DAILY: '일상생활', HOUSING: '주거',
};
export const EVIDENCE_LABELS: Record<Evidence, string> = {
  IDENTITY: '신청인 신분 확인', FAMILY_RELATION: '친족 관계 증빙',
  GUARDIANSHIP: '후견등기 증빙', RESIDENCE: '대상자 등본 확인',
};
export const EVIDENCE_SAMPLES: Record<EvidenceSample, string> = {
  BENEFICIARY_A: '가상 대상자 확인서',
  ADDRESS_DIFFERENT: '주소가 다른 가상 확인서',
  ID_BLURRY: '식별자가 흐릿한 가상 확인서',
};
export const EVIDENCE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const EVIDENCE_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const DOCUMENTS: Record<DocumentKind, string> = {
  application: '통합지원 신청서', 'privacy-consent': '개인정보 수집·이용 동의서',
};

export function getRegions(signal: AbortSignal) {
  return apiRequest<SubmissionRegion[]>('/application-regions', { signal });
}
export function getApplicantProfile(signal: AbortSignal) {
  return apiRequest<{ region: SubmissionRegion; beneficiary: Beneficiary } | null>('/applicant-profile', { signal });
}

export function previewForms(form: ApplicationForm) {
  return apiRequest<FormPreviews>('/applications/preview', { method: 'POST', body: form });
}
function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new ApiError(422, 'VALIDATION_ERROR', '가상 증빙 사진을 다시 선택해 주세요.', 'evidencePhoto'));
    reader.readAsDataURL(file);
  });
}

export async function submitApplication(
  form: ApplicationForm, key: string, photo: File | null,
  revision?: { id: string; revision: number; retainEvidence: boolean },
) {
  const endpoint = revision ? `/applications/${encodeURIComponent(revision.id)}/revisions` as const : '/applications';
  const evidencePhoto = photo ? await readPhoto(photo) : undefined;
  const body = revision
    ? { ...form, revision: revision.revision, retainEvidence: revision.retainEvidence, evidencePhoto }
    : { ...form, evidencePhoto };
  return apiRequest<Submission>(endpoint, {
    method: 'POST', body,
    headers: { 'Idempotency-Key': key },
  });
}
export function getSubmissions(audience: SubmissionAudience, page: number, signal: AbortSignal) {
  const endpoint = audience === 'staff' ? '/intake' : '/applications';
  return apiRequest<Page<SubmissionSummary>>(endpoint + '?page=' + page as `/${string}`, { signal });
}
export function getSubmission(audience: SubmissionAudience, id: string, signal: AbortSignal, revision?: number) {
  const endpoint = audience === 'staff' ? '/intake/' : '/applications/';
  return apiRequest<Submission>(endpoint + encodeURIComponent(id) + revisionQuery(revision) as `/${string}`, { signal });
}
export function requestCorrection(id: string, revision: number, reason: string) {
  return apiRequest<Submission>(`/intake/${encodeURIComponent(id)}/corrections`, {
    method: 'POST', body: { revision, reason },
  });
}

const revisionQuery = (revision?: number) => revision ? `?revision=${revision}` : '';

export function documentUrl(id: string, kind: DocumentKind, revision: number) {
  return '/api/v1/applications/' + encodeURIComponent(id) + '/documents/' + kind + revisionQuery(revision);
}

export function evidenceUrl(id: string, revision: number) {
  return '/api/v1/applications/' + encodeURIComponent(id) + '/evidence' + revisionQuery(revision);
}

export function getVerification(id: string, revision: number, signal: AbortSignal) {
  return apiRequest<Verification | null>(`/intake/${encodeURIComponent(id)}/verification${revisionQuery(revision)}`, { signal });
}

export function recordVerification(id: string, revision: number, readings: Observations) {
  return apiRequest<Verification>(`/intake/${encodeURIComponent(id)}/verification${revisionQuery(revision)}`, { method: 'POST', body: readings });
}

export function saveVerificationReview(id: string, attempt: number, field: VerificationField, review: ReviewInput) {
  return apiRequest<Verification>(`/intake/${encodeURIComponent(id)}/verification/${attempt}/review`, {
    method: 'PUT', body: { field, ...review },
  });
}
