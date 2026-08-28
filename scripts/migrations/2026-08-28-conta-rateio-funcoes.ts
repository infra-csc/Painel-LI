/**
 * Migração — conta contábil (rateio) das funções (2026-08-28)
 *
 * O Espelho Operacional passou a fechar o custo do evento por CONTA, como a
 * planilha da equipe ("CORRIDA VALE - ITABIRA MG 2026", aba NÃO MEXER, que
 * mapeia Departamento → Conta). Este script apenas SEMEIA esse mapa nas
 * funções que ainda não têm conta — nada é sobrescrito, e a conta continua
 * editável na tela de Funções.
 *
 * Mapa da planilha: atendimento→Atendimento; ativação/cenotécnica/kit/
 * percurso/produção/dir prova/sup ceno→LI; clube o2→Assinatura; hub→Produção;
 * grupos→Grupos; comercial→Comercial; rh→RH; running→Running.
 *
 * Idempotente. Rodar:
 *   DATABASE_URL=... npx tsx scripts/migrations/2026-08-28-conta-rateio-funcoes.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

/** Casado por PREFIXO do nome da função, em minúsculas e sem acento. */
const MAPA: [string, string][] = [
  ["atendimento", "Atendimento"],
  ["ativacao", "LI"],
  ["cenotecnic", "LI"],   // cenotecnica, cenotecnico, cenotecnica sp…
  ["sup ceno", "LI"],
  ["kit", "LI"],
  ["percurso", "LI"],
  ["producao", "LI"],
  ["dir prova", "LI"],
  ["montagem", "LI"],
  ["clube o2", "Assinatura"],
  ["hub", "Produção"],
  ["grupos", "Grupos"],
  ["comercial", "Comercial"],
  ["rh", "RH"],
  ["running", "Running"],
];

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function contaPara(nome: string): string | null {
  const n = semAcento(nome);
  for (const [prefixo, conta] of MAPA) if (n.startsWith(prefixo)) return conta;
  return null;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });

  const { rows } = await pool.query(
    `select id, name, cost_center from functions where responsible_area is distinct from '__system__' order by name`,
  );
  let preenchidas = 0;
  const semMapa: string[] = [];
  for (const f of rows as { id: string; name: string; cost_center: string | null }[]) {
    if (f.cost_center && f.cost_center.trim()) continue; // nunca sobrescreve
    const conta = contaPara(f.name);
    if (!conta) { semMapa.push(f.name); continue; }
    await pool.query(`update functions set cost_center = $1 where id = $2`, [conta, f.id]);
    console.log(`  + ${f.name} → ${conta}`);
    preenchidas++;
  }
  console.log(`\n${preenchidas} função(ões) com conta definida.`);
  if (semMapa.length) console.log(`Sem correspondência no mapa (defina à mão em Funções): ${semMapa.join(", ")}`);
  await pool.end();
  console.log("\nMigração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
