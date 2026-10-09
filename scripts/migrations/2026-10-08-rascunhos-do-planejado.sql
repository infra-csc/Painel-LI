-- 08/10/2026 — rascunho dos ajustes do Planejado no servidor, por evento +
-- usuário (antes ficava só no localStorage: quem trocava de computador perdia
-- o que tinha ajustado). Aditiva e idempotente. O server/ensure-schema.ts já
-- cria a tabela no boot; este arquivo existe para quem prefere rodar à mão
-- antes de publicar (lembrete: no Replit, db push no Shell ANTES do Republish).
-- Coluna de data em timestamptz (as tabelas antigas ainda têm timestamp sem fuso).
CREATE TABLE IF NOT EXISTS rascunhos_do_planejado (
  event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id varchar NOT NULL,
  overrides jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
