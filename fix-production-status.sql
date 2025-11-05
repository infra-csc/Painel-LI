-- ============================================================================
-- SCRIPT DE CORREÇÃO PARA BANCO DE PRODUÇÃO
-- Problema: Pessoas com passagem comprada perderam o status ao confirmar escalação
-- ============================================================================

-- PASSO 1: IDENTIFICAR CASOS AFETADOS
-- Execute esta query primeiro para ver quantos casos existem

SELECT 
  ti.id,
  ti.status AS status_atual,
  ti.phase AS phase_atual,
  t.purchase_date AS data_compra_passagem,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM accommodations a 
      WHERE a.team_inclusion_id = ti.id 
      AND a.reservation_number IS NOT NULL 
      AND a.reservation_number != ''
    ) THEN 'hospedagem_passagem_comprada'
    ELSE 'passagem_comprada'
  END AS status_correto,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM accommodations a 
      WHERE a.team_inclusion_id = ti.id 
      AND a.reservation_number IS NOT NULL 
      AND a.reservation_number != ''
    ) THEN 'hospedagem'
    ELSE 'passagem'
  END AS phase_correto
FROM team_inclusions ti
INNER JOIN tickets t ON t.team_inclusion_id = ti.id
WHERE t.purchase_date IS NOT NULL  -- Passagem foi comprada
  AND ti.status IN ('confirmado', 'escalado', 'reaberto')  -- Status não reflete a compra
ORDER BY t.purchase_date DESC;


-- ============================================================================
-- PASSO 2: CORRIGIR STATUS DE PASSAGENS
-- Execute este UPDATE apenas depois de verificar os resultados do PASSO 1
-- ============================================================================

UPDATE team_inclusions ti
SET 
  status = CASE 
    WHEN EXISTS (
      SELECT 1 FROM accommodations a 
      WHERE a.team_inclusion_id = ti.id 
      AND a.reservation_number IS NOT NULL 
      AND a.reservation_number != ''
    ) THEN 'hospedagem_passagem_comprada'
    ELSE 'passagem_comprada'
  END,
  phase = CASE 
    WHEN EXISTS (
      SELECT 1 FROM accommodations a 
      WHERE a.team_inclusion_id = ti.id 
      AND a.reservation_number IS NOT NULL 
      AND a.reservation_number != ''
    ) THEN 'hospedagem'
    ELSE 'passagem'
  END,
  updated_at = NOW()
FROM tickets t
WHERE t.team_inclusion_id = ti.id
  AND t.purchase_date IS NOT NULL  -- Passagem foi comprada
  AND ti.status IN ('confirmado', 'escalado', 'reaberto');  -- Status não reflete a compra


-- ============================================================================
-- PASSO 3: VERIFICAR CASOS DE HOSPEDAGEM (sem passagem)
-- ============================================================================

SELECT 
  ti.id,
  ti.status AS status_atual,
  ti.phase AS phase_atual,
  a.reservation_number AS numero_reserva,
  a.check_in_date AS data_checkin,
  'hospedagem_comprada' AS status_correto,
  'hospedagem' AS phase_correto
FROM team_inclusions ti
INNER JOIN accommodations a ON a.team_inclusion_id = ti.id
WHERE a.reservation_number IS NOT NULL 
  AND a.reservation_number != ''
  AND ti.status IN ('confirmado', 'escalado', 'reaberto')
  AND NOT EXISTS (
    SELECT 1 FROM tickets t 
    WHERE t.team_inclusion_id = ti.id 
    AND t.purchase_date IS NOT NULL
  )
ORDER BY a.check_in_date DESC;


-- ============================================================================
-- PASSO 4: CORRIGIR STATUS DE HOSPEDAGENS (sem passagem)
-- Execute apenas depois de verificar os resultados do PASSO 3
-- ============================================================================

UPDATE team_inclusions ti
SET 
  status = 'hospedagem_comprada',
  phase = 'hospedagem',
  updated_at = NOW()
FROM accommodations a
WHERE a.team_inclusion_id = ti.id
  AND a.reservation_number IS NOT NULL 
  AND a.reservation_number != ''
  AND ti.status IN ('confirmado', 'escalado', 'reaberto')
  AND NOT EXISTS (
    SELECT 1 FROM tickets t 
    WHERE t.team_inclusion_id = ti.id 
    AND t.purchase_date IS NOT NULL
  );


-- ============================================================================
-- PASSO 5: VERIFICAÇÃO FINAL
-- Execute para confirmar que tudo foi corrigido
-- ============================================================================

SELECT 
  'Casos Corrigidos - Passagem' AS tipo,
  COUNT(*) AS total
FROM team_inclusions ti
INNER JOIN tickets t ON t.team_inclusion_id = ti.id
WHERE t.purchase_date IS NOT NULL
  AND ti.status IN ('passagem_comprada', 'hospedagem_passagem_comprada')

UNION ALL

SELECT 
  'Casos Corrigidos - Hospedagem' AS tipo,
  COUNT(*) AS total
FROM team_inclusions ti
INNER JOIN accommodations a ON a.team_inclusion_id = ti.id
WHERE a.reservation_number IS NOT NULL 
  AND a.reservation_number != ''
  AND ti.status IN ('hospedagem_comprada', 'hospedagem_passagem_comprada')

UNION ALL

SELECT 
  'Casos Ainda Afetados - Passagem' AS tipo,
  COUNT(*) AS total
FROM team_inclusions ti
INNER JOIN tickets t ON t.team_inclusion_id = ti.id
WHERE t.purchase_date IS NOT NULL
  AND ti.status IN ('confirmado', 'escalado', 'reaberto')

UNION ALL

SELECT 
  'Casos Ainda Afetados - Hospedagem' AS tipo,
  COUNT(*) AS total
FROM team_inclusions ti
INNER JOIN accommodations a ON a.team_inclusion_id = ti.id
WHERE a.reservation_number IS NOT NULL 
  AND a.reservation_number != ''
  AND ti.status IN ('confirmado', 'escalado', 'reaberto')
  AND NOT EXISTS (
    SELECT 1 FROM tickets t 
    WHERE t.team_inclusion_id = ti.id 
    AND t.purchase_date IS NOT NULL
  );
