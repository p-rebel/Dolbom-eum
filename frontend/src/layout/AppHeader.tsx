import type { ReactNode } from 'react';
import { MOCK_API_ENABLED } from '../api/mockFlag';
import { Link } from '../router';

/**
 * 공통 상단(KRDS krds-header). 로그인 전후 모든 화면에 같은 위치로 둔다.
 * D-02:15 가상 데이터 시연 표시는 항상 보이고, 계정·주 메뉴는 로그인 후에만 넘긴다.
 * KRDS 로고·정부 누리집 표시(masthead, identifier)는 실제 정부 누리집으로 오인될 수 있어 쓰지 않는다.
 */
export function AppHeader({ logoTo, account, menu }: { logoTo: string; account?: ReactNode; menu?: ReactNode }) {
  return (
    <>
      <div id="krds-skip-link">
        <a href="#main">본문 바로가기</a>
      </div>
      <header id="krds-header" className={menu ? undefined : 'no-menu'}>
        <div className="header-in">
          <div className="header-container">
            <div className="inner">
              <div className="header-branding">
                <div className="logo app-logo">
                  <Link to={logoTo}>돌봄e음</Link>
                </div>
                <span className="krds-badge bg-light-secondary">가상 사례 시연</span>
                {MOCK_API_ENABLED && <span className="krds-badge bg-light-warning">목업 모드</span>}
                {account}
              </div>
            </div>
          </div>
          {menu}
        </div>
      </header>
    </>
  );
}
