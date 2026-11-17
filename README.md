# Dolbom-eum 돌봄e음

A public service platform simplifying access to integrated community care.

돌봄e음 팀의 프로젝트 계획과 산출물을 관리하는 저장소입니다.

## 팀원용 로컬 시연

Python 3.12 이상과 Node.js 22.12 이상(npm 포함)이 필요합니다. 처음 받는 팀원은 `git clone https://github.com/p-rebel/Dolbom-eum.git`으로 저장소를 받은 뒤 `Dolbom-eum` 폴더를 엽니다. 저장소 루트에서 다음을 실행합니다.

```sh
git switch main
git pull --ff-only origin main
python scripts/run_local_demo.py
```

macOS·Linux에서 Python 명령이 `python3`인 경우 `python3 scripts/run_local_demo.py`를 사용합니다. Windows에서 Python Launcher를 쓴다면 `py -3.12 scripts/run_local_demo.py`로 실행할 수 있습니다.

첫 실행에는 패키지를 내려받을 인터넷 연결이 필요합니다. 스크립트가 화면을 빌드하고 시연용 SQLite에 가상 계정과 공단 v1.4 목록을 준비합니다. 터미널에 주소와 공통 비밀번호가 표시되면 [로컬 시연 화면](http://127.0.0.1:8080/)을 엽니다.

8080 포트를 사용 중이라면 `python scripts/run_local_demo.py --port 8081`로 실행하고 터미널에 표시된 주소를 엽니다.

기본 화면은 보건복지부 지역사회 통합돌봄 디자인을 참고한 로고와 하단을 사용합니다. ‘가상 사례 시연’ 표시로 보려면 로컬 시연 명령에 `--demo-labels`를 붙이거나, 개발·배포 빌드의 `frontend/.env`에 `VITE_OFFICIAL_SITE=false`를 설정합니다.

### 회원가입 및 로그인

1. 홈페이지 오른쪽 위 **로그인**을 누른 뒤 **신청자 회원가입**을 선택합니다.
2. **계정명**, 시연용 **표시 이름**, **비밀번호**(8~128자)를 입력하고 **가입하기**를 누릅니다.
3. 가입이 끝나면 계정명이 로그인 화면에 채워집니다. 가입할 때 정한 비밀번호로 **로그인**하면 신청서를 작성할 수 있습니다. 제출한 내역은 **나의 신청 → 내 신청 현황**에서 확인합니다.

아래 기본 시연 계정으로도 로그인할 수 있습니다. 기본 계정에는 실행 터미널에 표시된 공통 비밀번호를 사용합니다.

| 역할 | 계정명 | 홈페이지에서 누를 버튼 |
| --- | --- | --- |
| 신청자 | `demo-applicant-a` | 오른쪽 위 ‘로그인’ |
| 읍면동 담당자 | `demo-town-a` | 맨 아래 ‘공무원·관리자 로그인’(로그인 화면 안내 칸에도 있음) |

가입 계정과 제출 내역은 각 PC의 `var/local-demo/demo.sqlite3`에 저장됩니다. `Ctrl+C`로 종료한 뒤 같은 명령으로 다시 실행하면 같은 계정으로 로그인해 제출 내역을 이어서 볼 수 있습니다.

### 신청서 작성부터 증빙 OCR 대조까지

1. 신청자 계정으로 로그인합니다. **돌봄 신청서 작성** 화면에서 **가상 정보 불러오기 → 동의와 증빙으로**를 누릅니다. 신청값은 가상 대상자 A와 주소 `가상 A시 돌봄로 10`으로 채워집니다.
2. 이 시연에서는 동의 항목을 모두 **동의함**으로 선택하고 **신청인 신분 확인 시연 자료를 준비했습니다**를 체크합니다.
3. **가상 증빙 사진 직접 첨부**에서 아래 JPG 중 한 장을 선택합니다. **가상 정보와 제출 내용, 각 동의 선택을 확인했습니다**를 체크하고 **서류 서명**에서 마우스 또는 손가락으로 서명을 그립니다. **서류 미리보기**에서 신청서와 동의서의 서명란, 첨부 사진을 확인합니다.
4. **가상 접수처에 제출**을 누르면 신청 완료 화면이 나옵니다. `SIM-`으로 시작하는 접수번호를 기록하고 **다시 신청하기**로 같은 신청값과 다른 사진으로 한 건 더 제출합니다.
5. 로그아웃 후 담당자 계정으로 로그인합니다. **가상 제출함**에서 기록한 번호를 열고 **증빙 원본 열기 (새 창)**로 사진을 확인합니다. **OCR 자동 대조**를 눌러 신청값과 판독값을 비교합니다.

| 직접 첨부할 사진 | 사진 속 주소 | 기대 결과 |
| --- | --- | --- |
| [전체 일치 JPG](docs/assets/registration/evidence-match.jpg) | 가상 A시 돌봄로 10 | 성명·생년월일·가상 식별자·주소 모두 **일치** |
| [주소 불일치 JPG](docs/assets/registration/evidence-address-mismatch.jpg) | 가상 A시 돌봄로 30 | 성명·생년월일·가상 식별자는 **일치**, 주소만 **불일치** |

직접 만든 증빙은 가상 정보만 적힌 JPG·PNG·WebP 한 장(최대 8MB)을 사용합니다. 사진에 성명, 생년월일, 가상 식별자, 주소와 각 값을 적어 주세요. 흐릿하거나 빠진 항목은 **확인 필요**로 표시되며, 담당자는 **원본 확인**에서 확인값과 메모를 저장할 수 있습니다. OCR은 로컬로 제공되는 엔진과 언어 모델을 사용해 브라우저에서 실행됩니다.

공개 홈의 사진(`frontend/public/images/home-hero.jpg`)과 그림(`home-intro.png`)은 ChatGPT로 생성한 이미지이며 실존 인물을 쓰지 않았습니다. `mohw-logo.png`는 대체할 보건복지부 지역사회 통합돌봄 누리집의 운영기관 로고(정부 상징 포함)를 그 누리집에서 받은 파일로, `VITE_OFFICIAL_SITE=true`일 때만 상단·하단에 쓰입니다. 기관에 넘길 때 보건복지부가 제공하는 원본 파일로 바꿉니다.

PDF는 [보건복지부 공식 신청 서식](https://www.mohw.go.kr/board.es?act=view&bid=0073&list_no=1489873&mid=a60401000000)에 가상 정보를 채웁니다. PDF 글꼴은 [Nanum Gothic](https://github.com/google/fonts/tree/cc39c4c2c304bc368c9b7c311ea2bcc6013299fe/ofl/nanumgothic)이며, 배포 허가문은 PDF 서식과 같은 폴더의 `OFL.txt`에 있습니다.

### 보완·판정·모니터링 시연

- 기본 신청자 계정(`demo-applicant-a`, `demo-applicant-b`)으로 로그인해 **본인 신청 → 내정보로 채워넣기**를 누르면 계정의 가상 본인 정보와 관할을 불러옵니다. 동의 여부와 돌봄 필요 항목은 직접 선택합니다.
- 담당자 **가상 제출함**의 신청 상세에서 사유를 입력해 **보완 요청**을 보냅니다. 신청자는 **내 신청 현황 → 보완 신청서 작성**으로 직전 제출값을 불러옵니다. 보완 재제출 후 같은 번호 아래 **제출본** 목록에서 차수별 신청값과 PDF 두 종을 확인합니다.
- 담당자 **신청 상세**에서 읍면동이 사전조사의 판정 경로를 공단 판정 또는 자체조사로 기록합니다. 시군구는 판정 결과와 사유를 기록합니다. 지원계획 수립 대상은 초안으로 이어지고, 지원 비해당은 판정 결과와 사유를 조회합니다.
- 서비스 연계와 제공 현황을 기록하면 읍면동이 모니터링을 차수별로 추가할 수 있습니다. 후속 검토가 필요한 차수는 시군구가 결과와 의견을 저장하고, 관할 담당자가 같은 상세 화면에서 조회합니다.

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

`app.db seed`는 담당자 계정 4개(`demo-town-a`, `demo-town-a2`, `demo-district-a`, `demo-town-b`), 신청자 계정 2개(`demo-applicant-a`, `demo-applicant-b`), 프로필 `DEMO-ELDER-01`을 만듭니다. 이 기본 계정들은 `DOLBOMEUM_DEMO_PASSWORD`(8자 이상)를 공통 비밀번호로 사용하며, 비밀번호는 저장소에 두지 않습니다. 기존 개발용 DB의 스키마와 기본 계정을 갱신하려면 `app.db init`과 `app.db seed`를 실행합니다.

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

브라우저에서 `http://127.0.0.1:5173`을 열어 로그인 화면을 확인합니다. 같은 출처의 `/api/v1/health`는 Vite를 거쳐 FastAPI에 연결되어 `{"status":"ok"}`를 반환합니다. API 주소를 바꾸면 `frontend/.env`의 `DOLBOMEUM_API_PROXY_TARGET`도 맞춥니다. 프론트 타입 검사와 빌드는 `frontend`에서 `npm run build`로 실행합니다.

화면은 실제 API에 연결되어 동작합니다(`frontend/.env`의 `VITE_USE_MOCK_API=false`). 신청자는 직접 가입한 계정이나 `app.db seed`로 만든 기본 계정으로 로그인할 수 있습니다. 백엔드 없이 화면만 보려면 `true`로 바꾸고 `npm run dev`를 다시 시작합니다. 이때 상단에 ‘목업 모드’가 표시되고 [예시 응답](frontend/src/api/mock.ts)을 사용하며, 목업 전용 비밀번호 `demo-password`로 로그인합니다. 목업은 접수부터 초안까지만 흉내 내므로 회원가입, 확정 이후 단계, 통합 확인·배포는 `false`에서 확인합니다.

폴더 구조, 담당자별 작업 경계, 첫 통합 통과 기준과 팀원 실행 절차는 [DEV-01 작업 기록](docs/development/DEV-01.md)에 있습니다.

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
