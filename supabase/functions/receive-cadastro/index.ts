/**
 * Edge Function: receive-cadastro
 *
 * Recebe um cadastro canônico (hoje: Cliente) despachado pelo hub
 * miso4apps (dispatch-cadastro) e faz upsert na tabela local `clientes`.
 *
 * Autenticação: chamado pelo hub usando a service_role_key deste projeto
 * (armazenada em app_settings no hub) — o próprio Supabase já valida o JWT.
 *
 * Body: { tipo: "cliente", canonical_id: string, payload: CanonicalCliente }
 * Retorna: { id: string } — id do registro local em `clientes`
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface CanonicalCliente {
  tipo: "PF" | "PJ";
  nome: string;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { tipo, canonical_id, payload } = (await req.json()) as {
    tipo: string;
    canonical_id: string;
    payload: CanonicalCliente;
  };

  if (tipo !== "cliente") {
    return new Response(JSON.stringify({ error: `Unsupported tipo: ${tipo}` }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const record = {
    nome: payload.nome,
    documento: payload.documento || null,
    email: payload.email || null,
    telefone: payload.telefone || null,
    hub_cadastro_record_id: canonical_id,
  };

  const { data: byLink } = await supabase
    .from("clientes")
    .select("id")
    .eq("hub_cadastro_record_id", canonical_id)
    .maybeSingle();

  if (byLink) {
    const { error } = await supabase.from("clientes").update(record).eq("id", byLink.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ id: byLink.id }), { status: 200 });
  }

  let existing: { id: string } | null = null;
  if (record.documento) {
    const { data } = await supabase.from("clientes").select("id").eq("documento", record.documento).maybeSingle();
    existing = data;
  }
  if (!existing) {
    const { data } = await supabase.from("clientes").select("id").eq("nome", record.nome).maybeSingle();
    existing = data;
  }

  if (existing) {
    const { error } = await supabase.from("clientes").update(record).eq("id", existing.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ id: existing.id }), { status: 200 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("clientes")
    .insert(record)
    .select("id")
    .single();

  if (insertError || !inserted) {
    return new Response(JSON.stringify({ error: insertError?.message ?? "Insert failed" }), { status: 500 });
  }

  return new Response(JSON.stringify({ id: inserted.id }), { status: 200 });
});
