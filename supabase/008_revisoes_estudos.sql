-- ------------------------------------------------------------
-- 008_revisoes_estudos.sql — miso4slope (schema "slope" do banco do hub)
--
-- Projeto ativo + Revisão (mesmo modelo do miso4dren):
--   Projeto (do hub) > Revisão > estudos (talude e contenção/muros)
--
-- 1) slope.revisoes            : versões de um projeto ("Rev. 0", "Rev. 1"...)
-- 2) slope.analises.revisao_id : cada análise de talude pertence a uma revisão
-- 3) slope.estudos_contencao   : verificação de muros e pré-dimensionamentos
--                                (faixa de colunas, cortina, solo reforçado)
-- 4) Migração do que já existe: todo projeto com análises ganha "Rev. 0" e as
--    análises soltas passam a pertencer a ela.
--
-- Segue o padrão do schema slope: projeto = public.central_projects (hub),
-- account_id preenchido por gatilho, política acesso_app e as portas 1 e 2
-- (public.aplicar_guardas). NÃO é destrutivo e pode ser rodado de novo.
-- Trava: aborta se não for o banco do hub com o schema slope.
-- ------------------------------------------------------------
begin;

do $$
begin
  if to_regclass('slope.analises') is null
     or to_regclass('slope.sondagens') is null
     or to_regclass('slope.camadas') is null
     or to_regclass('slope.projetos') is null
     or to_regclass('public.central_projects') is null
     or to_regclass('public.contas') is null then
    raise exception 'Banco errado: este script é do miso4slope e exige o schema slope (analises, sondagens, camadas, projetos) e public.central_projects do hub. Nada foi alterado.';
  end if;
end $$;

-- 1) Revisões
create table if not exists slope.revisoes (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.contas(id),
  projeto_id  uuid not null references public.central_projects(id) on delete cascade,
  nome        text not null,
  descricao   text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_slope_revisoes_account on slope.revisoes (account_id);
create index if not exists idx_slope_revisoes_projeto on slope.revisoes (projeto_id);

-- 2) Análises de talude vinculadas à revisão
alter table slope.analises
  add column if not exists revisao_id uuid references slope.revisoes(id) on delete set null;
create index if not exists idx_slope_analises_revisao on slope.analises (revisao_id);

-- 3) Estudos de contenção / muros
create table if not exists slope.estudos_contencao (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.contas(id),
  projeto_id  uuid not null references public.central_projects(id) on delete cascade,
  revisao_id  uuid references slope.revisoes(id) on delete cascade,
  -- 'muros' | 'faixa_colunas' | 'cortina' | 'solo_reforcado'
  tipo        text not null check (tipo in ('muros', 'faixa_colunas', 'cortina', 'solo_reforcado')),
  nome        text not null,
  dados       jsonb not null,   -- entradas + resultado do estudo
  resumo      jsonb,            -- números-chave p/ listagem (ex.: FS, status)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_slope_estudos_account on slope.estudos_contencao (account_id);
create index if not exists idx_slope_estudos_projeto on slope.estudos_contencao (projeto_id);
create index if not exists idx_slope_estudos_revisao on slope.estudos_contencao (revisao_id);

-- account_id preenchido sozinho (herda do projeto do hub), como nas outras tabelas
create or replace function slope.define_conta()
returns trigger
language plpgsql security definer
set search_path = slope, public
as $$
declare
  v_linha jsonb := to_jsonb(new);
  v_pai   uuid;
begin
  if tg_table_name in ('sondagens', 'analises', 'projetos_dados', 'revisoes', 'estudos_contencao') then
    select account_id into v_pai
    from public.central_projects
    where id = coalesce((v_linha ->> 'projeto_id')::uuid, null);
    if tg_table_name = 'projetos_dados' then
      new.user_id := coalesce(new.user_id, auth.uid());
    end if;
  elsif tg_table_name = 'camadas' then
    select account_id into v_pai
    from slope.sondagens where id = (v_linha ->> 'sondagem_id')::uuid;
  end if;

  new.account_id := coalesce(v_pai, new.account_id, public.minha_conta());
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['revisoes', 'estudos_contencao'] loop
    execute format('drop trigger if exists trg_define_conta on slope.%I', t);
    execute format('create trigger trg_define_conta before insert or update on slope.%I
                    for each row execute function slope.define_conta()', t);
  end loop;
end $$;

-- Permissões e regra própria (o isolamento por conta vem das portas 1 e 2)
grant select, insert, update, delete on slope.revisoes, slope.estudos_contencao to authenticated;
grant all on slope.revisoes, slope.estudos_contencao to service_role;
revoke all on slope.revisoes, slope.estudos_contencao from anon;

do $$
declare t text;
begin
  foreach t in array array['revisoes', 'estudos_contencao'] loop
    execute format('alter table slope.%I enable row level security', t);
    execute format('drop policy if exists acesso_app on slope.%I', t);
    execute format('create policy acesso_app on slope.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Reaplica as portas 1 e 2 em todas as tabelas do schema (inclui as novas)
select * from public.aplicar_guardas('slope', 'miso4slope');

-- 4) Migração do existente: "Rev. 0" para cada projeto com análises soltas
insert into slope.revisoes (projeto_id, nome, descricao)
select distinct a.projeto_id, 'Rev. 0', 'Criada na migração das análises já salvas'
from slope.analises a
where a.revisao_id is null
  and a.projeto_id is not null
  and not exists (select 1 from slope.revisoes r where r.projeto_id = a.projeto_id);

update slope.analises a
set revisao_id = (
  select r.id from slope.revisoes r
  where r.projeto_id = a.projeto_id
  order by r.created_at asc
  limit 1
)
where a.revisao_id is null
  and a.projeto_id is not null;

commit;

-- Conferência
select
  (select count(*) from slope.revisoes)                                  as revisoes,
  (select count(*) from slope.analises where revisao_id is null)         as analises_sem_revisao,
  (select count(*) from slope.estudos_contencao)                         as estudos;
