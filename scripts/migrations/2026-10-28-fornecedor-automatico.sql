-- 28/10/2026 — Fornecedor aprovado automaticamente pelo histórico (pedido do
-- DP de 27/10, item 5: "se algum dia passou o CNPJ, que seja aprovado o
-- fornecedor automaticamente"). Regra em shared/fornecedor-automatico.ts.
--  - contratos.origem: 'cadastro' (o DP cadastrou, à mão ou pela planilha —
--    todos os contratos que já existem) | 'automatico' (criado porque o CNPJ
--    já teve OC registrada, nota fiscal aprovada ou pagamento marcado);
--  - contratos.origem_detalhe: a frase "Aprovado automaticamente: CNPJ já pago
--    em <evento> em dd/mm/aaaa (…)" (nula nos cadastrados pelo DP).
-- Aditiva e idempotente: `origem` nasce NOT NULL DEFAULT 'cadastro' (os
-- contratos existentes ficam 'cadastro'), `origem_detalhe` nula. Nenhuma
-- coluna existente muda. O server/ensure-schema.ts também cria as duas no
-- boot (o caminho normal é publicar); este arquivo é para rodar à mão antes,
-- se quiser. Este app NÃO tem db:push (docs/migracoes.md). Espelho:
-- shared/schema.ts (contratos).
--
-- Depois de publicar, o DP roda a varredura do passado na tela Contratos →
-- "Aprovar pelo histórico" (prévia antes; POST /api/contratos/aprovacao-automatica).

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'cadastro';
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS origem_detalhe text;
