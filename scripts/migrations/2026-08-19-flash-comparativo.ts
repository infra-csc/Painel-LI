/**
 * Migração — crédito no Flash passa a nascer na APROVAÇÃO DO COMPARATIVO.
 *
 * Decisão do usuário em 19/08/2026 (substitui a regra de 17/08, em que o
 * crédito vinha do lançamento da OC na nota fiscal): alimentação + mobilidade
 * entram na Conta Corrente Flash quando o comparativo do evento é aprovado;
 * a NF/OC depois não mexe mais no saldo, só documenta.
 *
 * O que muda no banco:
 *   1. flash_movements.source_type passa a aceitar 'comparativo'
 *      (o CHECK de 17/08 só permitia 'manual' | 'oc'). 'oc' CONTINUA no CHECK
 *      de propósito: são lançamentos legados congelados — em produção não há
 *      nenhum (a conta estava vazia), mas ambientes de teste podem ter.
 *   2. Índice único parcial (source_ref, category) WHERE source_type =
 *      'comparativo' → 1 automático por (prestação, categoria). Duas
 *      aprovações concorrentes não conseguem creditar em dobro: o segundo
 *      INSERT falha e o sync seguinte reconcilia.
 *   3. Índice (source_type, event_id) → o sync e o ESTORNO varrem os
 *      automáticos de um comparativo por evento.
 *
 * Por que NÃO houve coluna nova para o comparativo: o vínculo forte já existe
 * sem ela. budget_comparison tem um registro por evento (unique em event_id),
 * então `source_type='comparativo' AND event_id=<evento>` identifica
 * exatamente o conjunto daquele comparativo — inclusive lançamentos órfãos,
 * cuja prestação foi apagada, que o estorno também precisa remover. Guardar o
 * id do comparativo numa coluna nova daria o mesmo alcance com mais schema.
 *
 * Aditiva e idempotente. Nenhum dado é apagado ou reescrito.
 *   npx tsx scripts/migrations/2026-08-19-flash-comparativo.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const statements: string[] = [
  // 1. CHECK aceita a origem nova. Recria em vez de ALTER: o CHECK de 17/08
  //    (flash_movements_source_type_chk) não conhece 'comparativo'.
  `ALTER TABLE flash_movements DROP CONSTRAINT IF EXISTS flash_movements_source_type_chk`,
  `ALTER TABLE flash_movements ADD CONSTRAINT flash_movements_source_type_chk
     CHECK (source_type IN ('manual','oc','comparativo'))`,
  // 2. Idempotência garantida NO BANCO: 1 automático por (prestação, categoria).
  `CREATE UNIQUE INDEX IF NOT EXISTS flash_movements_comparativo_uq
     ON flash_movements (source_ref, category) WHERE source_type = 'comparativo'`,
  // 3. Varredura do sync/estorno por evento.
  `CREATE INDEX IF NOT EXISTS flash_movements_source_event_idx
     ON flash_movements (source_type, event_id)`,
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
