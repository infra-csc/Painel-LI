#!/usr/bin/env node
/**
 * Guarda do redesign: compara HEAD com o commit de referência e reprova o que a regra
 * "zero alteração de lógica" proíbe sem autorização. Uso: npm run redesign:guarda
 *
 * - Arquivo em área sensível mudou: precisa estar em AUTORIZADOS, com o motivo.
 * - data-testid sumiu: os E2E dependem deles (exibe a lista).
 * Não substitui o teste: só impede que um desvio passe despercebido.
 */
import { execFileSync } from "node:child_process";

const BASE = process.env.REDESIGN_BASE ?? "b6a87f94"; // main depois das correções críticas (04/11)
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });

const SENSIVEIS = [
  /^shared\//, /^server\//,
  /^client\/src\/App\.tsx$/, /^client\/src\/lib\/role-utils\.ts$/, /^client\/src\/lib\/ticket-form\.ts$/,
  /^client\/src\/components\/layout\/protected-route\.tsx$/, /^client\/src\/components\/layout\/nav-items\.ts$/,
  /^client\/src\/components\/admin-users\/acesso\.ts$/, /^client\/src\/components\/user-registration\/perfis\.ts$/,
  /^client\/src\/hooks\/use-[^/]+\.tsx?$/, /\/use-[^/]+\.tsx?$/, /-utils\.ts$/, /scaling-analytics-data\.ts$/,
];
// Autorizados pelo dono, com o motivo. Vazio é o normal.
const AUTORIZADOS = new Map([
  ["shared/rooming-list.ts", "Dono, 04/11: função, fornecedor e pagamento no PDF de uso interno da rooming list."],
  ["shared/fornecedores-de-hotel.ts", "Dono, 04/11: pedido novo, fornecedor e forma de pagamento por reserva de hotel."],
  ["shared/schema.ts", "Dono, 04/11: colunas fornecedor e forma_pagamento em hotel_room_groups."],
  ["server/ensure-schema.ts", "Dono, 04/11: colunas fornecedor e forma_pagamento em hotel_room_groups."],
  ["server/routes/espelho-operacional.ts", "Dono, 04/11: validar e gravar o canal da reserva; separar e mover levam o canal."],
  ["server/operational-mirror.ts", "Dono, 04/11: refazer sugestões não perde o canal da reserva."],
  ["server/dev/demo-seed.ts", "Dono, 04/11: semente da demo com um quarto com fornecedor."],
]);

const alterados = git("diff", "--name-only", `${BASE}..HEAD`).split("\n").filter(Boolean).filter((f) => !/\.test\.tsx?$/.test(f));
const violacoes = alterados.filter((f) => SENSIVEIS.some((re) => re.test(f)) && !AUTORIZADOS.has(f));

const idsDe = (ref) => {
  let saida = "";
  try { saida = git("grep", "-hoE", `data-testid=(\\{\`|")[^\`"]+`, ref, "--", "client/src"); } catch { /* sem resultado */ }
  return new Set(saida.split("\n").filter(Boolean).map((l) => l.replace(/^data-testid=(\{\`|")/, "")));
};
const antes = idsDe(BASE), agora = idsDe("HEAD");
const sumiram = [...antes].filter((i) => !agora.has(i));

console.log(`Base ${BASE}: ${alterados.length} arquivos alterados, ${antes.size} data-testid na base.`);
if (violacoes.length) { console.error("\nÁREA SENSÍVEL ALTERADA:"); violacoes.forEach((f) => console.error("  " + f)); }
if (sumiram.length) { console.error("\ndata-testid QUE SUMIRAM:"); sumiram.forEach((i) => console.error("  " + i)); }
if (violacoes.length || sumiram.length) process.exit(1);
console.log("Guarda ok: nenhuma área sensível alterada e nenhum data-testid perdido.");
