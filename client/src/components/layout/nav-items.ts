/**
 * MODELO DE NAVEGAÇÃO DA CASCA — fonte única do menu lateral, da trilha
 * ("Grupo / Subgrupo / Tela") na barra do topo e do grupo "Telas" da paleta ⌘K.
 *
 * Espelha ORDERED_ROUTES de App.tsx (mesma ordem, mesma permissão) e acrescenta
 * o Espelho Operacional, que é rota real (`canAccessScreen3`) mas não entra no
 * redirecionamento inicial. NADA aqui inventa permissão: quem filtra é sempre
 * `hasPermission` de `@/lib/role-utils`.
 */
import type { User } from "@shared/schema";
import { hasPermission, type RolePermissions } from "@/lib/role-utils";

export interface NavTab {
  id: string;
  path: string;
  label: string;
  /** Nome do ícone Material Symbols. */
  icon: string;
  permission: keyof RolePermissions;
}

export interface NavGroup {
  title: string;
  /** Cor do ícone do grupo (ajuda a se localizar no menu). */
  iconClass: string;
  ids: string[];
  /** Subconjunto contíguo com rótulo próprio (ex.: as 4 telas do fluxo da Escala). */
  subgroup?: { label: string; ids: string[] };
}

export const ALL_TABS: NavTab[] = [
  { id: "user-registration",  path: "/user-registration",  label: "Cadastro de Usuários", icon: "person_add",             permission: "canCreateUsers" },
  { id: "events",             path: "/events",             label: "Eventos",              icon: "event",                  permission: "canAccessCadastros" },
  { id: "calendar",           path: "/calendar",           label: "Calendário",           icon: "calendar_month",         permission: "canAccessCalendar" },
  { id: "functions",          path: "/functions",          label: "Funções",              icon: "work",                   permission: "canAccessCadastros" },
  { id: "collaborators",      path: "/collaborators",      label: "Colaboradores",        icon: "badge",                  permission: "canAccessCollaborators" },
  { id: "scaling-suggestion", path: "/scaling-suggestion", label: "Sugestão de Escala",   icon: "playlist_add",           permission: "canAccessScalingSuggestion" },
  { id: "scaling-validation", path: "/scaling-validation", label: "Validação de Escala",  icon: "fact_check",             permission: "canAccessScalingValidation" },
  { id: "scaling-approval",   path: "/scaling-approval",   label: "Aprovação de Escala",  icon: "approval",               permission: "canAccessScalingApproval" },
  { id: "scaling-event-view", path: "/scaling-event-view", label: "Histórico da Escala",  icon: "history",                permission: "canAccessScalingEventView" },
  { id: "team-inclusion",     path: "/team-inclusion",     label: "Inclusão de Equipe",   icon: "group_add",              permission: "canAccessScreen1" },
  { id: "scaling",            path: "/scaling",            label: "Escalação",            icon: "assignment_ind",         permission: "canAccessScreen2" },
  { id: "tickets",            path: "/tickets",            label: "Passagens",            icon: "confirmation_number",    permission: "canAccessScreen3" },
  { id: "accommodations",     path: "/accommodations",     label: "Hospedagem",           icon: "bed",                    permission: "canAccessScreen3" },
  { id: "operational-mirror", path: "/operational-mirror", label: "Espelho Operacional",  icon: "table_view",             permission: "canAccessScreen3" },
  { id: "baggage-control",    path: "/baggage-control",    label: "Controle de Bagagem",  icon: "luggage",                permission: "canAccessBaggage" },
  { id: "budget-planned",     path: "/budget-planned",     label: "Planejado",            icon: "pending_actions",        permission: "canAccessFinanceiro" },
  { id: "budget-actual",      path: "/budget-actual",      label: "Realizado",            icon: "account_balance_wallet", permission: "canAccessFinanceiro" },
  { id: "budget-comparison",  path: "/budget-comparison",  label: "Comparativo",          icon: "query_stats",            permission: "canAccessScreen5" },
  { id: "rh-control",         path: "/rh-control",         label: "Controle RH",          icon: "groups",                 permission: "canAccessScreen5" },
  { id: "invoices",           path: "/invoices",           label: "Notas Fiscais",        icon: "receipt_long",           permission: "canAccessFinanceiro" },
  { id: "flash-account",      path: "/flash-account",      label: "Conta Corrente Flash", icon: "savings",                permission: "canAccessFinanceiro" },
  { id: "calculation-rules",  path: "/calculation-rules",  label: "Regras de Cálculo",    icon: "calculate",              permission: "canAccessFinanceiro" },
  { id: "system-settings",    path: "/system-settings",    label: "Valores Padrão",       icon: "settings_suggest",       permission: "canAccessFinanceiro" },
  { id: "consultation",       path: "/consultation",       label: "Log de auditoria",     icon: "manage_search",          permission: "canAccessScreen6" },
  { id: "admin-users",        path: "/admin-users",        label: "Usuários",             icon: "manage_accounts",        permission: "canAccessAdminUsers" },
  { id: "simulation",         path: "/simulation",         label: "Ver como usuário",     icon: "visibility",             permission: "canAccessSimulation" },
];

/** Cor por GRUPO (semântica: ajuda a se localizar). O item ativo usa sempre o azul de marca. */
export const MENU_GROUPS: NavGroup[] = [
  { title: "Cadastros", iconClass: "text-primary", ids: ["user-registration", "events", "calendar", "functions", "collaborators"] },
  {
    title: "Operacional",
    iconClass: "text-orange-500",
    // Módulo de Escala na ordem do fluxo: Sugestão → Validação → Aprovação → Histórico
    ids: ["scaling-suggestion", "scaling-validation", "scaling-approval", "scaling-event-view", "team-inclusion", "scaling", "tickets", "accommodations", "operational-mirror", "baggage-control"],
    subgroup: { label: "Escala", ids: ["scaling-suggestion", "scaling-validation", "scaling-approval", "scaling-event-view"] },
  },
  { title: "Financeiro", iconClass: "text-emerald-600", ids: ["budget-planned", "budget-actual", "budget-comparison", "rh-control", "invoices", "flash-account", "calculation-rules", "system-settings"] },
  { title: "Gestão", iconClass: "text-violet-600", ids: ["consultation", "admin-users", "simulation"] },
];

const TAB_BY_ID = new Map(ALL_TABS.map((t) => [t.id, t]));
const TAB_BY_PATH = new Map(ALL_TABS.map((t) => [t.path, t]));

export function tabById(id: string): NavTab | undefined {
  return TAB_BY_ID.get(id);
}

/** Tela correspondente à rota atual (ignora querystring). */
export function tabByPath(path: string): NavTab | undefined {
  return TAB_BY_PATH.get(path.split("?")[0]);
}

/** Todas as telas que ESTE usuário pode abrir, na ordem do menu. */
export function visibleTabs(user: User | null): NavTab[] {
  return ALL_TABS.filter((t) => hasPermission(user, t.permission));
}

export interface ResolvedGroup {
  group: NavGroup;
  items: NavTab[];
}

/** Grupos do menu já filtrados por permissão (grupos vazios somem). */
export function visibleGroups(user: User | null): ResolvedGroup[] {
  const allowed = new Set(visibleTabs(user).map((t) => t.id));
  return MENU_GROUPS.map((group) => ({
    group,
    items: group.ids.map((id) => TAB_BY_ID.get(id)).filter((t): t is NavTab => !!t && allowed.has(t.id)),
  })).filter((g) => g.items.length > 0);
}

/** Grupo (e subgrupo) a que uma tela pertence — base da trilha do topo. */
export function groupOf(tabId: string): { group: NavGroup; subLabel?: string } | undefined {
  for (const group of MENU_GROUPS) {
    if (!group.ids.includes(tabId)) continue;
    const subLabel = group.subgroup?.ids.includes(tabId) ? group.subgroup.label : undefined;
    return { group, subLabel };
  }
  return undefined;
}

export interface Breadcrumb {
  /** "Operacional / Escala" (sem a tela atual) — pode ser vazio. */
  trail: string[];
  label: string;
  icon: string;
  iconClass: string;
}

/** Trilha "Grupo / Subgrupo / Tela atual" derivada da rota. */
export function breadcrumbFor(path: string): Breadcrumb | null {
  const tab = tabByPath(path);
  if (!tab) return null;
  const found = groupOf(tab.id);
  return {
    trail: found ? [found.group.title, ...(found.subLabel ? [found.subLabel] : [])] : [],
    label: tab.label,
    icon: tab.icon,
    iconClass: found?.group.iconClass ?? "text-primary",
  };
}

/**
 * Onde o item está dentro do subgrupo (ex.: "Escala"), considerando SÓ os itens
 * que este usuário enxerga: `start` ganha o sub-rótulo antes, `end` ganha o
 * separador fino depois. Os itens do subgrupo têm o MESMO tratamento visual dos
 * demais — a ordem do fluxo é expressa pela ordem da lista, sem numeração.
 */
export function subgroupEdges(group: NavGroup, items: NavTab[], index: number): { start: boolean; end: boolean } {
  const sub = group.subgroup;
  const id = items[index]?.id;
  if (!sub || !id || !sub.ids.includes(id)) return { start: false, end: false };
  const prev = items[index - 1];
  const next = items[index + 1];
  return {
    start: !prev || !sub.ids.includes(prev.id),
    end: !!next && !sub.ids.includes(next.id),
  };
}

/** As 4 telas do módulo de Escala (usadas pela paleta para abrir um evento). */
export const SCALING_MODULE_PATHS = ["/scaling-suggestion", "/scaling-validation", "/scaling-approval", "/scaling-event-view"];
