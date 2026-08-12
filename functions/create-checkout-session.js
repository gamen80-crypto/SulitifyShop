// Cloudflare Pages Function: POST /create-checkout-session
// Skapar en Stripe Checkout Session server-side. Hemliga nyckeln (STRIPE_SECRET_KEY)
// läggs in som miljövariabel i Cloudflare Pages-dashboarden — den syns ALDRIG i frontend-koden.
//
// Förväntad body från frontend: { items: [{ name, price, qty }, ...] }
// price = kronor (t.ex. 299.00), Stripe vill ha ören (heltal), så vi multiplicerar med 100.

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.STRIPE_SECRET_KEY) {
    return new Response(
      JSON.stringify({ error: 'Stripe är inte konfigurerat än (STRIPE_SECRET_KEY saknas).' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Ogiltig förfrågan.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return new Response(JSON.stringify({ error: 'Kundvagnen är tom.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Bygg Stripe-parametrar (application/x-www-form-urlencoded, Stripes API-format)
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
    return new Response(
      JSON.stringify({ error: data.error?.message || 'Stripe-fel.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ url: data.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
