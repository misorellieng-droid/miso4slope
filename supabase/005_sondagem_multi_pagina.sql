-- 005_sondagem_multi_pagina.sql — miso4slope
-- Suporte a relatórios de sondagem com várias sondagens num único PDF
-- (cada sondagem ocupando uma ou mais páginas — às vezes uma sondagem se
-- estende por duas folhas). O arquivo original (file_path/file_name) já é
-- compartilhado entre todas as sondagens extraídas do mesmo relatório;
-- page_start/page_end registram qual trecho do PDF corresponde a cada uma,
-- pra abrir direto na página certa ao conferir contra o boletim original.

alter table sondagens add column if not exists page_start integer;
alter table sondagens add column if not exists page_end integer;
