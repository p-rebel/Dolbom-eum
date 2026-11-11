import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { ApiError } from '../api/client';

interface ApiDataState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
}

/**
 * 조회 API를 불러오고 로딩·오류 상태를 관리한다.
 * deps가 바뀌면 이전 요청을 취소하고 다시 불러온다. reload()로 같은 조건을 다시 불러온다.
 */
export function useApiData<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<ApiDataState<T>>({ data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, error: null, loading: true }));
    fetcher(controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const apiError =
          error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN', '정보를 불러오지 못했습니다.');
        setState((previous) => ({ ...previous, error: apiError, loading: false }));
      });
    return () => controller.abort();
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const setData = useCallback((data: T) => setState({ data, error: null, loading: false }), []);

  return { ...state, reload, setData };
}
