import { useEffect, useRef, useState } from 'react';
import type { Classification, EmojiSetId } from '../shared/emojis';
/**
 * Klassifiziert einen Suchtext nach 280 ms Tipp-Pause und hält bis zu 30 Ergebnisse im Speicher.
 * Ein Text- oder Set-Wechsel verwirft veraltete Rückmeldungen und bricht laufende Requests lokal ab.
 * @param query Unverarbeiteter Text aus dem Suchfeld; äußere Leerzeichen werden entfernt.
 * @returns Zum aktuellen Text passendes Ergebnis, Lade-/Fehlerstatus und eine Retry-Funktion.
 */
export function useClassification(query: string, setId: EmojiSetId) {
  const [result, setResult] = useState<Classification | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  // Ein Zähler löst den Effekt bei erneutem Versuch auch ohne Änderung des Suchtexts aus.
  const [attempt, setAttempt] = useState(0);
  // Der Cache gehört dieser Hook-Instanz; Treffer verändern die Einfügereihenfolge nicht.
  const cache = useRef(new Map<string, Classification>());
  const normalized = query.trim();
  const cacheKey = JSON.stringify([setId, normalized]);
  const error = failure?.key === cacheKey ? failure.message : '';
  const currentResult =
    result?.query === normalized && result.setId === setId ? result : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt löst einen erneuten Request für denselben Suchtext aus.
  useEffect(() => {
    // Zusätzlich zum AbortSignal schützt dieses Flag vor spät eintreffenden Rückmeldungen.
    let current = true;
    const controller = new AbortController();
    setFailure(null);
    if (!normalized) {
      setResult(null);
      setPending(false);
      return;
    }
    const saved = cache.current.get(cacheKey);
    if (saved) {
      setResult(saved);
      setPending(false);
      return;
    }
    setPending(true);
    // Erst nach der Tipp-Pause senden; das Cleanup entfernt auch noch nicht gestartete Aufrufe.
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: normalized, setId }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || 'Die Auswertung ist fehlgeschlagen.');
        if (current) {
          cache.current.set(cacheKey, data);
          // FIFO-Verdrängung: Bei mehr als 30 Text-/Set-Kombinationen entfällt der zuerst gespeicherte Eintrag.
          if (cache.current.size > 30) {
            const oldest = cache.current.keys().next();
            if (!oldest.done) cache.current.delete(oldest.value);
          }
          setResult(data);
        }
      } catch (error) {
        if (current && !controller.signal.aborted)
          setFailure({
            key: cacheKey,
            message:
              error instanceof Error
                ? error.message
                : 'Die Auswertung ist fehlgeschlagen.',
          });
      } finally {
        if (current) setPending(false);
      }
    }, 280);
    return () => {
      current = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [normalized, setId, cacheKey, attempt]);
  // Ergebnisse anderer Texte oder Sets ausblenden, auch im Render vor dem nächsten Effektlauf.
  // retry durchläuft denselben Cache-Pfad; vorhandene Treffer werden dadurch nicht neu geladen.
  return {
    result: currentResult,
    pending: Boolean(normalized) && (pending || (!error && !currentResult)),
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
