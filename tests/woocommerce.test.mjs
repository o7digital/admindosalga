import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { publishWooPrice, reconcileWooProductCurrencies } from '../services/woocommerce.js';

const mxIdentity = productId => ({ productId: String(productId), market: 'MX', currency: 'MXN' });
const usIdentity = productId => ({ productId: String(productId), market: 'US', currency: 'USD' });

const currencyMeta = (source, display, rate) => [
  { id: 10, key: 'dosalga_price_origin_currency', value: source },
  { id: 11, key: 'dosalga_price_source_currency', value: display },
  { id: 12, key: 'dosalga_price_display_currency', value: display },
  { id: 13, key: 'dosalga_price_value_currency', value: display },
  { id: 14, key: 'dosalga_mxn_per_usd', value: String(rate) },
];

const response = payload => ({ ok: true, status: 200, json: async () => payload });

const queuedFetch = (steps, calls) => async (url, options = {}) => {
  const step = steps.shift();
  assert.ok(step, `Unexpected request: ${options.method || 'GET'} ${url}`);
  const parsed = new URL(url);
  const requestPath = `${parsed.pathname}${parsed.search}`;
  const method = options.method || 'GET';
  assert.equal(method, step.method || 'GET');
  assert.equal(requestPath, step.path);
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ method, path: requestPath, body });
  return response(typeof step.reply === 'function' ? step.reply(body) : step.reply);
};

let originalFetch;
let originalMxKey;
let originalMxSecret;
let originalUsKey;
let originalUsSecret;

beforeEach(() => {
  originalFetch = global.fetch;
  originalMxKey = process.env.WOOCOMMERCE_MX_CONSUMER_KEY;
  originalMxSecret = process.env.WOOCOMMERCE_MX_CONSUMER_SECRET;
  originalUsKey = process.env.WOOCOMMERCE_US_CONSUMER_KEY;
  originalUsSecret = process.env.WOOCOMMERCE_US_CONSUMER_SECRET;
  process.env.WOOCOMMERCE_MX_CONSUMER_KEY = 'mx-key';
  process.env.WOOCOMMERCE_MX_CONSUMER_SECRET = 'mx-secret';
  process.env.WOOCOMMERCE_US_CONSUMER_KEY = 'us-key';
  process.env.WOOCOMMERCE_US_CONSUMER_SECRET = 'us-secret';
});

afterEach(() => {
  global.fetch = originalFetch;
  const restore = (key, value) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore('WOOCOMMERCE_MX_CONSUMER_KEY', originalMxKey);
  restore('WOOCOMMERCE_MX_CONSUMER_SECRET', originalMxSecret);
  restore('WOOCOMMERCE_US_CONSUMER_KEY', originalUsKey);
  restore('WOOCOMMERCE_US_CONSUMER_SECRET', originalUsSecret);
});

test('variable publication writes native Railway currency on the parent and leaves 650 unconverted on every variation', async () => {
  const calls = [];
  const staleMeta = [
    { id: 11, key: 'dosalga_price_source_currency', value: 'USD' },
    { id: 15, key: 'dosalga_price_source_currency', value: 'USD' },
    { id: 12, key: 'dosalga_price_display_currency', value: 'MXN' },
    { id: 14, key: 'dosalga_mxn_per_usd', value: '17.49' },
    { id: 99, key: 'unrelated', value: 'keep-me' },
  ];
  global.fetch = queuedFetch([
    { path: '/wp-json/wc/v3/products/11702', reply: { id: 11702, sku: 'CJEJ1477239', name: 'Fan', type: 'variable', status: 'publish', catalog_visibility: 'visible', meta_data: staleMeta } },
    { path: '/wp-json/wc/v3/products/11702/variations?per_page=100', reply: [{ id: 11704, sku: 'BLACK' }, { id: 11706, sku: 'WHITE' }, { id: 11708, sku: 'PINK' }] },
    { method: 'PUT', path: '/wp-json/wc/v3/products/11702', reply: { id: 11702 } },
    { method: 'POST', path: '/wp-json/wc/v3/products/11702/variations/batch', reply: {} },
    { path: '/wp-json/wc/v3/products/11702/variations?per_page=100', reply: [{ id: 11704, sku: 'BLACK', price: '650.00' }, { id: 11706, sku: 'WHITE', price: '650.00' }, { id: 11708, sku: 'PINK', price: '650.00' }] },
    { path: '/wp-json/wc/v3/products/11702', reply: { id: 11702, sku: 'CJEJ1477239', meta_data: currencyMeta('MXN', 'MXN', 17.49) } },
  ], calls);

  const result = await publishWooPrice(mxIdentity(11702), 650, 'CJEJ1477239', { currency: 'MXN', exchangeRate: 17.49 });

  assert.equal(result.currencyVerified, true);
  assert.equal(result.currency, 'MXN');
  assert.deepEqual(result.updated.map(item => Number(item.price)), [650, 650, 650]);
  const parentUpdate = calls.find(call => call.method === 'PUT' && call.path.endsWith('/products/11702'));
  assert.equal(parentUpdate.body.regular_price, undefined);
  assert.deepEqual(parentUpdate.body.meta_data.filter(item => item.key === 'dosalga_price_source_currency'), [
    { id: 11, key: 'dosalga_price_source_currency', value: 'MXN' },
    { id: 15, key: 'dosalga_price_source_currency', value: 'MXN' },
  ]);
  const variationUpdate = calls.find(call => call.path.endsWith('/variations/batch')).body.update;
  assert.deepEqual(variationUpdate.map(item => item.regular_price), ['650.00', '650.00', '650.00']);
  assert.ok(variationUpdate.every(item => item.sale_price === ''));
  assert.equal(calls.length, 6);
});

test('simple publication writes price and USD currency metadata together and verifies both', async () => {
  const calls = [];
  global.fetch = queuedFetch([
    { path: '/wp-json/wc/v3/products/44', reply: { id: 44, sku: 'US-44', name: 'US item', type: 'simple', status: 'publish', catalog_visibility: 'visible', meta_data: [{ id: 80, key: 'unrelated', value: 'preserved' }] } },
    { method: 'PUT', path: '/wp-json/wc/v3/products/44', reply: { id: 44, sku: 'US-44' } },
    { path: '/wp-json/wc/v3/products/44', reply: { id: 44, sku: 'US-44', price: '28.00', meta_data: currencyMeta('USD', 'USD', 17.49) } },
  ], calls);

  const result = await publishWooPrice(usIdentity(44), 28, 'US-44', { currency: 'USD', exchangeRate: 17.49 });

  assert.equal(result.currencyVerified, true);
  assert.deepEqual(result.updated.map(item => Number(item.price)), [28]);
  const update = calls[1].body;
  assert.equal(update.regular_price, '28.00');
  assert.equal(update.sale_price, '');
  assert.deepEqual(Object.fromEntries(update.meta_data.map(item => [item.key, item.value])), {
    dosalga_price_origin_currency: 'USD',
    dosalga_price_source_currency: 'USD',
    dosalga_price_display_currency: 'USD',
    dosalga_price_value_currency: 'USD',
    dosalga_mxn_per_usd: '17.49',
  });
});

test('publication fails verification when WooCommerce keeps stale conversion metadata', async () => {
  const calls = [];
  global.fetch = queuedFetch([
    { path: '/wp-json/wc/v3/products/55', reply: { id: 55, sku: 'MX-55', name: 'MX item', type: 'simple', status: 'publish', catalog_visibility: 'visible', meta_data: currencyMeta('USD', 'MXN', 17.49) } },
    { method: 'PUT', path: '/wp-json/wc/v3/products/55', reply: { id: 55, sku: 'MX-55' } },
    { path: '/wp-json/wc/v3/products/55', reply: { id: 55, sku: 'MX-55', price: '650.00', meta_data: currencyMeta('USD', 'MXN', 17.49) } },
  ], calls);

  await assert.rejects(
    publishWooPrice(mxIdentity(55), 650, 'MX-55', { currency: 'MXN', exchangeRate: 17.49 }),
    /did not confirm the Railway currency metadata/
  );
});

test('bounded reconciliation records Railway origin but marks Woo values as final display currency and never sends prices', async () => {
  const calls = [];
  global.fetch = queuedFetch([
    // This historical listing is explicitly USD -> MXN and must remain so.
    { path: '/wp-json/wc/v3/products/61', reply: { id: 61, sku: 'LEGACY-USD', meta_data: currencyMeta('USD', 'MXN', 17.49) } },
    // This listing was explicitly published as native MXN in Railway.
    { path: '/wp-json/wc/v3/products/62', reply: { id: 62, sku: 'NATIVE-MXN', meta_data: currencyMeta('USD', 'MXN', 17.49) } },
    { method: 'PUT', path: '/wp-json/wc/v3/products/62', reply: { id: 62 } },
    { path: '/wp-json/wc/v3/products/62', reply: { id: 62, sku: 'NATIVE-MXN', meta_data: currencyMeta('MXN', 'MXN', 17.49) } },
  ], calls);

  const result = await reconcileWooProductCurrencies([
    { identity: mxIdentity(61), expectedSku: 'LEGACY-USD', sourceCurrency: 'USD', displayCurrency: 'MXN', exchangeRate: 17.49 },
    { identity: mxIdentity(62), expectedSku: 'NATIVE-MXN', sourceCurrency: 'MXN', displayCurrency: 'MXN', exchangeRate: 17.49 },
  ], { concurrency: 1, maxListings: 25 });

  assert.equal(result.requestedCount, 2);
  assert.equal(result.unchangedCount, 1);
  assert.equal(result.repairedCount, 1);
  const writes = calls.filter(call => call.method === 'PUT');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, '/wp-json/wc/v3/products/62');
  assert.equal(writes[0].body.regular_price, undefined);
  assert.equal(writes[0].body.sale_price, undefined);
  assert.deepEqual(Object.fromEntries(writes[0].body.meta_data.map(item => [item.key, item.value])), {
    dosalga_price_origin_currency: 'MXN',
    dosalga_price_source_currency: 'MXN',
    dosalga_price_display_currency: 'MXN',
    dosalga_price_value_currency: 'MXN',
    dosalga_mxn_per_usd: '17.49',
  });
});

test('reconciliation rejects oversized or duplicate identity batches before any request', async () => {
  global.fetch = async () => assert.fail('No WooCommerce request should be sent');
  const listing = { identity: mxIdentity(70), sourceCurrency: 'MXN', displayCurrency: 'MXN', exchangeRate: 17.49 };
  await assert.rejects(reconcileWooProductCurrencies([listing, listing]), /identity must be present and unique/);
  const oversized = Array.from({ length: 26 }, (_, index) => ({
    ...listing,
    identity: mxIdentity(100 + index),
  }));
  await assert.rejects(reconcileWooProductCurrencies(oversized, { maxListings: 25 }), /limited to 25 listings/);
});
