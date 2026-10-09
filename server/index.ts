import 'dotenv/config';
import express from 'express';
import { resolve } from 'node:path';
import { ApiError, classify, parseQuery, parseSetId } from './classify.ts';
import { ModelRegistry } from './models.ts';
import type { DecisionModel } from '../shared/models.ts';
/** Lokaler HTTP-Einstiegspunkt: JSON-API und Entwicklungs- bzw. Produktionsoberfläche. */
const app = express();
app.disable('x-powered-by');
// Begrenzt bereits beim Einlesen die Größe des JSON-Request-Bodys.
app.use(express.json({ limit: '4kb' }));
const models = new ModelRegistry();
// Eine fremde Website darf weder die Auswahl verändern noch Klassifizierungen auslösen.
app.use('/api', (req, _res, next) => {
  const origin = req.get('origin');
  if (origin && new URL(origin).host !== req.get('host')) {
    next(new ApiError(403, 'Diese Anfrage stammt nicht von der Anwendung.'));
    return;
  }
  next();
});
app.get('/api/models', async (_req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await models.refresh());
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof ApiError
          ? error.message
          : 'Die Modelleinstellungen konnten nicht gelesen werden.',
    });
  }
});
app.post('/api/models/select', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await models.select(req.body?.modelId));
  } catch (error) {
    res.status(error instanceof ApiError ? error.status : 500).json({
      error:
        error instanceof ApiError
          ? error.message
          : 'Die Modellauswahl konnte nicht gespeichert werden.',
      catalog: models.snapshot(),
    });
  }
});
app.get('/api/health', async (_req, res) => {
  try {
    const catalog = await models.refresh();
    res.json({
      configured: catalog.selectedId !== null,
      model:
        catalog.models.find((model) => model.id === catalog.selectedId)
          ?.model ?? null,
    });
  } catch {
    res.status(500).json({ configured: false, model: null });
  }
});
/** Anzahl zugelassener, noch laufender Klassifizierungen in diesem Serverprozess. */
let active = 0;
/**
 * Validiert lokale Suchanfragen, begrenzt parallele Aufrufe und übersetzt Fehler in JSON.
 * Timeout und vorzeitig geschlossene Verbindungen brechen den zugehörigen fetch-Aufruf ab.
 */
app.post('/api/classify', async (req, res) => {
  // Nur tatsächlich belegte Plätze dürfen im finally-Block wieder freigegeben werden.
  let counted = false;
  let selection: DecisionModel | undefined;
  const controller = new AbortController();
  let timedOut = false;
  const abortOnTimeout = () => {
    timedOut = true;
    controller.abort();
  };
  let timeout = setTimeout(abortOnTimeout, 120_000);
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const query = parseQuery(req.body);
    const setId = parseSetId(req.body);
    if (active >= 3)
      throw new ApiError(
        429,
        'Zu viele gleichzeitige Anfragen. Bitte versuche es gleich erneut.',
      );
    active++;
    counted = true;
    selection = await models.resolve(req.body?.modelId);
    if (selection.provider === 'openrouter') {
      clearTimeout(timeout);
      timeout = setTimeout(abortOnTimeout, 25_000);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(await classify(query, controller.signal, fetch, setId, selection));
  } catch (error) {
    // Nach einem Verbindungsabbruch kann keine Fehlerantwort mehr zugestellt werden.
    if (res.destroyed) return;
    let catalog = models.snapshot();
    if (
      selection &&
      (timedOut ||
        (!controller.signal.aborted &&
          (!(error instanceof ApiError) || error.unavailable)))
    ) {
      const reason = timedOut
        ? 'Das Decision-Modell antwortet nicht innerhalb des Zeitlimits.'
        : error instanceof ApiError
          ? error.message
          : `Die Verbindung zu ${selection.provider === 'ollama' ? 'Ollama' : 'OpenRouter'} ist fehlgeschlagen.`;
      try {
        catalog = await models.unavailable(selection.id, reason);
      } catch (saveError) {
        res.status(500).json({
          error:
            saveError instanceof ApiError
              ? saveError.message
              : 'Die Modellauswahl konnte nicht gespeichert werden.',
        });
        return;
      }
    }
    if (error instanceof ApiError)
      res.status(error.status).json({ error: error.message, catalog });
    else if (controller.signal.aborted)
      res.status(504).json({
        error:
          'Die Auswertung hat zu lange gedauert. Bitte versuche es erneut.',
        catalog,
      });
    else
      res.status(502).json({
        error:
          'Die Verbindung zum Decision-Modell ist fehlgeschlagen. Bitte versuche es erneut.',
        catalog,
      });
  } finally {
    clearTimeout(timeout);
    if (counted) active--;
  }
});
// Unbekannte API-Pfade dürfen nicht im HTML-Fallback der Oberfläche landen.
app.use('/api', (_req, res) =>
  res.status(404).json({ error: 'API-Endpunkt nicht gefunden.' }),
);
// Produktion liefert dist aus; in Entwicklung übernimmt Vite samt Hot Reload die Oberfläche.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}
/** Express erkennt Fehler-Middleware an vier Parametern, auch wenn _next ungenutzt bleibt. */
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const status =
      error &&
      typeof error === 'object' &&
      'status' in error &&
      error.status === 413
        ? 413
        : 400;
    res.status(status).json({
      error:
        status === 413
          ? 'Die Anfrage ist zu groß.'
          : 'Die Anfrage konnte nicht gelesen werden.',
    });
  },
);
// Ausschließlich an die Loopback-Adresse binden; Standardport für die lokale Anwendung: 5173.
const port = Number(process.env.PORT) || 5173;
app.listen(port, '127.0.0.1', () =>
  console.log(`fast cat läuft auf http://localhost:${port}`),
);
