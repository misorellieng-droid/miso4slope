-- ------------------------------------------------------------
-- 009_cptu.sql — miso4slope (schema "slope" do banco do hub)
--
-- Módulo de interpretação de CPTu:
--   Projeto (do hub) > Revisão > Análise CPTu > Furos (leituras e zonas)
--
-- 1) slope.cptu_analises : uma análise por conjunto de parâmetros
--                          (parâmetros do projeto, premissas de tempo e
--                          drenos, chaves das melhorias)
-- 2) slope.cptu_furos    : cabeçalho de cada furo; leituras e zonas ficam
--                          em jsonb (lista), gravadas de uma vez com o furo
--
-- Segue o padrão da 008: projeto = public.central_projects (hub),
-- account_id preenchido por gatilho (função própria do CPTu, para não mexer
-- em slope.define_conta), política acesso_app e as portas 1 e 2
-- (public.aplicar_guardas). NÃO é destrutivo e pode ser rodado de novo.
-- Trava: aborta se não for o banco do hub com o schema slope e a 008 rodada.
-- ------------------------------------------------------------
begin;

do $$
begin
  if to_regclass('slope.revisoes') is null
     or to_regclass('slope.analises') is null
     or to_regclass('slope.projetos') is null
     or to_regclass('public.central_projects') is null
     or to_regclass('public.contas') is null then
    raise exception 'Banco errado ou 008 não rodada: este script é do miso4slope e exige o schema slope (revisoes, analises, projetos) e public.central_projects do hub. Nada foi alterado.';
  end if;
end $$;

-- 1) Análises CPTu
create table if not exists slope.cptu_analises (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.contas(id),
  projeto_id       uuid not null references public.central_projects(id) on delete cascade,
  revisao_id       uuid references slope.revisoes(id) on delete cascade,
  nome             text not null,
  parametros       jsonb not null default '{}'::jsonb,  -- ParametrosCptu
  premissas_tempo  jsonb not null default '{}'::jsonb,  -- PremissasTempo (cv, drenos, prazo)
  opcoes           jsonb not null default '{}'::jsonb,  -- chaves das melhorias (desligadas por padrão)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_slope_cptu_analises_account on slope.cptu_analises (account_id);
create index if not exists idx_slope_cptu_analises_projeto on slope.cptu_analises (projeto_id);
create index if not exists idx_slope_cptu_analises_revisao on slope.cptu_analises (revisao_id);

-- 2) Furos
create table if not exists slope.cptu_furos (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.contas(id),
  analise_id       uuid not null references slope.cptu_analises(id) on delete cascade,
  ordem            integer not null default 0,
  nome             text not null,
  na               numeric not null,           -- N.A. (m)
  prof_apoio       numeric not null,           -- topo da areia de apoio = limite da soma do recalque (m)
  esp_argila_mole  numeric not null,           -- espessura de argila mole (m)
  prof_total       numeric,                    -- m
  recalque_guia    numeric,                    -- valor de referência do guia (m)
  coord_e          numeric,
  coord_n          numeric,
  cota_boca        numeric,
  t50              numeric,                    -- s, ensaio de dissipação (quando houver)
  leituras         jsonb not null default '[]'::jsonb check (jsonb_typeof(leituras) = 'array'),
  zonas            jsonb not null default '[]'::jsonb check (jsonb_typeof(zonas) = 'array'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (analise_id, nome)
);
create index if not exists idx_slope_cptu_furos_account on slope.cptu_furos (account_id);
create index if not exists idx_slope_cptu_furos_analise on slope.cptu_furos (analise_id);

-- account_id preenchido sozinho: a análise herda do projeto do hub e o furo
-- herda da análise
create or replace function slope.define_conta_cptu()
returns trigger
language plpgsql security definer
set search_path = slope, public
as $$
declare
  v_pai uuid;
begin
  if tg_table_name = 'cptu_analises' then
    select account_id into v_pai from public.central_projects where id = new.projeto_id;
  elsif tg_table_name = 'cptu_furos' then
    select account_id into v_pai from slope.cptu_analises where id = new.analise_id;
  end if;

  new.account_id := coalesce(v_pai, new.account_id, public.minha_conta());
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['cptu_analises', 'cptu_furos'] loop
    execute format('drop trigger if exists trg_define_conta on slope.%I', t);
    execute format('create trigger trg_define_conta before insert or update on slope.%I
                    for each row execute function slope.define_conta_cptu()', t);
  end loop;
end $$;

-- Permissões e regra própria (o isolamento por conta vem das portas 1 e 2)
grant select, insert, update, delete on slope.cptu_analises, slope.cptu_furos to authenticated;
grant all on slope.cptu_analises, slope.cptu_furos to service_role;
revoke all on slope.cptu_analises, slope.cptu_furos from anon;

do $$
declare t text;
begin
  foreach t in array array['cptu_analises', 'cptu_furos'] loop
    execute format('alter table slope.%I enable row level security', t);
    execute format('drop policy if exists acesso_app on slope.%I', t);
    execute format('create policy acesso_app on slope.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Reaplica as portas 1 e 2 em todas as tabelas do schema (inclui as novas)
select * from public.aplicar_guardas('slope', 'miso4slope');

commit;

-- Conferência
select
  (select count(*) from slope.cptu_analises) as analises_cptu,
  (select count(*) from slope.cptu_furos)    as furos_cptu,
  (select count(*) from pg_policies where schemaname = 'slope' and tablename in ('cptu_analises', 'cptu_furos')) as politicas;
