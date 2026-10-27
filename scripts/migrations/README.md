# scripts/migrations — índice

Índice cronológico dos scripts desta pasta, montado a partir do cabeçalho de
cada um (24/09/2026). Como escrever, rodar e o que está pendente:
[`docs/migracoes.md`](../../docs/migracoes.md).

Execução (sempre à mão, nunca no deploy):

```bash
DATABASE_URL="<connection string>" npx tsx scripts/migrations/<arquivo>.ts
psql "$DATABASE_URL" -f scripts/migrations/<arquivo>.sql
```

Legenda — **Tipo**: DDL (estrutura), Dados (seed/backfill), DDL+Dados,
Diag (só leitura/diagnóstico). **Idemp.**: pode rodar de novo sem efeito
colateral. **ES** = a estrutura também é reposta no boot por
`server/ensure-schema.ts`.

| Data | Script | O que faz | Tipo | Idemp. |
|---|---|---|---|---|
| 2026-08-13 | `2026-08-13-auditoria-fase1.ts` | Fase 1 da auditoria do Financeiro: índices nas colunas de filtro (`budget_planned`, `budget_actual`, `invoices`, `team_inclusions.event_id`), UNIQUEs (planejado por evento+colaborador+função, um comparativo por evento, uma NF por prestação) e FKs que faltavam. | DDL | sim (`IF NOT EXISTS`) |
| 2026-08-13 | `2026-08-13-melhorias-deck.ts` | Deck "Ações de melhoria": `collaborators.created_by/_name`, `team_inclusions.emits_nf`, tabela `flash_movements` + índice, e demais itens do deck. | DDL | sim |
| 2026-08-14 | `2026-08-14-alimentacao-por-voo.ts` | `tickets.actual_arrival_time` + 4 chaves de refeição em `system_settings` (Demais 40/40, Cenotécnica 35/35). | DDL+Dados | sim (`ON CONFLICT DO NOTHING`) |
| 2026-08-14 | `2026-08-14-atendimento-tipo.ts` | `team_inclusions.atendimento_tipo` + CHECK; backfill `executivo_contas` nas vagas de atendimento com colaborador; seeds `atendimento_key_account` / `_executivo_contas`. | DDL+Dados | sim (backfill só onde `IS NULL`) |
| 2026-08-14 | `2026-08-14-casa-diarias.ts` | Seeds das tarifas de casa (`casa_diaria_dir_prova`, `_produtor`, `_exec_vendas`). | Dados | sim |
| 2026-08-14 | `2026-08-14-deflacao-editavel.ts` | Seeds dos fatores de deflação (100/90/80). | Dados | sim |
| 2026-08-14 | `2026-08-14-freela-diarias.ts` | Seeds das tarifas freela (`freela_diaria_local`, `_viagem`, `_dir_prova`). | Dados | sim |
| 2026-08-17 | `2026-08-17-bagagem-historico.ts` | Importa contagens de bagagem pré-sistema (30 passageiros × CIA) do app antigo; resolve colaborador por CPF e nome; cria a tabela de histórico. Contém CPFs no fonte. | DDL+Dados | sim (`CREATE IF NOT EXISTS` + upsert por colaborador×CIA) |
| 2026-08-17 | `2026-08-17-controle-bagagem.ts` | Tabela `baggage_requests` com FKs, CHECKs (valor ≥ 0, quantidade ≥ 1) e índices. | DDL | sim |
| 2026-08-17 | `2026-08-17-flash-oc.ts` | `flash_movements.source_type/source_ref` + CHECK (`manual`/`oc`), índice e UNIQUE parcial por (NF, categoria). | DDL | sim |
| 2026-08-17 | `2026-08-17-percurseiro.ts` | `team_inclusions.percurseiro_tipo` + CHECK; backfill `tipo_1`; seeds do pacote do percurseiro e do almoço de casa em dia útil. | DDL+Dados | sim |
| 2026-08-17 | `2026-08-17-validacao-escala.ts` | Módulo Validação de Escala: `function_managers.role`, `team_inclusions.transport_mode_ida/volta` (+CHECK), `suggestion_sent_at`, `validated_at/_by`, tabela `scaling_change_requests` + índices. Não cria CHECK em status/fase (legados). | DDL | sim |
| 2026-08-18 | `2026-08-18-alimentacao-gestao.ts` | Seeds `alimentacao_almoco_gestao` / `_jantar_gestao` (R$ 44 Key Account/Gerente). | Dados | sim |
| 2026-08-19 | `2026-08-19-ceno-empreita.ts` | `team_inclusions.ceno_freela_tipo` + CHECK (4 modalidades); seeds das 20 células da tabela de empreita. | DDL+Dados | sim |
| 2026-08-19 | `2026-08-19-flash-comparativo.ts` | Crédito do Flash passa a nascer na aprovação do comparativo: recria o CHECK de `source_type` (aceita `comparativo`), UNIQUE parcial por (prestação, categoria) e índice (`source_type`, `event_id`). | DDL | sim (`DROP IF EXISTS` + `ADD`) |
| 2026-08-20 | `2026-08-20-escala-responsaveis.ts` | **Seed** dos validadores/aprovador ditados pelo dono em `function_managers` (casamento por nome/função normalizados). Hoje o módulo lê `scaling_function_managers` (ver 27/08). | Dados | sim (`ON CONFLICT DO NOTHING`; nome sem match vira aviso) |
| 2026-08-27 | `2026-08-27-aprovador-padrao.ts` | **Seed** de `system_settings.escala_aprovador_padrao` (users.id do aprovador global); só grava com exatamente um match de nome. | Dados | sim (conservador) |
| 2026-08-27 | `2026-08-27-chegada-volta.ts` | `tickets.return_arrival_time` (chegada da volta → regra de mobilidade 20h–5h). ES | DDL | sim |
| 2026-08-27 | `2026-08-27-passagem-emitida.ts` | `tickets.emitted_at` / `emitted_by` (carimbo "bilhete saiu"). | DDL | sim |
| 2026-08-27 | `2026-08-27-separar-responsaveis-escala.ts` | Cria `scaling_function_managers`, copia as linhas de `function_managers` preservando o papel e **apaga** de `function_managers` só as linhas `aprovador`. Lista validadores recentes para conferência humana. | DDL+Dados (com DELETE) | sim (cópia idempotente; o DELETE só acha algo na 1ª vez) |
| 2026-08-28 | `2026-08-28-comentarios-evento.ts` | Tabela `event_comments` + índice (mural do evento). ES | DDL | sim |
| 2026-08-28 | `2026-08-28-conta-rateio-funcoes.ts` | Seed da conta contábil (rateio) das funções por prefixo do nome; só onde ainda não há conta. | Dados | sim |
| 2026-08-28 | `2026-08-28-indices-performance.ts` | 9 índices medidos na auditoria de performance (`team_inclusions.phase`, `suggestion_sent_at`, `scaling_change_requests`, `swap_requests`, `scaling_function_managers`, `system_logs`). Sem `CONCURRENTLY`. | DDL | sim |
| 2026-08-28 | `2026-08-28-passagem-implica-hospedagem.ts` | Backfill: vaga ativa com `needs_ticket` passa a `needs_accommodation = true`. | Dados | sim (condição no `WHERE`) |
| 2026-08-28 | `2026-08-28-uber-titular.ts` | `uber_groups.titular_collaborator_id`. | DDL | sim |
| 2026-09-10 | `2026-09-10-empreita-empresa.sql` | `team_inclusions.empreita_empresa/_pessoas/_valor`. ES | DDL | sim |
| 2026-09-14 | `2026-09-14-permuta-colaboradores.sql` | `swap_requests.swap_kind` (default `substituicao`), `paired_inclusion_id`, `paired_new_city`. ES | DDL | sim |
| 2026-09-14 | `2026-09-14-troca-sai-de.sql` | `swap_requests.new_city`. ES | DDL | sim |
| 2026-09-22 | `2026-09-22-colaborador-endereco.sql` | `collaborators.address_street/_number/_complement/_zip`. ES | DDL | sim |
| 2026-09-23 | `2026-09-23-indices-e-constraints.ts` | 17 índices com `CONCURRENTLY` (derruba índice inválido antes), 5 UNIQUEs com checagem de duplicatas (e-mail case-insensitive, `function_values`, troca/pedido pendente por vaga, realizado raiz por planejado), 3 CHECKs `NOT VALID` (status/fase da vaga, status da troca) e 3 FKs `NOT VALID`. Imprime pendências no fim. **Pendente em produção.** | DDL | sim |
| 2026-09-23 | `2026-09-23-status-fora-do-dominio.sql` | Diagnóstico da distribuição de status/fase e limpeza **sugerida** (UPDATEs comentados, um caso por vez) dos legados `incluido`, `pendente`, `confirmado`, `aguardando_*`; bloco final troca o CHECK pelo canônico e valida. **Pendente em produção; rodar depois do script acima.** | Diag + Dados (manual) | manual |
| 2026-09-24 | `2026-09-24-observacao-da-validacao.sql` | `team_inclusions.validation_note` (observação opcional de quem valida a vaga, lida pelo aprovador). ES | DDL | sim |
| 2026-09-25 | `2026-09-25-estado-compartilhado.sql` | Tabelas `sso_tokens_usados` (anti-reuso do JWT do Portal) e `rate_limits` (contadores do express-rate-limit) — estado que era um Map por instância e agora é compartilhado no autoscale. ES | DDL | sim |
| 2026-09-25 | `2026-09-25-jsonb.sql` | 6 colunas de JSON-em-`text` viram `jsonb` (`scaling_change_requests.proposed_changes`, `invoices.history` — também NOT NULL DEFAULT `[]` —, `budget_actual.rh_adjusted_fields`, `budget_comparison.changes_log`, `system_logs.previous_data/new_data`). Diagnóstico de JSON inválido antes; uma transação por tabela. **Rodar ANTES de publicar o código de 25/09** (o append do histórico da NF exige jsonb). | DDL | sim (checa `data_type`) |
| 2026-09-25 | `2026-09-25-timestamptz.sql` | Toda coluna `timestamp` do schema vira `timestamptz` com `AT TIME ZONE 'UTC'` (os valores gravados são UTC — evidência no cabeçalho; bloco 0 confere). Varre `information_schema`, pula `session`, tabela ocupada é listada para repetir. Fora do pico. | DDL | sim (só o que ainda é `timestamp`) |
| 2026-09-25 | `2026-09-25-integridade.sql` | `variance_percent` → `numeric(8,2)`; CHECK `NOT VALID` de "HH:MM" nas 9 colunas de hora (tickets/accommodations/uber_groups); usuário fixo `system` em `users` + FK `NOT VALID` de `team_inclusion_logs.user_id`; `created_at/updated_at` DEFAULT now() + backfill + NOT NULL; 9 booleanos NOT NULL com default. Diagnósticos e `VALIDATE` comentados no fim. ES (só o usuário `system`). | DDL+Dados | sim |
| 2026-10-09 | `2026-10-09-trecho-direto.sql` | Trecho direto entre eventos e viagem de uma perna: `team_inclusions.trechos_sugeridos / ida_vem_do_evento_id / volta_segue_para_evento_id`, `tickets.ida_vem_de_inclusion_id`, `scaling_change_requests.grupo_id` (pedido de ajuste em par). Só colunas nulas; nenhum dado alterado. ES. | DDL | sim |
| 2026-10-09 | `2026-10-09-busca-de-passagens.sql` | Busca de passagens na internet: `events.aeroporto_iata` (aeroporto do evento confirmado na busca), tabelas `busca_passagens_cache` (consultas compartilhadas por 3 h), `busca_passagens_consumo` (contador/teto do mês e acertos do cache), `busca_passagens_consultas` + `busca_passagens_opcoes` (histórico de cada consulta real e as 10 opções mais baratas — base das análises) e `busca_passagens_usos` ("Usar este voo" que virou passagem: preço encontrado × pago) e o teto padrão `busca_passagens_teto_mensal = 1000` em `system_settings` (só se não existir). ES (menos o teto, que o servidor assume 1000 quando falta). | DDL+Dados | sim |
| 2026-10-09 | `2026-10-09-busca-de-passagens-etapa-2.sql` | Busca de passagens, etapa 2: `tickets.justificativa_preco` (teto por trecho — valor acima do típico da rota exige justificativa), tabela `busca_passagens_acompanhamentos` (acompanhar preço de uma escalação; uma ativa por vaga) e `busca_passagens_execucoes` (lock diário do agendador). Ajustes novos em `system_settings` têm padrão no código. Só coluna nula e tabelas novas. ES. | DDL | sim |
| 2026-10-16 | `2026-10-16-indices-das-analises-da-busca.sql` | Índice parcial `system_logs_ticket_criacao_idx` (`entity_id, created_at, user_id, user_name` onde `entity_type = 'ticket' AND action = 'create'`): o "quem registrou" de cada passagem nas abas de análise da Busca de passagens. Também espelhado no `shared/schema.ts` — rodar o `.sql` à mão (não há `db:push` neste app). | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-16 | `2026-10-16-honorarios-cenotecnica.sql` | Honorários da cenotécnica (pedido de valor negociado → aprovação pelo aprovador da escala → liberação da verba pelo Financeiro): tabelas novas `honorarios_ceno` (uma linha por vaga escalada ou empreita; `versao` é a trava de corrida; UNIQUE parcial por vaga), `honorarios_ceno_historico` (quem, quando, valor anterior → novo, motivo) e `honorarios_ceno_liberacoes` (data, OC/DP, valor; estorno lógico). Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-16 | `2026-10-16-transporte-terrestre.sql` | Transporte terrestre da vaga em Passagens ("vai de carro ou van"): tabela nova `transportes_terrestres` (uma linha por vaga e perna — `trecho` ida/volta, `modo` carro/van/onibus, `empresa` obrigatória para van/ônibus, `valor_centavos`), UNIQUE `(team_inclusion_id, trecho)`. O valor é só registrado (não entra no Planejado/Realizado). Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-20 | `2026-10-20-valores-do-hotel.sql` | Valores do hotel na aba Quartos do Espelho: tabelas novas `hotel_tarifas_evento` (tarifa por pessoa por noite Individual/Duplo/Triplo + fatura do hotel; PK `event_id`), `hotel_valores_quarto` (diária própria e valor pago do quarto; PK `hotel_room_group_id`, cascade com o quarto) e `hotel_late_checkouts` (late check-out por pessoa; UNIQUE `(event_id, collaborator_id)`). Centavos. Entra no "Hotel" do custo do Espelho, não no Planejado/Realizado. Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-20 | `2026-10-20-honorarios-empreita-e-tipo-de-freela.sql` | Honorários da cenotécnica: coluna nova `honorarios_ceno.tipo_freela` (de onde vem o valor do pedido de vaga — tabela `viagem`/`sp`/`local_a`/`local_b` ou `outro`) e tabela nova `honorarios_ceno_empreita_vagas` (vagas de cada empreita; UNIQUE `team_inclusion_id`: uma vaga em uma empreita só; cascade com o pedido). Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-21 | `2026-10-21-transporte-terrestre-grupo.sql` | "Vai de carro/van" com o valor total da van: coluna nova `transportes_terrestres.grupo_id` (nula; as linhas do total dividido entre várias vagas levam o mesmo grupo) + índice `transportes_terrestres_grupo_idx`. Registros antigos ficam sem grupo. Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-22 | `2026-10-22-tipos-de-apartamento-do-hotel.sql` | O hotel do evento tem Duplo/Triplo? (aba Quartos do Espelho): colunas novas `hotel_tarifas_evento.tem_duplo` e `tem_triplo` (`boolean NOT NULL DEFAULT true` — eventos existentes seguem como antes). Regra em `shared/room-pairing.ts`. Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-23 | `2026-10-23-hotel-do-espelho-na-hospedagem.sql` | "Confirmar" o quarto (aba Quartos do Espelho) preenche a hospedagem da vaga: tabela nova `hospedagens_do_espelho` (PK `accommodation_id`, cascade com a hospedagem; `campos` jsonb com o que o Espelho escreveu — hotel, check-in/out, tipo, diárias, valor, com quem divide) — o valor lançado à mão não é sobrescrito. Regra em `shared/hotel-na-hospedagem.ts`. Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-26 | `2026-10-26-honorarios-fase-0.sql` | Módulo de Honorários, Fase 0: coluna nova `events.ocultar_valores_colaborador` (`boolean NOT NULL DEFAULT true` — "não exibir valores" ao colaborador até a OC; só o DP muda) e tabela nova `honorarios_legado_concluidos` (legado concluído fora do fluxo no Painel de honorários: UNIQUE `linha_id`, motivo, quem, quando; cascade com o evento). A pré-aprovação do DP usa colunas que já existiam (`budget_planned.status = 'pre_aprovado'`, `approved_by`, `approved_at`); a data de corte é a chave `honorarios_data_corte` de `system_settings`. 27/10: coluna nova `budget_planned.team_inclusion_id` (`varchar` nula, FK `team_inclusions` `ON DELETE SET NULL`, índice `budget_planned_team_inclusion_idx`) — a vaga da linha, para vagas sem colaborador na mesma função não se desencontrarem. Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-26 | `2026-10-26-contratos-e-pagamento.sql` | Módulo de Honorários, Fase 0 (parte B): tabelas novas `contratos` (UNIQUE `cnpj`, só dígitos; vigência, tipo, anexo, encerramento, `versao`), `contratos_colaboradores` (N:N com cascade), `contratos_historico`, `colaboradores_pagamento` (banco/agência/conta/PIX **cifrados** com AES-256-GCM — Secret `PAGAMENTO_CHAVE`; tabela à parte de `collaborators` para não vazar em rota nenhuma) e `colaboradores_pagamento_alteracoes` (antes/depois mascarados; mudança de conta pendente de conferência). Regras em `shared/contratos.ts`, `shared/pagamento.ts`, `shared/importacao-contratos.ts`. Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-27 | `2026-10-27-honorarios-fase-1.sql` | Módulo de Honorários, Fase 1 (presença no evento e portal do colaborador): tabelas novas `colaboradores_acesso` (senha e código de primeiro acesso como hash bcrypt, bloqueio, aceite do termo LGPD; PK `collaborator_id`), `presencas` (entrada/saída por prestação × dia, selfie no Object Storage, localização, quem registrou; UNIQUE `(actual_id, dia)`), `presenca_ocorrencias` (falta, diária extra, horas extras, substituição; remoção lógica) e `presenca_confirmacoes` (confirmação final do colaborador; UNIQUE `actual_id`); colunas novas em `budget_actual`: `cnpj_emissor`, `razao_social_emissor`, `valor_calculado`, `ajuste_produtor_pct`, `horas_extras` e `valor_horas_extras` (`NOT NULL DEFAULT 0`), `checkout_final_em`, `checkout_final_por`. Configurações novas com padrão no código (`shared/presenca.ts`). Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-28 | `2026-10-28-honorarios-fase-2.sql` | Módulo de Honorários, Fase 2 em modo MANUAL (OC, envio e conferência da NF, pago, expurgo das selfies): colunas novas em `budget_actual` — `oc_numero`, `oc_valor` (centavos), `oc_data`, `oc_registrada_em`, `oc_registrada_por`, `oc_origem` (`manual`/`lote`/`m4`), `oc_justificativa` (CNPJ sem contrato ativo), `pago_em`, `pago_registrado_por`, `pago_registrado_em`, `pagamento_obs`, `pagamento_comprovante_id`; em `invoices` — `nf_numero`, `nf_valor`, `nf_cnpj` (o que a nota diz, para a conferência OC × NF × CNPJ); em `presencas` — `foto_expurgada_em`. Tudo nulo. Lock da rotina diária e liga/desliga do expurgo em `system_settings` (sem linha necessária). Regras em `shared/honorarios-pagamento.ts`. Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-28 | `2026-10-28-fornecedor-automatico.sql` | Fornecedor aprovado automaticamente pelo histórico (CNPJ que já teve OC, NF aprovada ou pagamento vira contrato ativo): colunas novas em `contratos` — `origem` (`text NOT NULL DEFAULT 'cadastro'`; `automatico` nos criados pelo sistema — os existentes ficam `cadastro`) e `origem_detalhe` (a frase "Aprovado automaticamente: CNPJ já pago em … em dd/mm/aaaa", nula). Regra em `shared/fornecedor-automatico.ts`; a varredura do passado é a ação "Aprovar pelo histórico" da tela Contratos. Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| 2026-10-28 | `2026-10-28-ajustes-dp.sql` | Ajustes pedidos pelo DP: colunas novas `team_inclusions.dias_meia_extra`, `budget_planned.dias_meia_extra` e `budget_actual.dias_meia_extra` (`text[]` nulas — os dias com 1,5 diária, datas `YYYY-MM-DD`; o valor do ½ já está na diária média e no total; regra em `shared/meia-diaria.ts`) e `collaborators.vr_diario_cents` (`integer` nula — VR diário do colaborador da casa; com VR, almoço de dia útil = max(0, almoço da regra − VR), `shared/alimentacao.ts`). Nenhuma coluna existente muda. ES. | DDL | sim (`IF NOT EXISTS`) |
| — | `check-bagagem-match.ts` | Conferência (só leitura) do casamento do seed de bagagem com os colaboradores, por CPF e nome. `npx tsx … <json>`. | Diag | n/a |

Fora desta pasta, mas do mesmo tipo: `scripts/2026-08-31-uber-quartos-por-pessoa.ts`
(colunas de roteirização/estadia por pessoa — as cinco que o `ensure-schema`
repõe), `scripts/corrigir-nomes.ts`, `scripts/recuperar-responsaveis-funcao.ts`
e `scripts/legado/*.sql` (incidente do reconfirmar).

## Template de script novo

Copie e preencha. Regras completas em `docs/migracoes.md` §3.

```ts
/**
 * Migração — <assunto> (<AAAA-MM-DD>)
 *
 * <O que muda e por quê, em 3–6 linhas. Cite a decisão/dono e a data.>
 *
 * Tipo: DDL | Dados | DDL+Dados. Idempotente: sim (<como>).
 * Espelho em shared/schema.ts: <tabela.coluna / índice>.
 * Não roda no deploy. Rodar à mão:
 *   DATABASE_URL=... npx tsx scripts/migrations/<AAAA-MM-DD>-<assunto>.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  const q = (sql: string, params?: unknown[]) => pool.query(sql, params);
  const pendencias: string[] = [];

  // ── 1) Estrutura (aditiva, IF NOT EXISTS) ────────────────────────────────
  await q(`ALTER TABLE <tabela> ADD COLUMN IF NOT EXISTS <coluna> <tipo>`);
  console.log("  + <tabela>.<coluna>");

  // ── 2) Índices (CONCURRENTLY, fora de transação) ─────────────────────────
  // await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS <nome> ON <tabela> (<colunas>)`);

  // ── 3) UNIQUE (checar duplicatas antes; pular se houver) ─────────────────
  // const dup = await q(`SELECT <col>, count(*) FROM <tabela> GROUP BY <col> HAVING count(*) > 1`);
  // if (dup.rowCount) { console.table(dup.rows); pendencias.push("<nome>"); }
  // else await q(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS <nome> ON <tabela> (<col>)`);

  // ── 4) CHECK / FK (NOT VALID; VALIDATE é passo separado) ─────────────────
  // await q(`DO $$ BEGIN
  //   ALTER TABLE <tabela> ADD CONSTRAINT <nome> CHECK (<expr>) NOT VALID;
  // EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  // ── 5) Dados (UPDATE restrito ao caso conhecido, com contagem) ───────────
  // const r = await q(`UPDATE <tabela> SET ... WHERE <caso> RETURNING id`);
  // console.log(`  ~ ${r.rowCount} linha(s) ajustada(s)`);

  await pool.end();
  if (pendencias.length) console.log(`\nConcluída COM PENDÊNCIAS: ${pendencias.join(", ")}`);
  else console.log("\nMigração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
```

Para `.sql` (só `ADD COLUMN IF NOT EXISTS`):

```sql
-- <Assunto> (Painel-LI, <DD/MM/AAAA>). Só adiciona colunas nulas — pode rodar
-- em produção sem parada. Espelho: shared/schema.ts (<tabela>).
-- [Se também estiver em server/ensure-schema.ts, dizer aqui.]
ALTER TABLE <tabela> ADD COLUMN IF NOT EXISTS <coluna> <tipo>;
```

Depois de criar o script: espelhar em `shared/schema.ts`, adicionar a linha
nesta tabela, rodar em dev, rodar `scripts/check-schema-drift.ts`, e só então
em produção.
