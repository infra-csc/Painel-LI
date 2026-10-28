-- 28/10/2026 — Correções da revisão (Painel-LI):
--  - budget_actual.base_checkout_final (jsonb): o Realizado ANTES do 1º
--    check-out final da presença. Refeito depois da devolução do DP, o
--    recálculo parte desta base — as horas extras e o ajuste de ±10% não se
--    acumulam (shared/presenca.ts → BaseDoCheckoutFinal). Só o check-out
--    final grava; nula = ainda não houve check-out final.
--  - colaboradores_acesso.falhas_desde (timestamptz): início da janela dos
--    erros de login do portal do colaborador — passado o tempo do bloqueio, a
--    contagem recomeça (a mesma regra do CPF sem cadastro).
-- Aditiva e idempotente; tudo nulo, sem NOT NULL. Nenhuma coluna existente
-- muda. O server/ensure-schema.ts também cria tudo no boot (o caminho normal é
-- publicar); este arquivo é para rodar à mão antes, se quiser. Este app NÃO
-- tem db:push (docs/migracoes.md). Espelho: shared/schema.ts.

ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS base_checkout_final jsonb;
ALTER TABLE colaboradores_acesso ADD COLUMN IF NOT EXISTS falhas_desde timestamptz;
