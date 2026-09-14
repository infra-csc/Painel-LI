-- Permuta de colaboradores (Painel-LI, 14/09/2026). Só adiciona colunas —
-- pode rodar em produção sem parada. O servidor também cria as colunas
-- sozinho na subida (server/ensure-schema.ts).
ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS swap_kind text NOT NULL DEFAULT 'substituicao';
ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS paired_inclusion_id varchar;
ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS paired_new_city text;
