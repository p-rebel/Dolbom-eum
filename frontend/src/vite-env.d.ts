/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** true면 백엔드 대신 src/api/mock.ts의 예시 응답을 사용한다. */
  readonly VITE_USE_MOCK_API?: string;
  /** true면 KRDS 공식 전자정부 누리집 표시(masthead)를 보인다. 정부 누리집 탑재 때만 켠다. */
  readonly VITE_OFFICIAL_SITE?: string;
}
