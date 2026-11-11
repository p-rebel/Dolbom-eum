import type { ReactNode } from 'react';
import { Link, PageTitle } from '../router';

interface Crumb {
  label: string;
  to: string;
}

/**
 * 쪽 머리: KRDS 경로 표시(breadcrumb)와 쪽 제목.
 * KRDS 체크리스트(브레드크럼): 메인·1수준 화면에는 쓰지 않고, 첫 항목은 메인 화면,
 * 마지막 항목은 현재 화면의 상위 화면 링크다. 현재 화면은 넣지 않는다.
 * 이 앱의 메인 화면은 신청 목록이라 첫 항목을 ‘신청 목록’(홈 표시)으로 둔다.
 */
export function PageHead({ parents, title, actions, titleId }: { parents?: Crumb[]; title: ReactNode; actions?: ReactNode; titleId?: string }) {
  return (
    <div className="page-head">
      {parents && parents.length > 0 && (
        <nav className="krds-breadcrumb-wrap" aria-label="현재 경로">
          <ol className="breadcrumb">
            {parents.map((crumb, index) => (
              <li key={crumb.to} className={index === 0 ? 'home' : undefined}>
                <Link to={crumb.to} className="txt">
                  {crumb.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="page-title-row">
        <PageTitle id={titleId}>{title}</PageTitle>
        {actions}
      </div>
    </div>
  );
}
