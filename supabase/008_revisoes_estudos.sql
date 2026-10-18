-- ------------------------------------------------------------
-- 008_revisoes_estudos.sql — miso4slope
--
-- Projeto ativo + Revisão (mesmo modelo do miso4dren):
--   Projeto > Revisão > estudos (análises de talude e estudos de contenção/muros)
--
-- 1) revisoes            : versões de um projeto ("Rev. 0", "Rev. 1"...)
-- 2) analises.revisao_id : cada análise de talude pertence a uma revisão
-- 3) estudos_contencao   : verificação de muros e pré-dimensionamentos
--                          (faixa de colunas, cortina, solo reforçado),
--                          gravados com entradas + resultado em JSON
-- 4) Migração do que já existe: todo projeto que já tem análises ganha uma
--    "Rev. 0" e as análises soltas passam a pertencer a ela.
--
-- NÃO é destrutivo: só cria tabelas/coluna (IF NOT EXISTS) e preenche
-- revisao_id onde está vazio. Pode ser rodado mais de uma vez.
-- Trava: aborta se for rodado no banco errado (sem as tabelas do slope).
-- ------------------------------------------------------------

do $$
begin
  if to_regclass('public.projetos') is null
     or to_regclass('public.analises') is null
     or to_regclass('public.sondagens') is null
     or to_regclass('public.camadas') is null then
    raise exception 'Banco errado: este script é do miso4slope e exige as tabelas projetos, analises, sondagens e camadas. Nada foi alterado.';
  end if;
end $$;

-- 1) Revisões
create table if not exists public.revisoes (
  id          uuid primary key default gen_random_uuid(),
  projeto_id  uuid not null references public.projetos(id) on delete cascade,
  nome        text not null,
  descricao   text,
  created_at  timestamptz not null default now()
);
create index if not exists revisoes_projeto_idx on public.revisoes (projeto_id);

-- 2) Análises de talude vinculadas à revisão
alter table public.analises
  add column if not exists revisao_id uuid references public.revisoes(id) on delete set null;
create index if not exists analises_revisao_idx on public.analises (revisao_id);

-- 3) Estudos de contenção / muros
create table if not exists public.estudos_contencao (
  id          uuid primary key default gen_random_uuid(),
  projeto_id  uuid not null references public.projetos(id) on delete cascade,
  revisao_id  uuid references public.revisoes(id) on delete cascade,
  -- 'muros' | 'faixa_colunas' | 'cortina' | 'solo_reforcado'
  tipo        text not null check (tipo in ('muros', 'faixa_colunas', 'cortina', 'solo_reforcado')),
  nome        text not null,
  dados       jsonb not null,   -- entradas + resultado do estudo
  resumo      jsonb,            -- números-chave p/ listagem (ex.: FS, status)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists estudos_contencao_projeto_idx on public.estudos_contencao (projeto_id);
create index if not exists estudos_contencao_revisao_idx on public.estudos_contencao (revisao_id);

-- RLS: mesmo padrão pós-SSO (007) — só usuários autenticados
alter table public.revisoes enable row level security;
alter table public.estudos_contencao enable row level security;

drop policy if exists "somente autenticados" on public.revisoes;
create policy "somente autenticados" on public.revisoes
  for all to authenticated using (true) with check (true);

drop policy if exists "somente autenticados" on public.estudos_contencao;
create policy "somente autenticados" on public.estudos_contencao
  for all to authenticated using (true) with check (true);

-- 4) Migração do existente: "Rev. 0" para cada projeto com análises soltas
insert into public.revisoes (projeto_id, nome, descricao)
select distinct a.projeto_id, 'Rev. 0', 'Criada na migração das análises já salvas'
from public.analises a
where a.revisao_id is null
  and a.projeto_id is not null
  and not exists (select 1 from public.revisoes r where r.projeto_id = a.projeto_id);

update public.analises a
set revisao_id = (
  select r.id from public.revisoes r
  where r.projeto_id = a.projeto_id
  order by r.created_at asc
  limit 1
)
where a.revisao_id is null
  and a.projeto_id is not null;
