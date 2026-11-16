import { useRef, useState, type FormEvent } from 'react';
import { getDemoProfiles, receiveCase, type ReceiveInput } from '../../api/cases';
import { ApiError, newRequestKey } from '../../api/client';
import { NOTICE_METHOD_LABEL } from '../../api/labels';
import type { NoticeMethod } from '../../api/types';
import { useAccount } from '../../auth/AuthContext';
import { ErrorBlock, FormMessage, LoadingBlock } from '../../components/Feedback';
import { CheckboxField, RadioGroup, RequiredNotice, SelectField } from '../../components/FormFields';
import { DateField } from '../../components/DateField';
import { checkDate } from '../../dates';
import { setFlash } from '../../flash';
import { useApiData } from '../../hooks/useApiData';
import { PageHead } from '../../layout/PageHead';
import { Link, navigate, useUnsavedChanges } from '../../router';
import { useFieldErrors } from './fieldErrors';
import { siteText } from '../../siteConfig';

const CRUMBS = [{ label: '신청 목록', to: '/cases' }];

type Field = 'profileCode' | 'receivedOn' | 'noticeMethod' | 'evidenceChecked';

/** UI-03 새 접수. 읍면동 담당자가 가상 프로필을 골라 신청을 접수한다. */
export function NewCasePage() {
  const account = useAccount();
  if (account.role !== 'TOWN') {
    return (
      <div className="inner page">
        <PageHead parents={CRUMBS} title="새 접수" />
        <ErrorBlock message="신청 접수는 읍면동 담당자만 할 수 있습니다.">
          <Link to="/cases" className="krds-btn medium secondary">
            신청 목록으로
          </Link>
        </ErrorBlock>
      </div>
    );
  }
  return <NewCaseForm />;
}

function NewCaseForm() {
  const profiles = useApiData((signal) => getDemoProfiles(signal), []);
  const [profileCode, setProfileCode] = useState('');
  const [receivedOn, setReceivedOn] = useState('');
  const [noticeMethod, setNoticeMethod] = useState<NoticeMethod | ''>('');
  const [evidenceChecked, setEvidenceChecked] = useState(false);
  const { errors, setErrors, clearError, message, setMessage } = useFieldErrors<Field>();
  const [submitting, setSubmitting] = useState(false);
  /** 결과를 알 수 없는 요청. 같은 키와 본문으로 재시도한다(D-02). */
  const [uncertain, setUncertain] = useState<{ key: string; body: ReceiveInput } | null>(null);
  /** 요청 키 충돌(409). 신청 목록에서 기존 접수를 확인하게 한다(D-02:68). */
  const [conflict, setConflict] = useState(false);
  const refs = {
    profileCode: useRef<HTMLSelectElement>(null),
    receivedOn: useRef<HTMLInputElement>(null),
    noticeMethod: useRef<HTMLInputElement>(null),
    evidenceChecked: useRef<HTMLInputElement>(null),
  };

  const profile = profiles.data?.items.find((item) => item.code === profileCode);
  useUnsavedChanges(profileCode !== '' || receivedOn !== '' || noticeMethod !== '' || evidenceChecked);

  function focus(field: Field) {
    refs[field].current?.focus();
  }

  async function submit(key: string, body: ReceiveInput) {
    setSubmitting(true);
    setMessage(null);
    try {
      const detail = await receiveCase(body, key);
      setFlash(`신청을 접수했습니다. 접수번호 ${detail.receiptNumber}`);
      // 저장이 끝났으므로 확인 없이 상세로 이동한다.
      navigate(`/cases/${detail.id}`, { force: true });
    } catch (error) {
      setSubmitting(false);
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) {
        setUncertain({ key, body });
        setMessage('접수 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도하면 중복 없이 접수 여부를 확인합니다.');
        return;
      }
      setUncertain(null);
      setConflict(error.code === 'IDEMPOTENCY_CONFLICT');
      if (error.status === 422 && error.field && error.field in refs) {
        const field = error.field as Field;
        setErrors({ [field]: error.message });
        setMessage(`입력값을 확인해 주세요. ${error.message}`, true);
        focus(field);
      } else if (error.code === 'IDEMPOTENCY_CONFLICT') {
        setMessage('같은 요청으로 다른 접수 내용이 이미 저장되었습니다. 신청 목록에서 기존 접수 여부를 확인해 주세요.');
      } else {
        setMessage(error.message);
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    // 앞 요청의 결과를 모르는 동안에는 입력을 잠그고, 같은 키·본문으로만 다시 보낸다(D-02:71).
    // 새 키로 보내면 첫 요청이 이미 저장된 경우 접수가 두 건이 된다.
    if (uncertain) {
      void submit(uncertain.key, uncertain.body);
      return;
    }
    const next: Partial<Record<Field, string>> = {};
    if (!profileCode) next.profileCode = siteText('가상 프로필을 선택해 주세요.', '대상자 프로필을 선택해 주세요.');
    next.receivedOn = checkDate(receivedOn, { required: '접수일을 입력해 주세요.' });
    if (!noticeMethod) next.noticeMethod = '안내방식을 선택해 주세요.';
    if (!evidenceChecked) next.evidenceChecked = '증빙 서류 확인 후 체크해 주세요.';
    setErrors(next);
    const firstInvalid = (['profileCode', 'receivedOn', 'noticeMethod', 'evidenceChecked'] as const).find((field) => next[field]);
    if (firstInvalid) {
      setMessage('입력값을 확인해 주세요.', true);
      focus(firstInvalid);
      return;
    }
    // 입력을 바꾼 뒤의 새 요청은 새 키를 쓴다.
    void submit(newRequestKey(), { profileCode, receivedOn, noticeMethod: noticeMethod as NoticeMethod, evidenceChecked });
  }

  return (
    // KRDS 피그마 신청(입력폼)-1: 경로 표시는 쪽 왼쪽, 제목·입력 상자·버튼은 가운데 792px 열. 제출 버튼은 상자 아래.
    <div className="inner page form-page">
      <PageHead parents={CRUMBS} title="새 접수" />

      <form className="form-column" onSubmit={handleSubmit} noValidate aria-labelledby="new-case-form-title">
      {/* 이름은 바깥 form 랜드마크에만 둔다(같은 이름의 랜드마크가 겹치지 않게). */}
      <div className="form-box">
        <h2 id="new-case-form-title" className="section-title">
          접수 정보
        </h2>
        <RequiredNotice />
        {profiles.loading && <LoadingBlock label={siteText('가상 프로필을 불러오는 중입니다.', '대상자 프로필을 불러오는 중입니다.')} />}
        {profiles.error && <ErrorBlock message={profiles.error.message} onRetry={profiles.reload} />}
        {message && <FormMessage tone="error">{message}</FormMessage>}
        {conflict && (
          <p>
            <Link to="/cases" className="krds-btn medium secondary">
              신청 목록에서 기존 접수 확인
            </Link>
          </p>
        )}

        {profiles.data && (
            <fieldset className="form-lock" disabled={!!uncertain}>
              <legend>접수 입력</legend>
            <SelectField
              id="profile-code"
              label={siteText('가상 프로필', '대상자 프로필')}
              emptyOption="선택"
              value={profileCode}
              options={profiles.data.items.map((item) => ({ value: item.code, label: `${item.code} · ${item.beneficiaryName}` }))}
              onChange={(event) => { setProfileCode(event.target.value); clearError('profileCode'); }}
              error={errors.profileCode}
              selectRef={refs.profileCode}
            />

            {profile && (
              <dl className="info-list" aria-label={siteText('선택한 가상 프로필', '선택한 대상자 프로필')}>
                <div>
                  <dt>대상자</dt>
                  <dd>{profile.beneficiaryName}</dd>
                </div>
                <div>
                  <dt>대리 신청인</dt>
                  <dd>{profile.applicantName}</dd>
                </div>
                <div>
                  <dt>안내대상</dt>
                  <dd>{profile.noticeRecipientName}</dd>
                </div>
              </dl>
            )}

            <DateField
              id="received-on"
              label="접수일"
              hint="숫자만 입력해도 됩니다(예: 20261101 → 2026-11-01)"
              value={receivedOn}
              onChange={(value) => { setReceivedOn(value); clearError('receivedOn'); }}
              error={errors.receivedOn}
              inputRef={refs.receivedOn}
            />
            <RadioGroup
              name="notice-method"
              legend="안내방식"
              value={noticeMethod}
              options={(['SMS', 'MAIL'] as const).map((value) => ({ value, label: NOTICE_METHOD_LABEL[value] }))}
              onChange={(value) => { setNoticeMethod(value); clearError('noticeMethod'); }}
              error={errors.noticeMethod}
              firstInputRef={refs.noticeMethod}
            />
            <CheckboxField
              id="evidence-checked"
              label="증빙 서류를 확인했습니다"
              checked={evidenceChecked}
              onChange={(value) => { setEvidenceChecked(value); clearError('evidenceChecked'); }}
              error={errors.evidenceChecked}
              inputRef={refs.evidenceChecked}
            />
            </fieldset>
        )}
      </div>

        {profiles.data && (
          <div className="form-actions">
            <button type="submit" className="krds-btn xlarge primary" disabled={submitting}>
              {submitting ? '접수 중…' : uncertain ? '같은 내용으로 다시 시도' : '접수하기'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
