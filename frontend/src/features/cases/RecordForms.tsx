import { useRef, useState, type FormEvent } from 'react';
import { recordAssessment, recordScreening } from '../../api/cases';
import { ASSESSMENT_OUTCOME_LABEL, CONTACT_METHOD_LABEL, SCREENING_OUTCOME_LABEL } from '../../api/labels';
import type { CaseDetail, ContactMethod } from '../../api/types';
import { useConfirm } from '../../components/ConfirmDialog';
import { FormMessage } from '../../components/Feedback';
import { RadioGroup, RequiredNotice } from '../../components/FormFields';
import { DateField } from '../../components/DateField';
import { checkDate, minDate } from '../../dates';
import { useUnsavedChanges } from '../../router';
import type { SaveHandlers } from './CaseDetailPage';
import { useFieldErrors } from './fieldErrors';
import { interpretSaveError } from './saveErrors';

type Props = { detail: CaseDetail } & SaveHandlers;

/** 읍면동 사전조사 기록(RECORD_SCREENING). C-01의 결과는 ‘통합판정조사군’ 하나다. */
export function ScreeningForm({ detail, onSaved, onReload }: Props) {
  const [screenedOn, setScreenedOn] = useState('');
  const [method, setMethod] = useState<ContactMethod | ''>('');
  const { errors, setErrors, clearError, message, setMessage } = useFieldErrors<'screenedOn' | 'method'>();
  const [saving, setSaving] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const methodRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  useUnsavedChanges(screenedOn !== '' || method !== '');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const next: typeof errors = {};
    next.screenedOn = checkDate(screenedOn, {
      required: '조사일을 입력해 주세요.',
      notBefore: { date: detail.receivedOn, label: '접수일' },
    });
    if (!method) next.method = '조사 방법을 선택해 주세요.';
    setErrors(next);
    if (next.screenedOn || next.method) {
      setMessage('입력값을 확인해 주세요.', true);
      (next.screenedOn ? dateRef : methodRef).current?.focus();
      return;
    }
    const ok = await confirm.ask({
      title: '사전조사를 저장할까요?',
      rows: [
        ['조사일', screenedOn],
        ['조사 방법', CONTACT_METHOD_LABEL[method as ContactMethod]],
        ['조사 결과', SCREENING_OUTCOME_LABEL.NHIS_ASSESSMENT_REQUIRED],
      ],
      confirmLabel: '사전조사 저장',
    });
    if (!ok) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await recordScreening(detail.id, {
        version: detail.version,
        screenedOn,
        method: method as ContactMethod,
        outcome: 'NHIS_ASSESSMENT_REQUIRED',
      });
      onSaved(saved, '사전조사를 저장했습니다.');
    } catch (error) {
      setSaving(false);
      const result = interpretSaveError(error);
      if (result.field?.root === 'screenedOn' || result.field?.root === 'method') {
        setErrors({ [result.field.root]: result.field.message });
        (result.field.root === 'screenedOn' ? dateRef : methodRef).current?.focus();
        setMessage(result.message, true);
      } else {
        setMessage(result.message);
      }
      if (result.reload) onReload(result.message);
    }
  }

  return (
    <form className="form-stack record-form" onSubmit={handleSubmit} noValidate aria-label="사전조사 기록">
      <RequiredNotice />
      {message && <FormMessage tone="error">{message}</FormMessage>}
      {confirm.dialog}
      <DateField
        id="screened-on"
        label="조사일"
        hint={`접수일(${detail.receivedOn})과 같거나 이후 날짜`}
        min={minDate(detail.receivedOn)}
        value={screenedOn}
        onChange={(value) => { setScreenedOn(value); clearError('screenedOn'); }}
        error={errors.screenedOn}
        inputRef={dateRef}
      />
      <RadioGroup
        name="screening-method"
        legend="조사 방법"
        value={method}
        options={(['VISIT', 'PHONE'] as const).map((value) => ({ value, label: CONTACT_METHOD_LABEL[value] }))}
        onChange={(value) => { setMethod(value); clearError('method'); }}
        error={errors.method}
        firstInputRef={methodRef}
      />
      <dl className="info-list">
        <div>
          <dt>조사 결과</dt>
          <dd>{SCREENING_OUTCOME_LABEL.NHIS_ASSESSMENT_REQUIRED}</dd>
        </div>
      </dl>
      <div className="form-actions">
        <button type="submit" className="krds-btn xlarge primary" disabled={saving}>
          {saving ? '저장 중…' : '사전조사 저장'}
        </button>
      </div>
    </form>
  );
}

/** 시군구 판정 결과 기록(RECORD_ASSESSMENT). 가상 판정일과 시군구 수신일을 구분해 입력한다. */
export function AssessmentForm({ detail, onSaved, onReload }: Props) {
  const [assessedOn, setAssessedOn] = useState('');
  const [resultReceivedOn, setResultReceivedOn] = useState('');
  const { errors, setErrors, clearError, message, setMessage } = useFieldErrors<'assessedOn' | 'resultReceivedOn'>();
  const [saving, setSaving] = useState(false);
  const assessedRef = useRef<HTMLInputElement>(null);
  const receivedRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  useUnsavedChanges(assessedOn !== '' || resultReceivedOn !== '');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const next: typeof errors = {};
    next.assessedOn = checkDate(assessedOn, {
      required: '판정일을 입력해 주세요.',
      notBefore: { date: detail.screening?.screenedOn, label: '조사일' },
    });
    next.resultReceivedOn = checkDate(resultReceivedOn, {
      required: '판정 수신일을 입력해 주세요.',
      notBefore: { date: assessedOn, label: '판정일' },
    });
    setErrors(next);
    if (next.assessedOn || next.resultReceivedOn) {
      setMessage('입력값을 확인해 주세요.', true);
      (next.assessedOn ? assessedRef : receivedRef).current?.focus();
      return;
    }
    const ok = await confirm.ask({
      title: '판정 결과를 저장할까요?',
      rows: [
        ['가상 판정일', assessedOn],
        ['판정 수신일', resultReceivedOn],
        ['판정 결과', ASSESSMENT_OUTCOME_LABEL.SUPPORT_PLAN_REQUIRED],
      ],
      confirmLabel: '판정 결과 저장',
    });
    if (!ok) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await recordAssessment(detail.id, {
        version: detail.version,
        assessedOn,
        resultReceivedOn,
        outcome: 'SUPPORT_PLAN_REQUIRED',
      });
      onSaved(saved, '판정 결과를 저장했습니다.');
    } catch (error) {
      setSaving(false);
      const result = interpretSaveError(error);
      if (result.field?.root === 'assessedOn' || result.field?.root === 'resultReceivedOn') {
        setErrors({ [result.field.root]: result.field.message });
        (result.field.root === 'assessedOn' ? assessedRef : receivedRef).current?.focus();
        setMessage(result.message, true);
      } else {
        setMessage(result.message);
      }
      if (result.reload) onReload(result.message);
    }
  }

  return (
    <form className="form-stack record-form" onSubmit={handleSubmit} noValidate aria-label="판정 결과 기록">
      <RequiredNotice />
      {message && <FormMessage tone="error">{message}</FormMessage>}
      {confirm.dialog}
      <DateField
        id="assessed-on"
        label="가상 판정일"
        hint={detail.screening ? `조사일(${detail.screening.screenedOn})과 같거나 이후 날짜` : undefined}
        min={minDate(detail.screening?.screenedOn)}
        value={assessedOn}
        onChange={(value) => { setAssessedOn(value); clearError('assessedOn'); }}
        error={errors.assessedOn}
        inputRef={assessedRef}
      />
      <DateField
        id="result-received-on"
        label="판정 수신일"
        hint="판정일과 같거나 이후 날짜"
        min={minDate(detail.screening?.screenedOn, assessedOn)}
        value={resultReceivedOn}
        onChange={(value) => { setResultReceivedOn(value); clearError('resultReceivedOn'); }}
        error={errors.resultReceivedOn}
        inputRef={receivedRef}
      />
      <dl className="info-list">
        <div>
          <dt>판정 결과</dt>
          <dd>{ASSESSMENT_OUTCOME_LABEL.SUPPORT_PLAN_REQUIRED}</dd>
        </div>
      </dl>
      <div className="form-actions">
        <button type="submit" className="krds-btn xlarge primary" disabled={saving}>
          {saving ? '저장 중…' : '판정 결과 저장'}
        </button>
      </div>
    </form>
  );
}
