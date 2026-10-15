-- 09/10/2026 — Busca de passagens, etapa 2: abas de análise, previsão por
-- escalação e os extras aprovados pelo dono (acompanhar preço, teto por trecho).
--
-- Aditiva e idempotente: uma coluna nula e duas tabelas novas, sem tocar em
-- dado nenhum. O server/ensure-schema.ts cria as mesmas estruturas no boot;
-- este arquivo é o registro da mudança e serve para quem prefere rodar à mão
-- antes de publicar (lembrete: no Replit, db push no Shell ANTES do Republish).
--
-- Os ajustes novos (teto por trecho, limite/queda/hora do acompanhamento,
-- valor da mala, funções que despacham mala) moram em system_settings e têm
-- padrão no código (shared/regras-da-busca.ts · AJUSTES_PADRAO): nada a inserir.

-- Teto por trecho: valor acima de N% do típico da rota exige justificativa.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS justificativa_preco text;

-- Acompanhar preço: uma linha por escalação acompanhada (uma ATIVA por vaga).
CREATE TABLE IF NOT EXISTS busca_passagens_acompanhamentos (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  team_inclusion_id varchar NOT NULL,
  criado_por varchar,
  criado_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true,
  ajuste jsonb,                    -- ajuste da busca ao começar (aeroporto, datas…)
  chaves text[],                   -- consultas da vaga na última checagem
  preco_inicial_centavos integer,
  preco_referencia_centavos integer, -- base do "caiu X%"
  ultimo_preco_centavos integer,
  menor_preco_centavos integer,
  ultima_checagem_em timestamptz,
  tendencia text,                  -- 'subir' | 'baixar' | 'estavel' | 'sem_dado'
  aviso text,                      -- 'caiu' | 'subir'
  aviso_texto text,
  aviso_em timestamptz,
  aviso_visto_em timestamptz,
  parado_em timestamptz,
  motivo_parada text
);
CREATE UNIQUE INDEX IF NOT EXISTS busca_passagens_acomp_vaga_ativa_uq ON busca_passagens_acompanhamentos (team_inclusion_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS busca_passagens_acomp_ativos_idx ON busca_passagens_acompanhamentos (ativo);

-- Lock diário do agendador: só a réplica que inserir o dia roda a checagem.
CREATE TABLE IF NOT EXISTS busca_passagens_execucoes (
  dia date PRIMARY KEY,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  terminado_em timestamptz,
  instancia text,
  resumo jsonb
);
