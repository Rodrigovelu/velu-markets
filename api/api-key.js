// api/api-key.js
// Genera y devuelve la llave de API del usuario (solo plan Terminal).
// La llave existe y se muestra; la verificacion en cada endpoint publico
// se construira cuando abramos el API al publico.

const SUPABASE_URL = 'https://osrjmchajyrgdlucniid.supabase.co';

function genKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 40; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return 'velu_live_' + out;
}

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_KEY || 'sb_publishable_uL4sQ_T3HiCD6ZZ20D5thw_sc_gTK5F';
  const email = req.method === 'POST' ? req.body?.email : req.query?.email;
  if (!email) return res.status(400).json({ error: 'email required' });

  const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` };

  try {
    // 1. Verificar que el usuario realmente tenga plan Terminal
    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?email=eq.${encodeURIComponent(email)}&select=plan,status`,
      { headers: H }
    );
    const subs = await subRes.json();
    const sub = Array.isArray(subs) && subs[0] ? subs[0] : null;

    if (!sub || sub.status !== 'active' || sub.plan !== 'terminal') {
      return res.status(403).json({ error: 'API access requires the Terminal plan' });
    }

    // 2. Devolver la llave existente si ya la tiene
    const existRes = await fetch(
      `${SUPABASE_URL}/rest/v1/api_keys?email=eq.${encodeURIComponent(email)}&select=api_key,created_at,request_count`,
      { headers: H }
    );
    const rows = await existRes.json();
    if (Array.isArray(rows) && rows[0]) {
      return res.status(200).json({
        apiKey: rows[0].api_key,
        createdAt: rows[0].created_at,
        requestCount: rows[0].request_count || 0
      });
    }

    // 3. Crear una nueva
    const apiKey = genKey();
    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/api_keys`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ email, api_key: apiKey })
    });

    if (!insRes.ok) {
      const t = await insRes.text();
      console.error('API key insert failed:', t);
      return res.status(500).json({ error: 'Could not create API key' });
    }

    return res.status(200).json({ apiKey, createdAt: new Date().toISOString(), requestCount: 0 });

  } catch (err) {
    console.error('API key error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
