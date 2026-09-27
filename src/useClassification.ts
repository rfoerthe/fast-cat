import { useEffect, useRef, useState } from 'react';
import type { Classification } from '../shared/emojis';
export function useClassification(query: string) {
  const [result, setResult] = useState<Classification | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cache = useRef(new Map<string, Classification>());
  const normalized = query.trim();
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setError('');
    if (!normalized) { setResult(null); setPending(false); return; }
    const saved = cache.current.get(normalized);
    if (saved) { setResult(saved); setPending(false); return; }
    setPending(true);
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: normalized }), signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Die Auswertung ist fehlgeschlagen.');
        if (current) {
          cache.current.set(normalized, data);
          if (cache.current.size > 30) cache.current.delete(cache.current.keys().next().value!);
          setResult(data);
        }
      } catch (error) {
        if (current && !controller.signal.aborted) setError(error instanceof Error ? error.message : 'Die Auswertung ist fehlgeschlagen.');
      } finally { if (current) setPending(false); }
    }, 280);
    return () => { current = false; window.clearTimeout(timeout); controller.abort(); };
  }, [normalized, attempt]);
  // Never present an earlier query's scores as the current query's result.
  return { result: result?.query === normalized ? result : null, pending: Boolean(normalized) && (pending || (!error && result?.query !== normalized)), error, retry: () => setAttempt(value => value + 1) };
}
