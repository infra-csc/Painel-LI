-- Migração — JSON guardado como text vira jsonb (Painel-LI, 25/09/2026)
--
-- Auditoria de 23/09: seis colunas guardam JSON serializado em `text`, então o
-- banco não valida nada, ninguém consulta por dentro e o servidor fazia
-- JSON.parse/JSON.stringify na mão (o histórico da NF era ler-alterar-regravar,
-- perdendo entradas em decisões simultâneas). Agora são `jsonb` com tipo TS
-- explícito em shared/schema.ts; o servidor lê/grava objetos e a API continua
-- devolvendo string ao client (server/http.ts, serializarJsonNaBorda).
--
--   scaling_change_requests.proposed_changes   → jsonb
--   invoices.history                           → jsonb NOT NULL DEFAULT '[]'
--   budget_actual.rh_adjusted_fields           → jsonb
--   budget_comparison.changes_log              → jsonb
--   system_logs.previous_data / new_data       → jsonb
--
-- Tipo: DDL (+ backfill de NULL em invoices.history). Idempotente: sim — cada
-- bloco confere `information_schema.columns.data_type` e só altera se ainda
-- for text. Uma transação por tabela.
--
-- RODAR ANTES DE PUBLICAR o código de 25/09: as decisões da NF (aprovar,
-- devolver, recusar, check-in, reenviar) fazem `history = history || $1::jsonb`
-- e falham enquanto a coluna for text. O resto do código funciona nos dois
-- estados (o driver devolve JSON parseado tanto de text quanto de jsonb).
--
-- ATENÇÃO — JSON inválido: `ALTER … USING col::jsonb` aborta a transação na
-- primeira linha cujo texto não seja JSON válido. Rode o bloco 0 antes; se
-- voltar linhas, corrija-as (UPDATE … SET col = NULL, ou conserte o texto)
-- e só então siga. Vazio ('') e NULL viram NULL (CASE no USING).
--
-- Lock: `ALTER COLUMN TYPE` reescreve a tabela com ACCESS EXCLUSIVE. As
-- tabelas são pequenas (milhares de linhas), mas system_logs cresce — rode
-- fora do horário de pico. lock_timeout evita ficar na fila atrás de uma
-- leitura longa: se der timeout, repita.
--
-- Rodar à mão:  psql "$DATABASE_URL" -f scripts/migrations/2026-09-25-jsonb.sql

-- ── 0) Diagnóstico: linhas com JSON inválido (esperado: 0 linhas) ────────────
-- (jsonb_typeof falha em texto inválido; a função abaixo transforma em boolean)
CREATE OR REPLACE FUNCTION pg_temp.eh_json_valido(t text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF t IS NULL OR t = '' THEN RETURN true; END IF;
  PERFORM t::jsonb;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END $$;

SELECT 'scaling_change_requests.proposed_changes' AS coluna, id, left(proposed_changes, 80) AS trecho
  FROM scaling_change_requests
 WHERE pg_typeof(proposed_changes)::text = 'text' AND NOT pg_temp.eh_json_valido(proposed_changes::text)
UNION ALL
SELECT 'invoices.history', id, left(history::text, 80) FROM invoices
 WHERE pg_typeof(history)::text = 'text' AND NOT pg_temp.eh_json_valido(history::text)
UNION ALL
SELECT 'budget_actual.rh_adjusted_fields', id, left(rh_adjusted_fields::text, 80) FROM budget_actual
 WHERE pg_typeof(rh_adjusted_fields)::text = 'text' AND NOT pg_temp.eh_json_valido(rh_adjusted_fields::text)
UNION ALL
SELECT 'budget_comparison.changes_log', id, left(changes_log::text, 80) FROM budget_comparison
 WHERE pg_typeof(changes_log)::text = 'text' AND NOT pg_temp.eh_json_valido(changes_log::text)
UNION ALL
SELECT 'system_logs.previous_data', id, left(previous_data::text, 80) FROM system_logs
 WHERE pg_typeof(previous_data)::text = 'text' AND NOT pg_temp.eh_json_valido(previous_data::text)
UNION ALL
SELECT 'system_logs.new_data', id, left(new_data::text, 80) FROM system_logs
 WHERE pg_typeof(new_data)::text = 'text' AND NOT pg_temp.eh_json_valido(new_data::text);

-- ── 1) scaling_change_requests.proposed_changes ──────────────────────────────
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'scaling_change_requests'
                AND column_name = 'proposed_changes' AND data_type = 'text') THEN
    ALTER TABLE scaling_change_requests
      ALTER COLUMN proposed_changes TYPE jsonb
      USING CASE WHEN proposed_changes IS NULL OR proposed_changes = '' THEN NULL ELSE proposed_changes::jsonb END;
    RAISE NOTICE 'scaling_change_requests.proposed_changes → jsonb';
  ELSE
    RAISE NOTICE 'scaling_change_requests.proposed_changes já é jsonb — nada a fazer';
  END IF;
END $$;
COMMIT;

-- ── 2) invoices.history (NOT NULL DEFAULT '[]') ──────────────────────────────
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'invoices'
                AND column_name = 'history' AND data_type = 'text') THEN
    -- O default antigo ('[]' text) não tem cast implícito para jsonb: tira antes, repõe depois.
    ALTER TABLE invoices ALTER COLUMN history DROP DEFAULT;
    ALTER TABLE invoices
      ALTER COLUMN history TYPE jsonb
      USING CASE WHEN history IS NULL OR history = '' THEN '[]'::jsonb ELSE history::jsonb END;
    RAISE NOTICE 'invoices.history → jsonb';
  ELSE
    RAISE NOTICE 'invoices.history já é jsonb';
  END IF;
END $$;
UPDATE invoices SET history = '[]'::jsonb WHERE history IS NULL;
ALTER TABLE invoices ALTER COLUMN history SET DEFAULT '[]'::jsonb;
ALTER TABLE invoices ALTER COLUMN history SET NOT NULL;
COMMIT;

-- ── 3) budget_actual.rh_adjusted_fields ──────────────────────────────────────
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'budget_actual'
                AND column_name = 'rh_adjusted_fields' AND data_type = 'text') THEN
    ALTER TABLE budget_actual
      ALTER COLUMN rh_adjusted_fields TYPE jsonb
      USING CASE WHEN rh_adjusted_fields IS NULL OR rh_adjusted_fields = '' THEN NULL ELSE rh_adjusted_fields::jsonb END;
    RAISE NOTICE 'budget_actual.rh_adjusted_fields → jsonb';
  ELSE
    RAISE NOTICE 'budget_actual.rh_adjusted_fields já é jsonb';
  END IF;
END $$;
COMMIT;

-- ── 4) budget_comparison.changes_log ─────────────────────────────────────────
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'budget_comparison'
                AND column_name = 'changes_log' AND data_type = 'text') THEN
    ALTER TABLE budget_comparison
      ALTER COLUMN changes_log TYPE jsonb
      USING CASE WHEN changes_log IS NULL OR changes_log = '' THEN NULL ELSE changes_log::jsonb END;
    RAISE NOTICE 'budget_comparison.changes_log → jsonb';
  ELSE
    RAISE NOTICE 'budget_comparison.changes_log já é jsonb';
  END IF;
END $$;
COMMIT;

-- ── 5) system_logs.previous_data / new_data (a maior tabela — fora do pico) ──
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'system_logs'
                AND column_name = 'previous_data' AND data_type = 'text') THEN
    ALTER TABLE system_logs
      ALTER COLUMN previous_data TYPE jsonb
      USING CASE WHEN previous_data IS NULL OR previous_data = '' THEN NULL ELSE previous_data::jsonb END,
      ALTER COLUMN new_data TYPE jsonb
      USING CASE WHEN new_data IS NULL OR new_data = '' THEN NULL ELSE new_data::jsonb END;
    RAISE NOTICE 'system_logs.previous_data/new_data → jsonb';
  ELSE
    RAISE NOTICE 'system_logs.previous_data/new_data já são jsonb';
  END IF;
END $$;
COMMIT;

-- ── 6) Conferência final (esperado: 6 linhas, todas jsonb) ───────────────────
SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = current_schema()
   AND (table_name, column_name) IN (
     ('scaling_change_requests', 'proposed_changes'), ('invoices', 'history'),
     ('budget_actual', 'rh_adjusted_fields'), ('budget_comparison', 'changes_log'),
     ('system_logs', 'previous_data'), ('system_logs', 'new_data'))
 ORDER BY 1, 2;
