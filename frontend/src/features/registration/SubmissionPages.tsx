import { useState } from 'react';
import {
  APPLICATION_TYPES, CARE_NEEDS, EVIDENCE_LABELS, RELATIONSHIPS, documentUrl, getSubmission, getSubmissions,
  type ApplicationForm, type SubmissionAudience,
} from '../../api/registration';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../components/Feedback';
import { Pagination } from '../../components/Pagination';
import { useApiData } from '../../hooks/useApiData';
import { PageHead } from '../../layout/PageHead';
import { Link } from '../../router';
import { DocumentViewer } from './DocumentViewer';

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

export function SubmissionDetailPage({ id, audience }: { id: string; audience: SubmissionAudience }) {
  const result = useApiData((signal) => getSubmission(audience, id, signal), [audience, id]);
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
          <div className={'registration-detail' + (staff ? ' registration-detail-staff' : '')}>
            <DocumentViewer urls={{
              application: documentUrl(submission.id, 'application'),
              'privacy-consent': documentUrl(submission.id, 'privacy-consent'),
            }} />
            {staff && <SubmittedValues form={submission.form} />}
          </div>
          <div className="registration-actions">
            <Link className="krds-btn medium secondary" to={listPath}>{listTitle}으로</Link>
          </div>
        </>
      )}
    </div>
  );
}
