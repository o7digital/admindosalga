import { useState } from 'react';
import { calculateProductMargin, formatCurrency, formatPercent } from '@/lib/margins';
import { suggestCjPrice } from '@/lib/cjPricing.mjs';

export default function CjPriceCell({ product, onSaved, disabled }) {
  const saved = product.cjPriceProposal?.currency === product.saleCurrency ? product.cjPriceProposal : null;
  const [shippingIncluded, setShippingIncluded] = useState(saved?.shippingIncluded ?? product.shippingIncluded ?? true);
  const [price, setPrice] = useState(saved?.price ?? suggestCjPrice(product, shippingIncluded) ?? '');
  const [minDays, setMinDays] = useState(saved?.minDeliveryDays ?? product.minDeliveryDays ?? '');
  const [maxDays, setMaxDays] = useState(saved?.maxDeliveryDays ?? product.maxDeliveryDays ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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

  return <td className="cj-price-cell"><form onSubmit={save} aria-label={`Update price CJ for ${product.name}`}>
    <fieldset disabled={saving || disabled}>
      <label>Proposed price · {product.saleCurrency}<input aria-label={`Proposed price for ${product.name}`} type="number" min="0.01" max="99999999.99" step="0.01" required value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <label className="cj-shipping-choice"><input type="checkbox" checked={shippingIncluded} onChange={(event) => setShippingIncluded(event.target.checked)} />{shippingIncluded ? 'Shipping included' : 'Shipping charged separately'}</label>
      <div className="cj-eta"><label>ETA min · days<input aria-label={`Minimum delivery days for ${product.name}`} type="number" min="1" max="365" step="1" required value={minDays} onChange={(event) => setMinDays(event.target.value)} /></label><label>ETA max · days<input aria-label={`Maximum delivery days for ${product.name}`} type="number" min={Number(minDays) || 1} max="365" step="1" required value={maxDays} onChange={(event) => setMaxDays(event.target.value)} /></label></div>
      {suggestion !== null ? <button className="cj-suggestion" type="button" onClick={() => setPrice(suggestion)}>Use suggested {formatCurrency(suggestion, product.saleCurrency)}<small>35% margin target · configured fees / taxes</small></button> : <small className="cj-price-note">Add CJ cost{shippingIncluded ? ' and shipping cost' : ''} to calculate a suggestion. You can enter a price manually.</small>}
      {suggestion !== null && Number(price) > 0 && <small className={margin.marginRate < 0.35 ? 'separate' : 'included'}>Estimated margin: {formatPercent(margin.marginRate)}</small>}
      <button type="submit" className="cj-save" disabled={unchanged}>{saving ? 'Saving…' : unchanged ? 'Draft saved' : 'Save proposal'}</button>
    </fieldset>
    <small className="cj-price-note" role="status">{unchanged ? 'Saved in admin · not published to CJ or store' : 'Draft · confirm delivery estimates before saving'}</small>
    {saved && <small>Saved {new Date(saved.savedAt).toLocaleString()}</small>}
    {error && <p className="danger-text" role="alert">{error}</p>}
  </form></td>;
}
