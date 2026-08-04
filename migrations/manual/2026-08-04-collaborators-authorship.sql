-- Autoria do cadastro de colaboradores (createdBy / updatedBy)
-- Pedido: slide 1 do deck "Ações de melhoria APP LI" — poder cobrar de quem
-- cadastrou quando faltam dados, como o telefone.
--
-- APLICAR ANTES OU JUNTO COM O DEPLOY do commit que adiciona estas colunas ao
-- shared/schema.ts. O Drizzle passa a listar as colunas em todo SELECT de
-- collaborators; se elas não existirem no banco, toda consulta de colaborador
-- falha e as telas de escalação, passagens e hospedagem quebram junto.
--
-- NÃO usar "npm run db:push" para isto. O snapshot em migrations/meta está
-- muito defasado em relação ao schema.ts real (colunas como
-- can_approve_cenotecnica, approved_by_production, cost_center e gender já
-- existem no código e não constam do snapshot 0000). Um push tentaria
-- reconciliar toda essa diferença de uma vez e pode propor alterações
-- destrutivas. Este ALTER é cirúrgico e idempotente.

BEGIN;

ALTER TABLE collaborators
  ADD COLUMN IF NOT EXISTS created_by varchar REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by varchar REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

COMMIT;

-- Registros existentes ficam com created_by/updated_by nulos: não há como
-- descobrir retroativamente quem os cadastrou. A tela mostra "—" nesse caso.
-- A autoria passa a valer para cadastros e edições daqui para frente.

-- Conferência:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'collaborators'
--      AND column_name IN ('created_by', 'updated_by', 'updated_at');
