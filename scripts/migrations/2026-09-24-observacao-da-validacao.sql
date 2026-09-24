-- Observação da validação (Painel-LI, 24/09/2026): ao validar uma vaga na
-- Validação de Escala, quem valida pode deixar uma observação opcional, lida
-- pelo aprovador. Só adiciona uma coluna nula — pode rodar em produção sem
-- parada. Espelho: shared/schema.ts (team_inclusions.validationNote).
-- O servidor também cria esta coluna no boot (server/ensure-schema.ts), então
-- rodar à mão é opcional.
ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS validation_note text;
