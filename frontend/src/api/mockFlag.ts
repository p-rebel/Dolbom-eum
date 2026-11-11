// 목업 사용 여부와 로그인 화면 안내용 값. 목업 본체(mock.ts)는 목업을 켤 때만 불러와
// 실제 API 모드의 빌드 결과에는 들어가지 않는다.

export const MOCK_API_ENABLED = import.meta.env.VITE_USE_MOCK_API === 'true';

/** 목업 전용 비밀번호. 실제 서버의 가상 계정 비밀번호와 관계없다. */
export const MOCK_PASSWORD = 'demo-password';
