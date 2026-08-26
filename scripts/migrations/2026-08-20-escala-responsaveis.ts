/**
 * Seed — Responsáveis da Validação de Escala (2026-08-20)
 *
 * Escalação inicial ditada pelo dono (20/08): quem VALIDA cada área e quem
 * APROVA (function_managers.role 'validador' | 'aprovador'):
 *
 *   - Felipe Fernandes            → validador de produção
 *   - Marcelo Toscano             → validador de cenotécnica ("ceno")
 *   - Vinicius Alexandre          → validador de cenotécnica ("ceno")
 *   - Agatha                      → validadora de atendimento
 *   - Priscila                    → validadora de kit e ativação
 *   - Bruno                       → validador de kit e ativação
 *   - Mayara                      → validadora de clube o2
 *   - Pedro Telles                → APROVADOR de TODAS as funções
 *
 * Casamento tolerante a acento/caixa (normalização NFD em JS, não ILIKE):
 *   - usuários por nome (ex.: "priscila" casa "Priscila Souza");
 *   - funções por grupo de nome: produção → contém "produc"; ceno → contém
 *     "ceno" (INCLUI "sup ceno" — logado); atendimento → contém "atendimento";
 *     kit e ativação → contém "kit" OU "ativa"; clube o2 → contém "o2".
 *
 * A UNIQUE de function_managers é (function_id, user_id) SEM role — um usuário
 * tem no máximo UM papel por função. Se alguém já estiver na função com papel
 * diferente do desejado, o registro existente é MANTIDO e o caso vira aviso
 * (nunca sobrescrevemos um papel definido na UI). Pedro aprovador + outra
 * pessoa validadora na MESMA função funciona normalmente (usuários distintos).
 *
 * Idempotente (INSERT ... ON CONFLICT (function_id, user_id) DO NOTHING).
 * Nome sem match vira AVISO, nunca erro. Ao final lista as funções que
 * ficaram SEM validador (dir. prova, percurso, montagem, mkt... não foram
 * citadas pelo dono) e sem aprovador.
 *
 * Não executar em deploy automático — rodar manualmente:
 *   DATABASE_URL=... npx tsx scripts/migrations/2026-08-20-escala-responsaveis.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

type Role = "validador" | "aprovador";

/** Minúsculas + sem acento — "Produção" → "producao". */
const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Grupos de funções por nome (já normalizado). */
const GROUPS: Record<string, (n: string) => boolean> = {
  "produção":       n => n.includes("produc"),
  "ceno":           n => n.includes("ceno"),
  "atendimento":    n => n.includes("atendimento"),
  "kit e ativação": n => n.includes("kit") || n.includes("ativa"),
  "clube o2":       n => n.includes("o2"),
};

/** Validadores por grupo (busca de usuário por nome, tolerante). */
const VALIDADORES: { userSearch: string; group: keyof typeof GROUPS }[] = [
  { userSearch: "felipe fernandes",  group: "produção" },
  { userSearch: "marcelo toscano",   group: "ceno" },
  { userSearch: "vinicius alexandre", group: "ceno" },
  { userSearch: "agatha",            group: "atendimento" },
  { userSearch: "priscila",          group: "kit e ativação" },
  { userSearch: "bruno",             group: "kit e ativação" },
  { userSearch: "mayara",            group: "clube o2" },
];

/** Aprovador central — todas as funções. */
const APROVADOR_SEARCH = "pedro telles";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });

  const warn = (msg: string) => console.warn(`  AVISO: ${msg}`);

  // ---- Carrega usuários, funções e vínculos atuais -------------------------
  const users = (await pool.query(`SELECT id, name, email FROM users`)).rows as
    { id: string; name: string | null; email: string | null }[];
  const functions = (await pool.query(
    `SELECT id, name, responsible_area FROM functions
     WHERE responsible_area IS DISTINCT FROM '__system__'
     ORDER BY name`,
  )).rows as { id: string; name: string }[];
  const existingRows = (await pool.query(
    `SELECT function_id, user_id, role FROM function_managers`,
  )).rows as { function_id: string; user_id: string; role: Role }[];

  const existing = new Map(existingRows.map(r => [`${r.function_id}:${r.user_id}`, r.role]));

  // ---- Casa usuários por nome ---------------------------------------------
  const findUser = (search: string) => {
    const t = normalize(search);
    const matches = users.filter(u => normalize(u.name ?? "").includes(t));
    if (matches.length === 0) { warn(`usuário "${search}" não encontrado — pulando.`); return null; }
    if (matches.length > 1) {
      warn(`usuário "${search}" é ambíguo (${matches.map(m => m.name).join(", ")}) — pulando; cadastre pela UI.`);
      return null;
    }
    return matches[0];
  };

  // ---- Monta o plano (functionId, userId, role) ---------------------------
  type Planned = { functionId: string; functionName: string; userId: string; userName: string; role: Role };
  const plan: Planned[] = [];

  for (const { userSearch, group } of VALIDADORES) {
    const user = findUser(userSearch);
    if (!user) continue;
    const matcher = GROUPS[group];
    const funcs = functions.filter(f => matcher(normalize(f.name)));
    if (funcs.length === 0) { warn(`nenhuma função no grupo "${group}" (para ${user.name}).`); continue; }
    for (const f of funcs) {
      if (group === "ceno" && normalize(f.name).includes("sup")) {
        console.log(`  (grupo "ceno" INCLUI "${f.name}" — Sup Ceno entra de propósito)`);
      }
      plan.push({ functionId: f.id, functionName: f.name, userId: user.id, userName: user.name ?? user.email ?? user.id, role: "validador" });
    }
  }

  const aprovador = findUser(APROVADOR_SEARCH);
  if (aprovador) {
    for (const f of functions) {
      plan.push({ functionId: f.id, functionName: f.name, userId: aprovador.id, userName: aprovador.name ?? aprovador.email ?? aprovador.id, role: "aprovador" });
    }
  }

  // ---- Aplica (idempotente; nunca sobrescreve papel existente) ------------
  let inserted = 0, skippedSame = 0, conflictRole = 0;
  for (const p of plan) {
    const current = existing.get(`${p.functionId}:${p.userId}`);
    if (current === p.role) { skippedSame++; continue; }
    if (current) {
      conflictRole++;
      warn(`${p.userName} já é "${current}" de "${p.functionName}" — papel MANTIDO (queria "${p.role}"). Ajuste pela aba Validação de Escala se necessário.`);
      continue;
    }
    const r = await pool.query(
      `INSERT INTO function_managers (function_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (function_id, user_id) DO NOTHING`,
      [p.functionId, p.userId, p.role],
    );
    if (r.rowCount) {
      inserted++;
      console.log(`  + ${p.userName} → ${p.role} de "${p.functionName}"`);
      existing.set(`${p.functionId}:${p.userId}`, p.role);
    } else {
      skippedSame++; // corrida: outra execução inseriu no meio do caminho
    }
  }

  // ---- Relatório final ----------------------------------------------------
  const byFunction = new Map<string, Role[]>();
  for (const [key, role] of existing) {
    const fid = key.slice(0, key.indexOf(":"));
    byFunction.set(fid, [...(byFunction.get(fid) ?? []), role]);
  }
  const semValidador = functions.filter(f => !(byFunction.get(f.id) ?? []).includes("validador"));
  const semAprovador = functions.filter(f => !(byFunction.get(f.id) ?? []).includes("aprovador"));

  console.log(`\nResumo: ${inserted} vínculos criados · ${skippedSame} já existiam · ${conflictRole} conflitos de papel (mantidos).`);
  if (semValidador.length > 0) {
    console.log(`Funções SEM validador (${semValidador.length}) — não citadas pelo dono; definir na aba Validação de Escala:`);
    for (const f of semValidador) console.log(`  - ${f.name}`);
  }
  if (semAprovador.length > 0) {
    console.log(`Funções SEM aprovador (${semAprovador.length}) — vagas validadas dessas áreas ficam paradas:`);
    for (const f of semAprovador) console.log(`  - ${f.name}`);
  }

  await pool.end();
  console.log("\nSeed concluído.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
