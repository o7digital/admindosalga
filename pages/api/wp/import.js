import fs from 'fs/promises';
import path from 'path';
import { importWordPressStores } from '@/services/wordpressStores';

const dataFile = path.join(process.cwd(), 'data', 'products.json');

const readProducts = async () => JSON.parse(await fs.readFile(dataFile, 'utf8'));
const writeProducts = async (products) => fs.writeFile(dataFile, `${JSON.stringify(products, null, 2)}\n`);

const mergeImportedProducts = (currentProducts, importedProducts) => {
  const importedById = new Map(importedProducts.map((product) => [product.id, product]));
  const merged = currentProducts
    .filter((product) => !importedById.has(product.id))
    .filter((product) => !String(product.id || '').startsWith('wp-dosalga-'));

  return [...importedProducts, ...merged];
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const currentProducts = await readProducts();
    const result = await importWordPressStores();
    const products = mergeImportedProducts(currentProducts, result.products);

    await writeProducts(products);

    return res.status(200).json({
      importedAt: result.importedAt,
      reports: result.reports,
      importedCount: result.products.length,
      products,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'WordPress import failed' });
  }
}
