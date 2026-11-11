// D-04 공단 서비스·기관 조회 API.

import { apiRequest } from './client';
import type { CatalogFilters, CatalogItem, Page } from './types';

export interface CatalogQuery {
  sido: string;
  sigungu: string;
  categoryLarge: string;
  q: string;
  page: number;
}

/** D-04:28 기본값 */
export const CATALOG_PAGE_SIZE = 20;

export function searchCatalog(query: CatalogQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (query.sido) params.set('sido', query.sido);
  if (query.sigungu) params.set('sigungu', query.sigungu);
  if (query.categoryLarge) params.set('categoryLarge', query.categoryLarge);
  if (query.q.trim()) params.set('q', query.q.trim());
  params.set('page', String(query.page));
  params.set('pageSize', String(CATALOG_PAGE_SIZE));
  return apiRequest<Page<CatalogItem>>(`/catalog/nhis-services?${params.toString()}`, { signal });
}

export function getCatalogFilters(sido: string, signal?: AbortSignal) {
  const params = sido ? `?sido=${encodeURIComponent(sido)}` : '';
  return apiRequest<CatalogFilters>(`/catalog/nhis-filters${params}`, { signal });
}
