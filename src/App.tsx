import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Cat, Check, ChevronDown, CircleHelp, Copy, LoaderCircle, RotateCcw, Search, SlidersHorizontal, Sparkles, X, Zap } from 'lucide-react';
import { EMOJIS, EXAMPLES } from '../shared/emojis';
import { useClassification } from './useClassification';
import EmojiField from './EmojiField';
/**
 * Verbindet Suche, Klassifizierung, Emoji-Feld und Ergebnisinspektor.
 * Die Treffer-Schwelle filtert vorhandene Bewertungen lokal und löst keine API-Anfrage aus.
 */
export default function App() {
  // Such- und Auswahlzustand steuern Feld, Rangliste und Detailanzeige gemeinsam.
  const [query, setQuery] = useState('');
  const [threshold, setThreshold] = useState(60);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Kurzlebige UI-Rückmeldungen für Hilfe und Zwischenablage.
  const [help, setHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  // null kennzeichnet die noch unbekannte Serverkonfiguration vor der Health-Antwort.
  const [configured, setConfigured] = useState<boolean | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const { result, pending, error, retry } = useClassification(query);
  // Den Konfigurationsstatus einmal laden und den Aufruf beim Unmount abbrechen.
  useEffect(() => { const controller = new AbortController(); fetch('/api/health', { signal: controller.signal }).then(r => r.json()).then(data => setConfigured(data.configured)).catch(() => {}); return () => controller.abort(); }, []);
  // Die Kopierbestätigung nach 1,8 Sekunden zurücksetzen.
  useEffect(() => { if (!copied) return; const timeout = window.setTimeout(() => setCopied(false), 1800); return () => clearTimeout(timeout); }, [copied]);
  // Den React-Zustand mit der imperativen API des nativen modalen Dialogs synchronisieren.
  useEffect(() => { if (help) helpDialog.current?.showModal(); else helpDialog.current?.close(); }, [help]);
  // Eine Kopie sortieren, damit die gemeinsame Katalogreihenfolge unverändert bleibt.
  const ranked = result ? [...EMOJIS].sort((a, b) => result.scores[b.id] - result.scores[a.id]) : [];
  // Der Regler verwendet Prozent, die API dagegen Wahrscheinlichkeiten zwischen 0 und 1.
  const matches = ranked.filter(emoji => result!.scores[emoji.id] >= threshold / 100);
  const selected = EMOJIS.find(emoji => emoji.id === selectedId);
  /** Übernimmt Texteingaben oder Beispiele, löscht alte UI-Rückmeldungen und fokussiert die Suche. */
  const choose = (value: string) => { setQuery(value); setSelectedId(null); setCopied(false); setCopyError(''); input.current?.focus(); };
  /** Kopiert alle aktuellen Treffer in Rangfolge und meldet auch verweigerte Clipboard-Zugriffe. */
  const copy = async () => { try { await navigator.clipboard.writeText(matches.map(emoji => emoji.symbol).join(' ')); setCopied(true); setCopyError(''); } catch { setCopyError('Kopieren ist in diesem Browser nicht verfügbar.'); } };
  return <div className="app-shell">
    <header className="header"><a href="/" className="brand" aria-label="fast cat Startseite"><span className="brand-icon"><Cat size={22}/></span><span>fast cat<span className="brand-dot">.</span></span></a><span className="header-divider"/><span className="header-label">EMOJI PLAYGROUND</span><div className="header-right"><span className={`connection ${configured === false ? 'offline' : ''}`}><i/>{configured === null ? 'Verbinde …' : configured ? (result ? 'Jev verbunden' : 'Jev bereit') : 'API-Key fehlt'}</span><button className="icon-button help-button" aria-label="So funktioniert’s" onClick={() => setHelp(true)}><CircleHelp size={19}/></button></div></header>
    <main className="playground">
      <EmojiField scores={result?.scores ?? null} threshold={threshold} onSelect={setSelectedId}/>
      <div className="search-zone">
        <div className="eyebrow"><Zap size={13} fill="currentColor"/> KLEINE ENTSCHEIDUNGEN. SOFORT.</div>
        <h1>Ein Gedanke. <span>Viele Treffer.</span></h1>
        <p className="intro">Beschreibe, was du suchst. Jev findet die passenden Emojis.</p>
        <div className={`search-box ${pending ? 'is-loading' : ''}`}><Search size={20} aria-hidden="true"/><input ref={input} aria-label="Emojis nach Beschreibung finden" placeholder="Was passt zu deiner Idee?" value={query} maxLength={300} autoComplete="off" onChange={e => choose(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') choose(''); if (e.key === 'Enter' && error) retry(); }}/>{pending ? <LoaderCircle size={19} className="spinner" aria-label="Wird ausgewertet"/> : query ? <button className="clear-button" aria-label="Suche zurücksetzen" onClick={() => choose('')}><X size={17}/></button> : <span className="input-hint">Aa</span>}</div>
        <div className="examples"><span>Zum Beispiel</span>{EXAMPLES.map((text, i) => <button key={text} className={query === text ? 'active' : ''} onClick={() => choose(text)}>{['🍕','🥑','🍩','🎸'][i]} <span>{['Essen','Gesund essen','Ungesund essen','Eine Band gründen'][i]}</span></button>)}</div>
        <div className="search-feedback" role="status" aria-live="polite">{error ? <div className="error-message">{error}<button onClick={retry}><RotateCcw size={13}/> Erneut versuchen</button></div> : pending ? <span>Jev bewertet 180 Emojis …</span> : result ? <span className="result-summary"><i/>{matches.length} passende Emojis <span className="middot">·</span> {result.elapsedMs.toLocaleString('de-DE')} ms <button onClick={copy} disabled={!matches.length} aria-label="Passende Emojis kopieren">{copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? 'Kopiert' : 'Kopieren'}</button></span> : <span>180 Emojis warten auf deine Idee.</span>}</div>
        {copyError ? <p className="copy-error" role="alert">{copyError}</p> : null}
      </div>
      <aside className="inspector" aria-label="Wahrscheinlichkeiten und Einstellungen">
        <div className="inspector-heading"><span><SlidersHorizontal size={15}/> Live-Einblicke</span><span className="live-pill"><i/> JEV</span></div>
        <div className="threshold-label"><label htmlFor="threshold">Treffer-Schwelle</label><output htmlFor="threshold">{threshold}<span> %</span></output></div>
        <input id="threshold" type="range" min="1" max="100" value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{'--range-fill':`${threshold}%`} as React.CSSProperties}/>
        <div className="range-labels"><span>Mehr entdecken</span><span>Genauer passen</span></div>
        <div className="inspector-rule"/>
        <div className="ranking-heading"><span>WAHRSCHEINLICHKEIT</span><span>{result ? 'TOP 10' : 'BEREIT'}</span></div>
        {result ? <ol className="ranking">{ranked.slice(0,10).map(emoji => <li key={emoji.id}><button className="rank-row" onClick={() => setSelectedId(emoji.id)} aria-label={`${emoji.label}: ${Math.round(result.scores[emoji.id] * 100)} Prozent`}><span className="rank-emoji" aria-hidden="true">{emoji.symbol}</span><span className="rank-track"><span className={result.scores[emoji.id] >= threshold / 100 ? 'above' : ''} style={{width:`${result.scores[emoji.id] * 100}%`}}/></span><span className="rank-score">{Math.round(result.scores[emoji.id] * 100)}<small> %</small></span></button></li>)}</ol> : <div className="ranking-empty"><div className="empty-bars">{[54,83,66,42,72].map((n,i) => <span key={i} style={{width:`${n}%`}}/>)}</div><p>{pending ? 'Entscheidungen kommen gleich.' : 'Ein paar Worte genügen.'}<br/><span>{pending ? 'Alle Emojis werden parallel bewertet.' : 'Hier siehst du, wie sicher Jev ist.'}</span></p></div>}
        <div className="inspector-footer"><Zap size={12}/><span>{result ? `${matches.length} von 180 passen` : '180 unabhängige Entscheidungen'}</span></div>
      </aside>
      {selected ? <div className="emoji-detail" role="status"><span className="detail-symbol">{selected.symbol}</span><div><strong>{selected.label}</strong><span>{result ? `${(result.scores[selected.id] * 100).toFixed(1).replace('.', ',')} % Übereinstimmung` : 'Gib eine Idee ein, um dieses Emoji zu bewerten.'}</span></div><button className="icon-button" onClick={() => setSelectedId(null)} aria-label="Emoji-Details schließen"><X size={15}/></button></div> : null}
      {!query ? <div className="field-hint"><Sparkles size={15}/><span>Was zusammenpasst, steigt nach oben.</span></div> : null}
    </main>
    <footer className="footer"><span><span className="footer-dot"/>{EMOJIS.length} Emojis <span className="footer-separator">/</span> unendlich viele Ideen</span><div><span className="cost">{result?.costUsd != null ? `${result.costUsd.toLocaleString('de-DE',{maximumFractionDigits:6})} $ pro Auswertung` : 'Powered by'} <strong>{result?.costUsd != null ? '' : 'Jev'}</strong></span><a href="https://openrouter.ai/typesafe/jev-1.13" target="_blank" rel="noreferrer">Jev via OpenRouter <ArrowUpRight size={13}/></a></div></footer>
    <dialog ref={helpDialog} className="help-dialog" onCancel={() => setHelp(false)} onClick={e => { if (e.target === e.currentTarget) setHelp(false); }}><button className="icon-button dialog-close" aria-label="Erklärung schließen" onClick={() => setHelp(false)}><X size={20}/></button><span className="help-emoji">🐈</span><h2>Einfach mal denken lassen.</h2><p>Schreibe eine Kategorie oder eine Idee in das Suchfeld. Jev entscheidet für jedes der 180 Emojis, wie gut es dazu passt.</p><p>Ab der eingestellten Schwelle steigen Emojis nach oben. Die anderen fallen zurück auf den Boden. Ändere deinen Text und schau zu, wie sich die Auswahl verändert.</p><p>Mit dem Regler kannst du die vorhandenen Ergebnisse sofort neu filtern. Klicke auf ein Emoji, um seine genaue Wahrscheinlichkeit zu sehen.</p><div className="help-note">Deine Eingabe wird nach einer kurzen Tipp-Pause über den lokalen Server an OpenRouter gesendet. Die Zahlen sind Modellbewertungen, keine Garantie für einen richtigen Treffer.</div><button className="primary-button" onClick={() => setHelp(false)}>Los geht’s <ChevronDown size={15}/></button></dialog>
  </div>;
}
