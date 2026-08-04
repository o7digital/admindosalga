import fs from 'fs/promises';
import path from 'path';
import { syncCjProduct } from '@/services/cjdropshipping';

const dataFile = path.join(process.cwd(), 'data', 'products.json');

const readProducts = async () => JSON.parse(await fs.readFile(dataFile, 'utf8'));
const writeProducts = async (products) => fs.writeFile(dataFile, `${JSON.stringify(products, null, 2)}\n`);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const products = await readProducts();
    const { productId } = req.body || {};
    const targets = productId ? products.filter((product) => product.id === productId) : products.filter((product) => !product.archived);
    const reports = [];
    const nextProducts = [...products];

    for (const product of targets) {
      const result = await syncCjProduct(product);
      const index = nextProducts.findIndex((item) => item.id === product.id);
      nextProducts[index] = result.product;
      reports.push({ productId: product.id, changes: result.changes, mode: result.mode });
    }

    await writeProducts(nextProducts);
    return res.status(200).json({ syncedAt: new Date().toISOString(), reports, products: nextProducts });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'CJ sync failed' });
  }
}
