import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import {
  EVIDENCE_SAMPLES, VERIFICATION_FIELDS, evidenceUrl, getVerification, recordVerification, saveVerificationReview,
  type ComparisonRow, type ComparisonStatus, type EvidenceSample, type VerificationField,
} from '../../api/registration';
import { ErrorBlock, FormMessage, LoadingBlock } from '../../components/Feedback';
import { TextField } from '../../components/TextField';
import { useApiData } from '../../hooks/useApiData';

const RESULT_LABELS: Record<ComparisonStatus, string> = {
  MATCH: '일치', DIFFERENT: '불일치', NEEDS_REVIEW: '확인 필요',
};
const DATE_TIME = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
});

function ComparisonResult({ result }: { result: ComparisonStatus }) {
  return <strong className={'registration-verification-result result-' + result.toLowerCase()}>{RESULT_LABELS[result]}</strong>;
}

type ReviewDraft = { field: VerificationField; value: string; note: string };

export function VerificationPanel({ id, sample, revision, latest }: {
  id: string; sample: EvidenceSample | null; revision: number; latest: boolean;
}) {
  const result = useApiData((signal) => getVerification(id, revision, signal), [id, revision]);
  const [busy, setBusy] = useState<'ocr' | 'review' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const verification = result.data;
  const image = evidenceUrl(id, revision);

  async function runVerification() {
    if (busy) return;
    setBusy('ocr');
    setError(null);
    setNotice(null);
    try {
      const { readEvidence } = await import('./evidenceOcr');
      const observations = await readEvidence(image, sample !== null);
      result.setData(await recordVerification(id, revision, observations));
      setNotice('OCR 대조 결과를 저장했습니다.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '증빙을 판독하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  }

  function openReview(row: ComparisonRow) {
    const saved = verification?.reviews[row.field];
    setDraft({ field: row.field, value: (saved ? saved.value : row.scanned) ?? '', note: saved?.note ?? '' });
    setError(null);
    setNotice(null);
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !draft || !verification) return;
    const note = draft.note.trim();
    if (!note) {
      setError('원본을 확인한 내용을 입력해 주세요.');
      return;
    }
    setBusy('review');
    setError(null);
    try {
      result.setData(await saveVerificationReview(id, verification.id, draft.field, { value: draft.value.trim() || null, note }));
      setDraft(null);
      setNotice('담당자 확인 내용을 저장했습니다.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        result.reload();
        setDraft(null);
      }
      setError(cause instanceof ApiError ? cause.message : '확인 내용을 저장하지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="registration-verification" aria-labelledby="verification-heading">
      <div className="registration-section-title">
        <h2 id="verification-heading">가상 증빙 대조</h2>
        {latest && <button type="button" className="krds-btn medium primary" disabled={Boolean(busy || draft || result.loading || result.error)}
          onClick={runVerification}>{busy === 'ocr' ? '증빙을 판독하는 중…' : verification ? 'OCR 다시 대조' : 'OCR 자동 대조'}</button>}
      </div>
      <div className="registration-verification-body">
        <figure>
          <img src={image} alt={sample ? EVIDENCE_SAMPLES[sample] : '신청자가 제출한 가상 증빙 사진'} />
          <figcaption><a className="registration-text-link" href={image} target="_blank" rel="noreferrer">증빙 원본 열기 (새 창)</a></figcaption>
        </figure>
        <div className="registration-verification-details">
          <p>{sample ? '신청값을 증빙 판독값 및 가상 기준값과 각각 대조합니다.' : '신청값을 제출된 사진의 판독값과 대조합니다.'} 흐릿하거나 찾기 어려운 항목은 원본을 확인해 주세요.</p>
          {result.loading && <LoadingBlock label="기존 대조 결과를 불러오는 중" />}
          {result.error && <ErrorBlock message={result.error.message} onRetry={result.reload} />}
          {error && <FormMessage tone="error">{error}</FormMessage>}
          {notice && busy === null && <FormMessage tone="success">{notice}</FormMessage>}
          {busy === 'ocr' && <p role="status">가상 증빙 이미지에서 성명, 생년월일, 식별자, 주소를 읽고 있습니다.</p>}
          {verification && !result.loading && !result.error && (
            <>
              <ul className="registration-verification-rows" aria-label="항목별 대조 결과">
                {verification.rows.map((row) => {
                  const label = VERIFICATION_FIELDS[row.field];
                  const review = verification.reviews[row.field];
                  return (
                    <li key={row.field} aria-label={label}>
                      <div className="registration-section-title">
                        <h3>{label}</h3>
                        {latest && <button type="button" className="krds-btn small secondary" disabled={Boolean(busy || draft)}
                          aria-label={label + ' 원본 확인'} onClick={() => openReview(row)}>원본 확인</button>}
                      </div>
                      <dl className="registration-verification-values">
                        <div><dt>신청값</dt><dd>{row.submitted}</dd></div>
                        <div><dt>OCR 판독값</dt><dd>{row.scanned ?? '판독값 없음'} <ComparisonResult result={row.evidenceResult} /></dd></div>
                        {row.referenceResult && <div><dt>가상 기준값</dt><dd>{row.reference} <ComparisonResult result={row.referenceResult} /></dd></div>}
                      </dl>
                      {review && <p className="registration-verification-review">
                        <strong>담당자 확인</strong> · {review.value ?? '판독 불가'} <ComparisonResult result={review.result} />
                        <span>{review.note}</span>
                        <small>{review.reviewer} · {DATE_TIME.format(new Date(review.reviewedAt))}</small>
                      </p>}
                      {draft?.field === row.field && (
                        <form className="registration-verification-review" onSubmit={submitReview}>
                          <TextField id="reviewed-value" label="원본에서 확인한 값" value={draft.value} maxLength={100}
                            hint="판독이 어려우면 비워 두세요." autoFocus disabled={busy === 'review'}
                            onChange={(event) => setDraft({ ...draft, value: event.target.value })} />
                          <TextField id="review-note" label="확인 내용" value={draft.note} maxLength={160} required disabled={busy === 'review'}
                            onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
                          <div className="registration-verification-actions">
                            <button type="button" className="krds-btn small secondary" disabled={busy === 'review'}
                              onClick={() => { setDraft(null); setError(null); }}>취소</button>
                            <button type="submit" className="krds-btn small primary" disabled={busy === 'review'}>확인 저장</button>
                          </div>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="registration-verification-time">최근 OCR 대조 · {DATE_TIME.format(new Date(verification.comparedAt))}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
