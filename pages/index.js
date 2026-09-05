import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { calculateProductMargin, formatCurrency, formatPercent } from '@/lib/margins';

const logoUrl = 'https://www.dosalga.store/logo-dosalga.png';
const pageSize = 6;
const cjBatchSize = 4;
const productsCacheKey = 'dosalga-admin-products-v2';

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
  card: 'M3 5h18v14H3zM3 10h18M7 15h4',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4M9 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 8v-2a4 4 0 0 0-3-3.87m-2-7.96a4 4 0 0 1 0 7.75',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12m10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
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

function ProductVisual({ product }) {
  const [source, setSource] = useState(product.imageUrl || '');
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  useEffect(() => {
    setSource(product.imageUrl || '');
    setFallbackAttempted(false);
  }, [product.id, product.imageUrl]);

  const useCjFallback = () => {
    const query = product.pid || product.cjSku || product.sku;
    if (!fallbackAttempted && query) {
      setFallbackAttempted(true);
      setSource(`/api/cj/image?productId=${encodeURIComponent(product.id)}&query=${encodeURIComponent(query)}`);
      return;
    }
    setSource('');
  };

  if (source) {
    return <img className="product-photo" src={source} alt={product.name || ''} onError={useCjFallback} loading="lazy" />;
  }
  const category = product.category || '';
  const key = ['Women', 'Activewear'].includes(category) ? 'set' : category === 'Accessories' ? 'bag' : category === 'Outerwear' ? 'jacket' : 'tee';
  return <div className={`product-visual ${key}`}><span /></div>;
}

const sponsorPlacements = [
  { name: 'Homepage Hero', format: 'Desktop + mobile', price: '$1,200', period: '/ 30 days', market: 'Both', reach: '84K', availability: '1 of 2 left', tone: 'coral' },
  { name: 'Discovery Spotlight', format: 'Category + search', price: '$750', period: '/ 30 days', market: 'USA', reach: '46K', availability: '3 of 6 left', tone: 'violet' },
  { name: 'Wellness Edit', format: 'Editorial placement', price: '$490', period: '/ feature', market: 'México', reach: '31K', availability: '2 of 4 left', tone: 'gold' },
];

const sponsorCampaigns = [
  { brand: 'ALMA', name: 'Alma Active', campaign: 'Move with intention', placement: 'Homepage Hero', market: 'Both', dates: 'Sep 08 — Oct 08', amount: '$2,040', payment: 'Paid', status: 'Scheduled', performance: '—', color: '#ef3f52' },
  { brand: 'NL', name: 'Nopal Lab', campaign: 'Daily wellness ritual', placement: 'Wellness Edit', market: 'México', dates: 'Sep 01 — Sep 30', amount: '$8,490 MXN', payment: 'Paid', status: 'Live', performance: '2.8% CTR', color: '#387c68' },
  { brand: 'CN', name: 'Casa Norte', campaign: 'Carry what matters', placement: 'Discovery Spotlight', market: 'USA', dates: 'Oct 01 — Oct 31', amount: '$750', payment: 'Pending', status: 'Creative review', performance: '—', color: '#23252b' },
];

const socioPartners = [
  { initials: 'AA', name: 'Alma Active', contact: 'Sofía Mendoza', market: 'Both', plan: 'Signature', budget: '$2,040 USD', status: 'Active', campaigns: 2, renewal: 'Oct 08', color: '#ef3f52' },
  { initials: 'NL', name: 'Nopal Lab', contact: 'Diego Chávez', market: 'México', plan: 'Growth', budget: '$8,490 MXN', status: 'Active', campaigns: 1, renewal: 'Sep 30', color: '#387c68' },
  { initials: 'CN', name: 'Casa Norte', contact: 'Maya Brooks', market: 'USA', plan: 'Launch', budget: '$750 USD', status: 'Onboarding', campaigns: 1, renewal: 'Oct 31', color: '#23252b' },
  { initials: 'MB', name: 'Marea Beauty', contact: 'Lucía Torres', market: 'Both', plan: 'Proposal', budget: '$1,680 USD', status: 'Proposal', campaigns: 0, renewal: '—', color: '#9c6b8d' },
];

function GrowthMetric({ label, value, detail, accent }) {
  return <article className={accent ? `growth-metric ${accent}` : 'growth-metric'}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function MarketLabel({ market }) {
  if (market === 'Both') return <span className="growth-market"><span className="flag us" /><span className="flag mx" /> USA + México</span>;
  return <span className="growth-market"><span className={`flag ${market === 'USA' ? 'us' : 'mx'}`} /> {market}</span>;
}

function SponsorsDashboard({ market, notify }) {
  const campaigns = sponsorCampaigns.filter((campaign) => market === 'All' || campaign.market === market || campaign.market === 'Both');
  const placements = sponsorPlacements.filter((placement) => market === 'All' || placement.market === market || placement.market === 'Both');

  return (
    <section className="growth-dashboard">
      <div className="growth-disclaimer"><span>Concept preview</span> Sample data for Guillermo · Stripe checkout shown as proposed experience</div>
      <div className="growth-metrics">
        <GrowthMetric label="Sponsor revenue" value="$8,940" detail="USD equivalent · this month" accent="red" />
        <GrowthMetric label="Live campaigns" value={market === 'All' ? '6' : market === 'USA' ? '3' : '4'} detail="Across premium placements" />
        <GrowthMetric label="Inventory sold" value="72%" detail="9 of 12 premium slots" accent="green" />
        <GrowthMetric label="Awaiting payment" value="$2,750" detail="2 Stripe checkouts open" accent="dark" />
      </div>

      <div className="sponsor-hero">
        <div className="sponsor-hero-copy">
          <span className="hero-kicker">DOSALGA BRAND MEDIA</span>
          <h2>Turn attention into<br />sponsor revenue.</h2>
          <p>Sell premium visibility directly inside the Dosalga shopping journey—one proposal, two markets, measurable performance.</p>
          <div className="hero-actions"><button className="btn hero-primary" onClick={() => notify('Sponsor proposal preview opened')}><Icon name="plus" /> Build a proposal</button><button className="hero-link" onClick={() => notify('Media kit preview opened')}>View media kit <Icon name="arrow" size={15} /></button></div>
        </div>
        <div className="stripe-preview">
          <div className="stripe-top"><span className="stripe-word">stripe</span><span className="paid-check">✓</span></div>
          <span>Payment received</span>
          <strong>$1,200.00 USD</strong>
          <p>Alma Active · Homepage Hero</p>
          <div className="stripe-meta"><span>Mexico + USA</span><span>•••• 4242</span></div>
        </div>
      </div>

      <div className="growth-section-head"><div><span>Ad inventory</span><h2>Premium placements</h2></div><button onClick={() => notify('Placement inventory editor opened')}>Manage inventory <Icon name="arrow" size={14} /></button></div>
      <div className="placement-grid">
        {placements.map((placement) => <article className={`placement-card ${placement.tone}`} key={placement.name}>
          <div className="placement-visual"><span>AD</span><div><i /><i /><i /></div><b>{placement.name}</b></div>
          <div className="placement-body"><div><span>{placement.format}</span><MarketLabel market={placement.market} /></div><h3>{placement.name}</h3><p><strong>{placement.price}</strong> {placement.period}</p><footer><span><Icon name="eye" size={14} /> {placement.reach} est. views</span><em>{placement.availability}</em></footer></div>
        </article>)}
      </div>

      <section className="growth-table-card">
        <div className="growth-section-head compact"><div><span>Campaign desk</span><h2>Bookings & creative approvals</h2></div><button onClick={() => notify('All sponsor campaigns opened')}>View all campaigns <Icon name="arrow" size={14} /></button></div>
        <div className="growth-table-wrap"><table className="growth-table"><thead><tr><th>Brand</th><th>Campaign</th><th>Market</th><th>Flight</th><th>Investment</th><th>Stripe</th><th>Status</th><th>Performance</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.name}><td><div className="brand-cell"><span style={{ background: campaign.color }}>{campaign.brand}</span><strong>{campaign.name}</strong></div></td><td><strong>{campaign.campaign}</strong><small>{campaign.placement}</small></td><td><MarketLabel market={campaign.market} /></td><td>{campaign.dates}</td><td><strong>{campaign.amount}</strong></td><td><span className={`payment-pill ${campaign.payment.toLowerCase()}`}>{campaign.payment === 'Paid' ? '✓ ' : ''}{campaign.payment}</span></td><td><span className="campaign-status">{campaign.status}</span></td><td><strong>{campaign.performance}</strong></td></tr>)}</tbody></table></div>
      </section>
    </section>
  );
}

function SociosDashboard({ market, notify }) {
  const partners = socioPartners.filter((partner) => market === 'All' || partner.market === market || partner.market === 'Both');
  const featured = partners[0] || socioPartners[0];

  return (
    <section className="growth-dashboard">
      <div className="growth-disclaimer"><span>Concept preview</span> Sample partner accounts · CRM and campaign results proposed for Guillermo</div>
      <div className="growth-metrics">
        <GrowthMetric label="Brand partners" value="12" detail="8 active · 4 in pipeline" accent="red" />
        <GrowthMetric label="Contract value" value="$21.4K" detail="USD equivalent · active terms" />
        <GrowthMetric label="Campaigns live" value="8" detail="5 USA · 6 México" accent="green" />
        <GrowthMetric label="Renewal opportunity" value="$6.8K" detail="Next 30 days" accent="dark" />
      </div>

      <div className="socios-layout">
        <section className="partner-directory">
          <div className="growth-section-head compact"><div><span>Partner CRM</span><h2>Socios & prospects</h2></div><button onClick={() => notify('Partner filters opened')}>Filter <Icon name="chevron" size={13} /></button></div>
          <div className="partner-list">{partners.map((partner, index) => <button className={`partner-row ${index === 0 ? 'selected' : ''}`} key={partner.name} onClick={() => notify(`${partner.name} workspace opened`)}>
            <span className="partner-logo" style={{ background: partner.color }}>{partner.initials}</span><span className="partner-identity"><strong>{partner.name}</strong><small>{partner.contact} · {partner.plan}</small></span><MarketLabel market={partner.market} /><span className={`partner-status ${partner.status.toLowerCase()}`}>{partner.status}</span><span className="partner-budget"><strong>{partner.budget}</strong><small>{partner.campaigns} campaign{partner.campaigns === 1 ? '' : 's'}</small></span><Icon name="chevron" size={15} />
          </button>)}</div>
        </section>

        <aside className="partner-focus">
          <div className="focus-head"><span className="partner-logo large" style={{ background: featured.color }}>{featured.initials}</span><div><span>PARTNER SPOTLIGHT</span><h2>{featured.name}</h2><p>{featured.contact} · Brand lead</p></div><button onClick={() => notify('Socio workspace opened')}><Icon name="dots" /></button></div>
          <div className="focus-plan"><div><span>Signature partner</span><strong>USA + México</strong></div><span className="partner-status active">Active</span></div>
          <div className="focus-stats"><div><span>Impressions</span><strong>118.4K</strong><small>↑ 18.2%</small></div><div><span>Clicks</span><strong>3,420</strong><small>2.89% CTR</small></div><div><span>Attributed sales</span><strong>$6,840</strong><small>3.4× ROAS</small></div></div>
          <div className="onboarding"><div><span>Campaign readiness</span><strong>4 / 5 complete</strong></div><div className="onboarding-track"><i /></div><ul><li className="done">Brand profile approved</li><li className="done">Stripe payment verified</li><li className="done">Creative assets delivered</li><li>Final homepage approval</li></ul></div>
          <button className="focus-action" onClick={() => notify('Performance report opened')}>Open partner report <Icon name="arrow" size={16} /></button>
        </aside>
      </div>

      <section className="partner-pipeline">
        <div className="growth-section-head compact"><div><span>Sales pipeline</span><h2>From first contact to renewal</h2></div><strong>$13,230 potential revenue</strong></div>
        <div className="pipeline-stages">{[
          ['New lead', '5', '$4.2K'], ['Proposal sent', '3', '$5.1K'], ['Stripe checkout', '2', '$2.4K'], ['Campaign live', '8', '$8.9K'], ['Renewal', '4', '$6.8K'],
        ].map(([label, count, amount], index) => <div key={label}><span>{String(index + 1).padStart(2, '0')}</span><p>{label}</p><strong>{count}</strong><small>{amount}</small></div>)}</div>
      </section>
    </section>
  );
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
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [cjConnection, setCjConnection] = useState({ configured: false, connected: false, mode: 'checking' });
  const [importingWp, setImportingWp] = useState(false);
  const [oliviaLoading, setOliviaLoading] = useState(false);
  const [oliviaReport, setOliviaReport] = useState(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const persistProducts = (nextProducts) => {
    try {
      window.localStorage.setItem(productsCacheKey, JSON.stringify({
        savedAt: new Date().toISOString(),
        products: nextProducts,
      }));
    } catch {
      // The current session remains usable if browser storage is unavailable.
    }
  };

  const loadProducts = async () => {
    const response = await fetch('/api/products');
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Products could not be loaded.');
    let cachedProducts = null;

    try {
      const cached = JSON.parse(window.localStorage.getItem(productsCacheKey) || 'null');
      cachedProducts = Array.isArray(cached?.products) ? cached.products : null;
    } catch {
      cachedProducts = null;
    }

    const serverProducts = Array.isArray(result.products) ? result.products : [];
    const nextProducts = result.source === 'postgresql'
      ? serverProducts
      : (cachedProducts || serverProducts);
    setProducts(nextProducts.map(normalizeProduct));
    if (result.source === 'postgresql') persistProducts(nextProducts);
  };

  const loadCjConnection = async () => {
    const response = await fetch('/api/cj/status', { cache: 'no-store' });
    const result = await response.json();
    setCjConnection(result);
    return result;
  };

  useEffect(() => {
    loadProducts().catch((loadError) => setError(loadError.message || 'Products could not be loaded.'));
    loadCjConnection().catch((loadError) => {
      setCjConnection({ configured: true, connected: false, mode: 'error', message: loadError.message });
    });
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
  const cjStatusLabel = cjConnection.mode === 'checking'
    ? 'Checking'
    : cjConnection.connected ? 'Live' : cjConnection.configured ? 'Error' : 'Setup';
  const syncButtonLabel = syncing
    ? `Syncing ${syncProgress.done}/${syncProgress.total}`
    : 'Sync CJ';

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
      imageUrl: current.imageUrl || result.product.imageUrl,
      sku: current.sku || result.product.cjSku,
      cjSku: result.product.cjSku,
      pid: result.product.pid,
      cjCost: result.product.cjCost,
      cjCostUsd: result.product.cjCost,
      cjCostCurrency: result.product.currency,
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
    setSyncProgress({ done: 0, total: 0 });

    try {
      const connection = await loadCjConnection();
      if (!connection.connected) {
        throw new Error(connection.message || 'CJ API key is not configured in this admin.');
      }

      const targets = products.filter((product) => (
        !product.archived && (product.pid || product.cjSku || product.sku || product.cjProductUrl)
      ));
      let workingProducts = [...products];
      let changeCount = 0;
      let errorCount = 0;
      setSyncProgress({ done: 0, total: targets.length });

      for (let offset = 0; offset < targets.length; offset += cjBatchSize) {
        const batch = targets.slice(offset, offset + cjBatchSize);
        const response = await fetch('/api/cj/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products: batch, includeFreight: false }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'CJ sync failed.');
        }

        const updates = new Map((result.products || []).map((product) => [product.id, normalizeProduct(product)]));
        workingProducts = workingProducts.map((product) => updates.get(product.id) || product);
        changeCount += (result.reports || []).reduce((sum, report) => sum + (report.changes?.length || 0), 0);
        errorCount += (result.reports || []).filter((report) => report.error).length;
        setProducts(workingProducts);
        setSyncProgress({ done: Math.min(offset + batch.length, targets.length), total: targets.length });
      }

      persistProducts(workingProducts);
      notify(`CJ sync completed · ${changeCount} changes${errorCount ? ` · ${errorCount} errors` : ''}`);
    } catch (syncError) {
      setError(syncError.message || 'CJ sync failed.');
    } finally {
      setSyncing(false);
    }
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
    const importedProducts = (result.products || []).map(normalizeProduct);
    setProducts(importedProducts);
    persistProducts(importedProducts);
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

  const isGrowthWorkspace = activeView === 'Sponsors' || activeView === 'Socios';
  const viewPresentation = activeView === 'Sponsors'
    ? { title: 'Sponsor revenue', eyebrow: 'DOSALGA MEDIA', subtitle: 'Sell premium brand visibility across Dosalga USA and México—with campaign inventory, creative approval and Stripe payments in one place.' }
    : activeView === 'Socios'
      ? { title: 'Brand partners', eyebrow: 'DOSALGA PARTNERS', subtitle: 'Manage every advertiser relationship from first proposal to payment, live campaign performance and renewal.' }
      : { title: activeView === 'Products' ? 'Product inventory' : activeView, eyebrow: 'DOSALGA COMMERCE', subtitle: 'One catalogue. Two markets. Every cost and margin under control.' };

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
            <button className={`nav-item cj ${activeView === 'CJ Connection' ? 'active' : ''}`} onClick={() => setActiveView('CJ Connection')}><span className="cj-mark">CJ</span> CJdropshipping {cjConnection.connected && <span className="connected-dot" />}</button>
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
          <div className="sidebar-note"><div className="note-top"><span>CJ connection</span><span className={cjConnection.connected ? 'online' : ''}>● {cjStatusLabel}</span></div><strong>2 stores connected</strong><p>MX + USA backends</p></div>
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
              <div><div className="eyebrow"><span /> {viewPresentation.eyebrow}</div><h1>{viewPresentation.title}</h1><p>{viewPresentation.subtitle}</p></div>
              {activeView === 'Sponsors' ? <div className="title-actions"><button className="btn secondary" onClick={() => notify('Stripe payments preview opened')}><Icon name="card" /> Stripe payments</button><button className="btn primary" onClick={() => notify('New campaign builder opened')}><Icon name="plus" /> New campaign</button></div>
                : activeView === 'Socios' ? <div className="title-actions"><button className="btn secondary" onClick={() => notify('Partner pipeline opened')}><Icon name="chart" /> Pipeline</button><button className="btn primary" onClick={() => notify('Socio invitation created')}><Icon name="users" /> Invite socio</button></div>
                  : <div className="title-actions"><button className="btn secondary" onClick={importWordPress} disabled={importingWp}><Icon name="upload" />{importingWp ? 'Importing...' : 'Import WP'}</button><button className="btn secondary" onClick={syncCj} disabled={syncing}><span className={syncing ? 'spin' : ''}><Icon name="refresh" /></span>{syncButtonLabel}</button><button className="btn primary" onClick={openNewProduct}><Icon name="plus" /> Add product</button></div>}
            </div>

            {!isGrowthWorkspace && <div className="metrics">
              <article><span>Active products</span><div className="metric-line"><strong>{metrics.active}</strong></div><small>Across both stores</small></article>
              <article><span>Average margin</span><div className="metric-line"><strong>{formatPercent(metrics.averageMargin)}</strong></div><small>After included shipping</small></article>
              <article><span>Shipping included</span><div className="metric-line"><strong>{metrics.active ? Math.round((metrics.included / metrics.active) * 100) : 0}%</strong></div><small>{metrics.included} of {metrics.active} products</small><div className="progress"><i style={{ width: `${metrics.active ? (metrics.included / metrics.active) * 100 : 0}%` }} /></div></article>
              <article className="attention-card"><span>Needs attention</span><div className="metric-line"><strong>{metrics.attention}</strong><em>Review</em></div><small>Low stock, margin or CJ changes</small></article>
            </div>}

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
                <article><h2>Connection state</h2><div className="big-number">{cjStatusLabel}</div><p>{cjConnection.connected ? 'CJ API v2 is connected. Bulk sync refreshes product cost and inventory; product import also retrieves freight routes.' : cjConnection.message || 'Add CJ_API_KEY to the server environment to enable live synchronization.'}</p><button className="btn primary" onClick={syncCj} disabled={syncing || !cjConnection.connected}><Icon name="refresh" /> {syncButtonLabel}</button></article>
                <article><h2>Product linking</h2><div className="insight-row"><span>Linked to CJ</span><strong>{cjSummary.linked}</strong></div><div className="insight-row"><span>Unlinked</span><strong>{cjSummary.unlinked}</strong></div><div className="insight-row"><span>Synced at least once</span><strong>{cjSummary.synced}</strong></div><div className="insight-row"><span>Open changes</span><strong>{cjSummary.changes}</strong></div></article>
              </section>
            )}

            {activeView === 'Sponsors' && (
              <SponsorsDashboard market={market} notify={notify} />
            )}

            {activeView === 'Socios' && (
              <SociosDashboard market={market} notify={notify} />
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
                        <td><div className="product-cell"><ProductVisual product={product} /><div><strong>{product.productUrl ? <a href={product.productUrl} target="_blank" rel="noreferrer">{product.name}</a> : product.name}</strong><span>{product.brand} · {product.sku}</span><small className={`status ${product.status === 'paused' || product.status === 'review' ? 'review' : product.stock <= 10 ? 'low-stock' : ''}`}>{product.status}</small></div></div></td>
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
