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
