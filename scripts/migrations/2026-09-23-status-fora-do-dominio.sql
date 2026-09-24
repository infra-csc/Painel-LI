-- ============================================================================
-- Diagnóstico e limpeza SUGERIDA de status/fase fora do domínio (23/09)
--
-- NÃO roda sozinho. O dono executa à mão, um bloco por vez, conferindo o
-- resultado do diagnóstico antes de cada UPDATE. O domínio canônico está em
-- shared/vaga-status.ts (STATUS_DA_VAGA / FASES_DA_VAGA); os legados
-- (incluido, pendente, aguardando_passagem, aguardando_hospedagem, confirmado)
-- são aceitos pelo CHECK NOT VALID do script 2026-09-23-indices-e-constraints.ts
-- só para não quebrar linhas antigas — a intenção é zerá-los.
-- ============================================================================

-- 1) DIAGNÓSTICO: distribuição de (status, phase), inclusive excluídas
SELECT status, phase, count(*)
FROM team_inclusions
GROUP BY 1, 2
ORDER BY 3 DESC;

-- 1b) Só o que está FORA do domínio canônico (deveria voltar vazio)
SELECT status, phase, (deleted_at IS NOT NULL) AS excluida, count(*)
FROM team_inclusions
WHERE status NOT IN (
  'planejado','reaberto','escalacao','aguardando_producao','escalado',
  'passagem','passagem_comprada','hospedagem','hospedagem_comprada','hospedagem_passagem_comprada',
  'aprovacao','aprovado','concluido','cancelado',
  'sugestao_pendente','sugestao_validada','sugestao_ajuste','sugestao_aprovada','sugestao_negada'
)
   OR phase NOT IN ('sugestao','inclusao','escalacao','passagem','hospedagem','aprovacao','aprovado','cancelado')
GROUP BY 1, 2, 3
ORDER BY 4 DESC;

-- 1c) Pares (status, phase) incoerentes entre si (ex.: status 'pendente' com
--     phase 'cancelado' = reativação antiga que gravava 'pendente' sem mexer na fase)
SELECT id, inclusion_number, status, phase, previous_status, updated_at
FROM team_inclusions
WHERE (status = 'cancelado' AND phase <> 'cancelado')
   OR (status <> 'cancelado' AND phase = 'cancelado')
   OR (status LIKE 'sugestao_%' AND phase <> 'sugestao')
   OR (status NOT LIKE 'sugestao_%' AND phase = 'sugestao')
ORDER BY updated_at DESC;

-- ============================================================================
-- 2) LIMPEZA SUGERIDA — descomente depois de conferir o diagnóstico.
--    Cada UPDATE é restrito ao caso conhecido; rode um por vez e confira
--    o "UPDATE n" contra a contagem do diagnóstico.
-- ============================================================================

-- 2a) 'incluido' era o nome antigo de 'planejado' (vaga criada, ninguém escalado)
-- UPDATE team_inclusions
--    SET status = 'planejado', phase = 'inclusao', updated_at = NOW()
--  WHERE status = 'incluido';

-- 2b) 'pendente' com phase 'cancelado' = reativada pela rota antiga (gravava
--     'pendente' e deixava a fase em 'cancelado'). Reativar hoje é 'reaberto'.
-- UPDATE team_inclusions
--    SET status = 'reaberto', phase = 'inclusao', updated_at = NOW()
--  WHERE status = 'pendente' AND phase = 'cancelado';

-- 2c) 'pendente' nas demais fases = vaga só salva; equivale a 'planejado'
-- UPDATE team_inclusions
--    SET status = 'planejado', updated_at = NOW()
--  WHERE status = 'pendente' AND phase <> 'cancelado';

-- 2d) 'confirmado' = escalação confirmada sem logística registrada → 'escalado'
--     (se houver passagem/hospedagem comprada, use o fix-production-status.sql)
-- UPDATE team_inclusions
--    SET status = 'escalado', phase = 'escalacao', updated_at = NOW()
--  WHERE status = 'confirmado';

-- 2e) 'aguardando_passagem' / 'aguardando_hospedagem' → etapas atuais
-- UPDATE team_inclusions
--    SET status = 'passagem', phase = 'passagem', updated_at = NOW()
--  WHERE status = 'aguardando_passagem';
-- UPDATE team_inclusions
--    SET status = 'hospedagem', phase = 'hospedagem', updated_at = NOW()
--  WHERE status = 'aguardando_hospedagem';

-- 3) Depois de limpar: trocar o CHECK "com legados" pelo canônico e validar
--    (só quando 1b voltar vazio)
-- ALTER TABLE team_inclusions DROP CONSTRAINT IF EXISTS team_inclusions_status_chk;
-- ALTER TABLE team_inclusions ADD CONSTRAINT team_inclusions_status_chk CHECK (status IN (
--   'planejado','reaberto','escalacao','aguardando_producao','escalado',
--   'passagem','passagem_comprada','hospedagem','hospedagem_comprada','hospedagem_passagem_comprada',
--   'aprovacao','aprovado','concluido','cancelado',
--   'sugestao_pendente','sugestao_validada','sugestao_ajuste','sugestao_aprovada','sugestao_negada'
-- )) NOT VALID;
-- ALTER TABLE team_inclusions VALIDATE CONSTRAINT team_inclusions_status_chk;
-- ALTER TABLE team_inclusions VALIDATE CONSTRAINT team_inclusions_phase_chk;
