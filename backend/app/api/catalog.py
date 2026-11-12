"""D-04 공단 서비스·기관 조회 (작업 8). 필터 규칙은 D-03 공단 자료 적재와 검색 3번."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from ..auth import Account, CamelModel, current_account
from ..db import get_connection
from ..db.nhis import DATASET_VERSION
from ..errors import ApiError

router = APIRouter()

Q_MAX_LENGTH = 100
_VISIBLE = "dataset_version = ? AND is_duplicate_extra = 'N'"
_SIDO_MATCH = "? IN (sido, sido_current, sido_legacy)"


class CatalogItem(CamelModel):
    id: str
    dataset_version: str
    program_name: str | None
    provider_name: str | None
    provider_address: str | None
    provider_phone: str | None
    category_large: str | None
    category_middle: str | None
    sido: str | None
    sigungu: str | None
    sigungu_gu: str | None
    source_name: str | None
    source_url: str | None
    reference_date: str | None


class CatalogPage(CamelModel):
    items: list[CatalogItem]
    page: int
    page_size: int
    total: int


class CatalogFilters(CamelModel):
    sidos: list[str]
    sigungus: list[str]
    categories_large: list[str]


def catalog_item(row: sqlite3.Row) -> CatalogItem:
    return CatalogItem(
        id=row["nhis_service_id"], dataset_version=row["dataset_version"],
        program_name=row["program_name"], provider_name=row["provider_name"],
        provider_address=row["provider_address"], provider_phone=row["provider_phone"],
        category_large=row["category_large"], category_middle=row["category_middle"],
        sido=row["sido"], sigungu=row["sigungu"], sigungu_gu=row["sigungu_gu"],
        source_name=row["source_name"], source_url=row["source_url"], reference_date=row["reference_date"],
    )


def find_catalog_item(conn: sqlite3.Connection, service_id: str) -> CatalogItem | None:
    """조회 가능한(중복 추가 행이 아닌) 공단 행. 계획 초안 저장(12번)에서도 같은 기준으로 쓴다."""
    row = conn.execute(
        f"SELECT * FROM nhis_catalog WHERE {_VISIBLE} AND nhis_service_id = ?", (DATASET_VERSION, service_id)
    ).fetchone()
    return catalog_item(row) if row else None


def _blank_to_none(value: str | None) -> str | None:
    value = value.strip() if value is not None else None
    return value or None


@router.get("/catalog/nhis-services", response_model=CatalogPage)
def search_catalog(
    sido: str | None = None,
    sigungu: str | None = None,
    category_large: str | None = Query(None, alias="categoryLarge"),
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50, alias="pageSize"),
    _: Account = Depends(current_account),
    conn: sqlite3.Connection = Depends(get_connection),
) -> CatalogPage:
    q = _blank_to_none(q)
    if q is not None and len(q) > Q_MAX_LENGTH:
        raise ApiError(422, "VALIDATION_ERROR", f"검색어는 {Q_MAX_LENGTH}자 이하로 입력해 주세요.", "q")
    where, params = [_VISIBLE], [DATASET_VERSION]
    if sido := _blank_to_none(sido):
        where.append(_SIDO_MATCH)
        params.append(sido)
    if sigungu := _blank_to_none(sigungu):
        where.append("sigungu = ?")
        params.append(sigungu)
    if category_large := _blank_to_none(category_large):
        where.append("category_large = ?")
        params.append(category_large)
    if q is not None:
        # instr는 %·_를 문자 그대로 찾는다 (LIKE 이스케이프 불필요)
        where.append("(instr(program_name, ?) > 0 OR instr(provider_name, ?) > 0)")
        params += [q, q]
    clause = " AND ".join(where)
    total = conn.execute(f"SELECT count(*) FROM nhis_catalog WHERE {clause}", params).fetchone()[0]
    offset = (page - 1) * page_size
    # 마지막 페이지 이후는 빈 배열. 큰 page가 SQLite 정수 범위를 넘지 않도록 조회하지 않는다
    rows = [] if offset >= total else conn.execute(
        f"SELECT * FROM nhis_catalog WHERE {clause} ORDER BY nhis_service_id LIMIT ? OFFSET ?",
        [*params, page_size, offset],
    ).fetchall()
    return CatalogPage(items=[catalog_item(r) for r in rows], page=page, page_size=page_size, total=total)


@router.get("/catalog/nhis-services/{service_id}", response_model=CatalogItem)
def read_catalog_item(
    service_id: str,
    _: Account = Depends(current_account),
    conn: sqlite3.Connection = Depends(get_connection),
) -> CatalogItem:
    item = find_catalog_item(conn, service_id)
    if item is None:
        raise ApiError(404, "NOT_FOUND", "공단 서비스를 찾을 수 없습니다.")
    return item


@router.get("/catalog/nhis-filters", response_model=CatalogFilters)
def catalog_filters(
    sido: str | None = None,
    _: Account = Depends(current_account),
    conn: sqlite3.Connection = Depends(get_connection),
) -> CatalogFilters:
    def distinct(column: str, extra: str = "", args: tuple = ()) -> list[str]:
        rows = conn.execute(
            f"SELECT DISTINCT {column} FROM nhis_catalog WHERE {_VISIBLE} AND coalesce({column}, '') <> '' "
            f"{extra} ORDER BY {column}",
            (DATASET_VERSION, *args),
        ).fetchall()
        return [r[0] for r in rows]

    sido = _blank_to_none(sido)
    return CatalogFilters(
        sidos=distinct("sido"),
        sigungus=distinct("sigungu", f"AND {_SIDO_MATCH}", (sido,)) if sido else [],
        categories_large=distinct("category_large"),
    )
