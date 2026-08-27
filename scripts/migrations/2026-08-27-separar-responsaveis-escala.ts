/**
 * Migração — separar os responsáveis da ESCALA dos responsáveis da FUNÇÃO
 * (2026-08-27)
 *
 * Decisão do dono: "eu disse que era separado". As duas listas moravam em
 * `function_managers`, com unicidade por (função, usuário) — então:
 *   - cadastrar um APROVADOR da Escala dava a ele acesso de responsável na
 *     Escalação/Produção (o servidor conta qualquer linha, sem olhar o papel);
 *   - tirar alguém pela aba da Escala tirava da lista clássica junto.
 *
 * O que este script faz:
 *   1. cria `scaling_function_managers` (função, usuário, papel), única por
 *      (função, usuário, papel);
 *   2. COPIA para lá todas as linhas de hoje, preservando o papel — o módulo de
 *      Escala continua funcionando exatamente como está;
 *   3. APAGA de `function_managers` apenas as linhas com papel 'aprovador' —
 *      elas nasceram do cadastro da Escala (aprovador não é responsável de
 *      função) e são o que deu acesso indevido na Escalação.
 *
 * O que ele NÃO faz, de propósito: não remove nenhuma linha 'validador' da
 * lista clássica. Algumas foram criadas pela aba da Escala, mas outras são
 * responsáveis de verdade, e apagar por engano tira gente do trabalho. O script
 * LISTA as validador criadas nos últimos dias para conferência humana.
 *
 * Idempotente. Rodar manualmente:
 *   DATABASE_URL=... npx tsx scripts/migrations/2026-08-27-separar-responsaveis-escala.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });

  // 1) tabela própria
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scaling_function_managers (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      function_id varchar NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'validador',
      created_at timestamp DEFAULT now(),
      CONSTRAINT scaling_function_managers_unq UNIQUE (function_id, user_id, role)
    )`);
  console.log("  + tabela scaling_function_managers");

  // 2) cópia (idempotente pelo ON CONFLICT)
  const copiadas = await pool.query(`
    INSERT INTO scaling_function_managers (function_id, user_id, role, created_at)
    SELECT function_id, user_id, role, created_at FROM function_managers
    ON CONFLICT (function_id, user_id, role) DO NOTHING
    RETURNING id`);
  console.log(`  + ${copiadas.rowCount} vínculo(s) copiado(s) para o cadastro da Escala`);

  // 3) limpa da lista clássica só o que é exclusivamente da Escala
  const antes = await pool.query(`SELECT count(*)::int AS n FROM function_managers WHERE role = 'aprovador'`);
  const apagadas = await pool.query(`DELETE FROM function_managers WHERE role = 'aprovador' RETURNING id`);
  console.log(`  - ${apagadas.rowCount} de ${antes.rows[0].n} linha(s) 'aprovador' removida(s) da lista clássica de responsáveis`);

  // 4) conferência humana: validador recém-criados podem ter vindo da aba da Escala
  const recentes = await pool.query(`
    SELECT f.name AS funcao, u.name AS usuario, fm.created_at
      FROM function_managers fm
      JOIN functions f ON f.id = fm.function_id
      JOIN users u ON u.id = fm.user_id
     WHERE fm.role = 'validador' AND fm.created_at >= now() - interval '10 days'
     ORDER BY fm.created_at DESC`);
  if (recentes.rowCount) {
    console.log(`\n  CONFERIR — ${recentes.rowCount} responsável(is) 'validador' criado(s) nos últimos 10 dias:`);
    for (const r of recentes.rows) console.log(`    ${String(r.created_at).slice(0, 10)} | ${r.usuario} → ${r.funcao}`);
    console.log("    (se algum foi criado pela aba da Escala e não deveria estar na lista clássica, remova por Cadastros › Funções)");
  }

  await pool.end();
  console.log("\nMigração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
