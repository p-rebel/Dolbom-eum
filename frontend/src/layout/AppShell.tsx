import type { ReactNode } from 'react';
import { MOCK_API_ENABLED } from '../api/mockFlag';
import { useAccount } from '../auth/AuthContext';
import { Link, usePath } from '../router';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import { AccountArea, PublicMenu } from './PublicNav';

const STAFF_MENU = [
  { to: '/cases', label: '신청 목록', match: (path: string) => path.startsWith('/cases') },
  { to: '/catalog', label: '공단 서비스 조회', match: (path: string) => path === '/catalog' },
  ...(MOCK_API_ENABLED ? [] : [{ to: '/intake', label: '가상 제출함', match: (path: string) => path.startsWith('/intake') }]),
];

/**
 * 로그인 후 화면 틀. 공통 상단(AppHeader)에 계정 역할·관할, 로그아웃(D-02:15)과 주 메뉴(krds-main-menu)를 더한다.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const account = useAccount();
  const path = usePath();

  return (
    <>
      <AppHeader
        // 담당자는 업무 영역 안에서 로고를 누르면 신청 목록으로, 신청자는 공개 누리집 홈으로 간다(11/16).
        logoTo={account.role === 'APPLICANT' ? '/' : '/cases'}
        // 계정 영역은 공개 화면과 같은 KRDS 내 메뉴(이름·바로가기·로그아웃)를 쓴다(11/16).
        account={<AccountArea inWorkArea />}
        menu={account.role === 'APPLICANT' ? <PublicMenu /> : (
          <nav className="krds-main-menu" aria-label="주 메뉴">
            <div className="inner">
              <ul className="gnb-menu">
                {STAFF_MENU.map((item) => {
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
        )}
      />
      <main id="main" className="app-main">
        {children}
      </main>
      <AppFooter />
    </>
  );
}
