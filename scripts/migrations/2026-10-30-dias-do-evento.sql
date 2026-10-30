-- 30/10/2026 — Dia(s) do evento no cadastro (Painel-LI), pedido do dono:
--  - o evento é cadastrado com o período da OPERAÇÃO (montagem a
--    desmontagem), mas acontece em outros dias (Viva Esporte Serra: período
--    01/11 dom → 08/11 dom, evento 05 e 06/11, quinta e sexta). Os dias reais
--    ficam aqui, dentro do período (ou iguais a ele). Só o primeiro informado
--    = um dia (o servidor grava os dois iguais).
--  - com eles, o dia da prova (Quadro de prazos, filtro "Data do evento") é o
--    ÚLTIMO dia informado e a janela é de..até; sem eles, a dedução pelo
--    período continua. Regra em shared/dia-da-prova.ts.
-- Aditiva e idempotente; nulas, sem NOT NULL. Nenhuma coluna existente muda;
-- nenhum dado alterado. O server/ensure-schema.ts também cria no boot (o
-- caminho normal é publicar); este arquivo é para rodar à mão antes, se
-- quiser. Este app NÃO tem db:push (docs/migracoes.md). Espelho: shared/schema.ts.

ALTER TABLE events ADD COLUMN IF NOT EXISTS dia_evento_inicio date;
ALTER TABLE events ADD COLUMN IF NOT EXISTS dia_evento_fim date;
