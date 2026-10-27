-- 28/10/2026 — Ajustes pedidos pelo DP (Painel-LI):
--  - 1,5 diária num dia (carga/descarga + o dia, ex.: Night Run): a vaga, a
--    linha do Planejado e a prestação do Realizado guardam QUAIS dias (datas
--    YYYY-MM-DD). O valor do ½ já está na diária média e no total gravados;
--    a regra mora em shared/meia-diaria.ts (motor: shared/budget-engine.ts).
--  - VR diário do colaborador da casa (centavos): com VR cadastrado, o almoço
--    de dia útil é max(0, almoço da regra − VR); sem ele, o valor fixo de
--    sempre (shared/alimentacao.ts). Só o que for recalculado daqui pra frente.
-- Aditiva e idempotente; tudo nulo, sem NOT NULL. Nenhuma coluna existente
-- muda. O server/ensure-schema.ts também cria tudo no boot (o caminho normal é
-- publicar); este arquivo é para rodar à mão antes, se quiser. Este app NÃO
-- tem db:push (docs/migracoes.md). Espelho: shared/schema.ts.

ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS dias_meia_extra text[];
ALTER TABLE budget_planned ADD COLUMN IF NOT EXISTS dias_meia_extra text[];
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS dias_meia_extra text[];
ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS vr_diario_cents integer;
