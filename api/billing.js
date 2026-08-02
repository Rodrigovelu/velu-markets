// api/billing.js
// Todo lo de facturacion en una sola funcion serverless.
// Rutas por accion:
//   GET  /api/billing?action=status&email=...     -> plan actual (verificado en servidor)
//   POST /api/billing  {action:'checkout', ...}   -> nueva suscripcion
//   POST /api/billing  {action:'upgrade', ...}    -> cambiar plan existente
//   POST /api/billing  (con firma de Stripe)      -> webhook

import crypto from 'crypto';

const SUPABASE_URL = 'https://osrjmchajyrgdlucniid.supabase.co';

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString();
}

function sbHeaders(key) {
  return { 'apikey': key, 'Authorization': `Bearer ${key}` };
}

function verifyStripeSig(payload, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = sigHeader.split(',').reduce((a, p) => {
    const [k, v] = p.split('='); a[k] = v; return a;
  }, {});
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(`${parts.t}.${payload}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch { return false; }
}

async function upsertSub(key, data) {
  const body = { ...data, updated_at: new Date().toISOString() };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
  await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?on_conflict=email`, {
    method: 'POST',
    headers: { ...sbHeaders(key), 'Content-Type': 'application/json',
               'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body)
  });
}

export default async function handler(req, res) {
  const STRIPE = process.env.STRIPE_SECRET_KEY;
  const WH_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const PRICE_PRO = process.env.STRIPE_PRICE_PRO;
  const PRICE_TERMINAL = process.env.STRIPE_PRICE_TERMINAL;
  const SB = process.env.SUPABASE_KEY || 'sb_publishable_uL4sQ_T3HiCD6ZZ20D5thw_sc_gTK5F';

  // ── GET: consultar el plan ────────────────────────────
  if (req.method === 'GET') {
    const email = req.query?.email;
    if (!email) return res.status(400).json({ error: 'email required' });
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/subscriptions?email=eq.${encodeURIComponent(email)}&select=plan,status,current_period_end`,
        { headers: sbHeaders(SB) }
      );
      const rows = await r.json();
      const sub = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (!sub || sub.status !== 'active') return res.status(200).json({ plan: 'free' });
      if (sub.current_period_end && new Date(sub.current_period_end) < new Date()) {
        return res.status(200).json({ plan: 'free' });
      }
      return res.status(200).json({ plan: sub.plan || 'free' });
    } catch (e) {
      return res.status(200).json({ plan: 'free', error: true });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await rawBody(req);
  const sig = req.headers['stripe-signature'];

  // ── WEBHOOK de Stripe ─────────────────────────────────
  if (sig) {
    if (!WH_SECRET || !verifyStripeSig(body, sig, WH_SECRET)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    let event;
    try { event = JSON.parse(body); } catch { return res.status(400).json({ error: 'Bad payload' }); }

    try {
      const o = event.data.object;

      if (event.type === 'checkout.session.completed') {
        const email = o.customer_email || o.metadata?.email;
        const plan = o.metadata?.plan;
        if (email && plan) {
          await upsertSub(SB, {
            email, plan, stripe_customer_id: o.customer,
            stripe_subscription_id: o.subscription, status: 'active'
          });
        }
      }

      if (event.type === 'customer.subscription.updated') {
        const email = o.metadata?.email;
        const plan = o.metadata?.plan;
        const status = (o.status === 'active' || o.status === 'trialing') ? 'active' : 'inactive';
        if (email) {
          await upsertSub(SB, {
            email, plan: plan || undefined, stripe_subscription_id: o.id, status,
            current_period_end: o.current_period_end
              ? new Date(o.current_period_end * 1000).toISOString() : null
          });
        }
      }

      if (event.type === 'customer.subscription.deleted') {
        const email = o.metadata?.email;
        if (email) await upsertSub(SB, { email, plan: 'free', status: 'cancelled' });
      }

      return res.status(200).json({ received: true });
    } catch (e) {
      console.error('Webhook error:', e);
      return res.status(500).json({ error: 'Webhook failed' });
    }
  }

  // ── Acciones del usuario ──────────────────────────────
  let data;
  try { data = JSON.parse(body); } catch { return res.status(400).json({ error: 'Bad JSON' }); }
  const { action, email, plan, newPlan } = data;
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!STRIPE) return res.status(500).json({ error: 'Stripe not configured' });

  const priceOf = p => p === 'pro' ? PRICE_PRO : p === 'terminal' ? PRICE_TERMINAL : null;

  // ── CHECKOUT: suscripcion nueva ───────────────────────
  if (action === 'checkout') {
    const priceId = priceOf(plan);
    if (!priceId) return res.status(400).json({ error: 'Invalid plan' });

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const base = `${proto}://${req.headers['host']}`;

    const p = new URLSearchParams();
    p.append('mode', 'subscription');
    p.append('customer_email', email);
    p.append('line_items[0][price]', priceId);
    p.append('line_items[0][quantity]', '1');
    p.append('success_url', `${base}/?checkout=success&plan=${plan}`);
    p.append('cancel_url', `${base}/?checkout=cancelled`);
    p.append('metadata[email]', email);
    p.append('metadata[plan]', plan);
    p.append('subscription_data[metadata][email]', email);
    p.append('subscription_data[metadata][plan]', plan);

    // Pro incluye 7 dias de prueba. Stripe pide la tarjeta igual y cobra
    // automaticamente cuando termina, salvo que el usuario cancele antes.
    if (plan === 'pro') {
      p.append('subscription_data[trial_period_days]', '7');
      p.append('subscription_data[trial_settings][end_behavior][missing_payment_method]', 'cancel');
      p.append('payment_method_collection', 'always');
    }

    try {
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE}`,
                   'Content-Type': 'application/x-www-form-urlencoded' },
        body: p.toString()
      });
      const s = await r.json();
      if (!r.ok) {
        console.error('Checkout error:', s);
        return res.status(500).json({ error: s.error?.message || 'Checkout failed' });
      }
      return res.status(200).json({ url: s.url });
    } catch (e) {
      return res.status(500).json({ error: 'Checkout failed' });
    }
  }

  // ── UPGRADE: cambiar plan existente ───────────────────
  if (action === 'upgrade') {
    const newPriceId = priceOf(newPlan);
    if (!newPriceId) return res.status(400).json({ error: 'Invalid plan' });

    try {
      const subRes = await fetch(
        `${SUPABASE_URL}/rest/v1/subscriptions?email=eq.${encodeURIComponent(email)}&select=*`,
        { headers: sbHeaders(SB) }
      );
      const subs = await subRes.json();
      const sub = Array.isArray(subs) && subs[0] ? subs[0] : null;

      if (!sub || sub.status !== 'active' || !sub.stripe_subscription_id) {
        return res.status(400).json({ error: 'No active subscription', needsCheckout: true });
      }
      if (sub.plan === newPlan) {
        return res.status(200).json({ message: 'Already on this plan', plan: newPlan });
      }

      const sRes = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
        { headers: { 'Authorization': `Bearer ${STRIPE}` } });
      const sSub = await sRes.json();
      if (!sRes.ok) return res.status(500).json({ error: 'Could not read subscription' });

      const itemId = sSub.items?.data?.[0]?.id;
      if (!itemId) return res.status(500).json({ error: 'No billable item' });

      const p = new URLSearchParams();
      p.append('items[0][id]', itemId);
      p.append('items[0][price]', newPriceId);
      p.append('proration_behavior', 'create_prorations');
      p.append('metadata[email]', email);
      p.append('metadata[plan]', newPlan);

      const uRes = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE}`,
                   'Content-Type': 'application/x-www-form-urlencoded' },
        body: p.toString()
      });
      const upd = await uRes.json();
      if (!uRes.ok) {
        console.error('Upgrade error:', upd);
        return res.status(500).json({ error: upd.error?.message || 'Could not change plan' });
      }

      await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders(SB), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ plan: newPlan, updated_at: new Date().toISOString() })
      });

      return res.status(200).json({ message: 'Plan updated', plan: newPlan });
    } catch (e) {
      console.error('Upgrade failed:', e);
      return res.status(500).json({ error: 'Upgrade failed' });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
