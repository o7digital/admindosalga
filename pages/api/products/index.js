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

  return {
    id: payload.id || `product-${Date.now()}`,
    siteId: payload.siteId || 'dosalga',
    sku: String(payload.sku || '').trim(),
    name: String(payload.name || '').trim(),
    supplier: String(payload.supplier || 'CJ').trim(),
    cjProductUrl: String(payload.cjProductUrl || '').trim(),
    quantityPlanned: Number(payload.quantityPlanned) || 0,
    cjCost: Number(payload.cjCost) || 0,
    cjCostCurrency: payload.cjCostCurrency || 'MXN',
    salePrice: Number(payload.salePrice) || 0,
    saleCurrency: payload.saleCurrency || 'MXN',
    shippingIncluded: Boolean(payload.shippingIncluded),
    shippingCost: Number(payload.shippingCost) || 0,
    shippingCurrency: payload.shippingCurrency || payload.saleCurrency || 'MXN',
    platformFeeRate: Number(payload.platformFeeRate) || 0,
    taxRate: Number(payload.taxRate) || 0,
    status: payload.status || 'review',
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

  return res.status(405).json({ message: 'Method not allowed' });
}
