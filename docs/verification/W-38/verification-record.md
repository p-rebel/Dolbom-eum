# 작업 38 배포 커밋 지정 및 검증 기록

**38번 통과. 첫 시연 배포 지정 SHA는 a1be1b88e12952a27bba6be7574470947c59323c이다.** 별도 작업 폴더에서 최신 origin/main을 고정하고 C-01·C-06의 저장 13단계를 각각 브라우저로 완료했다. 39번 서버 배포에서는 화면 제공 구성을 확인해야 한다.

| 항목 | 내용 |
| --- | --- |
| 검증 ID / 관련 작업 | W-38 / 작업 38, 선행 24·34. [작업 일정](../../development/WORK_SCHEDULE.md) · [DEV-07 작업 34](../../development/DEV-07.md#5-완료-기록) |
| 검증자 / 실행일 | Codex / 2026-11-13 한국 시간 |
| 검증 커밋·환경 | origin/main a1be1b88e12952a27bba6be7574470947c59323c, PR #18 병합. Windows PowerShell, Python 3.12.10, Node.js 22.15.1, npm 10.9.2, Vite 8.3.7, FastAPI 0.162.4, Playwright Chromium 156.0.8078.4. |
| 사전 조건 / 기준 | README, [D-06 통합 기준](../../design/D-06_work_items.md#통합-시점별-통과-기준), [단계별 결과](../../design/expected-results.md), [C-01·C-06 fixture](../../design/fixtures/C-01_C-06.json), 공단 v1.4 CSV blob e791fef54949f3256ce4ad151d513f345676d87b. |
| 입력 | 사례마다 별도 새 SQLite. 가상 계정 demo-town-a·demo-district-a, 가상 프로필 DEMO-ELDER-01, C-01·C-06 예제 입력. 각 DB 시드에 실행 중 생성한 검증용 비밀번호를 사용했다. |
| 수행 순서 | 실 API 설정에서 브라우저 로그인·역할 교대. 읍면동 v1~2 → 시군구 v3 → 읍면동 v4 → 시군구 v5~12 → 읍면동 v13. 두 역할로 상세 새로고침 후 GET과 화면·SQLite 이력을 비교했다. |
| 판정 | 로컬 브라우저 통합 통과. 39~42번 서버 배포·접속·복구·운영 인계는 후속 작업. |

## 완료 조건 대조

| 검증 | 기대 결과 | 실제 결과 | 판정 | 증거 |
| --- | --- | --- | --- | --- |
| 설치·빌드·실 API | 잠금 의존성 설치, 실 API 빌드와 브라우저 연결 | 새 venv 설치와 pip check, npm ci, npm run build 성공. VITE_USE_MOCK_API=false, 로그인 화면 ‘API 연결됨’, Vite 경유 GET /api/v1/health 200 및 시드 가상 계정 로그인 200. pytest 127개 통과, Starlette TestClient 사용 중단 예정 경고 1건. | 통과 | [빌드](frontend-build.log) · [pytest](pytest.log) · [브라우저 연결](C-01/01-real-api.png) |
| 24번 기준 재확인 | 접수부터 초안 저장까지 화면 입력. 같은 사례 v4를 새로고침해 공단 행 ID·출처·기준일 재조회 | 두 사례 모두 읍면동·시군구의 화면으로 v1~4 저장. 초안 저장 응답과 읍면동의 새로고침 GET이 일치. A/B/C 순서와 v1.4, 2026-06-30 확인. | 통과 | [C-01 읍면동 v4](C-01/03-town-v4-reload.png) · [C-06 읍면동 v4](C-06/03-town-v4-reload.png) |
| C-01 정상 | 확정·안내·3개 항목 연계·제공·모니터링을 화면에서 처리. 완료 v13, 이력 13건 | 13단계 모두 화면으로 저장. 11/09 방문·상태 변화 없음, A/B 이용 중, C 확인 중, 후속 검토 불필요. 양쪽 역할의 새로고침에서 버전 13, 이력 13건과 동일 API 상세. 사례 ID 5fd16f75-a614-4f49-8e4a-fea55acdf64a. | 통과 | [역할·단계별 브라우저 API](C-01/browser-api-evidence.json) · [시군구 v13 요약](C-01/v13-district-summary.png) · [시군구 이력](C-01/v13-district-history.png) |
| C-06 일부 미개시 | B 제공 ‘확인 중’과 관찰 ‘미개시’, 사유 및 후속 검토 사유를 각각 표시. 완료 v13, 이력 13건 | 13단계 모두 화면으로 저장. B 제공 사유 ‘가상 개시 여부 확인 전’, 미개시 관찰 사유 ‘가상 개시일 미정’, 후속 검토 사유 ‘가상 미개시 항목의 후속 확인’. 양쪽 역할의 새로고침에서 버전 13, 이력 13건과 동일 API 상세. 사례 ID 392a7d22-f1df-46ac-8a58-666ef724cc66. | 통과 | [역할·단계별 브라우저 API](C-06/browser-api-evidence.json) · [시군구 v13 모니터링](C-06/v13-district-monitoring.png) · [시군구 이력](C-06/v13-district-history.png) |
| C-06 필수 사유 화면 검사 | 누락·공백이면 해당 입력칸 오류와 초점, 버전·이력 유지 | 시군구 제공 미개시 사유 누락은 v11에서 차단. 읍면동 미개시 관찰 사유 누락과 후속 검토 사유 누락·공백은 v12에서 차단. 브라우저 단계에서 요청을 보내기 전에 막았고 이후 정상 입력으로 v13까지 저장했다. | 통과 | [C-06 화면·오류·요청 수](C-06/browser-api-evidence.json) · [후속 검토 공백 오류](C-06/09-town-v12-review-reason-whitespace.png) |
| 공단·DB 정합성 | 사례별 DB, 공단 v1.4 공개 89,738행, 최종 저장값과 처리 이력 일치 | 각각 90,081행 적재, N 89,738행·Y 343행. 두 DB의 사례 ID는 서로 다르며 접수번호는 각 DB의 DEMO-0001. SQLite 무결성 및 외래키 검사 통과, 저장값과 이력은 응답과 일치. | 통과 | [C-01 DB 적재](C-01/database.log) · [C-06 DB 적재](C-06/database.log) · [fixture·SQLite 비교](evidence-check.log) |

## 실행 명령

- 저장소에서 git fetch origin main, git worktree add --detach <별도 경로> <SHA>.
- 검증 루트에서 python -m venv .venv, .\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt, pip check. backend에서 ..\.venv\Scripts\python.exe -m pytest. [설치 로그](python-install.log)
- frontend에서 .env.example을 .env로 복사, npm ci, npm run build, npm run dev -- --strictPort. [Vite](vite.log)
- 검증 루트에서 PYTHONPATH=backend와 사례별 DOLBOMEUM_DB_PATH 설정. 가상 비밀번호를 환경값으로 전달하고 python -m app.db init, seed, load-nhis를 실행. python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000으로 FastAPI 실행. [C-01 FastAPI 로그](C-01/fastapi.log) · [C-06 FastAPI 로그](C-06/fastapi.log)

## 오류와 재검증

| 오류 ID | 영향 | 재현 절차 | 수정·확인 담당 | 수정 버전 | 재검증 결과 |
| --- | --- | --- | --- | --- | --- |
| W38-DEP-01 | FastAPI 단독으로 시연 사이트를 제공하면 첫 화면과 상세 직접 접속·새로고침에서 404가 난다. | 이 SHA에서 npm run build 후 README대로 FastAPI를 기동한다. FastAPI 포트에 GET / 와 GET /cases/demo-readback-check 요청 시 404 JSON. Vite를 경유하면 로그인과 실제 사례 상세 새로고침 성공. | 양이수 39번 배포 구성, 김재현 40번 화면 접속 확인 | 미정 | 시연 HTTPS 주소에서 /, /api/v1/health, 로그인, 실제 /cases/{caseId} 직접 열기·새로고침을 확인한다. [직접 요청 증거](C-01/browser-api-evidence.json) · [DEV-03 알려진 제약](../../development/DEV-03.md#5-진행을-막는-항목과-확인-요청) |

## 양이수에게 넘길 내용

> 38번 로컬 통합 검증을 완료했습니다. 39번 첫 시연 배포는 **a1be1b88e12952a27bba6be7574470947c59323c**를 사용해 주세요. 공단 v1.4를 적재한 별도 DB 두 개에서 C-01과 C-06을 모두 화면으로 완료했고, 양쪽 역할의 상세 새로고침에서 각각 버전 13·이력 13건을 확인했습니다.
>
> 배포 환경에서 VITE_USE_MOCK_API=false로 프런트를 빌드하고, HTTPS 한 출처에서 화면·정적 파일과 /api/v1을 제공해 주세요. 이 커밋의 FastAPI를 직접 띄우면 화면 경로는 404입니다. 빌드 결과 제공과 /cases/{caseId} 새로고침 시 index.html 응답을 배포 구성에서 확인해 주세요. 이 구성에 소스 변경이 필요하면 변경된 SHA를 전달해 통합 검증과 배포 버전 기록을 맞춰 주세요.
>
> 시연 HTTPS 주소를 DOLBOMEUM_APP_ORIGINS에 지정하고 DOLBOMEUM_COOKIE_SECURE=true를 설정해 주세요. SQLite는 저장소 밖 지속 경로 DOLBOMEUM_DB_PATH에 두고 가상 계정과 공단 v1.4를 준비해 주세요. 가상 비밀번호는 팀 공유 경로로 전달하고, 기존 시연 DB가 있다면 초기화 전에 백업과 대상 경로를 확인해 주세요.
>
> 배포 후 팀에 시연 주소·실제 배포 SHA·실행 및 DB 백업/복구 절차를 남겨 주세요. 김재현의 40번 화면 접속 확인에 직접 상세 URL 새로고침을 포함하고, 41번에서 재시작·복구 전후 상세와 모니터링 값 일치를 확인해 주세요.

[README 실행 안내](../../../README.md#로컬-개발-실행) · [D-06 배포 및 H-03 기준](../../design/D-06_work_items.md#실행-구성과-h-03-인계)

## 남은 제약

| 항목 | 상태 | 남은 확인 |
| --- | --- | --- |
| 시연 HTTPS·화면 정적 파일 제공·Secure 세션·서버 복구 | 미실행 | 39번 배포 후 40~42번에서 확인. 로컬 Vite 프록시의 동작은 위 증거에 기록했다. |
| AC-01~07 전체 인수 검증 | 38번의 범위는 C-01·C-06 전체 브라우저 흐름 및 배포 SHA 지정 | H-03 및 후속 검증에서 배포 환경에 대해 실행한다. |

## 배포용 빌드 재검증

2026-11-13 한국 시간에 같은 지정 SHA를 다시 검증했다. npm run build로 생성한 dist를 Vite preview로 제공하고, 같은 출처의 /api를 실제 FastAPI로 연결했다. Chromium이 /assets/index-CAjVnb7x.js 번들을 로드하는 것을 확인했다. 두 사례는 각각 새로운 테스트 DB에서 실행했다. [재빌드 로그](recheck/frontend-build.log) · [프리뷰 실행](recheck/vite-preview.log)

| 항목 | 재검증 결과 | 증거 |
| --- | --- | --- |
| C-01 정상 | 브라우저로 저장 13회. 읍면동·시군구 새로고침에서 각각 버전 13, 이력 13건. 후속 검토 불필요. | [C-01 API 응답](recheck/C-01/browser-api-evidence.json) · [시군구 이력 화면](recheck/C-01/v13-district-history.png) |
| C-06 일부 미개시 | 브라우저로 저장 13회. 양쪽 역할에서 버전 13, 이력 13건. B의 기존 ‘확인 중’, 관찰 ‘미개시’, 미개시·후속 검토 사유 표시. 필수 사유 누락·공백은 화면에서 차단됐다. | [C-06 API 응답](recheck/C-06/browser-api-evidence.json) · [시군구 모니터링 화면](recheck/C-06/v13-district-monitoring.png) |
| 상세 경로 | 각 사례의 실제 상세 URL은 로컬 Vite preview에서 HTTP 200 HTML, FastAPI 포트에서 HTTP 404 JSON. 시연 HTTPS 서버의 정적 파일 제공과 상세 경로 처리는 39~40번에서 확인한다. | [두 사례의 상세·fixture·SQLite 대조](recheck/evidence-check.log) |
| 백엔드 | pytest 127개 통과, Starlette TestClient의 httpx 관련 사용 중단 예정 경고 1건. | [재실행 로그](recheck/pytest.log) |
