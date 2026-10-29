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

test('CJ Shipping Cost uses logisticPrice and retains total postage separately for every SKU and destination', async () => {
  process.env.CJ_ACCESS_TOKEN = 'test-token';
  delete process.env.DATABASE_URL;
  const { getLogistics } = await import('../services/cjdropshipping.js');
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ result: true, data: [
      { logisticName: 'LuWei Ordinary US', logisticPrice: 7.22, totalPostageFee: 8.22, logisticAging: '5-11' },
      { logisticName: 'Free', logisticPrice: 0, totalPostageFee: 0, logisticAging: '7-14' },
      { logisticName: 'Unavailable' },
    ] }) };
  };
  try {
    const routes = await getLogistics({ vid: 'SKU-L' }, 'USA');
    assert.deepEqual(calls[0], { startCountryCode: 'CN', endCountryCode: 'US', products: [{ quantity: 1, vid: 'SKU-L' }] });
    assert.equal(routes.length, 2);
    assert.equal(routes[1].shippingCost, 7.22);
    assert.equal(routes[1].totalShippingCost, 8.22);
    assert.equal(routes[1].costBreakdown, true);
    assert.equal(routes[1].destination, 'USA');
    assert.equal(routes[0].shippingCost, 0);
    await getLogistics({ vid: 'SKU-M' }, 'México');
    assert.equal(calls[1].endCountryCode, 'MX');
    assert.equal(calls[1].products[0].vid, 'SKU-M');
  } finally { global.fetch = original; }
});
