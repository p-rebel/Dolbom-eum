// 로딩·오류·빈 결과·저장 결과 안내. D-02 ‘빈 상태와 오류 처리’.

import type { ReactNode } from 'react';
import { STATUS_BADGE, STATUS_LABEL } from '../api/labels';
import type { CaseStatus } from '../api/types';

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="feedback-block">
      <div className="krds-spinner" role="status">
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}

export function ErrorBlock({ message, onRetry, children }: { message: string; onRetry?: () => void; children?: ReactNode }) {
  return (
    <div className="feedback-block" role="alert">
      <div className="form-group">
        <p className="form-hint-invalid">{message}</p>
      </div>
      <div className="feedback-actions">
        {onRetry && (
          <button type="button" className="krds-btn medium secondary" onClick={onRetry}>
            다시 불러오기
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function EmptyBlock({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="feedback-block feedback-empty">
      <p>{message}</p>
      {children && <div className="feedback-actions">{children}</div>}
    </div>
  );
}

/** 저장 결과·충돌 안내 등 폼 위쪽에 표시하는 문구 */
export function FormMessage({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const className = { error: 'form-hint-invalid', success: 'form-hint-success', info: 'form-hint-information' }[tone];
  return (
    <div className="form-group form-message" role={tone === 'error' ? 'alert' : 'status'}>
      <p className={className}>{children}</p>
    </div>
  );
}

/** 진행 상태 배지. large는 KRDS 큰 배지(17px)로, 같은 크기의 값과 나란히 놓일 때 쓴다(신청 상세 요약). */
export function StatusBadge({ status, large = false }: { status: CaseStatus; large?: boolean }) {
  return <span className={`krds-badge ${STATUS_BADGE[status]}${large ? ' large' : ''}`}>{STATUS_LABEL[status]}</span>;
}
