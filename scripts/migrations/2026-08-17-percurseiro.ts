/**
 * Migração — percurseiro (motoqueiro): flag Tipo 1 x Tipo 2 por escalação e
 * valores editáveis do pacote fechado. Também semeia as chaves de alimentação
 * do colaborador de casa em dia útil (almoço R$ 8 / cenotécnica R$ 3).
 * Aditiva e idempotente.
 *   npx tsx scripts/migrations/2026-08-17-percurseiro.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const seed = (key: string, value: string | number) =>
  `INSERT INTO system_settings (key, value) VALUES ('${key}', '${value}') ON CONFLICT (key) DO NOTHING`;

const statements: string[] = [
  // Coluna do tipo de percurseiro por escalação
  `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS percurseiro_tipo text`,
  `DO $$ BEGIN
     ALTER TABLE team_inclusions ADD CONSTRAINT team_inclusions_percurseiro_tipo_chk
       CHECK (percurseiro_tipo IS NULL OR percurseiro_tipo IN ('tipo_1','tipo_2'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Backfill: escalações de percurso COM colaborador ficam como Tipo 1 (o
  // Planejado já usa Tipo 1 como provisório e mostra "definir tipo").
  `UPDATE team_inclusions ti SET percurseiro_tipo = 'tipo_1'
     FROM functions f
    WHERE ti.function_id = f.id
      AND lower(f.name) LIKE '%percurs%'
      AND ti.collaborator_id IS NOT NULL
      AND ti.percurseiro_tipo IS NULL`,
  // Pacote do percurseiro (centavos / percentuais inteiros) — tabela 17/08
  seed("percurseiro_t1_motoqueiro", 70000),
  seed("percurseiro_t2_motoqueiro", 80000),
  seed("percurseiro_fee_pct", 15),
  seed("percurseiro_alimentacao", 10200),
  seed("percurseiro_transporte", 5000),
  seed("percurseiro_nf_pct", 16),
  seed("percurseiro_t1_nf", 17276),
  seed("percurseiro_t2_nf", 19467),
  // Alimentação do colaborador de casa (CLT) em dia útil — só a "diferença"
  seed("alimentacao_almoco_casa_util", 800),
  seed("alimentacao_almoco_casa_util_ceno", 300),
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
