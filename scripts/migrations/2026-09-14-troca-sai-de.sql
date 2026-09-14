-- "Sai de" do novo colaborador na troca (Painel-LI, 14/09/2026). Só adiciona
-- uma coluna nula — pode rodar em produção sem parada. O servidor também cria
-- a coluna sozinho na subida (server/ensure-schema.ts).
ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS new_city text;
