import { useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

export interface ConfirmRequest {
  title: string;
  /** 저장할 값을 다시 보여 준다(항목명, 값). */
  rows: [string, ReactNode][];
  /** 확인 버튼 이름. 행동을 구체적으로 적는다(예: ‘계획 확정’). */
  confirmLabel: string;
  /** 기본: 저장 후 수정할 수 없다는 안내 */
  note?: string;
}

/**
 * 한 번만 기록하고 되돌릴 수 없는 저장(D-05: 사전조사·판정·확정·안내·연계·최초 모니터링) 전에 값을 다시 보여 주고 확인한다.
 * KRDS 확인 패턴: 상황을 간결하게 설명하고 버튼 이름에 행동을 적는다. 첫 초점은 되돌아가는 ‘다시 확인’에 둔다.
 * ask()는 확인하면 true, 닫거나 취소하면 false로 끝난다.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  function ask(next: ConfirmRequest) {
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }

  function answer(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setRequest(null);
  }

  const dialog = request && (
    <Modal
      title={request.title}
      onClose={() => answer(false)}
      actions={
        <>
          <button type="button" className="krds-btn medium tertiary" onClick={() => answer(false)}>
            다시 확인
          </button>
          <button type="button" className="krds-btn medium primary" onClick={() => answer(true)}>
            {request.confirmLabel}
          </button>
        </>
      }
    >
      <dl className="info-list confirm-list">
        {request.rows.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="confirm-note">{request.note ?? '저장한 뒤에는 수정하거나 되돌릴 수 없습니다.'}</p>
    </Modal>
  );

  return { ask, dialog };
}
