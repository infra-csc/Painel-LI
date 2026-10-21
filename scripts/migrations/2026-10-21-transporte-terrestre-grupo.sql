-- 21/10/2026 — "Vai de carro/van" em Passagens (dono, no painel Aplicar em
-- lote: "aqui só carro e van, e na van tem que ter um valor total da van e não
-- só por trecho").
-- O valor total da van é dividido entre as vagas marcadas e gravado como antes
-- (uma linha por vaga e trecho); as linhas dessa divisão levam o mesmo
-- grupo_id, para a linha da vaga mostrar "parte de R$ 1.200,00 · 8 vagas" e
-- para editar/desfazer a van inteira. Nulo = valor só daquela vaga (todos os
-- registros de antes ficam assim).
-- Aditiva e idempotente. O server/ensure-schema.ts também cria a coluna e o
-- índice no boot (o caminho normal é publicar); este arquivo é para rodar à
-- mão antes, se quiser. Este app NÃO tem db:push (docs/migracoes.md).
-- Espelho: shared/schema.ts (transportesTerrestres.grupoId).
ALTER TABLE transportes_terrestres ADD COLUMN IF NOT EXISTS grupo_id varchar;
CREATE INDEX IF NOT EXISTS transportes_terrestres_grupo_idx ON transportes_terrestres (grupo_id);
