/**
 * KRDS 입력칸·선택상자 크기(DEV-03 크기 규칙).
 * 크기 클래스가 없으면 KRDS 기본 large(56px, 입력폼). 검색·필터 영역은 medium(48px),
 * 모달 안 검색처럼 좁은 영역은 small(40px).
 * TextField와 SelectField가 같은 값을 써서 높이가 따로 어긋나지 않게 한다.
 */
export type FieldSize = 'medium' | 'small';

export function sizeClass(base: string, size?: FieldSize) {
  return size ? `${base} ${size}` : base;
}
