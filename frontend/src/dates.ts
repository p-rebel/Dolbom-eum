// 업무 날짜(YYYY-MM-DD) 입력 검사. 서버도 같은 규칙으로 다시 검사한다(D-04·D-05).
// 화면에서 먼저 막아 저장 전에 바로 알려준다(KRDS 입력폼 패턴: 클라이언트 측 검증).

/** 날짜 입력의 최댓값(연도 4자리). */
export const DATE_MAX = '9999-12-31';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  // Date.UTC는 0~99년을 1900년대로 바꾸므로 연도를 따로 지정한다.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return year >= 1 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

interface DateRule {
  /** 비어 있을 때 문구 */
  required: string;
  /** 이 날짜와 같거나 이후여야 한다(D-05: 동일 일자 처리 가능). */
  notBefore?: { date: string | null | undefined; label: string };
}

/** 날짜 입력을 검사해 오류 문구를 돌려준다. 문제가 없으면 undefined. */
export function checkDate(value: string, rule: DateRule): string | undefined {
  if (!value) {
    return rule.required;
  }
  if (!isValidDate(value) || value > DATE_MAX) {
    return '날짜를 연도 4자리의 YYYY-MM-DD 형식으로 입력해 주세요.';
  }
  const limit = rule.notBefore;
  if (limit?.date && isValidDate(limit.date) && value < limit.date) {
    return `${limit.label}(${limit.date})과 같거나 이후 날짜를 입력해 주세요.`;
  }
  return undefined;
}

/** 앞 단계 날짜가 올바를 때만 달력의 최솟값으로 쓴다. */
export function minDate(...candidates: (string | null | undefined)[]): string | undefined {
  return candidates.filter((value): value is string => !!value && isValidDate(value)).sort().pop();
}
