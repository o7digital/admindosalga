import { useState } from 'react';
import { calculateProductMargin, formatCurrency, formatPercent } from '@/lib/margins';
import { suggestCjPrice } from '@/lib/cjPricing.mjs';

export default function CjPriceCell({ product, onSaved, onPublished, disabled }) {
  const saved = product.cjPriceProposal?.currency === product.saleCurrency ? product.cjPriceProposal : null;
  const [shippingIncluded, setShippingIncluded] = useState(saved?.shippingIncluded ?? product.shippingIncluded ?? true);
  const [price, setPrice] = useState(saved?.price ?? suggestCjPrice(product, shippingIncluded) ?? '');
  const [minDays, setMinDays] = useState(saved?.minDeliveryDays ?? product.minDeliveryDays ?? '');
  const [maxDays, setMaxDays] = useState(saved?.maxDeliveryDays ?? product.maxDeliveryDays ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);
  const [publication, setPublication] = useState(product.wooPricePublication || null);
  const suggestion = suggestCjPrice(product, shippingIncluded);
  const margin = calculateProductMargin({ ...product, salePrice: Number(price), shippingIncluded });
  const unchanged = saved && Number(price) === saved.price && shippingIncluded === saved.shippingIncluded
    && Number(minDays) === saved.minDeliveryDays && Number(maxDays) === saved.maxDeliveryDays;

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/cj/price-proposal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, price: Number(price), currency: product.saleCurrency,
          shippingIncluded, minDeliveryDays: Number(minDays), maxDeliveryDays: Number(maxDays) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Price proposal could not be saved.');
      onSaved(product.id, result.proposal);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const publish = async (confirm = false) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(confirm ? '/api/woocommerce/publish-price' : `/api/woocommerce/publish-price?productId=${encodeURIComponent(product.id)}`, confirm ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, savedAt: review.savedAt, confirmAllVariants: true }),
      } : {});
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'WooCommerce publication failed.');
      if (confirm) { setPublication(result.publication); setReview(null); onPublished?.(product.id, result.publication); }
      else setReview(result);
    } catch (failure) { setError(failure.message); setReview(null); }
    finally { setSaving(false); }
  };

  return <td className="cj-price-cell"><form onSubmit={save} aria-label={`Update WooCommerce price for ${product.name}`}>
    <fieldset disabled={saving || disabled}>
      <label>WooCommerce price · {product.saleCurrency}<input aria-label={`WooCommerce price for ${product.name}`} type="number" min="0.01" max="99999999.99" step="0.01" required value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <label className="cj-shipping-choice"><input type="checkbox" checked={shippingIncluded} onChange={(event) => setShippingIncluded(event.target.checked)} />{shippingIncluded ? 'Shipping included' : 'Shipping charged separately'}</label>
      <div className="cj-eta"><label>ETA min · days<input aria-label={`Minimum delivery days for ${product.name}`} type="number" min="1" max="365" step="1" required value={minDays} onChange={(event) => setMinDays(event.target.value)} /></label><label>ETA max · days<input aria-label={`Maximum delivery days for ${product.name}`} type="number" min={Number(minDays) || 1} max="365" step="1" required value={maxDays} onChange={(event) => setMaxDays(event.target.value)} /></label></div>
      {suggestion !== null ? <button className="cj-suggestion" type="button" onClick={() => setPrice(suggestion)}>Use suggested {formatCurrency(suggestion, product.saleCurrency)}<small>35% margin target · configured fees / taxes</small></button> : <small className="cj-price-note">Add CJ cost{shippingIncluded ? ' and shipping cost' : ''} to calculate a suggestion. You can enter a price manually.</small>}
      {suggestion !== null && Number(price) > 0 && <small className={margin.marginRate < 0.35 ? 'separate' : 'included'}>Estimated margin: {formatPercent(margin.marginRate)}</small>}
      <button type="submit" className="cj-save" disabled={unchanged}>{saving ? 'Saving…' : unchanged ? 'Draft saved' : 'Save price draft'}</button>
    </fieldset>
    <small className="cj-price-note" role="status">{unchanged ? (publication?.proposalSavedAt === saved.savedAt ? 'WooCommerce status below' : 'Saved in admin · ready for WooCommerce') : 'Draft · confirm delivery estimates before saving'}</small>
    {unchanged && <button className="cj-save" type="button" disabled={saving || disabled || publication?.proposalSavedAt === saved.savedAt || ['sending', 'unknown', 'woo_verified'].includes(publication?.state)} onClick={() => publish(false)}>Review & update WooCommerce</button>}
    {review && unchanged && <div className="cj-price-note"><strong>{review.store} · {formatCurrency(review.price, review.currency)}</strong><p>{review.message}</p><ul>{review.variants.map(v => <li key={v.id}>{v.sku || `#${v.id}`} · {v.title}</li>)}</ul><button type="button" className="cj-save" disabled={saving || disabled} onClick={() => publish(true)}>Confirm WooCommerce price for all {review.variants.length}</button><button type="button" disabled={saving} onClick={() => setReview(null)}>Cancel</button></div>}
    {publication && <p role="status" className="cj-price-note">{publication.message || 'WooCommerce publication in progress; do not resend.'}</p>}
    {saved && <small>Saved {new Date(saved.savedAt).toLocaleString()}</small>}
    {error && <p className="danger-text" role="alert">{error}</p>}
  </form></td>;
}
