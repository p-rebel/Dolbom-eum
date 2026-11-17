import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, newRequestKey } from '../../api/client';
import { NOTICE_METHOD_LABEL } from '../../api/labels';
import {
  APPLICATION_TYPES, CARE_NEEDS, EVIDENCE_LABELS, EVIDENCE_PHOTO_MAX_BYTES, EVIDENCE_PHOTO_TYPES, EVIDENCE_SAMPLES, RELATIONSHIPS,
  evidenceUrl, getApplicantProfile, getRegions, getSubmission, previewForms, submitApplication,
  type ApplicationForm, type ApplicationType, type Beneficiary, type CareNeed,
  type DocumentKind, type Evidence, type EvidenceSample, type FormPreviews, type Person, type RelatedPerson, type Relationship, type Submission,
  type Signature, type SignedApplicationForm,
} from '../../api/registration';
import { DateField } from '../../components/DateField';
import { ErrorBlock, FormMessage, LoadingBlock } from '../../components/Feedback';
import { CheckboxField, RadioGroup, SelectField } from '../../components/FormFields';
import { TextField } from '../../components/TextField';
import { checkDate, todayKey } from '../../dates';
import { useApiData } from '../../hooks/useApiData';
import { PageHead } from '../../layout/PageHead';
import { Link, navigate, PageTitle, useUnsavedChanges } from '../../router';
import { DocumentViewer } from './DocumentViewer';
import { hasSignature, SignaturePad } from './SignaturePad';
import { siteText } from '../../siteConfig';

const EMPTY_PERSON: Person = { name: '', address: '', mobile: '' };
const EMPTY_BENEFICIARY: Beneficiary = { ...EMPTY_PERSON, demoId: '', birthDate: '', sex: null, residence: null };
const EMPTY_APPLICANT: RelatedPerson = { ...EMPTY_PERSON, relationship: 'CHILD' };
const FAMILY_RELATIONSHIPS = ['SPOUSE', 'PARENT', 'CHILD', 'RELATIVE'] as const;
const CAREGIVER_RELATIONSHIPS = [...FAMILY_RELATIONSHIPS, 'GUARDIAN', 'OTHER'] as const;
const STEP_NAMES = ['신청 정보', '동의와 증빙', '서류 확인·제출'];
const EMPTY_SIGNATURES: Record<keyof SignedApplicationForm['signatures'], Signature> = { applicant: [], privacyConsent: [] };

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
] as const;

/*
 * 입력 규칙은 서버(backend/app/registration.py)와 같다. 브라우저 기본 검증 말풍선은 잠깐 떴다 사라지고
 * 브라우저 언어로 나와서, 칸 아래 KRDS 오류 문구로 알리고 첫 오류 칸으로 포커스를 옮긴다(11/16).
 */
const NAME_PATTERN = /^가상 [가-힣A-Za-z0-9 ]+$/;
const ADDRESS_PATTERN = /^가상[가-힣A-Za-z0-9 .(), -]+$/;
const MOBILE_PATTERN = /^000-0000-[0-9]{4}$/;
const DEMO_ID_PATTERN = /^DEMO-[A-Z0-9]{2,12}(?:-[A-Z0-9]{1,8})?$/;
const SAMPLE_NAMES: Record<string, string> = { 대상자: '가상 대상자 A', 신청인: '가상 신청인 B', 보호자: '가상 보호자 C' };

type Errors = Record<string, string>;

function checkPerson(group: string, person: Person, errors: Errors) {
  const name = person.name.trim();
  const address = person.address.trim();
  if (!name) errors[group + '-name'] = group + ' 성명을 입력해 주세요.';
  else if (!NAME_PATTERN.test(name)) errors[group + '-name'] = `성명은 ‘가상 ’으로 시작해 주세요(예: ${SAMPLE_NAMES[group]}).`;
  if (!person.mobile) errors[group + '-mobile'] = group + ' 연락처를 입력해 주세요.';
  else if (!MOBILE_PATTERN.test(person.mobile)) errors[group + '-mobile'] = '연락처는 000-0000-0000 형식의 가상 번호로 입력해 주세요.';
  if (!address) errors[group + '-address'] = group + ' 주소를 입력해 주세요.';
  else if (!ADDRESS_PATTERN.test(address)) errors[group + '-address'] = '주소는 ‘가상’으로 시작하고 글자·숫자·띄어쓰기와 . ( ) , - 만 써 주세요.';
}

function PersonFields({ group, person, onChange, errors }: {
  group: string; person: Person; onChange: (person: Person) => void; errors: Errors;
}) {
  return (
    <div className="registration-fields">
      <TextField id={group + '-name'} label={group + ' 성명'} value={person.name} maxLength={14}
        hint={`‘가상 ’으로 시작합니다. 예: ${SAMPLE_NAMES[group]}`} error={errors[group + '-name']}
        onChange={(event) => onChange({ ...person, name: event.target.value })} />
      <TextField id={group + '-mobile'} label={group + ' 연락처'} value={person.mobile} maxLength={13} type="tel"
        hint="가상 번호 000-0000-0000 형식입니다." error={errors[group + '-mobile']}
        onChange={(event) => onChange({ ...person, mobile: event.target.value })} />
      <div className="registration-field-wide">
        <TextField id={group + '-address'} label={group + ' 주소'} value={person.address} maxLength={52}
          hint="‘가상’으로 시작합니다. 예: 가상 A시 돌봄로 10" error={errors[group + '-address']}
          onChange={(event) => onChange({ ...person, address: event.target.value })} />
      </div>
    </div>
  );
}

function RelatedFields({ group, person, relationships, onChange, errors }: {
  group: string; person: RelatedPerson; relationships: readonly Relationship[]; onChange: (person: RelatedPerson) => void; errors: Errors;
}) {
  return (
    <>
      <div className="registration-fields">
        <SelectField id={group + '-relationship'} label="대상자와의 관계" value={person.relationship}
          options={relationships.map((value) => ({ value, label: RELATIONSHIPS[value] }))}
          onChange={(event) => onChange({ ...person, relationship: event.target.value as Relationship })} />
      </div>
      <PersonFields group={group} person={person} errors={errors} onChange={(value) => onChange({ ...person, ...value })} />
    </>
  );
}

/** 입력 묶음. 제목(legend)을 상자 테두리 위가 아니라 상자 안 첫 줄에 둔다(h2 묶음과 같은 모양). */
function FormSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <fieldset className="registration-form-section">
      <legend>{title}</legend>
      {action && <div className="registration-section-action">{action}</div>}
      {children}
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

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + 'MB' : Math.max(1, Math.round(bytes / 1024)) + 'KB';
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
  const [signatures, setSignatures] = useState(EMPTY_SIGNATURES);
  const [prepared, setPrepared] = useState<{ form: SignedApplicationForm; photo: File | null; retainEvidence: boolean; key: string; previews: FormPreviews } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // 다음 단계를 누를 때 찾은 오류와 그때의 값. 값을 고치면 그 칸 오류만 지우고 다시 검사는 다음 단계를 누를 때 한다(DEV-03 11/13 규칙).
  const [shown, setShown] = useState<{ errors: Errors; values: Record<string, string> }>({ errors: {}, values: {} });
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
  const needsPrivacySignature = applicationType !== 'SELF' || caregiver !== null;
  const applicantSigner = applicationType === 'SELF' ? beneficiary : applicant;
  const privacySigner = caregiver ?? beneficiary;

  /** 화면 순서대로 오류를 모은다. 첫 항목으로 포커스를 옮긴다. */
  function validateInfo(): Errors {
    const errors: Errors = {};
    if (!regionCode) errors['application-region'] = '주소지 관할을 선택해 주세요.';
    checkPerson('대상자', beneficiary, errors);
    if (!beneficiary.demoId) errors['demo-id'] = '가상 식별자를 입력해 주세요.';
    else if (!DEMO_ID_PATTERN.test(beneficiary.demoId)) errors['demo-id'] = '가상 식별자는 DEMO-로 시작하는 대문자·숫자로 입력해 주세요(예: DEMO-ID-0101).';
    const birth = checkDate(beneficiary.birthDate, {
      required: siteText('가상 생년월일을 입력해 주세요.', '생년월일을 입력해 주세요.'),
      notAfter: { date: todayKey(), message: '생년월일은 오늘이나 이전 날짜로 입력해 주세요.' },
    });
    if (birth) errors['birth-date'] = birth;
    const residence = beneficiary.residence?.trim();
    if (residence && !ADDRESS_PATTERN.test(residence)) errors.residence = '실거주지는 ‘가상’으로 시작하고 글자·숫자·띄어쓰기와 . ( ) , - 만 써 주세요.';
    if (applicationType !== 'SELF') checkPerson('신청인', applicant, errors);
    if (caregiver) checkPerson('보호자', caregiver, errors);
    if (!careNeeds.length) errors['care-HEALTH'] = '필요한 돌봄을 하나 이상 선택해 주세요.';
    return errors;
  }

  function validateConsents(): Errors {
    const errors: Errors = {};
    for (const field of consentFields) {
      if (consents[field] === null) errors[field + '-yes'] = '동의 여부를 선택해 주세요.';
    }
    for (const item of evidence) {
      if (!preparedEvidence.includes(item)) errors['evidence-' + item] = siteText('준비한 가상 증빙을 확인해 주세요.', '준비한 증빙을 확인해 주세요.');
    }
    if (photoError) errors['evidence-photo-button'] = photoError;
    if (!confirmed) errors['confirm-demo-submission'] = '제출 전에 입력 내용을 확인했는지 선택해 주세요.';
    if (!hasSignature(signatures.applicant)) errors['applicant-signature'] = '신청인 서명을 그려 주세요.';
    if (needsPrivacySignature && !hasSignature(signatures.privacyConsent)) {
      errors['privacy-signature'] = '개인정보 수집·이용 동의서에 서명해 주세요.';
    }
    return errors;
  }

  /** 오류 칸마다 지금 값. 다음 단계를 누를 때와 달라졌으면 그 칸 오류를 숨긴다. */
  function fieldValues(): Record<string, string> {
    const values: Record<string, string> = {
      'application-region': regionCode, 'demo-id': beneficiary.demoId, 'birth-date': beneficiary.birthDate,
      residence: beneficiary.residence ?? '', 'care-HEALTH': careNeeds.join(','),
      'evidence-photo-button': photoError ?? '', 'confirm-demo-submission': String(confirmed),
      'applicant-signature': String(hasSignature(signatures.applicant)),
      'privacy-signature': String(hasSignature(signatures.privacyConsent)),
    };
    const people: [string, Person | null][] = [['대상자', beneficiary], ['신청인', applicant], ['보호자', caregiver]];
    for (const [group, person] of people) {
      if (!person) continue;
      values[group + '-name'] = person.name;
      values[group + '-mobile'] = person.mobile;
      values[group + '-address'] = person.address;
    }
    for (const field of Object.keys(CONSENT_LABELS) as ConsentField[]) values[field + '-yes'] = String(consents[field]);
    for (const item of evidence) values['evidence-' + item] = String(preparedEvidence.includes(item));
    return values;
  }

  const current = fieldValues();
  const errors: Errors = Object.fromEntries(Object.entries(shown.errors).filter(([id]) => current[id] === shown.values[id]));

  function stopAtFirstError(found: Errors) {
    setShown({ errors: found, values: fieldValues() });
    const first = Object.keys(found)[0];
    if (!first) return false;
    document.getElementById(first)?.focus();
    return true;
  }

  function changeType(type: ApplicationType) {
    setApplicationType(type);
    setApplicant((person) => ({ ...person, relationship: type === 'GUARDIAN' ? 'GUARDIAN' : 'CHILD' }));
    setNoticeRecipient(type === 'SELF' ? 'BENEFICIARY' : 'APPLICANT');
    setConsents((value) => ({ ...value, familyRecord: null }));
    setPreparedEvidence([]);
    setSignatures(EMPTY_SIGNATURES);
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
    setSignatures(EMPTY_SIGNATURES);
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
      setPhoto(null);
      setPhotoError('8MB 이하의 JPG, PNG, WebP 사진을 선택해 주세요.');
      return;
    }
    setPhoto(file);
    setRetainEvidence(false);
    setEvidenceSample(null);
    setPhotoError(null);
  }

  function changeSignature(key: keyof typeof signatures, value: Signature) {
    setSignatures((currentSignatures) => ({ ...currentSignatures, [key]: value }));
    setDirty(true);
  }

  async function handleStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (step === 0) {
      if (stopAtFirstError(validateInfo())) return;
      setStep(1);
      return;
    }

    if (step === 1) {
      if (stopAtFirstError(validateConsents())) return;
      const { familyRecord, administrative, personal, sensitive, uniqueId } = consents;
      const form: SignedApplicationForm = {
        applicationType, regionCode,
        // 공백만 넣은 실거주지는 입력하지 않은 것으로 보낸다(서버가 공백을 지운 뒤 형식 오류로 거절한다).
        beneficiary: { ...beneficiary, residence: beneficiary.residence?.trim() ? beneficiary.residence : null },
        applicant: applicationType === 'SELF' ? null : applicant, caregiver,
        noticeRecipient, noticeMethod, careNeeds, confirmed: true, evidence, evidenceSample,
        consents: { familyRecord, administrative: administrative!, personal: personal!, sensitive: sensitive!, uniqueId: uniqueId! },
        signatures: { applicant: signatures.applicant, privacyConsent: needsPrivacySignature ? signatures.privacyConsent : null },
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
      navigate('/my/applications/' + submission.id + '?done=1', { force: true });
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
      <PageHead parents={[{ label: '홈', to: '/' }]} title={revision ? '보완 신청서 작성' : '돌봄 신청서 작성'} />
      {revision && <p className="registration-lead">{revision.submissionNumber} · 보완 요청 사유 {revision.correctionReason}</p>}
      <p className="registration-lead">{siteText('가상 정보를 한 번 입력하면 공식 양식의 신청서와 동의서에 반영됩니다.', '한 번 입력하면 공식 양식의 신청서와 동의서에 반영됩니다.')}</p>
      {/* KRDS 단계 표시(step indicator): 지난 단계 done, 현재 단계 active와 ‘현재단계’ 숨김 글자 */}
      <ol className="krds-step-wrap registration-steps" aria-label="신청 단계">
        {STEP_NAMES.map((name, index) => (
          <li key={name} className={index < step ? 'done' : index === step ? 'active' : undefined}
            aria-current={index === step ? 'step' : undefined}>
            <span>
              {index === step && <em className="sr-only">현재단계</em>}
              <i className="step">{index + 1}단계</i>
              <span className="step-tit">{name}</span>
            </span>
          </li>
        ))}
      </ol>
      {/* 화면낭독기는 위 단계 표시의 숨김 글자로 읽으므로 이 줄은 건너뛴다. */}
      <p className="registration-step-caption" aria-hidden="true">{step + 1}/{STEP_NAMES.length}단계 · {STEP_NAMES[step]}</p>

      {regions.loading && <LoadingBlock label="신청 가능한 지역을 불러오는 중" />}
      {regions.error && <ErrorBlock message={regions.error.message} onRetry={regions.reload} />}
      {regions.data && (
        <form noValidate onSubmit={handleStep} onChange={() => {
          setDirty(true);
          if (step === 0) setSignatures(EMPTY_SIGNATURES);
        }}>
          <fieldset className="registration-step-fields" disabled={busy}>
          {step === 0 && (
            <>
              <FormSection title="신청 대상과 유형"
                action={!revision && <button type="button" className="krds-btn small secondary" onClick={loadSample}>{siteText('가상 정보 불러오기', '예시 정보 불러오기')}</button>}>
                <div className="registration-fields">
                  <SelectField id="application-type" label="신청 유형" value={applicationType}
                    options={Object.entries(APPLICATION_TYPES).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => changeType(event.target.value as ApplicationType)} />
                  <SelectField id="application-region" label="주소지 관할" value={regionCode} disabled={Boolean(revision)} emptyOption="관할 지역을 선택해 주세요"
                    options={regions.data.map(({ code, name }) => ({ value: code, label: name }))}
                    error={errors['application-region']} onChange={(event) => setRegionCode(event.target.value)} />
                </div>
              </FormSection>

              <FormSection title="돌봄을 받는 분" action={!revision && applicationType === 'SELF' && profile.data && (
                  <button type="button" className="krds-btn small secondary" onClick={loadOwnProfile}>내정보로 채워넣기</button>
                )}>
                <PersonFields group="대상자" person={beneficiary} errors={errors}
                  onChange={(person) => setBeneficiary({ ...beneficiary, ...person })} />
                <div className="registration-fields">
                  <TextField id="demo-id" label="가상 식별자" value={beneficiary.demoId} maxLength={26}
                    hint="DEMO-로 시작합니다. 예: DEMO-ID-0101" error={errors['demo-id']}
                    onChange={(event) => setBeneficiary({ ...beneficiary, demoId: event.target.value })} />
                  <DateField id="birth-date" label={siteText('가상 생년월일', '생년월일')} value={beneficiary.birthDate} max={todayKey()} yearsFrom={1900}
                    hint="숫자만 입력해도 됩니다(예: 19450503 → 1945-05-03)" error={errors['birth-date']}
                    onChange={(value) => {
                      setBeneficiary({ ...beneficiary, birthDate: value });
                      setSignatures(EMPTY_SIGNATURES);
                      setDirty(true);
                    }} />
                  <SelectField id="beneficiary-sex" label="성별" optional value={beneficiary.sex ?? ''} emptyOption="선택 안 함"
                    options={[{ value: 'FEMALE', label: '여성' }, { value: 'MALE', label: '남성' }]}
                    onChange={(event) => setBeneficiary({ ...beneficiary, sex: (event.target.value || null) as Beneficiary['sex'] })} />
                  <TextField id="residence" label="실거주지" optional value={beneficiary.residence ?? ''} maxLength={52}
                    hint="주소와 다른 곳에 사는 경우에만 입력합니다." error={errors.residence}
                    onChange={(event) => setBeneficiary({ ...beneficiary, residence: event.target.value || null })} />
                </div>
              </FormSection>

              {applicationType !== 'SELF' && (
                <FormSection title="신청인 정보">
                  <RelatedFields group="신청인" person={applicant} errors={errors}
                    relationships={applicationType === 'GUARDIAN' ? ['GUARDIAN'] : FAMILY_RELATIONSHIPS} onChange={setApplicant} />
                </FormSection>
              )}

              <FormSection title="보호자 정보">
                <CheckboxField id="separate-caregiver" label="돌봄을 맡은 보호자가 별도로 있습니다" checked={Boolean(caregiver)}
                  onChange={(checked) => setCaregiver(checked ? EMPTY_APPLICANT : null)} />
                {caregiver && <RelatedFields group="보호자" person={caregiver} relationships={CAREGIVER_RELATIONSHIPS}
                  errors={errors} onChange={setCaregiver} />}
              </FormSection>

              <FormSection title="필요한 돌봄과 안내 방법">
                {/* 체크박스 묶음도 라디오 묶음(RadioGroup)처럼 fieldset 이름을 두고 오류를 묶음 아래 한 줄로 둔다. */}
                <fieldset className="form-group registration-care-needs" aria-describedby={errors['care-HEALTH'] ? 'care-needs-error' : undefined}>
                  <legend>필요한 돌봄</legend>
                  <div className="form-tit" aria-hidden="true"><span>필요한 돌봄</span></div>
                  <div className={errors['care-HEALTH'] ? 'form-conts is-error' : 'form-conts'}>
                    <div className="krds-check-area">
                      {(Object.keys(CARE_NEEDS) as CareNeed[]).map((value) => (
                        <div className="krds-form-check" key={value}>
                          <input type="checkbox" id={'care-' + value} checked={careNeeds.includes(value)}
                            aria-invalid={errors['care-HEALTH'] ? true : undefined}
                            onChange={(event) => setCareNeeds(event.target.checked
                              ? [...careNeeds, value] : careNeeds.filter((item) => item !== value))} />
                          <label htmlFor={'care-' + value}>{CARE_NEEDS[value]}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                  {errors['care-HEALTH'] && <p id="care-needs-error" className="form-hint-invalid">{errors['care-HEALTH']}</p>}
                </fieldset>
                <div className="registration-fields">
                  <SelectField id="notice-recipient" label="안내 대상" value={noticeRecipient}
                    options={[
                      { value: 'BENEFICIARY', label: '대상자 본인' },
                      ...(applicationType !== 'SELF' ? [{ value: 'APPLICANT', label: '친족·후견인 신청자' }] : []),
                    ]}
                    onChange={(event) => setNoticeRecipient(event.target.value as ApplicationForm['noticeRecipient'])} />
                  <SelectField id="notice-method" label="안내 방식" value={noticeMethod}
                    options={(['SMS', 'MAIL'] as const).map((value) => ({ value, label: NOTICE_METHOD_LABEL[value] }))}
                    onChange={(event) => setNoticeMethod(event.target.value as ApplicationForm['noticeMethod'])} />
                </div>
              </FormSection>
            </>
          )}

          {step === 1 && (
            <>
              <section className="registration-form-section" aria-labelledby="consent-heading">
                <h2 id="consent-heading" ref={heading} tabIndex={-1}>항목별 동의</h2>
                <p className="registration-section-lead">
                  항목별 동의 여부를 선택해 주세요. 선택한 내용이 서류에 표시됩니다.{' '}
                  <a className="registration-text-link" href="https://www.mohw.go.kr/board.es?act=view&bid=0073&list_no=1489873&mid=a60401000000"
                    target="_blank" rel="noreferrer">공식 신청서와 동의서 안내 (새 창)</a>
                </p>
                {consentFields.map((field) => (
                  <div className="registration-consent" key={field}>
                    <RadioGroup name={field} legend={CONSENT_LABELS[field]} options={[...CONSENT_CHOICES]}
                      value={consents[field] === null ? '' : consents[field] ? 'yes' : 'no'} error={errors[field + '-yes']}
                      onChange={(value) => {
                        setConsents({ ...consents, [field]: value === 'yes' });
                        setSignatures(EMPTY_SIGNATURES);
                      }} />
                  </div>
                ))}
              </section>

              <section className="registration-form-section" aria-labelledby="evidence-heading">
                <h2 id="evidence-heading">{siteText('가상 증빙', '증빙 서류')}</h2>
                {evidence.length > 0 && (
                  <fieldset className="registration-consent">
                    <legend>{siteText('필요한 가상 증빙', '필요한 증빙')}</legend>
                    {evidence.map((item) => (
                      <CheckboxField key={item} id={'evidence-' + item} label={EVIDENCE_LABELS[item] + siteText(' 시연 자료를 준비했습니다', ' 서류를 준비했습니다')}
                        checked={preparedEvidence.includes(item)} error={errors['evidence-' + item]}
                        onChange={(checked) => setPreparedEvidence(checked
                          ? [...preparedEvidence, item] : preparedEvidence.filter((value) => value !== item))} />
                    ))}
                  </fieldset>
                )}

                {/* KRDS 파일 업로드: 안내 문구 + ‘파일 선택’ 버튼, 고른 파일은 목록으로 보여 주고 ‘삭제’로 뺀다. */}
                <div className="krds-file-upload registration-photo-upload">
                  <div className="file-head">
                    <h3 className="tit" id="evidence-photo-title">{siteText('가상 증빙 사진 직접 첨부', '증빙 사진 첨부')} <span className="field-optional">(선택)</span></h3>
                  </div>
                  <div className={photoError ? 'file-upload is-error' : 'file-upload'}>
                    <p className="txt" id="evidence-photo-hint">
                      {siteText('가상 정보가 담긴 JPG, PNG, WebP 사진 한 장(최대 8MB)을 골라 주세요.', 'JPG, PNG, WebP 사진 한 장(최대 8MB)을 골라 주세요.')}
                      사진에 ‘성명’, ‘생년월일’, ‘가상 식별자’, ‘주소’를 값과 함께 적으면 담당자가 자동으로 대조할 수 있습니다.
                    </p>
                    <div className="file-upload-btn-wrap">
                      <input ref={photoInput} id="evidence-photo" type="file" hidden accept={EVIDENCE_PHOTO_TYPES.join(',')}
                        onChange={(event) => { const file = event.target.files?.[0]; if (file) choosePhoto(file); }} />
                      <button type="button" id="evidence-photo-button" className="krds-btn medium"
                        aria-describedby={['evidence-photo-hint', photoError && 'evidence-photo-error'].filter(Boolean).join(' ')}
                        aria-invalid={photoError ? true : undefined}
                        onClick={() => photoInput.current?.click()}>
                        <i className="svg-icon ico-upload" aria-hidden="true" />{photo ? '다른 사진 선택' : '사진 선택'}
                        <span className="sr-only"> ({siteText('가상 증빙 사진', '증빙 사진')})</span>
                      </button>
                    </div>
                  </div>
                  {photoError && <p id="evidence-photo-error" className="form-hint-invalid">{photoError}</p>}
                  {photo && (
                    <div className="file-list">
                      <ul className="upload-list">
                        <li>
                          <div className="file-info">
                            <div className="file-name">{photo.name} [{fileSize(photo.size)}]</div>
                            <div className="btn-wrap">
                              <button type="button" className="krds-btn medium text" onClick={clearPhoto}>
                                삭제<span className="sr-only"> {photo.name}</span> <i className="svg-icon ico-delete-fill" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </li>
                      </ul>
                      {photoUrl && <img className="registration-photo-preview" src={photoUrl} alt={siteText('첨부할 가상 증빙 사진', '첨부할 증빙 사진')} />}
                    </div>
                  )}
                </div>

                <div className="registration-fields">
                  <SelectField id="ocr-evidence" label="예시 확인서" optional value={evidenceSample ?? ''} emptyOption="예시 선택 안 함"
                    hint={siteText('사진 대신 준비된 가상 확인서로 OCR 대조를 시연할 수 있습니다. 고르면 첨부한 사진은 빠집니다.', '사진 대신 준비된 예시 확인서로 자동 대조를 확인할 수 있습니다. 고르면 첨부한 사진은 빠집니다.')}
                    options={Object.entries(EVIDENCE_SAMPLES).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value) { clearPhoto(); setRetainEvidence(false); }
                      setEvidenceSample(value ? value as EvidenceSample : null);
                    }} />
                </div>
                {revision && hasPriorUpload && !photo && !evidenceSample && (
                  <>
                    <a className="registration-text-link" href={evidenceUrl(revision.id, revision.revision)} target="_blank" rel="noreferrer">이전 증빙 사진 열기 (새 창)</a>
                    <CheckboxField id="retain-evidence" label="기존 첨부 사진 유지" checked={retainEvidence} onChange={setRetainEvidence} />
                  </>
                )}
              </section>

              <div className="registration-confirm">
                <CheckboxField id="confirm-demo-submission" label={siteText('가상 정보와 제출 내용, 각 동의 선택을 확인했습니다', '입력한 정보와 제출 내용, 각 동의 선택을 확인했습니다')}
                  checked={confirmed} error={errors['confirm-demo-submission']} onChange={setConfirmed} />
              </div>
              <section className="registration-form-section" aria-labelledby="signature-heading">
                <h2 id="signature-heading">서류 서명</h2>
                <p className="registration-section-lead" id="signature-hint">
                  마우스 왼쪽 버튼을 누른 채 움직이거나 손가락으로 칸 안에 서명을 그려 주세요. 아래 서명이 PDF 서명란에 들어갑니다.
                </p>
                <SignaturePad id="applicant-signature"
                  label={`${needsPrivacySignature ? '통합지원 신청서' : '통합지원 신청서 및 개인정보 동의서'} · ${applicantSigner.name}`}
                  value={signatures.applicant} onChange={(value) => changeSignature('applicant', value)}
                  disabled={busy} error={errors['applicant-signature']} />
                {needsPrivacySignature && <SignaturePad id="privacy-signature"
                  label={`개인정보 수집·이용 동의서 · ${privacySigner.name}`}
                  value={signatures.privacyConsent} onChange={(value) => changeSignature('privacyConsent', value)}
                  disabled={busy} error={errors['privacy-signature']} />}
              </section>
            </>
          )}

          {step === 2 && prepared && (
            <section className="registration-form-section" aria-labelledby="review-heading">
              <h2 id="review-heading" ref={heading} tabIndex={-1}>최종 서류 확인</h2>
              <p className="registration-section-lead">작성된 서류를 확인해 주세요. 제출한 서류는 {siteText('가상 통합돌봄 접수처', '통합돌봄 접수처')}에서 확인할 수 있습니다.</p>
              {prepared.form.evidenceSample && <p>{siteText('가상 증빙', '증빙')} · {EVIDENCE_SAMPLES[prepared.form.evidenceSample]}</p>}
              {prepared.retainEvidence && <p>{siteText('가상 증빙 사진', '증빙 사진')} · 기존 첨부 사진 유지</p>}
              {prepared.photo && <div className="registration-photo-field">
                <p>{siteText('가상 증빙 사진', '증빙 사진')} · {prepared.photo.name}</p>
                {photoUrl && <img className="registration-photo-preview" src={photoUrl} alt={siteText('제출할 가상 증빙 사진', '제출할 증빙 사진')} />}
              </div>}
              <FormReview previews={prepared.previews} />
            </section>
          )}
          </fieldset>

          {error && <FormMessage tone="error">{error}</FormMessage>}
          <div className="registration-actions">
            {step > 0 && (
              <button type="button" className="krds-btn medium secondary" disabled={busy || uncertain}
                onClick={() => { setError(null); setShown({ errors: {}, values: {} }); setStep(step - 1); }}>이전</button>
            )}
            <button type="submit" className="krds-btn large primary" disabled={busy}>
              {busy ? '처리 중…' : step === 0 ? '동의와 증빙으로' : step === 1 ? '서류 미리보기' : revision ? '보완 내용 재제출' : siteText('가상 접수처에 제출', '접수처에 제출')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
