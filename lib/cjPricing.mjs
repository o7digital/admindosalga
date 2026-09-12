import { calculateProductMargin } from './margins.js';

export const CJ_TARGET_MARGIN = 0.35;

export function suggestCjPrice(product, shippingIncluded) {
  const cost = Number(product.cjCostUsd ?? product.cjCost);
  const shipping = Number(product.shippingUsd ?? product.shippingCost);
  if (!Number.isFinite(cost) || cost <= 0) return null;
  // Imported zero freight is not a confirmed free shipping quote.
  if (shippingIncluded && (!Number.isFinite(shipping) || shipping <= 0)) return null;
  const fees = Number(product.platformFeeRate || 0);
  const taxes = Number(product.taxRate || 0);
  const denominator = 1 - CJ_TARGET_MARGIN - fees - taxes;
  if (!Number.isFinite(denominator) || denominator <= 0 || fees < 0 || taxes < 0) return null;
  const { landedCost } = calculateProductMargin({ ...product, shippingIncluded });
  return Math.ceil((landedCost / denominator) * 100 - 1e-8) / 100;
}

export function validateCjPriceProposal(input) {
  const price = input?.price;
  const min = input?.minDeliveryDays;
  const max = input?.maxDeliveryDays;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0.01 || price > 99999999.99) {
    throw new Error('Enter a price from 0.01 to 99,999,999.99.');
  }
  if (typeof input.shippingIncluded !== 'boolean') throw new Error('Specify whether shipping is included.');
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > 365) {
    throw new Error('Delivery estimates must be whole days from 1 to 365, with maximum ≥ minimum.');
  }
  if (!['USD', 'MXN'].includes(input.currency)) throw new Error('Currency must be USD or MXN.');
  return {
    price: Math.round((price + Number.EPSILON) * 100) / 100,
    currency: input.currency,
    shippingIncluded: input.shippingIncluded,
    minDeliveryDays: min,
    maxDeliveryDays: max,
    status: 'draft',
    savedAt: new Date().toISOString(),
  };
}
