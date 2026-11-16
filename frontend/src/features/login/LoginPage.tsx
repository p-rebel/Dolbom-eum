import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { MOCK_API_ENABLED, MOCK_PASSWORD } from '../../api/mockFlag';
import { useAuth } from '../../auth/AuthContext';
import type { LoginAudience } from '../../auth/loginRoutes';
import { AppFooter } from '../../layout/AppFooter';
import { AppHeader } from '../../layout/AppHeader';
import { AccountArea, PublicMenu } from '../../layout/PublicNav';
import { TextField } from '../../components/TextField';
import { Link, PageTitle } from '../../router';
import { HealthStatus } from '../health/HealthStatus';
import { ApplicantSignupForm } from './ApplicantSignupForm';
import { siteText } from '../../siteConfig';

/**
 * 오른쪽 안내 칸 소개(D-01 첫 문단 요약). 담당자·신청자 화면 모두 한 문단으로 맞춘다(11/16).
 * 전에는 담당자 화면에만 기능 목록 세 줄이 더 있어 안내 칸이 입력 칸보다 길어지고 아래 여백이 어긋났다.
 */
const ABOUT_INTRO = '읍면동·시군구 담당자가 통합돌봄 신청을 접수부터 최초 모니터링까지 기록하는 업무 화면입니다.';
const ABOUT_APPLICANT = siteText('본인이나 보호자가 가상 정보로 신청서를 작성하고 제출한 서류를 확인하는 시연 서비스입니다.', '본인이나 보호자가 돌봄 신청서를 작성하고 제출한 서류와 진행 상황을 확인하는 서비스입니다.');

type Field = 'username' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

/** UI-01 가상 계정 로그인과 신청자 가입. */
export function LoginPage({ notice, audience }: { notice: string | null; audience: LoginAudience }) {
  const { login } = useAuth();
  const isApplicant = audience === 'applicant';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [mockReset, setMockReset] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const loginNotice = signupComplete ? '가입이 완료되었습니다. 등록한 비밀번호로 로그인해 주세요.' : notice;

  function handleCreated(newUsername: string) {
    setUsername(newUsername);
    setPassword('');
    setFieldErrors({});
    setFormError(null);
    setSignupComplete(true);
    setShowSignup(false);
  }

  function focusField(field: Field) {
    (field === 'username' ? usernameRef : passwordRef).current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const errors: FieldErrors = {};
    if (username.trim() === '') {
      errors.username = '계정명을 입력해 주세요.';
    }
    if (password === '') {
      errors.password = '비밀번호를 입력해 주세요.';
    }
    setFieldErrors(errors);
    setFormError(null);
    const firstInvalid = (['username', 'password'] as const).find((field) => errors[field]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password, audience);
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.status === 422 && (error.field === 'username' || error.field === 'password')) {
        setFieldErrors({ [error.field]: '입력값을 확인해 주세요.' });
        focusField(error.field);
      } else {
        // 입력값은 지우지 않는다(D-02, KRDS 오류 패턴).
        setFormError(error instanceof ApiError ? error.message : '로그인하지 못했습니다. 다시 시도해 주세요.');
      }
    }
  }

  return (
    <>
    <AppHeader logoTo="/" account={<AccountArea />} menu={<PublicMenu />} />
    <main id="main" className="login-page">
      {/* KRDS 피그마 서비스패턴_로그인 Step 3: 792px 본문, 작은 안내 + 큰 제목, 위아래 구분선 안에 왼쪽 입력·오른쪽 안내 */}
      <section className="login-box" aria-labelledby="login-title">
        <div className="login-head">
          <p className="login-service">{siteText('돌봄e음 · 가상 사례 시연', '돌봄e음')}</p>
          {/* 제목 옆에 서버 연결 상태(DEV-01:85 실행 확인 절차의 ‘API 연결됨’). 제목 글자에는 넣지 않는다. */}
          <div className="login-title-row">
            <PageTitle id="login-title" key={showSignup ? 'signup' : 'login'}>
              {showSignup ? '신청자 회원가입' : isApplicant ? '신청자 로그인' : '공무원·관리자 로그인'}
            </PageTitle>
            <span className="login-title-dot" aria-hidden="true">
              ·
            </span>
            <HealthStatus />
          </div>
        </div>

        <div className="login-panel">
          <div className="login-main">
            {showSignup ? (
              <ApplicantSignupForm onCreated={handleCreated} onCancel={() => setShowSignup(false)} />
            ) : (
              <>
                {loginNotice && (
                  <div className="form-group" role="status">
                    <p className="form-hint-information">{loginNotice}</p>
                  </div>
                )}
                <form className="login-form" onSubmit={handleSubmit} noValidate>
                  <div className="fieldset">
                    <TextField
                      id="login-username"
                      label="계정명"
                      hint={isApplicant ? '예: demo-applicant-a' : '예: demo-town-a'}
                      name="username"
                      autoComplete="username"
                      value={username}
                      onChange={(event) => { setUsername(event.target.value); setFieldErrors((current) => ({ ...current, username: undefined })); }}
                      error={fieldErrors.username}
                      inputRef={usernameRef}
                    />
                    <TextField
                      id="login-password"
                      label="비밀번호"
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => { setPassword(event.target.value); setFieldErrors((current) => ({ ...current, password: undefined })); }}
                      error={fieldErrors.password}
                      inputRef={passwordRef}
                    />
                  </div>
                  {/* 계정·비밀번호가 틀리면 입력칸 바로 아래, 로그인 버튼 위에 알린다(폼 맨 위에 두면 눈길이 닿지 않고 입력칸이 밀린다). */}
                  {formError && (
                    <div className="form-group login-error" role="alert">
                      <p className="form-hint-invalid">{formError}</p>
                    </div>
                  )}
                  {/* KRDS 피그마 로그인 버튼은 입력칸과 같은 56px(large), 입력 열 전체 너비 */}
                  <button type="submit" className="krds-btn large primary login-submit" disabled={submitting}>
                    {submitting ? '로그인 중…' : '로그인'}
                  </button>
                </form>
                {isApplicant && !MOCK_API_ENABLED && (
                  <button
                    type="button"
                    className="krds-btn medium tertiary login-submit"
                    onClick={() => setShowSignup(true)}
                    disabled={submitting}
                  >
                    신청자 회원가입
                  </button>
                )}
              </>
            )}
          </div>

        {/*
          오른쪽 안내 열(KRDS 피그마 로그인 Step 3): 서비스 소개. 2026-11-13 김재현 결정 — DEV-03 4절·5절.
          문구는 D-01 첫 문단과 REQ-02~07을 줄인 고정 문구다. 계정·비밀번호는 안내하지 않는다.
        */}
        <aside className="login-aside" aria-labelledby="login-about-title">
          {/* 서비스 소개는 KRDS 안내 상자(회색 바탕)로 둔다. 국민건강보험 로그인 화면의 안내 상자 참고 */}
          <div className="login-about-box">
            <h2 id="login-about-title" className="login-about-title">
              돌봄e음은
            </h2>
            <p className="login-about">{isApplicant ? ABOUT_APPLICANT : ABOUT_INTRO}</p>
            <p className="login-about login-other-audience">
              <Link to={isApplicant ? '/login/staff' : '/login/applicant'}>
                {isApplicant ? '공무원·관리자 로그인' : '신청자 로그인'}
              </Link>
            </p>
          </div>

        </aside>
        </div>

        {/* 목업 모드 안내는 소개 상자와 분리한다(높이 맞춤·영역 이름 유지). ‘목업 모드’ 배지는 공통 상단에 있다. */}
        {MOCK_API_ENABLED && isApplicant && (
          <p className="mock-note" role="status">신청자 제출은 실제 API 모드에서 시연할 수 있습니다.</p>
        )}
        {MOCK_API_ENABLED && !isApplicant && (
          <aside className="mock-note" aria-label="목업 모드 안내">
            <p>
              계정 <code>demo-town-a</code>(읍면동) 또는 <code>demo-district-a</code>(시군구), 목업 전용 비밀번호{' '}
              <code>{MOCK_PASSWORD}</code>. 실제 서버와 관계없습니다.
            </p>
            <p>화면 확인용 가짜 데이터이며, 사례는 이 브라우저에만 저장됩니다.</p>
            <button
              type="button"
              className="krds-btn small tertiary"
              onClick={async () => {
                if (import.meta.env.VITE_USE_MOCK_API === 'true') {
                  const mock = await import('../../api/mock');
                  mock.resetMockData();
                  setMockReset(true);
                }
              }}
            >
              목업 사례 초기화
            </button>
            {mockReset && <p role="status">목업 사례를 모두 지웠습니다.</p>}
          </aside>
        )}
      </section>
    </main>
    {/* KRDS 로그인 패턴(피그마 서비스패턴_로그인)도 공통 푸터를 둔다. 체크리스트: 모든 화면 같은 위치. */}
    <AppFooter />
    </>
  );
}
