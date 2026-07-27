// api/upgrade-subscription.js
// Cambia el plan de una suscripcion EXISTENTE (Pro -> Terminal o viceversa)
// sin pedir tarjeta de nuevo. Stripe prorratea automaticamente: cobra solo
// la diferencia por el tiempo que resta del ciclo actual.

const SUPABASE_URL = 'https://osrjmchajyrgdlucniid.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const PRICE_PRO = process.env.STRIPE_PRICE_PRO;
  const PRICE_TERMINAL = process.env.STRIPE_PRICE_TERMINAL;
  const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_uL4sQ_T3HiCD6ZZ20D5thw_sc_gTK5F';

  if (!STRIPE_SECRET) return res.status(500).json({ error: 'Stripe not configured' });

  const { email, newPlan } = req.body;
  if (!email || !newPlan) return res.status(400).json({ error: 'email and newPlan are required' });

  const newPriceId = newPlan === 'pro' ? PRICE_PRO : newPlan === 'terminal' ? PRICE_TERMINAL : null;
  if (!newPriceId) return res.status(400).json({ error: 'Invalid plan' });

  const H = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` };

  try {
    // 1. Buscar la suscripcion activa del usuario
    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?email=eq.${encodeURIComponent(email)}&select=*`,
      { headers: H }
    );
    const subs = await subRes.json();
    const sub = Array.isArray(subs) && subs[0] ? subs[0] : null;

    if (!sub || sub.status !== 'active' || !sub.stripe_subscription_id) {
      return res.status(400).json({
        error: 'No active subscription found. Use checkout to subscribe first.',
        needsCheckout: true
      });
    }

    if (sub.plan === newPlan) {
      return res.status(200).json({ message: 'Already on this plan', plan: newPlan });
    }

    // 2. Traer la suscripcion de Stripe para obtener el item a reemplazar
    const stripeSubRes = await fetch(
      `https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
      { headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` } }
    );
    const stripeSub = await stripeSubRes.json();

    if (!stripeSubRes.ok) {
      console.error('Stripe fetch sub error:', stripeSub);
      return res.status(500).json({ error: 'Could not read your subscription from Stripe' });
    }

    const itemId = stripeSub.items?.data?.[0]?.id;
    if (!itemId) return res.status(500).json({ error: 'Subscription has no billable item' });

    // 3. Actualizar el item al nuevo precio, con prorrateo
    const params = new URLSearchParams();
    params.append('items[0][id]', itemId);
    params.append('items[0][price]', newPriceId);
    params.append('proration_behavior', 'create_prorations');
    params.append('metadata[email]', email);
    params.append('metadata[plan]', newPlan);

    const updateRes = await fetch(
      `https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      }
    );
    const updated = await updateRes.json();

    if (!updateRes.ok) {
      console.error('Stripe upgrade error:', updated);
      return res.status(500).json({ error: updated.error?.message || 'Could not change plan' });
    }

    // 4. Reflejar el cambio de inmediato en Supabase (el webhook tambien lo hara,
    //    pero esto evita que la UI muestre el plan viejo mientras llega el evento)
    await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ plan: newPlan, updated_at: new Date().toISOString() })
    });

    return res.status(200).json({
      message: 'Plan updated',
      plan: newPlan,
      currentPeriodEnd: updated.current_period_end
        ? new Date(updated.current_period_end * 1000).toISOString() : null
    });

  } catch (err) {
    console.error('Upgrade error:', err);
    return res.status(500).json({ error: 'Upgrade failed', message: err.message });
  }
}
