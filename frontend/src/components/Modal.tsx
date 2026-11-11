import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title: string;
  children: ReactNode;
  /** 버튼 영역. 첫 버튼이 처음 초점을 받는다. */
  actions: ReactNode;
  onClose: () => void;
}

/**
 * KRDS 모달(modal) 구조를 React로 연 상태로 그린다. KRDS ui-script.js 대신
 * 열림 클래스(shown·in), 배경 스크롤 막기, Esc 닫기, 초점 가두기와 복귀를 직접 처리한다.
 */
export function Modal({ title, children, actions, onClose }: ModalProps) {
  const titleId = useId();
  const bodyId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.classList.add('scroll-no');
    const focusables = () =>
      Array.from(
        contentRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex="0"]') ?? [],
      );
    focusables()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('scroll-no');
      previousFocus?.focus?.();
    };
  }, []);

  return createPortal(
    <section className="krds-modal fade shown in" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
      <div className="modal-dialog modal-sm">
        <div className="modal-content" ref={contentRef}>
          <div className="modal-header">
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
          </div>
          <div className="modal-conts">
            <div id={bodyId} className="conts-area">
              {children}
            </div>
          </div>
          <div className="modal-btn btn-wrap">{actions}</div>
          <button type="button" className="krds-btn medium icon btn-close" onClick={onClose}>
            <span className="sr-only">닫기</span>
            <i className="svg-icon ico-popup-close" />
          </button>
        </div>
      </div>
      <div className="modal-back in" onClick={onClose} />
    </section>,
    document.body,
  );
}
