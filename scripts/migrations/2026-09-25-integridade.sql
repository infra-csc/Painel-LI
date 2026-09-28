-- Migração — tipos e integridade (Painel-LI, 25/09/2026)
--
-- Fecha os itens restantes da auditoria de 23/09 sobre tipos do banco
-- (os de jsonb e timestamptz têm scripts próprios da mesma data):
--
--  1. budget_comparison.variance_percent text ("12.34%") → numeric(8,2).
--  2. Horas "HH:MM" em tickets/accommodations/uber_groups: CHECK NOT VALID no
--     formato (a regra de mobilidade 20h–5h e a de alimentação leem essas
--     colunas; texto livre virava cálculo errado em silêncio).
--  3. team_inclusion_logs.user_id recebia o literal 'system' — cria o usuário
--     fixo `system` em users e a FK NOT VALID (a FK declarada em
--     shared/schema.ts nunca existiu em produção).
--  4. created_at/updated_at: DEFAULT now() + backfill + NOT NULL.
--  5. Booleanos com três estados (null/true/false) → NOT NULL com default.
--
-- Tipo: DDL+Dados. Idempotente: sim (ALTER guardado por information_schema,
-- CHECK/FK com `duplicate_object`, INSERT com ON CONFLICT, UPDATE só onde IS
-- NULL). Os CHECKs e a FK entram NOT VALID: as linhas antigas que violarem
-- aparecem nos diagnósticos; depois de limpas, `VALIDATE CONSTRAINT` (bloco 6
-- e docs/migracoes.md §4.1).
--
-- Rodar depois de 2026-09-25-jsonb.sql. Pode rodar com o app no ar
-- (`SET NOT NULL` e `ALTER TYPE` pegam ACCESS EXCLUSIVE por instantes em
-- tabelas pequenas; lock_timeout protege).
--
-- Rodar à mão:  psql "$DATABASE_URL" -f scripts/migrations/2026-09-25-integridade.sql

-- ═══ 1) variance_percent → numeric(8,2) ══════════════════════════════════════
-- Diagnóstico: valores que não viram número, ou fora de ±999999.99 (esperado: 0)
SELECT id, variance_percent
  FROM budget_comparison
 WHERE pg_typeof(variance_percent)::text = 'text'
   AND variance_percent IS NOT NULL
   AND (NULLIF(regexp_replace(variance_percent::text, '[^0-9.\-]', '', 'g'), '') IS NULL
        OR NULLIF(regexp_replace(variance_percent::text, '[^0-9.\-]', '', 'g'), '') !~ '^-?[0-9]+(\.[0-9]+)?$'
        OR abs(NULLIF(regexp_replace(variance_percent::text, '[^0-9.\-]', '', 'g'), '')::numeric) > 999999.99);

BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'budget_comparison'
                AND column_name = 'variance_percent' AND data_type = 'text') THEN
    ALTER TABLE budget_comparison
      ALTER COLUMN variance_percent TYPE numeric(8,2)
      USING CASE
        WHEN NULLIF(regexp_replace(variance_percent, '[^0-9.\-]', '', 'g'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN GREATEST(-999999.99, LEAST(999999.99, regexp_replace(variance_percent, '[^0-9.\-]', '', 'g')::numeric))
        ELSE NULL
      END;
    RAISE NOTICE 'budget_comparison.variance_percent → numeric(8,2)';
  ELSE
    RAISE NOTICE 'budget_comparison.variance_percent já é numeric';
  END IF;
END $$;
COMMIT;

-- ═══ 2) Horas "HH:MM" — CHECK NOT VALID ══════════════════════════════════════
-- Diagnóstico: valores que não são HH:MM (esperado: poucos; '' e texto livre
-- de planilhas antigas). Corrija antes do VALIDATE — sugestões comentadas abaixo.
WITH horas(tabela, coluna, id, valor) AS (
  SELECT 'tickets', 'actual_departure_time', id, actual_departure_time FROM tickets
  UNION ALL SELECT 'tickets', 'actual_arrival_time', id, actual_arrival_time FROM tickets
  UNION ALL SELECT 'tickets', 'actual_return_time', id, actual_return_time FROM tickets
  UNION ALL SELECT 'tickets', 'return_arrival_time', id, return_arrival_time FROM tickets
  UNION ALL SELECT 'accommodations', 'check_in_time', id, check_in_time FROM accommodations
  UNION ALL SELECT 'accommodations', 'check_out_time', id, check_out_time FROM accommodations
  UNION ALL SELECT 'uber_groups', 'time', id, "time" FROM uber_groups
  UNION ALL SELECT 'uber_groups', 'suggested_time', id, suggested_time FROM uber_groups
  UNION ALL SELECT 'uber_groups', 'manual_time', id, manual_time FROM uber_groups
)
SELECT tabela, coluna, count(*) AS linhas, array_agg(DISTINCT valor) FILTER (WHERE valor IS NOT NULL) AS exemplos
  FROM horas
 WHERE valor IS NOT NULL AND valor !~ '^([01]\d|2[0-3]):[0-5]\d$'
 GROUP BY 1, 2 ORDER BY 1, 2;

-- Limpeza SUGERIDA (um caso por vez, conferindo com o diagnóstico):
--   -- vazio vira NULL
--   UPDATE tickets SET actual_departure_time = NULL WHERE actual_departure_time = '';
--   -- "7:30" → "07:30"
--   UPDATE tickets SET actual_departure_time = lpad(actual_departure_time, 5, '0') WHERE actual_departure_time ~ '^\d:\d\d$';
--   -- "14h" / "14H" → "14:00"
--   UPDATE tickets SET actual_departure_time = lpad(regexp_replace(actual_departure_time, '[hH]$', ''), 2, '0') || ':00' WHERE actual_departure_time ~ '^\d{1,2}[hH]$';
-- (repita para as demais colunas da lista)

DO $$
DECLARE
  alvo record;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      ('tickets', 'actual_departure_time'), ('tickets', 'actual_arrival_time'),
      ('tickets', 'actual_return_time'),    ('tickets', 'return_arrival_time'),
      ('accommodations', 'check_in_time'),  ('accommodations', 'check_out_time'),
      ('uber_groups', 'time'), ('uber_groups', 'suggested_time'), ('uber_groups', 'manual_time')
    ) AS t(tabela, coluna)
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I ~ %L) NOT VALID',
                     alvo.tabela, alvo.tabela || '_' || alvo.coluna || '_hhmm_chk', alvo.coluna, '^([01]\d|2[0-3]):[0-5]\d$');
      RAISE NOTICE '  + CHECK %.%', alvo.tabela, alvo.coluna;
    EXCEPTION WHEN duplicate_object THEN
      RAISE NOTICE '  = CHECK %.% já existe', alvo.tabela, alvo.coluna;
    END;
  END LOOP;
END $$;

-- ═══ 3) Usuário de sistema + FK team_inclusion_logs.user_id ══════════════════
-- Mesmo INSERT de server/usuario-sistema.ts (o boot também garante a linha).
INSERT INTO users (id, email, password, name, role, status, is_active, must_change_password)
VALUES ('system', 'sistema@painel-li.local', '!sem-login', 'Sistema', 'production', 'approved', false, false)
ON CONFLICT (id) DO NOTHING;

-- Diagnóstico: logs cujo user_id não existe em users (esperado: 0 depois do
-- INSERT acima — 'system' agora existe). Se sobrar algo, aponte para 'system':
--   UPDATE team_inclusion_logs SET user_id = 'system' WHERE user_id NOT IN (SELECT id FROM users);
SELECT user_id, count(*) AS logs
  FROM team_inclusion_logs
 WHERE user_id NOT IN (SELECT id FROM users)
 GROUP BY user_id ORDER BY 2 DESC;

DO $$ BEGIN
  ALTER TABLE team_inclusion_logs
    ADD CONSTRAINT team_inclusion_logs_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
  RAISE NOTICE '  + FK team_inclusion_logs.user_id → users.id (NOT VALID)';
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE '  = FK team_inclusion_logs.user_id já existe';
END $$;

-- ═══ 4) created_at / updated_at: DEFAULT now(), backfill, NOT NULL ═══════════
DO $$
DECLARE
  alvo record;
  n int;
BEGIN
  FOR alvo IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = current_schema()
       AND c.column_name IN ('created_at', 'updated_at')
       AND c.table_name <> 'session'
       AND (c.is_nullable = 'YES' OR c.column_default IS NULL)
     ORDER BY 1, 2
  LOOP
    BEGIN
      EXECUTE 'SET LOCAL lock_timeout = ''5s''';
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT now()', alvo.table_name, alvo.column_name);
      -- Linha sem data: usa a outra coluna de data se houver, senão agora.
      IF alvo.column_name = 'updated_at' THEN
        EXECUTE format('UPDATE %I SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL', alvo.table_name);
      ELSE
        EXECUTE format('UPDATE %I SET %I = COALESCE(%I, now()) WHERE %I IS NULL',
                       alvo.table_name, alvo.column_name, alvo.column_name, alvo.column_name);
      END IF;
      GET DIAGNOSTICS n = ROW_COUNT;
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET NOT NULL', alvo.table_name, alvo.column_name);
      RAISE NOTICE '  ~ %.%: DEFAULT now(), % linha(s) preenchida(s), NOT NULL', alvo.table_name, alvo.column_name, n;
    EXCEPTION WHEN lock_not_available THEN
      RAISE WARNING 'tabela % ocupada — %.% pendente; rode de novo', alvo.table_name, alvo.table_name, alvo.column_name;
    END;
  END LOOP;
END $$;

-- ═══ 5) Booleanos sem terceiro estado ════════════════════════════════════════
DO $$
DECLARE
  alvo record;
  n int;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      ('users', 'is_active', 'true'),
      ('users', 'must_change_password', 'false'),
      ('users', 'can_approve_cenotecnica', 'false'),
      ('collaborators', 'is_coordinator', 'false'),
      ('team_inclusions', 'needs_ticket', 'false'),
      ('team_inclusions', 'needs_accommodation', 'false'),
      ('team_inclusions', 'emergency_record', 'false'),
      ('accommodations', 'late_checkout', 'false'),
      ('financial', 'approved', 'false')
    ) AS t(tabela, coluna, padrao)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = alvo.tabela AND column_name = alvo.coluna) THEN
      RAISE WARNING '  ? %.% não existe — pulada', alvo.tabela, alvo.coluna;
      CONTINUE;
    END IF;
    BEGIN
      EXECUTE 'SET LOCAL lock_timeout = ''5s''';
      EXECUTE format('UPDATE %I SET %I = %s WHERE %I IS NULL', alvo.tabela, alvo.coluna, alvo.padrao, alvo.coluna);
      GET DIAGNOSTICS n = ROW_COUNT;
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s', alvo.tabela, alvo.coluna, alvo.padrao);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET NOT NULL', alvo.tabela, alvo.coluna);
      RAISE NOTICE '  ~ %.%: % NULL → %, NOT NULL DEFAULT %', alvo.tabela, alvo.coluna, n, alvo.padrao, alvo.padrao;
    EXCEPTION WHEN lock_not_available THEN
      RAISE WARNING 'tabela % ocupada — %.% pendente; rode de novo', alvo.tabela, alvo.tabela, alvo.coluna;
    END;
  END LOOP;
END $$;

-- ═══ 6) Depois de limpar os diagnósticos (2) e (3): validar ══════════════════
-- ALTER TABLE tickets              VALIDATE CONSTRAINT tickets_actual_departure_time_hhmm_chk;
-- ALTER TABLE tickets              VALIDATE CONSTRAINT tickets_actual_arrival_time_hhmm_chk;
-- ALTER TABLE tickets              VALIDATE CONSTRAINT tickets_actual_return_time_hhmm_chk;
-- ALTER TABLE tickets              VALIDATE CONSTRAINT tickets_return_arrival_time_hhmm_chk;
-- ALTER TABLE accommodations       VALIDATE CONSTRAINT accommodations_check_in_time_hhmm_chk;
-- ALTER TABLE accommodations       VALIDATE CONSTRAINT accommodations_check_out_time_hhmm_chk;
-- ALTER TABLE uber_groups          VALIDATE CONSTRAINT uber_groups_time_hhmm_chk;
-- ALTER TABLE uber_groups          VALIDATE CONSTRAINT uber_groups_suggested_time_hhmm_chk;
-- ALTER TABLE uber_groups          VALIDATE CONSTRAINT uber_groups_manual_time_hhmm_chk;
-- ALTER TABLE team_inclusion_logs  VALIDATE CONSTRAINT team_inclusion_logs_user_id_users_id_fk;

-- ═══ 7) Conferência ══════════════════════════════════════════════════════════
SELECT conrelid::regclass AS tabela, conname, convalidated
  FROM pg_constraint
 WHERE conname LIKE '%_hhmm_chk' OR conname = 'team_inclusion_logs_user_id_users_id_fk'
 ORDER BY 1, 2;
SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = current_schema()
   AND ((table_name, column_name) = ('budget_comparison', 'variance_percent')
        OR column_name IN ('created_at', 'updated_at', 'is_active', 'must_change_password', 'can_approve_cenotecnica',
                           'is_coordinator', 'needs_ticket', 'needs_accommodation', 'emergency_record', 'late_checkout', 'approved'))
   AND table_name <> 'session'
 ORDER BY 1, 2;
