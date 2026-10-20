-- 20/10/2026 — valores do hotel na aba Quartos do Espelho Operacional (dono:
-- "colocar o valor total que estou pagando e ele distribuir, para saber
-- quanto estamos gastando com cada [apartamento]").
--  - hotel_tarifas_evento: tarifa por pessoa por noite de cada tipo
--    (Individual/Duplo/Triplo) e a fatura do hotel; uma linha por evento;
--  - hotel_valores_quarto: diária própria e valor pago de um quarto (sai com
--    o quarto — cascade);
--  - hotel_late_checkouts: late check-out por pessoa no evento (valor nulo =
--    igual à diária).
-- Tudo em centavos. Nenhuma coluna existente muda. Aditiva e idempotente.
-- O server/ensure-schema.ts também cria estas tabelas no boot (o caminho
-- normal é publicar); este arquivo é para rodar à mão antes, se quiser.
-- Este app NÃO tem db:push (docs/migracoes.md). Espelho: shared/schema.ts.
CREATE TABLE IF NOT EXISTS hotel_tarifas_evento (
  event_id varchar PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  individual_centavos integer,
  duplo_centavos integer,
  triplo_centavos integer,
  fatura_centavos integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS hotel_valores_quarto (
  hotel_room_group_id varchar PRIMARY KEY REFERENCES hotel_room_groups(id) ON DELETE CASCADE,
  event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  diaria_propria_centavos integer,
  valor_pago_centavos integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS hotel_valores_quarto_evento_idx ON hotel_valores_quarto (event_id);

CREATE TABLE IF NOT EXISTS hotel_late_checkouts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  collaborator_id varchar NOT NULL REFERENCES collaborators(id),
  ativo boolean NOT NULL DEFAULT true,
  valor_centavos integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS hotel_late_checkouts_evento_pessoa_uq ON hotel_late_checkouts (event_id, collaborator_id);
