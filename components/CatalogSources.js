const labels = { name: 'Nom', sku: 'SKU', image: 'Image', category: 'Catégorie', price: 'Prix boutique', currency: 'Devise boutique',
  costUsd: 'Coût catalogue CJ USD (indicatif)', status: 'Statut boutique', stock: 'Stock', stockStatus: 'Disponibilité' };

export default function CatalogSources({ product }) {
  const sources = Object.entries(product.catalogSources || {});
  if (!sources.length) return null;
  return <details className="catalog-source-details">
    <summary>{product.pendingSourceChanges ? '⚠ Modifications source à vérifier' : 'Dernières données source'}</summary>
    {sources.map(([source, snapshot]) => <div key={source}>
      <strong>{source === 'cj-my-products' ? 'CJ · My Products' : source.toUpperCase()}</strong>
      <small>{new Date(snapshot.receivedAt).toLocaleString()}</small>
      <dl>{Object.entries(snapshot.data).map(([key, value]) => <div key={key}>
        <dt>{labels[key] || key}{snapshot.changedFields?.includes(key) ? ' · modifié' : ''}</dt>
        <dd>{key === 'image' && /^https?:\/\//.test(value) ? <a href={value} target="_blank" rel="noreferrer">Voir l’image source</a> : value ?? 'Non confirmé'}</dd>
      </div>)}</dl>
    </div>)}
    {product.pendingSourceChanges && <p>Vérifiez ces données et les coûts/transport, puis republiez le prix pour valider cette mise à jour. Le prix déjà validé est conservé jusqu’à votre décision.</p>}
  </details>;
}
