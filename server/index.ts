import 'dotenv/config';
import express from 'express';
import { resolve } from 'node:path';
import { ApiError, classify, parseQuery } from './classify.ts';
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4kb' }));
app.get('/api/health', (_req, res) => res.json({ configured: Boolean(process.env.OPENROUTER_API_KEY), model: process.env.OPENROUTER_MODEL || 'typesafe/jev-1.13' }));
let active = 0;
app.post('/api/classify', async (req, res) => {
  let counted = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    const origin = req.get('origin');
    if (origin && new URL(origin).host !== req.get('host')) throw new ApiError(403, 'Diese Anfrage stammt nicht von der Anwendung.');
    const query = parseQuery(req.body);
    if (active >= 3) throw new ApiError(429, 'Zu viele gleichzeitige Anfragen. Bitte versuche es gleich erneut.');
    active++; counted = true;
    res.setHeader('Cache-Control', 'no-store');
    res.json(await classify(query, controller.signal));
  } catch (error) {
    if (res.destroyed) return;
    if (error instanceof ApiError) res.status(error.status).json({ error: error.message });
    else if (controller.signal.aborted) res.status(504).json({ error: 'Die Auswertung hat zu lange gedauert. Bitte versuche es erneut.' });
    else res.status(502).json({ error: 'Die Verbindung zu Jev ist fehlgeschlagen. Bitte versuche es erneut.' });
  } finally { clearTimeout(timeout); if (counted) active--; }
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'API-Endpunkt nicht gefunden.' }));
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error && typeof error === 'object' && 'status' in error && error.status === 413 ? 413 : 400;
  res.status(status).json({ error: status === 413 ? 'Die Anfrage ist zu groß.' : 'Die Anfrage konnte nicht gelesen werden.' });
});
const port = Number(process.env.PORT) || 5173;
app.listen(port, '127.0.0.1', () => console.log(`fast cat läuft auf http://localhost:${port}`));
