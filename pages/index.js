import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { calculateProductMargin, convertCurrency, formatCurrency, formatPercent } from '@/lib/margins';
import { sites } from '@/lib/sites';

const blankProduct = {
  siteId: 'dosalga-mexico',
  sku: '',
  name: '',
  supplier: 'CJ',
  cjProductUrl: '',
  quantityPlanned: 0,
  cjCost: 0,
  cjCostCurrency: 'MXN',
  salePrice: 0,
  saleCurrency: 'MXN',
  shippingIncluded: true,
  shippingCost: 0,
  shippingCurrency: 'MXN',
  platformFeeRate: 0.035,
  taxRate: 0,
  status: 'review',
  notes: '',
};

const statusLabels = {
  review: 'A reviser',
  approved: 'Approuve',
  ordered: 'Commande CJ',
  paused: 'Pause',
};

export default function ProductAdmin() {
  const [products, setProducts] = useState([]);
  const [selectedSite, setSelectedSite] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [editingProduct, setEditingProduct] = useState(blankProduct);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const loadProducts = async () => {
    const response = await fetch('/api/products');
    const result = await response.json();
    setProducts(result.products || []);
  };

  useEffect(() => {
    loadProducts().catch((loadError) => {
      setError(loadError.message || 'Impossible de charger les produits.');
    });
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSite = selectedSite === 'all' || product.siteId === selectedSite;
      const matchesStatus = selectedStatus === 'all' || product.status === selectedStatus;
      const matchesQuery = !normalizedQuery
        || [product.name, product.sku, product.supplier].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery);

      return matchesSite && matchesStatus && matchesQuery;
    });
  }, [products, query, selectedSite, selectedStatus]);

  const summary = useMemo(() => {
    return filteredProducts.reduce((totals, product) => {
      const margin = calculateProductMargin(product);
      const revenueMXN = convertCurrency(margin.salePrice, margin.saleCurrency, 'MXN');
      const costMXN = convertCurrency(margin.totalCost, margin.saleCurrency, 'MXN');
      const profitMXN = convertCurrency(margin.profit, margin.saleCurrency, 'MXN');

      return {
        products: totals.products + 1,
        revenue: totals.revenue + revenueMXN,
        cost: totals.cost + costMXN,
        profit: totals.profit + profitMXN,
      };
    }, {
      products: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    });
  }, [filteredProducts]);

  const averageMargin = summary.revenue > 0 ? summary.profit / summary.revenue : 0;

  const updateField = (field, value) => {
    setEditingProduct((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const editProduct = (product) => {
    setEditingProduct({
      ...blankProduct,
      ...product,
      shippingIncluded: Boolean(product.shippingIncluded),
    });
  };

  const resetForm = () => {
    setEditingProduct({
      ...blankProduct,
      siteId: selectedSite === 'all' ? 'dosalga-mexico' : selectedSite,
    });
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      const response = await fetch('/api/products', {
        method: editingProduct.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingProduct),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Sauvegarde impossible.');
      }

      await loadProducts();
      resetForm();
    } catch (saveError) {
      setError(saveError.message || 'Sauvegarde impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const currentMargin = calculateProductMargin(editingProduct);

  return (
    <>
      <Head>
        <title>Dosalga Admin Demo</title>
        <meta name="description" content="Demo admin Dosalga pour comparer stores Mexico et USA, cout CJ, shipping et marge." />
      </Head>

      <main className="admin-shell">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark">D</div>
            <div>
              <p className="eyebrow">O7 Product Ops</p>
              <h1>Dosalga Admin</h1>
            </div>
          </div>

          <nav>
            {sites.map((site) => (
              <button
                key={site.id}
                className={selectedSite === site.id ? 'active' : ''}
                type="button"
                onClick={() => setSelectedSite(site.id)}
              >
                {site.name}
              </button>
            ))}
            <button
              className={selectedSite === 'all' ? 'active' : ''}
              type="button"
              onClick={() => setSelectedSite('all')}
            >
              Tous les sites
            </button>
          </nav>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div>
              <p className="eyebrow">Demo client · sans backend payant</p>
              <h2>Mexico vs USA: achats CJ, shipping et marge nette</h2>
            </div>
            <button type="button" className="primary" onClick={resetForm}>Nouveau produit</button>
          </header>

          {error && <div className="alert">{error}</div>}

          <section className="pitch-strip">
            <article>
              <strong>Le probleme</strong>
              <span>CJ melange les devises, WooCommerce affiche un prix, mais personne ne voit la vraie marge avant achat.</span>
            </article>
            <article>
              <strong>La solution</strong>
              <span>Un admin simple: cout CJ, devise, shipping inclus ou non, prix de vente et marge immediate.</span>
            </article>
            <article>
              <strong>Prix pilote</strong>
              <span>Demo gratuite maintenant. Minimum pour le setup reel: 1,500 MXN.</span>
            </article>
          </section>

          <section className="store-grid">
            {sites.map((site) => {
              const siteProducts = products.filter((product) => product.siteId === site.id);
              const siteSummary = siteProducts.reduce((totals, product) => {
                const margin = calculateProductMargin(product);
                const revenueMXN = convertCurrency(margin.salePrice, margin.saleCurrency, 'MXN');
                const profitMXN = convertCurrency(margin.profit, margin.saleCurrency, 'MXN');
                return {
                  revenue: totals.revenue + revenueMXN,
                  profit: totals.profit + profitMXN,
                };
              }, { revenue: 0, profit: 0 });
              const siteMargin = siteSummary.revenue > 0 ? siteSummary.profit / siteSummary.revenue : 0;

              return (
                <button
                  key={site.id}
                  type="button"
                  className={`store-card ${selectedSite === site.id ? 'active' : ''}`}
                  onClick={() => setSelectedSite(site.id)}
                >
                  <span>{site.market}</span>
                  <strong>{site.name}</strong>
                  <small>{site.domain} · {site.defaultSaleCurrency} · {site.status}</small>
                  <b className={siteMargin < 0.25 ? 'danger' : 'success'}>{formatPercent(siteMargin)} marge demo</b>
                </button>
              );
            })}
          </section>

          <section className="metrics">
            <article>
              <span>Produits</span>
              <strong>{summary.products}</strong>
            </article>
            <article>
              <span>Ventes estimees</span>
              <strong>{formatCurrency(summary.revenue, 'MXN')}</strong>
            </article>
            <article>
              <span>Couts totaux</span>
              <strong>{formatCurrency(summary.cost, 'MXN')}</strong>
            </article>
            <article>
              <span>Marge moyenne</span>
              <strong className={averageMargin < 0.25 ? 'danger' : 'success'}>{formatPercent(averageMargin)}</strong>
            </article>
          </section>

          <section className="content-grid">
            <div className="product-panel">
              <div className="panel-toolbar">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Chercher SKU, nom, fournisseur"
                />
                <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
                  <option value="all">Tous les statuts</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Store</th>
                      <th>Produit</th>
                      <th>Cout CJ</th>
                      <th>Shipping</th>
                      <th>Prix vente</th>
                      <th>Marge</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => {
                      const margin = calculateProductMargin(product);
                      return (
                        <tr key={product.id} onClick={() => editProduct(product)}>
                          <td>
                            <strong>{sites.find((site) => site.id === product.siteId)?.market || product.siteId}</strong>
                            <span>{sites.find((site) => site.id === product.siteId)?.domain || ''}</span>
                          </td>
                          <td>
                            <strong>{product.name}</strong>
                            <span>{product.sku || 'Sans SKU'} · {product.supplier}</span>
                          </td>
                          <td>
                            {formatCurrency(product.cjCost, product.cjCostCurrency)}
                            <small>{product.cjCostCurrency === 'MXN' ? 'CJ en MXN, pas de conversion' : 'CJ en USD'}</small>
                          </td>
                          <td>
                            {product.shippingIncluded ? 'Inclus' : formatCurrency(product.shippingCost, product.shippingCurrency || product.saleCurrency)}
                          </td>
                          <td>{formatCurrency(product.salePrice, product.saleCurrency)}</td>
                          <td>
                            <b className={margin.marginRate < 0.25 ? 'danger' : 'success'}>
                              {formatPercent(margin.marginRate)}
                            </b>
                            <small>{formatCurrency(margin.profit, margin.saleCurrency)} profit</small>
                          </td>
                          <td><span className={`status ${product.status}`}>{statusLabels[product.status] || product.status}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <form className="editor" onSubmit={saveProduct}>
              <div>
                <p className="eyebrow">{editingProduct.id ? 'Edition produit' : 'Nouveau produit'}</p>
                <h3>{editingProduct.name || 'Produit CJ'}</h3>
              </div>

              <label>
                Site
                <select value={editingProduct.siteId} onChange={(event) => updateField('siteId', event.target.value)}>
                  {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
              </label>

              <label>
                Nom produit
                <input value={editingProduct.name} onChange={(event) => updateField('name', event.target.value)} required />
              </label>

              <div className="two-cols">
                <label>
                  SKU
                  <input value={editingProduct.sku} onChange={(event) => updateField('sku', event.target.value)} />
                </label>
                <label>
                  Statut
                  <select value={editingProduct.status} onChange={(event) => updateField('status', event.target.value)}>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="two-cols">
                <label>
                  Cout CJ
                  <input type="number" step="0.01" value={editingProduct.cjCost} onChange={(event) => updateField('cjCost', event.target.value)} />
                </label>
                <label>
                  Devise CJ
                  <select value={editingProduct.cjCostCurrency} onChange={(event) => updateField('cjCostCurrency', event.target.value)}>
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
              </div>

              <label className="toggle">
                <input
                  type="checkbox"
                  checked={editingProduct.shippingIncluded}
                  onChange={(event) => updateField('shippingIncluded', event.target.checked)}
                />
                Shipping inclus dans le cout CJ
              </label>

              {!editingProduct.shippingIncluded && (
                <div className="two-cols">
                  <label>
                    Cout shipping
                    <input type="number" step="0.01" value={editingProduct.shippingCost} onChange={(event) => updateField('shippingCost', event.target.value)} />
                  </label>
                  <label>
                    Devise shipping
                    <select value={editingProduct.shippingCurrency || editingProduct.saleCurrency} onChange={(event) => updateField('shippingCurrency', event.target.value)}>
                      <option value="MXN">MXN</option>
                      <option value="USD">USD</option>
                    </select>
                  </label>
                </div>
              )}

              <div className="two-cols">
                <label>
                  Prix de vente
                  <input type="number" step="0.01" value={editingProduct.salePrice} onChange={(event) => updateField('salePrice', event.target.value)} />
                </label>
                <label>
                  Devise vente
                  <select value={editingProduct.saleCurrency} onChange={(event) => updateField('saleCurrency', event.target.value)}>
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
              </div>

              <div className="two-cols">
                <label>
                  Frais plateforme
                  <input type="number" step="0.001" value={editingProduct.platformFeeRate} onChange={(event) => updateField('platformFeeRate', event.target.value)} />
                </label>
                <label>
                  Taxe estimee
                  <input type="number" step="0.001" value={editingProduct.taxRate} onChange={(event) => updateField('taxRate', event.target.value)} />
                </label>
              </div>

              <label>
                Lien CJ
                <input value={editingProduct.cjProductUrl} onChange={(event) => updateField('cjProductUrl', event.target.value)} />
              </label>

              <label>
                Notes
                <textarea rows="4" value={editingProduct.notes} onChange={(event) => updateField('notes', event.target.value)} />
              </label>

              <div className="margin-preview">
                <span>Cout total: {formatCurrency(currentMargin.totalCost, currentMargin.saleCurrency)}</span>
                <strong className={currentMargin.marginRate < 0.25 ? 'danger' : 'success'}>
                  Marge {formatPercent(currentMargin.marginRate)}
                </strong>
              </div>

              <button className="primary" type="submit" disabled={isSaving}>
                {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </form>
          </section>
        </section>
      </main>
    </>
  );
}
