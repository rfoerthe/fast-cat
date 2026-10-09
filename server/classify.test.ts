import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ApiError,
  classify,
  parseAnswers,
  parseQuery,
  parseSetId,
} from './classify.ts';
import { EMOJIS, EMOJI_SETS, type EmojiSetId } from '../shared/emojis.ts';
/** Vollständige, deterministische Anbieterantwort mit abwechselnd niedrigen und hohen Bewertungen. */
const validAnswers = (setId: EmojiSetId = 'things') =>
  Object.fromEntries(
    EMOJI_SETS[setId].emojis.map(({ id }, i) => [
      id,
      { type: 'noul', noul: i % 2 ? 0.15 : 0.96 },
    ]),
  );
// Ungültige Eingaben müssen scheitern, bevor kostenpflichtige Anbieteraufrufe möglich sind.
test('validates input before sending paid requests', () => {
  assert.equal(
    parseQuery({ query: '  Eine Band gründen  ' }),
    'Eine Band gründen',
  );
  for (const body of [
    null,
    {},
    { query: 12 },
    { query: '  ' },
    { query: 'a'.repeat(301) },
  ])
    assert.throws(() => parseQuery(body), ApiError);
});
// Vollständigkeit, eindeutige Symbole und der erlaubte Wahrscheinlichkeitsbereich bilden den Datenvertrag.
test('all 180 independent scores are required and probabilities must be valid', () => {
  assert.equal(EMOJIS.length, 180);
  assert.equal(new Set(EMOJIS.map((e) => e.symbol)).size, 180);
  assert.equal(
    Object.keys(parseAnswers({ answers: validAnswers() })).length,
    180,
  );
  for (const invalid of [-0.1, 1.1, NaN, '0.9', null]) {
    const answers = {
      ...validAnswers(),
      emoji_0: { type: 'noul', noul: invalid },
    };
    assert.throws(() => parseAnswers({ answers }), ApiError);
  }
  const incomplete = validAnswers();
  delete incomplete.emoji_179;
  assert.throws(() => parseAnswers({ answers: incomplete }), ApiError);
  assert.throws(
    () => parseAnswers({ answers: { emoji_0: { type: 'choice', noul: 0.9 } } }),
    ApiError,
  );
});
// Der injizierte Fetch-Stub prüft den Request und liefert ausschließlich lokale Testdaten.
test('uses one Decisions request, valid HTTP headers and stable emoji IDs', async () => {
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-placeholder';
  try {
    let count = 0;
    let sentRequest: unknown;
    const upstreamResponse = {
      answers: validAnswers(),
      usage: { cost: 0.001 },
      model: 'typesafe/jev-1.13',
      metadata: {
        note: 'Quotes: "test", newline:\n <script>alert(1)</script>',
        cached: false,
        extra: null,
      },
    };
    /** Prüft Header und Batch-Struktur und ersetzt den echten OpenRouter-Aufruf. */
    const fetcher: typeof fetch = async (url, init) => {
      count++;
      assert.equal(url, 'https://openrouter.ai/api/alpha/decisions');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer test-placeholder');
      const body = JSON.parse(String(init?.body));
      sentRequest = body;
      assert.equal(Object.keys(body.questions).length, 180);
      assert.equal(body.questions.emoji_0.type, 'noul');
      assert.equal(body.state.description, 'Eine Band gründen');
      return Response.json(upstreamResponse);
    };
    const result = await classify(
      'Eine Band gründen',
      new AbortController().signal,
      fetcher,
    );
    assert.equal(count, 1);
    assert.equal(result.scores.emoji_0, 0.96);
    assert.equal(result.costUsd, 0.001);
    assert.equal(result.requests.length, 1);
    assert.deepEqual(result.requests[0].request, sentRequest);
    assert.deepEqual(result.requests[0].response, upstreamResponse);
    assert.equal(result.requests[0].status, 200);
    assert.equal(
      result.requests[0].url,
      'https://openrouter.ai/api/alpha/decisions',
    );
    assert.ok(result.requests[0].elapsedMs >= 0);
    assert.ok(!JSON.stringify(result.requests).includes('test-placeholder'));
    assert.ok(!JSON.stringify(result.requests).includes('Authorization'));
    await assert.rejects(
      classify(
        'Test',
        new AbortController().signal,
        async () => new Response('private upstream details', { status: 401 }),
      ),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 502 &&
        !error.message.includes('private'),
    );
    delete process.env.OPENROUTER_API_KEY;
    await assert.rejects(
      classify('Test', new AbortController().signal, fetcher),
      (error: unknown) => error instanceof ApiError && error.status === 503,
    );
    assert.equal(count, 1);
    // Prozessweite Konfiguration auch dann wiederherstellen, wenn eine Assertion fehlschlägt.
  } finally {
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
  }
});

test('both catalogs have 180 distinct symbols and globally unique IDs', () => {
  const allIds = new Set<string>();
  for (const { emojis } of Object.values(EMOJI_SETS)) {
    assert.equal(emojis.length, 180);
    assert.equal(new Set(emojis.map(({ symbol }) => symbol)).size, 180);
    for (const emoji of emojis) {
      assert.ok(emoji.label.trim());
      assert.ok(!allIds.has(emoji.id));
      allIds.add(emoji.id);
    }
  }
  assert.equal(EMOJIS[0].id, 'emoji_0');
  assert.equal(EMOJIS[179].id, 'emoji_179');
});

test('validates set selection and defaults legacy requests to things', () => {
  assert.equal(parseSetId({ query: 'Hallo' }), 'things');
  for (const setId of ['things', 'people'])
    assert.equal(parseSetId({ setId }), setId);
  for (const setId of [null, 1, '', 'unknown', '__proto__', 'constructor']) {
    assert.throws(
      () => parseSetId({ setId }),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
  }
});

test('requires complete scores from the selected catalog, rejects the other catalog', () => {
  assert.equal(
    Object.keys(parseAnswers({ answers: validAnswers('people') }, 'people'))
      .length,
    180,
  );
  assert.throws(
    () => parseAnswers({ answers: validAnswers('things') }, 'people'),
    ApiError,
  );
  assert.throws(
    () => parseAnswers({ answers: validAnswers('people') }, 'things'),
    ApiError,
  );
  const incomplete = validAnswers('people');
  delete incomplete.people_179;
  assert.throws(
    () => parseAnswers({ answers: incomplete }, 'people'),
    ApiError,
  );
});

test('people requests send only the 180 selected emojis and return their set identity', async () => {
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-placeholder';
  try {
    let count = 0;
    const fetcher: typeof fetch = async (_url, init) => {
      count++;
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(
        Object.keys(body.questions),
        EMOJI_SETS.people.emojis.map(({ id }) => id),
      );
      assert.ok(body.questions.people_0.instructions.includes('😀'));
      assert.equal(body.state.description, 'Gute Laune');
      return Response.json({ answers: validAnswers('people') });
    };
    const result = await classify(
      'Gute Laune',
      new AbortController().signal,
      fetcher,
      'people',
    );
    assert.equal(count, 1);
    assert.equal(result.setId, 'people');
    assert.equal(result.query, 'Gute Laune');
    assert.equal(result.scores.people_0, 0.96);
    assert.equal(result.scores.emoji_0, undefined);
  } finally {
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
  }
});

test('Ollama scores all 180 emojis in batches of at most 64 without an API key', async () => {
  const oldKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    for (const setId of ['things', 'people'] as const) {
      const ids: string[] = [];
      const sizes: number[] = [];
      const exchanges: { request: unknown; response: unknown }[] = [];
      const controller = new AbortController();
      const result = await classify(
        'Gesund essen',
        controller.signal,
        async (url, init) => {
          assert.match(String(url), /\/v1\/systemone$/);
          assert.equal(new Headers(init?.headers).get('Authorization'), null);
          assert.equal(init?.signal, controller.signal);
          assert.ok(Buffer.byteLength(String(init?.body)) <= 65_536);
          const body = JSON.parse(String(init?.body));
          assert.equal(body.model, 'clef-flash:latest');
          assert.equal(body.state.description, 'Gesund essen');
          const batch = Object.keys(body.questions);
          sizes.push(batch.length);
          ids.push(...batch);
          const response = {
            model: body.model,
            answers: Object.fromEntries(
              batch.map((id) => [id, { type: 'noul', noul: 0.9 }]),
            ),
          };
          exchanges.push({ request: body, response });
          return Response.json(response);
        },
        setId,
        {
          id: 'ollama:clef-flash:latest',
          provider: 'ollama',
          model: 'clef-flash:latest',
        },
      );
      assert.deepEqual(sizes, [64, 64, 52]);
      assert.deepEqual(
        ids,
        EMOJI_SETS[setId].emojis.map((emoji) => emoji.id),
      );
      assert.equal(Object.keys(result.scores).length, 180);
      assert.equal(result.modelId, 'ollama:clef-flash:latest');
      assert.equal(result.costUsd, 0);
      assert.equal(result.requests.length, 3);
      assert.deepEqual(
        result.requests.map(({ request, response }) => ({ request, response })),
        exchanges,
      );
      assert.ok(result.requests.every(({ status }) => status === 200));
    }
  } finally {
    if (oldKey !== undefined) process.env.OPENROUTER_API_KEY = oldKey;
  }
});

test('Ollama rejects partial batches and marks runner failures as unavailable', async () => {
  const selected = {
    id: 'ollama:custom',
    provider: 'ollama' as const,
    model: 'custom',
  };
  await assert.rejects(
    classify(
      'Test',
      new AbortController().signal,
      async () => Response.json({ answers: {} }),
      'things',
      selected,
    ),
    ApiError,
  );
  await assert.rejects(
    classify(
      'Test',
      new AbortController().signal,
      async () => new Response('private details', { status: 500 }),
      'things',
      selected,
    ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.unavailable &&
      /Ollama/.test(error.message) &&
      !error.message.includes('private'),
  );
});

test('context overflow shrinks batches, preserves all scores and remembers the size per model', async () => {
  const selection = {
    id: 'ollama:small-context',
    provider: 'ollama' as const,
    model: 'small-context',
  };
  let tokensPerQuestion = 200;
  let failures = 0;
  let requestedSizes: number[] = [];
  let successfulIds: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const { questions } = JSON.parse(String(init?.body));
    const ids = Object.keys(questions);
    requestedSizes.push(ids.length);
    const tokens = ids.length * tokensPerQuestion + 100;
    if (tokens > 2050) {
      failures++;
      return Response.json(
        {
          error: `prompt 0 has ${tokens} tokens; expected 1–2050 (input is never truncated)`,
        },
        { status: 400 },
      );
    }
    successfulIds.push(...ids);
    return Response.json({
      answers: Object.fromEntries(
        ids.map((id) => [id, { type: 'noul', noul: 0.75 }]),
      ),
    });
  };
  const run = () =>
    classify(
      'Obst, aber keine Äpfel',
      new AbortController().signal,
      fetcher,
      'things',
      selection,
    );
  const expectedIds = EMOJIS.map(({ id }) => id);
  const first = await run();
  assert.equal(failures, 1);
  assert.equal(requestedSizes[0], 64);
  const learnedSize = requestedSizes[1];
  assert.ok(learnedSize < 64);
  assert.deepEqual(successfulIds, expectedIds);
  assert.equal(Object.keys(first.scores).length, 180);
  assert.equal(first.requests.length, requestedSizes.length);
  assert.equal(first.requests[0].status, 400);
  assert.match(
    String((first.requests[0].response as { error: string }).error),
    /expected 1–2050/,
  );
  assert.ok(first.requests.slice(1).every(({ status }) => status === 200));
  requestedSizes = [];
  successfulIds = [];
  await run();
  assert.equal(requestedSizes[0], learnedSize);
  assert.equal(failures, 1);
  assert.deepEqual(successfulIds, expectedIds);
  // Ein längerer Suchtext kann trotz gelernter Größe eine weitere Reduzierung erfordern.
  tokensPerQuestion = 400;
  requestedSizes = [];
  successfulIds = [];
  await run();
  assert.equal(failures, 2);
  assert.ok(requestedSizes[1] < learnedSize);
  assert.deepEqual(successfulIds, expectedIds);
});

test('HTTP 413 retries smaller batches without dropping any emoji', async () => {
  const successfulIds: string[] = [];
  const sizes: number[] = [];
  const result = await classify(
    'Test',
    new AbortController().signal,
    async (_url, init) => {
      const ids = Object.keys(JSON.parse(String(init?.body)).questions);
      sizes.push(ids.length);
      if (ids.length > 16)
        return new Response(ids.length > 32 ? 'proxy <limit> exceeded' : '', {
          status: 413,
        });
      successfulIds.push(...ids);
      return Response.json({
        answers: Object.fromEntries(
          ids.map((id) => [id, { type: 'noul', noul: 0.8 }]),
        ),
      });
    },
    'people',
    { id: 'ollama:body-limit', provider: 'ollama', model: 'body-limit' },
  );
  assert.deepEqual(sizes.slice(0, 3), [64, 32, 16]);
  assert.deepEqual(
    successfulIds,
    EMOJI_SETS.people.emojis.map(({ id }) => id),
  );
  assert.equal(Object.keys(result.scores).length, 180);
  assert.equal(result.requests.length, sizes.length);
  assert.deepEqual(
    result.requests.slice(0, 3).map(({ status }) => status),
    [413, 413, 200],
  );
  assert.equal(result.requests[0].response, 'proxy <limit> exceeded');
  assert.equal(result.requests[1].response, null);
});

test('single-question context overflow stops with an actionable error and no upstream text', async () => {
  let calls = 0;
  await assert.rejects(
    classify(
      'Test',
      new AbortController().signal,
      async () => {
        calls++;
        return Response.json(
          { error: 'prompt 0 has 10000 tokens; expected 1–10 private details' },
          { status: 400 },
        );
      },
      'things',
      { id: 'ollama:tiny', provider: 'ollama', model: 'tiny' },
    ),
    (error: unknown) =>
      error instanceof ApiError &&
      !error.unavailable &&
      /einzelne Bewertung/.test(error.message) &&
      !/private/.test(error.message),
  );
  assert.equal(calls, 2);
});

test('unrelated validation errors never trigger retries or expose upstream details', async () => {
  for (const body of [
    'private invalid body',
    JSON.stringify({ error: 'private schema error' }),
  ]) {
    let calls = 0;
    await assert.rejects(
      classify(
        'Test',
        new AbortController().signal,
        async () => {
          calls++;
          return new Response(body, { status: 400 });
        },
        'things',
        { id: 'ollama:invalid', provider: 'ollama', model: 'invalid' },
      ),
      (error: unknown) =>
        error instanceof ApiError &&
        !error.unavailable &&
        !/private/.test(error.message),
    );
    assert.equal(calls, 1);
  }
});

test('cancelling a failed batch prevents another attempt', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    classify(
      'Test',
      controller.signal,
      async () => {
        calls++;
        controller.abort();
        return new Response('', { status: 413 });
      },
      'things',
      { id: 'ollama:cancelled', provider: 'ollama', model: 'cancelled' },
    ),
    { name: 'AbortError' },
  );
  assert.equal(calls, 1);
});
