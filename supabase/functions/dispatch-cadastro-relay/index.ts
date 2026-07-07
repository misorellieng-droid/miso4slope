/**
 * Edge Function: dispatch-cadastro-relay
 *
 * Ponte entre o frontend do miso4slope e o dispatch-cadastro do hub
 * miso4apps. Existe porque este app é uma SPA (sem servidor próprio) — o
 * DISPATCH_SECRET não pode viver no cliente, então esta function o guarda
 * como env var e repassa a chamada.
 *
 * Body: { source_record_id, tipo, payload, target_app_slugs }
 */

const HUB_URL = "https://ijbnpljvywzsoxuymmko.supabase.co";
const SOURCE_APP_SLUG = "miso4slope";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const secret = Deno.env.get("DISPATCH_SECRET");
  if (!secret) {
    return new Response(JSON.stringify({ error: "DISPATCH_SECRET não configurado neste ambiente" }), { status: 500 });
  }

  const body = await req.json();

  try {
    const resp = await fetch(`${HUB_URL}/functions/v1/dispatch-cadastro`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        source_app_slug: SOURCE_APP_SLUG,
        source_record_id: body.source_record_id,
        tipo: body.tipo,
        payload: body.payload,
        target_app_slugs: body.target_app_slugs,
      }),
    });

    const result = await resp.json();
    return new Response(JSON.stringify(result), { status: resp.status });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500 });
  }
});
