// api/terminal-tools.js
// Herramientas del plan Terminal en una sola funcion:
//   GET /api/terminal-tools?tool=apikey&email=...
//   GET /api/terminal-tools?tool=history&email=...&engine=punished&days=30

const SUPABASE_URL = 'https://osrjmchajyrgdlucniid.supabase.co';

function genKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 40; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return 'velu_live_' + out;
}

async function requireTerminal(email, H) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?email=eq.${encodeURIComponent(email)}&select=plan,status`,
    { headers: H }
  );
  const rows = await r.json();
  const sub = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return !!(sub && sub.status === 'active' && sub.plan === 'terminal');
}

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_KEY || 'sb_publishable_uL4sQ_T3HiCD6ZZ20D5thw_sc_gTK5F';
  const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` };

  const tool = req.query?.tool;
  const email = req.query?.email;
  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    const ok = await requireTerminal(email, H);
    if (!ok) return res.status(403).json({ error: 'This requires the Terminal plan' });

    // ── API KEY ────────────────────────────────────────
    if (tool === 'apikey') {
      const exist = await fetch(
        `${SUPABASE_URL}/rest/v1/api_keys?email=eq.${encodeURIComponent(email)}&select=api_key,created_at,request_count`,
        { headers: H }
      );
      const rows = await exist.json();
      if (Array.isArray(rows) && rows[0]) {
        return res.status(200).json({
          apiKey: rows[0].api_key,
          createdAt: rows[0].created_at,
          requestCount: rows[0].request_count || 0
        });
      }
      const apiKey = genKey();
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/api_keys`, {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ email, api_key: apiKey })
      });
      if (!ins.ok) {
        console.error('Key insert failed:', await ins.text());
        return res.status(500).json({ error: 'Could not create API key' });
      }
      return res.status(200).json({ apiKey, createdAt: new Date().toISOString(), requestCount: 0 });
    }

    // ── SCREENER HISTORY ───────────────────────────────
    if (tool === 'history') {
      const engine = req.query?.engine || 'punished';
      const days = Math.min(parseInt(req.query?.days || '30', 10), 90);
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const hRes = await fetch(
        `${SUPABASE_URL}/rest/v1/screener_history?engine=eq.${engine}&captured_at=gte.${since}` +
        `&select=*&order=captured_at.desc&limit=2000`,
        { headers: H }
      );
      const rows = await hRes.json();
      if (!Array.isArray(rows)) return res.status(500).json({ error: 'History unavailable' });

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
        if (r.captured_at > t.lastSeen) t.lastSeen = r.captured_at;
        if (t.lastPrice === null) t.lastPrice = r.price;
        if (typeof r.score === 'number') t.scores.push(r.score);
      });

      const list = Object.values(byTicker).map(t => {
        const pc = (t.firstPrice && t.lastPrice)
          ? ((t.lastPrice - t.firstPrice) / t.firstPrice) * 100 : null;
        const avg = t.scores.length ? t.scores.reduce((a, b) => a + b, 0) / t.scores.length : null;
        return {
          ticker: t.ticker, company: t.company, sector: t.sector,
          appearances: t.appearances,
          daysTracked: Math.max(1, Math.round((new Date(t.lastSeen) - new Date(t.firstSeen)) / 86400000)),
          firstSeen: t.firstSeen, lastSeen: t.lastSeen,
          firstPrice: t.firstPrice, lastPrice: t.lastPrice,
          priceChange: pc != null ? Math.round(pc * 10) / 10 : null,
          avgScore: avg != null ? Math.round(avg) : null
        };
      }).sort((a, b) => b.appearances - a.appearances);

      return res.status(200).json({
        engine, days,
        snapshots: rows.length,
        uniqueTickers: list.length,
        tickers: list.slice(0, 60)
      });
    }

    return res.status(400).json({ error: 'Unknown tool' });

  } catch (err) {
    console.error('Terminal tools error:', err);
    return res.status(500).json({ error: 'Request failed' });
  }
}
