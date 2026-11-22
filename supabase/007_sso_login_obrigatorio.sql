-- ------------------------------------------------------------
-- 007_sso_login_obrigatorio.sql — miso4slope
--
-- Fim do "modo sem login" (002_modo_sem_login.sql, 004_sondagem_upload.sql): o acesso passa a ser
-- só pelo MISO4Apps (SSO, Contrato v1 — ver server.cjs). Quem não tem
-- acesso liberado no hub não recebe token, e sem token não há usuário
-- aqui (cadastro público desligado no painel do Supabase).
--
-- 1) Tabela anti-replay usada pelo /api/sso (só o service_role toca).
-- 2) Toda policy que hoje vale para anon/public (tabelas e storage)
--    passa a valer só para usuários autenticados. As condições de cada
--    policy continuam as mesmas — só muda QUEM pode usá-las.
--
-- Obs.: o bucket "sondagens" continua público para leitura por URL direta
-- (o app usa getPublicUrl); listar/enviar/remover passam a exigir login.
-- ------------------------------------------------------------

create table if not exists public.sso_redeemed_tokens (
  jti          text primary key,
  redeemed_at  timestamptz not null default now()
);

alter table public.sso_redeemed_tokens enable row level security;

do $$
declare
  pol record;
  tbl record;
begin
  -- Tabelas que ficaram sem RLS nenhuma (abertas para quem tiver a anon
  -- key): liga o RLS e libera só para autenticados.
  for tbl in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      and c.relname <> 'sso_redeemed_tokens'
  loop
    execute format('alter table public.%I enable row level security', tbl.relname);
    execute format('create policy "somente autenticados" on public.%I for all to authenticated using (true) with check (true)', tbl.relname);
    raise notice 'RLS ligado: public.%', tbl.relname;
  end loop;

  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname in ('public', 'storage')
      and (roles @> array['public']::name[] or roles @> array['anon']::name[])
  loop
    begin
      execute format('alter policy %I on %I.%I to authenticated',
                     pol.policyname, pol.schemaname, pol.tablename);
      raise notice 'Restrita a authenticated: %.% — %', pol.schemaname, pol.tablename, pol.policyname;
    exception when insufficient_privilege then
      -- storage.objects pode não pertencer ao usuário do SQL Editor; a
      -- conferência no fim mostra o que sobrou para ajustar pelo painel.
      raise warning 'Sem permissão para alterar %.% — %', pol.schemaname, pol.tablename, pol.policyname;
    end;
  end loop;
end $$;

-- Conferência: deve voltar vazio (nenhuma policy aberta para anon/public)
select schemaname, tablename, policyname, roles
from pg_policies
where schemaname in ('public', 'storage')
  and (roles @> array['public']::name[] or roles @> array['anon']::name[]);
