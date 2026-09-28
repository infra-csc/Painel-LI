-- Migração — timestamp sem fuso vira timestamptz (Painel-LI, 25/09/2026)
--
-- Auditoria de 23/09: todas as colunas de data/hora do schema (created_at,
-- updated_at, approved_at, validated_at, checkin_at, emitted_at, deleted_at,
-- reviewed_at, suggestion_sent_at, inactivated_at, rh_action_at,
-- reset_token_expiry, imported_at, approved_by_production_at…) eram
-- `timestamp without time zone`. O valor gravado não carrega o fuso, então
-- qualquer leitor fora do drizzle (psql, BI, script rodado em BRT) interpreta
-- como hora local e erra em 3 h. Só `expira_em` (sso_tokens_usados,
-- rate_limits) já nasceu timestamptz.
--
-- QUE FUSO OS VALORES GRAVADOS TÊM? UTC. Evidência:
--  1. O drizzle grava Date com `toISOString()` ("2026-09-25T14:41:42.580Z");
--     numa coluna sem fuso o Postgres IGNORA o "Z" e guarda 14:41:42 — a hora
--     UTC (drizzle-orm/pg-core/columns/timestamp.js, mapToDriverValue).
--  2. `DEFAULT now()` entra pela TimeZone da sessão; no Neon ela é UTC (e o
--     código já assume isso: server/routes/escalacao.ts usa
--     `now() AT TIME ZONE 'America/Sao_Paulo'` para obter o "hoje" de Brasília).
--  3. Na leitura o drizzle faz `new Date(valor + "+0000")` — trata como UTC. Se
--     os valores fossem BRT, todas as telas mostrariam 3 h a mais, e não mostram.
-- Portanto: `USING col AT TIME ZONE 'UTC'` (o instante não muda; só ganha o
-- fuso explícito). Se o bloco 0 mostrar que `created_at` mais recente está
-- ~3 h ATRÁS de `now() AT TIME ZONE 'UTC'`, os valores eram de Brasília —
-- troque 'UTC' por 'America/Sao_Paulo' na variável `fuso` do bloco 1.
--
-- Tipo: DDL. Idempotente: sim — o bloco 1 varre information_schema e só altera
-- colunas que AINDA são `timestamp without time zone`; rodar de novo não faz
-- nada. Uma transação por tabela (SAVEPOINT por tabela dentro do DO, com
-- lock_timeout: a tabela ocupada é pulada e listada no fim para repetir).
-- Fora do schema do Drizzle: `session` (connect-pg-simple, `expire timestamp(6)`)
-- fica como está.
--
-- Lock: `ALTER COLUMN TYPE` com USING reescreve a tabela (ACCESS EXCLUSIVE).
-- Tabelas pequenas; system_logs e team_inclusion_logs são as maiores. Rode
-- fora do pico. O código de 25/09 funciona antes e depois (o driver devolve
-- Date nos dois casos).
--
-- Rodar à mão:  psql "$DATABASE_URL" -f scripts/migrations/2026-09-25-timestamptz.sql

-- ── 0) Diagnóstico do fuso (leia antes de seguir) ────────────────────────────
SHOW timezone;  -- esperado: UTC
SELECT (SELECT max(created_at) FROM system_logs)                       AS ultimo_log_gravado,
       (now() AT TIME ZONE 'UTC')::timestamp                           AS agora_utc,
       (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp             AS agora_brasilia,
       now() - (SELECT max(created_at) FROM system_logs) AT TIME ZONE 'UTC' AS idade_se_utc;
-- Se `idade_se_utc` for pequena (minutos/horas desde o último uso), os valores
-- são UTC. Se for ~3 h maior do que faz sentido, eram Brasília.

-- Quais colunas serão alteradas:
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = current_schema()
   AND data_type = 'timestamp without time zone'
   AND table_name <> 'session'
 ORDER BY 1, 2;

-- ── 1) Conversão, tabela a tabela ────────────────────────────────────────────
DO $$
DECLARE
  fuso       constant text := 'UTC';   -- ver cabeçalho; alternativa: 'America/Sao_Paulo'
  tabela     text;
  coluna     text;
  alteradas  int := 0;
  puladas    text[] := '{}';
BEGIN
  FOR tabela IN
    SELECT DISTINCT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema = current_schema()
       AND c.data_type = 'timestamp without time zone'
       AND c.table_name <> 'session'
     ORDER BY 1
  LOOP
    BEGIN
      EXECUTE 'SET LOCAL lock_timeout = ''5s''';
      FOR coluna IN
        SELECT c.column_name FROM information_schema.columns c
         WHERE c.table_schema = current_schema() AND c.table_name = tabela
           AND c.data_type = 'timestamp without time zone'
         ORDER BY 1
      LOOP
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE %L',
                       tabela, coluna, coluna, fuso);
        alteradas := alteradas + 1;
        RAISE NOTICE '  ~ %.% → timestamptz', tabela, coluna;
      END LOOP;
    EXCEPTION WHEN lock_not_available THEN
      puladas := puladas || tabela;
      RAISE WARNING 'tabela % ocupada (lock_timeout) — pulada; rode o script de novo', tabela;
    END;
  END LOOP;
  RAISE NOTICE 'colunas convertidas: %', alteradas;
  IF array_length(puladas, 1) > 0 THEN
    RAISE WARNING 'PENDENTES (repetir): %', array_to_string(puladas, ', ');
  ELSE
    RAISE NOTICE 'Migração concluída.';
  END IF;
END $$;

-- ── 2) Conferência (esperado: 0 linhas além de session.expire) ───────────────
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = current_schema()
   AND data_type = 'timestamp without time zone'
 ORDER BY 1, 2;
