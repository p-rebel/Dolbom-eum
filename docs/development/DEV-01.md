# DEV-01 공통 실행 구조 작업 기록

| 항목 | 내용 |
| --- | --- |
| 담당자 | 이동수 |
| 착수일·목표일 | 2026-11-11 |
| 상태 | 진행 중 · 팀원 실행 확인 대기 |
| 선행 작업과 착수 근거 | H-02 팀 인수 판정 대기 중 DEV-01 착수. 설계 입력은 PR #1의 검토본 4 커밋 `6c7b769`. |
| 실행 코드 커밋 | `3ea8919` |

완료 기준은 [D-06 개발 작업표](../design/D-06_work_items.md)의 DEV-01 행을 따른다. [H-02 설계 인수](../handoffs/H-02_design_handoff.md) · [설계 PR #1](https://github.com/p-rebel/Dolbom-eum/pull/1)

## 결과물과 확인

| 결과와 완료 기준 | 산출물 | 확인 결과 |
| --- | --- | --- |
| 프론트·API 공통 실행 구조 | [Vite 설정](../../frontend/vite.config.ts) · [FastAPI 시작점](../../backend/app/main.py) | Windows 새 체크아웃에서 FastAPI 직접 호출과 Vite 경유 호출이 모두 HTTP 200, `{"status":"ok"}`를 반환했다. 브라우저의 ‘API 연결됨’과 서버 종료 시 ‘API 연결 실패’를 확인했다. |
| 예제 환경 파일과 시작 명령 | [환경변수 예제](../../frontend/.env.example) · [README 실행 안내](../../README.md#로컬-개발-실행) | 예제에서 로컬 환경 파일을 만들고 README 명령으로 두 서버를 시작했다. |
| 실행 환경과 의존성 재현 | [npm 잠금 파일](../../frontend/package-lock.json) · [Python 고정 의존성](../../backend/requirements.txt) | Node.js 22.15.1, npm 10.9.2, Python 3.12.10에서 `npm ci`, `npm run build`, Python 설치 및 `pip check`를 통과했다. |
| 팀원 한 명이 새 체크아웃에서 실행 | 아래 팀원 확인 절차 | 대기. 작성 중 수행한 새 체크아웃 시험은 위 세 항목의 근거로 기록했다. |

GitHub 공유 브랜치의 `d38f098`을 별도 폴더에 새로 복제해 설치, 프론트 빌드, FastAPI 직접 호출, Vite 경유 호출과 초기 HTML 응답을 다시 확인했다.

## 팀원 확인 절차

1. Windows PowerShell에서 새 폴더로 브랜치를 체크아웃하고 커밋을 확인한다.

   ```powershell
   git clone --branch codex/dev-01 --single-branch https://github.com/p-rebel/Dolbom-eum.git Dolbom-eum-dev01-check
   cd Dolbom-eum-dev01-check
   git rev-parse --short HEAD
   ```

2. [README 실행 안내](../../README.md#로컬-개발-실행)의 API와 프론트 명령을 각각 실행한다.
3. 브라우저의 ‘API 연결됨’ 표시와 `http://127.0.0.1:5173/api/v1/health`의 `{"status":"ok"}` 응답을 확인한다.
4. 아래 표에 확인자·날짜·커밋·실제 결과를 남긴다. 실행 중 오류가 있으면 실패한 명령과 메시지를 기록한다.

| 확인자 | 확인일 | 체크아웃 커밋 | 환경 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- | --- |
| 팀원 확인 대기 |  |  |  |  |  |
