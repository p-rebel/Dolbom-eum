-- 돌봄e음 1차 시연 SQLite 스키마 (D-03 정보와 DB 설계)
-- 날짜 컬럼은 업무일자 YYYY-MM-DD, *_at 컬럼은 UTC ISO 8601 문자열이다.
-- JSON 컬럼은 SQLite JSON 함수로 형식을 검사한다.
-- 입력 길이·공백 제거·날짜 순서·상태 전환은 API에서 검사하고, 여기서는 저장값이 깨지지 않도록 최소 제약만 둔다.
-- SQLite CHECK는 결과가 NULL이면 통과하므로, 필수 사유 검사는 coalesce로 NULL을 0으로 바꾼다.

-- 가상 계정과 세션 -------------------------------------------------------

CREATE TABLE IF NOT EXISTS demo_accounts (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('TOWN', 'DISTRICT', 'APPLICANT')),
    district_code   TEXT,
    town_code       TEXT,
    CHECK (
        (role = 'TOWN' AND district_code IS NOT NULL AND town_code IS NOT NULL)
        OR (role = 'DISTRICT' AND district_code IS NOT NULL AND town_code IS NULL)
        OR (role = 'APPLICANT' AND district_code IS NULL AND town_code IS NULL)
    )
) STRICT;

CREATE TABLE IF NOT EXISTS demo_sessions (
    token_hash      TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL REFERENCES demo_accounts (id) ON DELETE CASCADE,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    CHECK (expires_at > created_at)
) STRICT;

CREATE INDEX IF NOT EXISTS ix_demo_sessions_account ON demo_sessions (account_id);

CREATE TABLE IF NOT EXISTS demo_profiles (
    code                    TEXT PRIMARY KEY,
    beneficiary_name        TEXT NOT NULL,
    applicant_name          TEXT NOT NULL,
    notice_recipient_name   TEXT NOT NULL,
    district_code           TEXT NOT NULL,
    town_code               TEXT NOT NULL,
    sido                    TEXT NOT NULL,
    sigungu                 TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_demo_profiles_town ON demo_profiles (town_code);

-- 신청자가 제출한 모의 신청과 확정된 서류. 담당자 사례의 접수와 별도로 관리한다.
CREATE TABLE IF NOT EXISTS mock_applications (
    id                  TEXT PRIMARY KEY,
    submission_number   TEXT NOT NULL UNIQUE,
    owner_id            TEXT NOT NULL REFERENCES demo_accounts (id),
    district_code       TEXT NOT NULL,
    town_code           TEXT NOT NULL,
    submitted_at        TEXT NOT NULL,
    idempotency_key     TEXT NOT NULL,
    request_hash        TEXT NOT NULL,
    form_snapshot       TEXT NOT NULL CHECK (json_valid(form_snapshot)),
    application_pdf     BLOB NOT NULL,
    consent_pdf         BLOB NOT NULL,
    UNIQUE (owner_id, idempotency_key)
) STRICT;

CREATE INDEX IF NOT EXISTS ix_mock_applications_owner ON mock_applications (owner_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS ix_mock_applications_district ON mock_applications (district_code, town_code, submitted_at DESC);

-- 공단 카탈로그 (v1.4 정제 CSV의 열을 그대로 보존) ---------------------------

CREATE TABLE IF NOT EXISTS nhis_catalog (
    dataset_version     TEXT NOT NULL,
    nhis_service_id     TEXT NOT NULL,
    source_row_number   INTEGER NOT NULL,
    source_name         TEXT NOT NULL,
    source_url          TEXT NOT NULL,
    reference_date      TEXT NOT NULL CHECK (date(reference_date) IS reference_date),
    sido_raw            TEXT,
    sigungu_raw         TEXT,
    sido                TEXT,
    sigungu             TEXT,
    sigungu_gu          TEXT,
    sido_current        TEXT,
    sido_legacy         TEXT,
    region_std_status   TEXT,
    region_std_note     TEXT,
    region_std_basis    TEXT,
    provider_name       TEXT,
    provider_phone      TEXT,
    phone_format        TEXT,
    provider_address    TEXT,
    address_sido_check  TEXT,
    category_large      TEXT,
    category_middle     TEXT,
    program_name        TEXT,
    duplicate_group_id  TEXT,
    is_duplicate_extra  TEXT NOT NULL CHECK (is_duplicate_extra IN ('Y', 'N')),
    PRIMARY KEY (dataset_version, nhis_service_id)
) STRICT;

CREATE INDEX IF NOT EXISTS ix_nhis_catalog_sigungu
    ON nhis_catalog (dataset_version, is_duplicate_extra, sigungu, category_large);
CREATE INDEX IF NOT EXISTS ix_nhis_catalog_sido
    ON nhis_catalog (dataset_version, is_duplicate_extra, sido);

-- 신청 건 ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cases (
    id                  TEXT PRIMARY KEY,
    receipt_seq         INTEGER NOT NULL UNIQUE CHECK (receipt_seq >= 1),
    receipt_number      TEXT NOT NULL UNIQUE,
    profile_code        TEXT NOT NULL REFERENCES demo_profiles (code),
    -- 접수 시점의 DemoProfile 전체 (D-04 CaseDetail.profile)
    profile_snapshot    TEXT NOT NULL CHECK (json_valid(profile_snapshot)),
    district_code       TEXT NOT NULL,
    town_code           TEXT NOT NULL,
    created_by          TEXT NOT NULL REFERENCES demo_accounts (id),
    idempotency_key     TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
    -- 접수 4개 필드의 정규화 JSON SHA-256 (D-03 무결성과 저장 방식)
    request_hash        TEXT NOT NULL,
    received_on         TEXT NOT NULL CHECK (date(received_on) IS received_on),
    notice_method       TEXT NOT NULL CHECK (notice_method IN ('SMS', 'MAIL')),
    evidence_checked    INTEGER NOT NULL CHECK (evidence_checked = 1),
    status              TEXT NOT NULL CHECK (status IN (
                            'RECEIVED', 'SCREENED', 'ASSESSED', 'PLAN_DRAFTED',
                            'PLAN_CONFIRMED', 'SERVICE_TRACKING', 'FIRST_MONITORING_RECORDED'
                        )),
    version             INTEGER NOT NULL CHECK (version >= 1),
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    UNIQUE (created_by, idempotency_key)
) STRICT;

-- 목록: 관할 조건 + 접수일 내림차순, 동률이면 ID 오름차순 (D-04)
CREATE INDEX IF NOT EXISTS ix_cases_town_list ON cases (town_code, received_on DESC, id);
CREATE INDEX IF NOT EXISTS ix_cases_district_list ON cases (district_code, received_on DESC, id);

-- 단계별 기록 (사례당 한 번) ----------------------------------------------

CREATE TABLE IF NOT EXISTS screenings (
    case_id         TEXT PRIMARY KEY REFERENCES cases (id),
    screened_on     TEXT NOT NULL CHECK (date(screened_on) IS screened_on),
    method          TEXT NOT NULL CHECK (method IN ('PHONE', 'VISIT')),
    outcome         TEXT NOT NULL CHECK (outcome IN ('NHIS_ASSESSMENT_REQUIRED'))
) STRICT;

CREATE TABLE IF NOT EXISTS assessments (
    case_id             TEXT PRIMARY KEY REFERENCES cases (id),
    assessed_on         TEXT NOT NULL CHECK (date(assessed_on) IS assessed_on),
    result_received_on  TEXT NOT NULL CHECK (date(result_received_on) IS result_received_on),
    outcome             TEXT NOT NULL CHECK (outcome IN ('SUPPORT_PLAN_REQUIRED'))
) STRICT;

CREATE TABLE IF NOT EXISTS plans (
    case_id             TEXT PRIMARY KEY REFERENCES cases (id),
    prepared_on         TEXT NOT NULL CHECK (date(prepared_on) IS prepared_on),
    goal                TEXT NOT NULL CHECK (length(goal) BETWEEN 1 AND 200),
    -- 회의 승인과 확정 (CONFIRM_PLAN)
    meeting_on          TEXT CHECK (meeting_on IS NULL OR date(meeting_on) IS meeting_on),
    meeting_outcome     TEXT CHECK (meeting_outcome IS NULL OR meeting_outcome IN ('APPROVED')),
    confirmed_by        TEXT REFERENCES demo_accounts (id),
    -- 계획 안내 (RECORD_NOTICE). 확정 후에만 기록
    announced_on        TEXT CHECK (announced_on IS NULL OR date(announced_on) IS announced_on),
    CHECK (
        (meeting_on IS NULL AND meeting_outcome IS NULL AND confirmed_by IS NULL)
        OR (meeting_on IS NOT NULL AND meeting_outcome IS NOT NULL AND confirmed_by IS NOT NULL)
    ),
    CHECK (announced_on IS NULL OR meeting_on IS NOT NULL)
) STRICT;

CREATE TABLE IF NOT EXISTS plan_items (
    id                  TEXT PRIMARY KEY,
    case_id             TEXT NOT NULL REFERENCES plans (case_id),
    position            INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
    dataset_version     TEXT NOT NULL,
    nhis_service_id     TEXT NOT NULL,
    -- 선택 시점의 CatalogItem 전체 (D-04)
    catalog_snapshot    TEXT NOT NULL CHECK (json_valid(catalog_snapshot)),
    FOREIGN KEY (dataset_version, nhis_service_id)
        REFERENCES nhis_catalog (dataset_version, nhis_service_id),
    UNIQUE (case_id, position),
    UNIQUE (case_id, dataset_version, nhis_service_id)
) STRICT;

CREATE TABLE IF NOT EXISTS service_linkages (
    plan_item_id        TEXT PRIMARY KEY REFERENCES plan_items (id),
    linked_on           TEXT NOT NULL CHECK (date(linked_on) IS linked_on),
    method              TEXT NOT NULL CHECK (method IN (
                            'DEPARTMENT_REFERRAL', 'PROVIDER_REFERRAL', 'PERSON_GUIDANCE'
                        )),
    -- 부서·공단 의뢰에서만 입력. 제공기관 의뢰는 계획 항목의 기관명을 응답에 사용
    destination_label   TEXT,
    CHECK (
        (method = 'DEPARTMENT_REFERRAL' AND coalesce(length(trim(destination_label)), 0) >= 1
            AND length(destination_label) <= 80)
        OR (method <> 'DEPARTMENT_REFERRAL' AND destination_label IS NULL)
    )
) STRICT;

CREATE TABLE IF NOT EXISTS service_deliveries (
    plan_item_id    TEXT PRIMARY KEY REFERENCES service_linkages (plan_item_id),
    observed_on     TEXT NOT NULL CHECK (date(observed_on) IS observed_on),
    status          TEXT NOT NULL CHECK (status IN ('UNKNOWN', 'IN_USE', 'NOT_STARTED', 'DECLINED')),
    reason          TEXT CHECK (reason IS NULL OR length(reason) <= 200),
    CHECK (status NOT IN ('NOT_STARTED', 'DECLINED') OR coalesce(length(trim(reason)), 0) >= 1)
) STRICT;

CREATE TABLE IF NOT EXISTS monitorings (
    case_id         TEXT PRIMARY KEY REFERENCES cases (id),
    monitored_on    TEXT NOT NULL CHECK (date(monitored_on) IS monitored_on),
    method          TEXT NOT NULL CHECK (method IN ('PHONE', 'VISIT')),
    condition       TEXT NOT NULL CHECK (condition IN ('UNCHANGED', 'IMPROVED', 'WORSENED')),
    review_needed   INTEGER NOT NULL CHECK (review_needed IN (0, 1)),
    review_reason   TEXT CHECK (review_reason IS NULL OR length(review_reason) <= 200),
    -- 기존 제공 현황에 새 관찰을 반영한 전체 결과, 계획 항목 순서 [{itemId, status, reason}]
    observations    TEXT NOT NULL CHECK (json_valid(observations) AND json_type(observations) = 'array'),
    CHECK (review_needed = 0 OR coalesce(length(trim(review_reason)), 0) >= 1)
) STRICT;

-- 처리 이력 --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS case_events (
    id                  TEXT PRIMARY KEY,
    case_id             TEXT NOT NULL REFERENCES cases (id),
    action              TEXT NOT NULL CHECK (action IN (
                            'RECEIVE', 'RECORD_SCREENING', 'RECORD_ASSESSMENT', 'SAVE_DRAFT',
                            'CONFIRM_PLAN', 'RECORD_NOTICE', 'RECORD_LINKAGE', 'RECORD_DELIVERY',
                            'RECORD_MONITORING'
                        )),
    from_status         TEXT,
    to_status           TEXT NOT NULL,
    actor_account_id    TEXT NOT NULL REFERENCES demo_accounts (id),
    actor_display_name  TEXT NOT NULL,
    actor_role          TEXT NOT NULL CHECK (actor_role IN ('TOWN', 'DISTRICT')),
    recorded_at         TEXT NOT NULL,
    version             INTEGER NOT NULL CHECK (version >= 1),
    summary             TEXT NOT NULL,
    -- 변경 전후 값 {before, after}. API 응답에는 포함하지 않는다
    details             TEXT CHECK (details IS NULL OR json_valid(details)),
    plan_item_id        TEXT REFERENCES plan_items (id),
    UNIQUE (case_id, version),
    CHECK ((action = 'RECEIVE') = (from_status IS NULL)),
    CHECK ((action IN ('RECORD_LINKAGE', 'RECORD_DELIVERY')) = (plan_item_id IS NOT NULL))
) STRICT;
