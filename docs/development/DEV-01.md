# DEV-01 공통 실행 구조 작업 기록

| 항목 | 내용 |
| --- | --- |
| 담당자 | 이동수 |
| 착수일·목표일 | 2026-11-11 |
| 상태 | 완료 · 2026-11-11 |
| 선행 작업과 착수 근거 | H-02 팀 인수 판정 대기 중 DEV-01 착수. 설계 입력은 PR #1의 검토본 4 커밋 `6c7b769`. |
| 최초 실행 확인 커밋 | `3ea8919` |

완료 기준은 [D-06 개발 작업표](../design/D-06_work_items.md)의 DEV-01 행을 따른다. 공통 실행 코드·환경 예제·실행 안내의 main 반영과 새 체크아웃 실행 검증으로 완료했다. 추가 팀원 실행 확인은 프론트 작업의 시작 절차로 관리한다. [H-02 설계 인수](../handoffs/H-02_design_handoff.md) · [설계 PR #1](https://github.com/p-rebel/Dolbom-eum/pull/1)

## 결과물과 확인

| 결과와 완료 기준 | 산출물 | 확인 결과 |
| --- | --- | --- |
| 프론트·API 공통 실행 구조 | [Vite 설정](../../frontend/vite.config.ts) · [FastAPI 시작점](../../backend/app/main.py) | Windows 새 체크아웃에서 FastAPI 직접 호출과 Vite 경유 호출이 모두 HTTP 200, `{"status":"ok"}`를 반환했다. 브라우저의 ‘API 연결됨’과 서버 종료 시 ‘API 연결 실패’를 확인했다. |
| 예제 환경 파일과 시작 명령 | [환경변수 예제](../../frontend/.env.example) · [README 실행 안내](../../README.md#로컬-개발-실행) | 예제에서 로컬 환경 파일을 만들고 README 명령으로 두 서버를 시작했다. |
| 실행 환경과 의존성 재현 | [npm 잠금 파일](../../frontend/package-lock.json) · [Python 고정 의존성](../../backend/requirements.txt) | Node.js 22.15.1, npm 10.9.2, Python 3.12.10에서 `npm ci`, `npm run build`, Python 설치 및 `pip check`를 통과했다. |

GitHub 공유 브랜치의 `d38f098`을 별도 폴더에 새로 복제해 설치, 프론트 빌드, FastAPI 직접 호출, Vite 경유 호출과 초기 HTML 응답을 다시 확인했다.

## 폴더 구조와 API 연결

```text
frontend/
  vite.config.ts                 개발 서버와 /api 전달 설정
  src/
    main.tsx                     React 시작점
    App.tsx                      화면을 구성하는 앱 시작점
    api/client.ts                같은 출처의 /api/v1 호출
    features/health/
      HealthStatus.tsx           API 연결 확인 화면
backend/
  app/
    main.py                      FastAPI 앱 시작점
    api/
      router.py                  /api/v1 공통 경로와 기능 라우터 등록
      health.py                  연결 확인 API
data/                            공단 CSV와 개발 참고 샘플
```

프론트는 `apiFetch('/health')`처럼 공통 클라이언트에 D-04의 상대 경로를 넘긴다. 브라우저는 같은 출처로 `/api/v1/health`를 호출하고, 개발 중 Vite가 `/api` 요청을 `DOLBOMEUM_API_PROXY_TARGET`으로 전달한다. 백엔드는 기능 라우터에서 `/health`처럼 상대 경로를 선언하고 `api/router.py`에 등록한다. 사용자 세션을 연결할 때도 같은 출처의 호출을 사용하며, 요청·응답과 오류 형식은 [D-04 API 계약](../design/D-04_api.md)을 따른다.

구조 변경 후 프론트 타입 검사·빌드를 통과했다. FastAPI의 OpenAPI에 `GET /api/v1/health`가 한 번 등록되며, 직접 호출과 Vite 경유 호출이 모두 HTTP 200을 반환했다. 브라우저에서 ‘API 연결됨’을 확인했다.

## 팀원별 작업 경계

| 담당자 | 담당 코드와 인터페이스 | 첫 통합에서 확인할 결과 |
| --- | --- | --- |
| 이동수 | 공통 FastAPI 시작점·라우터 등록. `backend/app/api/case_workflow.py`에 사전조사·판정·초안 저장을 추가하고, `backend/app/workflow.py`에 두 사례 라우터가 사용할 상태 전환·`allowedActions` 판정 규칙을 둔다. | 동일한 사례가 버전 2·3·4를 순서대로 거쳐 재조회되는지 확인한다. |
| 김재현 | `frontend/src/App.tsx`와 `features/`의 로그인·신청·검색·계획 화면, `api/client.ts`를 통한 API 연결을 담당한다. | 읍면동·시군구 계정으로 작업을 이어가고, 검색한 서비스를 선택해 초안 저장과 화면 재조회를 확인한다. |
| 양이수 | 백엔드·DB와 팀 시연 서버 운영·배포를 담당한다. `backend/app/db/`의 SQLite 연결·스키마·트랜잭션과 `api/sessions.py`, `api/cases.py`, `api/catalog.py`를 맡는다. 상세 응답의 `allowedActions`에는 이동수가 제공한 규칙을 연결한다. | 가상 계정·프로필, 접수 키와 사례 ID, 공단 조회·출처, 저장 데이터 재조회가 실제 API로 동작하는지 확인한다. |
| 김예랑 | C-01의 업무 순서, 역할과 단계별 기대값을 검토한다. | 읍면동 접수·사전조사, 시군구 판정, 읍면동 초안 저장 순서를 확인한다. |
| 이보미 | 공단 v1.4 원본과 API·화면 표시값을 대조한다. | 음성군 검색 결과의 서비스 ID·출처·기준일을 확인한다. |

표에 있는 기능 파일은 각 담당자가 구현할 때 추가한다. 양이수의 저장·세션·접근 제어를 업무 전환 API에서 공통으로 사용한다. API 경로·필드·오류 코드가 바뀌면 계약 문서와 예제를 함께 갱신하고 화면·백엔드 담당이 확인한다.

양이수의 서버 구성·배포와 접속 주소 인계는 [D-06의 DEV-08과 B-03](../design/D-06_work_items.md#실행-구성과-h-03-인계)에서 확인한다.

## 첫 통합 완료 기준

11월 12일 첫 통합은 한 실행 버전에서 실제 화면과 API로 C-01의 접수부터 계획 초안 재조회까지 이어지면 통과한다. 가상 계정과 공단 v1.4를 사용하고, 같은 사례 ID로 아래 순서를 확인한다.

| 순서 | 수행과 확인값 |
| --- | --- |
| 1. 접수 | 읍면동 계정으로 새 가상 신청 한 건을 접수한다. `POST /cases`는 HTTP 201, `RECEIVED`, 버전 1과 사례 ID를 반환한다. |
| 2. 사전조사와 판정 | 읍면동 사전조사 저장 후 `SCREENED` 버전 2, 시군구 판정 저장 후 `ASSESSED` 버전 3을 확인한다. |
| 3. 공단 검색과 선택 | 읍면동 계획 화면에서 충청북도 음성군의 ‘다제약물’을 검색한다. ID `nhis_20260630_r00001`, 출처 ‘국민건강보험공단_통합돌봄 서비스 자원’, 기준일 `2026-06-30`을 확인하고 서비스 후보로 선택한다. |
| 4. 초안 저장과 재조회 | 읍면동 계정으로 버전 3의 사례에 초안을 저장한다. HTTP 200, `PLAN_DRAFTED`, 버전 4를 확인한다. 같은 사례를 새로고침해 `GET /cases/{caseId}`와 화면에서 버전 4의 초안 및 선택한 서비스 ID·출처·기준일을 확인한다. |

이동수는 실행 커밋, 사례 ID, 단계별 응답, 마지막 화면을 남긴다. 김재현은 화면, 양이수는 API·저장, 김예랑은 업무 순서, 이보미는 공단 표시값을 대조한다. [D-06 첫 통합 일정](../design/D-06_work_items.md#통합-시점별-통과-기준) · [C-01 요청 예제](../design/fixtures/C-01_C-06.json)

## 프론트 개발 시작 시 환경 실행 확인

1. Windows PowerShell에서 새 폴더로 브랜치를 체크아웃하고 커밋을 확인한다.

   ```powershell
   git clone --branch main --single-branch https://github.com/p-rebel/Dolbom-eum.git Dolbom-eum-dev01-check
   cd Dolbom-eum-dev01-check
   git rev-parse --short HEAD
   ```

2. [README 실행 안내](../../README.md#로컬-개발-실행)의 API와 프론트 명령을 각각 실행한다.
3. 브라우저의 ‘API 연결됨’ 표시와 `http://127.0.0.1:5173/api/v1/health`의 `{"status":"ok"}` 응답을 확인한다.
4. 실행 중 오류가 있으면 실패한 명령과 메시지를 작업 기록에 남긴다. 이 확인은 로그인 화면 작업의 시작 절차로 수행한다.
