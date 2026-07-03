-- schema.sql — miso4slope
-- Projetos de estabilidade de talude: geometria, camadas, sondagens e análises.

create table projetos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  nome text not null,
  descricao text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table sondagens (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid references projetos on delete cascade,
  nome text not null,
  cota_terreno numeric,           -- cota da boca do furo (m)
  na_profundidade numeric,        -- profundidade do NA (m)
  created_at timestamptz default now()
);

create table camadas (
  id uuid primary key default gen_random_uuid(),
  sondagem_id uuid references sondagens on delete cascade,
  nome text not null,
  y_top numeric,
  y_base numeric,
  depth_top numeric,
  depth_base numeric,
  c numeric not null,
  phi numeric not null,
  gamma numeric not null,
  n_spt numeric,
  soil_class text,
  ordem int not null
);

create table analises (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid references projetos on delete cascade,
  nome_secao text not null,
  method text not null default 'bishop',        -- 'bishop' | 'fellenius'
  geometry jsonb not null,                       -- SlopeGeometry
  layers jsonb not null,                         -- Layer[]
  fill jsonb not null,                           -- FillMaterial
  coverage jsonb,                                -- FaceCoverage
  fill_reference jsonb,                          -- CompactionReference
  fill_zones jsonb,                              -- FillZone[]
  n_slices int not null default 40,
  result jsonb,                                  -- AnalysisResult (null até calcular)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: cada usuário vê só seus dados
alter table projetos enable row level security;
alter table sondagens enable row level security;
alter table camadas enable row level security;
alter table analises enable row level security;

create policy "own data" on projetos
  using (auth.uid() = user_id);
create policy "own data" on sondagens
  using (projeto_id in (
    select id from projetos where user_id = auth.uid()
  ));
create policy "own data" on camadas
  using (sondagem_id in (
    select id from sondagens where projeto_id in (
      select id from projetos where user_id = auth.uid()
    )
  ));
create policy "own data" on analises
  using (projeto_id in (
    select id from projetos where user_id = auth.uid()
  ));
