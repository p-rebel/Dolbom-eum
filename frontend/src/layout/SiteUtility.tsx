import { useRef, useState } from 'react';
import { useDropdownDismiss } from './useDropdownDismiss';

/**
 * KRDS 헤더 상단 유틸 메뉴(header-utility): 운영기관 누리집 링크와 글자 크기(krds-resize).
 * 대체할 보건복지부 통합돌봄 누리집과 같은 자리·같은 항목이다(11/16).
 * 글자 크기는 KRDS가 rem(html 62.5% = 10px) 기준이라 html 글자 크기만 바꿔 화면 전체를 함께 키운다.
 */
const SIZES = [
  { key: 'sm', label: '작게', percent: 56.25 },
  { key: 'md', label: '보통', percent: 62.5 },
  { key: 'lg', label: '조금 크게', percent: 68.75 },
  { key: 'xlg', label: '크게', percent: 75 },
  { key: 'xxlg', label: '가장크게', percent: 81.25 },
] as const;
type SizeKey = (typeof SIZES)[number]['key'];
const STORAGE_KEY = 'dolbomeum-font-size';

function readSize(): SizeKey {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return SIZES.some((size) => size.key === saved) ? (saved as SizeKey) : 'md';
  } catch {
    return 'md';
  }
}

function setRootSize(key: SizeKey) {
  const size = SIZES.find((item) => item.key === key) ?? SIZES[1];
  document.documentElement.style.fontSize = key === 'md' ? '' : `${size.percent}%`;
}

/** 저장해 둔 글자 크기를 첫 화면을 그리기 전에 적용한다(main.tsx). 그린 뒤 바꾸면 화면이 한 번 커지며 흔들린다. */
export function applyStoredFontSize() {
  setRootSize(readSize());
}

function saveSize(key: SizeKey) {
  setRootSize(key);
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // 저장이 막힌 브라우저에서도 지금 화면에는 적용된다.
  }
}

export function SiteUtility() {
  const [size, setSize] = useState<SizeKey>(readSize);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useDropdownDismiss(open, setOpen, wrapRef, buttonRef);

  // 고를 때만 바꾸고 저장한다. 처음 값은 main.tsx가 그리기 전에 적용했다.
  function choose(key: SizeKey) {
    setSize(key);
    saveSize(key);
  }

  return (
    <div className="header-utility">
      <ul className="utility-list">
        <li>
          <a href="https://www.mohw.go.kr" className="krds-btn small text" target="_blank" rel="noreferrer" title="새 창 열기">
            보건복지부 <i className="svg-icon ico-go" aria-hidden="true" />
          </a>
        </li>
        <li>
          <div ref={wrapRef} className={open ? 'krds-drop-wrap krds-resize drop-right active' : 'krds-drop-wrap krds-resize drop-right'}>
            <button
              ref={buttonRef}
              type="button"
              className={open ? 'krds-btn small text drop-btn active' : 'krds-btn small text drop-btn'}
              aria-expanded={open}
              aria-controls="site-font-size"
              onClick={() => setOpen((value) => !value)}
            >
              글자크기 <i className="svg-icon ico-toggle" aria-hidden="true" />
            </button>
            <div className="drop-menu" id="site-font-size" hidden={!open}>
              <div className="drop-in">
                <ul className="drop-list">
                  {SIZES.map((item) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        className={['item-link', item.key, size === item.key && 'active'].filter(Boolean).join(' ')}
                        aria-pressed={size === item.key}
                        onClick={() => choose(item.key)}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="drop-bottom">
                  <button type="button" className="krds-btn medium text" onClick={() => choose('md')}>
                    <i className="svg-icon ico-reset" aria-hidden="true" /> 초기화
                  </button>
                </div>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  );
}
