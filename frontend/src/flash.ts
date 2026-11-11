// 화면을 옮긴 뒤 한 번 보여줄 안내(예: 접수 완료). 다음 화면이 꺼내 쓰면 사라진다.

let pending: string | null = null;

export function setFlash(message: string) {
  pending = message;
}

export function takeFlash(): string | null {
  const message = pending;
  pending = null;
  return message;
}
