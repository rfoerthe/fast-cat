import { useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronRight, X } from 'lucide-react';
import type { Classification } from '../shared/emojis';

/** Tokenisiert formatiertes JSON, ohne Anbietertexte als HTML auszuführen. */
function JsonCode({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2) ?? 'null';
  const tokens =
    /"(?:\\.|[^"\\])*"\s*(?=:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
  const parts = [];
  let offset = 0;
  for (const match of json.matchAll(tokens)) {
    const token = match[0];
    const kind = token.startsWith('"')
      ? json[match.index + token.length] === ':'
        ? 'key'
        : 'string'
      : token === 'null'
        ? 'null'
        : token === 'true' || token === 'false'
          ? 'boolean'
          : 'number';
    parts.push(json.slice(offset, match.index));
    parts.push(
      <span key={match.index} className={`json-${kind}`}>
        {token}
      </span>,
    );
    offset = match.index + token.length;
  }
  parts.push(json.slice(offset));
  return (
    <pre className="json-code">
      <code>{parts}</code>
    </pre>
  );
}

/** Große JSON-Bodies erst beim Aufklappen formatieren und rendern. */
function JsonDetails({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="json-details"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <ChevronRight
          size={15}
          className="request-chevron"
          aria-hidden="true"
        />
        {label}
      </summary>
      {open ? <JsonCode value={value} /> : null}
    </details>
  );
}

export default function ModelRequestsDialog({
  result,
  onClose,
  returnFocus,
}: {
  result: Classification;
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      returnFocus.current?.focus();
    };
  }, [returnFocus]);
  return (
    <dialog
      ref={ref}
      className="requests-dialog"
      aria-labelledby="requests-title"
      aria-describedby="requests-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <header className="requests-heading">
        <div>
          <h2 id="requests-title">Modellabfragen</h2>
          <p id="requests-description">
            {result.requests.length} Requests · {result.model}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Modellabfragen schließen"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <p className="requests-query">{result.query}</p>
      <div className="requests-list">
        {result.requests.map((request, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Das Protokoll ist ein unveränderlicher Snapshot in Request-Reihenfolge.
          <details className="model-request" key={index}>
            <summary>
              <ChevronRight
                size={16}
                className="request-chevron"
                aria-hidden="true"
              />
              <strong>Request {index + 1}</strong>
              <span
                className={
                  request.status >= 400
                    ? 'request-status is-error'
                    : 'request-status'
                }
              >
                HTTP {request.status}
              </span>
              <span className="request-duration">
                {request.elapsedMs.toLocaleString('de-DE')} ms
              </span>
            </summary>
            <div className="request-content">
              <p className="request-url">POST {request.url}</p>
              <JsonDetails label="Request JSON" value={request.request} />
              <JsonDetails label="Response JSON" value={request.response} />
            </div>
          </details>
        ))}
      </div>
    </dialog>
  );
}
