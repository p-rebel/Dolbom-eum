import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { MOCK_API_ENABLED, MOCK_PASSWORD } from '../../api/mockFlag';
import { useAuth } from '../../auth/AuthContext';
import { AppFooter } from '../../layout/AppFooter';
import { AppHeader } from '../../layout/AppHeader';
import { TextField } from '../../components/TextField';
import { PageTitle } from '../../router';
import { HealthStatus } from '../health/HealthStatus';

type Field = 'username' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

/** UI-01 가상 계정 로그인. 성공하면 신청 목록으로 이동한다. */
export function LoginPage({ notice }: { notice: string | null }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mockReset, setMockReset] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

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
      await login(username.trim(), password);
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
    <AppHeader logoTo="/login" />
    <main id="main" className="login-page">
      {/* KRDS 피그마 서비스패턴_로그인 Step 3: 792px 본문, 작은 안내 + 큰 제목, 위아래 구분선 안에 왼쪽 입력·오른쪽 안내 */}
      <section className="login-box" aria-labelledby="login-title">
        <div className="login-head">
          <p className="login-service">돌봄e음 · 가상 사례 시연</p>
          <PageTitle id="login-title">가상 계정 로그인</PageTitle>
        </div>

        <div className={MOCK_API_ENABLED ? 'login-panel has-aside' : 'login-panel'}>
        <div className="login-main">
        {notice && (
          <div className="form-group" role="status">
            <p className="form-hint-information">{notice}</p>
          </div>
        )}
        {formError && (
          <div className="form-group" role="alert">
            <p className="form-hint-invalid">{formError}</p>
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="fieldset">
            <TextField
              id="login-username"
              label="계정명"
              hint="예: demo-town-a"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
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
              onChange={(event) => setPassword(event.target.value)}
              error={fieldErrors.password}
              inputRef={passwordRef}
            />
          </div>
          {/* KRDS 피그마 로그인 버튼은 입력칸과 같은 56px(large), 입력 열 전체 너비 */}
          <button type="submit" className="krds-btn large primary login-submit" disabled={submitting}>
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>
        </div>

        {MOCK_API_ENABLED && (
          <aside className="login-aside" aria-label="목업 모드 안내">
          <div className="mock-note">
            <span className="krds-badge bg-light-warning">목업 모드</span>
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
          </div>
          </aside>
        )}
        </div>

        <div className="login-footer">
          <HealthStatus />
        </div>
      </section>
    </main>
    {/* KRDS 로그인 패턴(피그마 서비스패턴_로그인)도 공통 푸터를 둔다. 체크리스트: 모든 화면 같은 위치. */}
    <AppFooter />
    </>
  );
}
