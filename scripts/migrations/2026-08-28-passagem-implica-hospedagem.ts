/**
 * Backfill — quem tem passagem tem hospedagem (2026-08-28)
 *
 * Regra do dono: "todo mundo que tem passagem, tem hospedagem". Daqui em
 * diante a Sugestão marca o hotel junto da passagem; este script acerta o
 * PASSADO: toda vaga ativa com needs_ticket e sem needs_accommodation passa a
 * pedir hospedagem também.
 *
 * Fora do alcance, de propósito: vagas excluídas (soft delete) e canceladas.
 * Idempotente. Rodar:
 *   DATABASE_URL=... npx tsx scripts/migrations/2026-08-28-passagem-implica-hospedagem.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  const antes = await pool.query(
    `SELECT count(*)::int AS n FROM team_inclusions
      WHERE needs_ticket = true AND needs_accommodation IS NOT TRUE
        AND deleted_at IS NULL AND status <> 'cancelado'`,
  );
  const upd = await pool.query(
    `UPDATE team_inclusions SET needs_accommodation = true, updated_at = now()
      WHERE needs_ticket = true AND needs_accommodation IS NOT TRUE
        AND deleted_at IS NULL AND status <> 'cancelado'
      RETURNING id`,
  );
  console.log(`  ${upd.rowCount} de ${antes.rows[0].n} vaga(s) com passagem passaram a pedir hospedagem.`);
  await pool.end();
  console.log("\nBackfill concluído.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
