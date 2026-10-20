-- 16/10/2026 — Honorários da cenotécnica: valor negociado → aprovação (mesmo
-- aprovador da escala) → liberação da verba pelo Financeiro, com relatórios.
-- Três tabelas NOVAS; nenhuma coluna existente muda (o módulo não toca em
-- team_inclusions, no Planejado nem no Realizado). Aditiva e idempotente.
-- Espelho: shared/schema.ts (honorariosCeno, honorariosCenoHistorico,
-- honorariosCenoLiberacoes). O server/ensure-schema.ts também cria as tabelas
-- no boot; este arquivo existe para quem prefere rodar à mão antes de publicar
-- (este app NÃO tem db:push — docs/migracoes.md).
--   psql "$DATABASE_URL" -f scripts/migrations/2026-10-16-honorarios-cenotecnica.sql
CREATE TABLE IF NOT EXISTS honorarios_ceno (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  team_inclusion_id varchar REFERENCES team_inclusions(id),
  function_id varchar REFERENCES functions(id),
  collaborator_id varchar,
  nome text NOT NULL,
  pessoas integer,
  descricao text,
  setor text,
  posicao text,
  inicio date,
  fim date,
  diarias integer,
  valor_pedido integer NOT NULL DEFAULT 0,
  valor_aprovado integer,
  observacao text,
  status text NOT NULL DEFAULT 'rascunho',
  versao integer NOT NULL DEFAULT 1,
  criado_por varchar NOT NULL,
  criado_por_nome text NOT NULL,
  enviado_por varchar,
  enviado_por_nome text,
  enviado_em timestamptz,
  decidido_por varchar,
  decidido_por_nome text,
  decidido_em timestamptz,
  motivo_decisao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS honorarios_ceno_evento_idx ON honorarios_ceno (event_id);
CREATE INDEX IF NOT EXISTS honorarios_ceno_status_idx ON honorarios_ceno (status);
CREATE UNIQUE INDEX IF NOT EXISTS honorarios_ceno_vaga_uq ON honorarios_ceno (team_inclusion_id) WHERE team_inclusion_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS honorarios_ceno_historico (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  honorario_id varchar NOT NULL REFERENCES honorarios_ceno(id) ON DELETE CASCADE,
  acao text NOT NULL,
  valor_anterior integer,
  valor_novo integer,
  motivo text,
  detalhe text,
  por_id varchar NOT NULL,
  por_nome text NOT NULL,
  em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS honorarios_ceno_historico_idx ON honorarios_ceno_historico (honorario_id, em);

CREATE TABLE IF NOT EXISTS honorarios_ceno_liberacoes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  honorario_id varchar NOT NULL REFERENCES honorarios_ceno(id) ON DELETE CASCADE,
  data date NOT NULL,
  oc text NOT NULL,
  valor integer NOT NULL,
  observacao text,
  por_id varchar NOT NULL,
  por_nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  estornada_em timestamptz,
  estornada_por varchar,
  estornada_por_nome text,
  motivo_estorno text
);
CREATE INDEX IF NOT EXISTS honorarios_ceno_liberacoes_idx ON honorarios_ceno_liberacoes (honorario_id);
