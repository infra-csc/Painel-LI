-- Conta corrente Caju: razão de alimentação e mobilidade por colaborador
-- Pedido: slide 6 do deck "Ações de melhoria APP LI".
-- Substitui a planilha "Conta Corrente - Alimentação Eventos.xlsx", que hoje
-- tem 188 abas individuais mantidas à mão.
--
-- Tabela nova — não altera nada existente, então pode ser aplicada antes do
-- deploy sem risco para o que já está no ar.
--
-- NÃO usar "npm run db:push": o snapshot em migrations/meta está defasado do
-- schema.ts real e um push tentaria reconciliar tudo de uma vez.

BEGIN;

CREATE TABLE IF NOT EXISTS caju_ledger_entries (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id  varchar NOT NULL REFERENCES collaborators(id),
  account          text    NOT NULL,   -- alimentacao | mobilidade
  amount           integer NOT NULL,   -- centavos, com sinal (crédito +, débito -)
  reference_date   date    NOT NULL,
  description      text    NOT NULL,
  notes            text,
  kind             text    NOT NULL,   -- abertura | debito_evento | credito_complementar | ajuste
  event_id         varchar REFERENCES events(id),
  budget_actual_id varchar,
  created_by       varchar REFERENCES users(id),
  created_at       timestamp DEFAULT now()
);

-- Impede que aprovar o mesmo realizado duas vezes lance o débito em
-- duplicidade. Em Postgres, NULLs não conflitam entre si, então lançamentos
-- manuais (budget_actual_id nulo) não são afetados por esta restrição.
ALTER TABLE caju_ledger_entries
  DROP CONSTRAINT IF EXISTS caju_ledger_unique_auto_debit;
ALTER TABLE caju_ledger_entries
  ADD CONSTRAINT caju_ledger_unique_auto_debit UNIQUE (budget_actual_id, account);

-- O extrato é sempre consultado por pessoa e ordenado por data.
CREATE INDEX IF NOT EXISTS caju_ledger_collab_idx
  ON caju_ledger_entries (collaborator_id, account, reference_date);

COMMIT;

-- Não há importação de saldo: por decisão, todo mundo começa zerado a partir
-- da data de início, e o RH lança o saldo de abertura de quem precisar
-- (kind = 'abertura'). O histórico anterior permanece na planilha.

-- Conferência:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'caju_ledger_entries' ORDER BY ordinal_position;
