-- 28/10/2026 — Módulo de Honorários, Fase 3: prazos e cobranças do fluxo novo.
-- Os prazos (confirmar a presença, check-out final, Conferência DP, registrar
-- a OC, enviar e conferir a NF) são chaves de system_settings
-- (honorarios_prazo_*, padrão provisório no código — shared/prazos-honorarios.ts):
-- nenhuma linha é necessária.
-- A contestação do colaborador ("Algo não bate?") volta ao DP, que a marca
-- como respondida com uma resposta que o colaborador vê no portal:
--  - presenca_confirmacoes: contestacao_resposta, contestacao_respondida_em,
--    contestacao_respondida_por (id do usuário) e contestacao_respondida_por_nome.
-- Aditiva e idempotente; tudo nulo, sem NOT NULL. Nenhuma coluna existente
-- muda. O server/ensure-schema.ts também cria tudo no boot (o caminho normal é
-- publicar); este arquivo é para rodar à mão antes, se quiser. Este app NÃO
-- tem db:push (docs/migracoes.md). Espelho: shared/schema.ts.

ALTER TABLE presenca_confirmacoes ADD COLUMN IF NOT EXISTS contestacao_resposta text;
ALTER TABLE presenca_confirmacoes ADD COLUMN IF NOT EXISTS contestacao_respondida_em timestamptz;
ALTER TABLE presenca_confirmacoes ADD COLUMN IF NOT EXISTS contestacao_respondida_por varchar;
ALTER TABLE presenca_confirmacoes ADD COLUMN IF NOT EXISTS contestacao_respondida_por_nome text;
