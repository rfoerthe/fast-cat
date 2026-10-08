import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelCatalog } from '../shared/models';

export function useModels() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const revision = useRef(0);

  const acceptCatalog = useCallback((value: ModelCatalog) => {
    revision.current++;
    setCatalog(value);
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (busy.current) return;
    const version = ++revision.current;
    try {
      const response = await fetch('/api/models', { signal });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || 'Die Modelle konnten nicht geladen werden.',
        );
      if (version === revision.current) {
        setCatalog(data);
        setError('');
      }
    } catch (error) {
      if (!signal?.aborted && version === revision.current)
        setError(
          error instanceof Error
            ? error.message
            : 'Die Modelle konnten nicht geladen werden.',
        );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const check = () => {
      void refresh(controller.signal);
    };
    check();
    const interval = window.setInterval(check, 15_000);
    window.addEventListener('focus', check);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', check);
    };
  }, [refresh]);

  const select = async (modelId: string) => {
    if (busy.current) return;
    busy.current = true;
    revision.current++;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/models/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.catalog) acceptCatalog(data.catalog);
        throw new Error(
          data.error || 'Die Auswahl konnte nicht gespeichert werden.',
        );
      }
      acceptCatalog(data);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Die Auswahl konnte nicht gespeichert werden.',
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const selected =
    catalog?.models.find((model) => model.id === catalog.selectedId) ?? null;
  return { catalog, selected, error, saving, select, acceptCatalog, refresh };
}
