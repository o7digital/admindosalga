import test from 'node:test';
import assert from 'node:assert/strict';
import { pricingFallback, parseAiPrice } from '../lib/priceSuggestion.mjs';

test('HF billing failures provide a usable calculated price with explicit provenance', () => {
  const result = pricingFallback(342.15, { status: 402 });
  assert.equal(result.price, 342.15);
  assert.equal(result.provider, 'calculation');
  assert.match(result.providerError, /402/);
});
test('AI prices must cover verified worst-case cost and contain an explanation', () => {
  assert.equal(parseAiPrice('```json\n{"price":349,"reason":"Arrondi commercial"}\n```', 342.15).price, 349);
  for (const content of ['{"price":100,"reason":"Cheap"}', '{"price":349}', '{"price":100000000,"reason":"Huge"}', 'not JSON']) {
    assert.throws(() => parseAiPrice(content, 342.15));
  }
});
