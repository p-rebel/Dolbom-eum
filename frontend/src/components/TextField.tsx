import { useState, type InputHTMLAttributes, type Ref } from 'react';
import { sizeClass, type FieldSize } from './fieldSize';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>;

interface TextFieldProps extends InputProps {
  id: string;
  label: string;
  /** 입력 형식을 알려주는 도움말. KRDS form-hint. 오류가 있으면 오류 문구로 대신한다(KRDS 입력 상태: 메시지 한 줄). */
  hint?: string;
  /** 오류 문구. 있으면 KRDS 오류 상태(is-error)로 표시한다. */
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** 선택 입력이면 이름 옆에 ‘(선택)’을 붙인다(SelectField와 같은 표시). */
  optional?: boolean;
  /** KRDS 입력칸 크기(`fieldSize.ts`). 검색·필터 영역은 medium. */
  fieldSize?: FieldSize;
}

/**
 * KRDS 텍스트 입력(text_input) 구조.
 * form-group > form-tit(label) > form-conts(input) > form-hint / form-hint-invalid
 */
export function TextField({ id, label, hint, error, inputRef, optional, type = 'text', fieldSize, ...inputProps }: TextFieldProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === 'password';
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  const contsClass = ['form-conts', isPassword && 'btn-ico-wrap', error && 'is-error'].filter(Boolean).join(' ');

  return (
    <div className="form-group">
      <div className="form-tit">
        <label htmlFor={id}>
          {label}
          {optional && <span className="field-optional"> (선택)</span>}
        </label>
      </div>
      <div className={contsClass}>
        <input
          ref={inputRef}
          id={id}
          className={sizeClass('krds-input', fieldSize)}
          type={isPassword && passwordVisible ? 'text' : type}
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
      {hintId && (
        <p id={hintId} className="form-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
