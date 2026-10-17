export function pricingFallback(minimum, error) {
  const reason = error?.status === 402
    ? 'Hugging Face : crédits ou facturation à régulariser (HTTP 402).'
    : error?.message || 'Suggestion IA indisponible.';
  return {
    price: minimum, provider: 'calculation',
    reason: 'Prix calculé pour une marge cible de 35 %, après frais et taxes configurés, sur la variante la plus coûteuse.',
    providerError: reason,
  };
}

export function parseAiPrice(content, minimum) {
  const parsed = JSON.parse(String(content).replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
  const price = Number(parsed.price);
  if (!Number.isFinite(price) || price < minimum || price > 99999999.99 || typeof parsed.reason !== 'string') {
    throw new Error('Suggestion Hugging Face invalide.');
  }
  return { price: Math.ceil(price * 100) / 100, reason: parsed.reason.slice(0, 500), provider: 'huggingface' };
}
