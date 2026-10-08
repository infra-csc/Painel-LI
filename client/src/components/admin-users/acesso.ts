/**
 * Usuários — o que cada perfil ABRE, por extenso (08/10, redesenho).
 *
 * Só leitura das regras que já existem: as telas de cada perfil vêm de
 * `getRolePermissions` (@/lib/role-utils) cruzado com o menu (`ALL_TABS` e
 * `MENU_GROUPS` de nav-items) — a mesma conta que o menu lateral faz para
 * quem está logado. Nada aqui concede ou tira acesso.
 */
import type { User } from "@shared/schema";
import { normalizeRole, type CanonicalRole } from "@shared/roles";
import { getRolePermissions, type UserRole } from "@/lib/role-utils";
import { ALL_TABS, MENU_GROUPS, type NavTab, type ToneDoGrupo } from "@/components/layout/nav-items";
import { toTitleCase } from "@/lib/format";

/** Ordem em que os perfis aparecem (do mais amplo ao mais restrito). */
export const PERFIS: CanonicalRole[] = ["admin", "financial", "purchasing", "production", "function_area"];

/** Nome do perfil — o mesmo do filtro, do modal e da confirmação. */
export const NOME_DO_PERFIL: Record<CanonicalRole, string> = {
  admin: "Administrador",
  production: "Logística Interna",
  function_area: "Área de Função",
  purchasing: "Compras / Viagem",
  financial: "RH",
};

/** Uma frase: o que o perfil faz no dia a dia (só descrição das regras de role-utils). */
export const RESUMO_DO_PERFIL: Record<CanonicalRole, string> = {
  admin: "Vê e altera tudo, inclusive usuários, log de auditoria e “Ver como usuário”.",
  production: "Cadastros e operação: inclusão, escalação, passagens e hospedagem.",
  function_area: "Escalação, módulo de Escala e colaboradores.",
  purchasing: "Cadastros, passagens, hospedagem e controle de bagagem.",
  financial: "Financeiro, controle RH e cadastros; consulta a operação.",
};

export function nomeDoPerfil(role: string | null | undefined): string {
  const r = normalizeRole(role);
  return r ? NOME_DO_PERFIL[r] : role?.trim() ? role : "Sem perfil";
}

export function ehAdmin(role: string | null | undefined): boolean {
  return normalizeRole(role) === "admin";
}

/** Telas que o perfil abre, na ordem do menu. Perfil desconhecido: nenhuma. */
export function telasDoPerfil(role: string | null | undefined): NavTab[] {
  if (!normalizeRole(role)) return [];
  const p = getRolePermissions(role as UserRole);
  return ALL_TABS.filter(t => p[t.permission]);
}

export interface GrupoDeAcesso {
  titulo: string;
  tom: ToneDoGrupo;
  total: number;
  abertas: NavTab[];
}

/** As telas do perfil por grupo do menu (Cadastros, Operacional, Financeiro, Gestão). */
export function acessoPorGrupo(role: string | null | undefined): GrupoDeAcesso[] {
  const abertas = new Set(telasDoPerfil(role).map(t => t.id));
  return MENU_GROUPS.map(g => {
    const doGrupo = g.ids.map(id => ALL_TABS.find(t => t.id === id)).filter((t): t is NavTab => !!t);
    return { titulo: g.title, tom: g.tone, total: doGrupo.length, abertas: doGrupo.filter(t => abertas.has(t.id)) };
  });
}

export const TOTAL_DE_TELAS = ALL_TABS.length;

// ─── Situação da conta ───────────────────────────────────────────────────────
// O MESMO critério da faixa e do filtro (23/09): pendente; com acesso =
// aprovado e ativo; sem acesso = rejeitado ou desativado.
export type Situacao = "pending" | "approved" | "inactive";

export const isPendingUser = (u: User) => u.status === "pending";
export const isApprovedUser = (u: User) => u.status === "approved" && u.isActive !== false;
export const isInactiveUser = (u: User) => u.status === "rejected" || u.isActive === false;

export type EstadoDaConta = "pendente" | "ativo" | "inativo" | "rejeitado";

/** Como a pílula lê a conta (a mesma precedência da pílula antiga). */
export function estadoDaConta(u: Pick<User, "status" | "isActive">): EstadoDaConta {
  if (u.status === "pending") return "pendente";
  if (u.status === "approved" && u.isActive !== false) return "ativo";
  if (u.status === "rejected") return "rejeitado";
  return "inativo";
}

/** Nome de pessoa pela regra única do app. */
export function nomeDaPessoa(nome: string | null | undefined): string {
  return toTitleCase(nome ?? "");
}

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
export function dataCurta(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const d = new Date(valor);
  return isNaN(d.getTime()) ? "—" : DATA.format(d);
}
