import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import babel from 'next/dist/compiled/babel/core.js';

const loadComponent = file => {
  const url = new URL(`../components/${file}.js`, import.meta.url);
  const { code } = babel.transformSync(fs.readFileSync(url, 'utf8'), {
    filename: url.pathname, presets: ['next/babel'], babelrc: false, configFile: false,
  });
  const module = { exports: {} };
  const require = createRequire(url);
  const resolve = specifier => require(specifier.startsWith('@/')
    ? fileURLToPath(new URL(`../${specifier.slice(2)}`, import.meta.url)) : specifier);
  new Function('require', 'module', 'exports', code)(resolve, module, module.exports);
  return module.exports;
};
const { CjCostCell, RailwayPriceCell, SalePriceCell } = loadComponent('ProductPriceCells');
const VariantFreight = loadComponent('VariantFreight').default;
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('catalogue renders saved shipping and CJ variant costs when the parent fields are zero', () => {
  const product = { cjCostUsd: 0, shippingUsd: 0, variantFreight: {
    origin: 'CN', destination: 'México', method: 'CJ', variants: [
      { cjCostUsd: 3.5, routes: [{ method: 'CJ', shippingCost: 5.75 }] },
      { cjCostUsd: 4, routes: [{ method: 'CJ', shippingCost: 6.7 }] },
    ],
  } };
  const cost = render(CjCostCell, { product });
  const shipping = render(VariantFreight, { product });
  assert.match(cost, /\$3\.50 USD – \$4\.00 USD/);
  assert.match(shipping, /\$5\.75 USD – \$6\.70 USD/);
  assert.match(shipping, /2\/2 variantes confirmées/);
  assert.doesNotMatch(cost + shipping, /\$0\.00/);
});

test('unlisted drafts show missing sale prices and indicative costs without presenting zero as a real price', () => {
  const product = { salePrice: 0, sourcePrice: 0, saleCurrency: 'MXN', cjCostUsd: 0,
    cjCatalogCostUsd: 4.5, catalogIntake: { needsWooListing: true } };
  const price = render(RailwayPriceCell, { product }) + render(SalePriceCell, { product, audit: { saleUsd: 0 } });
  assert.match(price, /Prix à définir/);
  assert.match(price, /à lister dans WooCommerce/);
  assert.doesNotMatch(price, /0\.00|Prix final|Devise à vérifier/);
  const cost = render(CjCostCell, { product });
  assert.match(cost, /Coût à confirmer/);
  assert.match(cost, /Catalogue CJ : \$4\.50 USD · indicatif/);
});

test('existing validated sale prices retain their amounts, currency and publication history', () => {
  const product = { salePrice: 650, sourcePrice: 650, saleCurrency: 'MXN', sourceCurrency: 'MXN',
    priceRegistry: { verified: true }, wooPricePublication: { previousPrice: 600 } };
  const registry = render(RailwayPriceCell, { product });
  const sale = render(SalePriceCell, { product, audit: { saleUsd: 33.56 }, publishedCurrent: true });
  assert.match(registry, /MX\$650\.00 MXN/);
  assert.match(registry, /Devise vérifiée par produit/);
  assert.match(sale, /Old: MX\$600\.00 MXN/);
  assert.match(sale, /\$33\.56 USD/);
});
