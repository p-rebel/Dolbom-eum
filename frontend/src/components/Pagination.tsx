/**
 * KRDS 페이지네이션(pagination). 쪽 이동은 버튼으로 처리한다.
 * KRDS 체크리스트: 첫·마지막 화면과 이전·다음 이동 수단, 전체 화면 수, 현재 쪽 강조,
 * 말줄임표 포함 7개 이내 번호(작은 화면 기준)를 지킨다.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  label,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  label: string;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return null;
  }

  // 1 … (현재-1) 현재 (현재+1) … 마지막. 쪽 수가 7 이하이면 모두 표시한다.
  const items: (number | 'dots')[] = [];
  if (lastPage <= 7) {
    for (let number = 1; number <= lastPage; number += 1) items.push(number);
  } else {
    const start = Math.max(2, Math.min(page - 1, lastPage - 4));
    const end = Math.min(lastPage - 1, Math.max(page + 1, 5));
    items.push(1);
    if (start > 2) items.push('dots');
    for (let number = start; number <= end; number += 1) items.push(number);
    if (end < lastPage - 1) items.push('dots');
    items.push(lastPage);
  }

  return (
    <nav className="pagination-area" aria-label={`${label} 쪽 이동`}>
      <div className="krds-pagination">
        <button
          type="button"
          className={['page-navi', 'prev', page <= 1 && 'disabled'].filter(Boolean).join(' ')}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          이전
        </button>
        <div className="page-links">
          {items.map((item, index) =>
            item === 'dots' ? (
              <span key={`dots-${index}`} className="page-link link-dot" aria-hidden="true" />
            ) : (
              <button
                key={item}
                type="button"
                className={['page-link', item === page && 'active'].filter(Boolean).join(' ')}
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onChange(item)}
              >
                {item === page && <span className="sr-only">현재페이지 </span>}
                {item}
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          className={['page-navi', 'next', page >= lastPage && 'disabled'].filter(Boolean).join(' ')}
          disabled={page >= lastPage}
          onClick={() => onChange(page + 1)}
        >
          다음
        </button>
      </div>
      <p className="pagination-total">
        전체 {lastPage}쪽 중 {page}쪽
      </p>
    </nav>
  );
}
