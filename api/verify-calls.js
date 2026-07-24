// api/verify-calls.js
// Verifica las llamadas abiertas de Velu contra precios actuales.
// Una llamada BUY "acierta" si el precio subió hacia el target (o lo superó).
// Una llamada SELL "acierta" si el precio bajó.
// Se puede llamar manualmente o con un cron de Vercel.

export default async function handler(req, res) {
  const FMP = process.env.FMP_API_KEY;
  const SUPABASE_URL = 'https://osrjmchajyrgdlucniid.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_uL4sQ_T3HiCD6ZZ20D5thw_sc_gTK5F';

  if (!FMP) return res.status(500).json({ error: 'FMP key missing' });

  try {
    // 1. Traer llamadas abiertas con más de 7 días (dar tiempo a que se muevan)
    const callsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/velu_calls?status=eq.open&select=*`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    const calls = await callsRes.json();

    if (!Array.isArray(calls) || calls.length === 0) {
      return res.status(200).json({ message: 'No open calls to verify', checked: 0 });
    }

    let verified = 0;

    for (const call of calls) {
      // Solo verificar llamadas con al menos 7 días de antigüedad
      const daysSince = (Date.now() - new Date(call.called_at)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) continue;

      // Traer precio actual
      const qRes = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=${call.ticker}&apikey=${FMP}`);
      const qArr = await qRes.json();
      const quote = Array.isArray(qArr) ? qArr[0] : null;
      if (!quote || !quote.price) continue;

      const currentPrice = quote.price;
      const entry = call.entry_price;

      // Determinar si acertó
      let hit = false;
      let status = 'open';

      if (call.verdict === 'BUY') {
        // Acierta si subió al menos 5% (dirección correcta) o alcanzó el target
        const pctMove = ((currentPrice - entry) / entry) * 100;
        if (call.target_price && currentPrice >= call.target_price) { hit = true; status = 'closed'; }
        else if (daysSince >= 90) {
          // Cerrar a los 90 días: acertó si subió 5%+
          hit = pctMove >= 5;
          status = 'closed';
        }
      } else if (call.verdict === 'SELL') {
        const pctMove = ((currentPrice - entry) / entry) * 100;
        if (daysSince >= 90) {
          hit = pctMove <= -5;
          status = 'closed';
        }
      }

      // Actualizar la llamada
      if (status === 'closed') {
        await fetch(`${SUPABASE_URL}/rest/v1/velu_calls?id=eq.${call.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            current_price: currentPrice,
            hit,
            status,
            checked_at: new Date().toISOString()
          })
        });
        verified++;
      } else {
        // Actualizar solo el precio actual sin cerrar
        await fetch(`${SUPABASE_URL}/rest/v1/velu_calls?id=eq.${call.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            current_price: currentPrice,
            checked_at: new Date().toISOString()
          })
        });
      }
    }

    return res.status(200).json({ message: 'Verification complete', checked: calls.length, closed: verified });

  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ error: 'Verification failed', message: err.message });
  }
}
