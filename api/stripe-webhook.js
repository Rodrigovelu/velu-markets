// api/stripe-webhook.js
// Recibe eventos de Stripe (pago exitoso, cancelación, etc.) y actualiza
// el plan del usuario en Supabase. Verifica la firma para que nadie pueda
// falsificar un "pago exitoso" llamando a este endpoint directamente.

import crypto from 'crypto';

export const config = {
  api: { bodyParser: false }  // Necesitamos el raw body para verificar la firma
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const SUPABASE_URL = 'https://osrjmchajyrgdlucniid.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_uL4sQ_T3HiCD6ZZ20D5thw_sc_gTK5F';

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  if (!WEBHOOK_SECRET || !verifyStripeSignature(rawBody.toString(), sig, WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch (e) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  try {
    const obj = event.data.object;

    // Un checkout se completó -> el usuario acaba de suscribirse
    if (event.type === 'checkout.session.completed') {
      const email = obj.customer_email || obj.metadata?.email;
      const plan = obj.metadata?.plan;
      const customerId = obj.customer;
      const subscriptionId = obj.subscription;

      if (email && plan) {
        await upsertSubscription(SUPABASE_URL, SUPABASE_KEY, {
          email,
          plan,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: 'active'
        });
      }
    }

    // La suscripción se actualizó (renovación, cambio de plan)
    if (event.type === 'customer.subscription.updated') {
      const email = obj.metadata?.email;
      const plan = obj.metadata?.plan;
      const status = obj.status === 'active' || obj.status === 'trialing' ? 'active' : 'inactive';
      const periodEnd = obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null;

      if (email) {
        await upsertSubscription(SUPABASE_URL, SUPABASE_KEY, {
          email,
          plan: plan || undefined,
          stripe_subscription_id: obj.id,
          status,
          current_period_end: periodEnd
        });
      }
    }

    // La suscripción se canceló -> el usuario vuelve a Free
    if (event.type === 'customer.subscription.deleted') {
      const email = obj.metadata?.email;
      if (email) {
        await upsertSubscription(SUPABASE_URL, SUPABASE_KEY, {
          email,
          plan: 'free',
          status: 'cancelled'
        });
      }
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

async function upsertSubscription(url, key, data) {
  const body = { ...data, updated_at: new Date().toISOString() };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

  await fetch(`${url}/rest/v1/subscriptions?on_conflict=email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(body)
  });
}
