-- 16/10/2026 — abas de análise da Busca de passagens lentas em produção
-- ("Melhor momento" e "Preço por rota" paradas no esqueleto).
--
-- As análises leem as passagens com "quem registrou": o PRIMEIRO log de
-- criação de cada passagem em system_logs (LATERAL … ORDER BY created_at
-- LIMIT 1). O índice geral (entity_type, entity_id) obrigava o banco a ler
-- todos os logs de cada passagem (toda edição gera um; no Neon, com o cache
-- frio, cada log é uma página buscada no armazenamento) para achar o de
-- criação. Este índice parcial vai direto nele e, com user_id/user_name nas
-- colunas, a consulta responde só pelo índice (index-only scan).
--
-- Aditiva e idempotente: só um índice novo, nenhum dado alterado. O mesmo
-- índice está espelhado em shared/schema.ts (systemLogs). Este app NÃO tem
-- db:push (docs/migracoes.md): rode este arquivo à mão no banco de produção.
-- O ensure-schema não cria este índice. Sem CONCURRENTLY: o índice é pequeno (só logs de criação de
-- passagem); se preferir não travar escrita em system_logs, troque por
-- CREATE INDEX CONCURRENTLY (fora de transação).

CREATE INDEX IF NOT EXISTS system_logs_ticket_criacao_idx
  ON system_logs (entity_id, created_at, user_id, user_name)
  WHERE entity_type = 'ticket' AND action = 'create';
