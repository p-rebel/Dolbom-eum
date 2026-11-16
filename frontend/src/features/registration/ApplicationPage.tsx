import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, newRequestKey } from '../../api/client';
import {
  APPLICATION_TYPES, CARE_NEEDS, EVIDENCE_LABELS, EVIDENCE_PHOTO_MAX_BYTES, EVIDENCE_PHOTO_TYPES, EVIDENCE_SAMPLES, RELATIONSHIPS,
  evidenceUrl, getApplicantProfile, getRegions, getSubmission, previewForms, submitApplication,
  type ApplicationForm, type ApplicationType, type Beneficiary, type CareNeed,
  type DocumentKind, type Evidence, type EvidenceSample, type FormPreviews, type Person, type RelatedPerson, type Relationship, type Submission,
} from '../../api/registration';
import { ErrorBlock, FormMessage, LoadingBlock } from '../../components/Feedback';
import { CheckboxField, RadioGroup } from '../../components/FormFields';
import { TextField } from '../../components/TextField';
import { useApiData } from '../../hooks/useApiData';
import { Link, navigate, PageTitle, useUnsavedChanges } from '../../router';
import { DocumentViewer } from './DocumentViewer';

const EMPTY_PERSON: Person = { name: '', address: '', mobile: '' };
const EMPTY_BENEFICIARY: Beneficiary = { ...EMPTY_PERSON, demoId: '', birthDate: '', sex: null, residence: null };
const EMPTY_APPLICANT: RelatedPerson = { ...EMPTY_PERSON, relationship: 'CHILD' };
const FAMILY_RELATIONSHIPS = ['SPOUSE', 'PARENT', 'CHILD', 'RELATIVE'] as const;
const CAREGIVER_RELATIONSHIPS = [...FAMILY_RELATIONSHIPS, 'GUARDIAN', 'OTHER'] as const;
const STEP_NAMES = ['신청 정보', '동의와 증빙', '서류 확인·제출'];

const SAMPLE_BENEFICIARY: Beneficiary = {
  name: '가상 대상자 A', address: '가상 A시 돌봄로 10', mobile: '000-0000-0101',
  demoId: 'DEMO-ID-0101', birthDate: '1945-05-03', sex: 'FEMALE', residence: null,
};
const SAMPLE_APPLICANT: RelatedPerson = {
  name: '가상 신청인 B', address: '가상 A시 신청로 20', mobile: '000-0000-0202', relationship: 'CHILD',
};
const SAMPLE_CAREGIVER: RelatedPerson = {
  name: '가상 보호자 C', address: '가상 A시 보호로 30', mobile: '000-0000-0303', relationship: 'CHILD',
};
type ConsentField = keyof ApplicationForm['consents'];
const CONSENT_LABELS: Record<ConsentField, string> = {
  familyRecord: '친족 관계 확인을 위한 본인정보 제공',
  administrative: '행정정보 공동이용',
  personal: '개인정보의 제3자 제공',
  sensitive: '민감정보의 제3자 제공',
  uniqueId: '고유식별정보의 제3자 제공',
};
const EMPTY_CONSENTS: Record<ConsentField, boolean | null> = {
  familyRecord: null, administrative: null, personal: null, sensitive: null, uniqueId: null,
};
const CONSENT_CHOICES = [
  { value: 'yes', label: '동의함' }, { value: 'no', label: '동의하지 않음' },
];

function InputSelect({ id, label, children, value, onChange, required = true, disabled = false }: {
  id: string; label: string; children: ReactNode; value: string; onChange: (value: string) => void; required?: boolean; disabled?: boolean;
}) {
  return (
    <div className="form-group">
      <div className="form-tit"><label htmlFor={id}>{label}</label></div>
      <div className="form-conts">
        <select id={id} className="krds-form-select medium" value={value} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {children}
        </select>
      </div>
    </div>
  );
}

function PersonFields({ group, person, onChange }: { group: string; person: Person; onChange: (person: Person) => void }) {
  return (
    <div className="registration-fields">
      <TextField id={group + '-name'} label={group + ' 성명'} value={person.name} placeholder="가상 대상자 A" required
        maxLength={14} pattern="가상 [가-힣A-Za-z0-9 ]+"
        onChange={(event) => onChange({ ...person, name: event.target.value })} />
      <TextField id={group + '-mobile'} label={group + ' 연락처'} value={person.mobile} placeholder="000-0000-0101" required
        maxLength={13} type="tel" pattern="000-0000-[0-9]{4}"
        onChange={(event) => onChange({ ...person, mobile: event.target.value })} />
      <div className="registration-field-wide">
        <TextField id={group + '-address'} label={group + ' 주소'} value={person.address} placeholder="가상 A시 돌봄로 10"
          required maxLength={52} pattern="가상.+" onChange={(event) => onChange({ ...person, address: event.target.value })} />
      </div>
    </div>
  );
}

function RelatedFields({ group, person, relationships, onChange }: {
  group: string; person: RelatedPerson; relationships: readonly Relationship[]; onChange: (person: RelatedPerson) => void;
}) {
  return (
    <fieldset className="registration-form-section">
      <legend>{group} 정보</legend>
      <InputSelect id={group + '-relationship'} label="대상자와의 관계" value={person.relationship}
        onChange={(value) => onChange({ ...person, relationship: value as Relationship })}>
        {relationships.map((value) => <option key={value} value={value}>{RELATIONSHIPS[value]}</option>)}
      </InputSelect>
      <PersonFields group={group} person={person} onChange={(value) => onChange({ ...person, ...value })} />
    </fieldset>
  );
}

function choiceRequired(type: ApplicationType, consents: typeof EMPTY_CONSENTS): Evidence[] {
  const evidence: Evidence[] = [];
  if (type !== 'SELF') evidence.push('IDENTITY');
  if (type === 'GUARDIAN') evidence.push('GUARDIANSHIP');
  if (type === 'FAMILY' && consents.familyRecord === false) evidence.push('FAMILY_RELATION');
  if (consents.administrative === false) evidence.push('RESIDENCE');
  return evidence;
}

function pdfUrl(encoded: string) {
  const bytes = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}

function FormReview({ previews }: { previews: FormPreviews }) {
  const [urls, setUrls] = useState<Record<DocumentKind, string> | null>(null);
  useEffect(() => {
    const next = { application: pdfUrl(previews.application), 'privacy-consent': pdfUrl(previews.privacyConsent) };
    setUrls(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);
  return urls ? <DocumentViewer urls={urls} /> : <LoadingBlock label="서류를 여는 중" />;
}

export function ApplicantCorrectionPage({ id }: { id: string }) {
  const result = useApiData((signal) => getSubmission('applicant', id, signal), [id]);
  if (result.loading) return <LoadingBlock label="보완할 신청서를 불러오는 중" />;
  if (result.error) return <ErrorBlock message={result.error.message} onRetry={result.reload} />;
  if (result.data?.status !== 'CHANGES_REQUESTED') {
    return <div className="inner page">
      <PageTitle>보완 요청 내역</PageTitle>
      <p>현재 보완 요청이 없습니다.</p>
      <Link to={'/my/applications/' + id}>신청 상세로 돌아가기</Link>
    </div>;
  }
  return <ApplicationPage key={result.data.revision} revision={result.data} />;
}

export function ApplicationPage({ revision }: { revision?: Submission } = {}) {
  const previous = revision?.form;
  const regions = useApiData(getRegions, []);
  const profile = useApiData(getApplicantProfile, []);
  const [step, setStep] = useState(0);
  const [applicationType, setApplicationType] = useState<ApplicationType>(previous?.applicationType ?? 'SELF');
  const [regionCode, setRegionCode] = useState(previous?.regionCode ?? '');
  const [beneficiary, setBeneficiary] = useState<Beneficiary>(previous?.beneficiary ?? EMPTY_BENEFICIARY);
  const [applicant, setApplicant] = useState<RelatedPerson>(previous?.applicant ?? EMPTY_APPLICANT);
  const [caregiver, setCaregiver] = useState<RelatedPerson | null>(previous?.caregiver ?? null);
  const [noticeRecipient, setNoticeRecipient] = useState<ApplicationForm['noticeRecipient']>(previous?.noticeRecipient ?? 'BENEFICIARY');
  const [noticeMethod, setNoticeMethod] = useState<ApplicationForm['noticeMethod']>(previous?.noticeMethod ?? 'SMS');
  const [careNeeds, setCareNeeds] = useState<CareNeed[]>(previous?.careNeeds ?? []);
  const [consents, setConsents] = useState<Record<ConsentField, boolean | null>>(previous?.consents ?? EMPTY_CONSENTS);
  const [preparedEvidence, setPreparedEvidence] = useState<Evidence[]>(previous?.evidence ?? []);
  const [evidenceSample, setEvidenceSample] = useState<EvidenceSample | null>(previous?.evidenceSample ?? null);
  const hasPriorUpload = revision?.evidenceSource === 'UPLOAD';
  const [retainEvidence, setRetainEvidence] = useState(hasPriorUpload);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [prepared, setPrepared] = useState<{ form: ApplicationForm; photo: File | null; retainEvidence: boolean; key: string; previews: FormPreviews } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  useUnsavedChanges(dirty);

  useEffect(() => {
    if (step > 0) heading.current?.focus();
  }, [step]);

  useEffect(() => {
    const url = photo ? URL.createObjectURL(photo) : null;
    setPhotoUrl(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [photo]);

  const evidence = choiceRequired(applicationType, consents);
  const consentFields = (Object.keys(CONSENT_LABELS) as ConsentField[])
    .filter((field) => field !== 'familyRecord' || applicationType === 'FAMILY');

  function changeType(type: ApplicationType) {
    setApplicationType(type);
    setApplicant((person) => ({ ...person, relationship: type === 'GUARDIAN' ? 'GUARDIAN' : 'CHILD' }));
    setNoticeRecipient(type === 'SELF' ? 'BENEFICIARY' : 'APPLICANT');
    setConsents((value) => ({ ...value, familyRecord: null }));
    setPreparedEvidence([]);
  }

  function loadSample() {
    changeType('FAMILY');
    setBeneficiary(SAMPLE_BENEFICIARY);
    setApplicant(SAMPLE_APPLICANT);
    setCaregiver(SAMPLE_CAREGIVER);
    setCareNeeds(['MEAL', 'DAILY']);
    setEvidenceSample('BENEFICIARY_A');
    clearPhoto();
    setRegionCode(regions.data?.[0]?.code ?? '');
    setDirty(true);
  }

  function loadOwnProfile() {
    if (applicationType !== 'SELF' || !profile.data) return;
    setBeneficiary(profile.data.beneficiary);
    setRegionCode(profile.data.region.code);
    setDirty(true);
  }

  function clearPhoto() {
    if (photoInput.current) photoInput.current.value = '';
    setPhoto(null);
    setPhotoError(null);
  }

  function choosePhoto(file: File) {
    if (!file.size || file.size > EVIDENCE_PHOTO_MAX_BYTES
      || !(file.type ? EVIDENCE_PHOTO_TYPES.includes(file.type) : /\.(jpe?g|png|webp)$/i.test(file.name))) {
      if (photoInput.current) photoInput.current.value = '';
      setPhotoError('8MB 이하의 JPG, PNG, WebP 사진을 선택해 주세요.');
      return;
    }
    setPhoto(file);
    setRetainEvidence(false);
    setEvidenceSample(null);
    setPhotoError(null);
  }

  async function handleStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (step === 0) {
      if (!careNeeds.length) {
        setError('필요한 돌봄을 하나 이상 선택해 주세요.');
        document.getElementById('care-HEALTH')?.focus();
        return;
      }
      setStep(1);
      return;
    }

    if (step === 1) {
      if (photoError) return;
      const { familyRecord, administrative, personal, sensitive, uniqueId } = consents;
      if (!confirmed || administrative === null || personal === null || sensitive === null || uniqueId === null
        || (applicationType === 'FAMILY' && familyRecord === null)
        || evidence.some((item) => !preparedEvidence.includes(item))) {
        setError('동의 선택과 가상 증빙 준비를 확인해 주세요.');
        return;
      }
      const form: ApplicationForm = {
        applicationType, regionCode, beneficiary, applicant: applicationType === 'SELF' ? null : applicant, caregiver,
        noticeRecipient, noticeMethod, careNeeds, confirmed: true, evidence, evidenceSample,
        consents: { familyRecord, administrative, personal, sensitive, uniqueId },
      };
      setBusy(true);
      try {
        const previews = await previewForms(form);
        setPrepared({ form, photo, retainEvidence, key: newRequestKey(), previews });
        setStep(2);
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : '서류 미리보기를 만들지 못했습니다.');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!prepared) return;
    setBusy(true);
    try {
      const submission = await submitApplication(
        prepared.form, prepared.key, prepared.photo,
        revision && { id: revision.id, revision: revision.revision, retainEvidence: prepared.retainEvidence },
      );
      navigate('/my/applications/' + submission.id, { force: true });
    } catch (cause) {
      const pending = !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500;
      setUncertain(pending);
      setError(pending
        ? '제출 결과를 확인하지 못했습니다. 같은 서류로 다시 시도하면 중복 제출 없이 확인합니다.'
        : cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inner page registration-form-page">
      <PageTitle>{revision ? '보완 신청서 작성' : '돌봄 신청서 작성'}</PageTitle>
      {revision && <p className="registration-lead">{revision.submissionNumber} · 보완 요청 사유 {revision.correctionReason}</p>}
      <p className="registration-lead">가상 정보를 한 번 입력하면 공식 양식의 신청서와 동의서에 반영됩니다.</p>
      <ol className="registration-stepper" aria-label="신청 단계">
        {STEP_NAMES.map((name, index) => <li key={name} aria-current={index === step ? 'step' : undefined}>
          <span aria-hidden="true">{index + 1}</span>{name}
        </li>)}
      </ol>

      {regions.loading && <LoadingBlock label="신청 가능한 지역을 불러오는 중" />}
      {regions.error && <ErrorBlock message={regions.error.message} onRetry={regions.reload} />}
      {regions.data && (
        <form onSubmit={handleStep} onChange={() => setDirty(true)}>
          <fieldset className="registration-step-fields" disabled={busy}>
          {step === 0 && (
            <>
              <section className="registration-form-section">
                <div className="registration-section-title">
                  <h2>신청 대상과 유형</h2>
                  {!revision && <button type="button" className="krds-btn small secondary" onClick={loadSample}>가상 정보 불러오기</button>}
                </div>
                <div className="registration-fields">
                  <InputSelect id="application-type" label="신청 유형" value={applicationType} onChange={(value) => changeType(value as ApplicationType)}>
                    {Object.entries(APPLICATION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </InputSelect>
                  <InputSelect id="application-region" label="주소지 관할" value={regionCode} onChange={setRegionCode} disabled={Boolean(revision)}>
                    <option value="">관할 지역을 선택해 주세요</option>
                    {regions.data.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
                  </InputSelect>
                </div>
              </section>
              <fieldset className="registration-form-section">
                <legend>돌봄을 받는 분</legend>
                {!revision && applicationType === 'SELF' && profile.data && (
                  <button type="button" className="krds-btn small secondary" onClick={loadOwnProfile}>내정보로 채워넣기</button>
                )}
                <PersonFields group="대상자" person={beneficiary} onChange={(person) => setBeneficiary({ ...beneficiary, ...person })} />
                <div className="registration-fields">
                  <TextField id="demo-id" label="가상 식별자" value={beneficiary.demoId} placeholder="DEMO-ID-0101" required maxLength={26}
                    pattern="DEMO-[A-Z0-9]{2,12}(-[A-Z0-9]{1,8})?"
                    onChange={(event) => setBeneficiary({ ...beneficiary, demoId: event.target.value })} />
                  <TextField id="birth-date" label="가상 생년월일" type="date" value={beneficiary.birthDate} required
                    onChange={(event) => setBeneficiary({ ...beneficiary, birthDate: event.target.value })} />
                  <div className="form-group">
                    <label htmlFor="beneficiary-sex">성별 (선택)</label>
                    <select id="beneficiary-sex" className="krds-form-select medium" value={beneficiary.sex ?? ''}
                      onChange={(event) => setBeneficiary({ ...beneficiary, sex: (event.target.value || null) as Beneficiary['sex'] })}>
                      <option value="">선택 안 함</option><option value="FEMALE">여성</option><option value="MALE">남성</option>
                    </select>
                  </div>
                  <TextField id="residence" label="실거주지 (주소와 다른 경우)" value={beneficiary.residence ?? ''} maxLength={52} pattern="가상.+"
                    onChange={(event) => setBeneficiary({ ...beneficiary, residence: event.target.value || null })} />
                </div>
              </fieldset>
              {applicationType !== 'SELF' && <RelatedFields group="신청인" person={applicant}
                relationships={applicationType === 'GUARDIAN' ? ['GUARDIAN'] : FAMILY_RELATIONSHIPS} onChange={setApplicant} />}
              <div className="registration-caregiver">
                <CheckboxField id="separate-caregiver" label="돌봄을 맡은 보호자가 별도로 있습니다" checked={Boolean(caregiver)}
                  onChange={(checked) => setCaregiver(checked ? EMPTY_APPLICANT : null)} />
              </div>
              {caregiver && <RelatedFields group="보호자" person={caregiver} relationships={CAREGIVER_RELATIONSHIPS} onChange={setCaregiver} />}
              <fieldset className="registration-form-section">
                <legend>필요한 돌봄과 안내 방법</legend>
                <div className="registration-options">
                  {(Object.keys(CARE_NEEDS) as CareNeed[]).map((value) => <CheckboxField key={value} id={'care-' + value}
                    label={CARE_NEEDS[value]} checked={careNeeds.includes(value)}
                    onChange={(checked) => setCareNeeds(checked ? [...careNeeds, value] : careNeeds.filter((item) => item !== value))} />)}
                </div>
                <div className="registration-fields">
                  <InputSelect id="notice-recipient" label="안내 대상" value={noticeRecipient}
                    onChange={(value) => setNoticeRecipient(value as ApplicationForm['noticeRecipient'])}>
                    <option value="BENEFICIARY">대상자 본인</option>
                    {applicationType !== 'SELF' && <option value="APPLICANT">친족·후견인 신청자</option>}
                  </InputSelect>
                  <InputSelect id="notice-method" label="안내 방식" value={noticeMethod}
                    onChange={(value) => setNoticeMethod(value as ApplicationForm['noticeMethod'])}>
                    <option value="SMS">문자</option><option value="MAIL">우편</option>
                  </InputSelect>
                </div>
              </fieldset>
            </>
          )}

          {step === 1 && (
            <section className="registration-form-section">
              <h2 ref={heading} tabIndex={-1}>동의와 가상 증빙</h2>
              <p>항목별 동의 여부를 선택해 주세요. 선택한 내용이 서류에 표시됩니다.</p>
              <a className="registration-text-link" href="https://www.mohw.go.kr/board.es?act=view&bid=0073&list_no=1489873&mid=a60401000000"
                target="_blank" rel="noreferrer">공식 신청서와 동의서 안내</a>
              {consentFields.map((field) => (
                <div className="registration-consent" key={field}>
                  <RadioGroup name={field} legend={CONSENT_LABELS[field]} options={CONSENT_CHOICES}
                    value={consents[field] === null ? '' : consents[field] ? 'yes' : 'no'}
                    onChange={(value) => setConsents({ ...consents, [field]: value === 'yes' })} />
                </div>
              ))}
              {evidence.length > 0 && (
                <fieldset className="registration-consent">
                  <legend>필요한 가상 증빙</legend>
                  {evidence.map((item) => (
                    <CheckboxField key={item} id={'evidence-' + item} label={EVIDENCE_LABELS[item] + ' 시연 자료를 준비했습니다'}
                      checked={preparedEvidence.includes(item)}
                      onChange={(checked) => setPreparedEvidence(checked
                        ? [...preparedEvidence, item] : preparedEvidence.filter((value) => value !== item))} />
                  ))}
                </fieldset>
              )}
              <div className="registration-consent">
                <div className="form-group registration-photo-field">
                  <div className="form-tit"><label htmlFor="evidence-photo">가상 증빙 사진 직접 첨부 (선택)</label></div>
                  <p id="evidence-photo-hint">가상 정보가 담긴 JPG, PNG, WebP 사진 한 장을 올려 주세요. 최대 8MB입니다.</p>
                  <input ref={photoInput} id="evidence-photo" type="file" accept={EVIDENCE_PHOTO_TYPES.join(',')}
                    aria-describedby="evidence-photo-hint" aria-invalid={Boolean(photoError)}
                    onChange={(event) => { const file = event.target.files?.[0]; if (file) choosePhoto(file); }} />
                  <p>사진에 ‘성명’, ‘생년월일’, ‘가상 식별자’, ‘주소’를 값과 함께 적으면 담당자가 자동으로 대조할 수 있습니다.</p>
                  {photoError && <FormMessage tone="error">{photoError}</FormMessage>}
                  {(photo || photoError) && <div className="registration-photo-selection">
                    {photo && <span>{photo.name}</span>}
                    <button type="button" className="krds-btn small secondary" onClick={clearPhoto}>{photo ? '사진 제거' : '선택 취소'}</button>
                  </div>}
                  {photoUrl && <img className="registration-photo-preview" src={photoUrl} alt="첨부할 가상 증빙 사진" />}
                </div>
                <InputSelect id="ocr-evidence" label="예시 확인서" value={evidenceSample ?? ''} required={false}
                  onChange={(value) => {
                    if (value) { clearPhoto(); setRetainEvidence(false); }
                    setEvidenceSample(value ? value as EvidenceSample : null);
                  }}>
                  <option value="">예시 선택 안 함</option>
                  {Object.entries(EVIDENCE_SAMPLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </InputSelect>
                {revision && hasPriorUpload && !photo && !evidenceSample && (
                  <>
                    <a className="registration-text-link" href={evidenceUrl(revision.id, revision.revision)} target="_blank" rel="noreferrer">이전 증빙 사진 열기 (새 창)</a>
                    <CheckboxField id="retain-evidence" label="기존 첨부 사진 유지" checked={retainEvidence} onChange={setRetainEvidence} />
                  </>
                )}
              </div>
              <CheckboxField id="confirm-demo-submission" label="가상 정보와 제출 내용, 각 동의 선택을 확인했습니다"
                checked={confirmed} onChange={setConfirmed} />
            </section>
          )}

          {step === 2 && prepared && (
            <section className="registration-form-section">
              <h2 ref={heading} tabIndex={-1}>최종 서류 확인</h2>
              <p>작성된 서류를 확인해 주세요. 제출한 서류는 가상 통합돌봄 접수처에서 확인할 수 있습니다.</p>
              {prepared.form.evidenceSample && <p>가상 증빙 · {EVIDENCE_SAMPLES[prepared.form.evidenceSample]}</p>}
              {prepared.retainEvidence && <p>가상 증빙 사진 · 기존 첨부 사진 유지</p>}
              {prepared.photo && <div className="registration-photo-field">
                <p>가상 증빙 사진 · {prepared.photo.name}</p>
                {photoUrl && <img className="registration-photo-preview" src={photoUrl} alt="제출할 가상 증빙 사진" />}
              </div>}
              <FormReview previews={prepared.previews} />
            </section>
          )}
          </fieldset>

          {error && <FormMessage tone="error">{error}</FormMessage>}
          <div className="registration-actions">
            {step > 0 && (
              <button type="button" className="krds-btn medium secondary" disabled={busy || uncertain}
                onClick={() => { setError(null); setStep(step - 1); }}>이전</button>
            )}
            <button type="submit" className="krds-btn large primary" disabled={busy}>
              {busy ? '처리 중…' : step === 0 ? '동의와 증빙으로' : step === 1 ? '서류 미리보기' : revision ? '보완 내용 재제출' : '가상 접수처에 제출'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
