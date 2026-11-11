import type { ApiErrorBody } from './types';

/**
 * 목업을 켰을 때만 목업 본체를 불러온다.
 * 조건을 import.meta.env로 직접 써야 빌드 때 값이 고정되어, 꺼져 있으면 목업 코드가 결과물에서 빠진다.
 */
async function send(path: ApiPath, init: RequestInit): Promise<Response> {
  if (import.meta.env.VITE_USE_MOCK_API === 'true') {
    const mock = await import('./mock');
    return mock.mockFetch(path, init);
  }
  return apiFetch(path, init);
}

const API_BASE_PATH = '/api/v1';

type ApiPath = `/${string}`;

/** D-04 오류 응답을 담는다. 연결 실패는 status 0, code NETWORK_ERROR. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** 세션 만료(401) 시 실행할 동작을 등록한다. 로그인 상태 관리에서 한 번 등록한다. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

/** 같은 출처의 /api/v1 경로를 호출한다. 서버 연결 확인(health)은 목업 모드에서도 실제 서버를 본다. */
export function apiFetch(path: ApiPath, options?: RequestInit) {
  return fetch(`${API_BASE_PATH}${path}`, options);
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** 401을 세션 만료로 처리하지 않는다. 로그인 시도와 최초 세션 확인에 쓴다. */
  skipUnauthorizedHandler?: boolean;
}

/**
 * JSON API를 호출하고 성공 본문을 돌려준다. 실패하면 ApiError를 던진다.
 * 본문이 있으면 D-04에 따라 Content-Type: application/json을 붙인다.
 */
export async function apiRequest<T>(path: ApiPath, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers, signal, skipUnauthorizedHandler = false } = options;
  const init: RequestInit = {
    method,
    signal,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };

  let response: Response;
  try {
    response = await send(path, init);
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }

  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  const apiError = await toApiError(response);
  if (apiError.status === 401 && !skipUnauthorizedHandler) {
    unauthorizedHandler?.();
  }
  throw apiError;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as Partial<ApiErrorBody>;
    if (data.error && typeof data.error.code === 'string') {
      return new ApiError(response.status, data.error.code, data.error.message, data.error.field ?? null);
    }
  } catch {
    // 본문이 JSON이 아니면 아래 기본 오류를 사용한다.
  }
  return new ApiError(response.status, 'HTTP_ERROR', '요청을 처리할 수 없습니다.');
}
