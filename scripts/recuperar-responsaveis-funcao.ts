/**
 * Recupera responsáveis de FUNÇÃO apagados sem querer (27/08).
 *
 * Contexto: até a separação dos cadastros, apagar alguém na aba "Validação de
 * Escala" apagava a MESMA linha que dá acesso de responsável na
 * Escalação/Produção. As rotas antigas não gravavam log, então não há como
 * reconstruir a lista a partir do banco atual — é preciso ler um PONTO NO
 * PASSADO.
 *
 * O Neon guarda histórico: criando um branch com data anterior às remoções,
 * temos uma cópia do banco de ontem, somente leitura. Este script compara a
 * lista de lá com a de hoje e devolve o que sumiu.
 *
 * COMO USAR
 *   1. No console do Neon: Branches → New branch → "recuperacao", origem
 *      "main", opção "Point in time" com uma data/hora ANTERIOR às remoções.
 *   2. Copie a connection string do branch.
 *   3. Rode em modo conferência (não grava nada):
 *        DATABASE_URL="<produção>" ONTEM_URL="<branch>" \
 *          npx tsx scripts/recuperar-responsaveis-funcao.ts
 *   4. Se a lista fizer sentido, rode de novo com APLICAR=1 para restaurar:
 *        DATABASE_URL="<produção>" ONTEM_URL="<branch>" APLICAR=1 \
 *          npx tsx scripts/recuperar-responsaveis-funcao.ts
 *
 * O script SÓ INSERE o que falta em `function_managers` (papel 'validador', que
 * é o da lista clássica). Nunca apaga nada, e roda quantas vezes for preciso.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

interface Vinculo { functionId: string; userId: string; funcao: string; usuario: string }

async function lista(url: string): Promise<Map<string, Vinculo>> {
  const pool = new Pool({ connectionString: url });
  const { rows } = await pool.query(
    `SELECT fm.function_id, fm.user_id, f.name AS funcao, u.name AS usuario
       FROM function_managers fm
       JOIN functions f ON f.id = fm.function_id
       JOIN users u ON u.id = fm.user_id
      WHERE coalesce(fm.role, 'validador') = 'validador'`,
  );
  await pool.end();
  const m = new Map<string, Vinculo>();
  for (const r of rows) {
    m.set(`${r.function_id}|${r.user_id}`, {
      functionId: r.function_id, userId: r.user_id, funcao: r.funcao, usuario: r.usuario,
    });
  }
  return m;
}

async function main() {
  const hojeUrl = process.env.DATABASE_URL;
  const ontemUrl = process.env.ONTEM_URL;
  const aplicar = process.env.APLICAR === "1";
  if (!hojeUrl || !ontemUrl) {
    console.error("Defina DATABASE_URL (produção) e ONTEM_URL (branch do Neon com data anterior).");
    process.exit(1);
  }

  const [ontem, hoje] = await Promise.all([lista(ontemUrl), lista(hojeUrl)]);
  const sumiram = [...ontem.values()].filter((v) => !hoje.has(`${v.functionId}|${v.userId}`));

  console.log(`Responsáveis no branch antigo: ${ontem.size}`);
  console.log(`Responsáveis hoje:            ${hoje.size}`);
  console.log(`\nSUMIRAM: ${sumiram.length}`);
  for (const v of sumiram) console.log(`  ${v.usuario} → ${v.funcao}`);

  if (sumiram.length === 0) { console.log("\nNada a restaurar."); return; }
  if (!aplicar) { console.log("\n(conferência — rode com APLICAR=1 para restaurar)"); return; }

  const pool = new Pool({ connectionString: hojeUrl });
  let n = 0;
  for (const v of sumiram) {
    const r = await pool.query(
      `INSERT INTO function_managers (function_id, user_id, role)
       VALUES ($1, $2, 'validador')
       ON CONFLICT (function_id, user_id) DO NOTHING RETURNING id`,
      [v.functionId, v.userId],
    );
    if (r.rowCount) n++;
  }
  await pool.end();
  console.log(`\n${n} responsável(is) restaurado(s) em function_managers.`);
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
