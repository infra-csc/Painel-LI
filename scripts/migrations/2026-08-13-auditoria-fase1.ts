/**
 * Migração — Fase 1 da auditoria do módulo Financeiro (2026-08-13)
 *
 * Integridade e performance: índices nas colunas de filtro, UNIQUEs onde o
 * negócio exige unicidade e FKs que faltavam. Verificado ANTES da criação que
 * produção não tem duplicatas nem órfãos (script de checagem rodado em
 * 2026-08-13 retornou zero em todos os casos).
 *
 * Todos os comandos são aditivos e idempotentes — pode rodar mais de uma vez.
 * Uso (Replit): npx tsx scripts/migrations/2026-08-13-auditoria-fase1.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const statements: string[] = [
  // ── Índices nas colunas de filtro do módulo financeiro ──
  `CREATE INDEX IF NOT EXISTS budget_planned_event_idx ON budget_planned (event_id)`,
  `CREATE INDEX IF NOT EXISTS budget_actual_event_idx ON budget_actual (event_id)`,
  `CREATE INDEX IF NOT EXISTS budget_actual_planned_idx ON budget_actual (planned_id)`,
  `CREATE INDEX IF NOT EXISTS budget_actual_split_parent_idx ON budget_actual (split_parent_id)`,
  `CREATE INDEX IF NOT EXISTS invoices_event_idx ON invoices (event_id)`,
  `CREATE INDEX IF NOT EXISTS team_inclusions_event_idx ON team_inclusions (event_id)`,

  // ── Unicidade exigida pelo negócio ──
  // Um planejado por colaborador+função+evento (NULLs de colaborador seguem
  // permitidos em múltiplas linhas — vagas ainda não escaladas)
  `CREATE UNIQUE INDEX IF NOT EXISTS budget_planned_event_collab_func_uq
     ON budget_planned (event_id, collaborator_id, function_id)`,
  // Um comparativo por evento (o client fazia upsert por convenção)
  `CREATE UNIQUE INDEX IF NOT EXISTS budget_comparison_event_uq
     ON budget_comparison (event_id)`,
  // Uma NF por prestação realizada
  `CREATE UNIQUE INDEX IF NOT EXISTS invoices_budget_actual_uq
     ON invoices (budget_actual_id) WHERE budget_actual_id IS NOT NULL`,

  // ── FKs que faltavam ──
  // NF não pode apontar para realizado inexistente; se o realizado for
  // removido, a NF fica desvinculada (histórico preservado)
  `DO $$ BEGIN
     ALTER TABLE invoices ADD CONSTRAINT invoices_budget_actual_fk
       FOREIGN KEY (budget_actual_id) REFERENCES budget_actual(id) ON DELETE SET NULL;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Filhos de split morrem com o pai (evita os "cards invisíveis" órfãos)
  `DO $$ BEGIN
     ALTER TABLE budget_actual ADD CONSTRAINT budget_actual_split_parent_fk
       FOREIGN KEY (split_parent_id) REFERENCES budget_actual(id) ON DELETE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // ── Domínio dos status (valores atuais em produção já conformes) ──
  `DO $$ BEGIN
     ALTER TABLE budget_actual ADD CONSTRAINT budget_actual_rh_status_chk
       CHECK (rh_status IN ('pendente','aprovado','rejeitado','devolvido'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE invoices ADD CONSTRAINT invoices_status_chk
       CHECK (status IN ('pendente','enviada','aprovada','devolvida','recusada'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE flash_movements ADD CONSTRAINT flash_movements_category_chk
       CHECK (category IN ('alimentacao','mobilidade'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE flash_movements ADD CONSTRAINT flash_movements_type_chk
       CHECK (type IN ('credito','debito'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não definido no ambiente.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  for (const sql of statements) {
    const label = sql.replace(/\s+/g, " ").slice(0, 90);
    process.stdout.write(`-> ${label}... `);
    await pool.query(sql);
    console.log("ok");
  }
  await pool.end();
  console.log("Migração concluída.");
}

main().catch((err) => {
  console.error("Falha na migração:", err);
  process.exit(1);
});
