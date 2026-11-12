import { useState } from 'react';

type FieldErrorMap<F extends string> = Partial<Record<F, string>>;

/**
 * 입력 폼의 칸 오류와 폼 위 안내를 함께 관리한다.
 * - 값을 고치면 그 칸(과 함께 숨겨지거나 선택 칸이 되는 칸)의 오류만 지운다. 다시 검사는 저장할 때 한다.
 * - 칸 오류에 딸린 안내(tied)는 칸 오류가 모두 없어지면 숨긴다. 칸과 연결되지 않은 안내(서버 오류 등)는 그대로 둔다.
 *   문구를 비교하지 않으므로 서버가 같은 문구를 보내도 숨겨지지 않는다.
 */
export function useFieldErrors<F extends string>() {
  const [errors, setErrorsState] = useState<FieldErrorMap<F>>({});
  const [notice, setNotice] = useState<{ text: string; tied: boolean } | null>(null);
  const hasErrors = Object.values(errors).some(Boolean);

  return {
    errors,
    /** 저장 때 검사한 결과로 칸 오류를 바꾼다. */
    setErrors: (next: FieldErrorMap<F>) => setErrorsState(next),
    /** 값을 고친 칸의 오류를 지운다. */
    clearError: (...fields: F[]) =>
      setErrorsState((current) => {
        if (!fields.some((field) => current[field])) return current;
        const next = { ...current };
        for (const field of fields) delete next[field];
        return next;
      }),
    /** 폼 위 안내. tied=true면 칸 오류에 딸린 안내다. */
    setMessage: (text: string | null, tied = false) => setNotice(text ? { text, tied } : null),
    message: notice && (!notice.tied || hasErrors) ? notice.text : null,
  };
}
