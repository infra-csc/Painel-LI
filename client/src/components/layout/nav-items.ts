/**
 * MODELO DE NAVEGAÇÃO DA CASCA — fonte única do menu lateral, da trilha
 * ("Grupo / Subgrupo / Tela") na barra do topo e do grupo "Telas" da paleta ⌘K.
 *
 * Espelha ORDERED_ROUTES de App.tsx (mesma ordem, mesma permissão) e acrescenta
 * o Espelho operacional, que é rota real (`canAccessScreen3`) mas não entra no
 * redirecionamento inicial. NADA aqui inventa permissão: quem filtra é sempre
 * `hasPermission` de `@/lib/role-utils`.
 *
 * Nomenclatura (23/09): rótulos em CAIXA DE FRASE ("Validação de escala"),
 * mantendo só nomes próprios em maiúscula (Flash, DP). A MESMA string deve
 * aparecer no menu, na trilha do topo e no título da aba (`usePageTitle`).
 *
 * 26/10 (Módulo de Honorários, Fase 0 — slide 11 da reunião de 21/10): o grupo
 * "Financeiro" virou "Honorários", com as telas do fluxo na ordem (sem número:
 * a numeração do fluxo fica só na trilha de etapas dentro das telas) e, em
 * "Configuração e apoio", a tabela, as regras, os honorários da cenotécnica, o
 * Flash e os contratos. "Aprovação de honorários" segue no Operacional (quem
 * aprova é o aprovador da escala). Os nomes antigos seguem achando a tela na
 * busca (`sinonimos`). TODA a decisão de nomes, ordem e grupos mora AQUI.
 *
 * Ícones (23/09): lucide, como o resto do app — Material Symbols saiu do menu.
 * Cor do ícone por GRUPO (voltou em 28/09, ver `CLASSE_DO_TONE`); item ativo
 * em `bg-brand-soft text-primary`.
 */
import type { User } from "@shared/schema";
import type { LucideIcon } from "lucide-react";
import {
  UserPlus, CalendarDays, Calendar, Briefcase, IdCard, ListPlus, ClipboardCheck, Stamp, History,
  UserRoundPlus, ClipboardList, Ticket, BedDouble, Table2, Luggage, CalendarClock, Wallet,
  ChartColumn, Receipt, PiggyBank, Calculator, SlidersHorizontal, FileSearch, UserCog, Eye, Inbox, PlaneTakeoff, HandCoins, CircleDollarSign,
  LayoutDashboard, FileSignature, Fingerprint, FileCheck2, Gauge, Activity, Hotel, Users,
} from "lucide-react";
import { hasPermission, type RolePermissions } from "@/lib/role-utils";

export interface NavTab {
  id: string;
  path: string;
  label: string;
  /** Componente lucide (renderizado por quem desenha: menu, topo, paleta). */
  icon: LucideIcon;
  permission: keyof RolePermissions;
  /**
   * Além do papel, depende de um cadastro que só o servidor conhece (20/10:
   * a Aprovação de honorários só aparece para quem aprova honorário). Sem o
   * dado (`AcessoExtra`), o item fica escondido.
   */
  soCom?: keyof AcessoExtra;
  /**
   * Número opcional desenhado antes do nome no menu e na busca (o título e a
   * trilha usam só o nome). Decisão de 26/10: os itens dos honorários NÃO têm
   * número — a numeração do fluxo aparece só na trilha de etapas das telas.
   */
  etapa?: string;
  /** Outros nomes que acham a tela na busca do menu e no ⌘K (ex.: o nome antigo). */
  sinonimos?: string[];
  /**
   * A rota é de outra frente e pode ainda não existir neste build (26/10:
   * Contratos). O item só aparece se a página existir (`TELAS_PRESENTES`).
   */
  dependeDaPagina?: string;
}

/** O que o menu sabe além do papel — vem de GET /api/honorarios-ceno/acesso. */
export interface AcessoExtra {
  aprovaHonorarios?: boolean;
}

export interface NavGroup {
  title: string;
  /** Cor dos ícones do grupo (ver `CLASSE_DO_TONE`). */
  tone: ToneDoGrupo;
  ids: string[];
  /**
   * Subconjunto contíguo com rótulo próprio (ex.: as 4 telas do fluxo da
   * Escala). Só o rótulo separa o módulo novo do fluxo antigo do mesmo grupo.
   */
  subgroup?: {
    label: string;
    ids: string[];
  };
}

export const ALL_TABS: NavTab[] = [
  // ── Painéis (30/10): acompanhar mudanças da escala, passagens e hotéis para agir rápido ──
  { id: "paineis",            path: "/paineis",            label: "Visão geral",          icon: Gauge,             permission: "canAccessScreen3", sinonimos: ["dashboard", "painel", "atrasados", "fora do prazo"] },
  { id: "paineis-atividade",  path: "/paineis/atividade",  label: "Atividade recente",    icon: Activity,          permission: "canAccessScreen3", sinonimos: ["últimas inclusões", "pedidos de ajuste", "notificações", "novidades"] },
  { id: "paineis-escala",     path: "/paineis/escala",     label: "Painel da escala",     icon: Users,             permission: "canAccessScreen3", sinonimos: ["comparar eventos", "escala lado a lado", "atrasados da escala"] },
  { id: "paineis-passagens",  path: "/paineis/passagens",  label: "Painel de passagens",  icon: Ticket,            permission: "canAccessScreen3", sinonimos: ["passagens fora do prazo", "emitidas", "preço de passagem"] },
  { id: "paineis-hospedagem", path: "/paineis/hospedagem", label: "Painel de hospedagem", icon: Hotel,             permission: "canAccessScreen3", sinonimos: ["hotéis atrasados", "room nights", "comparar hotéis"] },
  { id: "user-registration",  path: "/user-registration",  label: "Cadastro de usuários", icon: UserPlus,          permission: "canCreateUsers" },
  { id: "events",             path: "/events",             label: "Eventos",              icon: CalendarDays,      permission: "canAccessCadastros" },
  { id: "calendar",           path: "/calendar",           label: "Calendário",           icon: Calendar,          permission: "canAccessCalendar" },
  { id: "functions",          path: "/functions",          label: "Funções",              icon: Briefcase,         permission: "canAccessCadastros" },
  { id: "collaborators",      path: "/collaborators",      label: "Colaboradores",        icon: IdCard,            permission: "canAccessCollaborators" },
  { id: "scaling-suggestion", path: "/scaling-suggestion", label: "Sugestão de escala",   icon: ListPlus,          permission: "canAccessScalingSuggestion" },
  { id: "scaling-validation", path: "/scaling-validation", label: "Validação de escala",  icon: ClipboardCheck,    permission: "canAccessScalingValidation" },
  { id: "scaling-approval",   path: "/scaling-approval",   label: "Aprovação de escala",  icon: Stamp,             permission: "canAccessScalingApproval" },
  { id: "aprovacao-de-honorarios", path: "/aprovacao-de-honorarios", label: "Aprovação de honorários", icon: CircleDollarSign, permission: "canAccessScalingApproval", soCom: "aprovaHonorarios" },
  { id: "scaling-event-view", path: "/scaling-event-view", label: "Histórico da escala",  icon: History,           permission: "canAccessScalingEventView" },
  { id: "team-inclusion",     path: "/team-inclusion",     label: "Inclusão de equipe",   icon: UserRoundPlus,     permission: "canAccessScreen1" },
  { id: "scaling",            path: "/scaling",            label: "Escalação",            icon: ClipboardList,     permission: "canAccessScreen2" },
  { id: "tickets",            path: "/tickets",            label: "Passagens",            icon: Ticket,            permission: "canAccessScreen3" },
  { id: "busca-de-passagens", path: "/busca-de-passagens", label: "Busca de passagens",   icon: PlaneTakeoff,      permission: "canAccessBuscaDePassagens" },
  { id: "accommodations",     path: "/accommodations",     label: "Hospedagem",           icon: BedDouble,         permission: "canAccessScreen3" },
  { id: "operational-mirror", path: "/operational-mirror", label: "Espelho operacional",  icon: Table2,            permission: "canAccessScreen3" },
  { id: "baggage-control",    path: "/baggage-control",    label: "Controle de bagagem",  icon: Luggage,           permission: "canAccessBaggage" },
  // ── Honorários (26/10, slide 11): o fluxo, na ordem ──
  { id: "rh-control",         path: "/rh-control",         label: "Painel de honorários", icon: LayoutDashboard,   permission: "canAccessScreen5", sinonimos: ["Controle RH", "Controle DP", "fila"] },
  { id: "budget-planned",     path: "/budget-planned",     label: "Pré-aprovação de valores", icon: CalendarClock, permission: "canAccessFinanceiro", sinonimos: ["Planejado", "orçamento previsto"] },
  // 27/10 (Fase 1): a presença de verdade — check-in/out com selfie, ocorrências e check-out final.
  // Produção e Área de Função também entram (o servidor recorta as funções da Área).
  { id: "presenca",           path: "/presenca",           label: "Presença no evento",   icon: Fingerprint,       permission: "canAccessPresenca", sinonimos: ["check-in", "check-out", "selfie", "na arena", "check-out final"] },
  { id: "budget-actual",      path: "/budget-actual",      label: "Realizado",            icon: Wallet,            permission: "canAccessFinanceiro", sinonimos: ["prestação de contas"] },
  { id: "budget-comparison",  path: "/budget-comparison",  label: "Conferência DP",       icon: ChartColumn,       permission: "canAccessScreen5", sinonimos: ["Comparativo", "planejado x realizado"] },
  // 28/10 (Fase 2 manual): a OC registrada pelo DP, o acompanhamento da nota e o pago — admin e DP.
  { id: "ordens-de-compra",   path: "/ordens-de-compra",   label: "Ordens de compra",     icon: FileCheck2,        permission: "canAccessFinanceiro", sinonimos: ["OC", "ordem de compra", "pagamento", "pago", "marcar como pago", "M4"] },
  // Envio e validação de NF são as abas Lançamento e Aprovação DP da MESMA tela: um item só.
  { id: "invoices",           path: "/invoices",           label: "Notas fiscais",        icon: Receipt,           permission: "canAccessFinanceiro", sinonimos: ["Envio de NF", "Validação de NF", "lançamento", "aprovação", "NF"] },
  // ── Honorários › Configuração e apoio ──
  { id: "system-settings",    path: "/system-settings",    label: "Tabela de valores",    icon: SlidersHorizontal, permission: "canAccessFinanceiro", sinonimos: ["Valores padrão", "data de corte", "regras da presença", "termo LGPD"] },
  { id: "calculation-rules",  path: "/calculation-rules",  label: "Regras de cálculo",    icon: Calculator,        permission: "canAccessFinanceiro" },
  // 23/10: permissão própria — o perfil Honorários abre só esta tela.
  { id: "honorarios-ceno",    path: "/honorarios-ceno",    label: "Honorários da cenotécnica", icon: HandCoins,   permission: "canAccessHonorariosCeno", sinonimos: ["liberação de verba", "empreita"] },
  { id: "flash-account",      path: "/flash-account",      label: "Cartão Flash",         icon: PiggyBank,         permission: "canAccessFinanceiro", sinonimos: ["Conta corrente Flash"] },
  // Cadastro de contratos por CNPJ (outra frente, 26/10): só aparece com a página no build.
  { id: "contratos",          path: "/contratos",          label: "Contratos (CNPJ)",     icon: FileSignature,     permission: "canAccessFinanceiro", sinonimos: ["contrato", "CNPJ", "razão social"], dependeDaPagina: "contratos" },
  { id: "consultation",       path: "/consultation",       label: "Log de auditoria",     icon: FileSearch,        permission: "canAccessScreen6" },
  { id: "admin-users",        path: "/admin-users",        label: "Usuários",             icon: UserCog,           permission: "canAccessAdminUsers" },
  { id: "simulation",         path: "/simulation",         label: "Ver como usuário",     icon: Eye,               permission: "canAccessSimulation" },
];

/**
 * Cor do ícone por grupo (28/09 — dono: "sidebar sem cor está bem ruim"). A
 * padronização de 23/09 tinha deixado tudo em cinza; a cor por grupo ajuda a
 * achar a tela de relance. Um tom por grupo, sempre por token semântico.
 */
export type ToneDoGrupo = "primary" | "info" | "success" | "warning";
export const CLASSE_DO_TONE: Record<ToneDoGrupo, string> = {
  primary: "text-primary",
  info: "text-info-strong",
  success: "text-success-strong",
  warning: "text-warning-strong",
};

export const MENU_GROUPS: NavGroup[] = [
  // 30/10: painéis para pegar inclusões, mudanças e atrasos o quanto antes.
  { title: "Painéis", tone: "warning", ids: ["paineis", "paineis-atividade", "paineis-escala", "paineis-passagens", "paineis-hospedagem"] },
  { title: "Cadastros", tone: "primary", ids: ["user-registration", "events", "calendar", "functions", "collaborators"] },
  {
    title: "Operacional",
    tone: "info",
    // Módulo de Escala na ordem do fluxo: Sugestão → Validação → Aprovação → Histórico
    ids: ["scaling-suggestion", "scaling-validation", "scaling-approval", "aprovacao-de-honorarios", "scaling-event-view", "team-inclusion", "scaling", "tickets", "busca-de-passagens", "accommodations", "operational-mirror", "baggage-control"],
    // O fluxo da Escala é um módulo à parte do operacional antigo (Inclusão,
    // Escalação, Passagens…): o sub-rótulo e o separador fino dizem isso.
    subgroup: {
      label: "Escala",
      ids: ["scaling-suggestion", "scaling-validation", "scaling-approval", "aprovacao-de-honorarios", "scaling-event-view"],
    },
  },
  {
    // 26/10 (slide 11): "Financeiro" virou "Honorários". O fluxo na ordem
    // (28/10: Ordens de compra entre a Conferência DP e as Notas fiscais; o
    // pago mora nela e em Notas fiscais — sem tela própria) e, embaixo, a
    // configuração e o apoio.
    title: "Honorários",
    tone: "success",
    ids: [
      "rh-control", "budget-planned", "presenca", "budget-actual", "budget-comparison", "ordens-de-compra", "invoices",
      "system-settings", "calculation-rules", "honorarios-ceno", "flash-account", "contratos",
    ],
    subgroup: {
      label: "Configuração e apoio",
      ids: ["system-settings", "calculation-rules", "honorarios-ceno", "flash-account", "contratos"],
    },
  },
  { title: "Gestão", tone: "warning", ids: ["consultation", "admin-users", "simulation"] },
];

const TONE_BY_TAB = new Map<string, ToneDoGrupo>(MENU_GROUPS.flatMap((g) => g.ids.map((id) => [id, g.tone] as const)));
/** Classe de cor do ícone da tela, pelo grupo do menu. */
export function classeDeCorDaTela(tabId: string): string {
  return CLASSE_DO_TONE[TONE_BY_TAB.get(tabId) ?? "primary"];
}

const TAB_BY_ID = new Map(ALL_TABS.map((t) => [t.id, t]));
const TAB_BY_PATH = new Map(ALL_TABS.map((t) => [t.path, t]));

export function tabById(id: string): NavTab | undefined {
  return TAB_BY_ID.get(id);
}

/** Tela correspondente à rota atual (ignora querystring). */
export function tabByPath(path: string): NavTab | undefined {
  return TAB_BY_PATH.get(path.split("?")[0]);
}

/**
 * Páginas que existem neste build (`client/src/pages/*.tsx`), pelo nome do
 * arquivo. Serve só para `dependeDaPagina`: o item de uma tela que outra
 * frente ainda está criando não aparece apontando para um 404.
 */
export const TELAS_PRESENTES: ReadonlySet<string> = new Set(
  Object.keys(import.meta.glob("../../pages/*.tsx")).map((caminho) => caminho.replace(/^.*\/|\.tsx$/g, "")),
);

const telaPresente = (t: NavTab) => !t.dependeDaPagina || TELAS_PRESENTES.has(t.dependeDaPagina);

/** Todas as telas que ESTE usuário pode abrir, na ordem do menu. */
export function visibleTabs(user: User | null, extra: AcessoExtra = {}): NavTab[] {
  return ALL_TABS.filter((t) => telaPresente(t) && hasPermission(user, t.permission) && (!t.soCom || !!extra[t.soCom]));
}

/** O nome com a etapa, se a tela tiver uma (menu e ⌘K) — hoje nenhuma tem (decisão de 26/10). */
export function rotuloComEtapa(t: Pick<NavTab, "label" | "etapa">): string {
  return t.etapa ? `${t.etapa} · ${t.label}` : t.label;
}

/** O que a busca do menu e o ⌘K procuram: nome, etapa e os sinônimos (nomes antigos). */
export function textoDeBusca(t: Pick<NavTab, "label" | "etapa" | "sinonimos">): string {
  return [rotuloComEtapa(t), ...(t.sinonimos ?? [])].join(" ");
}

export interface ResolvedGroup {
  group: NavGroup;
  items: NavTab[];
}

/** Grupos do menu já filtrados por permissão (grupos vazios somem). */
export function visibleGroups(user: User | null, extra: AcessoExtra = {}): ResolvedGroup[] {
  const allowed = new Set(visibleTabs(user, extra).map((t) => t.id));
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
  icon: LucideIcon;
}

/**
 * Rotas reais que NÃO são item do menu, mas merecem trilha no topo (07/10:
 * em /pendencias a barra do topo ficava em branco). Não dá acesso a nada —
 * só nomeia a tela em que a pessoa já está.
 */
const CRUMBS_FORA_DO_MENU: Record<string, Breadcrumb> = {
  "/pendencias": { trail: [], label: "Pendências", icon: Inbox },
  // 16/10: os resultados da Busca de passagens são uma tela própria, abaixo da busca.
  "/busca-de-passagens/resultados": { trail: ["Operacional", "Busca de passagens"], label: "Preços na internet", icon: PlaneTakeoff },
};

/** Trilha "Grupo / Subgrupo / Tela atual" derivada da rota. */
export function breadcrumbFor(path: string): Breadcrumb | null {
  const tab = tabByPath(path);
  if (!tab) return CRUMBS_FORA_DO_MENU[path.split("?")[0]] ?? null;
  const found = groupOf(tab.id);
  return {
    trail: found ? [found.group.title, ...(found.subLabel ? [found.subLabel] : [])] : [],
    label: tab.label,
    icon: tab.icon,
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
  // Só itens do subgrupo à vista (perfil Honorários: só "Honorários da cenotécnica"):
  // o sub-rótulo não separa nada — fica de fora (26/10).
  if (items.every((t) => sub.ids.includes(t.id))) return { start: false, end: false };
  const prev = items[index - 1];
  const next = items[index + 1];
  return {
    start: !prev || !sub.ids.includes(prev.id),
    end: !!next && !sub.ids.includes(next.id),
  };
}

/** As 4 telas do módulo de Escala (usadas pela paleta para abrir um evento). */
export const SCALING_MODULE_PATHS = ["/scaling-suggestion", "/scaling-validation", "/scaling-approval", "/scaling-event-view"];
