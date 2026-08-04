-- Forma de pagamento da participação: emite NF ou recebe via Caju
-- Pedido: slide 4 do deck "Ações de melhoria APP LI".
--
-- Não é atributo do colaborador (um CLT pode fazer freela), por isso fica na
-- escalação e é copiado para o realizado, que é o que a tela de Notas Fiscais lê.
--
-- APLICAR ANTES OU JUNTO COM O DEPLOY. Sem estas colunas, todo SELECT de
-- team_inclusions e de budget_actual falha — o que derruba praticamente todas
-- as telas do sistema.
--
-- NÃO usar "npm run db:push": o snapshot em migrations/meta está defasado do
-- schema.ts real e um push tentaria reconciliar tudo de uma vez.

BEGIN;

ALTER TABLE team_inclusions
  ADD COLUMN IF NOT EXISTS payment_method text;

ALTER TABLE budget_actual
  ADD COLUMN IF NOT EXISTS payment_method text;

COMMIT;

-- Registros existentes ficam com payment_method nulo e são tratados como "nf",
-- ou seja, seguem o fluxo de Notas Fiscais exatamente como hoje. Isso é
-- proposital: as escalações já confirmadas não podem travar nem sumir de uma
-- fila de pagamento em andamento por causa de um campo que não existia quando
-- foram criadas.
--
-- A obrigatoriedade de escolher vale apenas para escalações novas.

-- Conferência:
--   SELECT table_name, column_name
--     FROM information_schema.columns
--    WHERE column_name = 'payment_method'
--      AND table_name IN ('team_inclusions', 'budget_actual');
