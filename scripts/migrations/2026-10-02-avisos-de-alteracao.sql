-- 02/10/2026 — aviso para Compras quando um ajuste aprovado mexe em vaga que
-- já tem passagem/hospedagem ("o que mudou e em qual prova").
-- Aditiva e idempotente. O server/ensure-schema.ts já cria a tabela no boot;
-- este arquivo existe para quem prefere rodar à mão antes de publicar.
CREATE TABLE IF NOT EXISTS avisos_de_alteracao (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  team_inclusion_id varchar NOT NULL REFERENCES team_inclusions(id) ON DELETE CASCADE,
  event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  change_request_id varchar REFERENCES scaling_change_requests(id) ON DELETE SET NULL,
  mudancas jsonb NOT NULL,
  afeta_passagem boolean NOT NULL DEFAULT false,
  afeta_hospedagem boolean NOT NULL DEFAULT false,
  motivo text,
  pedido_por_nome text,
  comentario_do_aprovador text,
  aprovado_por varchar,
  aprovado_por_nome text NOT NULL,
  aprovado_em timestamptz NOT NULL,
  resolvido_em timestamptz,
  resolvido_por varchar,
  resolvido_por_nome text,
  resolucao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS avisos_de_alteracao_pendentes_idx ON avisos_de_alteracao (aprovado_em) WHERE resolvido_em IS NULL;
CREATE INDEX IF NOT EXISTS avisos_de_alteracao_vaga_idx ON avisos_de_alteracao (team_inclusion_id);
