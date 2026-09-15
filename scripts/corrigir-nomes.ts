/**
 * Corrige nomes e cidades com erro de codificação no banco (dono, 15/09).
 * A regra está em shared/texto-nome.ts (com testes).
 *
 * Uso:
 *   DATABASE_URL="<banco>" npx tsx scripts/corrigir-nomes.ts
 *       → só MOSTRA o que mudaria e o que precisa de revisão manual. Não grava.
 *   DATABASE_URL="<banco>" npx tsx scripts/corrigir-nomes.ts --aplicar
 *       → grava. Antes, salva um backup JSON com os valores antigos (caminho
 *         impresso no fim) e só atualiza a linha se o valor ainda for o lido.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { corrigirTextoDeNome, pareceComErro } from "../shared/texto-nome";

neonConfig.webSocketConstructor = ws;
const APLICAR = process.argv.includes("--aplicar");

const ALVOS: { tabela: string; colunas: string[] }[] = [
  { tabela: "collaborators", colunas: ["full_name", "city"] },
  { tabela: "users", colunas: ["name"] },
  { tabela: "events", colunas: ["name", "location"] },
  { tabela: "functions", colunas: ["name"] },
];

interface Mudanca { tabela: string; id: string; coluna: string; antes: string; depois: string }

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const mudancas: Mudanca[] = [];
  const revisar: Omit<Mudanca, "depois">[] = [];

  for (const { tabela, colunas } of ALVOS) {
    const { rows } = await pool.query(`SELECT id, ${colunas.join(", ")} FROM ${tabela}`);
    for (const row of rows as Record<string, unknown>[]) {
      for (const coluna of colunas) {
        const antes = row[coluna];
        if (typeof antes !== "string" || antes === "") continue;
        const depois = corrigirTextoDeNome(antes);
        if (depois !== antes) mudancas.push({ tabela, id: String(row.id), coluna, antes, depois });
        if (pareceComErro(depois)) revisar.push({ tabela, id: String(row.id), coluna, antes });
      }
    }
  }

  const porCampo = new Map<string, number>();
  for (const m of mudancas) porCampo.set(`${m.tabela}.${m.coluna}`, (porCampo.get(`${m.tabela}.${m.coluna}`) ?? 0) + 1);
  console.log(`\n== Correções automáticas: ${mudancas.length}`);
  for (const [campo, n] of porCampo) console.log(`   ${campo}: ${n}`);
  for (const m of mudancas) console.log(`   [${m.tabela}.${m.coluna}] ${JSON.stringify(m.antes)} → ${JSON.stringify(m.depois)}`);
  console.log(`\n== Para revisar à mão (a letra se perdeu): ${revisar.length}`);
  for (const r of revisar) console.log(`   [${r.tabela}.${r.coluna}] ${r.id} ${JSON.stringify(r.antes)}`);

  if (!APLICAR) {
    console.log("\nNada foi gravado. Rode com --aplicar para gravar as correções automáticas.");
    await pool.end();
    return;
  }

  const backup = join(tmpdir(), `backup-nomes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(backup, JSON.stringify(mudancas, null, 2));
  let gravadas = 0;
  for (const m of mudancas) {
    const r = await pool.query(
      `UPDATE ${m.tabela} SET ${m.coluna} = $1 WHERE id = $2 AND ${m.coluna} = $3`,
      [m.depois, m.id, m.antes],
    );
    gravadas += r.rowCount ?? 0;
  }
  console.log(`\nGravadas ${gravadas} de ${mudancas.length}. Backup dos valores antigos: ${backup}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
