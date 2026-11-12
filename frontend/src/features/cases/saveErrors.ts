import { ApiError } from '../../api/client';

export interface SaveErrorResult {
  /** 422의 입력 필드. root는 경로의 첫 부분(예: serviceIds.1 → serviceIds) */
  field: { name: string; root: string; message: string } | null;
  /** 폼 위에 표시할 안내 */
  message: string;
  /** 최신 상세를 다시 불러와야 하는지 */
  reload: boolean;
}

/**
 * 상세 화면 저장 실패를 D-02 ‘빈 상태와 오류 처리’ 규칙으로 해석한다.
 * 401은 api/client.ts가 로그인 화면으로 보낸다.
 */
export function interpretSaveError(error: unknown): SaveErrorResult {
  if (!(error instanceof ApiError)) {
    return { field: null, message: '저장하지 못했습니다. 다시 시도해 주세요.', reload: true };
  }
  switch (error.status) {
    case 422: {
      // 서버 문구를 그대로 보여준다. 필드에 연결하지 못하면 폼 위에서 원인을 알린다.
      const message = error.message || '입력값을 확인해 주세요.';
      return {
        field: error.field ? { name: error.field, root: error.field.split('.')[0], message } : null,
        // 서버 문구가 이미 기본 안내와 같으면 앞에 다시 붙이지 않는다.
        message: error.field && message !== '입력값을 확인해 주세요.' ? `입력값을 확인해 주세요. ${message}` : message,
        reload: false,
      };
    }
    case 409:
      return {
        field: null,
        message: '다른 변경이 먼저 저장되었거나 지금 단계에서 처리할 수 없습니다. 최신 기록을 불러왔으니 입력 내용을 확인한 뒤 다시 저장해 주세요.',
        reload: true,
      };
    case 403:
      return { field: null, message: '이 작업을 처리할 권한이 없습니다.', reload: true };
    case 404:
      return { field: null, message: '신청 건을 찾을 수 없습니다. 신청 목록에서 다시 확인해 주세요.', reload: false };
    default:
      return {
        field: null,
        message: '저장 결과를 확인하지 못했습니다. 최신 기록을 다시 불러왔으니 저장 여부를 확인해 주세요.',
        reload: true,
      };
  }
}
