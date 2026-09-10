-- Empreita por empresa na vaga (Painel-LI, 10/09/2026). Só adiciona colunas
-- nulas — pode rodar em produção sem parada. Equivalente ao `npm run db:push`.
-- O servidor também cria estas colunas sozinho na subida (server/ensure-schema.ts).
ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS empreita_empresa text;
ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS empreita_pessoas integer;
ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS empreita_valor integer;
