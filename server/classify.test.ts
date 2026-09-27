import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, classify, parseAnswers, parseQuery } from './classify.ts';
import { EMOJIS } from '../shared/emojis.ts';
/** Vollständige, deterministische Anbieterantwort mit abwechselnd niedrigen und hohen Bewertungen. */
const validAnswers = () => Object.fromEntries(EMOJIS.map(({id}, i) => [id, { type:'noul', noul: i % 2 ? 0.15 : 0.96 }]));
// Ungültige Eingaben müssen scheitern, bevor kostenpflichtige Anbieteraufrufe möglich sind.
test('validates input before sending paid requests', () => {
  assert.equal(parseQuery({query:'  Eine Band gründen  '}), 'Eine Band gründen');
  for (const body of [null, {}, {query:12}, {query:'  '}, {query:'a'.repeat(301)}]) assert.throws(() => parseQuery(body), ApiError);
});
// Vollständigkeit, eindeutige Symbole und der erlaubte Wahrscheinlichkeitsbereich bilden den Datenvertrag.
test('all 180 independent scores are required and probabilities must be valid', () => {
  assert.equal(EMOJIS.length, 180);
  assert.equal(new Set(EMOJIS.map(e => e.symbol)).size, 180);
  assert.equal(Object.keys(parseAnswers({answers:validAnswers()})).length, 180);
  for (const invalid of [-0.1, 1.1, NaN, '0.9', null]) {
    const answers = {...validAnswers(), emoji_0:{type:'noul',noul:invalid}};
    assert.throws(() => parseAnswers({answers}), ApiError);
  }
  const incomplete = validAnswers(); delete incomplete.emoji_179;
  assert.throws(() => parseAnswers({answers:incomplete}), ApiError);
  assert.throws(() => parseAnswers({answers:{emoji_0:{type:'choice',noul:0.9}}}), ApiError);
});
// Der injizierte Fetch-Stub prüft den Request und liefert ausschließlich lokale Testdaten.
test('uses one Decisions request, valid HTTP headers and stable emoji IDs', async () => {
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-placeholder';
  try {
    let count = 0;
    /** Prüft Header und Batch-Struktur und ersetzt den echten OpenRouter-Aufruf. */
    const fetcher: typeof fetch = async (url, init) => {
      count++;
      assert.equal(url, 'https://openrouter.ai/api/alpha/decisions');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer test-placeholder');
      const body = JSON.parse(String(init?.body));
      assert.equal(Object.keys(body.questions).length, 180);
      assert.equal(body.questions.emoji_0.type, 'noul');
      assert.equal(body.state.description, 'Eine Band gründen');
      return Response.json({answers:validAnswers(), usage:{cost:0.001}, model:'typesafe/jev-1.13'});
    };
    const result = await classify('Eine Band gründen', new AbortController().signal, fetcher);
    assert.equal(count, 1); assert.equal(result.scores.emoji_0, .96); assert.equal(result.costUsd, .001);
    await assert.rejects(classify('Test', new AbortController().signal, async () => new Response('private upstream details', {status:401})), (error: unknown) => error instanceof ApiError && error.status === 502 && !error.message.includes('private'));
    delete process.env.OPENROUTER_API_KEY;
    await assert.rejects(classify('Test', new AbortController().signal, fetcher), (error:unknown) => error instanceof ApiError && error.status === 503);
    assert.equal(count, 1);
  // Prozessweite Konfiguration auch dann wiederherstellen, wenn eine Assertion fehlschlägt.
  } finally { if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey; }
});
