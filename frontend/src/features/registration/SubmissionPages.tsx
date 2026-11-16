import { useEffect, useState } from 'react';
import {
  APPLICATION_TYPES, CARE_NEEDS, EVIDENCE_LABELS, EVIDENCE_SAMPLES, RELATIONSHIPS,
  documentUrl, evidenceUrl, getSubmission, getSubmissions,
  type ApplicationForm, type Submission, type SubmissionAudience,
} from '../../api/registration';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../components/Feedback';
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

/**
 * KRDS 신청 서비스 패턴 ‘완료’(krds.go.kr service_04_07, 예시 sample_appl_04):
 * ‘[서비스] 신청이 완료되었습니다’ 큰 문구(‘완료’ 강조) → 핵심 정보 요약 → 다시 신청하기·신청 내역 보기 → 관련 서비스 링크.
 * 전에는 제출 뒤 상세 화면 제목만 ‘모의 제출 완료’로 바뀌고 완료를 알리는 강조가 없었다(11/16).
 */
function SubmissionComplete({ submission }: { submission: Submission }) {
  return (
    <section className="comp-wrap" aria-labelledby="comp-title">
      <h2 id="comp-title" className="comp-msg-wrap">
        <span className="comp-msg-icon" aria-hidden="true" />
        돌봄 신청이 <span className="point">완료</span>되었습니다.
      </h2>
      <p className="comp-msg-sub">접수번호로 진행 상황을 확인할 수 있습니다. 관할 읍면동에서 확인한 뒤 안내 방법으로 연락드립니다.</p>
      <ul className="comp-info-box">
        <li><div className="key">접수번호</div><div className="value">{submission.submissionNumber}</div></li>
        <li><div className="key">대상자</div><div className="value">{submission.beneficiaryName}</div></li>
        <li><div className="key">신청 유형</div><div className="value">{APPLICATION_TYPES[submission.applicationType]}</div></li>
        <li><div className="key">접수처</div><div className="value">가상 통합돌봄 접수처 · {submission.region.name}</div></li>
        <li><div className="key">제출 시각</div><div className="value">{DATE_TIME.format(new Date(submission.submittedAt))}</div></li>
      </ul>
      <div className="comp-btn-wrap">
        <Link className="krds-btn xlarge tertiary" to="/apply/new">다시 신청하기</Link>
        <Link className="krds-btn xlarge primary" to="/my/applications">신청 내역 보기</Link>
      </div>
      <dl className="comp-link-box">
        <dt>
          <p className="tit">이런 서비스는 어떠세요?</p>
          <p className="txt">돌봄 신청과 함께 확인하면 좋은 안내입니다.</p>
        </dt>
        <dd>
          <Link to="/apply" className="krds-btn medium text">돌봄 신청 안내 <i className="svg-icon ico-angle right" aria-hidden="true" /></Link>
          <Link to="/" className="krds-btn medium text">통합돌봄 한눈에 보기 <i className="svg-icon ico-angle right" aria-hidden="true" /></Link>
          <a href="https://www.mohw.go.kr/menu.es?mid=a60200000000" className="krds-btn medium text" target="_blank" rel="noreferrer" title="새 창 열기">
            보건복지부 통합돌봄 이용안내 <i className="svg-icon ico-angle right" aria-hidden="true" />
          </a>
        </dd>
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
  // 제출 직후 한 번만 완료 안내를 보이고 주소에서 done=1을 지운다. 새로고침·뒤로가기·즐겨찾기로 다시 열면 ‘신청 상세’다.
  const [justSubmitted] = useState(() => !staff && new URLSearchParams(window.location.search).get('done') === '1');
  useEffect(() => {
    if (justSubmitted) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [justSubmitted]);
  return (
    <div className="inner page registration-submissions">
      <PageHead parents={[{ label: listTitle, to: listPath }]} title={staff ? '모의 신청 상세' : justSubmitted ? '신청 완료' : '신청 상세'} />
      {result.loading && <LoadingBlock label="제출 서류를 불러오는 중" />}
      {result.error && <ErrorBlock message={result.error.message} onRetry={result.reload} />}
      {submission && !result.error && justSubmitted && <SubmissionComplete submission={submission} />}
      {submission && !result.error && (
        <>
          {/* 방금 제출했으면 접수번호·접수처·시각은 위 완료 안내에 있으므로 서류만 이어서 보인다. */}
          {justSubmitted ? <h2 className="registration-submitted-docs">제출한 서류</h2> : (
          <section className="registration-receipt" aria-label="모의 제출 정보">
            <div><p>모의 제출번호</p><strong>{submission.submissionNumber}</strong></div>
            <div><p>수신처</p><strong>가상 통합돌봄 접수처 · {submission.region.name}</strong></div>
            <div><p>제출 시각</p><strong>{DATE_TIME.format(new Date(submission.submittedAt))}</strong></div>
          </section>
          )}
          {staff && (submission.evidenceSource
            ? <VerificationPanel key={submission.id} id={submission.id} sample={submission.form.evidenceSample ?? null} />
            : <p className="registration-verification-empty">첨부된 OCR 대조용 가상 증빙이 없습니다.</p>)}
          {!staff && submission.evidenceSource && (
            <p className="registration-verification-empty">제출한 가상 증빙 ·{' '}
              <a className="registration-text-link" href={evidenceUrl(submission.id)} target="_blank" rel="noreferrer">
                {submission.form.evidenceSample ? EVIDENCE_SAMPLES[submission.form.evidenceSample] : '첨부한 가상 증빙 사진'} (새 창)
              </a>
            </p>
          )}
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
