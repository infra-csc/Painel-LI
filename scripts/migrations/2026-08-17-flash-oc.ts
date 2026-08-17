/**
 * Migração — crédito automático no Flash a partir do lançamento da OC.
 * flash_movements ganha a origem do lançamento:
 *   source_type text NOT NULL DEFAULT 'manual'  ('manual' | 'oc')
 *   source_ref  text                             (id da invoice quando 'oc')
 * + índice em (source_type, source_ref) para o sync idempotente
 *   (server/flash-oc.ts) e para o estorno na recusa da NF.
 * Aditiva e idempotente. Lançamentos existentes ficam 'manual'.
 *   npx tsx scripts/migrations/2026-08-17-flash-oc.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const statements: string[] = [
  `ALTER TABLE flash_movements ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual'`,
  `ALTER TABLE flash_movements ADD COLUMN IF NOT EXISTS source_ref text`,
  `DO $$ BEGIN
     ALTER TABLE flash_movements ADD CONSTRAINT flash_movements_source_type_chk
       CHECK (source_type IN ('manual','oc'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS flash_movements_source_idx ON flash_movements (source_type, source_ref)`,
  // Idempotência garantida NO BANCO: 1 automático por (NF, categoria). Dois
  // reenvios concorrentes não conseguem creditar em dobro — o segundo INSERT
  // falha e o sync seguinte reconcilia.
  `CREATE UNIQUE INDEX IF NOT EXISTS flash_movements_oc_uq
     ON flash_movements (source_ref, category) WHERE source_type = 'oc'`,
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
