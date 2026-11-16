import { useEffect, type RefObject } from 'react';

/**
 * KRDS 드롭다운(글자크기·내 메뉴)을 닫는 공통 동작: 바깥을 누르거나 Esc를 누르면 닫고, Esc일 때는 여는 버튼으로 포커스를 돌린다.
 * KRDS는 ui-script.js가 하는 일이라, 이 앱은 React로 같은 동작을 둔다.
 */
export function useDropdownDismiss(
  open: boolean,
  setOpen: (open: boolean) => void,
  wrapRef: RefObject<HTMLElement | null>,
  buttonRef: RefObject<HTMLButtonElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen, wrapRef, buttonRef]);
}
