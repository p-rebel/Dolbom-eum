import { useLeavePrompt } from '../router';
import { Modal } from './Modal';

/**
 * 저장하지 않은 입력이 있을 때 이동을 확인한다.
 * KRDS 확인 패턴: 상황을 간결하게 설명하고, 버튼 이름에 행동을 구체적으로 적는다.
 * 첫 초점은 입력을 지키는 ‘계속 작성’에 둔다.
 */
export function LeavePrompt() {
  const { open, answer } = useLeavePrompt();
  if (!open) return null;
  return (
    <Modal
      title="저장하지 않은 입력이 있습니다"
      onClose={() => answer(false)}
      actions={
        <>
          <button type="button" className="krds-btn medium tertiary" onClick={() => answer(false)}>
            계속 작성
          </button>
          <button type="button" className="krds-btn medium primary" onClick={() => answer(true)}>
            저장하지 않고 나가기
          </button>
        </>
      }
    >
      <p>이 화면을 나가면 입력한 내용이 저장되지 않고 사라집니다.</p>
    </Modal>
  );
}
