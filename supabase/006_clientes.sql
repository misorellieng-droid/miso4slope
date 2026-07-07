-- Real Cliente registry (was missing entirely — projetos only had
-- nome/descricao before). Mirrors the "acesso aberto (sem login)" policy
-- already used on projetos/sondagens/analises in this app's no-login mode.

CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  documento text,
  email text,
  telefone text,
  hub_cadastro_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acesso aberto (sem login)" ON clientes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE projetos ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES clientes(id);
