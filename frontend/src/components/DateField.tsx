import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { isValidDate } from '../dates';

// KRDS 날짜 입력(date_input) + 달력(calendar) 구조를 React로 옮긴 부품.
// 숫자만 입력해도 연-월-일 사이에 ‘-’를 자동으로 넣어 다음 칸으로 넘어간다(브라우저 기본 날짜 입력은 연도를 6자리까지 받아 4자리 뒤에 멈춘다).
// 값 형식은 서버·화면 표시와 같은 YYYY-MM-DD다.

interface DateFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** 입력 형식·날짜 순서 도움말. 오류가 있으면 오류 문구로 대신한다(KRDS 입력 상태: 메시지 한 줄). */
  hint?: string;
  error?: string;
  /** 이보다 이른 날짜는 달력에서 고를 수 없다(D-05 날짜 순서). */
  min?: string;
  inputRef?: Ref<HTMLInputElement>;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toKey(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function todayKey() {
  const now = new Date();
  return toKey(now.getFullYear(), now.getMonth(), now.getDate());
}

/** 숫자만 남겨 YYYY-MM-DD 모양으로 만든다. 붙여넣은 2026.11.01·20261101도 같은 값이 된다. */
export function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function parseKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month: month - 1, day };
}

function addDays(key: string, days: number) {
  const { year, month, day } = parseKey(key);
  const date = new Date(year, month, day + days);
  return toKey(date.getFullYear(), date.getMonth(), date.getDate());
}

export function DateField({ id, label, value, onChange, hint, error, min, inputRef }: DateFieldProps) {
  const calendarId = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ year: 0, month: 0 });
  const [pending, setPending] = useState('');
  const [focusKey, setFocusKey] = useState('');
  const [picker, setPicker] = useState<'year' | 'month' | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  const moveFocus = useRef(false);

  const message = error ?? hint;
  const messageId = message ? `${id}-${error ? 'error' : 'hint'}` : undefined;
  const validMin = min && isValidDate(min) ? min : undefined;
  const today = todayKey();

  function openCalendar() {
    const start = isValidDate(value) ? value : validMin && validMin > today ? validMin : today;
    const { year, month } = parseKey(start);
    setView({ year, month });
    setPending(isValidDate(value) ? value : '');
    setFocusKey(start);
    setPicker(null);
    setOpen(true);
    moveFocus.current = true;
  }

  function close(returnFocus = true) {
    setOpen(false);
    setPicker(null);
    if (returnFocus) toggleRef.current?.focus();
  }

  // 달력 밖을 누르면 닫는다(KRDS 달력과 같은 동작).
  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (!areaRef.current?.contains(event.target as Node)) close(false);
    }
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [open]);

  // 열 때와 방향키로 옮길 때 해당 날짜 버튼에 초점을 둔다.
  useEffect(() => {
    if (!open || !moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${focusKey}"]`)?.focus();
  }, [open, focusKey, view]);

  function shiftMonth(delta: number) {
    setView((current) => {
      const date = new Date(current.year, current.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }

  function handleGridKey(event: KeyboardEvent<HTMLTableElement>) {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = addDays(focusKey, step);
    const { year, month } = parseKey(next);
    setFocusKey(next);
    setView({ year, month });
    moveFocus.current = true;
  }

  function handleAreaKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (picker) setPicker(null);
      else close();
    }
  }

  // 6주 고정 달력(일요일 시작). 앞뒤 달 날짜는 KRDS old/new로 흐리게 표시하고 고를 수 없다.
  const first = new Date(view.year, view.month, 1).getDay();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(view.year, view.month, index - first + 1);
    const key = toKey(date.getFullYear(), date.getMonth(), date.getDate());
    const outside = date.getMonth() !== view.month;
    return { key, day: date.getDate(), outside, weekday: date.getDay() };
  });
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, index) => thisYear - 7 + index);
  if (!years.includes(view.year)) years.push(view.year);
  years.sort((a, b) => a - b);

  return (
    <div className="form-group date-field">
      <div className="form-tit">
        <label htmlFor={id}>{label}</label>
      </div>
      <div className={['form-conts', 'calendar-conts', error && 'is-error'].filter(Boolean).join(' ')} ref={areaRef} onKeyDown={handleAreaKey}>
        <div className="calendar-input">
          <input
            ref={inputRef}
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className="krds-input datepicker"
            placeholder="YYYY-MM-DD"
            maxLength={10}
            value={value}
            onChange={(event) => onChange(formatDateInput(event.target.value))}
            aria-invalid={error ? true : undefined}
            aria-describedby={messageId}
          />
          <button
            ref={toggleRef}
            type="button"
            className="krds-btn medium icon form-btn-datepicker"
            aria-expanded={open}
            aria-controls={calendarId}
            onClick={() => (open ? close() : openCalendar())}
          >
            <span className="sr-only">{label} 달력 {open ? '닫기' : '열기'}</span>
            <i className="svg-icon ico-calendar" />
          </button>
        </div>
        <div className={open ? 'krds-calendar-area active' : 'krds-calendar-area'}>
          {open && (
            <div className="calendar-wrap" id={calendarId} role="dialog" aria-label={`${label} 달력`}>
              <div className="calendar-head">
                <button type="button" className="btn-cal-move prev" onClick={() => shiftMonth(-1)}>
                  <span className="sr-only">이전 달</span>
                </button>
                <div className="calendar-switch-wrap">
                  <div className="calendar-drop-down">
                    <button
                      type="button"
                      className={picker === 'year' ? 'btn-cal-switch year active' : 'btn-cal-switch year'}
                      aria-label={`연도 선택, ${view.year}년`}
                      aria-expanded={picker === 'year'}
                      onClick={() => setPicker(picker === 'year' ? null : 'year')}
                    >
                      {view.year}년
                    </button>
                    <div className={picker === 'year' ? 'calendar-select calendar-year-wrap active' : 'calendar-select calendar-year-wrap'}>
                      <ul className="sel year">
                        {years.map((year) => (
                          <li key={year}>
                            <button
                              type="button"
                              className={year === view.year ? 'active' : undefined}
                              tabIndex={picker === 'year' ? 0 : -1}
                              onClick={() => { setView((current) => ({ ...current, year })); setPicker(null); }}
                            >
                              {year}년
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="calendar-drop-down">
                    <button
                      type="button"
                      className={picker === 'month' ? 'btn-cal-switch month active' : 'btn-cal-switch month'}
                      aria-label={`월 선택, ${view.month + 1}월`}
                      aria-expanded={picker === 'month'}
                      onClick={() => setPicker(picker === 'month' ? null : 'month')}
                    >
                      {pad(view.month + 1)}월
                    </button>
                    <div className={picker === 'month' ? 'calendar-select calendar-mon-wrap active' : 'calendar-select calendar-mon-wrap'}>
                      <ul className="sel month">
                        {Array.from({ length: 12 }, (_, month) => (
                          <li key={month}>
                            <button
                              type="button"
                              className={month === view.month ? 'active' : undefined}
                              tabIndex={picker === 'month' ? 0 : -1}
                              onClick={() => { setView((current) => ({ ...current, month })); setPicker(null); }}
                            >
                              {pad(month + 1)}월
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
                <button type="button" className="btn-cal-move next" onClick={() => shiftMonth(1)}>
                  <span className="sr-only">다음 달</span>
                </button>
              </div>
              <div className="calendar-body">
                <div className="calendar-table-wrap">
                  <table className="calendar-tbl" ref={gridRef} onKeyDown={handleGridKey}>
                    <caption>
                      {view.year}년 {pad(view.month + 1)}월
                    </caption>
                    <thead>
                      <tr>
                        {WEEKDAYS.map((weekday) => (
                          <th key={weekday} scope="col">
                            {weekday}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 6 }, (_, week) => (
                        <tr key={week}>
                          {cells.slice(week * 7, week * 7 + 7).map((cell) => {
                            const beforeMin = !!validMin && cell.key < validMin;
                            const selected = cell.key === pending;
                            const className = [
                              cell.outside && (cell.key < toKey(view.year, view.month, 1) ? 'old' : 'new'),
                              beforeMin && 'disabled',
                              cell.weekday === 0 && 'day-off',
                              cell.key === today && 'today',
                              selected && 'period start end',
                            ]
                              .filter(Boolean)
                              .join(' ');
                            const disabled = cell.outside || beforeMin;
                            const { year, month, day } = parseKey(cell.key);
                            return (
                              <td key={cell.key} className={className || undefined}>
                                <button
                                  type="button"
                                  className="btn-set-date"
                                  data-date={cell.key}
                                  disabled={disabled}
                                  tabIndex={cell.key === focusKey ? 0 : -1}
                                  aria-pressed={selected}
                                  aria-label={`${year}년 ${month + 1}월 ${day}일${cell.key === today ? ', 오늘' : ''}`}
                                  onClick={() => { setPending(cell.key); setFocusKey(cell.key); }}
                                  onDoubleClick={() => { onChange(cell.key); close(); }}
                                >
                                  <span>{cell.day}</span>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="calendar-footer">
                <div className="calendar-btn-wrap">
                  <button
                    type="button"
                    className="krds-btn small text"
                    disabled={!!validMin && today < validMin}
                    onClick={() => {
                      const { year, month } = parseKey(today);
                      setView({ year, month });
                      setPending(today);
                      setFocusKey(today);
                    }}
                  >
                    오늘
                  </button>
                  <button type="button" className="krds-btn small tertiary" onClick={() => close()}>
                    취소
                  </button>
                  <button
                    type="button"
                    className="krds-btn small primary"
                    disabled={!pending}
                    onClick={() => { onChange(pending); close(); }}
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {message && (
        <p id={messageId} className={error ? 'form-hint-invalid' : 'form-hint'}>
          {message}
        </p>
      )}
    </div>
  );
}
