import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { ModelRegistry } from './models.ts';
import { ApiError } from './classify.ts';
import { nextAvailableModel, type DecisionModel } from '../shared/models.ts';

const entry = (name: string, capabilities?: string[]) => ({
  name,
  capabilities,
});
const model = (id: string, available: boolean): DecisionModel => ({
  id,
  available,
  provider: 'ollama',
  model: id,
  label: id,
  reason: available ? null : 'offline',
});

// Jede Testinstanz bekommt eine echte, isolierte Einstellungsdatei und einen simulierten HTTP-Client.
async function setup(run: (file: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'fast-cat-models-'));
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-placeholder';
  try {
    await run(join(dir, 'models.json'));
  } finally {
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
    await rm(dir, { recursive: true, force: true });
  }
}

function fakeApi(
  options: {
    offline?: boolean;
    models?: unknown[];
    keyStatus?: number;
    endpointStatus?: number;
    remaining?: number;
  } = {},
): typeof fetch {
  return async (url, init) => {
    const path = String(url);
    assert.ok(init?.signal);
    if (path.endsWith('/api/tags')) {
      if (options.offline) throw new TypeError('fetch failed');
      return Response.json({
        models: options.models ?? [entry('clef-flash:latest', ['decision'])],
      });
    }
    if (path.endsWith('/api/show')) {
      assert.equal(JSON.parse(String(init?.body)).model, 'custom-alias:latest');
      return Response.json({ capabilities: ['decision', 'vision'] });
    }
    if (path.endsWith('/api/v1/key')) {
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        'Bearer test-placeholder',
      );
      return options.keyStatus
        ? new Response('', { status: options.keyStatus })
        : Response.json({
            data: { limit_remaining: options.remaining ?? null },
          });
    }
    if (path.endsWith('/endpoints'))
      return Response.json({
        data: { endpoints: [{ status: options.endpointStatus ?? 0 }] },
      });
    throw new Error(`Unexpected request: ${path}`);
  };
}

test('discovers capability-based local models including aliases, excludes chat and cloud models', async () =>
  setup(async (file) => {
    const registry = new ModelRegistry(
      file,
      fakeApi({
        models: [
          entry('clef-flash:latest', ['decision']),
          entry('qwen:latest', ['completion']),
          entry('custom-alias:latest'),
          {
            ...entry('remote:cloud', ['decision']),
            remote_host: 'https://ollama.com',
          },
        ],
      }),
    );
    const catalog = await registry.refresh();
    assert.deepEqual(
      catalog.models.map((model) => model.id),
      [
        'ollama:clef-flash:latest',
        'ollama:custom-alias:latest',
        'openrouter:typesafe/jev-1.13',
      ],
    );
    assert.ok(catalog.models.every((model) => model.available));
    await assert.rejects(registry.select('ollama:qwen:latest'), ApiError);
    await assert.rejects(registry.resolve('https://evil.invalid'), ApiError);
    await assert.rejects(registry.resolve({ model: 'clef' }), ApiError);
  }));

test('persists chosen model and restores it across a new server instance', async () =>
  setup(async (file) => {
    const first = new ModelRegistry(file, fakeApi());
    await first.refresh();
    await first.select('openrouter:typesafe/jev-1.13');
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.selectedId, 'openrouter:typesafe/jev-1.13');
    assert.deepEqual(saved.ollamaModels, ['clef-flash:latest']);
    assert.ok(!(await readFile(file, 'utf8')).includes('test-placeholder'));
    const second = new ModelRegistry(file, fakeApi());
    assert.equal((await second.refresh()).selectedId, saved.selectedId);
  }));

test('retains offline local models with reasons and persists automatic fallback', async () =>
  setup(async (file) => {
    const first = new ModelRegistry(file, fakeApi());
    await first.refresh();
    const second = new ModelRegistry(file, fakeApi({ offline: true }));
    const catalog = await second.refresh();
    assert.equal(catalog.selectedId, 'openrouter:typesafe/jev-1.13');
    assert.equal(catalog.models[0].available, false);
    assert.match(catalog.models[0].reason ?? '', /nicht erreichbar/);
    assert.ok(catalog.discoveryError);
    assert.equal(
      JSON.parse(await readFile(file, 'utf8')).selectedId,
      catalog.selectedId,
    );
    await assert.rejects(
      second.select('ollama:clef-flash:latest'),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );
  }));

test('reports missing key, rejected key, exhausted limit and unavailable provider', async () =>
  setup(async (file) => {
    delete process.env.OPENROUTER_API_KEY;
    const missing = await new ModelRegistry(file, fakeApi()).refresh();
    assert.match(missing.models.at(-1)?.reason ?? '', /API_KEY fehlt/);
    process.env.OPENROUTER_API_KEY = 'test-placeholder';
    for (const [options, reason] of [
      [{ keyStatus: 401 }, /API-Key abgelehnt/],
      [{ remaining: 0 }, /Nutzungslimit/],
      [{ endpointStatus: -1 }, /keinen aktiven Anbieter/],
    ] as const) {
      const catalog = await new ModelRegistry(file, fakeApi(options)).refresh();
      assert.equal(catalog.models.at(-1)?.available, false);
      assert.match(catalog.models.at(-1)?.reason ?? '', reason);
      assert.equal(catalog.selectedId, 'ollama:clef-flash:latest');
    }
  }));

test('all-offline restart preserves last selection; removed models are explained', async () =>
  setup(async (file) => {
    const first = new ModelRegistry(file, fakeApi());
    await first.refresh();
    await first.select('openrouter:typesafe/jev-1.13');
    const offline = await new ModelRegistry(
      file,
      fakeApi({ offline: true, keyStatus: 401 }),
    ).refresh();
    assert.equal(offline.selectedId, null);
    assert.equal(
      JSON.parse(await readFile(file, 'utf8')).selectedId,
      'openrouter:typesafe/jev-1.13',
    );
    const restored = await new ModelRegistry(
      file,
      fakeApi({ models: [] }),
    ).refresh();
    assert.equal(restored.selectedId, 'openrouter:typesafe/jev-1.13');
    assert.match(
      restored.models[0].reason ?? '',
      /nicht mehr lokal installiert/,
    );
  }));

test('runtime failure chooses next model, wraps order and is not immediately reset by a health check', async () =>
  setup(async (file) => {
    assert.equal(
      nextAvailableModel(
        [model('a', true), model('b', false), model('c', true)],
        'b',
      ),
      'c',
    );
    assert.equal(
      nextAvailableModel([model('a', true), model('b', false)], 'b'),
      'a',
    );
    assert.equal(nextAvailableModel([model('a', false)], 'a'), null);
    const registry = new ModelRegistry(file, fakeApi());
    await registry.refresh();
    const catalog = await registry.unavailable(
      'ollama:clef-flash:latest',
      'Runner ausgefallen',
    );
    assert.equal(catalog.selectedId, 'openrouter:typesafe/jev-1.13');
    assert.equal(
      (await registry.refresh(true)).models[0].reason,
      'Runner ausgefallen',
    );
    const allOffline = await registry.unavailable(
      'openrouter:typesafe/jev-1.13',
      'Netzwerk ausgefallen',
    );
    assert.equal(allOffline.selectedId, null);
  }));

test('deduplicates status requests and recovers from malformed settings', async () =>
  setup(async (file) => {
    await writeFile(file, '{broken');
    let calls = 0;
    const fake = fakeApi();
    const registry = new ModelRegistry(file, async (url, init) => {
      calls++;
      return fake(url, init);
    });
    const [a, b] = await Promise.all([registry.refresh(), registry.refresh()]);
    assert.deepEqual(a, b);
    assert.equal(calls, 3);
    await registry.refresh();
    assert.equal(calls, 3);
    assert.ok(JSON.parse(await readFile(file, 'utf8')).selectedId);
  }));

test('metadata failures are visible instead of silently claiming complete discovery', async () =>
  setup(async (file) => {
    const fake = fakeApi({ models: [entry('custom-alias:latest')] });
    const catalog = await new ModelRegistry(file, async (url, init) =>
      String(url).endsWith('/api/show')
        ? new Response('', { status: 503 })
        : fake(url, init),
    ).refresh();
    assert.match(catalog.discoveryError ?? '', /Nicht alle Modellfähigkeiten/);
    assert.match(catalog.discoveryError ?? '', /custom-alias:latest/);
  }));

test('a failed settings write is reported and rolls back manual selection', async () =>
  setup(async (file) => {
    const registry = new ModelRegistry(file, fakeApi());
    const first = await registry.refresh();
    await rm(file);
    // Ein Verzeichnis am Dateipfad verhindert das atomare Umbenennen.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(file);
    await assert.rejects(
      registry.select('openrouter:typesafe/jev-1.13'),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 500 &&
        /Schreibrechte/.test(error.message),
    );
    assert.equal(registry.snapshot().selectedId, first.selectedId);
  }));

test('classification uses the checked catalog while a remote status check is pending', async () =>
  setup(async (file) => {
    let block = false;
    let release = () => {};
    let notifyStarted = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const fake = fakeApi();
    const registry = new ModelRegistry(file, async (url, init) => {
      if (block && String(url).endsWith('/api/v1/key')) {
        notifyStarted();
        await gate;
      }
      return fake(url, init);
    });
    await registry.refresh();
    block = true;
    const refresh = registry.refresh(true);
    await started;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const selected = await Promise.race([
        registry.resolve('ollama:clef-flash:latest'),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error('classification waited for remote health check'),
              ),
            1000,
          );
        }),
      ]);
      assert.equal(selected.id, 'ollama:clef-flash:latest');
      await assert.rejects(registry.resolve('ollama:unknown'), ApiError);
    } finally {
      clearTimeout(timer);
      release();
      await refresh;
    }
    await registry.unavailable(
      'ollama:clef-flash:latest',
      'Runner ausgefallen',
    );
    await assert.rejects(
      registry.resolve('ollama:clef-flash:latest'),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 409 &&
        /Runner/.test(error.message),
    );
  }));
