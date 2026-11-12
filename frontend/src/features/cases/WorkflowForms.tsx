// 작업 30~34: 계획 확정·안내(시군구), 항목별 연계·제공 현황(시군구), 최초 모니터링(읍면동) 입력.
// 규칙: D-02 신청 상세, D-04 업무 기록 API·필드 검증, D-05 날짜 순서, expected-results 표시 값.
import { useRef, useState, type FormEvent } from 'react';
import { confirmPlan, recordDelivery, recordLinkage, recordMonitoring, recordNotice } from '../../api/cases';
import {
  CONDITION_LABEL,
  CONTACT_METHOD_LABEL,
  DELIVERY_STATUS_LABEL,
  LINKAGE_METHOD_LABEL,
  MEETING_OUTCOME_LABEL,
  NOTICE_METHOD_LABEL,
  orMissing,
} from '../../api/labels';
import type { CaseDetail, Condition, ContactMethod, DeliveryStatus, LinkageMethod, PlanItem } from '../../api/types';
import { FormMessage } from '../../components/Feedback';
import { RadioGroup, RequiredNotice, SelectField, TextAreaField } from '../../components/FormFields';
import { TextField } from '../../components/TextField';
import { checkDate, minDate } from '../../dates';
import { useUnsavedChanges } from '../../router';
import type { SaveHandlers } from './CaseDetailPage';
import { interpretSaveError } from './saveErrors';

type Props = { detail: CaseDetail } & SaveHandlers;
type Errors = Record<string, string | undefined>;

const REASON_MAX = 200;
const DESTINATION_MAX = 80;
const REASON_REQUIRED: DeliveryStatus[] = ['NOT_STARTED', 'DECLINED'];

/**
 * 저장 폼 공통 처리: 화면 검사 → 첫 오류 칸으로 초점 → 저장 → 422는 해당 칸, 409·연결 실패는 최신 상세 재조회(D-02).
 * 서버 오류의 field 경로를 화면 칸 이름으로 바꾸려면 mapField를 넘긴다.
 */
function useSaveForm({ onSaved, onReload }: SaveHandlers) {
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const bind = (field: string) => (element: HTMLElement | null) => {
    refs.current[field] = element;
  };

  async function submit(options: {
    errors: Errors;
    order: string[];
    send: () => Promise<CaseDetail>;
    success: string;
    mapField?: (name: string) => string | undefined;
  }) {
    if (saving) return;
    setErrors(options.errors);
    const first = options.order.find((field) => options.errors[field]);
    if (first) {
      setMessage('입력값을 확인해 주세요.');
      refs.current[first]?.focus();
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await options.send();
      setSaving(false);
      onSaved(saved, options.success);
    } catch (error) {
      setSaving(false);
      const result = interpretSaveError(error);
      if (result.field) {
        const field = options.mapField?.(result.field.name) ?? result.field.root;
        if (options.order.includes(field)) {
          setErrors({ [field]: result.field.message });
          refs.current[field]?.focus();
        }
      }
      setMessage(result.message);
      if (result.reload) onReload(result.message);
    }
  }

  return { errors, message, saving, bind, submit };
}

/** 작업 30. 시군구 회의 결과와 계획 확정(CONFIRM_PLAN). 확정할 서비스 목록은 바로 위 계획 내용으로 재확인한다(D-02). */
export function ConfirmPlanForm({ detail, ...handlers }: Props) {
  const [meetingOn, setMeetingOn] = useState('');
  const form = useSaveForm(handlers);
  const preparedOn = detail.plan?.preparedOn;
  useUnsavedChanges(meetingOn !== '');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.submit({
      errors: { meetingOn: checkDate(meetingOn, { required: '회의일을 입력해 주세요.', notBefore: { date: preparedOn, label: '수립일' } }) },
      order: ['meetingOn'],
      send: () => confirmPlan(detail.id, { version: detail.version, meetingOn, outcome: 'APPROVED' }),
      success: '회의 결과를 기록하고 계획을 확정했습니다.',
    });
  }

  return (
    <form className="form-stack record-form" onSubmit={handleSubmit} noValidate aria-label="계획 확정">
      <RequiredNotice />
      {form.message && <FormMessage tone="error">{form.message}</FormMessage>}
      <p className="text-subtle">위에 저장된 서비스 {detail.plan?.items.length ?? 0}개를 회의 결과로 확정합니다.</p>
      <TextField
        id="meeting-on"
        label="회의일"
        type="date"
        hint={preparedOn ? `수립일(${preparedOn})과 같거나 이후 날짜` : undefined}
        min={minDate(preparedOn)}
        value={meetingOn}
        onChange={(event) => setMeetingOn(event.target.value)}
        error={form.errors.meetingOn}
        inputRef={form.bind('meetingOn')}
      />
      <dl className="info-list">
        <div>
          <dt>회의 결과</dt>
          <dd>{MEETING_OUTCOME_LABEL.APPROVED}</dd>
        </div>
      </dl>
      <div className="form-actions">
        <button type="submit" className="krds-btn xlarge primary" disabled={form.saving}>
          {form.saving ? '저장 중…' : '계획 확정'}
        </button>
      </div>
    </form>
  );
}

/** 작업 31. 시군구 계획 안내 기록(RECORD_NOTICE). 안내대상·방식은 접수 때 정한 값을 그대로 쓴다(D-05). */
export function NoticeForm({ detail, ...handlers }: Props) {
  const [announcedOn, setAnnouncedOn] = useState('');
  const form = useSaveForm(handlers);
  const meetingOn = detail.plan?.confirmation?.meetingOn;
  useUnsavedChanges(announcedOn !== '');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.submit({
      errors: { announcedOn: checkDate(announcedOn, { required: '안내일을 입력해 주세요.', notBefore: { date: meetingOn, label: '회의일' } }) },
      order: ['announcedOn'],
      send: () => recordNotice(detail.id, { version: detail.version, announcedOn }),
      success: '계획 안내를 기록했습니다.',
    });
  }

  return (
    <form className="form-stack record-form" onSubmit={handleSubmit} noValidate aria-label="계획 안내 기록">
      <RequiredNotice />
      {form.message && <FormMessage tone="error">{form.message}</FormMessage>}
      <dl className="info-list">
        <div>
          <dt>안내대상</dt>
          <dd>{detail.profile.noticeRecipientName}</dd>
        </div>
        <div>
          <dt>안내방식</dt>
          <dd>{NOTICE_METHOD_LABEL[detail.noticeMethod]}</dd>
        </div>
      </dl>
      <TextField
        id="announced-on"
        label="안내일"
        type="date"
        hint={meetingOn ? `회의일(${meetingOn})과 같거나 이후 날짜` : undefined}
        min={minDate(meetingOn)}
        value={announcedOn}
        onChange={(event) => setAnnouncedOn(event.target.value)}
        error={form.errors.announcedOn}
        inputRef={form.bind('announcedOn')}
      />
      <div className="form-actions">
        <button type="submit" className="krds-btn xlarge primary" disabled={form.saving}>
          {form.saving ? '저장 중…' : '안내 기록 저장'}
        </button>
      </div>
    </form>
  );
}

type ItemProps = Props & { item: PlanItem };

/** 작업 32. 항목별 연계 기록(RECORD_LINKAGE). 부서·공단 의뢰는 수신처 필수, 제공기관 의뢰는 기관명이 있는 행만(D-04·D-05). */
export function LinkageForm({ detail, item, ...handlers }: ItemProps) {
  const [linkedOn, setLinkedOn] = useState('');
  const [method, setMethod] = useState<LinkageMethod | ''>('');
  const [destination, setDestination] = useState('');
  const form = useSaveForm(handlers);
  const announcedOn = detail.plan?.notice?.announcedOn;
  const provider = item.catalog.providerName?.trim() ? item.catalog.providerName : null;
  const methods = (['DEPARTMENT_REFERRAL', 'PROVIDER_REFERRAL', 'PERSON_GUIDANCE'] as const).filter(
    (value) => value !== 'PROVIDER_REFERRAL' || provider,
  );
  useUnsavedChanges(linkedOn !== '' || method !== '' || destination !== '');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = destination.trim();
    void form.submit({
      errors: {
        linkedOn: checkDate(linkedOn, { required: '연계일을 입력해 주세요.', notBefore: { date: announcedOn, label: '안내일' } }),
        method: method ? undefined : '연계 방식을 선택해 주세요.',
        destinationLabel:
          method === 'DEPARTMENT_REFERRAL' && label === ''
            ? '수신처를 입력해 주세요.'
            : label.length > DESTINATION_MAX
              ? `수신처는 ${DESTINATION_MAX}자 이내로 입력해 주세요.`
              : undefined,
      },
      order: ['linkedOn', 'method', 'destinationLabel'],
      send: () =>
        recordLinkage(detail.id, item.id, {
          version: detail.version,
          linkedOn,
          method: method as LinkageMethod,
          destinationLabel: method === 'DEPARTMENT_REFERRAL' ? label : null,
        }),
      success: `${orMissing(item.catalog.programName)} 연계를 기록했습니다.`,
    });
  }

  return (
    <form className="form-stack record-form" onSubmit={handleSubmit} noValidate aria-label={`연계 기록: ${orMissing(item.catalog.programName)}`}>
      <RequiredNotice />
      {form.message && <FormMessage tone="error">{form.message}</FormMessage>}
      <TextField
        id={`linked-on-${item.id}`}
        label="연계일"
        type="date"
        hint={announcedOn ? `안내일(${announcedOn})과 같거나 이후 날짜` : undefined}
        min={minDate(announcedOn)}
        value={linkedOn}
        onChange={(event) => setLinkedOn(event.target.value)}
        error={form.errors.linkedOn}
        inputRef={form.bind('linkedOn')}
      />
      <RadioGroup
        name={`linkage-method-${item.id}`}
        legend="연계 방식"
        value={method}
        options={methods.map((value) => ({ value, label: LINKAGE_METHOD_LABEL[value] }))}
        onChange={setMethod}
        error={form.errors.method}
        firstInputRef={form.bind('method')}
      />
      {method === 'DEPARTMENT_REFERRAL' && (
        <TextField
          id={`destination-${item.id}`}
          label="수신처"
          hint={`담당 부서 또는 공단을 가상 수신처로 입력(${DESTINATION_MAX}자 이내)`}
          maxLength={DESTINATION_MAX}
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          error={form.errors.destinationLabel}
          inputRef={form.bind('destinationLabel')}
        />
      )}
      {method === 'PROVIDER_REFERRAL' && provider && (
        <dl className="info-list">
          <div>
            <dt>의뢰처</dt>
            <dd>{provider}</dd>
          </div>
        </dl>
      )}
      {method === 'PERSON_GUIDANCE' && (
        <dl className="info-list">
          <div>
            <dt>후보 제공기관</dt>
            <dd>{orMissing(provider)}</dd>
          </div>
        </dl>
      )}
      <div className="form-actions">
        <button type="submit" className="krds-btn xlarge primary" disabled={form.saving}>
          {form.saving ? '저장 중…' : '연계 저장'}
        </button>
      </div>
    </form>
  );
}

/** 작업 33. 항목별 제공 현황(RECORD_DELIVERY). 모니터링 전까지 갱신할 수 있다. 미개시·이용 거부는 사유 필수(D-04). */
export function DeliveryForm({ detail, item, ...handlers }: ItemProps) {
  const saved = item.delivery;
  const [observedOn, setObservedOn] = useState(saved?.observedOn ?? '');
  const [status, setStatus] = useState<DeliveryStatus | ''>(saved?.status ?? '');
  const [reason, setReason] = useState(saved?.reason ?? '');
  const form = useSaveForm(handlers);
  const linkedOn = item.linkage?.linkedOn;
  const reasonRequired = status !== '' && REASON_REQUIRED.includes(status);
  useUnsavedChanges(
    observedOn !== (saved?.observedOn ?? '') || status !== (saved?.status ?? '') || reason !== (saved?.reason ?? ''),
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = reason.trim();
    void form.submit({
      errors: {
        observedOn: checkDate(observedOn, { required: '확인일을 입력해 주세요.', notBefore: { date: linkedOn, label: '연계일' } }),
        status: status ? undefined : '제공 상태를 선택해 주세요.',
        reason: reasonRequired && text === '' ? '미개시·이용 거부는 사유를 입력해 주세요.' : undefined,
      },
      order: ['observedOn', 'status', 'reason'],
      send: () =>
        recordDelivery(detail.id, item.id, {
          version: detail.version,
          observedOn,
          status: status as DeliveryStatus,
          reason: text === '' ? null : text,
        }),
      success: `${orMissing(item.catalog.programName)} 제공 현황을 저장했습니다.`,
    });
  }

  return (
    <form className="form-stack record-form" onSubmit={handleSubmit} noValidate aria-label={`제공 현황: ${orMissing(item.catalog.programName)}`}>
      <RequiredNotice />
      {form.message && <FormMessage tone="error">{form.message}</FormMessage>}
      <TextField
        id={`observed-on-${item.id}`}
        label="확인일"
        type="date"
        hint={linkedOn ? `연계일(${linkedOn})과 같거나 이후 날짜` : undefined}
        min={minDate(linkedOn)}
        value={observedOn}
        onChange={(event) => setObservedOn(event.target.value)}
        error={form.errors.observedOn}
        inputRef={form.bind('observedOn')}
      />
      <RadioGroup
        name={`delivery-status-${item.id}`}
        legend="제공 상태"
        value={status}
        options={(['IN_USE', 'UNKNOWN', 'NOT_STARTED', 'DECLINED'] as const).map((value) => ({ value, label: DELIVERY_STATUS_LABEL[value] }))}
        onChange={setStatus}
        error={form.errors.status}
        firstInputRef={form.bind('status')}
      />
      <TextAreaField
        id={`delivery-reason-${item.id}`}
        label="사유"
        optional={!reasonRequired}
        hint={reasonRequired ? '미개시·이용 거부는 사유가 필요합니다.' : undefined}
        maxLength={REASON_MAX}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={form.errors.reason}
        textareaRef={form.bind('reason')}
      />
      <div className="form-actions">
        <button type="submit" className="krds-btn xlarge primary" disabled={form.saving}>
          {form.saving ? '저장 중…' : '제공 현황 저장'}
        </button>
      </div>
    </form>
  );
}

type ObservationInput = { status: DeliveryStatus | ''; reason: string };

/**
 * 작업 34. 읍면동 최초 모니터링(RECORD_MONITORING). 기존 제공 현황을 보면서 새로 확인한 항목만 상태·사유를 입력한다.
 * ‘후속 검토 필요’를 고르면 바로 아래에 사유 입력란을 필수로 표시한다(D-02).
 */
export function MonitoringForm({ detail, ...handlers }: Props) {
  const items = detail.plan?.items ?? [];
  const [monitoredOn, setMonitoredOn] = useState('');
  const [method, setMethod] = useState<ContactMethod | ''>('');
  const [condition, setCondition] = useState<Condition | ''>('');
  const [review, setReview] = useState<'no' | 'yes' | ''>('');
  const [reviewReason, setReviewReason] = useState('');
  const [observations, setObservations] = useState<Record<string, ObservationInput>>({});
  const form = useSaveForm(handlers);
  const lastObserved = minDate(...items.map((item) => item.delivery?.observedOn));
  useUnsavedChanges(
    monitoredOn !== '' || method !== '' || condition !== '' || review !== '' || reviewReason !== '' ||
      Object.values(observations).some((value) => value.status !== ''),
  );

  const observation = (itemId: string) => observations[itemId] ?? { status: '', reason: '' };
  const setObservation = (itemId: string, next: Partial<ObservationInput>) =>
    setObservations((current) => ({ ...current, [itemId]: { ...observation(itemId), ...current[itemId], ...next } }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sent = items
      .filter((item) => observation(item.id).status !== '')
      .map((item) => ({ itemId: item.id, status: observation(item.id).status as DeliveryStatus, reason: observation(item.id).reason.trim() }));
    const errors: Errors = {
      monitoredOn: checkDate(monitoredOn, {
        required: '모니터링 기록일을 입력해 주세요.',
        notBefore: { date: lastObserved, label: '마지막 제공 확인일' },
      }),
      method: method ? undefined : '확인 방법을 선택해 주세요.',
      condition: condition ? undefined : '상태 변화를 선택해 주세요.',
      reviewNeeded: review ? undefined : '후속 검토 여부를 선택해 주세요.',
      reviewReason:
        review === 'yes' && reviewReason.trim() === '' ? '후속 검토 사유를 입력해 주세요.' : undefined,
    };
    for (const entry of sent) {
      if (REASON_REQUIRED.includes(entry.status) && entry.reason === '') {
        errors[`obs:${entry.itemId}`] = '미개시·이용 거부는 사유를 입력해 주세요.';
      }
    }
    void form.submit({
      errors,
      order: ['monitoredOn', 'method', 'condition', 'reviewNeeded', 'reviewReason', ...items.map((item) => `obs:${item.id}`)],
      send: () =>
        recordMonitoring(detail.id, {
          version: detail.version,
          monitoredOn,
          method: method as ContactMethod,
          condition: condition as Condition,
          reviewNeeded: review === 'yes',
          reviewReason: review === 'yes' ? reviewReason.trim() : null,
          observations: sent.map((entry) => ({ ...entry, reason: entry.reason === '' ? null : entry.reason })),
        }),
      success: '최초 모니터링을 기록했습니다.',
      // 서버의 observations.0.reason은 보낸 배열의 순번이므로 해당 항목 칸으로 바꾼다.
      mapField: (name) => {
        const match = /^observations\.(\d+)/.exec(name);
        const entry = match ? sent[Number(match[1])] : undefined;
        return entry ? `obs:${entry.itemId}` : undefined;
      },
    });
  }

  return (
    <form className="form-stack record-form" onSubmit={handleSubmit} noValidate aria-label="최초 모니터링 기록">
      <RequiredNotice />
      {form.message && <FormMessage tone="error">{form.message}</FormMessage>}
      <TextField
        id="monitored-on"
        label="모니터링 기록일"
        type="date"
        hint={lastObserved ? `마지막 제공 확인일(${lastObserved})과 같거나 이후 날짜` : undefined}
        min={minDate(lastObserved)}
        value={monitoredOn}
        onChange={(event) => setMonitoredOn(event.target.value)}
        error={form.errors.monitoredOn}
        inputRef={form.bind('monitoredOn')}
      />
      <RadioGroup
        name="monitoring-method"
        legend="확인 방법"
        value={method}
        options={(['VISIT', 'PHONE'] as const).map((value) => ({ value, label: CONTACT_METHOD_LABEL[value] }))}
        onChange={setMethod}
        error={form.errors.method}
        firstInputRef={form.bind('method')}
      />
      <RadioGroup
        name="monitoring-condition"
        legend="상태 변화"
        value={condition}
        options={(['UNCHANGED', 'IMPROVED', 'WORSENED'] as const).map((value) => ({ value, label: CONDITION_LABEL[value] }))}
        onChange={setCondition}
        error={form.errors.condition}
        firstInputRef={form.bind('condition')}
      />

      <div className="form-group">
        <h3 className="sub-title">서비스별 확인</h3>
        <p className="text-subtle">새로 확인한 항목만 고릅니다. 고르지 않으면 기존 제공 현황을 그대로 씁니다.</p>
        <ol className="plan-item-list">
          {items.map((item) => {
            const value = observation(item.id);
            const needReason = value.status !== '' && REASON_REQUIRED.includes(value.status);
            return (
              <li key={item.id} className="form-stack">
                <div>
                  <p className="plan-item-title">{orMissing(item.catalog.programName)}</p>
                  <p className="text-subtle">
                    기존 제공 현황 · {item.delivery ? DELIVERY_STATUS_LABEL[item.delivery.status] : '기록 전'}
                    {item.delivery?.reason ? ` · ${item.delivery.reason}` : ''}
                  </p>
                </div>
                <SelectField
                  id={`observation-${item.id}`}
                  label="모니터링 확인"
                  optional
                  emptyOption="기존 현황과 같음"
                  value={value.status}
                  options={(['IN_USE', 'UNKNOWN', 'NOT_STARTED', 'DECLINED'] as const).map((status) => ({ value: status, label: DELIVERY_STATUS_LABEL[status] }))}
                  onChange={(event) => setObservation(item.id, { status: event.target.value as DeliveryStatus | '' })}
                  error={value.status === '' || !needReason ? form.errors[`obs:${item.id}`] : undefined}
                  selectRef={value.status === '' || !needReason ? form.bind(`obs:${item.id}`) : undefined}
                />
                {value.status !== '' && (
                  <TextAreaField
                    id={`observation-reason-${item.id}`}
                    label="확인 사유"
                    optional={!needReason}
                    maxLength={REASON_MAX}
                    value={value.reason}
                    onChange={(event) => setObservation(item.id, { reason: event.target.value })}
                    error={needReason ? form.errors[`obs:${item.id}`] : undefined}
                    textareaRef={needReason ? form.bind(`obs:${item.id}`) : undefined}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <RadioGroup
        name="monitoring-review"
        legend="후속 검토"
        value={review}
        options={[
          { value: 'no' as const, label: '후속 검토 불필요' },
          { value: 'yes' as const, label: '후속 검토 필요' },
        ]}
        onChange={setReview}
        error={form.errors.reviewNeeded}
        firstInputRef={form.bind('reviewNeeded')}
      />
      {review === 'yes' && (
        <TextAreaField
          id="review-reason"
          label="후속 검토 사유"
          maxLength={REASON_MAX}
          value={reviewReason}
          onChange={(event) => setReviewReason(event.target.value)}
          error={form.errors.reviewReason}
          textareaRef={form.bind('reviewReason')}
        />
      )}
      <div className="form-actions">
        <button type="submit" className="krds-btn xlarge primary" disabled={form.saving}>
          {form.saving ? '저장 중…' : '최초 모니터링 저장'}
        </button>
      </div>
    </form>
  );
}
