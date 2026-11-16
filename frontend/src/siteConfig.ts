/**
 * 공식 누리집 화면(전자정부 누리집 표시, 운영기관 로고·하단, ‘가상’ 표현 정리). 팀장 확정 디자인으로 기본값 켜짐(11/16, 팀장 지시).
 * 개발 화면·로컬 시연·배포 빌드 모두 켜진다. 끄려면 `VITE_OFFICIAL_SITE=false`(로컬 시연 스크립트는 `--demo-labels`).
 * 켠 상태에서도 하단의 시연용·가상 데이터 안내는 남긴다.
 */
export const OFFICIAL_SITE = import.meta.env.VITE_OFFICIAL_SITE !== 'false';

/**
 * 화면 장식·이름에 붙은 ‘가상·모의·시연’ 표현을 공식 누리집 표시를 켜면 실제 서비스 표현으로 바꾼다(11/16, 팀 요청 ①).
 * 입력 규칙 안내(‘가상 ’으로 시작, 000-0000-, DEMO-)와 시연 데이터, 하단 가상 데이터 안내는 바꾸지 않는다:
 * 서버가 그 규칙으로 실제 개인정보 입력을 막고, 시연 범위(D-01)가 가상 데이터만 쓰기 때문이다.
 */
export function siteText(demo: string, official: string): string {
  return OFFICIAL_SITE ? official : demo;
}
