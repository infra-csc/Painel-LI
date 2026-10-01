-- 01/10/2026 — passagem de quem saiu numa troca aprovada vira HISTÓRICO.
-- Aditiva e idempotente. O server/ensure-schema.ts já cria estas colunas no
-- boot; este arquivo existe para quem prefere rodar à mão antes de publicar.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS archived_collaborator_id varchar;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS archived_reason text;
