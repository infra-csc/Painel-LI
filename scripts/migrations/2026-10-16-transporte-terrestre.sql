-- 16/10/2026 — transporte terrestre da vaga em Passagens (dono: "aqui ter a
-- opção de colocar vai de carro ou van. Van precisa informar o nome da empresa
-- e o valor; carro, só o valor do carro").
-- Um registro por vaga e perna (ida/volta). A perna terrestre não precisa de
-- passagem; o valor é só registrado (não entra no Planejado/Realizado).
-- Aditiva e idempotente. O server/ensure-schema.ts também cria a tabela no
-- boot; o caminho normal é o `npm run db:push` (schema em shared/schema.ts).
CREATE TABLE IF NOT EXISTS transportes_terrestres (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  team_inclusion_id varchar NOT NULL REFERENCES team_inclusions(id) ON DELETE CASCADE,
  trecho text NOT NULL,
  modo text NOT NULL,
  empresa text,
  valor_centavos integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS transportes_terrestres_vaga_trecho_uq ON transportes_terrestres (team_inclusion_id, trecho);
