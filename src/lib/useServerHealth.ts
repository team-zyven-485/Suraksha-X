import { useEffect, useState } from 'react';

export type ServerHealth = 'mongodb' | 'memory' | 'offline' | 'checking';

/** Polls /api/health so the UI can say honestly where data is being saved. */
export function useServerHealth(intervalMs = 20_000): ServerHealth {
  const [state, setState] = useState<ServerHealth>('checking');
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
        const body = await res.json();
        if (!cancelled) setState(body.database === 'mongodb' ? 'mongodb' : 'memory');
      } catch {
        if (!cancelled) setState('offline');
      }
    };
    check();
    const t = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [intervalMs]);
  return state;
}
