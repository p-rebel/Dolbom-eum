import { useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LeavePrompt } from './components/LeavePrompt';
import { LoginPage } from './features/login/LoginPage';
import { CatalogPage } from './features/catalog/CatalogPage';
import { CaseDetailPage } from './features/cases/CaseDetailPage';
import { CaseListPage } from './features/cases/CaseListPage';
import { NewCasePage } from './features/cases/NewCasePage';
import { NotFoundPage } from './features/placeholder/PlaceholderPage';
import { AppFooter } from './layout/AppFooter';
import { AppHeader } from './layout/AppHeader';
import { AppShell } from './layout/AppShell';
import { matchPath, navigate, usePath } from './router';

export function App() {
  return (
    <AuthProvider>
      <Routes />
      <LeavePrompt />
    </AuthProvider>
  );
}

function Routes() {
  const { state, retry } = useAuth();
  const path = usePath();

  // 로그인 전에는 /login, 로그인 후 /login·/ 는 신청 목록으로 주소를 맞춘다.
  useEffect(() => {
    if (state.status === 'anonymous' && path !== '/login') {
      navigate('/login', { replace: true });
    } else if (state.status === 'authenticated' && (path === '/login' || path === '/')) {
      navigate('/cases', { replace: true });
    }
  }, [state.status, path]);

  // 로그인 상태 확인 중·실패 화면에도 공통 상단·푸터를 둔다(모든 화면 같은 위치).
  if (state.status === 'loading') {
    return (
      <>
        <AppHeader logoTo="/login" />
        <main id="main" className="page-state">
          <div className="krds-spinner" role="status">
            <span className="sr-only">로그인 상태를 확인하는 중입니다.</span>
          </div>
        </main>
        <AppFooter />
      </>
    );
  }

  if (state.status === 'error') {
    return (
      <>
        <AppHeader logoTo="/login" />
        <main id="main" className="page-state">
          <div className="form-group" role="alert">
            <p className="form-hint-invalid">{state.message}</p>
          </div>
          <button type="button" className="krds-btn medium primary" onClick={retry}>
            다시 시도
          </button>
        </main>
        <AppFooter />
      </>
    );
  }

  if (state.status === 'anonymous') {
    return <LoginPage notice={state.notice} />;
  }

  return <AppShell>{renderAuthenticatedPage(path)}</AppShell>;
}

function renderAuthenticatedPage(path: string) {
  if (path === '/cases' || path === '/login' || path === '/') {
    return <CaseListPage />;
  }
  if (path === '/cases/new') {
    return <NewCasePage />;
  }
  if (path === '/catalog') {
    return <CatalogPage />;
  }
  const caseMatch = matchPath('/cases/:caseId', path);
  if (caseMatch) {
    return <CaseDetailPage key={caseMatch.caseId} caseId={caseMatch.caseId} />;
  }
  return <NotFoundPage />;
}
