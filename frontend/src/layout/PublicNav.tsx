import { useRef, useState } from 'react';
import { ROLE_LABEL, useAuth } from '../auth/AuthContext';
import { confirmLeave, Link, usePath } from '../router';
import { useDropdownDismiss } from './useDropdownDismiss';

/**
 * 공개 누리집 주 메뉴. 공개 홈·신청 안내·로그인·신청자 화면이 같은 메뉴를 쓴다(11/16).
 * 전에는 신청자가 로그인하면 메뉴가 ‘신청서 작성·내 신청 현황’으로 통째로 바뀌어 안내 화면으로 돌아갈 길이 없었다.
 */
const PUBLIC_MENU = [
  { to: '/', label: '통합돌봄 한눈에 보기', match: (path: string) => path === '/' },
  { to: '/apply', label: '신청 안내', match: (path: string) => path === '/apply' },
  { to: '/apply/new', label: '신청서 작성', match: (path: string) => path === '/apply/new' || (path === '/login/applicant' && nextPath() === '/apply/new') },
  { to: '/my/applications', label: '내 신청 현황', match: (path: string) => path.startsWith('/my/applications') || (path === '/login/applicant' && nextPath().startsWith('/my/applications')) },
];

/**
 * 로그인 화면에서는 눌렀던 메뉴(로그인 뒤 갈 곳 `next`)에 밑줄을 둔다. 상단 ‘로그인’으로 들어와 `next`가 없으면 어느 메뉴에도 두지 않는다.
 * 전에는 ‘내 신청 현황’을 눌러도 ‘신청서 작성’에 밑줄이 옮겨 갔다.
 */
function nextPath() {
  return new URLSearchParams(window.location.search).get('next') ?? '';
}

export function PublicMenu() {
  const path = usePath();
  return (
    <nav className="krds-main-menu" aria-label="주 메뉴">
      <div className="inner">
        <ul className="gnb-menu">
          {PUBLIC_MENU.map((item) => {
            const current = item.match(path);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={['gnb-main-trigger', 'is-link', current && 'active'].filter(Boolean).join(' ')}
                  aria-current={current ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/**
 * 오른쪽 위 계정 영역. 정부24 상단(아이콘이 앞에 붙은 가로형 글자 버튼)을 따른다(11/16):
 * 로그인 전에는 ‘로그인’, 로그인 뒤에는 내 메뉴(정부24 ‘MyGOV’ 자리: 이름·역할·바로가기)와 ‘로그아웃’을 나란히 둔다.
 * KRDS 헤더 버튼(btn-navi)의 가로형(navi-row)을 쓴다. 세로형(아이콘 위·글자 아래)은 어색하다는 의견을 반영했다.
 * 공무원·관리자 로그인은 로그인 화면 안내 칸과 하단에서 들어간다(정부 누리집은 일반 이용자 로그인을 앞에 둔다).
 */
export function AccountArea({ inWorkArea = false }: { inWorkArea?: boolean }) {
  const { state, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useDropdownDismiss(open, setOpen, wrapRef, buttonRef);

  if (state.status !== 'authenticated') {
    return (
      <div className="header-actions">
        <Link to="/login/applicant" className="btn-navi navi-row login">로그인</Link>
      </div>
    );
  }

  const { account } = state;
  const applicant = account.role === 'APPLICANT';
  const jurisdiction = account.townCode ?? account.districtCode;
  const links = applicant
    ? [{ to: '/my/applications', label: '내 신청 현황' }, { to: '/apply/new', label: '신청서 작성' }]
    : [
        ...(inWorkArea ? [] : [{ to: '/cases', label: '업무 화면(신청 목록)' }]),
        { to: '/', label: '누리집 홈' },
      ];

  async function handleLogout() {
    setOpen(false);
    if (!(await confirmLeave())) return;
    setBusy(true);
    try {
      await logout();
    } catch {
      // 화면 전환은 AuthContext에서 처리한다.
    }
  }

  return (
    <div className="header-actions">
      <div ref={wrapRef} className={open ? 'krds-drop-wrap my-drop drop-right active' : 'krds-drop-wrap my-drop drop-right'}>
        <button
          ref={buttonRef}
          type="button"
          className={open ? 'btn-navi navi-row my drop-btn active' : 'btn-navi navi-row my drop-btn'}
          aria-expanded={open}
          aria-controls="my-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {applicant ? '나의 신청' : '내 업무'}
        </button>
        <div className="drop-menu" id="my-menu" hidden={!open}>
          <div className="drop-in">
            <div className="drop-top">
              <p className="my-name">{account.displayName}님</p>
              <p className="my-role">{ROLE_LABEL[account.role]}{jurisdiction ? ' · 관할 ' + jurisdiction : ''}</p>
            </div>
            <ul className="drop-list">
              {links.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="item-link" onClick={() => setOpen(false)}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <button type="button" className="btn-navi navi-row logout" onClick={handleLogout} disabled={busy}>
        <i className="svg-icon ico-logout" aria-hidden="true" />
        {busy ? '로그아웃 중…' : '로그아웃'}
      </button>
    </div>
  );
}
