import { useState, type InputHTMLAttributes, type Ref } from 'react';
import { DATE_MAX } from '../dates';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>;

interface TextFieldProps extends InputProps {
  id: string;
  label: string;
  /** 입력 형식을 알려주는 도움말. KRDS form-hint */
  hint?: string;
  /** 오류 문구. 있으면 KRDS 오류 상태(is-error)로 표시한다. */
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** KRDS 입력칸 크기. 기본은 large(56px, 입력폼). 검색·필터 영역은 medium(48px)으로 다른 조건과 높이를 맞춘다. */
  fieldSize?: 'medium';
}

/**
 * KRDS 텍스트 입력(text_input) 구조.
 * form-group > form-tit(label) > form-conts(input) > form-hint / form-hint-invalid
 */
export function TextField({ id, label, hint, error, inputRef, type = 'text', max, fieldSize, ...inputProps }: TextFieldProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === 'password';
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  const contsClass = ['form-conts', isPassword && 'btn-ico-wrap', error && 'is-error'].filter(Boolean).join(' ');

  return (
    <div className="form-group">
      <div className="form-tit">
        <label htmlFor={id}>{label}</label>
      </div>
      <div className={contsClass}>
        <input
          ref={inputRef}
          id={id}
          className={fieldSize ? `krds-input ${fieldSize}` : 'krds-input'}
          type={isPassword && passwordVisible ? 'text' : type}
          // 날짜는 최댓값이 없으면 브라우저가 연도를 6자리까지 받는다.
          max={type === 'date' ? (max ?? DATE_MAX) : max}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {isPassword && (
          // KRDS 로그인 정보 입력 패턴: 비밀번호를 표시할 수 있는 옵션을 제공한다.
          <button
            type="button"
            className="krds-btn medium icon"
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            <span className="sr-only">{passwordVisible ? '입력한 비밀번호 가리기' : '입력한 비밀번호 보기'}</span>
            <i className={passwordVisible ? 'svg-icon ico-pw-visible-on' : 'svg-icon ico-pw-visible'} />
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className="form-hint-invalid">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="form-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
