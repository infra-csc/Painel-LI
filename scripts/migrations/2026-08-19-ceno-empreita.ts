/**
 * Migração — cenotécnicos EMPREITA (regra do usuário, 19/08): valor FECHADO por
 * nº de dias em 4 modalidades de freela (Viagem, SP, Local A, Local B), com o
 * tipo escolhido NA ESCALAÇÃO (flag por vaga, igual a percurseiro/atendimento).
 *
 * 1) coluna `ceno_freela_tipo` em team_inclusions (+ CHECK das 4 modalidades);
 * 2) semeia as 20 células da tabela do slide em system_settings (centavos),
 *    para que o Valores Padrão possa editá-las.
 *
 * Aditiva e idempotente.
 *   npx tsx scripts/migrations/2026-08-19-ceno-empreita.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { CENO_FREELA_TIPOS, cenoEmpreitaDefaultsMap } from "../../shared/cenotecnica-empreita";
neonConfig.webSocketConstructor = ws;

const seed = (key: string, value: string | number) =>
  `INSERT INTO system_settings (key, value) VALUES ('${key}', '${value}') ON CONFLICT (key) DO NOTHING`;

const tiposSql = CENO_FREELA_TIPOS.map((t) => `'${t}'`).join(",");

const statements: string[] = [
  // Modalidade de empreita por escalação
  `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS ceno_freela_tipo text`,
  `DO $$ BEGIN
     ALTER TABLE team_inclusions ADD CONSTRAINT team_inclusions_ceno_freela_tipo_chk
       CHECK (ceno_freela_tipo IS NULL OR ceno_freela_tipo IN (${tiposSql}));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Tabela do slide (centavos) — 4 modalidades × 2..6 dias
  ...Object.entries(cenoEmpreitaDefaultsMap()).map(([key, cents]) => seed(key, cents)),
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
