-- 09/10/2026 — trecho direto entre eventos ("pinga-pinga") e viagem de UMA
-- perna. Caso real: Alonso, vaga #4045 Night Run Aracaju e #4238 Makai João
-- Pessoa — "o Alonso vai direto de ARA p/ JP".
--
-- Aditiva e idempotente: só colunas novas, todas nulas, sem tocar em dado
-- nenhum. As passagens que JÁ se cruzam continuam como estão (decisão do dono):
-- a tela de Pendências só as lista.
--
-- O server/ensure-schema.ts cria as mesmas colunas no boot; este arquivo é o
-- registro da mudança e serve para quem prefere rodar à mão antes de publicar
-- (lembrete: no Replit, db push no Shell ANTES do Republish).

-- Vaga: indicação de quem planeja (Sugestão / Inclusão / Escalação).
-- null = ida e volta (o de sempre).
ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS trechos_sugeridos text;          -- 'ida_e_volta' | 'so_ida' | 'so_volta'
ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS ida_vem_do_evento_id varchar;    -- a ida sai direto deste evento
ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS volta_segue_para_evento_id varchar; -- sem volta: segue para este evento

-- Passagem: encadeamento confirmado por Compras. A ida desta passagem sai do
-- evento da vaga indicada; aquela vaga fica sem volta própria. O custo do
-- trecho é desta vaga (a de destino).
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ida_vem_de_inclusion_id varchar;

-- Pedido de ajuste em PAR (as duas vagas do mesmo colaborador, decididas juntas).
ALTER TABLE scaling_change_requests ADD COLUMN IF NOT EXISTS grupo_id varchar;
