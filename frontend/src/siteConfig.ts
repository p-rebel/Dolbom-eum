/**
 * 공식 전자정부 누리집 표시(KRDS masthead) 켜기.
 * 이 표시는 기관이 공식 운영하는 누리집이라는 확인이라, 시연 서버(가상 사례)에서는 끈다(기본값 false).
 * 정부 누리집에 탑재되어 운영기관이 확인하면 `.env`에 `VITE_OFFICIAL_SITE=true`로 켠다.
 */
export const OFFICIAL_SITE = import.meta.env.VITE_OFFICIAL_SITE === 'true';
