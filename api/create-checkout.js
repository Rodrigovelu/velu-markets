// api/create-checkout.js
// Crea una sesión de Stripe Checkout para que el usuario pague Pro o Terminal

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const PRICE_PRO = process.env.STRIPE_PRICE_PRO;
  const PRICE_TERMINAL = process.env.STRIPE_PRICE_TERMINAL;

  if (!STRIPE_SECRET) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const { email, plan } = req.body;
  if (!email || !plan) {
    return res.status(400).json({ error: 'email and plan are required' });
  }

  const priceId = plan === 'pro' ? PRICE_PRO : plan === 'terminal' ? PRICE_TERMINAL : null;
  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  // Determinar la URL base para los redirects (funciona en producción y previews de Vercel)
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'];
  const baseUrl = `${proto}://${host}`;

  try {
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('customer_email', email);
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', `${baseUrl}/?checkout=success&plan=${plan}`);
    params.append('cancel_url', `${baseUrl}/?checkout=cancelled`);
    params.append('metadata[email]', email);
    params.append('metadata[plan]', plan);
    // También guardar el email/plan en la subscripción para el webhook
    params.append('subscription_data[metadata][email]', email);
    params.append('subscription_data[metadata][plan]', plan);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error('Stripe checkout error:', session);
      return res.status(500).json({ error: 'Could not create checkout session', detail: session.error?.message });
    }

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Checkout failed', message: err.message });
  }
}
