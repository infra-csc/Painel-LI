/**
 * Compara TODAS as tabelas/colunas declaradas em shared/schema.ts com o que
 * existe no banco apontado por DATABASE_URL. Só leitura — não altera nada.
 *
 * Existe porque em 28/08 duas migrações nunca chegaram ao banco de produção e
 * o sintoma só apareceu como "Dados inválidos" na tela de Passagens.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "../../shared/schema";
neonConfig.webSocketConstructor = ws;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `select table_name, column_name from information_schema.columns where table_schema='public'`,
  );
  const noBanco = new Map<string, Set<string>>();
  for (const r of rows as { table_name: string; column_name: string }[]) {
    if (!noBanco.has(r.table_name)) noBanco.set(r.table_name, new Set());
    noBanco.get(r.table_name)!.add(r.column_name);
  }

  let problemas = 0;
  for (const valor of Object.values(schema)) {
    let cfg;
    try {
      cfg = getTableConfig(valor as PgTable);
    } catch {
      continue; // não é uma tabela
    }
    const colunasBanco = noBanco.get(cfg.name);
    if (!colunasBanco) {
      console.log(`TABELA AUSENTE: ${cfg.name}`);
      problemas++;
      continue;
    }
    const faltando = cfg.columns.map((c) => c.name).filter((n) => !colunasBanco.has(n));
    if (faltando.length) {
      console.log(`${cfg.name}: faltam ${faltando.join(", ")}`);
      problemas++;
    }
  }
  console.log(problemas === 0 ? "\nOK — banco alinhado com o schema." : `\n${problemas} tabela(s) fora de sincronia.`);
  await pool.end();
}
main();
