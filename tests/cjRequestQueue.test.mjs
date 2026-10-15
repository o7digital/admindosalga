import test from 'node:test';
import assert from 'node:assert/strict';
import { createCjRequestQueue, isCjRateLimit, CJ_INTERVAL_MS } from '../lib/cjRequestQueue.mjs';

const limited = () => Object.assign(new Error('Too Many Requests, QPS limit is 1 time/1second'), { status: 200 });

test('simultaneous requests reserve distinct slots before awaiting', async () => {
  const waits = [];
  const run = createCjRequestQueue({ now: () => 1000, wait: async ms => { waits.push(ms); } });
  const results = await Promise.all([1, 2, 3].map(value => run(async () => value)));
  assert.deepEqual(results, [1, 2, 3]);
  assert.deepEqual(waits, [CJ_INTERVAL_MS, 2 * CJ_INTERVAL_MS]);
});

test('CJ QPS errors inside HTTP 200 retry with backoff and a fresh shared slot', async () => {
  let slots = 0; let calls = 0; const waits = [];
  const run = createCjRequestQueue({ reserve: async () => { slots++; return 100; }, wait: async ms => { waits.push(ms); } });
  const result = await run(async () => { if (++calls < 3) throw limited(); return 'quote'; });
  assert.equal(result, 'quote'); assert.equal(slots, 3);
  assert.deepEqual(waits, [100, 2000, 100, 4000, 100]);
});

test('persistent QPS failure stops after four attempts', async () => {
  let calls = 0;
  const run = createCjRequestQueue({ reserve: async () => 0, wait: async () => {} });
  await assert.rejects(run(async () => { calls++; throw limited(); }), /QPS/);
  assert.equal(calls, 4);
});

test('auth failures, daily point shortages and mutating requests are not retried', async () => {
  for (const [error, options] of [
    [new Error('Token expired'), {}],
    [Object.assign(new Error('Insufficient API points'), { status: 429 }), {}],
    [limited(), { retry: false }],
  ]) {
    let calls = 0;
    const run = createCjRequestQueue({ reserve: async () => 0, wait: async () => {} });
    await assert.rejects(run(async () => { calls++; throw error; }, options));
    assert.equal(calls, 1);
  }
  assert.equal(isCjRateLimit(Object.assign(new Error('Too Many Requests'), { status: 429 })), true);
});

test('separate server queues use the same reservation source', async () => {
  let at = 0; const waits = [];
  const reserve = async () => { const slot = at; at += CJ_INTERVAL_MS; return slot; };
  const a = createCjRequestQueue({ reserve, wait: async ms => waits.push(ms) });
  const b = createCjRequestQueue({ reserve, wait: async ms => waits.push(ms) });
  await Promise.all([a(async () => 1), b(async () => 2), a(async () => 3)]);
  assert.deepEqual(waits, [CJ_INTERVAL_MS, 2 * CJ_INTERVAL_MS]);
});
