// 화면 이동. D-02의 경로 5개만 쓰므로 외부 라이브러리 없이 History API로 처리한다.

import { useEffect, useRef, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 화면에 보여줄 경로. 뒤로 가기를 확인하는 동안 주소가 잠시 바뀌어도 화면은 그대로 둔다. */
function getPath() {
  return shownPath.split('?')[0];
}

/** 현재 경로를 구독한다. 경로가 바뀌면 다시 렌더링한다. */
export function usePath() {
  return useSyncExternalStore(subscribe, getPath);
}

// ── 저장하지 않은 입력 보호 ─────────────────────────────
// 입력 중인 폼은 useUnsavedChanges(true)로 알린다. 그 상태에서 다른 화면으로 가려 하면
// 확인 모달(LeavePrompt)을 띄우고, ‘나가기’를 고른 경우에만 이동한다.

const dirtySources = new Set<symbol>();
let leaveRequest: ((leave: boolean) => void) | null = null;
const promptListeners = new Set<() => void>();
/** 지금 보여주고 있는 경로. 뒤로 가기를 취소할 때 되돌릴 주소다. */
let shownPath = window.location.pathname + window.location.search;
/** 지금 기록의 순번. 뒤로·앞으로 가기를 취소할 때 몇 칸 되돌릴지 계산한다. */
let shownIndex: number = typeof window.history.state?.idx === 'number' ? window.history.state.idx : 0;
if (typeof window.history.state?.idx !== 'number') {
  window.history.replaceState({ idx: shownIndex }, '');
}
/** history.go()로 되돌리는 중에 오는 popstate는 화면을 바꾸지 않는다. */
let restoring = false;
/** ‘나가기’를 고른 뒤 다시 이동할 때 오는 popstate는 확인 없이 받는다. */
let allowNextPop = false;

function notifyPrompt() {
  promptListeners.forEach((listener) => listener());
}

export function hasUnsavedChanges() {
  return dirtySources.size > 0;
}

/** 입력 중인 폼이 저장 전 상태임을 알린다. 폼이 사라지거나 dirty가 false가 되면 해제된다. */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const key = Symbol('unsaved');
    dirtySources.add(key);
    return () => {
      dirtySources.delete(key);
    };
  }, [dirty]);
}

/** 저장하지 않은 입력이 있으면 확인을 받는다. 나가도 되면 true. */
export function confirmLeave(): Promise<boolean> {
  if (!hasUnsavedChanges()) return Promise.resolve(true);
  leaveRequest?.(false);
  return new Promise((resolve) => {
    leaveRequest = resolve;
    notifyPrompt();
  });
}

/** 확인 모달이 쓰는 상태: 열려 있는지와 답하기 */
export function useLeavePrompt() {
  const open = useSyncExternalStore(
    (listener) => {
      promptListeners.add(listener);
      return () => promptListeners.delete(listener);
    },
    () => leaveRequest !== null,
  );
  function answer(leave: boolean) {
    const resolve = leaveRequest;
    leaveRequest = null;
    if (leave) dirtySources.clear();
    notifyPrompt();
    resolve?.(leave);
  }
  return { open, answer };
}

// 새로고침·탭 닫기: 브라우저 기본 확인창만 쓸 수 있다.
window.addEventListener('beforeunload', (event) => {
  if (hasUnsavedChanges()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

// 뒤로·앞으로 가기: 주소가 이미 바뀌었으므로 같은 칸 수만큼 되돌려 놓고 확인을 받는다.
// 새 기록을 쌓지 않고 history.go()로 움직여 앞으로 가기 기록을 보존한다.
window.addEventListener('popstate', (event: PopStateEvent) => {
  const target = window.location.pathname + window.location.search;
  const index = typeof event.state?.idx === 'number' ? event.state.idx : shownIndex;
  if (restoring) {
    restoring = false;
    shownIndex = index;
    return;
  }
  if (allowNextPop || window.location.pathname === shownPath.split('?')[0] || !hasUnsavedChanges()) {
    allowNextPop = false;
    shownPath = target;
    shownIndex = index;
    notify();
    return;
  }
  const delta = shownIndex - index;
  if (delta === 0) {
    // 순번을 알 수 없는 기록이면 예전 방식으로 주소만 되돌린다.
    window.history.pushState({ idx: shownIndex }, '', shownPath);
  } else {
    restoring = true;
    window.history.go(delta);
  }
  void confirmLeave().then((leave) => {
    if (!leave) return;
    dirtySources.clear();
    if (delta === 0) {
      go(target, false);
    } else {
      allowNextPop = true;
      window.history.go(-delta);
    }
  });
});

function go(to: string, replace: boolean) {
  if (replace) {
    window.history.replaceState({ idx: shownIndex }, '', to);
  } else {
    shownIndex += 1;
    window.history.pushState({ idx: shownIndex }, '', to);
  }
  shownPath = to;
  notify();
}

/**
 * 화면 이동. 저장하지 않은 입력이 있으면 먼저 확인을 받는다.
 * force는 저장 직후 이동이나 세션 만료처럼 확인 없이 옮겨야 할 때 쓴다.
 */
export function navigate(to: string, options: { replace?: boolean; force?: boolean } = {}) {
  if (to === window.location.pathname + window.location.search) {
    return;
  }
  if (options.force || !hasUnsavedChanges()) {
    if (options.force) dirtySources.clear();
    go(to, options.replace ?? false);
    return;
  }
  void confirmLeave().then((leave) => {
    if (leave) go(to, options.replace ?? false);
  });
}

/**
 * '/cases/:caseId' 같은 패턴과 경로를 비교한다.
 * 일치하면 매개변수 객체, 아니면 null을 돌려준다.
 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = pathParts[index];
    if (patternPart.startsWith(':')) {
      // 잘못된 % 인코딩 주소는 화면 전체 오류 대신 ‘없는 화면’으로 처리한다.
      try {
        params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      } catch {
        return null;
      }
    } else if (patternPart !== pathPart) {
      return null;
    }
  }
  return params;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string };

/** 새로고침 없이 이동하는 링크. 새 탭 열기 같은 보조 키 동작은 브라우저에 맡긴다. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target === '_blank'
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  }
  return <a href={to} onClick={handleClick} {...rest} />;
}

/** 쪽 제목. D-02에 따라 화면이 열리면 제목으로 초점을 옮긴다. */
export function PageTitle({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} id={id} tabIndex={-1} className={className ? 'page-title ' + className : 'page-title'}>
      {children}
    </h1>
  );
}
