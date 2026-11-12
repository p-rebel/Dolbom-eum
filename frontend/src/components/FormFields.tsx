// KRDS 입력 컴포넌트 구조(select, radio_button, checkbox, textarea)를 React로 옮긴 부품.

import type { ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { sizeClass, type FieldSize } from './fieldSize';

interface FieldFrameProps {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  contsClassName?: string;
}

function describedBy(id: string, hint?: string, error?: string) {
  return [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
}

/** form-group > form-tit > form-conts > 오류·도움말 */
function FieldFrame({ id, label, optional, hint, error, children, contsClassName }: FieldFrameProps) {
  return (
    <div className="form-group">
      <div className="form-tit">
        <label htmlFor={id}>
          {label}
          {optional && <span className="field-optional"> (선택)</span>}
        </label>
      </div>
      <div className={['form-conts', contsClassName, error && 'is-error'].filter(Boolean).join(' ')}>{children}</div>
      {error && (
        <p id={`${id}-error`} className="form-hint-invalid">
          {error}
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="form-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  /** 첫 항목으로 넣을 ‘전체’ 등 빈 값 선택지 */
  emptyOption?: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  selectRef?: Ref<HTMLSelectElement>;
  /** KRDS 선택상자 크기(`fieldSize.ts`). 검색·필터 영역은 medium. */
  fieldSize?: FieldSize;
}

export function SelectField({ id, label, options, emptyOption, optional, hint, error, selectRef, fieldSize, ...rest }: SelectFieldProps) {
  return (
    <FieldFrame id={id} label={label} optional={optional} hint={hint} error={error}>
      <select
        ref={selectRef}
        id={id}
        // KRDS: 값을 고르면 `completed`로 글자색을 바꾼다(원래 ui-script.js가 붙이는 클래스, 이 앱은 스크립트 미사용).
        className={rest.value ? `${sizeClass('krds-form-select', fieldSize)} completed` : sizeClass('krds-form-select', fieldSize)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      >
        {emptyOption !== undefined && <option value="">{emptyOption}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'> {
  id: string;
  label: string;
  maxLength: number;
  value: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
}

export function TextAreaField({ id, label, maxLength, value, optional, hint, error, textareaRef, ...rest }: TextAreaFieldProps) {
  return (
    <FieldFrame id={id} label={label} optional={optional} hint={hint} error={error}>
      <div className="textarea-wrap">
        <textarea
          ref={textareaRef}
          id={id}
          className="krds-input"
          maxLength={maxLength}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          {...rest}
        />
        <p className="textarea-count" aria-hidden="true">
          <span className="count-now">{value.length}</span>
          <span className="count-total">/{maxLength}</span>
        </p>
      </div>
    </FieldFrame>
  );
}

interface RadioGroupProps<T extends string> {
  name: string;
  legend: string;
  value: T | '';
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  error?: string;
  firstInputRef?: Ref<HTMLInputElement>;
}

/**
 * 라디오 묶음은 fieldset·legend로 이름을 준다.
 * KRDS는 legend를 화면에서 숨기므로(스크린 리더 전용) 같은 제목을 form-tit으로 한 번 더 보여준다.
 */
export function RadioGroup<T extends string>({ name, legend, value, options, onChange, error, firstInputRef }: RadioGroupProps<T>) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset className="form-group" aria-describedby={errorId}>
      <legend>{legend}</legend>
      <div className="form-tit" aria-hidden="true">
        <span>{legend}</span>
      </div>
      <div className={['form-conts', error && 'is-error'].filter(Boolean).join(' ')}>
        <div className="krds-check-area chk-column">
          {options.map((option, index) => (
            <div className="krds-form-check" key={option.value}>
              <input
                ref={index === 0 ? firstInputRef : undefined}
                type="radio"
                name={name}
                id={`${name}-${option.value}`}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              <label htmlFor={`${name}-${option.value}`}>{option.label}</label>
            </div>
          ))}
        </div>
      </div>
      {error && (
        <p id={errorId} className="form-hint-invalid">
          {error}
        </p>
      )}
    </fieldset>
  );
}

interface CheckboxFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function CheckboxField({ id, label, checked, onChange, error, inputRef }: CheckboxFieldProps) {
  return (
    <div className="form-group">
      <div className={['form-conts', error && 'is-error'].filter(Boolean).join(' ')}>
        <div className="krds-check-area chk-column">
          <div className="krds-form-check">
            <input
              ref={inputRef}
              type="checkbox"
              id={id}
              checked={checked}
              onChange={(event) => onChange(event.target.checked)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            <label htmlFor={id}>{label}</label>
          </div>
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} className="form-hint-invalid">
          {error}
        </p>
      )}
    </div>
  );
}

/** KRDS 입력폼 패턴: 모든 항목이 필수이면 상단에 안내한다. */
export function RequiredNotice() {
  return <p className="form-required-notice">모든 항목은 필수 입력입니다.</p>;
}
