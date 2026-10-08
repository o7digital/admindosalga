const DOF_URL = 'https://dof.gob.mx/indicadores_detalle.php';
const CACHE_MS = 15 * 60 * 1000;
let cached = null;
let pending = null;

export function mexicoDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const displayDate = date => date.split('-').reverse().join('/');
const plainText = html => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();

// Read only dated USD indicator rows; ignore the sidebar and other indicators.
export function parseDofRates(html, today = mexicoDate()) {
  const observations = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => plainText(cell[1]));
    if (cells.length !== 2) continue;
    const dateMatch = cells[0].match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (!dateMatch || !/^\d+(?:\.\d+)?$/.test(cells[1])) continue;
    const date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    const parsed = new Date(`${date}T12:00:00Z`);
    const rate = Number(cells[1]);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > today || !(rate > 0)) continue;
    observations.push({ date, rate });
  }
  observations.sort((left, right) => right.date.localeCompare(left.date));
  if (!observations.length) throw new Error('Le DOF ne renvoie aucun taux USD/MXN publié valide.');
  return observations[0];
}

export async function getLatestOfficialRate() {
  const today = mexicoDate();
  if (cached && cached.requestDate === today && Date.now() - cached.fetchedAt < CACHE_MS) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    const since = new Date(`${today}T12:00:00Z`);
    since.setUTCDate(since.getUTCDate() - 30);
    const url = new URL(DOF_URL);
    url.search = new URLSearchParams({ cod_tipo_indicador: '158', dfecha: displayDate(since.toISOString().slice(0, 10)), hfecha: displayDate(today) }).toString();
    try {
      const response = await fetch(url, { headers: { Accept: 'text/html' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`DOF indisponible (HTTP ${response.status}).`);
      const observation = parseDofRates(await response.text(), today);
      const value = { ...observation, source: 'Diario Oficial de la Federación · Banxico', sourceUrl: url.toString(), checkedAt: new Date().toISOString(), stale: false };
      cached = { value, fetchedAt: Date.now(), requestDate: today };
      return value;
    } catch (error) {
      if (cached) return { ...cached.value, stale: true, warning: 'Actualisation DOF indisponible : dernier taux officiel récupéré.' };
      throw error;
    }
  })();
  try { return await pending; } finally { pending = null; }
}
