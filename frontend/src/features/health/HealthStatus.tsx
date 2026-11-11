import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';

export function HealthStatus() {
  const [status, setStatus] = useState('API 연결 확인 중');

  useEffect(() => {
    const controller = new AbortController();

    async function checkConnection() {
      try {
        const response = await apiFetch('/health', {
          signal: controller.signal,
        });
        const result = response.ok ? await response.json() : null;
        setStatus(result?.status === 'ok' ? 'API 연결됨' : 'API 연결 실패');
      } catch {
        if (!controller.signal.aborted) {
          setStatus('API 연결 실패');
        }
      }
    }

    void checkConnection();
    return () => controller.abort();
  }, []);

  return <p role="status">{status}</p>;
}
