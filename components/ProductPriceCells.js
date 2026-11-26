import { cjCostSummary, parseCjPrice } from '@/lib/cjData.mjs';
import { formatCurrency } from '@/lib/margins';

export function RailwayPriceCell({ product }) {
  const hasPrice = Number(product.salePrice) > 0;
  return <td>
    <span className={`currency-pill ${product.currencyMismatch ? 'currency-mismatch' : ''}`}>{product.saleCurrency}</span>
    <strong className="railway-price-value">{hasPrice ? formatCurrency(product.salePrice, product.saleCurrency) : 'Prix à définir'}</strong>
    {hasPrice ? <>
      <small className="currency-source">Origine Railway : {formatCurrency(product.sourcePrice, product.sourceCurrency)}</small>
      <small className="currency-source">Final Railway : {formatCurrency(product.salePrice, product.saleCurrency)}</small>
      <small className={product.priceRegistry?.verified ? 'included' : 'danger-text'}>{product.priceRegistry?.verified ? '● Devise vérifiée par produit' : '⚠ Devise à vérifier'}</small>
    </> : <small>{product.catalogIntake?.needsWooListing ? 'Brouillon CJ · à lister dans WooCommerce' : 'Prix de vente non renseigné'}</small>}
    {product.priceImportRule === 'caps-native-mxn-v1' && <small className="currency-source native-price-rule">CAPS · prix natif MXN</small>}
    {product.currencyMismatch && <small className="danger-text">Expected {product.expectedStoreCurrency}</small>}
  </td>;
}

export function CjCostCell({ product }) {
  const cost = cjCostSummary(product);
  const indicative = parseCjPrice(product.cjCatalogCostUsd);
  return <td className="number">
    <strong>{cost ? cost.min === cost.max ? formatCurrency(cost.min, 'USD') : `${formatCurrency(cost.min, 'USD')} – ${formatCurrency(cost.max, 'USD')}` : 'Coût à confirmer'}</strong>
    {cost?.source === 'variants' && <small>Coûts CJ par variante · {cost.confirmed}/{cost.total} renseignées</small>}
    {!cost && indicative > 0 && <small>Catalogue CJ : {formatCurrency(indicative, 'USD')} · indicatif</small>}
    <small>Prix CJ d’origine : {product.cjOriginalCostUsd > 0 ? formatCurrency(product.cjOriginalCostUsd, product.cjOriginalCostCurrency || 'USD') : 'à importer'}</small>
    <small>{product.cjOriginalCostAt ? `Première capture : ${new Date(product.cjOriginalCostAt).toLocaleDateString()}` : product.cjSku || product.pid}</small>
  </td>;
}

export function SalePriceCell({ product, audit, publishedCurrent }) {
  const hasPrice = Number(product.salePrice) > 0;
  const publication = product.wooPricePublication;
  const verifiedPrice = publishedCurrent || (hasPrice && publication?.state === 'woo_verified'
    && Number(publication.price) === Number(product.salePrice) && publication.currency === product.saleCurrency);
  const draftPending = product.cjPriceProposal?.currency === product.saleCurrency
    && !(verifiedPrice && publication?.proposalSavedAt === product.cjPriceProposal.savedAt);
  return <td className="number">
    <small className="new-sale-label">{hasPrice ? 'Prix final' : 'Prix de vente'}</small>
    <strong className="new-sale-price">{hasPrice ? formatCurrency(product.salePrice, product.saleCurrency) : 'Prix à définir'}</strong>
    {verifiedPrice && <small className="included">✓ Prix publié dans WooCommerce</small>}
    {verifiedPrice && product.pendingSourceChanges && <small className="separate">Données source à revérifier</small>}
    {draftPending && <small className="separate">Brouillon : {formatCurrency(product.cjPriceProposal.price, product.cjPriceProposal.currency)} · non publié</small>}
    {publishedCurrent && <small className="old-sale-price">Old: {formatCurrency(product.wooPricePublication.previousPrice ?? product.previousSalePrice ?? product.sourcePrice, product.saleCurrency)}</small>}
    {hasPrice && product.saleCurrency === 'MXN' && <small className="usd-equivalent">≈ {formatCurrency(audit.saleUsd, 'USD')} · prix de vente</small>}
    {hasPrice && <small className="price-origin-railway">Prix d’origine Railway : {formatCurrency(product.sourcePrice, product.sourceCurrency)}</small>}
    <small className={product.shippingIncluded ? 'included' : 'separate'}>{product.shippingIncluded === true ? '● Shipping included in sale price' : product.shippingIncluded === false ? '○ Shipping charged separately' : 'Shipping inclusion unconfirmed'}</small>
  </td>;
}
