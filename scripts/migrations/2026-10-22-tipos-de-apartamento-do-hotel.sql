-- 22/10/2026 — aba Quartos do Espelho Operacional (dono: "no espelho ter a
-- opção de colocar se o hotel não tem duplo ou triplo").
--  - hotel_tarifas_evento.tem_duplo / tem_triplo: o hotel do evento tem
--    apartamento Duplo / Triplo (Individual sempre tem). Padrão verdadeiro:
--    eventos que já existem seguem como antes.
-- A regra (sugestões, Mover, custo, PDF) está em shared/room-pairing.ts.
-- Aditiva e idempotente. O server/ensure-schema.ts também cria as colunas no
-- boot (o caminho normal é publicar); este arquivo é para rodar à mão antes,
-- se quiser. Este app NÃO tem db:push (docs/migracoes.md). Espelho:
-- shared/schema.ts.
ALTER TABLE hotel_tarifas_evento ADD COLUMN IF NOT EXISTS tem_duplo boolean NOT NULL DEFAULT true;
ALTER TABLE hotel_tarifas_evento ADD COLUMN IF NOT EXISTS tem_triplo boolean NOT NULL DEFAULT true;
