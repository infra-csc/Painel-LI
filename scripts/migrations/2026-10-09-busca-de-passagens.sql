-- 09/10/2026 — Busca de passagens na internet (LATAM, GOL e Azul): tela
-- própria /busca-de-passagens, para admin e Compras. Fornecedor: Ignav (chave
-- no Secret IGNAV_API_KEY — nunca no código nem no banco).
--
-- Aditiva e idempotente: uma coluna nula e tabelas novas, sem tocar em dado
-- nenhum. O server/ensure-schema.ts cria as mesmas estruturas no boot; este
-- arquivo é o registro da mudança e serve para quem prefere rodar à mão antes
-- de publicar (lembrete: no Replit, db push no Shell ANTES do Republish).

-- Aeroporto do evento, confirmado uma vez por admin/Compras na busca.
ALTER TABLE events ADD COLUMN IF NOT EXISTS aeroporto_iata text;

-- Cache COMPARTILHADO das consultas (3 h). A chave é o pedido normalizado
-- (perna, aeroportos, datas, filtros) — sem dado pessoal.
CREATE TABLE IF NOT EXISTS busca_passagens_cache (
  chave text PRIMARY KEY,
  fornecedor text NOT NULL,
  resposta jsonb NOT NULL,
  consultado_em timestamptz NOT NULL DEFAULT now(),
  consultado_por varchar
);

-- Consumo: uma linha por consulta de verdade (conta no teto) e uma por
-- resultado servido do cache a outra pessoa (do_cache = true, NÃO conta).
CREATE TABLE IF NOT EXISTS busca_passagens_consumo (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  consultado_em timestamptz NOT NULL DEFAULT now(),
  tipo text NOT NULL,            -- 'ida' | 'volta' | 'ida_e_volta' | 'link'
  chave text NOT NULL,
  fornecedor text NOT NULL,      -- 'ignav' | 'simulado'
  usuario_id varchar,
  do_cache boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS busca_passagens_consumo_mes_idx ON busca_passagens_consumo (consultado_em);

-- HISTÓRICO das consultas reais (para sempre) — base das análises.
CREATE TABLE IF NOT EXISTS busca_passagens_consultas (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  consultado_em timestamptz NOT NULL DEFAULT now(),
  usuario_id varchar,
  fornecedor text NOT NULL,
  chave text NOT NULL,
  perna text NOT NULL,           -- 'ida' | 'volta' | 'ida_e_volta'
  origem text NOT NULL,
  destino text NOT NULL,
  data_ida date NOT NULL,        -- data do voo (1ª perna)
  data_volta date,
  max_paradas integer NOT NULL,
  filtros jsonb,                 -- { horarioIda, horarioVolta } em horas
  deslocamento jsonb,            -- datas flexíveis: { ida, volta } em dias; null = data sugerida
  vaga_ids text[],
  evento_ids text[],
  antecedencia_dias integer,     -- dias entre a consulta (São Paulo) e o voo
  qtd_opcoes integer NOT NULL DEFAULT 0,
  menor_preco_centavos integer,
  menor_por_cia jsonb,           -- { "LA": 45600, "G3": 39800 }
  observado_em timestamptz
);
CREATE INDEX IF NOT EXISTS busca_passagens_consultas_em_idx ON busca_passagens_consultas (consultado_em);
CREATE INDEX IF NOT EXISTS busca_passagens_consultas_rota_idx ON busca_passagens_consultas (origem, destino, data_ida);
CREATE INDEX IF NOT EXISTS busca_passagens_consultas_chave_idx ON busca_passagens_consultas (chave);

-- As 10 opções mais baratas de cada consulta.
CREATE TABLE IF NOT EXISTS busca_passagens_opcoes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id varchar NOT NULL REFERENCES busca_passagens_consultas(id) ON DELETE CASCADE,
  posicao integer NOT NULL,
  itinerario_id text NOT NULL,
  companhia text NOT NULL,
  voos text NOT NULL,
  ida_partida text,              -- hora local "AAAA-MM-DDTHH:MM"
  ida_chegada text,
  volta_partida text,
  volta_chegada text,
  paradas integer NOT NULL,
  duracao_min integer,
  preco_centavos integer NOT NULL
);
CREATE INDEX IF NOT EXISTS busca_passagens_opcoes_consulta_idx ON busca_passagens_opcoes (consulta_id);
CREATE INDEX IF NOT EXISTS busca_passagens_opcoes_cia_idx ON busca_passagens_opcoes (companhia);

-- "Usar este voo" que virou passagem: preço encontrado × pago.
CREATE TABLE IF NOT EXISTS busca_passagens_usos (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  usado_em timestamptz NOT NULL DEFAULT now(),
  usuario_id varchar,
  team_inclusion_id varchar NOT NULL,
  ticket_id varchar,
  consulta_id varchar,
  chave text NOT NULL,
  perna text NOT NULL,
  itinerario_id text NOT NULL,
  companhia text,
  voos text,
  preco_encontrado_centavos integer NOT NULL,
  preco_visto_em timestamptz
);
CREATE INDEX IF NOT EXISTS busca_passagens_usos_vaga_idx ON busca_passagens_usos (team_inclusion_id);
CREATE INDEX IF NOT EXISTS busca_passagens_usos_ticket_idx ON busca_passagens_usos (ticket_id);

-- Teto mensal (padrão 1000 = as consultas grátis do plano). Só cria se não existir.
INSERT INTO system_settings (key, value)
SELECT 'busca_passagens_teto_mensal', '1000'
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'busca_passagens_teto_mensal');
