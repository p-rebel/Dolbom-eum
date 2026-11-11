import { useId, useState, type KeyboardEvent } from 'react';
import { CATALOG_PAGE_SIZE, getCatalogFilters, searchCatalog, type CatalogQuery } from '../../api/catalog';
import { orMissing } from '../../api/labels';
import type { CatalogItem } from '../../api/types';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../components/Feedback';
import { SelectField } from '../../components/FormFields';
import { Pagination } from '../../components/Pagination';
import { TextField } from '../../components/TextField';
import { useApiData } from '../../hooks/useApiData';

interface CatalogSearchProps {
  /** 시작 조건. 계획 안에서는 사례의 시도·시군구를 넣는다(D-02). */
  initial: { sido: string; sigungu: string };
  /** 계획 초안에서 항목을 고를 때만 넘긴다. 없으면 조회 전용(독립 화면·시군구). */
  pick?: {
    selectedIds: string[];
    canAddMore: boolean;
    onSelect: (item: CatalogItem) => void;
  };
  headingLevel?: 'h2' | 'h3';
}

/** UI-05 공단 서비스·기관 조회. 시도·시군구·대분류·검색어로 찾고 출처·기준일을 표시한다. */
export function CatalogSearch({ initial, pick, headingLevel = 'h2' }: CatalogSearchProps) {
  const baseId = useId();
  const startQuery: CatalogQuery = { sido: initial.sido, sigungu: initial.sigungu, categoryLarge: '', q: '', page: 1 };
  /** 입력 중인 조건 */
  const [draft, setDraft] = useState(startQuery);
  /** 검색에 적용된 조건 */
  const [applied, setApplied] = useState(startQuery);
  const [qError, setQError] = useState<string | undefined>();

  const filters = useApiData((signal) => getCatalogFilters(draft.sido, signal), [draft.sido]);
  const results = useApiData((signal) => searchCatalog(applied, signal), [applied]);
  const Heading = headingLevel;

  function runSearch() {
    if (draft.q.trim().length > 100) {
      setQError('검색어는 100자 이내로 입력해 주세요.');
      return;
    }
    setQError(undefined);
    setApplied({ ...draft, page: 1 });
  }

  function reset() {
    setDraft(startQuery);
    setApplied(startQuery);
    setQError(undefined);
  }

  const appliedLabels = [
    applied.sido || '전체 시도',
    applied.sigungu || '전체 시군구',
    applied.categoryLarge || '전체 분류',
    applied.q.trim() && `‘${applied.q.trim()}’`,
  ].filter(Boolean);

  return (
    <div className="catalog-search">
      {/* 계획 초안 폼 안에서도 쓰이므로 form 대신 search 영역으로 두고, 검색어 입력의 Enter를 직접 처리한다. */}
      <div className="filter-form" role="search" aria-label="공단 서비스 검색 조건">
        <div className="filter-grid">
          <SelectField
            id={`${baseId}-sido`}
            label="시도"
            emptyOption="전체"
            fieldSize="medium"
            value={draft.sido}
            options={(filters.data?.sidos ?? []).map((value) => ({ value, label: value }))}
            onChange={(event) => setDraft({ ...draft, sido: event.target.value, sigungu: '' })}
          />
          <SelectField
            id={`${baseId}-sigungu`}
            label="시군구"
            emptyOption={draft.sido ? '전체' : '시도를 먼저 선택'}
            fieldSize="medium"
            value={draft.sigungu}
            disabled={!draft.sido || filters.loading || !!filters.error}
            options={(filters.data?.sigungus ?? []).map((value) => ({ value, label: value }))}
            onChange={(event) => setDraft({ ...draft, sigungu: event.target.value })}
          />
          <SelectField
            id={`${baseId}-category`}
            label="대분류"
            emptyOption="전체"
            fieldSize="medium"
            value={draft.categoryLarge}
            options={(filters.data?.categoriesLarge ?? []).map((value) => ({ value, label: value }))}
            onChange={(event) => setDraft({ ...draft, categoryLarge: event.target.value })}
          />
        </div>
        <div className="filter-search">
          <TextField
            id={`${baseId}-q`}
            label="검색어"
            fieldSize="medium"
            hint="프로그램명 또는 기관명"
            value={draft.q}
            onChange={(event) => setDraft({ ...draft, q: event.target.value })}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                runSearch();
              }
            }}
            error={qError}
          />
          <div className="filter-buttons">
            <button type="button" className={pick ? "krds-btn medium secondary" : "krds-btn medium primary"} onClick={runSearch}>
              검색
            </button>
            <button type="button" className="krds-btn medium tertiary" onClick={reset}>
              조건 초기화
            </button>
          </div>
        </div>
      </div>

      <div className="catalog-results">
        <Heading className="sr-only">검색 결과</Heading>
        {results.data && !results.loading && !results.error && (
          <p className="result-summary" role="status">
            {appliedLabels.join(' · ')} — 총 <strong className="result-count">{results.data.total.toLocaleString('ko-KR')}</strong>건
          </p>
        )}
        {results.loading && !results.data && <LoadingBlock label="공단 서비스를 검색하는 중입니다." />}
        {results.error && <ErrorBlock message={results.error.message} onRetry={results.reload} />}
        {results.data && results.data.items.length === 0 && (
          <EmptyBlock message="검색 결과가 없습니다. 지역이나 검색어를 바꿔 다시 검색해 주세요.">
            <button type="button" className="krds-btn medium secondary" onClick={reset}>
              조건 초기화
            </button>
          </EmptyBlock>
        )}
        {results.data && results.data.items.length > 0 && (
          <>
            <ul className="krds-structured-list type-full catalog-list">
              {results.data.items.map((item) => (
                <CatalogResult key={item.id} item={item} pick={pick} keyword={applied.q.trim()} />
              ))}
            </ul>
            <Pagination
              page={results.data.page}
              pageSize={CATALOG_PAGE_SIZE}
              total={results.data.total}
              onChange={(page) => setApplied({ ...applied, page })}
              label="공단 서비스 검색 결과"
            />
          </>
        )}
      </div>
    </div>
  );
}

function CatalogResult({ item, pick, keyword }: { item: CatalogItem; pick?: CatalogSearchProps['pick']; keyword: string }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const selected = pick?.selectedIds.includes(item.id) ?? false;

  return (
    <li className="structured-item">
      <div className="in">
        <div className="card-top">
          <span className="krds-badge bg-light-primary">{orMissing(item.categoryLarge)}</span>
        </div>
        <div className="card-body">
          <div className="c-text">
            <p className="c-tit">
              <span className="span"><Highlight text={orMissing(item.programName)} keyword={keyword} /></span>
            </p>
            <p className="c-txt"><Highlight text={orMissing(item.providerName)} keyword={keyword} /></p>
            <p className="c-date">
              <strong className="key">출처</strong>
              <span className="value">
                {orMissing(item.sourceName)} · {orMissing(item.referenceDate)} 기준
              </span>
            </p>
          </div>
          {/* 선택 버튼은 계획 초안에서만. 빈 버튼 영역이 남지 않게 함께 렌더링한다. */}
          {pick && (
          <div className="c-btn">
              <button
                type="button"
                className="krds-btn medium secondary"
                disabled={selected || !pick.canAddMore}
                onClick={() => pick.onSelect(item)}
              >
                {selected ? '선택됨' : '선택'}
                <span className="sr-only"> {orMissing(item.programName)}</span>
              </button>
          </div>
          )}
        </div>
        {/* KRDS 펼치기(disclosure). 닫힌 내용은 KRDS가 높이만 0으로 두므로 렌더링하지 않아 Tab 이동에서 빠지게 한다. */}
        <div className={open ? 'krds-disclosure conts-expand-area active' : 'krds-disclosure conts-expand-area'}>
          <button type="button" className="btn-conts-expand" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((value) => !value)}>
            자세히 보기<span className="sr-only"> {orMissing(item.programName)}</span>
          </button>
          <div className="expand-wrap" id={detailId}>
        {open && (
          <div className="expand-in">
          <dl className="info-list catalog-detail">
            <div>
              <dt>분류</dt>
              <dd>
                {orMissing(item.categoryLarge)} &gt; {orMissing(item.categoryMiddle)}
              </dd>
            </div>
            <div>
              <dt>기관 주소</dt>
              <dd>{orMissing(item.providerAddress)}</dd>
            </div>
            <div>
              <dt>연락처</dt>
              <dd>{orMissing(item.providerPhone)}</dd>
            </div>
            <div>
              <dt>출처</dt>
              <dd>
                {item.sourceUrl ? (
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer" title="새 창 열기">
                    {orMissing(item.sourceName)}
                  </a>
                ) : (
                  orMissing(item.sourceName)
                )}{' '}
                · 자료 {item.datasetVersion} · {orMissing(item.referenceDate)} 기준
              </dd>
            </div>
            <div>
              <dt>공단 행 ID</dt>
              <dd>
                <code>{item.id}</code>
              </dd>
            </div>
          </dl>
          </div>
        )}
          </div>
        </div>
      </div>
    </li>
  );
}

/** KRDS 검색 패턴(필수): 검색 결과에서 검색어와 일치하는 부분을 강조한다. */
function Highlight({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword) return <>{text}</>;
  const parts = text.split(keyword);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && <mark className="search-highlight">{keyword}</mark>}
          {part}
        </span>
      ))}
    </>
  );
}
