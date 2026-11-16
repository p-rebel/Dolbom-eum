import { useState, type FormEvent } from 'react';
import { ApiError, apiRequest } from '../../api/client';
import { TextField } from '../../components/TextField';

interface Props {
  onCreated: (username: string) => void;
  onCancel: () => void;
}

export function ApplicantSignupForm({ onCreated, onCancel }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; field: string | null } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const fields = new FormData(form);
    const username = String(fields.get('username') ?? '').trim();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest('/signup', {
        method: 'POST',
        body: {
          username,
          displayName: String(fields.get('displayName') ?? '').trim(),
          password: String(fields.get('password') ?? ''),
        },
      });
      onCreated(username);
    } catch (failure) {
      const message = failure instanceof ApiError ? failure.message : '회원가입을 완료하지 못했습니다.';
      const field = failure instanceof ApiError ? failure.field : null;
      const input = field ? form.elements.namedItem(field) : null;
      if (input instanceof HTMLInputElement) {
        setError({ message, field });
        input.focus();
      } else {
        setError({ message, field: null });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} onChange={() => setError(null)}>
      <div className="fieldset">
        <TextField
          id="signup-username"
          name="username"
          label="계정명"
          hint="영문, 숫자, 마침표, 밑줄, 하이픈으로 3~40자"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          pattern="[A-Za-z0-9_.\-]{3,40}"
          maxLength={40}
          required
          error={error?.field === 'username' ? error.message : undefined}
        />
        <TextField
          id="signup-display-name"
          name="displayName"
          label="표시 이름"
          hint="시연에 사용할 가상의 이름을 입력해 주세요."
          autoComplete="nickname"
          maxLength={60}
          required
          error={error?.field === 'displayName' ? error.message : undefined}
        />
        <TextField
          id="signup-password"
          name="password"
          label="비밀번호"
          hint="8~128자"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          error={error?.field === 'password' ? error.message : undefined}
        />
      </div>
      {error && error.field === null && (
        <div className="form-group login-error" role="alert">
          <p className="form-hint-invalid">{error.message}</p>
        </div>
      )}
      <button type="submit" className="krds-btn large primary login-submit" disabled={submitting}>
        {submitting ? '가입 중…' : '가입하기'}
      </button>
      <button type="button" className="krds-btn medium text login-submit" onClick={onCancel} disabled={submitting}>
        로그인으로 돌아가기
      </button>
    </form>
  );
}
