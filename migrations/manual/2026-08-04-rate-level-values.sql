-- Valores da faixa B (Nível B do cenotécnico / Tipo 2 do percurseiro)
-- Pedido: slides 8 e 10 do deck "Ações de melhoria APP LI".
--
-- team_inclusions.rate_level (migração 2026-08-04-rate-level.sql) marca A/B na
-- escalação, mas não havia onde guardar o VALOR da faixa B — só existiam as
-- colunas normais de function_values, que servem para a faixa A. Sem estas
-- colunas, escolher "Nível B" na escalação não mudava nenhum valor pago.
--
-- APLICAR ANTES OU JUNTO COM O DEPLOY. Sem as colunas, todo SELECT de
-- function_values falha e derruba o Planejado e as telas que dependem dele.
--
-- NÃO usar "npm run db:push": o snapshot em migrations/meta está defasado.

BEGIN;

ALTER TABLE function_values
  ADD COLUMN IF NOT EXISTS daily_value_b integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_value_weekend_b integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_value_freela_b integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_value_freela_weekend_b integer NOT NULL DEFAULT 0;

COMMIT;

-- Zerado (o default) cai na faixa A — mesma convenção "0 = não configurado"
-- que as demais colunas desta tabela já usam. Nenhuma função existente muda de
-- comportamento até alguém preencher a faixa B.

-- Conferência:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'function_values' AND column_name LIKE '%_b';
