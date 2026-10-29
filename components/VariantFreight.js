import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { freightRouteAmounts, variantFreightSummary } from '@/lib/variantFreight.mjs';
import { calculateProductMargin, formatCurrency, formatPercent } from '@/lib/margins';

export default function VariantFreight({ product, onUpdated }) {
  const running = useRef(false);
  const dialog = useRef(null);
  const opener = useRef(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      opener.current?.focus({ preventScroll: true });
    };
  }, [open]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const freight = product.variantFreight;
  const summary = variantFreightSummary(product);
  const methods = [...new Set(freight?.variants?.flatMap(item => item.routes?.map(route => route.method) || []) || [])];
  const request = async (body, attempt = 0) => {
    const response = await fetch('/api/cj/variant-freight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: product.id, ...body }) });
    const result = await response.json();
    if (response.status === 429 && result.retryable && attempt < 2) {
      setProgress('CJ occupé · nouvelle tentative…');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return request(body, attempt + 1);
    }
    if (!response.ok) {
      if (result.code === 'CJ_ACCESS_DISABLED') setActionUrl('https://www.cjdropshipping.com/my.html#/authorize/APIStores');
      throw new Error(result.message || 'Devis indisponible');
    }
    onUpdated(product.id, result.freight);
    return result.freight;
  };
  const sync = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError(''); setActionUrl(''); setProgress('Chargement des variantes…');
    try {
      const incomplete = freight?.variants?.some(variant => !variant.quotedAt);
      const session = incomplete ? freight : await request({ action: 'start' });
      const pending = session.variants.filter(variant => !variant.quotedAt);
      for (const [index, variant] of pending.entries()) {
        setProgress(`${index + 1}/${pending.length}`);
        await request({ action: 'quote', vid: variant.vid, capturedAt: session.capturedAt });
      }
    } catch (failure) { setError(failure.message); }
    finally { running.current = false; setBusy(false); setProgress(''); }
  };
  const syncLabel = busy ? `Devis CJ ${progress}` : freight?.variants?.some(variant => !variant.quotedAt) ? 'Reprendre les devis CJ' : summary ? 'Actualiser les devis CJ' : 'Charger les devis CJ';
  const changeMethod = async (method, vid) => {
    setBusy(true); setError('');
    try { await request({ action: 'method', method, ...(vid ? { vid } : {}), capturedAt: freight.capturedAt }); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const feedback = <>{error && <p className="danger-text" role="alert">{error}</p>}{actionUrl && <a href={actionUrl} target="_blank" rel="noreferrer">Réactiver l’accès API dans CJ ↗</a>}</>;
  return <div className="variant-freight">
    {summary && <><strong>{summary.min === null ? 'Transport non confirmé' : `${formatCurrency(summary.min, 'USD')} – ${formatCurrency(summary.max, 'USD')}`}</strong><small>{freight.origin} → {freight.destination} · quantité 1 par SKU</small><small className={summary.complete ? 'included' : 'danger-text'}>{summary.confirmed}/{summary.rows.length} variantes confirmées</small></>}
    <button ref={opener} type="button" className="btn secondary" onClick={() => { setOpen(true); if (!freight && !running.current) sync(); }}>Transport par variante{busy ? ` · ${progress}` : summary ? ' · Voir les détails' : ''}</button>
    {!open && error && <small className="danger-text">{error}</small>}
    {open && createPortal(<dialog ref={dialog} className="freight-modal" aria-labelledby={titleId} onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <header className="freight-modal-head"><div><h2 id={titleId}>Transport par variante</h2><p>{product.name}</p></div><button type="button" className="freight-close" aria-label="Fermer les détails de transport" onClick={() => setOpen(false)}>×</button></header>
      <div className="freight-modal-toolbar">
        <label>Méthode par défaut · toutes les variantes<select value={freight?.method || ''} disabled={busy || !methods.length} onChange={event => changeMethod(event.target.value)}>{!freight?.method && <option value="">À confirmer</option>}{freight?.method && !methods.includes(freight.method) && <option>{freight.method}</option>}{methods.map(method => <option key={method}>{method}</option>)}</select></label>
        <button type="button" className="btn secondary" disabled={busy} onClick={sync}>{syncLabel}</button>
        <button type="button" className="btn secondary" disabled={!summary} aria-pressed={compare} onClick={() => setCompare(value => !value)}>{compare ? 'Voir la méthode sélectionnée' : 'Comparer toutes les méthodes'}</button>
      </div>
      <div className="freight-modal-status" role="status">{freight ? <><strong>Chine → {freight.destination} · quantité 1 par sous-produit</strong><span>{summary?.confirmed || 0}/{freight.variants.length} variantes confirmées</span><span>FX de la fiche : 1 USD = {summary?.rows[0]?.exchangeRate ?? '—'} MXN</span><span>Devis du {new Date(freight.capturedAt).toLocaleString()}</span></> : <span>Chargement des variantes…</span>}</div>
      {freight && <p className="freight-destination-note">Pour comparer avec CJ, utilisez la même destination ({freight.destination}), le même SKU et la même méthode de livraison. Chaque ligne utilise son propre devis de transport.</p>}
      {error && <div className="freight-modal-feedback">{feedback}</div>}
      <div className="freight-modal-scroll">
        {summary ? <table className="freight-detail-table"><thead><tr><th>Sous-produit</th><th>SKU</th><th>Méthode CJ</th><th>Coût CJ · USD</th><th>Shipping COST · USD</th><th className="freight-fx-column">FX Shipping COST · MXN</th><th>Frais CJ · USD</th><th>Total · USD</th><th>Total · MXN</th><th>Délai · jours</th><th>Marge estimée</th></tr></thead><tbody>
          {summary.rows.flatMap(row => {
            const routes = compare ? row.routes?.length ? row.routes : [null] : [row.route];
            return routes.map((route, index) => {
              const amounts = freightRouteAmounts(product, row, route);
              const margin = amounts.confirmed && (product.saleCurrency === 'USD' || amounts.exchangeRate) ? calculateProductMargin({ ...product, variantFreight: null, cjCostUsd: row.cjCostUsd, shippingUsd: amounts.totalShippingUsd }) : null;
              const selectedMethod = row.shippingMethod || freight.method;
              return <tr key={`${row.vid}-${index}`}>
                <td>{row.name}</td><td>{row.sku}</td>
                <td>{compare ? <>{route?.method || '—'}{route?.method === selectedMethod && <small className="included">Méthode sélectionnée</small>}</> : <select aria-label={`Méthode CJ pour ${row.sku}`} value={selectedMethod || ''} disabled={busy || !row.routes?.length} onChange={event => changeMethod(event.target.value, row.vid)}>
                  {!row.routes?.some(item => item.method === selectedMethod) && <option value={selectedMethod || ''}>{selectedMethod || 'À confirmer'} · sans devis</option>}
                  {row.routes?.map(item => <option key={item.method} value={item.method}>{item.method}</option>)}
                </select>}{row.shippingMethod && <small>Choix propre à ce SKU</small>}</td>
                <td>{row.cjCostUsd > 0 ? formatCurrency(row.cjCostUsd, 'USD') : 'À confirmer'}</td>
                {amounts.confirmed ? <>
                  <td>{formatCurrency(amounts.shippingUsd, 'USD')}{!route.costBreakdown && <small>Total postal historique<br />Actualiser pour séparer les frais</small>}</td>
                  <td className="freight-fx-column">{amounts.shippingMxn !== null ? <><strong>{formatCurrency(amounts.shippingMxn, 'MXN')}</strong><small>{formatCurrency(amounts.shippingUsd, 'USD')} × {amounts.exchangeRate}</small><small>1 USD = {amounts.exchangeRate} MXN</small></> : <span className="danger-text">Taux FX à confirmer</span>}</td>
                  <td>{route.costBreakdown ? formatCurrency(amounts.feesUsd, 'USD') : 'Inclus · non détaillés'}</td>
                  <td>{formatCurrency(amounts.totalUsd, 'USD')}</td><td>{amounts.totalMxn !== null ? formatCurrency(amounts.totalMxn, 'MXN') : 'Taux FX à confirmer'}</td>
                  <td>{route.minDeliveryDays > 0 && route.maxDeliveryDays >= route.minDeliveryDays ? `${route.minDeliveryDays}–${route.maxDeliveryDays}` : 'À confirmer'}</td>
                  <td className={margin?.profit < 0 ? 'danger-text' : ''}>{margin ? <>{formatPercent(margin.marginRate)}<small>{formatCurrency(margin.profit, margin.saleCurrency)}</small></> : 'Taux FX à confirmer'}</td>
                </> : <td colSpan={7} className="danger-text">{row.error || 'Devis ou coût non confirmé pour cette méthode'}</td>}
              </tr>;
            });
          })}
        </tbody></table> : <p className="freight-modal-empty">Les variantes et leurs tarifs apparaîtront ici.</p>}
      </div>
      <footer className="freight-modal-footer">FX Shipping COST = transport USD de chaque SKU × taux USD/MXN de la fiche. Total = coût du sous-produit CJ + transport + frais CJ éventuels. Marges estimées au prix de vente produit affiché, avec les frais et taxes configurés.</footer>
    </dialog>, document.body)}
  </div>;
}
