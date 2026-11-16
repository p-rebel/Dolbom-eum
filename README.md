# Dolbom-eum 돌봄e음

A public service platform simplifying access to integrated community care.

돌봄e음 팀의 프로젝트 계획과 산출물을 관리하는 저장소입니다.

## 로컬 개발 실행

Node.js 22.12 이상과 Python 3.12가 필요합니다. DEV-01 실행 확인에는 Windows PowerShell, Node.js 22.15.1, npm 10.9.2, Python 3.12.10을 사용했습니다.

저장소 루트에서 API를 시작합니다.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
$env:PYTHONPATH = "backend"; .\.venv\Scripts\python.exe -m app.db init
$env:DOLBOMEUM_DEMO_PASSWORD = "<팀 카톡방에서 받은 가상 계정 비밀번호>"; .\.venv\Scripts\python.exe -m app.db seed
.\.venv\Scripts\python.exe -m app.db load-nhis
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

`app.db init`은 SQLite 스키마를 만들고 기존 데이터는 유지합니다. 기본 경로는 저장소의 `var/dolbomeum.sqlite3`(git 제외)이고, `DOLBOMEUM_DB_PATH` 환경값으로 바꿀 수 있습니다. `init --reset`은 지정 경로의 DB를 지우고 새로 만들고, `backup <파일>`은 실행 중에도 일관된 사본을 만듭니다. 테스트는 `backend/requirements-dev.txt`를 설치한 뒤 `backend` 폴더에서 `python -m pytest`로 실행합니다.

`app.db seed`는 담당자 계정 4개(`demo-town-a`, `demo-town-a2`, `demo-district-a`, `demo-town-b`), 신청자 계정 2개(`demo-applicant-a`, `demo-applicant-b`), 프로필 `DEMO-ELDER-01`을 만듭니다. 모든 가상 계정은 `DOLBOMEUM_DEMO_PASSWORD`(8자 이상)를 같은 비밀번호로 사용하며, 비밀번호는 저장소에 두지 않습니다.

`app.db load-nhis`는 공단 v1.4 `data/processed/nhis_services.csv`를 `nhis_catalog`에 적재합니다. 필수 헤더, 행 수 90,081, ID 고유성을 먼저 확인하고 하나라도 다르면 아무것도 저장하지 않습니다. 완료 시 DB 행 수와 조회 대상(N) 89,738행·숨김(Y) 343행을 출력합니다. 다시 실행하면 같은 행을 갱신합니다.

API 서버 환경값은 아래와 같습니다. 상태를 바꾸는 요청(`POST`·`PUT`·`DELETE`)은 `Origin`이 허용 출처와 같아야 합니다. 로컬은 기본값으로 동작하므로 브라우저에서 `localhost`가 아닌 `http://127.0.0.1:5173`으로 접속합니다.

| 환경값 | 기본값 | 팀 시연 서버 |
| --- | --- | --- |
| `DOLBOMEUM_DB_PATH` | `var/dolbomeum.sqlite3` | 저장소 밖 고정 경로 |
| `DOLBOMEUM_APP_ORIGINS` | `http://127.0.0.1:5173` | 팀 HTTPS 주소 (쉼표로 여러 개) |
| `DOLBOMEUM_COOKIE_SECURE` | 미적용 | `true` |
| `DOLBOMEUM_DEMO_PASSWORD` | 없음 (시드할 때 필수) | 저장소 밖에서 공유 |

새 터미널의 저장소 루트에서 프론트를 시작합니다.

```powershell
cd frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run dev
```

브라우저에서 `http://127.0.0.1:5173`을 열어 ‘API 연결됨’을 확인합니다. 같은 출처의 `/api/v1/health`는 Vite를 거쳐 FastAPI에 연결되어 `{"status":"ok"}`를 반환합니다. API 주소를 바꾸면 `frontend/.env`의 `DOLBOMEUM_API_PROXY_TARGET`도 맞춥니다. 프론트 타입 검사와 빌드는 `frontend`에서 `npm run build`로 실행합니다.

화면은 실제 API에 연결되어 동작합니다(`frontend/.env`의 `VITE_USE_MOCK_API=false`). 로그인 계정은 `app.db seed`로 만든 가상 계정과 그때 정한 비밀번호를 씁니다. 백엔드 없이 화면만 보려면 `true`로 바꾸고 `npm run dev`를 다시 시작합니다. 이때 상단에 ‘목업 모드’가 표시되고 [예시 응답](frontend/src/api/mock.ts)을 사용하며, 목업 전용 비밀번호 `demo-password`로 로그인합니다. 목업은 접수부터 초안까지만 흉내 내므로 확정 이후 단계와 통합 확인·배포는 `false`로 확인합니다.

폴더 구조, 담당자별 작업 경계, 첫 통합 통과 기준과 팀원 실행 절차는 [DEV-01 작업 기록](docs/development/DEV-01.md)에 있습니다.

## 신청자 모의 제출 시연

- 공통 홈페이지에서 ‘돌봄 신청하기’ 또는 ‘신청자 로그인’을 누릅니다. `demo-applicant-a`로 로그인해 ‘가상 정보 불러오기’를 선택하면 가족 대리 신청을 시작할 수 있습니다.
- 동의와 가상 증빙을 확인하면 통합지원 신청서와 개인정보 수집·이용 동의서를 PDF로 미리 볼 수 있습니다. 가상 접수처에 제출하면 `SIM-` 번호가 생기고, ‘내 신청 현황’에서 두 PDF를 다시 열 수 있습니다.
- 같은 홈페이지에서 ‘공무원·관리자 로그인’을 누른 뒤 `demo-town-a` 또는 `demo-district-a`로 로그인합니다. 관할 A의 시연 신청은 ‘가상 제출함’에 표시되며, 담당자가 신청 정보와 PDF를 함께 열 수 있습니다.
- OCR을 시연하려면 신청서의 ‘동의와 증빙’ 단계에서 가상 확인서 한 장을 선택해 제출합니다. ‘가상 정보 불러오기’로 대상자 A를 입력한 뒤 기본 확인서, 주소가 다른 확인서, 식별자가 흐릿한 확인서를 각각 선택해 볼 수 있습니다.
- 같은 단계의 ‘가상 증빙 사진 직접 첨부’에서 가상 정보만 적힌 JPG·PNG·WebP 한 장(최대 8MB)을 올릴 수도 있습니다. 자동 대조를 시연하려면 사진에 성명, 생년월일, 가상 식별자, 주소 라벨과 각 값을 넣습니다.
- ‘가상 정보 불러오기’로 채운 신청값에 맞춰 직접 첨부할 JPG를 두 장 준비했습니다. [전체 일치 사진](docs/assets/registration/evidence-match.jpg)의 주소는 ‘가상 A시 돌봄로 10’입니다. [주소 불일치 사진](docs/assets/registration/evidence-address-mismatch.jpg)은 같은 정보에서 번지만 ‘30’으로 바꿨습니다.
- 담당자는 모의 신청 상세에서 ‘OCR 자동 대조’를 실행합니다. 화면에서 증빙 원본, 신청값, OCR 판독값을 볼 수 있습니다. 예시 확인서는 별도의 가상 기준값도 표시합니다. ‘원본 확인’으로 확인값과 내용을 저장할 수 있습니다. OCR 엔진과 언어 모델은 프론트와 함께 제공되며 판독은 브라우저에서 실행됩니다.
- 기존 DB를 사용하는 팀원은 `app.db init`으로 스키마를 갱신하고 `app.db seed`를 다시 실행해 신청자 계정을 추가합니다. 모의 제출을 시연하려면 실제 API 모드를 사용합니다.

공개 홈의 사진(`frontend/public/images/home-hero.jpg`)과 그림(`home-intro.png`)은 ChatGPT로 생성한 이미지이며 실존 인물을 쓰지 않았습니다. `mohw-logo.png`는 대체할 보건복지부 지역사회 통합돌봄 누리집의 운영기관 로고(정부 상징 포함)를 그 누리집에서 받은 파일로, `VITE_OFFICIAL_SITE=true`일 때만 상단·하단에 쓰입니다. 기관에 넘길 때 보건복지부가 제공하는 원본 파일로 바꿉니다.

PDF는 [보건복지부 공식 신청 서식](https://www.mohw.go.kr/board.es?act=view&bid=0073&list_no=1489873&mid=a60401000000)에 가상 정보를 채웁니다. PDF 글꼴은 [Nanum Gothic](https://github.com/google/fonts/tree/cc39c4c2c304bc368c9b7c311ea2bcc6013299fe/ofl/nanumgothic)이며, 배포 허가문은 PDF 서식과 같은 폴더의 `OFL.txt`에 있습니다.

## 프로젝트 일정

| 마감 | 완료할 결과 |
| --- | --- |
| 11/12 | 접수부터 계획 초안 재조회까지 첫 통합 |
| 11/13 | C-01·C-06 기능과 화면 연결 |
| 11/14 | 첫 서버 배포와 검증 인계 |
| 11/15 | 전체 검증과 오류 수정 |
| 11/16 | 최종 배포·재검증과 앱 완료 확인 |
| 11/17 | 최종 실행·시연·제출 자료 인계 |

검증·수정은 김예랑·이보미 공동 주관, 전원 참여로 진행합니다. 앱 완료 기한은 11월 16일, 최종 자료 인계 기한은 17일입니다. 제출 시각과 형식은 별도로 확인합니다.

## 프로젝트 문서

| 문서 | 용도 |
| --- | --- |
| [실행 계획](PLAN.md) | 담당자, 일정, 단계별 제출물과 인수 체크리스트 |
| [전체 프로젝트 운영 기획서](docs/PROJECT_PLAN.md) | 공식 자료를 바탕으로 한 조사 체계, 단계별 작업, 산출물 명세와 협업 방식 |
| [1차 시연 설계](docs/design/README.md) | 범위, 업무 상태, 화면, DB, API, 개발 작업과 H-02 인수 검토 |
| [작업 일정 및 선행관계표](docs/development/WORK_SCHEDULE.md) | 작업 번호, 담당자, 마감일, 선행 작업과 카톡 완료 보고 방식 |
| [조사 기록 양식](docs/templates/research-record.md) | 업무·자료·근거와 다음 단계에 전달할 결과 기록 |
| [인수인계 양식](docs/templates/handoff-record.md) | 전달자와 수신자의 자료·완료 조건 확인 |
| [작업 관리 양식](docs/templates/work-item.md) | 담당자·선행 작업·완료 기준·진행 상태 관리 |
| [검증 기록 양식](docs/templates/verification-record.md) | 기대 결과·실제 결과·오류 수정·재검증 기록 |

이번 문서는 **프로젝트를 어떻게 진행하고 단계마다 무엇을 전달할지** 정합니다. 제품의 기능, 화면, 데이터 구조, API, 기술 선택은 조사 이후의 별도 설계 산출물에서 정합니다.

## 이미지와 도표

공식 절차와 서비스 분류를 참고하는 이미지 2개를 [기획서](docs/PROJECT_PLAN.md#policy-reference)에 포함했습니다. 출처는 [이미지 안내](docs/assets/policy/README.md)에 기록합니다.

Markdown은 이미지 파일의 경로를 참조합니다. 이미지도 함께 커밋하면 GitHub에서 문서 안에 표시됩니다.

```markdown
![통합돌봄의 공식 절차](docs/assets/policy/care-process.png)
```

프로젝트 진행도는 수정하기 쉬운 Mermaid 코드로 작성했고, 위 간트차트는 PNG 이미지로 저장했습니다.

## 기준 자료

- [보건복지부 지역사회 통합돌봄 누리집](https://www.mohw.go.kr/integratedcare/)
- [지역사회 통합돌봄 한 눈에 보기](https://www.mohw.go.kr/menu.es?mid=a60100000000)
- [지역사회 통합돌봄 이용안내](https://www.mohw.go.kr/menu.es?mid=a60200000000)

계획 기준일: **2026년 11월 4일**. 진행 상태는 [실행 계획](PLAN.md)에서 관리합니다.
