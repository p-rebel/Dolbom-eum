import { useState, type ReactNode } from 'react';
import { MOCK_API_ENABLED } from '../api/mockFlag';
import { ROLE_LABEL, useAccount, useAuth } from '../auth/AuthContext';
import { confirmLeave, Link, usePath } from '../router';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';

const STAFF_MENU = [
  { to: '/cases', label: '신청 목록', match: (path: string) => path.startsWith('/cases') },
  { to: '/catalog', label: '공단 서비스 조회', match: (path: string) => path === '/catalog' },
  ...(MOCK_API_ENABLED ? [] : [{ to: '/intake', label: '가상 제출함', match: (path: string) => path.startsWith('/intake') }]),
];
const APPLICANT_MENU = [
  { to: '/apply/new', label: '신청서 작성', match: (path: string) => path === '/apply/new' },
  { to: '/my/applications', label: '내 신청 현황', match: (path: string) => path.startsWith('/my/applications') },
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
  const menu = account.role === 'APPLICANT' ? APPLICANT_MENU : STAFF_MENU;

  async function handleLogout() {
    // 저장하지 않은 입력이 있으면 로그아웃 전에 확인한다.
    if (!(await confirmLeave())) {
      return;
    }
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // 로컬 세션 표시와 화면 이동은 AuthContext에서 처리한다.
    }
  }

  return (
    <>
      <AppHeader
        logoTo="/"
        account={
          <div className="header-actions app-account">
            <p>
              <strong>{account.displayName}</strong>
              <span className="app-account-meta">
                {ROLE_LABEL[account.role]}{jurisdiction ? ' · 관할 ' + jurisdiction : ''}
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
                {menu.map((item) => {
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
