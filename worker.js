// Sulitify — huvud-Worker.
// Serverar sajtens statiska filer (index.html, sw.js, bilder osv via ASSETS-bindningen)
// och hanterar dessutom /create-checkout-session för Stripe-betalningar.
// STRIPE_SECRET_KEY läggs in som en riktig Secret-bindning i Cloudflare (Settings → Variables and secrets
// på Worker-nivå, INTE i "Build configuration"-sektionen — den är bara för build-tid).

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/create-checkout-session' && request.method === 'POST') {
      return handleCreateCheckoutSession(request, env);
    }

    // Allt annat: servera statiska filer precis som förut
    return env.ASSETS.fetch(request);
  },
};

async function handleCreateCheckoutSession(request, env) {
  if (!env.STRIPE_SECRET_KEY) {
    return jsonResponse({ error: 'Stripe är inte konfigurerat än (STRIPE_SECRET_KEY saknas).' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Ogiltig förfrågan.' }, 400);
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return jsonResponse({ error: 'Kundvagnen är tom.' }, 400);
  }

  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('payment_method_types[0]', 'card');
  params.append('payment_method_types[1]', 'klarna');

  items.forEach((item, i) => {
    const name = String(item.name || 'Produkt').slice(0, 200);
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    const priceSek = parseFloat(item.price) || 0;
    const unitAmountOre = Math.round(priceSek * 100);

    params.append(`line_items[${i}][price_data][currency]`, 'sek');
    params.append(`line_items[${i}][price_data][product_data][name]`, name);
    params.append(`line_items[${i}][price_data][unit_amount]`, String(unitAmountOre));
    params.append(`line_items[${i}][quantity]`, String(qty));
  });

  const origin = new URL(request.url).origin;
  params.append('success_url', `${origin}/?checkout=success`);
  params.append('cancel_url', `${origin}/?checkout=cancelled`);

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await stripeRes.json();

  if (!stripeRes.ok) {
    return jsonResponse({ error: data.error?.message || 'Stripe-fel.' }, 500);
  }

  return jsonResponse({ url: data.url }, 200);
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
