-- ============================================================================
-- QUERIES PARA IDENTIFICAR REGISTROS AFETADOS NO BANCO DE PRODUÇÃO
-- ============================================================================

-- OPÇÃO 1: Buscar por NOME DO COLABORADOR
-- Substitua 'NOME_DO_COLABORADOR' pelo nome da pessoa
SELECT 
  ti.id AS team_inclusion_id,
  c.full_name AS nome_colaborador,
  e.name AS evento,
  f.name AS funcao,
  ti.status AS status_atual,
  ti.phase AS phase_atual,
  t.purchase_date AS data_compra_passagem,
  CASE WHEN t.id IS NOT NULL THEN 'SIM' ELSE 'NÃO' END AS tem_passagem
FROM team_inclusions ti
LEFT JOIN collaborators c ON c.id = ti.collaborator_id
LEFT JOIN events e ON e.id = ti.event_id
LEFT JOIN functions f ON f.id = ti.function_id
LEFT JOIN tickets t ON t.team_inclusion_id = ti.id
WHERE c.full_name ILIKE '%NOME_DO_COLABORADOR%'  -- Busca parcial, case insensitive
  AND ti.status = 'escalado'  -- Status antigo que pode estar incorreto
ORDER BY ti.created_at DESC;


-- OPÇÃO 2: Buscar por EVENTO
-- Substitua 'NOME_DO_EVENTO' pelo nome do evento
SELECT 
  ti.id AS team_inclusion_id,
  c.full_name AS nome_colaborador,
  e.name AS evento,
  f.name AS funcao,
  ti.status AS status_atual,
  ti.phase AS phase_atual,
  t.purchase_date AS data_compra_passagem,
  CASE WHEN t.id IS NOT NULL THEN 'SIM' ELSE 'NÃO' END AS tem_passagem
FROM team_inclusions ti
LEFT JOIN collaborators c ON c.id = ti.collaborator_id
LEFT JOIN events e ON e.id = ti.event_id
LEFT JOIN functions f ON f.id = ti.function_id
LEFT JOIN tickets t ON t.team_inclusion_id = ti.id
WHERE e.name ILIKE '%NOME_DO_EVENTO%'
  AND ti.status = 'escalado'  -- Status antigo que pode estar incorreto
  AND t.purchase_date IS NOT NULL  -- Tem passagem comprada
ORDER BY ti.created_at DESC;


-- OPÇÃO 3: Buscar por FUNÇÃO
-- Substitua 'NOME_DA_FUNCAO' pelo nome da função
SELECT 
  ti.id AS team_inclusion_id,
  c.full_name AS nome_colaborador,
  e.name AS evento,
  f.name AS funcao,
  ti.status AS status_atual,
  ti.phase AS phase_atual,
  t.purchase_date AS data_compra_passagem,
  CASE WHEN t.id IS NOT NULL THEN 'SIM' ELSE 'NÃO' END AS tem_passagem
FROM team_inclusions ti
LEFT JOIN collaborators c ON c.id = ti.collaborator_id
LEFT JOIN events e ON e.id = ti.event_id
LEFT JOIN functions f ON f.id = ti.function_id
LEFT JOIN tickets t ON t.team_inclusion_id = ti.id
WHERE f.name ILIKE '%NOME_DA_FUNCAO%'
  AND ti.status = 'escalado'  -- Status antigo que pode estar incorreto
  AND t.purchase_date IS NOT NULL
ORDER BY ti.created_at DESC;


-- OPÇÃO 4: LISTAR TODOS OS CASOS AFETADOS (com nomes legíveis)
-- Esta query mostra TODOS os registros com o problema
SELECT 
  ti.id AS team_inclusion_id,
  c.full_name AS colaborador,
  e.name AS evento,
  f.name AS funcao,
  ti.status AS status_atual,
  ti.phase AS phase_atual,
  t.purchase_date AS quando_comprou_passagem,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM accommodations a 
      WHERE a.team_inclusion_id = ti.id 
      AND a.reservation_number IS NOT NULL 
      AND a.reservation_number != ''
    ) THEN 'hospedagem_passagem_comprada'
    ELSE 'passagem_comprada'
  END AS status_deveria_ser
FROM team_inclusions ti
INNER JOIN tickets t ON t.team_inclusion_id = ti.id
LEFT JOIN collaborators c ON c.id = ti.collaborator_id
LEFT JOIN events e ON e.id = ti.event_id
LEFT JOIN functions f ON f.id = ti.function_id
WHERE t.purchase_date IS NOT NULL  -- Tem passagem comprada
  AND ti.status IN ('escalado', 'reaberto')  -- Status está errado (removido 'confirmado' pois não existe mais)
ORDER BY t.purchase_date DESC;


-- OPÇÃO 5: CORRIGIR UM REGISTRO ESPECÍFICO (depois de identificar o ID)
-- Substitua 'ID_DO_REGISTRO_AQUI' pelo UUID correto que você encontrou acima
-- Exemplo: 'caa2362d-a5b3-46c1-b907-1b8a1e...'

UPDATE team_inclusions
SET 
  status = CASE 
    WHEN EXISTS (
      SELECT 1 FROM accommodations a 
      WHERE a.team_inclusion_id = 'ID_DO_REGISTRO_AQUI'
      AND a.reservation_number IS NOT NULL 
      AND a.reservation_number != ''
    ) THEN 'hospedagem_passagem_comprada'
    ELSE 'passagem_comprada'
  END,
  phase = CASE 
    WHEN EXISTS (
      SELECT 1 FROM accommodations a 
      WHERE a.team_inclusion_id = 'ID_DO_REGISTRO_AQUI'
      AND a.reservation_number IS NOT NULL 
      AND a.reservation_number != ''
    ) THEN 'hospedagem'
    ELSE 'passagem'
  END,
  updated_at = NOW()
WHERE id = 'ID_DO_REGISTRO_AQUI';


-- OPÇÃO 6: VERIFICAR SE O REGISTRO FOI CORRIGIDO
-- Substitua 'ID_DO_REGISTRO_AQUI' pelo UUID
SELECT 
  ti.id,
  c.full_name AS colaborador,
  e.name AS evento,
  f.name AS funcao,
  ti.status,
  ti.phase,
  t.purchase_date AS data_compra_passagem,
  'CORRIGIDO!' AS resultado
FROM team_inclusions ti
LEFT JOIN collaborators c ON c.id = ti.collaborator_id
LEFT JOIN events e ON e.id = ti.event_id
LEFT JOIN functions f ON f.id = ti.function_id
LEFT JOIN tickets t ON t.team_inclusion_id = ti.id
WHERE ti.id = 'ID_DO_REGISTRO_AQUI';
