import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Cat,
  Check,
  ChevronDown,
  CircleHelp,
  CodeXml,
  Copy,
  LoaderCircle,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  EMOJI_SETS,
  EXAMPLES,
  type EmojiSetId,
  type Classification,
} from '../shared/emojis';
import { useClassification } from './useClassification';
import EmojiField from './EmojiField';
import ModelPicker from './ModelPicker';
import { useModels } from './useModels';
import ModelRequestsDialog from './ModelRequestsDialog';
/**
 * Verbindet Suche, Klassifizierung, Emoji-Feld und Ergebnisinspektor.
 * Die Treffer-Schwelle filtert vorhandene Bewertungen lokal und löst keine API-Anfrage aus.
 */
export default function App() {
  // Such- und Auswahlzustand steuern Feld, Rangliste und Detailanzeige gemeinsam.
  const [query, setQuery] = useState('');
  const [setId, setSetId] = useState<EmojiSetId>('things');
  const { emojis, label: setLabel } = EMOJI_SETS[setId];
  const examples =
    setId === 'things'
      ? EXAMPLES.map((query, i) => ({
          query,
          symbol: ['🍕', '🥑', '🍩', '🎸'][i],
          label: [
            'Essen',
            'Gesund essen',
            'Ungesund essen',
            'Eine Band gründen',
          ][i],
        }))
      : [
          { query: 'Freude und gute Laune', symbol: '😄', label: 'Gute Laune' },
          { query: 'Liebe und Zuneigung', symbol: '🥰', label: 'Liebe' },
          { query: 'Trauer und Enttäuschung', symbol: '😢', label: 'Traurig' },
          { query: 'Zustimmung ausdrücken', symbol: '👍', label: 'Zustimmung' },
        ];
  const [threshold, setThreshold] = useState(60);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Kurzlebige UI-Rückmeldungen für Hilfe und Zwischenablage.
  const [help, setHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [inspectedResult, setInspectedResult] = useState<Classification | null>(
    null,
  );
  const models = useModels();
  const modelId = models.selected?.id ?? null;
  const modelName =
    models.selected?.provider === 'openrouter' &&
    models.selected.model === 'typesafe/jev-1.13'
      ? 'Jev'
      : (models.selected?.model ?? 'Das Modell');
  const input = useRef<HTMLInputElement>(null);
  const requestsButton = useRef<HTMLButtonElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const { result, pending, error, retry } = useClassification(
    query,
    setId,
    modelId,
    models.acceptCatalog,
  );
  // Die Kopierbestätigung nach 1,8 Sekunden zurücksetzen.
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timeout);
  }, [copied]);
  // Den React-Zustand mit der imperativen API des nativen modalen Dialogs synchronisieren.
  useEffect(() => {
    if (help) helpDialog.current?.showModal();
    else helpDialog.current?.close();
  }, [help]);
  // Eine Kopie sortieren, damit die gemeinsame Katalogreihenfolge unverändert bleibt.
  const ranked = result
    ? [...emojis].sort((a, b) => result.scores[b.id] - result.scores[a.id])
    : [];
  // Der Regler verwendet Prozent, die API dagegen Wahrscheinlichkeiten zwischen 0 und 1.
  const matches = result
    ? ranked.filter((emoji) => result.scores[emoji.id] >= threshold / 100)
    : [];
  const selected = emojis.find((emoji) => emoji.id === selectedId);
  /** Übernimmt Texteingaben oder Beispiele, löscht alte UI-Rückmeldungen und fokussiert die Suche. */
  const choose = (value: string) => {
    setQuery(value);
    setSelectedId(null);
    setCopied(false);
    setCopyError('');
    input.current?.focus();
  };
  /** Kopiert alle aktuellen Treffer in Rangfolge und meldet auch verweigerte Clipboard-Zugriffe. */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        matches.map((emoji) => emoji.symbol).join(' '),
      );
      setCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Kopieren ist in diesem Browser nicht verfügbar.');
    }
  };
  return (
    <div className="app-shell">
      <header className="header">
        <a href="/" className="brand" aria-label="fast cat Startseite">
          <span className="brand-icon">
            <Cat size={22} />
          </span>
          <span>
            fast cat<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="header-divider" />
        <span className="header-label">EMOJI PLAYGROUND</span>
        <div className="header-right">
          <ModelPicker
            catalog={models.catalog}
            saving={models.saving}
            onSelect={models.select}
          />
          <button
            type="button"
            className="icon-button help-button"
            aria-label="So funktioniert’s"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={19} />
          </button>
        </div>
      </header>
      <main className="playground">
        <EmojiField
          key={setId}
          emojis={emojis}
          scores={result?.scores ?? null}
          threshold={threshold}
          onSelect={setSelectedId}
        />
        <div className="search-zone">
          <div className="eyebrow">
            <Zap size={13} fill="currentColor" /> KLEINE ENTSCHEIDUNGEN. SOFORT.
          </div>
          <h1>
            Ein Gedanke. <span>Viele Treffer.</span>
          </h1>
          <p className="intro">
            Beschreibe, was du suchst. {modelName} findet die passenden Emojis.
          </p>
          <div className="set-picker">
            <label htmlFor="emoji-set">Emoji-Set</label>
            <div className="set-slider">
              <span className={setId === 'things' ? 'active' : ''}>
                Dinge &amp; Natur
              </span>
              <input
                id="emoji-set"
                type="range"
                min="0"
                max="1"
                step="1"
                value={setId === 'things' ? 0 : 1}
                aria-valuetext={setLabel}
                onChange={(event) => {
                  setSetId(event.target.value === '0' ? 'things' : 'people');
                  setSelectedId(null);
                  setCopied(false);
                  setCopyError('');
                }}
                style={
                  {
                    '--range-fill': setId === 'things' ? '0%' : '100%',
                  } as React.CSSProperties
                }
              />
              <span className={setId === 'people' ? 'active' : ''}>
                Smileys &amp; Gesten
              </span>
            </div>
          </div>
          <div className={`search-box ${pending ? 'is-loading' : ''}`}>
            <Search size={20} aria-hidden="true" />
            <input
              ref={input}
              aria-label="Emojis nach Beschreibung finden"
              placeholder="Was passt zu deiner Idee?"
              value={query}
              maxLength={300}
              autoComplete="off"
              onChange={(e) => choose(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') choose('');
                if (e.key === 'Enter' && error) retry();
              }}
            />
            {pending ? (
              <LoaderCircle
                size={19}
                className="spinner"
                aria-label="Wird ausgewertet"
              />
            ) : query ? (
              <button
                type="button"
                className="clear-button"
                aria-label="Suche zurücksetzen"
                onClick={() => choose('')}
              >
                <X size={17} />
              </button>
            ) : (
              <span className="input-hint">Aa</span>
            )}
          </div>
          <div className="examples">
            <span>Zum Beispiel</span>
            {examples.map((example) => (
              <button
                type="button"
                key={example.query}
                className={query === example.query ? 'active' : ''}
                onClick={() => choose(example.query)}
              >
                {example.symbol}{' '}
                <span className="example-label">{example.label}</span>
              </button>
            ))}
          </div>
          <div className="search-feedback" role="status" aria-live="polite">
            {models.error || (models.catalog && !modelId) ? (
              <div className="error-message">
                {models.error ||
                  'Kein Decision-Modell verfügbar. Prüfe die Hinweise in der Modellauswahl.'}
              </div>
            ) : error ? (
              <div className="error-message">
                {error}
                <button type="button" onClick={retry}>
                  <RotateCcw size={13} /> Erneut versuchen
                </button>
              </div>
            ) : pending ? (
              <span>
                {modelName} bewertet {emojis.length} Emojis …
              </span>
            ) : result ? (
              <span className="result-summary">
                <i />
                {matches.length} passende Emojis{' '}
                <span className="middot">·</span>{' '}
                {result.elapsedMs.toLocaleString('de-DE')} ms{' '}
                <button
                  type="button"
                  onClick={copy}
                  disabled={!matches.length}
                  aria-label="Passende Emojis kopieren"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}{' '}
                  {copied ? 'Kopiert' : 'Kopieren'}
                </button>
                <button
                  type="button"
                  onClick={() => setInspectedResult(result)}
                  ref={requestsButton}
                  aria-haspopup="dialog"
                >
                  <CodeXml size={13} /> Modellabfragen
                </button>
              </span>
            ) : (
              <span>{emojis.length} Emojis warten auf deine Idee.</span>
            )}
          </div>
          {copyError ? (
            <p className="copy-error" role="alert">
              {copyError}
            </p>
          ) : null}
        </div>
        <aside
          className="inspector"
          aria-label="Wahrscheinlichkeiten und Einstellungen"
        >
          <div className="inspector-heading">
            <span>
              <SlidersHorizontal size={15} /> Live-Einblicke
            </span>
            <span className="live-pill">
              <i /> {models.selected?.provider === 'ollama' ? 'LOKAL' : 'JEV'}
            </span>
          </div>
          <div className="threshold-label">
            <label htmlFor="threshold">Treffer-Schwelle</label>
            <output htmlFor="threshold">
              {threshold}
              <span> %</span>
            </output>
          </div>
          <input
            id="threshold"
            type="range"
            min="1"
            max="100"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ '--range-fill': `${threshold}%` } as React.CSSProperties}
          />
          <div className="range-labels">
            <span>Mehr entdecken</span>
            <span>Genauer passen</span>
          </div>
          <div className="inspector-rule" />
          <div className="ranking-heading">
            <span>WAHRSCHEINLICHKEIT</span>
            <span>{result ? 'TOP 10' : 'BEREIT'}</span>
          </div>
          {result ? (
            <ol className="ranking">
              {ranked.slice(0, 10).map((emoji) => (
                <li key={emoji.id}>
                  <button
                    type="button"
                    className="rank-row"
                    onClick={() => setSelectedId(emoji.id)}
                    aria-label={`${emoji.label}: ${Math.round(result.scores[emoji.id] * 100)} Prozent`}
                  >
                    <span className="rank-emoji" aria-hidden="true">
                      {emoji.symbol}
                    </span>
                    <span className="rank-track">
                      <span
                        className={
                          result.scores[emoji.id] >= threshold / 100
                            ? 'above'
                            : ''
                        }
                        style={{ width: `${result.scores[emoji.id] * 100}%` }}
                      />
                    </span>
                    <span className="rank-score">
                      {Math.round(result.scores[emoji.id] * 100)}
                      <small> %</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <div className="ranking-empty">
              <div className="empty-bars">
                {[54, 83, 66, 42, 72].map((n) => (
                  <span key={n} style={{ width: `${n}%` }} />
                ))}
              </div>
              <p>
                {pending
                  ? 'Entscheidungen kommen gleich.'
                  : 'Ein paar Worte genügen.'}
                <br />
                <span>
                  {pending
                    ? 'Alle Emojis werden parallel bewertet.'
                    : 'Hier siehst du, wie sicher das Modell ist.'}
                </span>
              </p>
            </div>
          )}
          <div className="inspector-footer">
            <Zap size={12} />
            <span>
              {result
                ? `${matches.length} von ${emojis.length} passen`
                : `${emojis.length} unabhängige Entscheidungen`}
            </span>
          </div>
        </aside>
        {selected ? (
          <div className="emoji-detail" role="status">
            <span className="detail-symbol">{selected.symbol}</span>
            <div>
              <strong>{selected.label}</strong>
              <span>
                {result
                  ? `${(result.scores[selected.id] * 100).toFixed(1).replace('.', ',')} % Übereinstimmung`
                  : 'Gib eine Idee ein, um dieses Emoji zu bewerten.'}
              </span>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSelectedId(null)}
              aria-label="Emoji-Details schließen"
            >
              <X size={15} />
            </button>
          </div>
        ) : null}
        {!query ? (
          <div className="field-hint">
            <Sparkles size={15} />
            <span>Was zusammenpasst, steigt nach oben.</span>
          </div>
        ) : null}
      </main>
      <footer className="footer">
        <span>
          <span className="footer-dot" />
          {emojis.length} Emojis <span className="footer-separator">/</span>{' '}
          unendlich viele Ideen
        </span>
        <div>
          <span className="cost">
            {result?.costUsd != null
              ? `${result.costUsd.toLocaleString('de-DE', { maximumFractionDigits: 6 })} $ pro Auswertung`
              : 'Powered by'}{' '}
            <strong>{result?.costUsd != null ? '' : modelName}</strong>
          </span>
          <a
            href={
              models.selected?.provider === 'ollama'
                ? 'https://docs.ollama.com/capabilities/decision'
                : 'https://openrouter.ai/typesafe/jev-1.13'
            }
            target="_blank"
            rel="noreferrer"
          >
            {models.selected?.provider === 'ollama'
              ? 'Ollama lokal'
              : 'Jev via OpenRouter'}{' '}
            <ArrowUpRight size={13} />
          </a>
        </div>
      </footer>
      {inspectedResult ? (
        <ModelRequestsDialog
          result={inspectedResult}
          returnFocus={requestsButton}
          onClose={() => setInspectedResult(null)}
        />
      ) : null}
      <dialog
        ref={helpDialog}
        className="help-dialog"
        onCancel={() => setHelp(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setHelp(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setHelp(false);
        }}
      >
        <button
          type="button"
          className="icon-button dialog-close"
          aria-label="Erklärung schließen"
          onClick={() => setHelp(false)}
        >
          <X size={20} />
        </button>
        <span className="help-emoji">🐈</span>
        <h2>Einfach mal denken lassen.</h2>
        <p>
          Schreibe eine Kategorie oder eine Idee in das Suchfeld. Das gewählte
          Decision-Modell entscheidet für jedes der 180 Emojis im aktiven Set,
          wie gut es dazu passt. Mit dem Schieberegler „Emoji-Set“ wechselst du
          zwischen Dinge &amp; Natur und Smileys &amp; Gesten.
        </p>
        <p>
          Ab der eingestellten Schwelle steigen Emojis nach oben. Die anderen
          fallen zurück auf den Boden. Ändere deinen Text und schau zu, wie sich
          die Auswahl verändert.
        </p>
        <p>
          Mit der Treffer-Schwelle kannst du die vorhandenen Ergebnisse sofort
          neu filtern. Klicke auf ein Emoji, um seine genaue Wahrscheinlichkeit
          zu sehen.
        </p>
        <div className="help-note">
          Deine Eingabe wird nach einer kurzen Tipp-Pause über den lokalen
          Server an das ausgewählte Modell gesendet: lokal an Ollama oder online
          an OpenRouter. Die Modellauswahl oben wird gespeichert; bei einem
          Ausfall wird das nächste verfügbare Modell gewählt. Die Zahlen sind
          Modellbewertungen, keine Garantie für einen richtigen Treffer.
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => setHelp(false)}
        >
          Los geht’s <ChevronDown size={15} />
        </button>
      </dialog>
    </div>
  );
}
