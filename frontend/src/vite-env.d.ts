/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** true면 백엔드 대신 src/api/mock.ts의 예시 응답을 사용한다. */
  readonly VITE_USE_MOCK_API?: string;
}
