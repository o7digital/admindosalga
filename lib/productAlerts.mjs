import { calculateProductMargin, formatCurrency } from './margins.js';

export function productAudit(product, now = Date.now()) {
  const margin = calculateProductMargin(product);
  const saleUsd = product.saleCurrency === 'USD' ? Number(product.salePrice) : Number(product.salePrice) / margin.exchangeRate;
  const costUsd = margin.cjCostUsd;
  const shippingUsd = Number(product.shippingUsd ?? product.shippingCost);
  const issues = [];
  const add = (code, severity, message, action) => issues.push({ code, severity, message, action });
  if (!(saleUsd > 0)) add('missing-price', 100, 'Prix de vente absent ou invalide', 'Vérifier le prix et la devise dans WooCommerce.');
  if (costUsd > 0 && saleUsd > 0 && saleUsd < costUsd) add('below-cj', 100,
    `Prix ${formatCurrency(saleUsd, 'USD')} inférieur au coût CJ ${formatCurrency(costUsd, 'USD')}`,
    'Vérifier la devise source et la variante CJ avant de corriger le prix.');
  else if (costUsd > 0 && margin.profit < 0) add('negative-margin', 95, 'Vente à perte après transport et frais', 'Recalculer le prix avec le transport et les frais.');
  if (costUsd > 0 && saleUsd / costUsd >= 5) add('large-gap', 90, 'Prix de vente ≥ 5 × le coût CJ : écart à vérifier', 'Contrôler la devise et la variante ; cet écart ne prouve pas une erreur.');
  if (!(costUsd > 0)) add('missing-cost', 80, 'Coût CJ absent', 'Synchroniser le coût de la variante CJ.');
  if (!(shippingUsd > 0)) add('missing-shipping', 75, 'Transport non renseigné / gratuité à confirmer', 'Obtenir un devis CJ pour la destination du marché.');
  if (costUsd > 0 && margin.profit >= 0 && margin.marginRate < 0.25) add('low-margin', 65, 'Marge estimée inférieure à 25 %', 'Revoir prix, transport et frais.');
  if (Number(product.stock) <= 10) add('low-stock', 60, 'Stock faible ou épuisé', 'Vérifier le stock CJ avant publication.');
  if (!product.pid && !product.cjSku) add('unlinked', 70, 'Produit non lié à CJ', 'Confirmer PID et SKU de variante.');
  if (!product.lastCjSyncAt || !Number.isFinite(Date.parse(product.lastCjSyncAt)) || now - Date.parse(product.lastCjSyncAt) > 7 * 86400000) add('stale-cj', 50, 'Données CJ non synchronisées depuis plus de 7 jours ou date absente', 'Actualiser les coûts, stocks et délais CJ.');
  if (Number(product.maxDeliveryDays) > 18) add('slow-shipping', 45, 'Délai de livraison supérieur à 18 jours', 'Vérifier une autre route logistique.');
  if (!(Number(product.minDeliveryDays) > 0) || Number(product.maxDeliveryDays) < Number(product.minDeliveryDays)) add('invalid-eta', 70, 'Délais absents ou incohérents', 'Confirmer les délais min/max pour cette destination.');
  if (product.cjChangeReport?.length) add('cj-changes', 55, 'Changements CJ à examiner', 'Revoir les changements du dernier sync.');
  issues.sort((a, b) => b.severity - a.severity);
  return { saleUsd, costUsd, shippingUsd: Number.isFinite(shippingUsd) ? shippingUsd : null, issues, priority: issues[0]?.severity || 0, critical: issues.some(i => i.severity >= 90) };
}

export function auditCatalogue(products) {
  return products.filter(p => !p.archived && p.status !== 'archived').map(product => ({
    id: product.id, sku: product.sku, name: product.name, siteId: product.siteId,
    salePrice: product.salePrice, currency: product.saleCurrency,
    shippingIncluded: product.shippingIncluded, ...productAudit(product),
  })).filter(p => p.issues.length).sort((a, b) => b.priority - a.priority || a.saleUsd / (a.costUsd || 1) - b.saleUsd / (b.costUsd || 1) || String(a.id).localeCompare(String(b.id)));
}

export function compareProductPriority(a, b) {
  const left = productAudit(a), right = productAudit(b);
  return right.priority - left.priority || left.saleUsd / (left.costUsd || 1) - right.saleUsd / (right.costUsd || 1) || String(a.id).localeCompare(String(b.id));
}
