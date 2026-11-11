import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  const [status, setStatus] = useState('API 연결 확인 중');

  useEffect(() => {
    const controller = new AbortController();

    async function checkConnection() {
      try {
        const response = await fetch('/api/v1/health', {
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

  return (
    <main>
      <h1>돌봄e음</h1>
      <p role="status">{status}</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
