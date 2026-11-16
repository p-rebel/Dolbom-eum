import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { TextField } from '../../components/TextField';
import {
  APPLICATION_TYPES, CARE_NEEDS, EVIDENCE_LABELS, EVIDENCE_SAMPLES, RELATIONSHIPS,
  documentUrl, evidenceUrl, getSubmission, getSubmissions, requestCorrection,
  type ApplicationForm, type Submission, type SubmissionAudience,
} from '../../api/registration';
import { EmptyBlock, ErrorBlock, FormMessage, LoadingBlock } from '../../components/Feedback';
import { Pagination } from '../../components/Pagination';
import { useApiData } from '../../hooks/useApiData';
import { PageHead } from '../../layout/PageHead';
import { Link } from '../../router';
import { DocumentViewer } from './DocumentViewer';
import { VerificationPanel } from './VerificationPanel';

const DATE_TIME = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
});

export function SubmissionListPage({ audience }: { audience: SubmissionAudience }) {
  const [page, setPage] = useState(1);
  const result = useApiData((signal) => getSubmissions(audience, page, signal), [audience, page]);
  const title = audience === 'staff' ? '가상 제출함' : '내 신청 현황';
  const path = audience === 'staff' ? '/intake' : '/my/applications';

  return (
    <div className="inner page registration-submissions">
      <PageHead parents={[{ label: '홈', to: '/' }]} title={title} />
      {result.loading && <LoadingBlock label="모의 신청을 불러오는 중" />}
      {result.error && <ErrorBlock message={result.error.message} onRetry={result.reload} />}
      {!result.loading && !result.error && result.data?.items.length === 0 && (
        <EmptyBlock message={audience === 'staff' ? '관할에 제출된 모의 신청이 없습니다.' : '제출한 모의 신청이 없습니다.'}>
          {audience === 'applicant' && <Link className="krds-btn medium primary" to="/apply/new">신청서 작성</Link>}
        </EmptyBlock>
      )}
      {!result.loading && !result.error && result.data && result.data.items.length > 0 && (
        <>
          <ul className="registration-submission-list">
            {result.data.items.map((item) => (
              <li key={item.id}>
                <Link to={path + '/' + item.id}>
                  <strong>{item.beneficiaryName}</strong>
                  <span>{item.submissionNumber}</span>
                </Link>
                <p>{APPLICATION_TYPES[item.applicationType]} · {item.region.name} · {DATE_TIME.format(new Date(item.submittedAt))}</p>
                <p>{item.revision}차 제출 · {item.status === 'CHANGES_REQUESTED' ? '보완 요청' : '제출 완료'}</p>
              </li>
            ))}
          </ul>
          <Pagination page={result.data.page} pageSize={result.data.pageSize} total={result.data.total} onChange={setPage} label={title} />
        </>
      )}
    </div>
  );
}

function SubmittedValues({ form }: { form: ApplicationForm }) {
  return (
    <section className="registration-submitted-values" aria-labelledby="submitted-values-heading">
      <h2 id="submitted-values-heading">신청 정보</h2>
      <dl>
        <div><dt>대상자</dt><dd>{form.beneficiary.name}</dd></div>
        <div><dt>가상 식별자</dt><dd>{form.beneficiary.demoId}</dd></div>
        <div><dt>생년월일</dt><dd>{form.beneficiary.birthDate}</dd></div>
        <div><dt>주소</dt><dd>{form.beneficiary.address}</dd></div>
        {form.beneficiary.residence && <div><dt>실거주지</dt><dd>{form.beneficiary.residence}</dd></div>}
        <div><dt>연락처</dt><dd>{form.beneficiary.mobile}</dd></div>
        {form.applicant && <div><dt>대리 신청인</dt><dd>{form.applicant.name} · {RELATIONSHIPS[form.applicant.relationship]}</dd></div>}
        {form.caregiver && <div><dt>별도 보호자</dt><dd>{form.caregiver.name} · {RELATIONSHIPS[form.caregiver.relationship]}</dd></div>}
        <div><dt>필요한 돌봄</dt><dd>{form.careNeeds.map((need) => CARE_NEEDS[need]).join(', ')}</dd></div>
        <div><dt>가상 증빙</dt><dd>{form.evidence.map((kind) => EVIDENCE_LABELS[kind]).join(', ') || '별도 증빙 없음'}</dd></div>
      </dl>
    </section>
  );
}

function CorrectionForm({ submission, onSaved }: { submission: Submission; onSaved: (value: Submission) => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await requestCorrection(submission.id, submission.revision, reason.trim()));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '보완 요청을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="registration-form-section" onSubmit={save}>
      <TextField id="correction-reason" label="보완 요청 사유" value={reason} maxLength={500} required disabled={saving}
        onChange={(event) => setReason(event.target.value)} />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <button type="submit" className="krds-btn medium primary" disabled={saving || !reason.trim()}>보완 요청</button>
    </form>
  );
}

export function SubmissionDetailPage({ id, audience }: { id: string; audience: SubmissionAudience }) {
  const [selectedRevision, setSelectedRevision] = useState<number>();
  const result = useApiData(
    (signal) => getSubmission(audience, id, signal, selectedRevision), [audience, id, selectedRevision],
  );
  const staff = audience === 'staff';
  const listPath = staff ? '/intake' : '/my/applications';
  const listTitle = staff ? '가상 제출함' : '내 신청 현황';
  const submission = result.data;
  return (
    <div className="inner page registration-submissions">
      <PageHead parents={[{ label: listTitle, to: listPath }]} title={staff ? '모의 신청 상세' : '모의 제출 완료'} />
      {result.loading && <LoadingBlock label="제출 서류를 불러오는 중" />}
      {result.error && <ErrorBlock message={result.error.message} onRetry={result.reload} />}
      {submission && !result.error && (
        <>
          <section className="registration-receipt" aria-label="모의 제출 정보">
            <div><p>모의 제출번호</p><strong>{submission.submissionNumber}</strong></div>
            <div><p>수신처</p><strong>가상 통합돌봄 접수처 · {submission.region.name}</strong></div>
            <div><p>제출 시각</p><strong>{DATE_TIME.format(new Date(submission.submittedAt))}</strong></div>
          </section>
          <div className="registration-form-section">
            <div className="form-group">
              <div className="form-tit"><label htmlFor="submission-revision">제출본</label></div>
              <div className="form-conts">
                <select id="submission-revision" className="krds-form-select medium"
                  value={submission.revision} disabled={result.loading}
                  onChange={(event) => {
                    const selected = Number(event.target.value);
                    setSelectedRevision(selected === submission.revisions[0].revision ? undefined : selected);
                  }}>
                  {submission.revisions.map((entry, index) => <option key={entry.revision} value={entry.revision}>
                    {entry.revision}차 제출본{index === 0 ? ' (최신)' : ''} · {DATE_TIME.format(new Date(entry.submittedAt))}
                  </option>)}
                </select>
              </div>
            </div>
            {submission.correctionReason && (
              <p>{submission.latest ? '보완 요청 사유' : '당시 보완 요청 사유'} · {submission.correctionReason}</p>
            )}
            {!staff && submission.status === 'CHANGES_REQUESTED' && (
              <Link className="krds-btn medium primary" to={listPath + '/' + id + '/revise'}>보완 신청서 작성</Link>
            )}
            {staff && submission.latest && submission.status === 'SUBMITTED' && (
              <CorrectionForm key={submission.revision} submission={submission} onSaved={result.setData} />
            )}
          </div>
          {staff && (submission.evidenceSource
            ? <VerificationPanel key={submission.revision} id={submission.id} revision={submission.revision}
                latest={submission.latest} sample={submission.form.evidenceSample ?? null} />
            : <p className="registration-verification-empty">첨부된 OCR 대조용 가상 증빙이 없습니다.</p>)}
          {!staff && submission.evidenceSource && (
            <p className="registration-verification-empty">제출한 가상 증빙 ·{' '}
              <a className="registration-text-link" href={evidenceUrl(submission.id, submission.revision)} target="_blank" rel="noreferrer">
                {submission.form.evidenceSample ? EVIDENCE_SAMPLES[submission.form.evidenceSample] : '첨부한 가상 증빙 사진'} (새 창)
              </a>
            </p>
          )}
          <div className={'registration-detail' + (staff ? ' registration-detail-staff' : '')}>
            <DocumentViewer key={submission.revision} urls={{
              application: documentUrl(submission.id, 'application', submission.revision),
              'privacy-consent': documentUrl(submission.id, 'privacy-consent', submission.revision),
            }} />
            <SubmittedValues form={submission.form} />
          </div>
          <div className="registration-actions">
            <Link className="krds-btn medium secondary" to={listPath}>{listTitle}으로</Link>
          </div>
        </>
      )}
    </div>
  );
}
