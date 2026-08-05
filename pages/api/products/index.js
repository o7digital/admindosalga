import fs from 'fs/promises';
import path from 'path';

const dataFile = path.join(process.cwd(), 'data', 'products.json');

const readProducts = async () => {
  const raw = await fs.readFile(dataFile, 'utf8');
  return JSON.parse(raw);
};

const writeProducts = async (products) => {
  await fs.writeFile(dataFile, `${JSON.stringify(products, null, 2)}\n`);
};

const buildProduct = (payload) => {
  const now = new Date().toISOString();
  const siteId = payload.siteId || payload.store || 'dosalga-mexico';
  const saleCurrency = payload.saleCurrency || payload.currency || (siteId === 'dosalga-usa' ? 'USD' : 'MXN');

  return {
    id: payload.id || `product-${Date.now()}`,
    siteId,
    stores: Array.isArray(payload.stores) ? payload.stores : [siteId],
    sku: String(payload.sku || '').trim(),
    cjSku: String(payload.cjSku || payload.pid || payload.sku || '').trim(),
    pid: String(payload.pid || '').trim(),
    name: String(payload.name || '').trim(),
    brand: String(payload.brand || 'Dosalga').trim(),
    category: String(payload.category || 'General').trim(),
    imageUrl: String(payload.imageUrl || '').trim(),
    productUrl: String(payload.productUrl || '').trim(),
    supplier: String(payload.supplier || 'CJ').trim(),
    cjProductUrl: String(payload.cjProductUrl || '').trim(),
    quantityPlanned: Number(payload.quantityPlanned) || 0,
    stock: Number(payload.stock ?? payload.quantityPlanned) || 0,
    cjCost: Number(payload.cjCost) || 0,
    cjCostUsd: Number(payload.cjCostUsd ?? payload.cjCost) || 0,
    cjCostCurrency: payload.cjCostCurrency || saleCurrency,
    salePrice: Number(payload.salePrice) || 0,
    saleCurrency,
    exchangeRate: Number(payload.exchangeRate) || 17.49,
    shippingIncluded: Boolean(payload.shippingIncluded),
    shippingCost: Number(payload.shippingCost) || 0,
    shippingUsd: Number(payload.shippingUsd ?? payload.shippingCost) || 0,
    shippingCurrency: payload.shippingCurrency || saleCurrency,
    shippingOrigin: String(payload.shippingOrigin || payload.origin || 'CJ · China').trim(),
    shippingDestination: String(payload.shippingDestination || payload.destination || (siteId === 'dosalga-usa' ? 'USA' : 'México')).trim(),
    transportMethod: String(payload.transportMethod || 'CJPacket').trim(),
    minDeliveryDays: Number(payload.minDeliveryDays) || 7,
    maxDeliveryDays: Number(payload.maxDeliveryDays) || 14,
    platformFeeRate: Number(payload.platformFeeRate) || 0,
    taxRate: Number(payload.taxRate) || 0,
    status: payload.status || 'review',
    archived: Boolean(payload.archived),
    lastCjSyncAt: payload.lastCjSyncAt || null,
    cjChangeReport: Array.isArray(payload.cjChangeReport) ? payload.cjChangeReport : [],
    notes: String(payload.notes || ''),
    updatedAt: now,
    createdAt: payload.createdAt || now,
  };
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const products = await readProducts();
    return res.status(200).json({ products });
  }

  if (req.method === 'POST') {
    const products = await readProducts();
    const product = buildProduct(req.body || {});
    products.unshift(product);
    await writeProducts(products);
    return res.status(201).json({ product });
  }

  if (req.method === 'PUT') {
    const products = await readProducts();
    const incoming = buildProduct(req.body || {});
    const index = products.findIndex((product) => product.id === incoming.id);

    if (index === -1) {
      return res.status(404).json({ message: 'Product not found' });
    }

    products[index] = {
      ...products[index],
      ...incoming,
      createdAt: products[index].createdAt,
    };
    await writeProducts(products);
    return res.status(200).json({ product: products[index] });
  }

  if (req.method === 'DELETE') {
    const products = await readProducts();
    const { id } = req.query;
    const index = products.findIndex((product) => product.id === id);

    if (index === -1) {
      return res.status(404).json({ message: 'Product not found' });
    }

    products[index] = {
      ...products[index],
      archived: true,
      status: 'archived',
      updatedAt: new Date().toISOString(),
    };
    await writeProducts(products);
    return res.status(200).json({ product: products[index] });
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
