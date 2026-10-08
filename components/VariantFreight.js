import { useState } from 'react';
import { variantFreightSummary } from '@/lib/variantFreight.mjs';
import { calculateProductMargin, formatCurrency, formatPercent } from '@/lib/margins';

export default function VariantFreight({ product, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const freight = product.variantFreight;
  const summary = variantFreightSummary(product);
  const methods = [...new Set(freight?.variants.flatMap(item => item.routes?.map(route => route.method) || []) || [])];
  const request = async (body) => {
    const response = await fetch('/api/cj/variant-freight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: product.id, ...body }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Devis indisponible');
    onUpdated(product.id, result.freight);
    return result.freight;
  };
  const sync = async () => {
    setBusy(true); setError(''); setProgress('Chargement des variantes…');
    try {
      const session = await request({ action: 'start' });
      for (const [index, variant] of session.variants.entries()) {
        setProgress(`${index + 1}/${session.variants.length}`);
        await request({ action: 'quote', vid: variant.vid, capturedAt: session.capturedAt });
      }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); setProgress(''); }
  };
  return <div className="variant-freight">
    {summary && <><strong>{summary.min === null ? 'Transport non confirmé' : `${formatCurrency(summary.min, 'USD')} – ${formatCurrency(summary.max, 'USD')}`}</strong><small className={summary.complete ? 'included' : 'danger-text'}>{summary.confirmed}/{summary.rows.length} variantes confirmées · {summary.complete ? 'Marge minimale calculée' : 'Marge provisoire : devis manquants'}</small><small>{freight.origin} → {freight.destination} · quantité 1 · {new Date(freight.capturedAt).toLocaleString()}</small></>}
    <button type="button" className="btn secondary" disabled={busy} onClick={sync}>{busy ? `Devis CJ ${progress}` : 'Transport par variante'}</button>
    {error && <small className="danger-text" role="alert">{error}</small>}
    {summary && <details open><summary>Détail par taille / couleur / SKU</summary><label>Méthode de livraison<select value={freight.method} disabled={busy} onChange={async event => {
      setBusy(true); setError('');
      try { await request({ action: 'method', method: event.target.value }); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
    }}>{!freight.method && <option value="">À confirmer</option>}{freight.method && !methods.includes(freight.method) && <option>{freight.method}</option>}{methods.map(method => <option key={method}>{method}</option>)}</select></label>
      {summary.rows.map(row => {
        const margin = row.confirmed ? calculateProductMargin({ ...product, variantFreight: null, cjCostUsd: row.cjCostUsd, shippingUsd: row.route.shippingCost }) : null;
        return <div className="variant-freight-row" key={row.vid}><strong>{row.name}</strong><small>{row.sku}</small><small>Coût CJ : {formatCurrency(row.cjCostUsd, 'USD')}</small>{row.confirmed ? <><small>Transport : {formatCurrency(row.route.shippingCost, 'USD')} · {row.route.minDeliveryDays}–{row.route.maxDeliveryDays} jours</small><small>Total CJ + transport : {formatCurrency(row.cjCostUsd + row.route.shippingCost, 'USD')}</small><small className={margin.profit < 0 ? 'danger-text' : ''}>Marge estimée : {formatPercent(margin.marginRate)} · {formatCurrency(margin.profit, margin.saleCurrency)}</small></> : <small className="danger-text">{row.error || 'Devis ou coût non confirmé pour cette méthode'}</small>}</div>;
      })}<small>Marges estimées au prix de vente produit affiché ; à vérifier si les prix WooCommerce varient par SKU.</small>
    </details>}
  </div>;
}
