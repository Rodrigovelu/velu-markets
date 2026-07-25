// api/check-subscription.js
// Verifica el plan REAL de un usuario consultando Supabase desde el servidor.
// Esta es la fuente de verdad — el frontend ya no decide el plan, solo lo muestra.

export default async function handler(req, res) {
  const SUPABASE_URL = 'https://osrjmchajyrgdlucniid.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_uL4sQ_T3HiCD6ZZ20D5thw_sc_gTK5F';

  const email = req.method === 'POST' ? req.body?.email : req.query?.email;
  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?email=eq.${encodeURIComponent(email)}&select=plan,status,current_period_end`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    const rows = await r.json();
    const sub = Array.isArray(rows) && rows[0] ? rows[0] : null;

    // Si no hay suscripción registrada, o está inactiva/cancelada, es Free
    if (!sub || sub.status !== 'active') {
      return res.status(200).json({ plan: 'free' });
    }

    // Verificar que no haya expirado
    if (sub.current_period_end && new Date(sub.current_period_end) < new Date()) {
      return res.status(200).json({ plan: 'free' });
    }

    return res.status(200).json({ plan: sub.plan || 'free' });

  } catch (err) {
    console.error('Check subscription error:', err);
    // En caso de error, degradar a Free por seguridad (no dar acceso Pro por defecto)
    return res.status(200).json({ plan: 'free', error: true });
  }
}
