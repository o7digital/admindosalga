import test from 'node:test';
import assert from 'node:assert/strict';

test('CJ variant loading recovers from a QPS error delivered with HTTP 200', async () => {
  process.env.CJ_ACCESS_TOKEN = 'test-token';
  delete process.env.DATABASE_URL;
  const { getCjFreightVariants } = await import('../services/cjdropshipping.js');
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), at: Date.now(), token: options.headers['CJ-Access-Token'] });
    return { ok: true, status: 200, json: async () => calls.length === 1
      ? { result: false, message: 'Too Many Requests, QPS limit is 1 time/1second' }
      : { result: true, data: { variants: [{ vid: 'v1', variantSku: 'SKU-L', variantKey: 'L', variantSellPrice: 5.07 }] } } };
  };
  try {
    const variants = await getCjFreightVariants({ cjSku: 'CJ-SKU' });
    assert.equal(calls.length, 2);
    assert.ok(calls[1].at - calls[0].at >= 1500);
    assert.equal(calls[0].url, calls[1].url);
    assert.equal(calls[1].token, 'test-token');
    assert.deepEqual(variants, [{ vid: 'v1', sku: 'SKU-L', name: 'L', cjCostUsd: 5.07, routes: [] }]);
    let deniedCalls = 0;
    global.fetch = async () => {
      deniedCalls++;
      return { ok: true, status: 200, json: async () => ({ result: false, message: 'Your API access has been disabled. Please reactivate it.' }) };
    };
    await assert.rejects(getCjFreightVariants({ cjSku: 'CJ-SKU' }), /access has been disabled/);
    assert.equal(deniedCalls, 1, 'a disabled account must not trigger alternate SKU requests');
  } finally { global.fetch = original; }
});
