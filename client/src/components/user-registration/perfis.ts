/**
 * Perfis de acesso — como o Cadastro de usuários e o "Ver como usuário" os
 * APRESENTAM (redesenho 08/10). Só apresentação: quem decide o que cada perfil
 * pode é `getRolePermissions` (@/lib/role-utils) e o menu vem de
 * `visibleGroups` (nav-items) — a mesma fonte do menu lateral, então a lista
 * de telas daqui nunca promete uma tela que o perfil não abre.
 */
import type { LucideIcon } from "lucide-react";
import { Network, ShieldCheck, ShoppingCart, Truck, Users } from "lucide-react";
import type { User } from "@shared/schema";
import { normalizeRole, type CanonicalRole } from "@shared/roles";
import { visibleGroups } from "@/components/layout/nav-items";

export interface Perfil {
  value: CanonicalRole;
  /** Nome curto do perfil (o mesmo do Cadastro de usuários desde sempre). */
  label: string;
  icon: LucideIcon;
  /** Uma frase: para quem é o perfil. */
  resumo: string;
}

export const PERFIS: Perfil[] = [
  { value: "admin",         label: "Administrador",     icon: ShieldCheck,  resumo: "Tudo do sistema, inclusive usuários, Log de auditoria e Ver como usuário." },
  { value: "production",    label: "Logística Interna", icon: Truck,        resumo: "Opera os eventos: cadastros, escala, passagens e hospedagem." },
  { value: "function_area", label: "Área de Função",    icon: Network,      resumo: "Escala a equipe das próprias funções e valida a escala onde tiver esse papel." },
  { value: "purchasing",    label: "Compras / Viagem",  icon: ShoppingCart, resumo: "Passagens, hospedagem e bagagem; cadastra operadores." },
  { value: "financial",     label: "RH",                icon: Users,        resumo: "Financeiro completo (planejado, realizado, notas, Flash); cadastra operadores." },
];

/** Perfil (aceitando os apelidos legados do banco). */
export function perfilDe(role: string | null | undefined): Perfil | undefined {
  const r = normalizeRole(role);
  return PERFIS.find((p) => p.value === r);
}

export interface GrupoDeTelas {
  titulo: string;
  telas: string[];
}

/** Menu que o perfil enxerga, por grupo, na ordem do menu lateral. */
export function telasDoPerfil(role: string | null | undefined): GrupoDeTelas[] {
  if (!role) return [];
  return visibleGroups({ role } as User).map(({ group, items }) => ({
    titulo: group.title,
    telas: items.map((t) => t.label),
  }));
}

/** Quantas telas o perfil abre. */
export function totalDeTelas(grupos: GrupoDeTelas[]): number {
  return grupos.reduce((n, g) => n + g.telas.length, 0);
}
