-- Endereço do colaborador (22/09): rua, número, complemento e CEP — todos opcionais.
-- O servidor também cria estas colunas no boot (server/ensure-schema.ts), então
-- rodar à mão é opcional.
ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS address_street text;
ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS address_number text;
ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS address_complement text;
ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS address_zip text;
