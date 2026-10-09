import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ApiError } from './classify.ts';
import {
  type DecisionModel,
  type ModelCatalog,
  nextAvailableModel,
} from '../shared/models.ts';

export const ollamaBaseUrl = () =>
  (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
export const openRouterModel = () =>
  process.env.OPENROUTER_MODEL || 'typesafe/jev-1.13';

function localModel(model: string): DecisionModel {
  return {
    id: `ollama:${model}`,
    model,
    provider: 'ollama',
    label: `${model} · Ollama lokal`,
    available: false,
    reason: 'Verfügbarkeit noch nicht geprüft.',
  };
}

async function checkedJson(
  fetcher: typeof fetch,
  url: string,
  init?: RequestInit,
) {
  const response = await fetcher(url, {
    ...init,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function connectionReason(provider: string, error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('HTTP '))
    return `${provider} ist nicht verfügbar (${message}).`;
  if (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  )
    return `${provider} antwortet nicht innerhalb von 5 Sekunden.`;
  if (error instanceof SyntaxError)
    return `${provider} liefert keine gültige JSON-Antwort.`;
  return `${provider} ist nicht erreichbar. Bitte Dienst und Netzwerkverbindung prüfen.`;
}

/** Serverseitiger Katalog mit begrenzten, kostenfreien Statusprüfungen und atomarer Dateipersistenz. */
export class ModelRegistry {
  private catalog: ModelCatalog = {
    models: [],
    selectedId: null,
    discoveryError: null,
  };
  private loaded = false;
  private lastRefresh = 0;
  private refreshing: Promise<ModelCatalog> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private persisted = '';
  private lastSelectedId: string | null = null;
  private failures = new Map<string, { reason: string; until: number }>();

  constructor(
    private readonly file = resolve(
      process.env.MODEL_SETTINGS_FILE || '.fast-cat/models.json',
    ),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const work = this.queue.then(operation);
    this.queue = work.catch(() => {});
    return work;
  }

  private async load() {
    if (this.loaded) return;
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new SyntaxError('invalid settings');
      if (typeof data.selectedId === 'string')
        this.catalog.selectedId = data.selectedId;
      this.lastSelectedId = this.catalog.selectedId;
      if (Array.isArray(data.ollamaModels)) {
        this.catalog.models = [
          ...new Set<string>(
            data.ollamaModels.filter(
              (name: unknown) => typeof name === 'string' && name.length > 0,
            ),
          ),
        ].map(localModel);
      }
    } catch (error) {
      if (
        !(error instanceof SyntaxError) &&
        (error as NodeJS.ErrnoException).code !== 'ENOENT'
      )
        throw error;
    }
    this.loaded = true;
  }

  private async save() {
    const content = `${JSON.stringify(
      {
        selectedId: this.catalog.selectedId ?? this.lastSelectedId,
        ollamaModels: this.catalog.models
          .filter((model) => model.provider === 'ollama')
          .map((model) => model.model),
      },
      null,
      2,
    )}\n`;
    if (content === this.persisted) return;
    try {
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${process.pid}.tmp`;
      await writeFile(temporary, content, { mode: 0o600 });
      await rename(temporary, this.file);
      this.persisted = content;
    } catch {
      throw new ApiError(
        500,
        'Die Modellauswahl konnte nicht in der Einstellungsdatei gespeichert werden. Bitte Schreibrechte prüfen.',
      );
    }
  }

  private async discoverLocal(): Promise<{
    models: DecisionModel[];
    error: string | null;
  }> {
    const base = ollamaBaseUrl();
    try {
      const data = await checkedJson(this.fetcher, `${base}/api/tags`);
      if (!Array.isArray(data.models)) throw new SyntaxError('models missing');
      const installed = new Map<
        string,
        {
          name: string;
          capabilities?: string[];
          remote_host?: string;
          remote_model?: string;
        }
      >();
      for (const entry of data.models) {
        const name = entry?.name || entry?.model;
        if (
          typeof name === 'string' &&
          !entry.remote_host &&
          !entry.remote_model
        )
          installed.set(name, { ...entry, name });
      }
      const found = new Map<string, DecisionModel>();
      const warnings: string[] = [];
      // Prüft höchstens vier Metadaten gleichzeitig; es werden keine Modelle geladen.
      const entries = [...installed.values()];
      for (let offset = 0; offset < entries.length; offset += 4) {
        await Promise.all(
          entries.slice(offset, offset + 4).map(async (entry) => {
            const known = this.catalog.models.find(
              (model) => model.id === `ollama:${entry.name}`,
            );
            try {
              const info = Array.isArray(entry.capabilities)
                ? entry
                : await checkedJson(this.fetcher, `${base}/api/show`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: entry.name }),
                  });
              if (!Array.isArray(info.capabilities))
                throw new SyntaxError('capabilities missing');
              if (
                info.remote_host ||
                info.remote_model ||
                !info.capabilities.includes('decision')
              )
                return;
              found.set(entry.name, {
                ...localModel(entry.name),
                available: true,
                reason: null,
              });
            } catch (error) {
              warnings.push(
                connectionReason(`Ollama-Modell ${entry.name}`, error),
              );
              if (known)
                found.set(entry.name, {
                  ...known,
                  available: false,
                  reason: connectionReason(
                    `Ollama-Modell ${entry.name}`,
                    error,
                  ),
                });
            }
          }),
        );
      }
      // Auch entfernte Modelle bleiben mit erklärtem Status im Dropdown sichtbar.
      for (const known of this.catalog.models.filter(
        (model) => model.provider === 'ollama',
      )) {
        if (!installed.has(known.model))
          found.set(known.model, {
            ...known,
            available: false,
            reason: 'Dieses Modell ist in Ollama nicht mehr lokal installiert.',
          });
      }
      return {
        models: [...found.values()].sort((a, b) =>
          a.model.localeCompare(b.model, 'en'),
        ),
        error: warnings.length
          ? `Nicht alle Modellfähigkeiten konnten geprüft werden: ${warnings.join(' ')}`
          : null,
      };
    } catch (error) {
      const reason = connectionReason(`Ollama (${base})`, error);
      return {
        models: this.catalog.models
          .filter((model) => model.provider === 'ollama')
          .map((model) => ({ ...model, available: false, reason })),
        error: reason,
      };
    }
  }

  private async checkOpenRouter(): Promise<DecisionModel> {
    const model = openRouterModel();
    const entry: DecisionModel = {
      id: `openrouter:${model}`,
      provider: 'openrouter',
      model,
      label: `${model === 'typesafe/jev-1.13' ? 'Jev' : model} · OpenRouter`,
      available: false,
      reason: null,
    };
    const key = process.env.OPENROUTER_API_KEY;
    if (!key)
      return {
        ...entry,
        reason:
          'OPENROUTER_API_KEY fehlt in der .env-Datei. Bitte ergänzen und den Server neu starten.',
      };
    try {
      const [account, modelInfo] = await Promise.all([
        checkedJson(this.fetcher, 'https://openrouter.ai/api/v1/key', {
          headers: { Authorization: `Bearer ${key}` },
        }),
        checkedJson(
          this.fetcher,
          `https://openrouter.ai/api/v1/models/${model.split('/').map(encodeURIComponent).join('/')}/endpoints`,
        ),
      ]);
      if (!account.data || !Array.isArray(modelInfo.data?.endpoints))
        throw new SyntaxError('invalid status');
      if (
        account.data.limit_remaining != null &&
        account.data.limit_remaining <= 0
      )
        return {
          ...entry,
          reason: 'Das Nutzungslimit des OpenRouter-API-Keys ist erreicht.',
        };
      if (
        !modelInfo.data.endpoints.some(
          (endpoint: { status?: number }) => endpoint.status === 0,
        )
      )
        return {
          ...entry,
          reason:
            'Für dieses Modell meldet OpenRouter keinen aktiven Anbieter.',
        };
      return { ...entry, available: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const reasons: Record<string, string> = {
        'HTTP 401':
          'OpenRouter hat den API-Key abgelehnt. Bitte die .env-Datei prüfen.',
        'HTTP 402': 'Das OpenRouter-Guthaben reicht nicht aus.',
        'HTTP 403': 'OpenRouter verweigert den Zugriff auf dieses Modell.',
        'HTTP 404': 'Dieses Modell ist bei OpenRouter nicht verfügbar.',
        'HTTP 429': 'OpenRouter begrenzt momentan die Anfragerate.',
      };
      return {
        ...entry,
        reason: reasons[message] || connectionReason('OpenRouter', error),
      };
    }
  }

  refresh(force = false): Promise<ModelCatalog> {
    if (this.refreshing) return this.refreshing;
    if (!force && this.loaded && Date.now() - this.lastRefresh < 15_000)
      return Promise.resolve(this.snapshot());
    const work = this.serialize(async () => {
      await this.load();
      const [local, remote] = await Promise.all([
        this.discoverLocal(),
        this.checkOpenRouter(),
      ]);
      const models = [...local.models, remote].map((model) => {
        const failure = this.failures.get(model.id);
        return failure && failure.until > Date.now()
          ? { ...model, available: false, reason: failure.reason }
          : model;
      });
      this.catalog = {
        models,
        selectedId: nextAvailableModel(
          models,
          this.catalog.selectedId ?? this.lastSelectedId,
        ),
        discoveryError: local.error,
      };
      this.lastSelectedId = this.catalog.selectedId ?? this.lastSelectedId;
      await this.save();
      this.lastRefresh = Date.now();
      return this.snapshot();
    });
    this.refreshing = work;
    void work
      .finally(() => {
        this.refreshing = null;
      })
      .catch(() => {});
    return work;
  }

  snapshot(): ModelCatalog {
    return structuredClone(this.catalog);
  }

  async select(id: unknown): Promise<ModelCatalog> {
    await this.refresh();
    return this.serialize(async () => {
      const model = this.catalog.models.find((model) => model.id === id);
      if (!model)
        throw new ApiError(400, 'Bitte ein gültiges Decision-Modell wählen.');
      if (!model.available)
        throw new ApiError(
          409,
          model.reason || 'Dieses Modell ist nicht verfügbar.',
        );
      const previous = this.catalog.selectedId;
      this.catalog.selectedId = model.id;
      try {
        await this.save();
      } catch (error) {
        this.catalog.selectedId = previous;
        throw error;
      }
      this.lastSelectedId = model.id;
      return this.snapshot();
    });
  }

  async resolve(id: unknown): Promise<DecisionModel> {
    if (id !== undefined && typeof id !== 'string')
      throw new ApiError(400, 'Ungültige Modellauswahl.');
    // Nach der ersten Ermittlung blockieren Statusprüfungen keine Klassifizierung mehr.
    // Tatsächliche Runner-/Verbindungsfehler werden weiterhin vom API-Handler erfasst.
    if (this.lastRefresh === 0) await this.refresh();
    else void this.refresh().catch(() => {});
    const model = this.catalog.models.find(
      (model) => model.id === (id ?? this.catalog.selectedId),
    );
    if (!model?.available)
      throw new ApiError(
        409,
        model?.reason ||
          'Kein Decision-Modell ist verfügbar. Bitte Ollama und OpenRouter prüfen.',
      );
    return model;
  }

  unavailable(id: string, reason: string): Promise<ModelCatalog> {
    return this.serialize(async () => {
      this.failures.set(id, { reason, until: Date.now() + 30_000 });
      this.catalog.models = this.catalog.models.map((model) =>
        model.id === id ? { ...model, available: false, reason } : model,
      );
      this.catalog.selectedId = nextAvailableModel(
        this.catalog.models,
        this.catalog.selectedId,
      );
      this.lastSelectedId = this.catalog.selectedId ?? this.lastSelectedId;
      await this.save();
      return this.snapshot();
    });
  }
}
