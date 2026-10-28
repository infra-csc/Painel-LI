-- 28/10/2026 — Tipo de transporte, valor e bilhete POR TRECHO da passagem (Painel-LI).
-- Caso: vaga #4618 — ida aérea GRU→SDU já comprada, volta trocada para ônibus
-- (Novo Rio → Barra Funda). Com um tipo só por passagem, o bilhete do ônibus
-- virava a passagem inteira em "Rodoviário". Dono: "deveria SOMAR os valores
-- de ida e volta também".
--  - tickets.return_transport_type (text): tipo da VOLTA ('aereo' |
--    'rodoviario') só quando ela é DIFERENTE da ida. NULL = igual à ida.
--  - tickets.return_value (integer, centavos): a parte da VOLTA comprada à
--    parte. `value` continua sendo o TOTAL (ida + volta) — o que o Espelho, as
--    Análises e as listas já somam; ida = value − return_value.
--  - tickets.return_purchase_order_number (text): o bilhete/LOC da volta
--    comprada à parte (`purchase_order_number` fica sendo o da ida).
-- NULL nas três = passagem de uma compra só, de um tipo só: todas as
-- passagens existentes continuam exatamente como estão.
-- Regra em shared/tipo-por-trecho.ts. Aditiva e idempotente; tudo nulo, sem
-- NOT NULL. Nenhuma coluna existente muda; nenhum dado alterado. O
-- server/ensure-schema.ts também cria as colunas no boot (o caminho normal é
-- publicar); este arquivo é para rodar à mão antes, se quiser. Este app NÃO
-- tem db:push (docs/migracoes.md). Espelho: shared/schema.ts (tickets).

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS return_transport_type text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS return_value integer;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS return_purchase_order_number text;
