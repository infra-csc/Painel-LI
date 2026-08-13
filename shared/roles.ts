/**
 * Normalização de papéis compartilhada entre client e servidor.
 *
 * O banco tem papéis legados ("administrador", "financeiro", ...); o client
 * sempre normalizou (client/src/lib/permissions.ts), mas o servidor comparava
 * strings literais — usuário com papel legado via os botões e tomava 403.
 * Esta é a fonte única da tabela de aliases.
 */

export type CanonicalRole = "admin" | "production" | "function_area" | "purchasing" | "financial";

const ROLE_MAP: Record<string, CanonicalRole> = {
  admin: "admin",
  production: "production",
  function_area: "function_area",
  purchasing: "purchasing",
  financial: "financial",
  // Aliases legados
  administrador: "admin",
  administrator: "admin",
  logistica_interna: "production",
  logistica: "production",
  area_funcional: "function_area",
  area_responsavel: "function_area",
  function_manager: "function_area",
  compras: "purchasing",
  viagens: "purchasing",
  compras_viagens: "purchasing",
  purchase: "purchasing",
  travel: "purchasing",
  financeiro: "financial",
  finance: "financial",
};

export function normalizeRole(role: string | null | undefined): CanonicalRole | null {
  if (!role) return null;
  return ROLE_MAP[role.toLowerCase().trim()] || null;
}

/** RH (financial) ou administrador — quem decide no fluxo financeiro. */
export function isFinanceRole(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === "admin" || r === "financial";
}

/**
 * Grupos de autorização usados pelo servidor (server/routes.ts) e disponíveis
 * ao client para esconder ações que a API vai recusar. Fonte única — antes
 * cada rota repetia sua própria lista de strings.
 */
export const ROLE_GROUPS = {
  /** Cadastros estruturais: funções, colaboradores, eventos, escalação */
  cadastro: ["admin", "purchasing", "production"],
  /** Valores, custos e decisões financeiras */
  financeiro: ["admin", "financial"],
  /** Logística: passagens, hospedagem, grupos de transporte, custos extras */
  logistica: ["admin", "purchasing", "production"],
} as const satisfies Record<string, readonly CanonicalRole[]>;

/** Verifica se o papel (aceitando aliases legados) pertence ao grupo. */
export function hasRoleIn(
  role: string | null | undefined,
  group: readonly CanonicalRole[],
): boolean {
  const r = normalizeRole(role);
  return !!r && group.includes(r);
}
