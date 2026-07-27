// api/screener-history.js
// Historial de escaneos (plan Terminal). Responde dos preguntas utiles:
//   - Cuanto tiempo lleva una accion apareciendo en el screener
//   - Que aparecio y desaparecio en los ultimos dias

const SUPABASE_URL = 'https://osrjmchajyrgdlucniid.supabase.co';

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_KEY || 'sb_publishable_uL4sQ_T3HiCD6ZZ20D5thw_sc_gTK5F';
  const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` };

  const email = req.query?.email;
  const engine = req.query?.engine || 'punished';
  const days = Math.min(parseInt(req.query?.days || '30', 10), 90);

  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    // Verificar plan Terminal
    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?email=eq.${encodeURIComponent(email)}&select=plan,status`,
      { headers: H }
    );
    const subs = await subRes.json();
    const sub = Array.isArray(subs) && subs[0] ? subs[0] : null;
    if (!sub || sub.status !== 'active' || sub.plan !== 'terminal') {
      return res.status(403).json({ error: 'Screener history requires the Terminal plan' });
    }

    const since = new Date(Date.now() - days * 86400000).toISOString();
    const histRes = await fetch(
      `${SUPABASE_URL}/rest/v1/screener_history?engine=eq.${engine}&captured_at=gte.${since}` +
      `&select=*&order=captured_at.desc&limit=2000`,
      { headers: H }
    );
    const rows = await histRes.json();
    if (!Array.isArray(rows)) return res.status(500).json({ error: 'History unavailable' });

    // Agrupar por ticker
    const byTicker = {};
    rows.forEach(r => {
      if (!byTicker[r.ticker]) {
        byTicker[r.ticker] = {
          ticker: r.ticker, company: r.company, sector: r.sector,
          appearances: 0, firstSeen: r.captured_at, lastSeen: r.captured_at,
          firstPrice: null, lastPrice: null, scores: []
        };
      }
      const t = byTicker[r.ticker];
      t.appearances++;
      if (r.captured_at < t.firstSeen) { t.firstSeen = r.captured_at; t.firstPrice = r.price; }
      if (r.captured_at > t.lastSeen)  { t.lastSeen = r.captured_at; }
      if (t.lastPrice === null) t.lastPrice = r.price;   // rows vienen ordenados desc
      if (typeof r.score === 'number') t.scores.push(r.score);
    });

    const list = Object.values(byTicker).map(t => {
      const priceChange = (t.firstPrice && t.lastPrice)
        ? ((t.lastPrice - t.firstPrice) / t.firstPrice) * 100 : null;
      const avgScore = t.scores.length
        ? t.scores.reduce((a, b) => a + b, 0) / t.scores.length : null;
      const daysTracked = Math.max(1,
        Math.round((new Date(t.lastSeen) - new Date(t.firstSeen)) / 86400000));
      return {
        ticker: t.ticker, company: t.company, sector: t.sector,
        appearances: t.appearances,
        daysTracked,
        firstSeen: t.firstSeen, lastSeen: t.lastSeen,
        firstPrice: t.firstPrice, lastPrice: t.lastPrice,
        priceChange: priceChange != null ? Math.round(priceChange * 10) / 10 : null,
        avgScore: avgScore != null ? Math.round(avgScore) : null
      };
    }).sort((a, b) => b.appearances - a.appearances);

    return res.status(200).json({
      engine,
      days,
      snapshots: rows.length,
      uniqueTickers: list.length,
      tickers: list.slice(0, 60)
    });

  } catch (err) {
    console.error('History error:', err);
    return res.status(500).json({ error: 'History failed' });
  }
}
