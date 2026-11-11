import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, apiRequest, setUnauthorizedHandler } from '../api/client';
import type { Account } from '../api/types';
import { navigate } from '../router';

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous'; notice: string | null }
  | { status: 'authenticated'; account: Account }
  | { status: 'error'; message: string };

interface AuthContextValue {
  state: AuthState;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // 첫 화면에서 기존 세션 쿠키가 유효한지 확인한다.
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    apiRequest<Account>('/session', { signal: controller.signal, skipUnauthorizedHandler: true })
      .then((account) => setState({ status: 'authenticated', account }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          setState({ status: 'anonymous', notice: null });
        } else {
          setState({
            status: 'error',
            message: error instanceof ApiError ? error.message : '세션을 확인하지 못했습니다.',
          });
        }
      });
    return () => controller.abort();
  }, [attempt]);

  // D-02: 업무 화면에서 세션이 만료(401)되면 로그인 화면으로 이동한다.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setState({ status: 'anonymous', notice: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
      // 세션이 끝나 입력을 저장할 수 없으므로 확인 없이 이동한다.
      navigate('/login', { replace: true, force: true });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const account = await apiRequest<Account>('/session', {
      method: 'POST',
      body: { username, password },
      skipUnauthorizedHandler: true,
    });
    setState({ status: 'authenticated', account });
    navigate('/cases', { replace: true });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest<void>('/session', { method: 'DELETE', skipUnauthorizedHandler: true });
    } finally {
      // 서버 응답과 관계없이 화면에서는 로그아웃 상태로 전환한다.
      setState({ status: 'anonymous', notice: null });
      navigate('/login', { replace: true, force: true });
    }
  }, []);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const value = useMemo(() => ({ state, login, logout, retry }), [state, login, logout, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.');
  }
  return value;
}

/** 로그인한 계정. 로그인 후 화면에서만 사용한다. */
export function useAccount(): Account {
  const { state } = useAuth();
  if (state.status !== 'authenticated') {
    throw new Error('로그인한 계정이 없습니다.');
  }
  return state.account;
}

export const ROLE_LABEL: Record<Account['role'], string> = {
  TOWN: '읍면동 담당자',
  DISTRICT: '시군구 담당자',
};
