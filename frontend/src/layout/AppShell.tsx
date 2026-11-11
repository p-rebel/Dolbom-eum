import { useState, type ReactNode } from 'react';
import { ROLE_LABEL, useAccount, useAuth } from '../auth/AuthContext';
import { confirmLeave, Link, usePath } from '../router';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';

const MENU = [
  { to: '/cases', label: '신청 목록', match: (path: string) => path.startsWith('/cases') },
  { to: '/catalog', label: '공단 서비스 조회', match: (path: string) => path === '/catalog' },
];

/**
 * 로그인 후 화면 틀. 공통 상단(AppHeader)에 계정 역할·관할, 로그아웃(D-02:15)과 주 메뉴(krds-main-menu)를 더한다.
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
    try {
      await logout();
    } catch {
      // 서버 요청이 실패해도 화면은 이미 로그인 화면으로 바뀌었다(AuthContext logout).
    }
  }

  return (
    <>
      <AppHeader
        logoTo="/cases"
        account={
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
        }
        menu={
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
        }
      />
      <main id="main" className="app-main">
        {children}
      </main>
      <AppFooter />
    </>
  );
}
