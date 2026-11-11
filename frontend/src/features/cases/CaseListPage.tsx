import { useState } from 'react';
import { listCases } from '../../api/cases';
import { STATUS_LABEL, STATUS_ORDER } from '../../api/labels';
import type { CaseStatus } from '../../api/types';
import { useAccount } from '../../auth/AuthContext';
import { EmptyBlock, ErrorBlock, LoadingBlock, StatusBadge } from '../../components/Feedback';
import { SelectField } from '../../components/FormFields';
import { Pagination } from '../../components/Pagination';
import { useApiData } from '../../hooks/useApiData';
import { PageHead } from '../../layout/PageHead';
import { Link, navigate } from '../../router';

const PAGE_SIZE = 20;

/** UI-02 신청 목록. 관할 내 신청을 접수일 최신순으로 보여준다. */
export function CaseListPage() {
  const account = useAccount();
  /** 적용된 조건 */
  const [status, setStatus] = useState<CaseStatus | ''>('');
  /** 선택 중인 조건. KRDS: 셀렉트 값을 바꿨다고 조회하지 않고 ‘조회’ 버튼으로 적용한다. */
  const [draftStatus, setDraftStatus] = useState<CaseStatus | ''>('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApiData(
    (signal) => listCases({ status, page, pageSize: PAGE_SIZE }, signal),
    [status, page],
  );

  function changeStatus(value: CaseStatus | '') {
    setDraftStatus(value);
    setStatus(value);
    setPage(1);
  }

  return (
    <div className="inner page">
      <PageHead
        title="신청 목록"
        actions={
          account.role === 'TOWN' && (
            <Link to="/cases/new" className="krds-btn medium primary">
              새 접수
            </Link>
          )
        }
      />

      <section className="search-panel" aria-labelledby="case-filter-title">
        <h2 id="case-filter-title" className="sr-only">
          조회 조건
        </h2>
        <div className="filter-row">
          <SelectField
            id="case-status"
            label="진행 상태"
            emptyOption="전체"
            value={draftStatus}
            options={STATUS_ORDER.map((value) => ({ value, label: STATUS_LABEL[value] }))}
            onChange={(event) => setDraftStatus(event.target.value as CaseStatus | '')}
          />
          <button type="button" className="krds-btn medium secondary" onClick={() => changeStatus(draftStatus)}>
            조회
          </button>
          {status && (
            <button type="button" className="krds-btn medium tertiary" onClick={() => changeStatus('')}>
              조건 초기화
            </button>
          )}
        </div>
      </section>

      <section className="page-section" aria-labelledby="case-list-title">
        <h2 id="case-list-title" className="sr-only">
          신청 건
        </h2>
        {/* KRDS 신청목록 패턴: 결과 수는 조건 영역 밖, 목록 바로 위에 둔다. */}
        {data && !loading && !error && (
          <p className="result-summary" role="status">
            {status ? `진행 상태 ‘${STATUS_LABEL[status]}’ · ` : ''}총 <strong className="result-count">{data.total}</strong>건
          </p>
        )}
        {loading && !data && <LoadingBlock label="신청 목록을 불러오는 중입니다." />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}
        {data && data.items.length === 0 && (
          <EmptyBlock message={status ? '조건에 맞는 신청이 없습니다.' : '관할에 접수된 신청이 없습니다.'}>
            {status ? (
              <button type="button" className="krds-btn medium secondary" onClick={() => changeStatus('')}>
                조건 초기화
              </button>
            ) : (
              account.role === 'TOWN' && (
                <Link to="/cases/new" className="krds-btn medium secondary">
                  새 접수
                </Link>
              )
            )}
          </EmptyBlock>
        )}
        {data && data.items.length > 0 && (
          <>
            <div className="krds-table-wrap mob-scroll">
              <table className="tbl col data">
                <caption>관할 신청 목록. 접수번호, 가상 대상자, 접수일, 진행 상태로 구성되어 있습니다.</caption>
                <thead>
                  <tr>
                    <th scope="col">접수번호</th>
                    <th scope="col">가상 대상자</th>
                    <th scope="col">접수일</th>
                    <th scope="col">진행 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id} className="row-link" onClick={() => navigate(`/cases/${item.id}`)}>
                      <th scope="row">
                        <Link to={`/cases/${item.id}`} onClick={(event) => event.stopPropagation()}>
                          {item.receiptNumber}
                        </Link>
                      </th>
                      <td>{item.beneficiaryName}</td>
                      <td>{item.receivedOn}</td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} label="신청 목록" />
          </>
        )}
      </section>
    </div>
  );
}
