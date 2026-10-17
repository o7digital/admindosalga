import { useEffect, useRef, useState } from 'react';
import { calculateProductMargin, formatCurrency, formatPercent } from '@/lib/margins';
import { suggestCjPrice } from '@/lib/cjPricing.mjs';
import { freightDeliveryRange } from '@/lib/variantFreight.mjs';

export default function CjPriceCell({ product, onSaved, onPublished, disabled }) {
  const saved = product.cjPriceProposal?.currency === product.saleCurrency ? product.cjPriceProposal : null;
  const delivery = freightDeliveryRange(product);
  const [shippingIncluded, setShippingIncluded] = useState(saved?.shippingIncluded ?? product.shippingIncluded ?? true);
  const [price, setPrice] = useState(saved?.price ?? suggestCjPrice(product, shippingIncluded) ?? '');
  const [minDays, setMinDays] = useState(saved?.minDeliveryDays ?? delivery?.min ?? product.minDeliveryDays ?? '');
  const [maxDays, setMaxDays] = useState(saved?.maxDeliveryDays ?? delivery?.max ?? product.maxDeliveryDays ?? '');
  const touched = useRef(false);
  const etaTouched = useRef(false);
  const [ai, setAi] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [publication, setPublication] = useState(product.wooPricePublication || null);
  useEffect(() => { setPublication(product.wooPricePublication || null); }, [product.wooPricePublication]);
  const suggestion = suggestCjPrice(product, shippingIncluded);
  const margin = calculateProductMargin({ ...product, salePrice: Number(price), shippingIncluded });
  const unchanged = saved && Number(price) === saved.price && shippingIncluded === saved.shippingIncluded
    && Number(minDays) === saved.minDeliveryDays && Number(maxDays) === saved.maxDeliveryDays;
  const publishedCurrent = unchanged && publication?.state === 'woo_verified' && publication?.proposalSavedAt === saved?.savedAt;
  const publicationBlocked = ['sending', 'unknown'].includes(publication?.state);

  useEffect(() => {
    if (!touched.current && !saved && suggestion !== null) setPrice(suggestion);
  }, [suggestion, saved]);
  useEffect(() => {
    if (!etaTouched.current && !saved && delivery) { setMinDays(delivery.min); setMaxDays(delivery.max); }
  }, [delivery?.min, delivery?.max, saved]);

  const suggestAi = async () => {
    setSuggesting(true); setError('');
    try {
      const response = await fetch('/api/ai/price-suggestion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, shippingIncluded }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Suggestion indisponible.');
      touched.current = true; setPrice(result.price); setAi(result);
    } catch (failure) { setError(failure.message); }
    finally { setSuggesting(false); }
  };

  const persistDraft = async () => {
    if (unchanged) return saved;
    const response = await fetch('/api/cj/price-proposal', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: product.id, price: Number(price), currency: product.saleCurrency,
        shippingIncluded, minDeliveryDays: Number(minDays), maxDeliveryDays: Number(maxDays) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Enregistrement impossible.');
    onSaved(product.id, result.proposal);
    return result.proposal;
  };
  const publishDraft = async proposal => {
    const response = await fetch('/api/woocommerce/publish-price', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: product.id, savedAt: proposal.savedAt, confirmAllVariants: true }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Publication WooCommerce impossible. Le brouillon reste enregistré.');
    setPublication(result.publication);
    onPublished?.(product.id, result.publication);
  };
  const save = async event => {
    event.preventDefault();
    const publish = event.nativeEvent.submitter?.value === 'publish';
    setSaving(true); setError('');
    try {
      const proposal = await persistDraft();
      if (publish) await publishDraft(proposal);
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  };

  return <td className="cj-price-cell"><form onSubmit={save} aria-label={`Update WooCommerce price for ${product.name}`}>
    <fieldset disabled={saving || suggesting || disabled}>
      <label>Prix WooCommerce · {product.saleCurrency}<input aria-label={`WooCommerce price for ${product.name}`} type="number" min="0.01" max="99999999.99" step="0.01" required value={price} onChange={event => { touched.current = true; setAi(null); setPrice(event.target.value); }} /></label>
      <label className="cj-shipping-choice"><input type="checkbox" checked={shippingIncluded} onChange={event => { touched.current = true; setAi(null); setShippingIncluded(event.target.checked); }} />{shippingIncluded ? 'Transport inclus' : 'Transport facturé séparément'}</label>
      <div className="cj-eta"><label>Délai min · jours<input aria-label={`Minimum delivery days for ${product.name}`} type="number" min="1" max="365" step="1" required value={minDays} onChange={event => { etaTouched.current = true; setMinDays(event.target.value); }} /></label><label>Délai max · jours<input aria-label={`Maximum delivery days for ${product.name}`} type="number" min={Number(minDays) || 1} max="365" step="1" required value={maxDays} onChange={event => { etaTouched.current = true; setMaxDays(event.target.value); }} /></label></div>
      {delivery && <button type="button" className="cj-suggestion" onClick={() => { etaTouched.current = true; setMinDays(delivery.min); setMaxDays(delivery.max); }}>Utiliser les délais CJ : {delivery.min}–{delivery.max} jours<small>Méthode : {product.variantFreight.method}</small></button>}
      {suggestion !== null ? <button className="cj-suggestion" type="button" onClick={() => { touched.current = true; setAi(null); setPrice(suggestion); }}>Prix calculé : {formatCurrency(suggestion, product.saleCurrency)}<small>Marge cible 35 % · frais et taxes configurés · variante la plus coûteuse</small></button> : <small className="cj-price-note">Complétez les coûts CJ et les devis par variante pour suggérer un prix. La saisie manuelle reste disponible.</small>}
      {suggestion !== null && Number(price) > 0 && <small className={margin.marginRate < 0.35 ? 'separate' : 'included'}>Marge estimée : {formatPercent(margin.marginRate)}</small>}
      <button type="button" className="cj-suggestion" disabled={suggestion === null} onClick={suggestAi}>Suggérer et remplir avec l’IA</button>
      {suggesting && <small role="status">Hugging Face…</small>}
      {ai && <small role="status">{ai.provider === 'huggingface' ? 'Hugging Face' : 'Calcul de secours · sans IA'} · {ai.reason} · FX {ai.exchangeRate} ({ai.fxDate}){ai.providerError && <span> {ai.providerError}</span>}</small>}
      <button type="submit" value="draft" className="cj-save" disabled={unchanged}>{saving ? 'Enregistrement…' : unchanged ? 'Brouillon enregistré' : 'Enregistrer le brouillon'}</button>
      {!publishedCurrent && <button type="submit" value="publish" className="cj-save" disabled={publicationBlocked}>{saving ? 'Publication…' : unchanged ? 'Publier ce prix dans WooCommerce' : 'Enregistrer et publier dans WooCommerce'}</button>}
    </fieldset>
    <small className="cj-price-note" role="status">{unchanged ? (publishedCurrent ? 'Prix confirmé ci-dessous' : 'Brouillon enregistré · publication WooCommerce requise') : 'Prix saisi non publié · vérifiez les délais puis enregistrez ou publiez'}</small>
    {publishedCurrent && <p role="status" className="woo-confirmation">✓ Confirmé dans WooCommerce : {formatCurrency(publication.price, publication.currency)}</p>}
    {publication && !publishedCurrent && publication.state !== 'woo_verified' && <p role="status" className="cj-price-note">{publication.message || 'Publication en cours ; ne renvoyez pas le prix.'}</p>}
    {saved && <small>Enregistré le {new Date(saved.savedAt).toLocaleString()}</small>}
    {error && <p className="cj-price-error" role="alert"><strong>Échec de l’action</strong><span>{error}</span></p>}
  </form></td>;
}
