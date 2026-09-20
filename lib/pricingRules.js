import { isDatabaseConfigured, query } from '@/lib/db';

export const defaultPricingRules = [
  {
    storeCode: 'MX',
    categorySlug: 'caps',
    sourceCurrency: 'MXN',
    displayCurrency: 'MXN',
    priceMode: 'native',
    exchangeRate: 1,
    active: true,
    notes: 'CAPS: use the native WooCommerce MXN price; never multiply by USD/MXN.',
  },
];

const normalizeSlug = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const toRule = (row) => ({
  id: row.id,
  storeCode: row.store_code || row.storeCode,
  storeId: row.store_id || row.storeId,
  categorySlug: normalizeSlug(row.category_slug || row.categorySlug),
  sourceCurrency: row.source_currency || row.sourceCurrency,
  displayCurrency: row.display_currency || row.displayCurrency,
  priceMode: row.price_mode || row.priceMode || 'native',
  exchangeRate: Number(row.exchange_rate ?? row.exchangeRate ?? 1),
  active: row.active !== false,
  notes: row.notes || '',
});

export const pricingRuleForProduct = (product, rules = []) => {
  const categorySlug = normalizeSlug(product.categories?.[0]?.slug || product.categorySlug || product.category);
  const storeCode = product.storeCode || (product.siteId === 'dosalga-usa' ? 'US' : 'MX');
  return rules.find((rule) => rule.active !== false && rule.storeCode === storeCode && rule.categorySlug === categorySlug) || null;
};

export const getPricingRules = async () => {
  if (!isDatabaseConfigured()) return defaultPricingRules;
  try {
    const result = await query(`
      SELECT pr.*, s.code AS store_code
      FROM pricing_rules pr
      JOIN stores s ON s.id = pr.store_id
      ORDER BY s.code, pr.category_slug
    `);
    return result.rows.map(toRule);
  } catch (error) {
    if (!/pricing_rules|relation .* does not exist/i.test(error.message || '')) throw error;
    return defaultPricingRules;
  }
};

export const listPricingRules = getPricingRules;

const ensurePricingRulesTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS pricing_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      category_slug TEXT NOT NULL,
      source_currency CHAR(3) NOT NULL CHECK (source_currency IN ('MXN', 'USD')),
      display_currency CHAR(3) NOT NULL CHECK (display_currency IN ('MXN', 'USD')),
      price_mode TEXT NOT NULL DEFAULT 'native' CHECK (price_mode IN ('native', 'storefront', 'convert')),
      exchange_rate NUMERIC(20, 8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (store_id, category_slug)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS pricing_rules_store_category_idx ON pricing_rules (store_id, category_slug)');
};

export const upsertPricingRule = async (input) => {
  if (!isDatabaseConfigured()) throw new Error('DATABASE_URL is not configured. Pricing rules require Railway PostgreSQL.');
  await ensurePricingRulesTable();
  const storeCode = String(input.storeCode || '').toUpperCase();
  const categorySlug = normalizeSlug(input.categorySlug);
  const sourceCurrency = String(input.sourceCurrency || '').toUpperCase();
  const displayCurrency = String(input.displayCurrency || '').toUpperCase();
  const priceMode = String(input.priceMode || 'native');
  const exchangeRate = Number(input.exchangeRate);
  if (!['MX', 'US'].includes(storeCode)) throw new Error('A valid store is required.');
  if (!categorySlug) throw new Error('A category is required.');
  if (!['MXN', 'USD'].includes(sourceCurrency) || !['MXN', 'USD'].includes(displayCurrency)) throw new Error('A valid source and display currency are required.');
  if (!['native', 'storefront', 'convert'].includes(priceMode)) throw new Error('A valid price mode is required.');
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw new Error('The exchange rate must be greater than zero.');

  const result = await query(`
    INSERT INTO pricing_rules (
      store_id, category_slug, source_currency, display_currency, price_mode, exchange_rate, active, notes, updated_at
    )
    SELECT id, $2, $3, $4, $5, $6, $7, $8, NOW()
    FROM stores
    WHERE code = $1
    ON CONFLICT (store_id, category_slug) DO UPDATE SET
      source_currency = EXCLUDED.source_currency,
      display_currency = EXCLUDED.display_currency,
      price_mode = EXCLUDED.price_mode,
      exchange_rate = EXCLUDED.exchange_rate,
      active = EXCLUDED.active,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    RETURNING *, (SELECT code FROM stores WHERE id = pricing_rules.store_id) AS store_code
  `, [storeCode, categorySlug, sourceCurrency, displayCurrency, priceMode, exchangeRate, input.active !== false, String(input.notes || '').trim()]);
  if (!result.rowCount) throw new Error(`Store ${storeCode} is not configured in Railway.`);
  return toRule(result.rows[0]);
};
