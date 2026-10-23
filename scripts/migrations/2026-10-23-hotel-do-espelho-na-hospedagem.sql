-- 23/10/2026 — Espelho Operacional, aba Quartos (dono: "no espelho
-- operacional, quando colocarmos o hotel, refletir na passagem" →
-- "basicamente, quando confirmar, deve preencher lá na aba de Hospedagem com
-- os dados").
--  - hospedagens_do_espelho: o que o "Confirmar" do quarto escreveu na
--    hospedagem da vaga (hotel, check-in/out, tipo, diárias, valor, com quem
--    divide), em `campos` (coluna de accommodations → valor). Separa o valor
--    "do Espelho" (atualizado quando o quarto é confirmado de novo) do lançado
--    à mão (nunca sobrescrito sem alguém pedir). Uma linha por hospedagem;
--    sai junto com ela (cascade).
-- A regra está em shared/hotel-na-hospedagem.ts.
-- Aditiva e idempotente. Nenhuma coluna existente muda. O
-- server/ensure-schema.ts também cria a tabela no boot (o caminho normal é
-- publicar); este arquivo é para rodar à mão antes, se quiser. Este app NÃO
-- tem db:push (docs/migracoes.md). Espelho: shared/schema.ts.
CREATE TABLE IF NOT EXISTS hospedagens_do_espelho (
  accommodation_id varchar PRIMARY KEY REFERENCES accommodations(id) ON DELETE CASCADE,
  event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_inclusion_id varchar NOT NULL,
  hotel_room_group_id varchar,
  campos jsonb NOT NULL,
  criada_pelo_espelho boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS hospedagens_do_espelho_evento_idx ON hospedagens_do_espelho (event_id);
