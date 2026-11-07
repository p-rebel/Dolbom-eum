# 돌봄e음 데이터

전국 공통 지역사회 통합돌봄 플랫폼 **돌봄e음**을 위한 데이터 수집·정제 결과입니다.

다음 기능의 기반 데이터로 씁니다.
- 통합돌봄 서비스 정보 제공
- 지역별 서비스 메뉴판 조회
- 서비스 제공기관 정보 제공
- 지역별 서비스 탐색

## 데이터 출처
| 데이터 | 출처 | 기준일·수집 | 이용조건 |
|---|---|---|---|
| **NHIS** 통합돌봄 서비스 자원 | 국민건강보험공단, [공공데이터포털 15173720](https://www.data.go.kr/data/15173720/fileData.do) (2026-10-19 게시) | 기준일 2026-06-30(파일명 기준). 포털에서 CSV 내려받음 | 이용허락범위 제한 없음(포털 표시). 출처 표시를 권장 |
| **PDF** 지자체 통합돌봄 서비스 메뉴판 | 보건복지부 누리집 '지방정부 서비스 메뉴판' 게시판(지방정부 작성) PDF 234개 | 2026-11-06 수집. 자료 기준월 2026-03~09(약 30%는 기준월 표기 없음) | 게시글에 공공누리 표시 없음. 원본 PDF는 이 저장소에 넣지 않고 출처 목록만 제공 |

## 데이터 처리 과정
원본 데이터 수집 → PDF 정보 추출 → 데이터 정제 → 지역명 표준화 → 품질 검증 → 최종 CSV 생성 → 샘플 JSON 생성

NHIS와 PDF 데이터는 **각각 따로 관리하며 서로 병합하지 않았습니다.** 두 데이터의 서비스가 같은지는 검증하지 않았습니다.

## 데이터 규모 (최종 정제 버전 v1.4)
| 파일 | 행 | 한 행의 의미 |
|---|---:|---|
| `data/processed/nhis_services.csv` | 90,081 | 기관 × 프로그램 |
| `data/processed/local_services.csv` | 12,725 | 지자체 × 사업 |

- PDF 행은 원래 12,721행입니다. 장흥군 메뉴판에서 한 칸으로 잘못 합쳐 추출된 사업명 1건을 원본 표 구조대로 5개 사업으로 나눠 12,725행이 됐습니다.
- 모든 행에 고유 ID가 있고, 중복 ID는 없습니다. 모든 행은 원본 행으로 되짚을 수 있습니다.

## 폴더 구조
```
github_upload_ready/
├── README.md
├── .gitignore
└── data/
    ├── README.md                       데이터 폴더 안내
    ├── raw/
    │   ├── nhis/                       NHIS 원본 CSV(CP949)
    │   └── local_menus/source_list.csv PDF 234개의 출처 목록(게시글·첨부 URL, 수집일, SHA-256)
    ├── interim/pdf_extracted/
    │   ├── nationwide_combined.csv     PDF 추출 중간 결과 중 통과 판정 PDF 175개분(9,945행)
    │   └── serial_map.csv              일부 지자체의 원본 연번
    ├── processed/
    │   ├── nhis_services.csv           최종 정제 NHIS (v1.4)
    │   └── local_services.csv          최종 정제 지자체 서비스 (v1.4)
    └── samples/
        ├── nhis_services_sample.json
        ├── local_services_sample.json
        └── regions_sample.json
```

- 보류 데이터(`held/`)는 저장소에 포함하지 않습니다.
- PDF 추출 전체 결과는 `processed/local_services.csv`를 쓰면 됩니다.

## 주요 데이터 필드
**`nhis_services.csv`**
| 구분 | 필드 |
|---|---|
| ID·출처 | `nhis_service_id`, `source_row_number`, `source_name`, `source_url`, `reference_date` |
| 지역 | `sido_raw`, `sigungu_raw`(원본) · `sido`, `sigungu`, `sigungu_gu`(표준) · `sido_current`, `sido_legacy`(조회용 별칭) · `region_std_status` |
| 기관 | `provider_name`, `provider_phone`, `provider_address` (점검 결과: `phone_format`, `address_sido_check`) |
| 서비스 | `category_large`, `category_middle`, `program_name` |
| 중복 | `duplicate_group_id`, `is_duplicate_extra`. 원본 완전 중복 행 중 추가 행은 Y, 화면에는 N만 사용 |

**`local_services.csv`**
| 구분 | 필드 |
|---|---|
| ID·추적 | `local_service_id`, `parent_description_id`(분리 행의 원본 ID), `source_pdf_file`, `source_page`, `source_title`, `source_post_url`, `reference_date`, `collected_at` |
| 지역 | `sido_raw`, `sigungu_raw`, `sigungu_in_pdf`(PDF 표기) · `sido`, `sigungu`, `sido_current`, `sido_legacy` · `service_area_level` · `region_std_status`, `region_current_status` |
| 사업 | `category_large`, `category_middle`, `service_name`(원본), `service_name_display`(표시용), `service_description`, `target_group`, `provider_name`, `program_type` |
| 품질 | `review_severity`, `review_status`, `review_status_reason`, `duplicate_type`, `extraction_flags` 등 |

## 샘플 JSON (`data/samples/`)
| 파일 | 건수 | 용도 |
|---|---:|---|
| `nhis_services_sample.json` | 15 | NHIS 서비스 응답 구조 예시. 대분류 6종, 전남광주·일반구·세종·결측 사례 포함 |
| `local_services_sample.json` | 16 | 지역별 서비스 응답 구조 예시. 장흥 분리 행, 인천 지역 미확정, 제주 도 전체, 결측 사례 포함 |
| `regions_sample.json` | 17 | 두 데이터셋의 지역 표기·표준값·검증 상태 예시 |

- 각 파일의 `meta`에 버전, 원본 CSV, 선택 기준, CSV 칼럼 ↔ JSON 필드 매핑이 있습니다.
- 값은 CSV 원문 그대로이고, 빈 값은 `null`입니다. '준비 중' 같은 문구는 화면에서 처리합니다.
- 샘플은 **API 구조 참고용 예시**이며 전체 데이터가 아닙니다.

## 데이터 품질 및 주의사항
**품질**
- 모든 행을 원본 행으로 되짚을 수 있고, 고유 ID 중복이 없습니다.

**검토가 끝나지 않은 부분** (전체 데이터가 완전히 검증된 것은 아닙니다)
- 일부 PDF 행은 검토가 끝나지 않았습니다. `review_status`가 다음 값인 행은 사람이 원본과 대조하지 않았습니다.
  - `REQUIRES_REVIEW`: 27행. 같은 PDF 안 동일 행 반복 등
  - `NOT_REVIEWED`
- 인천 개편 전 메뉴판(옛 서구·중구·동구) 271행은 현재 어느 구에 해당하는지 확정하지 않았습니다(`region_current_status = UNDETERMINED`). 원본 PDF 표기는 `sigungu_in_pdf`에 있습니다.

**처리 원칙**
- '전남광주통합특별시'는 2026-07-01 시행 특별법에 따른 명칭으로 보고 처리했습니다. 언론 보도로 확인했고, 법령 원문은 확인하지 못했습니다.
- 비슷한 사업명은 자동으로 합치지 않았습니다.
- 같은 시군구에 PDF가 두 개인 곳 5쌍(강릉·경산·부산 동구·서천·해남)은 두 파일 모두 들어 있어 이중 집계될 수 있습니다.

**이용 시 주의**
- NHIS와 PDF 서비스 사이의 동일성은 검증되지 않았습니다.
- 실제 이용 조건과 제공 여부는 각 지자체·기관의 공식 안내로 다시 확인해야 합니다.

## 데이터 이용 및 출처 표시
- **NHIS 원본·정제 데이터:** 출처 '국민건강보험공단, 통합돌봄 서비스 자원(공공데이터포털)'. 이용허락범위 제한 없음
- **PDF 추출 데이터(`interim/`, `processed/local_services.csv`)**
  - 각 지방정부 메뉴판의 문구를 담고 있습니다. 원 저작물의 이용조건(공공누리)은 확인되지 않았습니다.
  - 공개 범위는 팀에서 확인해야 합니다.
  - 출처는 행마다 `source_pdf_file`·`source_post_url`로 표시합니다.
- **프로젝트 작성물(README, 샘플 구조 등) 라이선스:** 아직 정하지 않았습니다. 원본 자료의 이용조건과는 별개입니다.
