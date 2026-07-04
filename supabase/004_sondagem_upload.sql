-- 004_sondagem_upload.sql — miso4slope
-- Bucket de armazenamento para os arquivos de boletim de sondagem enviados,
-- e a referência a esse arquivo na tabela sondagens.

insert into storage.buckets (id, name, public)
values ('sondagens', 'sondagens', true)
on conflict (id) do nothing;

-- Sem login ainda (mesmo racional do 002_modo_sem_login.sql): qualquer um
-- com a anon key consegue enviar/ler/remover arquivos deste bucket.
-- PENDÊNCIA DE SEGURANÇA: restringir por usuário quando houver login.
drop policy if exists "acesso aberto (sem login) - leitura sondagens" on storage.objects;
drop policy if exists "acesso aberto (sem login) - upload sondagens" on storage.objects;
drop policy if exists "acesso aberto (sem login) - delete sondagens" on storage.objects;

create policy "acesso aberto (sem login) - leitura sondagens" on storage.objects
  for select using (bucket_id = 'sondagens');
create policy "acesso aberto (sem login) - upload sondagens" on storage.objects
  for insert with check (bucket_id = 'sondagens');
create policy "acesso aberto (sem login) - delete sondagens" on storage.objects
  for delete using (bucket_id = 'sondagens');

alter table sondagens add column if not exists file_path text;
alter table sondagens add column if not exists file_name text;
