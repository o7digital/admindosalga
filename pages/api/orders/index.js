import { databaseIsAvailable, listProducts } from '@/lib/productRepository';
import { listWooOrders } from '@/services/woocommerce';

const number = (value) => Number(value) || 0;

const costInCurrency = (usd, currency, rate) => (
  currency === 'MXN' ? usd * rate : usd
);

const mapOrder = (order, market, products) => {
  const currency = order.currency || (market === 'MX' ? 'MXN' : 'USD');
  const items = (order.line_items || []).map((item) => {
    const sku = String(item.sku || '').trim();
    const product = products.find((candidate) => (
      [candidate.sku, candidate.cjSku, candidate.pid].filter(Boolean).map(String).includes(sku)
    ));
    const rate = number(product?.exchangeRate) || 17.49;
    const unitCostUsd = product ? number(product.cjCostUsd ?? product.cjCost) + number(product.shippingIncluded ? product.shippingUsd : 0) : 0;
    const estimatedCost = costInCurrency(unitCostUsd * number(item.quantity), currency, rate);
    const revenue = number(item.total) + number(item.total_tax);
    return {
      id: item.id,
      sku,
      name: item.name,
      quantity: number(item.quantity),
      revenue,
      estimatedCost,
      estimatedProfit: revenue - estimatedCost,
      linked: Boolean(product),
      cjSku: product?.cjSku || product?.pid || '',
    };
  });
  const estimatedCost = items.reduce((sum, item) => sum + item.estimatedCost, 0);
  const total = number(order.total);
  return {
    id: `${market}-${order.id}`,
    wooOrderId: order.id,
    market,
    currency,
    status: order.status,
    date: order.date_created_gmt || order.date_created,
    customer: [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(' ') || 'Guest',
    total,
    shipping: number(order.shipping_total),
    tax: number(order.total_tax),
    discount: number(order.discount_total),
    refund: Math.abs((order.refunds || []).reduce((sum, refund) => sum + number(refund.total), 0)),
    estimatedCost,
    estimatedProfit: total - estimatedCost,
    items,
    unmatchedItems: items.filter((item) => !item.linked).length,
  };
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  try {
    const products = databaseIsAvailable() ? await listProducts() : [];
    const results = await Promise.allSettled(['MX', 'US'].map(async (market) => ({
      market,
      orders: await listWooOrders(market),
    })));
    const errors = [];
    const orders = results.flatMap((result, index) => {
      if (result.status === 'rejected') {
        errors.push(`${index === 0 ? 'MX' : 'US'}: ${result.reason.message}`);
        return [];
      }
      return result.value.orders.map((order) => mapOrder(order, result.value.market, products));
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!orders.length && errors.length === 2) throw new Error(errors.join(' · '));
    return res.status(200).json({ orders, errors, source: 'woocommerce' });
  } catch (error) {
    return res.status(502).json({ message: error.message || 'WooCommerce orders could not be loaded.' });
  }
}
