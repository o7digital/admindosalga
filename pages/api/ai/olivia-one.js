import fs from 'fs/promises';
import path from 'path';
import { calculateProductMargin, formatCurrency, formatPercent } from '@/lib/margins';

const dataFile = path.join(process.cwd(), 'data', 'products.json');

const readProducts = async () => JSON.parse(await fs.readFile(dataFile, 'utf8'));

const marketFor = (product) => {
  if (product.stores?.length > 1 || product.siteId === 'both') return 'Both';
  return product.siteId === 'dosalga-usa' ? 'USA' : 'México';
};

const summarizeDashboard = (products) => {
  const active = products.filter((product) => !product.archived && product.status !== 'archived');
  const withMargins = active.map((product) => ({ product, margin: calculateProductMargin(product) }));
  const lowMargin = withMargins.filter((item) => item.margin.marginRate < 0.25);
  const negativeMargin = withMargins.filter((item) => item.margin.profit < 0);
  const lowStock = active.filter((product) => Number(product.stock) <= 10);
  const shippingAlerts = active.filter((product) => Number(product.shippingUsd) > 12 || Number(product.maxDeliveryDays) > 18);
  const cjChanges = active.reduce((sum, product) => sum + (product.cjChangeReport?.length || 0), 0);
  const linkedToCj = active.filter((product) => product.pid || product.cjSku).length;
  const averageMargin = withMargins.length
    ? withMargins.reduce((sum, item) => sum + item.margin.marginRate, 0) / withMargins.length
    : 0;
  const bestMargin = [...withMargins].sort((a, b) => b.margin.marginRate - a.margin.marginRate).slice(0, 5);
  const worstMargin = [...withMargins].sort((a, b) => a.margin.marginRate - b.margin.marginRate).slice(0, 5);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      products: active.length,
      usa: active.filter((product) => marketFor(product) === 'USA').length,
      mexico: active.filter((product) => marketFor(product) === 'México').length,
      both: active.filter((product) => marketFor(product) === 'Both').length,
      averageMargin: formatPercent(averageMargin),
      lowMargin: lowMargin.length,
      negativeMargin: negativeMargin.length,
      lowStock: lowStock.length,
      shippingAlerts: shippingAlerts.length,
      linkedToCj,
      unlinkedToCj: active.length - linkedToCj,
      cjChanges,
    },
    bestMargin: bestMargin.map(({ product, margin }) => ({
      name: product.name,
      store: marketFor(product),
      margin: formatPercent(margin.marginRate),
      profit: formatCurrency(margin.profit, margin.saleCurrency),
    })),
    worstMargin: worstMargin.map(({ product, margin }) => ({
      name: product.name,
      store: marketFor(product),
      margin: formatPercent(margin.marginRate),
      profit: formatCurrency(margin.profit, margin.saleCurrency),
    })),
    shippingAlerts: shippingAlerts.slice(0, 8).map((product) => ({
      name: product.name,
      route: `${product.shippingOrigin} to ${product.shippingDestination}`,
      shippingUsd: Number(product.shippingUsd) || 0,
      eta: `${product.minDeliveryDays}-${product.maxDeliveryDays} days`,
    })),
    growthModules: {
      sponsors: 'Mockup ready: sponsor, campaign, store, placement, dates, budget, creative, link, status.',
      socios: 'Mockup ready: partner workspace, assigned products, commission, orders, branding, restricted access.',
      reportingIa: 'Olivia One analyzes products, margins, shipping, CJ status, sponsors and socios readiness.',
    },
  };
};

const fallbackAnalysis = (summary) => ({
  title: 'Olivia One dashboard analysis',
  executiveSummary: `Catalogue actif: ${summary.totals.products} produits, marge moyenne ${summary.totals.averageMargin}, ${summary.totals.lowMargin} produits sous 25% de marge et ${summary.totals.shippingAlerts} alertes shipping.`,
  priorities: [
    summary.totals.negativeMargin ? `Corriger ${summary.totals.negativeMargin} produits en marge négative avant toute publicité.` : 'Aucune marge négative détectée dans le filtre actuel.',
    summary.totals.lowStock ? `Revoir le stock de ${summary.totals.lowStock} produits avant de les pousser en campagne.` : 'Le stock critique ne ressort pas comme risque principal.',
    summary.totals.unlinkedToCj ? `Lier ${summary.totals.unlinkedToCj} produits à CJ pour fiabiliser coûts, stock et shipping.` : 'La liaison CJ couvre le catalogue filtré.',
  ],
  recommendations: [
    'Utiliser les meilleurs produits en marge comme shortlist Sponsors.',
    'Créer les premiers Socios uniquement avec produits à marge positive et shipping stable.',
    'Historiser commandes, taux USD/MXN et snapshots de marge pour rendre les rapports IA fiables.',
  ],
});

const callHuggingFace = async (summary) => {
  const token = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_TOKEN;
  if (!token) return null;

  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.HUGGINGFACE_MODEL || 'Qwen/Qwen2.5-7B-Instruct-1M',
      messages: [
        {
          role: 'system',
          content: 'You are Olivia One, the Dosalga admin AI. Analyze commerce dashboards with direct operational recommendations. Respond in concise French JSON only.',
        },
        {
          role: 'user',
          content: `Analyse toutes les composantes du dashboard Dosalga: products, margins, shipping, CJ connection, sponsors, socios, reporting IA. Return JSON with title, executiveSummary, priorities array, recommendations array. Dashboard data: ${JSON.stringify(summary)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`Hugging Face returned ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  return content ? JSON.parse(content) : null;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const products = await readProducts();
    const summary = summarizeDashboard(products);
    let analysis = null;
    let mode = 'huggingface';

    try {
      analysis = await callHuggingFace(summary);
    } catch (error) {
      mode = 'fallback';
      analysis = fallbackAnalysis(summary);
    }

    if (!analysis) {
      mode = 'fallback';
      analysis = fallbackAnalysis(summary);
    }

    return res.status(200).json({
      assistant: 'Olivia One',
      analyzedAt: new Date().toISOString(),
      mode,
      summary,
      analysis,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Olivia One analysis failed' });
  }
}
