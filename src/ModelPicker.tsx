import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LoaderCircle } from 'lucide-react';
import type { ModelCatalog } from '../shared/models';

/** Eigene Menüeinträge erlauben Tooltips auch für nicht auswählbare Modelle. */
export default function ModelPicker({
  catalog,
  saving,
  onSelect,
}: {
  catalog: ModelCatalog | null;
  saving: boolean;
  onSelect: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const selected = catalog?.models.find(
    (model) => model.id === catalog.selectedId,
  );

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    const initial =
      menu.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      menu.current?.querySelector<HTMLElement>('button');
    initial?.focus();
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div className="model-picker" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="model-trigger"
        aria-label="Decision-Modell auswählen"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="decision-model-menu"
        disabled={!catalog || saving}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {saving ? (
          <LoaderCircle size={14} className="spinner" />
        ) : (
          <i className={selected ? 'model-dot' : 'model-dot offline'} />
        )}
        <span className="model-trigger-text">
          {selected?.label ??
            (catalog ? 'Kein Modell verfügbar' : 'Modelle werden gesucht …')}
        </span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div
          id="decision-model-menu"
          ref={menu}
          className="model-menu"
          role="menu"
          aria-label="Decision-Modelle"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
            const options = Array.from(
              menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
            );
            const index = options.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? options.length - 1
                    : (index +
                        (event.key === 'ArrowDown' ? 1 : -1) +
                        options.length) %
                      options.length;
              options[next]?.focus();
            }
          }}
        >
          <div className="model-menu-heading">DECISION-MODELL</div>
          {catalog?.models.map((model, index) => (
            <div key={model.id} className="model-option-wrap">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={model.id === catalog.selectedId}
                aria-disabled={!model.available}
                aria-describedby={
                  model.reason ? `model-reason-${index}` : undefined
                }
                className={`model-option ${model.available ? '' : 'unavailable'}`}
                onClick={() => {
                  if (!model.available) return;
                  close();
                  void onSelect(model.id);
                }}
              >
                <span>
                  <strong className="model-option-name">
                    {model.provider === 'openrouter' &&
                    model.model === 'typesafe/jev-1.13'
                      ? 'Jev'
                      : model.model}
                  </strong>
                  <small className="model-option-provider">
                    {model.provider === 'ollama'
                      ? 'Ollama · lokal'
                      : 'OpenRouter · online'}
                  </small>
                </span>
                {model.id === catalog.selectedId ? (
                  <Check size={15} />
                ) : !model.available ? (
                  <span className="unavailable-label">Offline</span>
                ) : null}
              </button>
              {model.reason ? (
                <span
                  className="model-tooltip"
                  role="tooltip"
                  id={`model-reason-${index}`}
                >
                  {model.reason}
                </span>
              ) : null}
            </div>
          ))}
          {catalog?.discoveryError ? (
            <p className="model-discovery-error">{catalog.discoveryError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
