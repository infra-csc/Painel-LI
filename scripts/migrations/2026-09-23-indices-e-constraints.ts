/**
 * Migração — índices, UNIQUEs, CHECKs e FKs que faltavam (2026-09-23)
 *
 * NÃO roda sozinho (nem no deploy, nem no start). O dono roda à mão:
 *   DATABASE_URL=... npx tsx scripts/migrations/2026-09-23-indices-e-constraints.ts
 *
 * O que faz, nesta ordem, e por quê:
 *
 * 1. ÍNDICES com `CREATE INDEX CONCURRENTLY IF NOT EXISTS` — um por statement,
 *    fora de transação (CONCURRENTLY não aceita transação). Cobrem os joins
 *    por team_inclusion_id (logs, passagens, hospedagens, financeiro,
 *    comentários), a Escalação por função/colaborador/evento+fase e as
 *    tabelas de Uber/hotel/notas/trocas que hoje varrem a tabela inteira.
 *    Se uma criação CONCURRENTLY falhar no meio, o Postgres deixa um índice
 *    INVÁLIDO com o nome — e o IF NOT EXISTS seguinte o pularia para sempre.
 *    Por isso o script derruba índice inválido de mesmo nome antes de criar.
 *
 * 2. UNIQUEs — ANTES de criar cada um, roda a checagem de duplicatas; se
 *    houver, imprime as linhas e PULA aquele índice (o resto continua). A
 *    limpeza é decisão do dono, não do script.
 *
 * 3. CHECKs `NOT VALID` em team_inclusions.status/phase e swap_requests.status:
 *    valem para linhas novas e alteradas; as antigas ficam como estão até
 *    alguém rodar VALIDATE CONSTRAINT (depois da limpeza sugerida em
 *    2026-09-23-status-fora-do-dominio.sql). A lista de status inclui os
 *    LEGADOS de propósito — sem isso, um UPDATE em qualquer coluna de uma
 *    linha antiga falharia. Imprime `SELECT status, count(*)` do que está
 *    fora do domínio canônico.
 *
 * 4. FKs `NOT VALID` que faltavam: swap_requests.paired_inclusion_id,
 *    invoices.checkin_by, budget_notes.author_id. Imprime os órfãos antes.
 *
 * Idempotente: pode rodar de novo; cada item confere se já existe.
 * Declarações equivalentes no schema: shared/schema.ts (terceiro argumento
 * de cada pgTable), para o drizzle-kit não derrubá-los.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { FASES_DA_VAGA, STATUS_DA_VAGA, STATUS_LEGADOS } from "../../shared/vaga-status";
neonConfig.webSocketConstructor = ws;

type Indice = { nome: string; alvo: string };
type Unico = { nome: string; alvo: string; duplicatas: string };
type Check = { tabela: string; nome: string; expr: string; relatorio?: string };
type Fk = { tabela: string; nome: string; coluna: string; referencia: string; onDelete?: string };

const INDICES: Indice[] = [
  { nome: "team_inclusion_logs_inclusion_created_idx", alvo: "team_inclusion_logs (team_inclusion_id, created_at DESC)" },
  { nome: "tickets_inclusion_idx", alvo: "tickets (team_inclusion_id)" },
  { nome: "accommodations_inclusion_idx", alvo: "accommodations (team_inclusion_id)" },
  { nome: "financial_inclusion_idx", alvo: "financial (team_inclusion_id)" },
  { nome: "comments_inclusion_created_idx", alvo: "comments (team_inclusion_id, created_at DESC)" },
  { nome: "team_inclusions_function_idx", alvo: "team_inclusions (function_id)" },
  { nome: "team_inclusions_collaborator_active_idx", alvo: "team_inclusions (collaborator_id) WHERE deleted_at IS NULL" },
  { nome: "team_inclusions_event_phase_active_idx", alvo: "team_inclusions (event_id, phase) WHERE deleted_at IS NULL" },
  { nome: "uber_group_members_group_idx", alvo: "uber_group_members (uber_group_id)" },
  { nome: "hotel_room_group_members_group_idx", alvo: "hotel_room_group_members (hotel_room_group_id)" },
  { nome: "uber_groups_event_idx", alvo: "uber_groups (event_id)" },
  { nome: "hotel_room_groups_event_idx", alvo: "hotel_room_groups (event_id)" },
  { nome: "budget_notes_entity_idx", alvo: "budget_notes (entity_type, entity_id, created_at)" },
  { nome: "swap_requests_paired_inclusion_idx", alvo: "swap_requests (paired_inclusion_id)" },
  { nome: "function_managers_user_idx", alvo: "function_managers (user_id)" },
  { nome: "function_users_user_idx", alvo: "function_users (user_id)" },
  { nome: "system_logs_user_created_idx", alvo: "system_logs (user_id, created_at DESC)" },
];

const UNICOS: Unico[] = [
  {
    // Login compara e-mail sem diferenciar maiúsculas; o UNIQUE(email) atual
    // deixa "Ana@x" e "ana@x" coexistirem.
    nome: "users_email_lower_uq",
    alvo: "users (lower(email))",
    duplicatas: `SELECT lower(email) AS email, count(*) AS n, array_agg(id) AS ids
                 FROM users GROUP BY lower(email) HAVING count(*) > 1`,
  },
  {
    // Uma linha de valores por função (a tela faz upsert por convenção).
    nome: "function_values_function_uq",
    alvo: "function_values (function_id)",
    duplicatas: `SELECT function_id, count(*) AS n, array_agg(id) AS ids
                 FROM function_values GROUP BY function_id HAVING count(*) > 1`,
  },
  {
    // Uma troca PENDENTE por vaga — a rota já recusa, mas duas requisições
    // simultâneas passavam.
    nome: "swap_requests_inclusion_pendente_uq",
    alvo: "swap_requests (team_inclusion_id) WHERE status = 'pendente'",
    duplicatas: `SELECT team_inclusion_id, count(*) AS n, array_agg(id) AS ids
                 FROM swap_requests WHERE status = 'pendente'
                 GROUP BY team_inclusion_id HAVING count(*) > 1`,
  },
  {
    // Um pedido de ajuste/exclusão PENDENTE por vaga sugerida.
    nome: "scaling_change_requests_inclusion_pendente_uq",
    alvo: "scaling_change_requests (team_inclusion_id) WHERE status = 'pendente' AND team_inclusion_id IS NOT NULL",
    duplicatas: `SELECT team_inclusion_id, count(*) AS n, array_agg(id) AS ids
                 FROM scaling_change_requests WHERE status = 'pendente' AND team_inclusion_id IS NOT NULL
                 GROUP BY team_inclusion_id HAVING count(*) > 1`,
  },
  {
    // Um Realizado "raiz" por Planejado (divisões de vaga têm split_parent_id).
    nome: "budget_actual_planned_uq",
    alvo: "budget_actual (planned_id) WHERE planned_id IS NOT NULL AND split_parent_id IS NULL",
    duplicatas: `SELECT planned_id, count(*) AS n, array_agg(id) AS ids
                 FROM budget_actual WHERE planned_id IS NOT NULL AND split_parent_id IS NULL
                 GROUP BY planned_id HAVING count(*) > 1`,
  },
];

const lista = (valores: readonly string[]) => valores.map((v) => `'${v}'`).join(", ");
const STATUS_ACEITOS = [...STATUS_DA_VAGA, ...STATUS_LEGADOS];
// Valores que as rotas de troca gravam (routes.ts: aprovar/rejeitar/cancelar).
const SWAP_STATUS = ["pendente", "aprovado", "rejeitado", "cancelado"];

const CHECKS: Check[] = [
  {
    tabela: "team_inclusions",
    nome: "team_inclusions_status_chk",
    expr: `status IN (${lista(STATUS_ACEITOS)})`,
    relatorio: `SELECT status, count(*) AS n FROM team_inclusions
                WHERE status NOT IN (${lista(STATUS_DA_VAGA)}) GROUP BY status ORDER BY n DESC`,
  },
  {
    tabela: "team_inclusions",
    nome: "team_inclusions_phase_chk",
    expr: `phase IN (${lista(FASES_DA_VAGA)})`,
    relatorio: `SELECT phase, count(*) AS n FROM team_inclusions
                WHERE phase NOT IN (${lista(FASES_DA_VAGA)}) GROUP BY phase ORDER BY n DESC`,
  },
  {
    tabela: "swap_requests",
    nome: "swap_requests_status_chk",
    expr: `status IN (${lista(SWAP_STATUS)})`,
    relatorio: `SELECT status, count(*) AS n FROM swap_requests
                WHERE status NOT IN (${lista(SWAP_STATUS)}) GROUP BY status ORDER BY n DESC`,
  },
];

const FKS: Fk[] = [
  { tabela: "swap_requests", nome: "swap_requests_paired_inclusion_fk", coluna: "paired_inclusion_id", referencia: "team_inclusions (id)", onDelete: "SET NULL" },
  { tabela: "invoices", nome: "invoices_checkin_by_fk", coluna: "checkin_by", referencia: "users (id)", onDelete: "SET NULL" },
  { tabela: "budget_notes", nome: "budget_notes_author_fk", coluna: "author_id", referencia: "users (id)" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  const q = (sql: string, params?: unknown[]) => pool.query(sql, params);
  const pulados: string[] = [];

  const indiceInvalido = async (nome: string) => {
    const r = await q(
      `SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = $1 AND NOT i.indisvalid`,
      [nome],
    );
    return r.rowCount ? true : false;
  };
  const criarIndice = async (nome: string, alvo: string, unico: boolean) => {
    if (await indiceInvalido(nome)) {
      console.log(`  ! ${nome} existia INVÁLIDO (criação anterior interrompida) — derrubando para recriar`);
      await q(`DROP INDEX CONCURRENTLY IF EXISTS ${nome}`);
    }
    await q(`CREATE ${unico ? "UNIQUE " : ""}INDEX CONCURRENTLY IF NOT EXISTS ${nome} ON ${alvo}`);
    console.log(`  + ${nome} em ${alvo}`);
  };

  console.log("\n1) Índices");
  for (const { nome, alvo } of INDICES) {
    try {
      await criarIndice(nome, alvo, false);
    } catch (e) {
      console.error(`  x ${nome}: ${(e as Error).message}`);
      pulados.push(nome);
    }
  }

  console.log("\n2) Índices únicos (pulados quando há duplicatas)");
  for (const { nome, alvo, duplicatas } of UNICOS) {
    try {
      const dup = await q(duplicatas);
      if (dup.rowCount) {
        console.log(`  ! ${nome} PULADO — ${dup.rowCount} grupo(s) duplicado(s):`);
        console.table(dup.rows);
        pulados.push(nome);
        continue;
      }
      await criarIndice(nome, alvo, true);
    } catch (e) {
      console.error(`  x ${nome}: ${(e as Error).message}`);
      pulados.push(nome);
    }
  }

  const constraintExiste = async (nome: string) => {
    const r = await q(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [nome]);
    return r.rowCount ? true : false;
  };

  console.log("\n3) CHECKs (NOT VALID — só linhas novas/alteradas)");
  for (const { tabela, nome, expr, relatorio } of CHECKS) {
    try {
      if (relatorio) {
        const fora = await q(relatorio);
        if (fora.rowCount) {
          console.log(`  ~ ${tabela}: valores FORA do domínio canônico (ver 2026-09-23-status-fora-do-dominio.sql):`);
          console.table(fora.rows);
        } else {
          console.log(`  ~ ${tabela}: nenhum valor fora do domínio canônico`);
        }
      }
      if (await constraintExiste(nome)) { console.log(`  = ${nome} já existe`); continue; }
      await q(`ALTER TABLE ${tabela} ADD CONSTRAINT ${nome} CHECK (${expr}) NOT VALID`);
      console.log(`  + ${nome}`);
    } catch (e) {
      console.error(`  x ${nome}: ${(e as Error).message}`);
      pulados.push(nome);
    }
  }

  console.log("\n4) FKs (NOT VALID — órfãos antigos ficam até VALIDATE CONSTRAINT)");
  for (const { tabela, nome, coluna, referencia, onDelete } of FKS) {
    try {
      const [refTabela] = referencia.split(" ");
      const orfaos = await q(
        `SELECT count(*) AS n FROM ${tabela} t WHERE t.${coluna} IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM ${refTabela} r WHERE r.id = t.${coluna})`,
      );
      const n = Number(orfaos.rows[0]?.n ?? 0);
      if (n > 0) console.log(`  ~ ${tabela}.${coluna}: ${n} órfão(s) — a FK entra NOT VALID; corrija antes de validar`);
      if (await constraintExiste(nome)) { console.log(`  = ${nome} já existe`); continue; }
      await q(
        `ALTER TABLE ${tabela} ADD CONSTRAINT ${nome} FOREIGN KEY (${coluna}) REFERENCES ${referencia}` +
        (onDelete ? ` ON DELETE ${onDelete}` : "") + ` NOT VALID`,
      );
      console.log(`  + ${nome}`);
    } catch (e) {
      console.error(`  x ${nome}: ${(e as Error).message}`);
      pulados.push(nome);
    }
  }

  await pool.end();
  if (pulados.length) {
    console.log(`\nMigração concluída COM PENDÊNCIAS (${pulados.length}): ${pulados.join(", ")}`);
    console.log("Resolva as duplicatas/erros acima e rode de novo — o script é idempotente.");
  } else {
    console.log("\nMigração concluída.");
  }
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
