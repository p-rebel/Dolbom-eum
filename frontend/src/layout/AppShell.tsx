import { useState, type ReactNode } from 'react';
import { MOCK_API_ENABLED } from '../api/mockFlag';
import { ROLE_LABEL, useAccount, useAuth } from '../auth/AuthContext';
import { confirmLeave, Link, usePath } from '../router';
import { AppFooter } from './AppFooter';

const MENU = [
  { to: '/cases', label: '신청 목록', match: (path: string) => path.startsWith('/cases') },
  { to: '/catalog', label: '공단 서비스 조회', match: (path: string) => path === '/catalog' },
];

/**
 * 로그인 후 공통 상단. D-02:15 가상 데이터 시연 표시, 계정 역할·관할, 로그아웃.
 * KRDS 헤더(krds-header)와 주 메뉴(krds-main-menu) 구조를 쓴다.
 * KRDS 로고·정부 누리집 표시(masthead, identifier)는 실제 정부 누리집으로 오인될 수 있어 쓰지 않는다.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const account = useAccount();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const path = usePath();
  const jurisdiction = account.townCode ?? account.districtCode;

  async function handleLogout() {
    // 저장하지 않은 입력이 있으면 로그아웃 전에 확인한다.
    if (!(await confirmLeave())) {
      return;
    }
    setLoggingOut(true);
    await logout();
  }

  return (
    <>
      <div id="krds-skip-link">
        <a href="#main">본문 바로가기</a>
      </div>
      <header id="krds-header">
        <div className="header-in">
          <div className="header-container">
            <div className="inner">
              <div className="header-branding">
                <div className="logo app-logo">
                  <Link to="/cases">돌봄e음</Link>
                </div>
                <span className="krds-badge bg-light-secondary">가상 사례 시연</span>
                {MOCK_API_ENABLED && <span className="krds-badge bg-light-warning">목업 모드</span>}
                <div className="header-actions app-account">
                  <p>
                    <strong>{account.displayName}</strong>
                    <span className="app-account-meta">
                      {ROLE_LABEL[account.role]} · 관할 {jurisdiction}
                    </span>
                  </p>
                  <button type="button" className="krds-btn small tertiary" onClick={handleLogout} disabled={loggingOut}>
                    {loggingOut ? '로그아웃 중…' : '로그아웃'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <nav className="krds-main-menu" aria-label="주 메뉴">
            <div className="inner">
              <ul className="gnb-menu">
                {MENU.map((item) => {
                  const current = item.match(path);
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className={['gnb-main-trigger', 'is-link', current && 'active'].filter(Boolean).join(' ')}
                        aria-current={current ? 'page' : undefined}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>
        </div>
      </header>
      <main id="main" className="app-main">
        {children}
      </main>
      <AppFooter />
    </>
  );
}
