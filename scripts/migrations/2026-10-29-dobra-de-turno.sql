-- 29/10/2026 — Dobra de turno no Realizado (Painel-LI), pedido do dono:
--  - a MESMA pessoa trabalhou dobrado num dia → aquele dia paga 2 diárias (a
--    diária do dia + mais uma diária cheia do mesmo dia, com o fator da
--    deflação do dia). Só no Realizado: a prestação guarda QUAIS dias (datas
--    YYYY-MM-DD). O valor da dobra já está no total e na diária média
--    gravados; a quantidade de diárias conta a dobra (o dia paga 2). A regra
--    mora em shared/dobra-de-turno.ts (+ shared/meia-diaria.ts →
--    valoresDosDiasDoSubtotal). Um dia não é ½ e dobra ao mesmo tempo.
-- Aditiva e idempotente; nula, sem NOT NULL. Nenhuma coluna existente muda;
-- nenhum dado alterado. O server/ensure-schema.ts também cria no boot (o
-- caminho normal é publicar); este arquivo é para rodar à mão antes, se
-- quiser. Este app NÃO tem db:push (docs/migracoes.md). Espelho: shared/schema.ts.

ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS dias_dobra text[];
