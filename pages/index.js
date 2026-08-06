import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { calculateProductMargin, formatCurrency, formatPercent } from '@/lib/margins';

const logoUrl = 'https://www.dosalga.store/logo-dosalga.png';
const pageSize = 6;

const blankProduct = {
  siteId: 'dosalga-usa',
  stores: ['dosalga-usa'],
  name: '',
  sku: '',
  cjSku: '',
  pid: '',
  brand: 'Dosalga',
  category: 'Activewear',
  imageUrl: '',
  productUrl: '',
  cjCost: 0,
  cjCostUsd: 0,
  cjCostCurrency: 'USD',
  salePrice: 0,
  saleCurrency: 'USD',
  exchangeRate: 17.49,
  shippingIncluded: true,
  shippingCost: 0,
  shippingUsd: 0,
  shippingCurrency: 'USD',
  shippingOrigin: 'CJ · China',
  shippingDestination: 'USA',
  transportMethod: 'CJPacket',
  minDeliveryDays: 7,
  maxDeliveryDays: 14,
  stock: 0,
  status: 'review',
  cjProductUrl: '',
  notes: '',
};

const iconPaths = {
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  box: 'm4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10',
  truck: 'M10 17h4V5H2v12h3m9-8h4l4 4v4h-3m-14 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z',
  chart: 'M4 19V9m6 10V5m6 14v-7m4 7H2',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  search: 'm21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M5 20h14',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  chevron: 'm9 18 6-6-6-6',
  close: 'M18 6 6 18M6 6l12 12',
};

function Icon({ name, size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  );
}

function normalizeProduct(product) {
  const siteId = product.siteId || 'dosalga-mexico';
  return {
    ...blankProduct,
    ...product,
    siteId,
    stores: product.stores || [siteId],
    brand: product.brand || product.supplier || 'Dosalga',
    category: product.category || 'General',
    imageUrl: product.imageUrl || '',
    productUrl: product.productUrl || product.cjProductUrl || '',
    cjSku: product.cjSku || product.sku,
    cjCostUsd: Number(product.cjCostUsd ?? product.cjCost) || 0,
    shippingUsd: Number(product.shippingUsd ?? product.shippingCost) || 0,
    exchangeRate: Number(product.exchangeRate) || 17.49,
    stock: Number(product.stock ?? product.quantityPlanned) || 0,
    saleCurrency: product.saleCurrency || (siteId === 'dosalga-usa' ? 'USD' : 'MXN'),
    cjCostCurrency: product.cjCostCurrency || product.saleCurrency || 'MXN',
    shippingCurrency: product.shippingCurrency || product.saleCurrency || 'MXN',
    shippingOrigin: product.shippingOrigin || 'CJ · China',
    shippingDestination: product.shippingDestination || (siteId === 'dosalga-usa' ? 'USA' : 'México'),
    transportMethod: product.transportMethod || 'CJPacket',
    minDeliveryDays: product.minDeliveryDays || 7,
    maxDeliveryDays: product.maxDeliveryDays || 14,
  };
}

function marketFor(product) {
  if (product.stores?.length > 1 || product.siteId === 'both') return 'Both';
  return product.siteId === 'dosalga-usa' ? 'USA' : 'México';
}

function ProductVisual({ category = '', imageUrl = '' }) {
  if (imageUrl) return <img className="product-photo" src={imageUrl} alt="" />;
  const key = ['Women', 'Activewear'].includes(category) ? 'set' : category === 'Accessories' ? 'bag' : category === 'Outerwear' ? 'jacket' : 'tee';
  return <div className={`product-visual ${key}`}><span /></div>;
}

export default function ProductControl() {
  const [products, setProducts] = useState([]);
  const [activeView, setActiveView] = useState('Products');
  const [market, setMarket] = useState('All');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [shippingFilter, setShippingFilter] = useState('All shipping');
  const [marginFilter, setMarginFilter] = useState('All margins');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(blankProduct);
  const [syncing, setSyncing] = useState(false);
  const [importingWp, setImportingWp] = useState(false);
  const [oliviaLoading, setOliviaLoading] = useState(false);
  const [oliviaReport, setOliviaReport] = useState(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const loadProducts = async () => {
    const response = await fetch('/api/products');
    const result = await response.json();
    setProducts((result.products || []).map(normalizeProduct));
  };

  useEffect(() => {
    loadProducts().catch((loadError) => setError(loadError.message || 'Products could not be loaded.'));
  }, []);

  const categories = useMemo(() => ['All categories', ...new Set(products.map((product) => product.category).filter(Boolean))], [products]);

  const filtered = useMemo(() => products.filter((product) => {
    if (product.archived) return false;
    const productMarket = marketFor(product);
    const margin = calculateProductMargin(product).marginRate;
    const q = query.trim().toLowerCase();
    const marketMatch = market === 'All' || productMarket === market || productMarket === 'Both';
    const categoryMatch = category === 'All categories' || product.category === category;
    const shippingMatch = shippingFilter === 'All shipping' || (shippingFilter === 'Included' ? product.shippingIncluded : !product.shippingIncluded);
    const marginMatch = marginFilter === 'All margins' || (marginFilter === 'Under 35%' ? margin < 0.35 : margin >= 0.35);
    const searchMatch = !q || `${product.name} ${product.brand} ${product.sku} ${product.cjSku}`.toLowerCase().includes(q);
    return marketMatch && categoryMatch && shippingMatch && marginMatch && searchMatch;
  }), [category, marginFilter, market, products, query, shippingFilter]);

  useEffect(() => setPage(1), [category, marginFilter, market, query, shippingFilter]);

  const metrics = useMemo(() => {
    const active = filtered.filter((product) => product.status !== 'archived');
    const included = active.filter((product) => product.shippingIncluded).length;
    const margins = active.map((product) => calculateProductMargin(product).marginRate);
    const averageMargin = margins.length ? margins.reduce((sum, value) => sum + value, 0) / margins.length : 0;
    const attention = active.filter((product) => product.stock <= 10 || product.cjChangeReport?.length || calculateProductMargin(product).marginRate < 0.25).length;
    return { active: active.length, included, averageMargin, attention };
  }, [filtered]);

  const routeSummary = useMemo(() => {
    const routes = new Map();
    filtered.forEach((product) => {
      const key = `${product.shippingOrigin}|${product.shippingDestination}|${product.transportMethod}`;
      const current = routes.get(key) || {
        origin: product.shippingOrigin,
        destination: product.shippingDestination,
        method: product.transportMethod,
        products: 0,
        cost: 0,
        minDays: product.minDeliveryDays,
        maxDays: product.maxDeliveryDays,
        alerts: 0,
      };
      current.products += 1;
      current.cost += Number(product.shippingUsd) || 0;
      current.minDays = Math.min(current.minDays, product.minDeliveryDays || current.minDays);
      current.maxDays = Math.max(current.maxDays, product.maxDeliveryDays || current.maxDays);
      current.alerts += Number(product.shippingUsd) > 12 || Number(product.maxDeliveryDays) > 18 ? 1 : 0;
      routes.set(key, current);
    });
    return [...routes.values()].map((route) => ({ ...route, averageCost: route.products ? route.cost / route.products : 0 }));
  }, [filtered]);

  const marginSummary = useMemo(() => {
    const enriched = filtered
      .map((product) => ({ product, margin: calculateProductMargin(product) }))
      .sort((a, b) => a.margin.marginRate - b.margin.marginRate);
    return {
      low: enriched.filter((item) => item.margin.marginRate < 0.25),
      negative: enriched.filter((item) => item.margin.profit < 0),
      best: [...enriched].reverse().slice(0, 5),
    };
  }, [filtered]);

  const cjSummary = useMemo(() => {
    const linked = filtered.filter((product) => product.pid || product.cjSku).length;
    const synced = filtered.filter((product) => product.lastCjSyncAt).length;
    const changes = filtered.reduce((sum, product) => sum + (product.cjChangeReport?.length || 0), 0);
    return { linked, synced, changes, unlinked: filtered.length - linked };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageProducts = filtered.slice((page - 1) * pageSize, page * pageSize);
  const currentMargin = calculateProductMargin(editingProduct);

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 3500);
  };

  const updateField = (field, value) => setEditingProduct((current) => ({ ...current, [field]: value }));

  const openNewProduct = () => {
    setEditingProduct({ ...blankProduct });
    setModalOpen(true);
  };

  const openEditProduct = (product) => {
    setEditingProduct(normalizeProduct(product));
    setModalOpen(true);
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/products', {
      method: editingProduct.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingProduct),
    });
    if (!response.ok) {
      const result = await response.json();
      setError(result.message || 'Save failed.');
      return;
    }
    setModalOpen(false);
    await loadProducts();
    notify(editingProduct.id ? 'Product updated' : 'Product created');
  };

  const archiveProduct = async (product) => {
    await fetch(`/api/products?id=${encodeURIComponent(product.id)}`, { method: 'DELETE' });
    await loadProducts();
    notify('Product archived');
  };

  const importCj = async () => {
    const response = await fetch('/api/cj/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: editingProduct.cjProductUrl || editingProduct.pid || editingProduct.cjSku, destination: editingProduct.shippingDestination }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.message || 'CJ import failed.');
      return;
    }
    const route = result.product.selectedRoute || {};
    setEditingProduct((current) => ({
      ...current,
      name: current.name || result.product.name,
      brand: result.product.brand,
      category: result.product.category,
      sku: current.sku || result.product.cjSku,
      cjSku: result.product.cjSku,
      pid: result.product.pid,
      cjCost: result.product.cjCost,
      cjCostUsd: result.product.cjCost,
      cjCostCurrency: result.product.currency,
      saleCurrency: result.product.currency,
      shippingCost: route.shippingCost || 0,
      shippingUsd: route.shippingCost || 0,
      shippingCurrency: result.product.currency,
      shippingOrigin: route.origin || current.shippingOrigin,
      shippingDestination: route.destination || current.shippingDestination,
      transportMethod: route.method || current.transportMethod,
      minDeliveryDays: route.minDeliveryDays || current.minDeliveryDays,
      maxDeliveryDays: route.maxDeliveryDays || current.maxDeliveryDays,
      stock: result.product.stock,
    }));
    notify(result.mode === 'demo' ? 'CJ demo product imported' : 'CJ product imported');
  };

  const syncCj = async () => {
    setSyncing(true);
    setError('');
    const response = await fetch('/api/cj/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const result = await response.json();
    setSyncing(false);
    if (!response.ok) {
      setError(result.message || 'CJ sync failed.');
      return;
    }
    setProducts((result.products || []).map(normalizeProduct));
    const changes = (result.reports || []).reduce((sum, report) => sum + report.changes.length, 0);
    notify(`CJ sync completed · ${changes} changes found`);
  };

  const importWordPress = async () => {
    setImportingWp(true);
    setError('');
    const response = await fetch('/api/wp/import', { method: 'POST' });
    const result = await response.json();
    setImportingWp(false);
    if (!response.ok) {
      setError(result.message || 'WordPress import failed.');
      return;
    }
    setProducts((result.products || []).map(normalizeProduct));
    const summary = (result.reports || []).map((report) => `${report.name}: ${report.count}`).join(' · ');
    notify(`WordPress import completed · ${summary}`);
  };

  const exportCsv = () => {
    const rows = [
      ['Product', 'Product URL', 'Image', 'SKU Dosalga', 'SKU/PID CJ', 'Brand', 'Category', 'Store', 'Currency', 'CJ cost USD', 'Sale price', 'Shipping included', 'Shipping USD', 'Exchange rate', 'Origin', 'Destination', 'Method', 'ETA min', 'ETA max', 'Stock', 'Status', 'Net margin', 'Margin percent', 'Last CJ sync'],
      ...filtered.map((product) => {
        const margin = calculateProductMargin(product);
        return [product.name, product.productUrl, product.imageUrl, product.sku, product.cjSku || product.pid, product.brand, product.category, marketFor(product), margin.saleCurrency, product.cjCostUsd, product.salePrice, product.shippingIncluded ? 'yes' : 'no', product.shippingUsd, product.exchangeRate, product.shippingOrigin, product.shippingDestination, product.transportMethod, product.minDeliveryDays, product.maxDeliveryDays, product.stock, product.status, margin.profit.toFixed(2), formatPercent(margin.marginRate), product.lastCjSyncAt || ''];
      }),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dosalga-products.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const runOliviaOne = async () => {
    setOliviaLoading(true);
    setError('');
    const response = await fetch('/api/ai/olivia-one', { method: 'POST' });
    const result = await response.json();
    setOliviaLoading(false);
    if (!response.ok) {
      setError(result.message || 'Olivia One analysis failed.');
      return;
    }
    setOliviaReport(result);
    notify(`Olivia One analysis ready · ${result.mode}`);
  };

  return (
    <>
      <Head>
        <title>Dosalga Product Control</title>
        <meta name="description" content="Dosalga premium product dashboard for CJdropshipping costs, stock, shipping and margins." />
      </Head>
      <main className="app-shell">
        <aside className="sidebar">
          <div className="brand-lockup"><img src={logoUrl} alt="Dosalga" /><span>Product Control</span></div>
          <nav aria-label="Main navigation">
            <p className="nav-label">Workspace</p>
            {[
              ['Overview', 'grid'],
              ['Products', 'box'],
              ['Shipping', 'truck'],
              ['Margins', 'chart'],
            ].map(([label, icon]) => (
              <button key={label} className={`nav-item ${activeView === label ? 'active' : ''}`} onClick={() => setActiveView(label)}>
                <Icon name={icon} /> {label} {label === 'Products' && <span className="nav-count">{products.length}</span>}
              </button>
            ))}
            <p className="nav-label second">Connections</p>
            <button className={`nav-item cj ${activeView === 'CJ Connection' ? 'active' : ''}`} onClick={() => setActiveView('CJ Connection')}><span className="cj-mark">CJ</span> CJdropshipping <span className="connected-dot" /></button>
            <p className="nav-label second">Growth</p>
            {[
              ['Sponsors', 'grid'],
              ['Socios', 'box'],
              ['Reporting IA', 'chart'],
              ['Reporting & Analytics BI', 'chart'],
            ].map(([label, icon]) => (
              <button key={label} className={`nav-item ${activeView === label ? 'active' : ''}`} onClick={() => setActiveView(label)}>
                <Icon name={icon} /> {label}
              </button>
            ))}
          </nav>
          <div className="sidebar-note"><div className="note-top"><span>CJ connection</span><span className="online">● Demo</span></div><strong>2 stores synchronized</strong><p>Last update · {new Date().toLocaleDateString('en-US')}</p></div>
          <div className="profile"><div className="avatar">OS</div><div><strong>Olivier</strong><span>Administrator</span></div><Icon name="dots" /></div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div className="market-switch" role="group" aria-label="Store selection">
              {['All', 'USA', 'México'].map((item) => (
                <button key={item} onClick={() => setMarket(item)} className={market === item ? 'selected' : ''}>
                  {item !== 'All' && <span className={`flag ${item === 'USA' ? 'us' : 'mx'}`} />}
                  {item === 'All' ? 'All stores' : `Dosalga ${item}`}
                </button>
              ))}
            </div>
            <div className="top-actions"><button className="icon-btn" aria-label="Notifications"><Icon name="bell" /><span className="alert-dot" /></button><button className="help-btn">?</button></div>
          </header>

          <div className="content">
            {error && <div className="error-banner">{error}</div>}
            <div className="title-row">
              <div><div className="eyebrow"><span /> DOSALGA COMMERCE</div><h1>{activeView === 'Products' ? 'Product inventory' : activeView}</h1><p>One catalogue. Two markets. Every cost and margin under control.</p></div>
              <div className="title-actions"><button className="btn secondary" onClick={importWordPress} disabled={importingWp}><Icon name="upload" />{importingWp ? 'Importing...' : 'Import WP'}</button><button className="btn secondary" onClick={syncCj} disabled={syncing}><span className={syncing ? 'spin' : ''}><Icon name="refresh" /></span>{syncing ? 'Syncing...' : 'Sync CJ'}</button><button className="btn primary" onClick={openNewProduct}><Icon name="plus" /> Add product</button></div>
            </div>

            <div className="metrics">
              <article><span>Active products</span><div className="metric-line"><strong>{metrics.active}</strong></div><small>Across both stores</small></article>
              <article><span>Average margin</span><div className="metric-line"><strong>{formatPercent(metrics.averageMargin)}</strong></div><small>After included shipping</small></article>
              <article><span>Shipping included</span><div className="metric-line"><strong>{metrics.active ? Math.round((metrics.included / metrics.active) * 100) : 0}%</strong></div><small>{metrics.included} of {metrics.active} products</small><div className="progress"><i style={{ width: `${metrics.active ? (metrics.included / metrics.active) * 100 : 0}%` }} /></div></article>
              <article className="attention-card"><span>Needs attention</span><div className="metric-line"><strong>{metrics.attention}</strong><em>Review</em></div><small>Low stock, margin or CJ changes</small></article>
            </div>

            {activeView === 'Overview' && (
              <section className="insight-grid">
                <article><h2>Priority queue</h2>{filtered.filter((product) => product.stock <= 10 || calculateProductMargin(product).marginRate < 0.25).slice(0, 6).map((product) => <button key={product.id} className="insight-row" onClick={() => openEditProduct(product)}><span>{product.name}</span><strong>{product.stock <= 10 ? `${product.stock} stock` : formatPercent(calculateProductMargin(product).marginRate)}</strong></button>)}</article>
                <article><h2>Store coverage</h2>{['USA', 'México', 'Both'].map((store) => <div key={store} className="insight-row"><span>{store}</span><strong>{filtered.filter((product) => marketFor(product) === store).length}</strong></div>)}</article>
              </section>
            )}

            {activeView === 'Shipping' && (
              <section className="catalog-card compact-card">
                <div className="catalog-head"><div className="tabs"><button className="tab active">Routes <span>{routeSummary.length}</span></button></div></div>
                <div className="table-wrap"><table><thead><tr><th>Route</th><th>Method</th><th>Products</th><th>Avg shipping USD</th><th>ETA</th><th>Alerts</th></tr></thead><tbody>{routeSummary.map((route) => <tr key={`${route.origin}-${route.destination}-${route.method}`}><td><strong>{route.origin} to {route.destination}</strong></td><td>{route.method}</td><td>{route.products}</td><td>{formatCurrency(route.averageCost, 'USD')}</td><td>{route.minDays}-{route.maxDays} days</td><td className={route.alerts ? 'danger-text' : ''}>{route.alerts || 'Clear'}</td></tr>)}</tbody></table></div>
              </section>
            )}

            {activeView === 'Margins' && (
              <section className="insight-grid">
                <article><h2>Low margin</h2>{marginSummary.low.slice(0, 8).map(({ product, margin }) => <button key={product.id} className="insight-row" onClick={() => openEditProduct(product)}><span>{product.name}</span><strong>{formatPercent(margin.marginRate)}</strong></button>)}</article>
                <article><h2>Best margin</h2>{marginSummary.best.map(({ product, margin }) => <button key={product.id} className="insight-row" onClick={() => openEditProduct(product)}><span>{product.name}</span><strong>{formatCurrency(margin.profit, margin.saleCurrency)}</strong></button>)}</article>
                <article><h2>Negative margin</h2><div className="big-number">{marginSummary.negative.length}</div><p>Products selling below landed cost in the current filters.</p></article>
              </section>
            )}

            {activeView === 'CJ Connection' && (
              <section className="insight-grid">
                <article><h2>Connection state</h2><div className="big-number">Demo</div><p>Live CJ credentials are not configured in this app yet.</p><button className="btn primary" onClick={syncCj} disabled={syncing}><Icon name="refresh" /> {syncing ? 'Syncing...' : 'Run CJ sync'}</button></article>
                <article><h2>Product linking</h2><div className="insight-row"><span>Linked to CJ</span><strong>{cjSummary.linked}</strong></div><div className="insight-row"><span>Unlinked</span><strong>{cjSummary.unlinked}</strong></div><div className="insight-row"><span>Synced at least once</span><strong>{cjSummary.synced}</strong></div><div className="insight-row"><span>Open changes</span><strong>{cjSummary.changes}</strong></div></article>
              </section>
            )}

            {activeView === 'Sponsors' && (
              <section className="mockup-board">
                <article className="mockup-panel wide"><h2>Campaign pipeline</h2><div className="kanban-row"><span>Homepage banner</span><strong>$1,200 USD</strong><em>Booked</em></div><div className="kanban-row"><span>Product page placement</span><strong>$750 USD</strong><em>Draft</em></div><div className="kanban-row"><span>Collection takeover</span><strong>$2,400 USD</strong><em>Review</em></div></article>
                <article className="mockup-panel"><h2>Inventory</h2><div className="big-number">8</div><p>Available sponsor placements across USA and México stores.</p></article>
                <article className="mockup-panel"><h2>Fields</h2><p>Sponsor, campaign, store, placement, dates, budget, creative, target link, status.</p></article>
              </section>
            )}

            {activeView === 'Socios' && (
              <section className="mockup-board">
                <article className="mockup-panel wide"><h2>Socio workspaces</h2><div className="kanban-row"><span>Fitness Partner MX</span><strong>34 products</strong><em>Active</em></div><div className="kanban-row"><span>Wellness USA Retail</span><strong>18 products</strong><em>Setup</em></div><div className="kanban-row"><span>Creator Store Pilot</span><strong>12 products</strong><em>Limited</em></div></article>
                <article className="mockup-panel"><h2>Model</h2><p>Socio, assigned products, commission, orders generated, branding and restricted access.</p></article>
                <article className="mockup-panel"><h2>Revenue</h2><div className="big-number">12%</div><p>Default Dosalga management fee placeholder.</p></article>
              </section>
            )}

            {activeView === 'Reporting IA' && (
              <section className="mockup-board">
                <article className="mockup-panel wide"><h2>Olivia One</h2><p>AI analyst for the full Dosalga dashboard: products, margins, shipping, CJ connection, sponsors, socios and reporting readiness.</p><button className="btn primary report-action" onClick={runOliviaOne} disabled={oliviaLoading}><Icon name="refresh" /> {oliviaLoading ? 'Analyzing...' : 'Run Olivia One'}</button>{oliviaReport && <div className="ai-report"><strong>{oliviaReport.analysis.title}</strong><p>{oliviaReport.analysis.executiveSummary}</p>{oliviaReport.analysis.priorities?.map((item) => <div key={item} className="kanban-row"><span>{item}</span><em>Priority</em></div>)}</div>}</article>
                <article className="mockup-panel"><h2>AI queue</h2><div className="kanban-row"><span>Products to push in ads</span><strong>{marginSummary.best.length}</strong><em>Ready</em></div><div className="kanban-row"><span>Low margin warnings</span><strong>{marginSummary.low.length}</strong><em>Review</em></div><div className="kanban-row"><span>Shipping risk alerts</span><strong>{routeSummary.reduce((sum, route) => sum + route.alerts, 0)}</strong><em>Open</em></div></article>
                <article className="mockup-panel"><h2>Recommendations</h2>{oliviaReport ? oliviaReport.analysis.recommendations?.map((item) => <p key={item}>{item}</p>) : <p>Run Olivia One to generate operational recommendations from the current dashboard data.</p>}</article>
              </section>
            )}

            {activeView === 'Reporting & Analytics BI' && (
              <section className="mockup-board">
                <article className="mockup-panel wide"><h2>BI command center</h2><div className="bi-metric-row"><div><span>Net margin monitor</span><strong>{formatPercent(metrics.averageMargin)}</strong></div><div><span>Products analyzed</span><strong>{metrics.active}</strong></div><div><span>Shipping alerts</span><strong>{routeSummary.reduce((sum, route) => sum + route.alerts, 0)}</strong></div></div><div className="bi-bars">{marginSummary.best.map(({ product, margin }) => <div key={product.id}><span>{product.name}</span><i style={{ width: `${Math.max(8, Math.min(100, margin.marginRate * 100))}%` }} /></div>)}</div></article>
                <article className="mockup-panel"><h2>Dashboards</h2><div className="kanban-row"><span>Sales by store</span><em>Planned</em></div><div className="kanban-row"><span>Margin snapshots</span><em>Planned</em></div><div className="kanban-row"><span>Best sellers</span><em>Planned</em></div><div className="kanban-row"><span>Sponsor ROI</span><em>Planned</em></div></article>
                <article className="mockup-panel"><h2>Exports</h2><p>CSV and BI-ready datasets for products, orders, margins, stock, shipping, sponsors and socios once Postgres is connected.</p><button className="btn secondary report-action" onClick={exportCsv}><Icon name="upload" /> Export products CSV</button></article>
              </section>
            )}

            {activeView === 'Products' && <section className="catalog-card">
              <div className="catalog-head"><div className="tabs"><button className="tab active">All products <span>{filtered.length}</span></button><button className="tab">Active <span>{filtered.filter((p) => p.status === 'approved' || p.status === 'ordered').length}</span></button><button className="tab">Needs review <span>{metrics.attention}</span></button><button className="tab">Drafts <span>{filtered.filter((p) => p.status === 'review').length}</span></button></div><button className="export" onClick={exportCsv}><Icon name="upload" /> Export CSV</button></div>
              <div className="filters">
                <label className="search-box"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, SKU or brand" /></label>
                <label className="select-wrap"><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select><Icon name="chevron" size={15} /></label>
                <label className="select-wrap"><select value={shippingFilter} onChange={(event) => setShippingFilter(event.target.value)}><option>All shipping</option><option>Included</option><option>Separate</option></select><Icon name="chevron" size={15} /></label>
                <label className="select-wrap"><select value={marginFilter} onChange={(event) => setMarginFilter(event.target.value)}><option>All margins</option><option>Under 35%</option><option>35% and up</option></select><Icon name="chevron" size={15} /></label>
                <span className="result-count">{filtered.length} shown</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th className="product-col">Product / brand</th><th>Store</th><th>Currency</th><th>CJ cost USD</th><th>Sale price</th><th>Shipping USD</th><th>Route & ETA</th><th>Stock</th><th>Margin</th><th>Sync</th><th /></tr></thead>
                  <tbody>{pageProducts.map((product) => {
                    const margin = calculateProductMargin(product);
                    const percent = Math.round(margin.marginRate * 100);
                    return (
                      <tr key={product.id}>
                        <td><div className="product-cell"><ProductVisual category={product.category} imageUrl={product.imageUrl} /><div><strong>{product.productUrl ? <a href={product.productUrl} target="_blank" rel="noreferrer">{product.name}</a> : product.name}</strong><span>{product.brand} · {product.sku}</span><small className={`status ${product.status === 'paused' || product.status === 'review' ? 'review' : product.stock <= 10 ? 'low-stock' : ''}`}>{product.status}</small></div></div></td>
                        <td><span className={`market-badge ${marketFor(product) === 'USA' ? 'usa' : 'mexico'}`}>{marketFor(product) !== 'Both' && <span className={`flag ${marketFor(product) === 'USA' ? 'us' : 'mx'}`} />}{marketFor(product)}</span></td>
                        <td><span className="currency-pill">{product.saleCurrency}</span></td>
                        <td className="number"><strong>{formatCurrency(product.cjCostUsd, 'USD')}</strong><small>{product.cjSku || product.pid}</small></td>
                        <td className="number"><strong>{formatCurrency(product.salePrice, product.saleCurrency)}</strong><small>Store price</small></td>
                        <td><strong>{formatCurrency(product.shippingUsd, 'USD')}</strong><small className={product.shippingIncluded ? 'included' : 'separate'}>{product.shippingIncluded ? `● Included · FX ${product.exchangeRate}` : '○ Charged apart'}</small></td>
                        <td><strong className="route">{product.shippingOrigin} <span>→</span> {product.shippingDestination}</strong><small>{product.transportMethod} · {product.minDeliveryDays}-{product.maxDeliveryDays} days</small></td>
                        <td><strong className={product.stock <= 10 ? 'danger-text' : ''}>{product.stock}</strong><small>{product.stock <= 10 ? 'Low stock' : 'Available'}</small></td>
                        <td><div className={`margin-ring ${percent < 35 ? 'warning' : ''}`} style={{ '--margin': `${Math.max(0, Math.min(100, percent)) * 3.6}deg` }}><span>{percent}%</span></div><small>{formatCurrency(margin.profit, margin.saleCurrency)}</small></td>
                        <td><small>{product.lastCjSyncAt ? new Date(product.lastCjSyncAt).toLocaleString() : 'Never'}</small>{Boolean(product.cjChangeReport?.length) && <small className="danger-text">{product.cjChangeReport.length} changes</small>}</td>
                        <td><button className="row-menu" onClick={() => openEditProduct(product)} aria-label={`Edit ${product.name}`}><Icon name="dots" /></button></td>
                      </tr>
                    );
                  })}{!pageProducts.length && <tr><td colSpan={11} className="empty">No products match these filters.</td></tr>}</tbody>
                </table>
              </div>
              <footer className="table-footer"><span>Showing {pageProducts.length} of {filtered.length} products</span><div><button disabled={page === 1} onClick={() => setPage(page - 1)}>←</button>{Array.from({ length: totalPages }).slice(0, 5).map((_, index) => <button key={index + 1} className={page === index + 1 ? 'page-active' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button disabled={page === totalPages} onClick={() => setPage(page + 1)}>→</button></div></footer>
            </section>}
          </div>
        </section>

        {modalOpen && (
          <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModalOpen(false)}>
            <form className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onSubmit={saveProduct}>
              <div className="modal-head"><div><span>{editingProduct.id ? 'EDIT CATALOG ITEM' : 'NEW CATALOG ITEM'}</span><h2 id="modal-title">{editingProduct.id ? 'Edit product' : 'Add a product'}</h2></div><button type="button" onClick={() => setModalOpen(false)} aria-label="Close"><Icon name="close" /></button></div>
              <div className="modal-body">
                <div className="cj-import"><span className="cj-mark">CJ</span><div><strong>Import from CJdropshipping</strong><p>Paste a CJ product URL, PID or SKU to prefill costs, stock and shipping routes.</p></div><button type="button" onClick={importCj}>Import</button></div>
                <label>CJ URL, PID or SKU<input value={editingProduct.cjProductUrl || editingProduct.pid || editingProduct.cjSku} onChange={(event) => updateField('cjProductUrl', event.target.value)} placeholder="CJNS-24018" /></label>
                <label>Product name<input required value={editingProduct.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Essential Training Set" /></label>
                <div className="form-grid"><label>Store<select value={editingProduct.siteId} onChange={(event) => updateField('siteId', event.target.value)}><option value="dosalga-usa">Dosalga USA</option><option value="dosalga-mexico">Dosalga México</option><option value="both">Both stores</option></select></label><label>Brand<input value={editingProduct.brand} onChange={(event) => updateField('brand', event.target.value)} /></label></div>
                <div className="form-grid"><label>Category<input value={editingProduct.category} onChange={(event) => updateField('category', event.target.value)} /></label><label>SKU Dosalga<input value={editingProduct.sku} onChange={(event) => updateField('sku', event.target.value)} /></label></div>
                <div className="form-grid three"><label>Currency<select value={editingProduct.saleCurrency} onChange={(event) => { updateField('saleCurrency', event.target.value); updateField('cjCostCurrency', event.target.value); updateField('shippingCurrency', event.target.value); }}><option>USD</option><option>MXN</option></select></label><label>Sale price<input type="number" step="0.01" value={editingProduct.salePrice} onChange={(event) => updateField('salePrice', Number(event.target.value))} /></label><label>CJ cost<input type="number" step="0.01" value={editingProduct.cjCost} onChange={(event) => updateField('cjCost', Number(event.target.value))} /></label></div>
                <div className="form-grid"><label>Shipping price<input type="number" step="0.01" value={editingProduct.shippingCost} onChange={(event) => updateField('shippingCost', Number(event.target.value))} /></label><label>Shipping mode<select value={editingProduct.shippingIncluded ? 'included' : 'separate'} onChange={(event) => updateField('shippingIncluded', event.target.value === 'included')}><option value="included">Included in price</option><option value="separate">Charged separately</option></select></label></div>
                <div className="form-grid three"><label>Origin<input value={editingProduct.shippingOrigin} onChange={(event) => updateField('shippingOrigin', event.target.value)} /></label><label>Destination<input value={editingProduct.shippingDestination} onChange={(event) => updateField('shippingDestination', event.target.value)} /></label><label>Method<input value={editingProduct.transportMethod} onChange={(event) => updateField('transportMethod', event.target.value)} /></label></div>
                <div className="form-grid three"><label>Min days<input type="number" value={editingProduct.minDeliveryDays} onChange={(event) => updateField('minDeliveryDays', Number(event.target.value))} /></label><label>Max days<input type="number" value={editingProduct.maxDeliveryDays} onChange={(event) => updateField('maxDeliveryDays', Number(event.target.value))} /></label><label>Stock<input type="number" value={editingProduct.stock} onChange={(event) => updateField('stock', Number(event.target.value))} /></label></div>
                <div className="form-grid"><label>Status<select value={editingProduct.status} onChange={(event) => updateField('status', event.target.value)}><option value="review">Review</option><option value="approved">Active</option><option value="ordered">Ordered</option><option value="paused">Paused</option></select></label><label>SKU/PID CJ<input value={editingProduct.cjSku || editingProduct.pid} onChange={(event) => updateField('cjSku', event.target.value)} /></label></div>
                <div className="preview-margin"><span>Estimated margin</span><strong>{formatPercent(currentMargin.marginRate)}</strong><small>{formatCurrency(currentMargin.profit, currentMargin.saleCurrency)} net · sale price - CJ cost{editingProduct.shippingIncluded ? ' - included shipping' : ''}</small></div>
              </div>
              <div className="modal-actions">{editingProduct.id && <button type="button" className="btn danger" onClick={() => archiveProduct(editingProduct)}>Archive</button>}<button type="button" className="btn secondary" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn primary" type="submit">{editingProduct.id ? 'Save product' : 'Create product'}</button></div>
            </form>
          </div>
        )}
        {toast && <div className="toast"><span>✓</span>{toast}</div>}
      </main>
    </>
  );
}
