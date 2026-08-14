/**
 * Migração — flag de atendimento (Key Account x Executivo de Contas) e valores
 * editáveis. Aditiva e idempotente.
 *   npx tsx scripts/migrations/2026-08-14-atendimento-tipo.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const statements: string[] = [
  // Coluna do tipo de atendimento por escalação
  `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS atendimento_tipo text`,
  `DO $$ BEGIN
     ALTER TABLE team_inclusions ADD CONSTRAINT team_inclusions_atendimento_tipo_chk
       CHECK (atendimento_tipo IS NULL OR atendimento_tipo IN ('key_account','executivo_contas'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Backfill: escalações de atendimento COM colaborador ficam como o valor que já
  // estava em uso (Executivo de Contas / R$465). Vagas sem colaborador seguem null.
  `UPDATE team_inclusions ti SET atendimento_tipo = 'executivo_contas'
     FROM functions f
    WHERE ti.function_id = f.id
      AND lower(f.name) LIKE '%atend%'
      AND ti.collaborator_id IS NOT NULL
      AND ti.atendimento_tipo IS NULL`,
  // Seed dos valores editáveis (centavos), só se ainda não existirem
  `INSERT INTO system_settings (key, value) VALUES ('atendimento_key_account', '58000')
     ON CONFLICT (key) DO NOTHING`,
  `INSERT INTO system_settings (key, value) VALUES ('atendimento_executivo_contas', '46500')
     ON CONFLICT (key) DO NOTHING`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  for (const sql of statements) {
    process.stdout.write(`-> ${sql.replace(/\s+/g, " ").slice(0, 80)}... `);
    const r = await pool.query(sql);
    console.log("ok" + (r.rowCount != null ? ` (${r.rowCount})` : ""));
  }
  await pool.end();
  console.log("Migração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
