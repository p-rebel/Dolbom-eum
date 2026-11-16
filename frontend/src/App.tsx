import { useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { isApplicantPath, isStaffPath, loginAudienceFor, loginDestination, loginPathFor } from './auth/loginRoutes';
import { LeavePrompt } from './components/LeavePrompt';
import { LoginPage } from './features/login/LoginPage';
import { CatalogPage } from './features/catalog/CatalogPage';
import { CaseDetailPage } from './features/cases/CaseDetailPage';
import { CaseListPage } from './features/cases/CaseListPage';
import { NewCasePage } from './features/cases/NewCasePage';
import { PublicHome } from './features/registration/PublicHome';
import { ApplicantCorrectionPage, ApplicationPage } from './features/registration/ApplicationPage';
import { SubmissionDetailPage, SubmissionListPage } from './features/registration/SubmissionPages';
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
  const isPublic = path === '/' || path === '/apply';
  const loginAudience = loginAudienceFor(path);
  const wrongRole = state.status === 'authenticated'
    && (state.account.role === 'APPLICANT' ? isStaffPath(path) : isApplicantPath(path));

  useEffect(() => {
    if (isPublic) return;
    if ((state.status === 'anonymous' && loginAudience === null) || wrongRole) {
      navigate(loginPathFor(path), { replace: true, force: true });
    }
    if (state.status === 'authenticated' && loginAudience
      && (state.account.role === 'APPLICANT') === (loginAudience === 'applicant')) {
      navigate(loginDestination(loginAudience), { replace: true });
    }
  }, [isPublic, loginAudience, path, state, wrongRole]);

  if (isPublic) return <PublicHome guide={path === '/apply'} />;

  // 로그인 상태 확인 중·실패 화면에도 공통 상단·푸터를 둔다(모든 화면 같은 위치).
  if (state.status === 'loading') {
    return (
      <>
        <AppHeader logoTo="/" />
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
        <AppHeader logoTo="/" />
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

  if (loginAudience || state.status === 'anonymous' || wrongRole) {
    const audience = loginAudience ?? (isApplicantPath(path) ? 'applicant' : 'staff');
    return <LoginPage key={audience} audience={audience} notice={state.status === 'anonymous' ? state.notice : null} />;
  }

  return <AppShell>{renderAuthenticatedPage(path, state.account.role === 'APPLICANT')}</AppShell>;
}

function renderAuthenticatedPage(path: string, applicant: boolean) {
  if (applicant) {
    if (path === '/apply/new') return <ApplicationPage />;
    if (path === '/my/applications') return <SubmissionListPage audience="applicant" />;
    const correction = matchPath('/my/applications/:id/revise', path);
    if (correction) return <ApplicantCorrectionPage key={correction.id} id={correction.id} />;
    const match = matchPath('/my/applications/:id', path);
    if (match) return <SubmissionDetailPage key={match.id} id={match.id} audience="applicant" />;
    return <NotFoundPage home="/my/applications" />;
  }

  if (path === '/cases') {
    return <CaseListPage />;
  }
  if (path === '/cases/new') {
    return <NewCasePage />;
  }
  if (path === '/catalog') {
    return <CatalogPage />;
  }
  if (path === '/intake') return <SubmissionListPage audience="staff" />;
  const submission = matchPath('/intake/:id', path);
  if (submission) return <SubmissionDetailPage key={submission.id} id={submission.id} audience="staff" />;
  const caseMatch = matchPath('/cases/:caseId', path);
  if (caseMatch) {
    return <CaseDetailPage key={caseMatch.caseId} caseId={caseMatch.caseId} />;
  }
  return <NotFoundPage />;
}
