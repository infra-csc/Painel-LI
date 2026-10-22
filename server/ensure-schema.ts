/**
 * Estrutura mínima garantida na subida do servidor (28/08).
 *
 * Por que isto existe: neste projeto o `db:push` do Drizzle já foi executado a
 * partir de um checkout ANTIGO do código apontando para o banco de produção.
 * O push sincroniza o banco com o schema que ele enxerga, então tudo o que era
 * mais novo que aquele checkout foi APAGADO — a coluna `tickets.return_arrival_time`
 * e a tabela `event_comments` sumiram duas vezes no mesmo dia. Para o usuário
 * isso aparecia como "Dados inválidos" ao registrar passagem, sem nenhuma pista
 * de que a causa era o banco.
 *
 * Cada comando aqui é idempotente (IF NOT EXISTS) e barato. Rodando a cada
 * boot, um push destrutivo é desfeito no próximo restart em vez de virar um
 * chamado de suporte.
 *
 * ISTO NÃO SUBSTITUI as migrações de `scripts/migrations/` — que continuam
 * sendo o registro do que mudou e o lugar de migração de DADOS. Aqui entram só
 * as estruturas que a aplicação NÃO consegue viver sem.
 */
import { pool } from "./db";
import { SQL_USUARIO_SISTEMA, USUARIO_SISTEMA } from "./usuario-sistema";

interface Passo { descricao: string; sql: string }

const PASSOS: Passo[] = [
  {
    descricao: "tickets.return_arrival_time (chegada da volta — mobilidade 20h–5h)",
    sql: `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS return_arrival_time text`,
  },
  {
    descricao: "tabela event_comments (mural do evento)",
    sql: `CREATE TABLE IF NOT EXISTS event_comments (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id varchar NOT NULL REFERENCES users(id),
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    descricao: "índice de comentários por evento",
    sql: `CREATE INDEX IF NOT EXISTS event_comments_event_idx ON event_comments (event_id, created_at DESC)`,
  },
  // 31/08 — as cinco colunas da roteirização editável. Foram criadas por
  // migração e sumiram no mesmo dia, pelo mesmo motivo descrito no topo deste
  // arquivo: um db:push de checkout antigo. Aqui elas voltam a cada boot.
  {
    descricao: "uber_groups.suggested_time (horário calculado, separado do ajuste à mão)",
    sql: `ALTER TABLE uber_groups ADD COLUMN IF NOT EXISTS suggested_time text`,
  },
  {
    descricao: "uber_groups.manual_time (horário ajustado à mão — o que o recálculo preserva)",
    sql: `ALTER TABLE uber_groups ADD COLUMN IF NOT EXISTS manual_time text`,
  },
  {
    descricao: "uber_groups.titular_collaborator_id (responsável pelo carro)",
    sql: `ALTER TABLE uber_groups ADD COLUMN IF NOT EXISTS titular_collaborator_id varchar REFERENCES collaborators(id)`,
  },
  {
    descricao: "team_inclusions.skip_uber (dispensado da roteirização)",
    sql: `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS skip_uber boolean NOT NULL DEFAULT false`,
  },
  {
    descricao: "hotel_room_group_members.check_in_date (estadia por pessoa)",
    sql: `ALTER TABLE hotel_room_group_members ADD COLUMN IF NOT EXISTS check_in_date date`,
  },
  {
    descricao: "hotel_room_group_members.check_out_date (estadia por pessoa)",
    sql: `ALTER TABLE hotel_room_group_members ADD COLUMN IF NOT EXISTS check_out_date date`,
  },
  // 10/09 — empreita por EMPRESA na vaga de cenotécnica (nome, pessoas, valor
  // em centavos). O `select` explícito do storage lista estas colunas: sem
  // elas, toda a listagem de inclusões cai. Nulas e aditivas — seguras em prod.
  {
    descricao: "team_inclusions.empreita_empresa (empresa que fornece a equipe)",
    sql: `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS empreita_empresa text`,
  },
  {
    descricao: "team_inclusions.empreita_pessoas (quantidade — só informativa)",
    sql: `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS empreita_pessoas integer`,
  },
  {
    descricao: "team_inclusions.empreita_valor (valor fechado, em centavos)",
    sql: `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS empreita_valor integer`,
  },
  // 14/09 — "Sai de" do novo colaborador na troca. O POST grava a coluna e as
  // listagens fazem `SELECT sr.*`: sem ela, pedir troca cai.
  {
    descricao: "swap_requests.new_city (de onde o novo colaborador sai)",
    sql: `ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS new_city text`,
  },
  // 14/09 — permuta de colaboradores: tipo da troca, a outra vaga e o "Sai de"
  // de quem vai para ela. O POST grava as três e as listagens as leem.
  {
    descricao: "swap_requests.swap_kind (substituicao | permuta)",
    sql: `ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS swap_kind text NOT NULL DEFAULT 'substituicao'`,
  },
  {
    descricao: "swap_requests.paired_inclusion_id (a outra vaga da permuta)",
    sql: `ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS paired_inclusion_id varchar`,
  },
  {
    descricao: "swap_requests.paired_new_city (de onde sai quem vai para a outra vaga)",
    sql: `ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS paired_new_city text`,
  },
  // 22/09 — endereço do colaborador (opcional). O GET de colaboradores lê todas
  // as colunas do schema: sem estas, a lista inteira quebraria.
  {
    descricao: "collaborators.address_street (endereço, opcional)",
    sql: `ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS address_street text`,
  },
  {
    descricao: "collaborators.address_number (endereço, opcional)",
    sql: `ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS address_number text`,
  },
  {
    descricao: "collaborators.address_complement (endereço, opcional)",
    sql: `ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS address_complement text`,
  },
  {
    descricao: "collaborators.address_zip (endereço, opcional)",
    sql: `ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS address_zip text`,
  },
  // 24/09 — observação opcional de quem valida a vaga na Validação de Escala,
  // lida pelo aprovador. O `select` explícito do storage lista a coluna: sem
  // ela, toda a listagem de vagas cai. Nula e aditiva — segura em prod.
  // 01/10 — passagem de quem saiu numa troca aprovada vira histórico (não é
  // apagada; o custo continua no evento). Nulas e aditivas.
  {
    descricao: "tickets.archived_at / archived_collaborator_id / archived_reason (histórico de passagem após troca)",
    sql: `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS archived_at timestamptz;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS archived_collaborator_id varchar;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS archived_reason text`,
  },
  // 02/10 — aviso para Compras quando um ajuste aprovado mexe em vaga que já
  // tem passagem/hospedagem. Tabela nova: sem ela a APROVAÇÃO do ajuste cai
  // (o aviso é gravado na mesma transação), por isso entra aqui.
  {
    descricao: "tabela avisos_de_alteracao (ajuste aprovado → Compras remarca)",
    sql: `CREATE TABLE IF NOT EXISTS avisos_de_alteracao (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      team_inclusion_id varchar NOT NULL REFERENCES team_inclusions(id) ON DELETE CASCADE,
      event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      change_request_id varchar REFERENCES scaling_change_requests(id) ON DELETE SET NULL,
      mudancas jsonb NOT NULL,
      afeta_passagem boolean NOT NULL DEFAULT false,
      afeta_hospedagem boolean NOT NULL DEFAULT false,
      motivo text,
      pedido_por_nome text,
      comentario_do_aprovador text,
      aprovado_por varchar,
      aprovado_por_nome text NOT NULL,
      aprovado_em timestamptz NOT NULL,
      resolvido_em timestamptz,
      resolvido_por varchar,
      resolvido_por_nome text,
      resolucao text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    descricao: "índice avisos_de_alteracao_pendentes_idx",
    sql: `CREATE INDEX IF NOT EXISTS avisos_de_alteracao_pendentes_idx ON avisos_de_alteracao (aprovado_em) WHERE resolvido_em IS NULL`,
  },
  {
    descricao: "índice avisos_de_alteracao_vaga_idx",
    sql: `CREATE INDEX IF NOT EXISTS avisos_de_alteracao_vaga_idx ON avisos_de_alteracao (team_inclusion_id)`,
  },
  // 08/10 — rascunho dos ajustes do Planejado no servidor (antes só no
  // localStorage: quem trocava de computador perdia o que ajustou). Tabela
  // nova: sem ela as rotas do rascunho respondem 500 e a tela cai para o
  // rascunho local — por isso entra aqui, além da migração da data.
  {
    descricao: "tabela rascunhos_do_planejado (ajustes do Planejado por evento + usuário)",
    sql: `CREATE TABLE IF NOT EXISTS rascunhos_do_planejado (
      event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id varchar NOT NULL,
      overrides jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (event_id, user_id)
    )`,
  },
  // 16/10 — honorários da cenotécnica (pedido → aprovação → liberação da
  // verba). Tabelas novas e aditivas; sem elas as rotas do módulo respondem
  // 500 — por isso entram aqui, além da migração da data.
  {
    descricao: "tabela honorarios_ceno (honorários da cenotécnica)",
    sql: `CREATE TABLE IF NOT EXISTS honorarios_ceno (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      tipo text NOT NULL,
      team_inclusion_id varchar REFERENCES team_inclusions(id),
      function_id varchar REFERENCES functions(id),
      collaborator_id varchar,
      nome text NOT NULL,
      pessoas integer,
      descricao text,
      setor text,
      posicao text,
      inicio date,
      fim date,
      diarias integer,
      valor_pedido integer NOT NULL DEFAULT 0,
      valor_aprovado integer,
      observacao text,
      status text NOT NULL DEFAULT 'rascunho',
      versao integer NOT NULL DEFAULT 1,
      criado_por varchar NOT NULL,
      criado_por_nome text NOT NULL,
      enviado_por varchar,
      enviado_por_nome text,
      enviado_em timestamptz,
      decidido_por varchar,
      decidido_por_nome text,
      decidido_em timestamptz,
      motivo_decisao text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    descricao: "índice honorarios_ceno_evento_idx",
    sql: `CREATE INDEX IF NOT EXISTS honorarios_ceno_evento_idx ON honorarios_ceno (event_id)`,
  },
  {
    descricao: "índice honorarios_ceno_status_idx",
    sql: `CREATE INDEX IF NOT EXISTS honorarios_ceno_status_idx ON honorarios_ceno (status)`,
  },
  {
    descricao: "índice honorarios_ceno_vaga_uq",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS honorarios_ceno_vaga_uq ON honorarios_ceno (team_inclusion_id) WHERE team_inclusion_id IS NOT NULL`,
  },
  {
    descricao: "tabela honorarios_ceno_historico (honorários da cenotécnica)",
    sql: `CREATE TABLE IF NOT EXISTS honorarios_ceno_historico (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      honorario_id varchar NOT NULL REFERENCES honorarios_ceno(id) ON DELETE CASCADE,
      acao text NOT NULL,
      valor_anterior integer,
      valor_novo integer,
      motivo text,
      detalhe text,
      por_id varchar NOT NULL,
      por_nome text NOT NULL,
      em timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    descricao: "índice honorarios_ceno_historico_idx",
    sql: `CREATE INDEX IF NOT EXISTS honorarios_ceno_historico_idx ON honorarios_ceno_historico (honorario_id, em)`,
  },
  {
    descricao: "tabela honorarios_ceno_liberacoes (honorários da cenotécnica)",
    sql: `CREATE TABLE IF NOT EXISTS honorarios_ceno_liberacoes (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      honorario_id varchar NOT NULL REFERENCES honorarios_ceno(id) ON DELETE CASCADE,
      data date NOT NULL,
      oc text NOT NULL,
      valor integer NOT NULL,
      observacao text,
      por_id varchar NOT NULL,
      por_nome text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      estornada_em timestamptz,
      estornada_por varchar,
      estornada_por_nome text,
      motivo_estorno text
    )`,
  },
  {
    descricao: "índice honorarios_ceno_liberacoes_idx",
    sql: `CREATE INDEX IF NOT EXISTS honorarios_ceno_liberacoes_idx ON honorarios_ceno_liberacoes (honorario_id)`,
  },
  // 20/10 — tipo de freela no pedido e empreita que agrupa vagas. O select
  // do módulo lê a coluna nova e as rotas leem a tabela de ligação: sem elas,
  // os honorários caem. Aditivas — seguras em prod.
  {
    descricao: "honorarios_ceno.tipo_freela (tabela da cenotécnica ou outro valor)",
    sql: `ALTER TABLE honorarios_ceno ADD COLUMN IF NOT EXISTS tipo_freela text`,
  },
  {
    descricao: "tabela honorarios_ceno_empreita_vagas (vagas de cada empreita)",
    sql: `CREATE TABLE IF NOT EXISTS honorarios_ceno_empreita_vagas (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      honorario_id varchar NOT NULL REFERENCES honorarios_ceno(id) ON DELETE CASCADE,
      team_inclusion_id varchar NOT NULL REFERENCES team_inclusions(id),
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    descricao: "índice honorarios_ceno_empreita_vagas_honorario_idx",
    sql: `CREATE INDEX IF NOT EXISTS honorarios_ceno_empreita_vagas_honorario_idx ON honorarios_ceno_empreita_vagas (honorario_id)`,
  },
  {
    descricao: "índice honorarios_ceno_empreita_vagas_vaga_uq (uma vaga em uma empreita só)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS honorarios_ceno_empreita_vagas_vaga_uq ON honorarios_ceno_empreita_vagas (team_inclusion_id)`,
  },
  // 09/10 — trecho direto entre eventos e viagem de uma perna (caso Alonso:
  // Aracaju → João Pessoa). O `select` explícito do storage lista as colunas
  // da vaga e o GET de passagens lê todas as de tickets: sem elas, as duas
  // listagens caem. Nulas e aditivas — seguras em prod.
  {
    descricao: "team_inclusions.trechos_sugeridos (só ida / só volta sugerida)",
    sql: `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS trechos_sugeridos text`,
  },
  {
    descricao: "team_inclusions.ida_vem_do_evento_id (ida direto de outro evento)",
    sql: `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS ida_vem_do_evento_id varchar`,
  },
  {
    descricao: "team_inclusions.volta_segue_para_evento_id (sem volta: segue para outro evento)",
    sql: `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS volta_segue_para_evento_id varchar`,
  },
  {
    descricao: "tickets.ida_vem_de_inclusion_id (trecho direto confirmado por Compras)",
    sql: `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ida_vem_de_inclusion_id varchar`,
  },
  // 16/10 — transporte terrestre da vaga (carro/van/ônibus por perna). A
  // derivação do status da vaga e o alerta "sem passagem" leem esta tabela:
  // sem ela, registrar passagem cairia — por isso entra aqui.
  {
    descricao: "tabela transportes_terrestres (vaga vai de carro/van/ônibus em vez de avião)",
    sql: `CREATE TABLE IF NOT EXISTS transportes_terrestres (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      team_inclusion_id varchar NOT NULL REFERENCES team_inclusions(id) ON DELETE CASCADE,
      trecho text NOT NULL,
      modo text NOT NULL,
      empresa text,
      valor_centavos integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by varchar REFERENCES users(id),
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by varchar REFERENCES users(id)
    )`,
  },
  {
    descricao: "índice transportes_terrestres_vaga_trecho_uq",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS transportes_terrestres_vaga_trecho_uq ON transportes_terrestres (team_inclusion_id, trecho)`,
  },
  // 21/10 — grupo do total dividido (a van que leva várias vagas). Todo SELECT
  // da tabela lê a coluna: sem ela, Passagens cai — por isso entra aqui.
  // Nula e aditiva.
  {
    descricao: "transportes_terrestres.grupo_id (total da van dividido entre vagas)",
    sql: `ALTER TABLE transportes_terrestres ADD COLUMN IF NOT EXISTS grupo_id varchar`,
  },
  {
    descricao: "índice transportes_terrestres_grupo_idx",
    sql: `CREATE INDEX IF NOT EXISTS transportes_terrestres_grupo_idx ON transportes_terrestres (grupo_id)`,
  },
  // 20/10 — valores do hotel na aba Quartos do Espelho (tarifas por pessoa por
  // noite, fatura, diária própria e valor pago do quarto, late check-out por
  // pessoa). Tabelas novas, nenhuma coluna existente muda. O Espelho lê estas
  // tabelas com tolerância (sem elas, o custo segue a regra de antes).
  {
    descricao: "tabela hotel_tarifas_evento (tarifas do hotel e fatura do evento)",
    sql: `CREATE TABLE IF NOT EXISTS hotel_tarifas_evento (
      event_id varchar PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      individual_centavos integer,
      duplo_centavos integer,
      triplo_centavos integer,
      fatura_centavos integer,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by varchar REFERENCES users(id)
    )`,
  },
  // 22/10 — o hotel do evento tem Duplo/Triplo? Todo SELECT da tabela lê as
  // colunas (Espelho, valores do hotel): sem elas, os valores somem da aba.
  // Aditivas, padrão verdadeiro (o comportamento de antes).
  {
    descricao: "hotel_tarifas_evento.tem_duplo (o hotel tem apartamento duplo)",
    sql: `ALTER TABLE hotel_tarifas_evento ADD COLUMN IF NOT EXISTS tem_duplo boolean NOT NULL DEFAULT true`,
  },
  {
    descricao: "hotel_tarifas_evento.tem_triplo (o hotel tem apartamento triplo)",
    sql: `ALTER TABLE hotel_tarifas_evento ADD COLUMN IF NOT EXISTS tem_triplo boolean NOT NULL DEFAULT true`,
  },
  {
    descricao: "tabela hotel_valores_quarto (diária própria e valor pago do quarto)",
    sql: `CREATE TABLE IF NOT EXISTS hotel_valores_quarto (
      hotel_room_group_id varchar PRIMARY KEY REFERENCES hotel_room_groups(id) ON DELETE CASCADE,
      event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      diaria_propria_centavos integer,
      valor_pago_centavos integer,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by varchar REFERENCES users(id)
    )`,
  },
  {
    descricao: "índice hotel_valores_quarto_evento_idx",
    sql: `CREATE INDEX IF NOT EXISTS hotel_valores_quarto_evento_idx ON hotel_valores_quarto (event_id)`,
  },
  {
    descricao: "tabela hotel_late_checkouts (late check-out por pessoa no evento)",
    sql: `CREATE TABLE IF NOT EXISTS hotel_late_checkouts (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      collaborator_id varchar NOT NULL REFERENCES collaborators(id),
      ativo boolean NOT NULL DEFAULT true,
      valor_centavos integer,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by varchar REFERENCES users(id)
    )`,
  },
  {
    descricao: "índice hotel_late_checkouts_evento_pessoa_uq",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS hotel_late_checkouts_evento_pessoa_uq ON hotel_late_checkouts (event_id, collaborator_id)`,
  },
  {
    descricao: "scaling_change_requests.grupo_id (pedido de ajuste em par)",
    sql: `ALTER TABLE scaling_change_requests ADD COLUMN IF NOT EXISTS grupo_id varchar`,
  },
  {
    descricao: "team_inclusions.validation_note (observação de quem validou a vaga)",
    sql: `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS validation_note text`,
  },
  // 25/09 — estado que era por instância (Map em memória) e passou para o
  // banco, porque o autoscale sobe N instâncias: token de SSO já consumido e
  // contadores do rate limit de login/reset. Sem estas tabelas o SSO recusa
  // todo token (fail-closed) — por isso entram aqui, não só na migração.
  {
    descricao: "tabela sso_tokens_usados (anti-reuso do JWT do Portal, compartilhado entre instâncias)",
    sql: `CREATE TABLE IF NOT EXISTS sso_tokens_usados (
      jti text PRIMARY KEY,
      expira_em timestamptz NOT NULL
    )`,
  },
  {
    descricao: "tabela rate_limits (contadores do express-rate-limit, compartilhados entre instâncias)",
    sql: `CREATE TABLE IF NOT EXISTS rate_limits (
      chave text PRIMARY KEY,
      hits integer NOT NULL DEFAULT 0,
      expira_em timestamptz NOT NULL
    )`,
  },
  // 09/10 — busca de passagens na internet. `events` é lido com SELECT * em
  // toda a aplicação: sem a coluna, a lista de eventos inteira cai — por isso
  // entra aqui. As duas tabelas são novas e aditivas (cache e consumo).
  {
    descricao: "events.aeroporto_iata (aeroporto do evento confirmado na busca de passagens)",
    sql: `ALTER TABLE events ADD COLUMN IF NOT EXISTS aeroporto_iata text`,
  },
  {
    descricao: "tabela busca_passagens_cache (consultas de preço compartilhadas por algumas horas)",
    sql: `CREATE TABLE IF NOT EXISTS busca_passagens_cache (
      chave text PRIMARY KEY,
      fornecedor text NOT NULL,
      resposta jsonb NOT NULL,
      consultado_em timestamptz NOT NULL DEFAULT now(),
      consultado_por varchar
    )`,
  },
  {
    descricao: "tabela busca_passagens_consumo (contador e teto mensal de consultas)",
    sql: `CREATE TABLE IF NOT EXISTS busca_passagens_consumo (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      consultado_em timestamptz NOT NULL DEFAULT now(),
      tipo text NOT NULL,
      chave text NOT NULL,
      fornecedor text NOT NULL,
      usuario_id varchar,
      do_cache boolean NOT NULL DEFAULT false
    )`,
  },
  {
    descricao: "índice do consumo da busca de passagens por data (contador do mês)",
    sql: `CREATE INDEX IF NOT EXISTS busca_passagens_consumo_mes_idx ON busca_passagens_consumo (consultado_em)`,
  },
  {
    descricao: "tabela busca_passagens_consultas (histórico das consultas — base das análises)",
    sql: `CREATE TABLE IF NOT EXISTS busca_passagens_consultas (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      consultado_em timestamptz NOT NULL DEFAULT now(),
      usuario_id varchar,
      fornecedor text NOT NULL,
      chave text NOT NULL,
      perna text NOT NULL,
      origem text NOT NULL,
      destino text NOT NULL,
      data_ida date NOT NULL,
      data_volta date,
      max_paradas integer NOT NULL,
      filtros jsonb,
      deslocamento jsonb,
      vaga_ids text[],
      evento_ids text[],
      antecedencia_dias integer,
      qtd_opcoes integer NOT NULL DEFAULT 0,
      menor_preco_centavos integer,
      menor_por_cia jsonb,
      observado_em timestamptz
    )`,
  },
  {
    descricao: "índice do histórico da busca por data da consulta",
    sql: `CREATE INDEX IF NOT EXISTS busca_passagens_consultas_em_idx ON busca_passagens_consultas (consultado_em)`,
  },
  {
    descricao: "índice do histórico da busca por rota e data do voo",
    sql: `CREATE INDEX IF NOT EXISTS busca_passagens_consultas_rota_idx ON busca_passagens_consultas (origem, destino, data_ida)`,
  },
  {
    descricao: "índice do histórico da busca por chave",
    sql: `CREATE INDEX IF NOT EXISTS busca_passagens_consultas_chave_idx ON busca_passagens_consultas (chave)`,
  },
  {
    descricao: "tabela busca_passagens_opcoes (10 opções mais baratas de cada consulta)",
    sql: `CREATE TABLE IF NOT EXISTS busca_passagens_opcoes (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      consulta_id varchar NOT NULL REFERENCES busca_passagens_consultas(id) ON DELETE CASCADE,
      posicao integer NOT NULL,
      itinerario_id text NOT NULL,
      companhia text NOT NULL,
      voos text NOT NULL,
      ida_partida text,
      ida_chegada text,
      volta_partida text,
      volta_chegada text,
      paradas integer NOT NULL,
      duracao_min integer,
      preco_centavos integer NOT NULL
    )`,
  },
  {
    descricao: "índice das opções por consulta",
    sql: `CREATE INDEX IF NOT EXISTS busca_passagens_opcoes_consulta_idx ON busca_passagens_opcoes (consulta_id)`,
  },
  {
    descricao: "índice das opções por companhia",
    sql: `CREATE INDEX IF NOT EXISTS busca_passagens_opcoes_cia_idx ON busca_passagens_opcoes (companhia)`,
  },
  {
    descricao: "tabela busca_passagens_usos (\"Usar este voo\" que virou passagem — pago × encontrado)",
    sql: `CREATE TABLE IF NOT EXISTS busca_passagens_usos (
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
    )`,
  },
  {
    descricao: "índice dos usos da busca por vaga",
    sql: `CREATE INDEX IF NOT EXISTS busca_passagens_usos_vaga_idx ON busca_passagens_usos (team_inclusion_id)`,
  },
  {
    descricao: "índice dos usos da busca por passagem",
    sql: `CREATE INDEX IF NOT EXISTS busca_passagens_usos_ticket_idx ON busca_passagens_usos (ticket_id)`,
  },
  // 09/10 — busca de passagens, etapa 2: teto por trecho (justificativa na
  // passagem), acompanhar preço e o lock diário do agendador.
  {
    descricao: "tickets.justificativa_preco (valor acima do teto por trecho)",
    sql: `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS justificativa_preco text`,
  },
  {
    descricao: "tabela busca_passagens_acompanhamentos (acompanhar preço de uma escalação)",
    sql: `CREATE TABLE IF NOT EXISTS busca_passagens_acompanhamentos (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      team_inclusion_id varchar NOT NULL,
      criado_por varchar,
      criado_em timestamptz NOT NULL DEFAULT now(),
      ativo boolean NOT NULL DEFAULT true,
      ajuste jsonb,
      chaves text[],
      preco_inicial_centavos integer,
      preco_referencia_centavos integer,
      ultimo_preco_centavos integer,
      menor_preco_centavos integer,
      ultima_checagem_em timestamptz,
      tendencia text,
      aviso text,
      aviso_texto text,
      aviso_em timestamptz,
      aviso_visto_em timestamptz,
      parado_em timestamptz,
      motivo_parada text
    )`,
  },
  {
    descricao: "um acompanhamento ATIVO por vaga",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS busca_passagens_acomp_vaga_ativa_uq ON busca_passagens_acompanhamentos (team_inclusion_id) WHERE ativo`,
  },
  {
    descricao: "índice dos acompanhamentos ativos",
    sql: `CREATE INDEX IF NOT EXISTS busca_passagens_acomp_ativos_idx ON busca_passagens_acompanhamentos (ativo)`,
  },
  {
    descricao: "tabela busca_passagens_execucoes (lock diário do agendador do acompanhamento)",
    sql: `CREATE TABLE IF NOT EXISTS busca_passagens_execucoes (
      dia date PRIMARY KEY,
      iniciado_em timestamptz NOT NULL DEFAULT now(),
      terminado_em timestamptz,
      instancia text,
      resumo jsonb
    )`,
  },
  // 25/09 — usuário fixo 'system' em users: team_inclusion_logs.user_id
  // aponta para ele quando a vaga muda sem ator humano. Sem a linha, a FK
  // (declarada no schema; criada NOT VALID pela migração de 25/09) recusa o
  // log e a transação da vaga inteira cai. Ver server/usuario-sistema.ts.
  {
    descricao: "usuário de sistema 'system' em users (FK de team_inclusion_logs.user_id)",
    sql: SQL_USUARIO_SISTEMA,
  },
];

/**
 * Nunca derruba o servidor: um passo que falhe (permissão, banco em migração)
 * é registrado e a subida continua — o app pode funcionar sem parte disto,
 * mas não pode ficar fora do ar por causa daqui.
 *
 * 24/09: `ALTER TABLE … ADD COLUMN IF NOT EXISTS` pega lock ACCESS EXCLUSIVE
 * ANTES de descobrir que a coluna já existe. Com deploy autoscale, cada
 * instância nova fazia isso em tabelas quentes (team_inclusions, tickets…) com
 * tráfego ativo: um SELECT longo na fila e todas as queries seguintes atrás do
 * ALTER. Agora: (1) consulta o catálogo primeiro e só roda o DDL que falta;
 * (2) o DDL roda com lock_timeout de 2 s — se a tabela estiver ocupada, desiste
 * e tenta no próximo boot em vez de travar produção.
 */
const RE_COLUNA = /ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/i;
const RE_TABELA = /CREATE TABLE IF NOT EXISTS (\w+)/i;
const RE_INDICE = /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS (\w+)/i;

async function jaExiste(sql: string): Promise<boolean> {
  if (sql === SQL_USUARIO_SISTEMA) {
    const r = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [USUARIO_SISTEMA.id]);
    return (r.rowCount ?? 0) > 0;
  }
  const col = sql.match(RE_COLUNA);
  if (col) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
      [col[1], col[2]],
    );
    return (r.rowCount ?? 0) > 0;
  }
  const tab = sql.match(RE_TABELA);
  if (tab) {
    const r = await pool.query(
      `SELECT 1 FROM pg_tables WHERE schemaname = current_schema() AND tablename = $1`,
      [tab[1]],
    );
    return (r.rowCount ?? 0) > 0;
  }
  const idx = sql.match(RE_INDICE);
  if (idx) {
    const r = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1`,
      [idx[1]],
    );
    return (r.rowCount ?? 0) > 0;
  }
  return false;
}

export async function garantirEstrutura(): Promise<void> {
  // Postgres embutido (PGlite — testes e `npm run dev:demo`): o schema é
  // gerado inteiro a partir de shared/schema.ts (server/dev/pglite-schema.ts)
  // antes de qualquer request; não há db:push antigo para desfazer, e o
  // `pool` mínimo desse modo não tem `connect()`.
  if (process.env.PAINEL_DB === "pglite") return;
  await reporEstruturaAusente();
  await aplicarAjustesDeDados();
}

/**
 * Ajustes de DADOS de uma vez só, depois da estrutura (a tabela tem que
 * existir). Cada um é idempotente e marca a própria versão no banco; falhar
 * aqui só é registrado — tenta de novo no próximo boot.
 */
async function aplicarAjustesDeDados(): Promise<void> {
  try {
    // Import dinâmico: o passo usa o storage/log de auditoria, que este módulo
    // (importado pelo harness e pelo db) não deve arrastar.
    const { aplicarPrazosDoProcesso } = await import("./prazos-do-processo");
    if ((await aplicarPrazosDoProcesso()) === "aplicado") {
      console.warn("[estrutura] prazos da escala do processo do dono (16/10) aplicados");
    }
  } catch (erro) {
    console.error("[estrutura] falhou: prazos da escala do processo do dono —", erro instanceof Error ? erro.message : erro);
  }
  try {
    const { aplicarTabelaCenoDoDono } = await import("./tabela-ceno-do-dono");
    if ((await aplicarTabelaCenoDoDono()) === "aplicado") {
      console.warn("[estrutura] tabela de empreita da cenotécnica do dono (20/10) aplicada");
    }
  } catch (erro) {
    console.error("[estrutura] falhou: tabela da cenotécnica do dono —", erro instanceof Error ? erro.message : erro);
  }
}

async function reporEstruturaAusente(): Promise<void> {
  const faltando: Passo[] = [];
  for (const passo of PASSOS) {
    try {
      if (!(await jaExiste(passo.sql))) faltando.push(passo);
    } catch (erro) {
      console.error(`[estrutura] não consegui checar: ${passo.descricao} —`, erro instanceof Error ? erro.message : erro);
    }
  }
  if (faltando.length === 0) return;
  console.warn(`[estrutura] ${faltando.length} estrutura(s) ausente(s) — repondo (um db:push antigo apagou?)`);
  for (const passo of faltando) {
    const client = await pool.connect();
    try {
      await client.query(`SET lock_timeout = '2s'`);
      await client.query(passo.sql);
      console.warn(`[estrutura] reposto: ${passo.descricao}`);
    } catch (erro) {
      console.error(`[estrutura] falhou: ${passo.descricao} —`, erro instanceof Error ? erro.message : erro);
    } finally {
      client.release();
    }
  }
}
