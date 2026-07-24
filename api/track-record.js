// api/track-record.js
// Devuelve las estadísticas del track record de Velu.
// El resumen (accuracy general) es público; el detalle de llamadas se marca para gating en el frontend.

export default async function handler(req, res) {
  const SUPABASE_URL = 'https://osrjmchajyrgdlucniid.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_uL4sQ_T3HiCD6ZZ20D5thw_sc_gTK5F';

  try {
    // Traer todas las llamadas cerradas (resueltas)
    const closedRes = await fetch(
      `${SUPABASE_URL}/rest/v1/velu_calls?status=eq.closed&select=*&order=checked_at.desc`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    const closed = await closedRes.json();

    // Traer llamadas abiertas (en progreso)
    const openRes = await fetch(
      `${SUPABASE_URL}/rest/v1/velu_calls?status=eq.open&select=*&order=called_at.desc`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    const open = await openRes.json();

    const closedArr = Array.isArray(closed) ? closed : [];
    const openArr = Array.isArray(open) ? open : [];

    const totalResolved = closedArr.length;
    const hits = closedArr.filter(c => c.hit === true).length;
    const accuracy = totalResolved > 0 ? Math.round((hits / totalResolved) * 100) : null;

    // Resumen público
    const summary = {
      totalCalls: closedArr.length + openArr.length,
      resolved: totalResolved,
      open: openArr.length,
      hits,
      misses: totalResolved - hits,
      accuracy
    };

    // Detalle (para Pro) — las últimas llamadas cerradas + abiertas
    const recentClosed = closedArr.slice(0, 20).map(c => ({
      ticker: c.ticker,
      company: c.company,
      verdict: c.verdict,
      entryPrice: c.entry_price,
      targetPrice: c.target_price,
      currentPrice: c.current_price,
      hit: c.hit,
      calledAt: c.called_at,
      checkedAt: c.checked_at
    }));

    const recentOpen = openArr.slice(0, 20).map(c => ({
      ticker: c.ticker,
      company: c.company,
      verdict: c.verdict,
      entryPrice: c.entry_price,
      targetPrice: c.target_price,
      currentPrice: c.current_price,
      calledAt: c.called_at
    }));

    return res.status(200).json({ summary, recentClosed, recentOpen });

  } catch (err) {
    console.error('Track record error:', err);
    return res.status(500).json({ error: 'Track record failed', message: err.message });
  }
}
