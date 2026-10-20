-- 20/10/2026 — Honorários da cenotécnica: tipo de freela no pedido e empreita
-- que agrupa vagas (dono: "ele só coloca qual tipo de freela ou um valor à
-- parte" e "empreita também ele pode colocar e selecionar quais escalações
-- estão nessa empreita").
--  - honorarios_ceno.tipo_freela: de onde vem o valor do pedido de VAGA —
--    'viagem' | 'sp' | 'local_a' | 'local_b' (tabela fechada) ou 'outro'
--    (negociado à parte). Nula na empreita e nos pedidos antigos;
--  - honorarios_ceno_empreita_vagas: as vagas que fazem parte de cada
--    empreita. Uma vaga em no máximo UMA empreita (índice único).
-- Nenhuma coluna existente muda. Aditiva e idempotente.
-- O server/ensure-schema.ts também cria isto no boot (o caminho normal é
-- publicar); este arquivo é para rodar à mão antes, se quiser.
-- Este app NÃO tem db:push (docs/migracoes.md). Espelho: shared/schema.ts.
ALTER TABLE honorarios_ceno ADD COLUMN IF NOT EXISTS tipo_freela text;

CREATE TABLE IF NOT EXISTS honorarios_ceno_empreita_vagas (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  honorario_id varchar NOT NULL REFERENCES honorarios_ceno(id) ON DELETE CASCADE,
  team_inclusion_id varchar NOT NULL REFERENCES team_inclusions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS honorarios_ceno_empreita_vagas_honorario_idx ON honorarios_ceno_empreita_vagas (honorario_id);
CREATE UNIQUE INDEX IF NOT EXISTS honorarios_ceno_empreita_vagas_vaga_uq ON honorarios_ceno_empreita_vagas (team_inclusion_id);
