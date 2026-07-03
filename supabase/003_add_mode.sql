-- 003_add_mode.sql — miso4slope
-- Adiciona o modo de análise (aterro/corte) na tabela de análises salvas.

alter table analises add column if not exists mode text not null default 'aterro';
