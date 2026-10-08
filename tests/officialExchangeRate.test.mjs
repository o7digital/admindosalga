import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDofRates, mexicoDate, getLatestOfficialRate } from '../lib/officialExchangeRate.mjs';
const row = (date, rate) => `<tr><td class="txt">${date}</td><td>${rate}</td></tr>`;

test('DOF reads the latest publication, ignoring sidebar and future rows', () => {
  const html = `<p>DOLAR<br>99.9999</p><table>${row('07-10-2026', '17.967000')}${row('09-10-2026', '18.500000')}${row('08-10-2026', '17.978000')}</table>`;
  assert.deepEqual(parseDofRates(html, '2026-10-08'), { date: '2026-10-08', rate: 17.978 });
});
test('weekends retain the actual last publication date', () => {
  assert.deepEqual(parseDofRates(row('09-10-2026', '18.1128'), '2026-10-11'), { date: '2026-10-09', rate: 18.1128 });
});
test('missing, zero, malformed rates and invalid dates fail closed', () => {
  for (const html of ['', row('08-10-2026', 'N/E'), row('08-10-2026', '0'), row('31-02-2026', '18.1'), '<span>DOLAR 18.1</span>']) {
    assert.throws(() => parseDofRates(html, '2026-10-08'));
  }
});
test('daily boundaries use Mexico City timezone', () => {
  assert.equal(mexicoDate(new Date('2026-10-09T05:59:00Z')), '2026-10-08');
  assert.equal(mexicoDate(new Date('2026-10-09T06:00:00Z')), '2026-10-09');
});
test('official fetch uses USD history, caches it, and marks cached data on outage', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let requests = 0;
  try {
    globalThis.fetch = async url => {
      requests++;
      assert.equal(url.hostname, 'dof.gob.mx');
      assert.equal(url.searchParams.get('cod_tipo_indicador'), '158');
      return { ok: true, text: async () => row(mexicoDate().split('-').reverse().join('-'), '17.9780') };
    };
    const rate = await getLatestOfficialRate();
    assert.equal(rate.rate, 17.978); assert.equal(rate.stale, false);
    await getLatestOfficialRate(); assert.equal(requests, 1);
    Date.now = () => originalNow() + 16 * 60 * 1000;
    globalThis.fetch = async () => { throw new Error('DOF offline'); };
    const stale = await getLatestOfficialRate();
    assert.equal(stale.rate, rate.rate); assert.equal(stale.date, rate.date);
    assert.equal(stale.checkedAt, rate.checkedAt); assert.equal(stale.stale, true);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});
