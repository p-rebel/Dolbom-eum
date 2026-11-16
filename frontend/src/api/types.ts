// D-04 API 계약의 요청·응답 타입. 필드명과 값은 docs/design/D-04_api.md를 따른다.

export type Role = 'TOWN' | 'DISTRICT' | 'APPLICANT';

export interface Account {
  id: string;
  displayName: string;
  role: Role;
  districtCode: string | null;
  townCode: string | null;
}

export interface Region {
  districtCode: string;
  townCode: string;
  sido: string;
  sigungu: string;
}

export interface DemoProfile {
  code: string;
  beneficiaryName: string;
  applicantName: string;
  noticeRecipientName: string;
  region: Region;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type CaseStatus =
  | 'RECEIVED'
  | 'SCREENED'
  | 'ASSESSED'
  | 'PLAN_DRAFTED'
  | 'PLAN_CONFIRMED'
  | 'SERVICE_TRACKING'
  | 'FIRST_MONITORING_RECORDED';

export type NoticeMethod = 'SMS' | 'MAIL';
export type ContactMethod = 'PHONE' | 'VISIT';
export type LinkageMethod = 'DEPARTMENT_REFERRAL' | 'PROVIDER_REFERRAL' | 'PERSON_GUIDANCE';
export type DeliveryStatus = 'UNKNOWN' | 'IN_USE' | 'NOT_STARTED' | 'DECLINED';
export type Condition = 'UNCHANGED' | 'IMPROVED' | 'WORSENED';

export type ActionCode =
  | 'RECEIVE'
  | 'RECORD_SCREENING'
  | 'RECORD_ASSESSMENT'
  | 'SAVE_DRAFT'
  | 'CONFIRM_PLAN'
  | 'RECORD_NOTICE'
  | 'RECORD_LINKAGE'
  | 'RECORD_DELIVERY'
  | 'RECORD_MONITORING';

export interface CaseSummary {
  id: string;
  receiptNumber: string;
  beneficiaryName: string;
  receivedOn: string;
  status: CaseStatus;
  version: number;
  region: Region;
}

export interface CatalogItem {
  id: string;
  datasetVersion: string;
  programName: string | null;
  providerName: string | null;
  providerAddress: string | null;
  providerPhone: string | null;
  categoryLarge: string | null;
  categoryMiddle: string | null;
  sido: string | null;
  sigungu: string | null;
  sigunguGu: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  referenceDate: string | null;
}

export interface CatalogFilters {
  sidos: string[];
  sigungus: string[];
  categoriesLarge: string[];
}

export interface Screening {
  screenedOn: string;
  method: ContactMethod;
  outcome: 'NHIS_ASSESSMENT_REQUIRED';
}

export interface Assessment {
  assessedOn: string;
  resultReceivedOn: string;
  outcome: 'SUPPORT_PLAN_REQUIRED';
}

export interface Linkage {
  linkedOn: string;
  method: LinkageMethod;
  destinationLabel: string | null;
}

export interface Delivery {
  observedOn: string;
  status: DeliveryStatus;
  reason: string | null;
}

export interface PlanItem {
  id: string;
  catalog: CatalogItem;
  linkage: Linkage | null;
  delivery: Delivery | null;
}

export interface Plan {
  preparedOn: string;
  goal: string;
  items: PlanItem[];
  confirmation: { meetingOn: string; outcome: 'APPROVED' } | null;
  notice: { announcedOn: string } | null;
}

export interface Observation {
  itemId: string;
  status: DeliveryStatus;
  reason: string | null;
}

export interface Monitoring {
  monitoredOn: string;
  method: ContactMethod;
  condition: Condition;
  reviewNeeded: boolean;
  reviewReason: string | null;
  observations: Observation[];
}

export interface CaseEvent {
  id: string;
  action: ActionCode;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  actorDisplayName: string;
  actorRole: Role;
  recordedAt: string;
  version: number;
  itemId: string | null;
  summary: string;
}

export interface AllowedAction {
  action: ActionCode;
  itemId: string | null;
}

export interface CaseDetail extends CaseSummary {
  profile: DemoProfile;
  noticeMethod: NoticeMethod;
  evidenceChecked: boolean;
  screening: Screening | null;
  assessment: Assessment | null;
  plan: Plan | null;
  monitoring: Monitoring | null;
  events: CaseEvent[];
  allowedActions: AllowedAction[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field: string | null;
  };
}
