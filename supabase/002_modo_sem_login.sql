-- 002_modo_sem_login.sql — miso4slope
-- Libera leitura/escrita sem autenticação enquanto não há tela de login.
-- PENDÊNCIA DE SEGURANÇA: qualquer pessoa com a URL + anon key consegue ler
-- e escrever nas tabelas. Aceitável enquanto for uso pessoal/único usuário.
-- Reverter para RLS por auth.uid() assim que o login for implementado
-- (as políticas originais, comentadas, estão no fim deste arquivo).

alter table projetos alter column user_id drop not null;

drop policy if exists "own data" on projetos;
drop policy if exists "own data" on sondagens;
drop policy if exists "own data" on camadas;
drop policy if exists "own data" on analises;

create policy "acesso aberto (sem login)" on projetos for all using (true) with check (true);
create policy "acesso aberto (sem login)" on sondagens for all using (true) with check (true);
create policy "acesso aberto (sem login)" on camadas for all using (true) with check (true);
create policy "acesso aberto (sem login)" on analises for all using (true) with check (true);

-- Políticas originais (por usuário), para restaurar quando houver login:
--
-- drop policy "acesso aberto (sem login)" on projetos;
-- drop policy "acesso aberto (sem login)" on sondagens;
-- drop policy "acesso aberto (sem login)" on camadas;
-- drop policy "acesso aberto (sem login)" on analises;
-- alter table projetos alter column user_id set not null;
--
-- create policy "own data" on projetos
--   using (auth.uid() = user_id);
-- create policy "own data" on sondagens
--   using (projeto_id in (
--     select id from projetos where user_id = auth.uid()
--   ));
-- create policy "own data" on camadas
--   using (sondagem_id in (
--     select id from sondagens where projeto_id in (
--       select id from projetos where user_id = auth.uid()
--     )
--   ));
-- create policy "own data" on analises
--   using (projeto_id in (
--     select id from projetos where user_id = auth.uid()
--   ));
