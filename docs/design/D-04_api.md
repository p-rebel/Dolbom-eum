# D-04 화면과 서버의 API 계약

기준 경로는 `/api/v1`이다. 업무 날짜는 `YYYY-MM-DD`, 처리 시각은 UTC ISO 8601, 식별자는 문자열, 사례 버전은 1 이상의 정수다. JSON 키는 camelCase다. 시연 화면과 API는 같은 출처에서 제공한다.

## 세션과 접근 권한

| 메서드와 경로 | 입력 | 성공 응답 |
| --- | --- | --- |
| `POST /session` | `{username, password}` | `200 Account`, 세션 쿠키 설정 |
| `GET /session` | 세션 쿠키 | `200 Account` |
| `DELETE /session` | 세션 쿠키 | `204`, 서버 세션 폐기와 쿠키 제거 |
| `GET /demo-profiles` | 읍면동 세션 | `200 {items: DemoProfile[]}`, 관할 가상 프로필 목록. 시군구 세션은 `403 FORBIDDEN` |

`Account`는 `id, displayName, role, districtCode, townCode`다. `role`은 `TOWN` 또는 `DISTRICT`이며 시군구의 `townCode`는 `null`이다. `DemoProfile`은 `code, beneficiaryName, applicantName, noticeRecipientName, region`이다. `region`은 `{districtCode, townCode, sido, sigungu}`이며 시도·시군구는 공단 검색 기본값으로 쓴다.

세션 쿠키 이름은 `dolbom_session`이다. `HttpOnly`, `SameSite=Strict`, `Path=/api/v1`을 적용한다. 팀 공유 환경에서는 HTTPS와 `Secure`를 사용한다. 서버는 상태를 변경하는 요청의 `Origin`이 설정된 앱 출처와 일치하는지 확인하고, JSON 본문이 있는 요청은 `Content-Type: application/json`을 요구한다. 로그인 성공 시 세션을 새로 발급한다. 시연 세션 유효시간은 발급 후 8시간으로 제안한다. 허용할 앱 출처와 `Secure` 적용 여부는 서버 환경값으로 둔다. 로컬 개발은 `http://127.0.0.1:5173`과 `Secure` 미적용, 팀 시연 서버는 HTTPS 주소와 `Secure` 적용이다. `localhost`와 `127.0.0.1`은 서로 다른 출처다.

## 목록과 서비스 조회

| 메서드와 경로 | 쿼리 | 성공 응답 |
| --- | --- | --- |
| `GET /cases` | 선택 `status, page, pageSize` | `200 Page<CaseSummary>`, 관할 내 목록. 접수일 내림차순, 동률이면 ID 오름차순. |
| `GET /cases/{caseId}` | 없음 | `200 CaseDetail` |
| `GET /catalog/nhis-services` | 선택 `sido, sigungu, categoryLarge, q, page, pageSize` | `200 Page<CatalogItem>`. 필터 규칙은 D-03. |
| `GET /catalog/nhis-services/{serviceId}` | 없음 | `200 CatalogItem`. 조회 가능 행만 제공. |
| `GET /catalog/nhis-filters` | 선택 `sido` | `200 {sidos, sigungus, categoriesLarge}`. 공개 대상 행에서 공란·중복을 제외하고 문자열 오름차순으로 반환. `sidos`와 `categoriesLarge`는 전체 표준값. `sigungus`는 시도 지정 시 표준·별칭에 맞는 시군구 목록, 미지정 시 빈 배열. |

`Page<T>`는 `{items, page, pageSize, total}`이다. `page` 기본값은 1, `pageSize` 기본값은 20이며 허용 범위는 1~50이다. `total`은 필터를 적용한 전체 건수다. 검색어는 양쪽 공백을 제거한 뒤 검사하며 공백만 있으면 조건에서 제외한다. 100자를 초과하면 `422`와 `field: "q"`를 반환한다. 필터에 일치하는 결과가 없거나 마지막 페이지 이후를 조회하면 `200`과 빈 배열을 반환한다.

| 응답 객체 | 키와 값 |
| --- | --- |
| `CaseSummary` | `id, receiptNumber, beneficiaryName, receivedOn, status, version, region` |
| `CaseDetail` | `CaseSummary`의 모든 키와 `profile, noticeMethod, evidenceChecked, screening, assessment, plan, monitoring, events, allowedActions`. `profile`은 접수 때 보존한 `DemoProfile`. 기록 전에는 `screening, assessment, plan, monitoring`이 `null`. |
| `CatalogItem` | `id, datasetVersion, programName, providerName, providerAddress, providerPhone, categoryLarge, categoryMiddle, sido, sigungu, sigunguGu, sourceName, sourceUrl, referenceDate`. 공단 CSV의 비어 있는 표시값은 `null`. |
| `Screening` | `screenedOn, method, outcome` |
| `Assessment` | `assessedOn, resultReceivedOn, outcome` |
| `Plan` | `preparedOn, goal, items, confirmation, notice`. `confirmation`은 `{meetingOn, outcome}`, `notice`는 `{announcedOn}`. 기록 전에는 각각 `null`. |
| `PlanItem` | `id, catalog, linkage, delivery`. `catalog`는 선택 시점의 `CatalogItem`. `linkage`는 `{linkedOn, method, destinationLabel}`, `delivery`는 `{observedOn, status, reason}`. 기록 전에는 각각 `null`. |
| `Monitoring` | `monitoredOn, method, condition, reviewNeeded, reviewReason, observations`. `observations`는 `{itemId, status, reason}[]`이며 저장 당시 계획 항목 순서. |
| `CaseEvent` | `id, action, fromStatus, toStatus, actorDisplayName, actorRole, recordedAt, version, itemId, summary`. `summary`는 표시용 변경 요약이다. 목록은 버전 내림차순. 생성 이벤트의 `fromStatus` 및 서비스 항목과 무관한 이벤트의 `itemId`는 `null`. |
| `AllowedAction` | `{action, itemId}`. `action`은 아래 업무 기록의 동작 코드, `itemId`는 서비스 항목 동작에서만 해당 항목 ID이며 그 밖에는 `null`. |

`CatalogItem.id`는 `nhis_service_id`다. `datasetVersion`은 시연에서 `v1.4`다. 서비스·기관 검색은 공개 공단 자료의 표시값을 반환한다. 신청 목록과 상세는 세션 관할로 제한한다. [D-03 정보와 DB 설계](D-03_data_model.md)

`id`와 `receiptNumber`는 서버가 발급한다. 접수번호는 `DEMO-0001`과 같이 `DEMO-` 뒤에 4자리 이상 숫자를 붙이고, 사례에 한 번 부여한 번호를 유지한다. API와 화면은 응답값을 사용한다.

## 업무 기록

아래 경로는 `/api/v1` 아래에 둔다. 본문 표의 필드는 모두 필수이며 선택 필드에는 ‘선택’을 표시했다. 서비스 항목 경로의 `itemId`는 현재 계획 항목의 ID다. 성공한 접수는 `201 CaseDetail`, 나머지 성공은 `200 CaseDetail`이다. 모든 성공 응답에는 최신 사례 버전이 들어 있다.

| 동작 코드 | 메서드와 경로 | 요청 본문 | 역할 |
| --- | --- | --- | --- |
| `RECEIVE` | `POST /cases` | `profileCode, receivedOn, noticeMethod, evidenceChecked`. `Idempotency-Key` 헤더 필수. | 읍면동 |
| `RECORD_SCREENING` | `PUT /cases/{caseId}/screening` | `version, screenedOn, method, outcome` | 읍면동 |
| `RECORD_ASSESSMENT` | `PUT /cases/{caseId}/assessment` | `version, assessedOn, resultReceivedOn, outcome` | 시군구 |
| `SAVE_DRAFT` | `PUT /cases/{caseId}/plan` | `version, preparedOn, goal, serviceIds`. `serviceIds`는 순서가 있는 공단 행 ID 배열. | 읍면동 |
| `CONFIRM_PLAN` | `PUT /cases/{caseId}/plan/confirmation` | `version, meetingOn, outcome` | 시군구 |
| `RECORD_NOTICE` | `PUT /cases/{caseId}/plan/notice` | `version, announcedOn` | 시군구 |
| `RECORD_LINKAGE` | `PUT /cases/{caseId}/plan/items/{itemId}/linkage` | `version, linkedOn, method`, 선택 `destinationLabel` | 시군구 |
| `RECORD_DELIVERY` | `PUT /cases/{caseId}/plan/items/{itemId}/delivery` | `version, observedOn, status`, 선택 `reason` | 시군구 |
| `RECORD_MONITORING` | `PUT /cases/{caseId}/monitoring` | `version, monitoredOn, method, condition, reviewNeeded`, 선택 `reviewReason, observations` | 읍면동 |

### 화면에서 사용할 동작

서버는 상세 조회와 저장 성공 응답에 현재 계정이 실행할 수 있는 `allowedActions: AllowedAction[]`를 넣는다. 역할·관할·저장된 기록을 [D-05 전환 조건](D-05_workflow.md)과 대조해 계산한다. 입력값과 버전은 저장 요청 시 다시 검사한다. 새 접수는 사례가 생성되기 전 동작이므로 이 배열과 별도로 계정의 역할을 사용한다.

- 사례 동작은 표의 순서, 서비스 항목 동작은 계획 항목 순서로 반환한다. 한 항목에서는 연계 기록이 저장되기 전 `RECORD_LINKAGE`, 연계 기록이 저장된 뒤 `RECORD_DELIVERY`를 반환한다.
- 같은 초안을 읍면동이 열면 `SAVE_DRAFT`, 시군구가 열면 `CONFIRM_PLAN`을 반환한다. 최초 모니터링이 저장된 사례는 양쪽 계정에 빈 배열을 반환한다.
- UI는 이 배열에서 현재 계정의 편집 버튼을 구성한다. 서버는 저장 시 같은 전환 조건을 적용한다. [단계별 결과 기준](expected-results.md)

### 필드 값과 입력 검증

- `noticeMethod`는 `SMS`, `MAIL` 중 하나다. `evidenceChecked`는 `true`여야 한다. 안내방식은 모의 기록으로 보존한다.
- `profileCode`가 없거나 접수 계정의 읍면동 관할이 아닌 프로필이면 `422 VALIDATION_ERROR`와 `field: "profileCode"`를 반환한다.
- 사전조사와 모니터링의 `method`는 `PHONE`, `VISIT`다. 사전조사 `outcome`은 `NHIS_ASSESSMENT_REQUIRED`, 판정 결과는 `SUPPORT_PLAN_REQUIRED`, 회의 결과는 `APPROVED`를 사용한다.
- `goal`은 공백 제거 후 1~200자다. `serviceIds`는 조회 가능한 고유 ID 1~5개다. 계획 항목은 배열 순서로 저장한다.
- 연계 `method`는 `DEPARTMENT_REFERRAL`, `PROVIDER_REFERRAL`, `PERSON_GUIDANCE`다. `destinationLabel`은 부서·공단 의뢰에서 1~80자로 필수다. 다른 두 방식의 요청에서는 생략 또는 `null`이다. 제공기관 의뢰 응답에는 선택 시점 기관명을 사용하고, 대상자 안내 응답의 값은 `null`이다.
- 제공 `status`는 `UNKNOWN`, `IN_USE`, `NOT_STARTED`, `DECLINED`다. `reason`은 최대 200자이며 미개시·이용 거부에서 공백 제거 후 1자 이상 필요하다.
- 모니터링 `condition`은 `UNCHANGED`, `IMPROVED`, `WORSENED`다. `reviewNeeded`는 불리언이며, `true`면 `reviewReason`은 양쪽 공백을 제거한 뒤 1~200자여야 한다. 누락하거나 공백만 입력하면 `422 VALIDATION_ERROR`와 `field: "reviewReason"`을 반환한다. 생략된 선택 문자열은 응답에서 `null`이다.
- 모니터링의 요청 `observations`는 새로 확인한 항목의 `{itemId, status, reason?}[]`다. 생략하거나 빈 배열을 보내면 기존 제공 현황을 사용한다. 같은 사례의 확정 계획 항목만 허용하며 각 항목 ID는 한 번만 보낼 수 있다. `status`와 `reason`에는 제공 현황과 같은 규칙을 적용한다. 응답에는 입력한 관찰을 반영한 **전체** 항목을 계획 순서로 반환한다. 기존 `plan.items[].delivery`는 시군구가 기록한 값으로 보존한다.
- 역할·전환·날짜 순서와 중복 기록 제약은 [D-05 업무와 상태 전이](D-05_workflow.md)를 따른다. 신청 상세에서 읽은 버전이 모든 후속 저장의 입력이다. 같은 계정이 같은 `Idempotency-Key`와 정규화된 접수 본문을 재전송하면 현재 상세를 `200`으로 반환한다. 요청 키는 공백이 없는 1~128자의 문자열이다. 헤더가 없거나 형식이 다르면 `422 VALIDATION_ERROR`와 `field: "Idempotency-Key"`를 반환한다. 본문 비교 기준은 [D-03 무결성과 저장 방식](D-03_data_model.md#무결성과-저장-방식)을 따른다. 저장이 끝난 사례에 같은 요청을 재전송하면 접수 당시가 아닌 현재 버전의 상세를 반환한다.

## 오류와 재시도

오류 본문은 `{"error":{"code":"VERSION_CONFLICT","message":"다른 변경이 저장되었습니다.","field":null}}` 형태다. `field`는 입력 필드명이며 필드와 관련 없는 오류는 `null`이다.

| 상태 | 코드 | 화면과 서버의 처리 |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | 로그인 실패 또는 세션 만료. |
| 403 | `FORBIDDEN` | 앱 출처 검증 또는 관할 내 동작 권한에 실패. |
| 404 | `NOT_FOUND` | 사례·항목이 없거나 관할 밖. 항목 ID가 URL의 사례에 속하는지도 확인. |
| 409 | `VERSION_CONFLICT`, `INVALID_TRANSITION`, `IDEMPOTENCY_CONFLICT` | 오래된 버전, 기록 순서·중복 위반, 또는 접수 키 재사용 충돌. 화면에서 최신 상세를 확인한 뒤 재입력. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | JSON 본문을 받는 요청의 콘텐츠 형식 오류. |
| 422 | `VALIDATION_ERROR` | 필수값, 날짜 순서, 선택값 또는 카탈로그 ID 등 입력 오류. |
| 500 | `INTERNAL_ERROR` | 처리 실패. 저장 내용을 조회해 처리 여부를 확인한 뒤 재시도. |

동작을 거절하면 관련 기록과 사례 버전의 증가를 함께 막는다. 응답만 유실된 경우 접수는 동일 요청 키로 재시도한다. 후속 저장은 상세의 현재 버전과 기록을 확인한 뒤 재시도한다.

사례·항목의 존재와 관할을 확인한 뒤 동작 권한을 검사한다. 권한 검사가 끝난 요청은 본문 구조·타입 → 사례 버전 → 전환 조건 → 이전 기록과 비교하는 업무값 순서로 확인한다. 미개시 사유 누락은 `422`와 제공 기록의 경우 `field: "reason"`, 모니터링의 첫 관찰값이면 `field: "observations.0.reason"`을 반환한다. 배열의 다른 입력 오류도 0부터 시작하는 필드 경로를 사용한다. 업무 날짜 역전은 잘못된 요청 필드명을 반환한다. `403`, `404`, `409`의 `field`는 `null`이다.

요청 순서와 응답 예제는 [C-01·C-06 API 예제](fixtures/C-01_C-06.json)에 있다. 예제의 공단 행은 조회 재현에 쓰며, 제공 여부는 모두 시연용 입력이다. 상세 저장과 오류의 재조회 기준은 [단계별 결과 기준](expected-results.md)에 기록한다.
