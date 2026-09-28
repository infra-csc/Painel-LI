/**
 * Controle RH — o cruzamento prestação × planejado × NF × isenção de NF
 * (25/09), como função pura compartilhada.
 *
 * Até aqui a tela client/src/pages/rh-control.tsx baixava QUATRO tabelas
 * inteiras (/api/team-inclusions ~4.500 linhas, /api/budget-planned,
 * /api/budget-actual, /api/invoices) e cruzava tudo em `useMemo`. A regra de
 * cruzamento foi trazida para cá, sem alteração de semântica, para que
 * GET /api/rh/controle (server/routes/rh-controle.ts) devolva as linhas
 * prontas e a tela só renderize. Os tipos aqui SÃO o contrato do endpoint.
 *
 * Regras (as mesmas que a tela aplicava):
 *  - vaga ativa (não excluída, com colaborador) sem Planejado casando por
 *    (evento, colaborador, função) → "planejamento_pendente", responsável RH;
 *  - com Planejado: o status vem do Realizado "raiz" (sem splitParentId),
 *    achado pelo plannedId ou pela mesma chave (evento, colaborador, função);
 *  - Planejado sem vaga ("órfão") também entra;
 *  - NF: elegibilidade por `isNfEligible` e isenção por `nfIsentaPorEscalacao`
 *    (ambas em shared/prestacao-rules — a MESMA regra da tela de Notas Fiscais).
 *
 * Funções puras — sem I/O.
 */
import { isNfEligible, nfIsentaPorEscalacao, type EscalacaoLike } from "./prestacao-rules";

// ── Tipos de entrada (o mínimo que o cruzamento lê de cada tabela) ──────────
export interface EventoParaControle {
  id: string;
  eventNumber: number;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface VagaParaControle extends EscalacaoLike {
  id: string;
  inclusionNumber: number;
  eventId: string;
  functionId: string;
  collaboratorId: string | null;
  emitsNf: boolean | null;
  status: string;
  phase: string;
  createdAt: Date | string | null;
  deletedAt: Date | string | null;
}

export interface PlanejadoParaControle {
  id: string;
  eventId: string;
  collaboratorId: string | null;
  functionId: string | null;
  collaboratorType: string | null;
  dailyQuantity: number;
  dailyValue: number;
  costAssistance: number;
  weekdayLunch: number;
  weekdayDinner: number;
  weekendLunch: number;
  weekendDinner: number;
  mobility: number;
  transport: number;
  totalValue: number;
  status: string;
  observations: string | null;
  didNotAttend: boolean;
  createdBy: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export interface RealizadoParaControle {
  id: string;
  plannedId: string | null;
  eventId: string;
  collaboratorId: string | null;
  functionId: string | null;
  splitParentId: string | null;
  dailyQuantity: number;
  dailyValue: number;
  /** Alimentação e mobilidade em centavos, como em budget_actual — o card do Controle RH mostra Planejado × Realizado. */
  weekdayLunch: number;
  weekdayDinner: number;
  weekendLunch: number;
  weekendDinner: number;
  mobility: number;
  transport: number;
  totalValue: number;
  changeReason: string | null;
  paymentStatus: string;
  sentForReview: boolean;
  rhStatus: string;
  rhComment: string | null;
  rhActionBy: string | null;
  rhActionAt: Date | string | null;
  resubmitted: boolean;
  didNotAttend: boolean;
  didNotAttendReason: string | null;
  rhAdjusted: boolean;
  rhAdjustNote: string | null;
  updatedBy: string | null;
  updatedAt: Date | string | null;
}

export interface NotaParaControle {
  id: string;
  budgetActualId: string | null;
  oc: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  status: string;
  returnComment: string | null;
  paymentDate: string | null;
  approvedAt: Date | string | null;
  checkinAt: Date | string | null;
  checkinBy: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export interface EntradaDoControleRh {
  eventos: readonly EventoParaControle[];
  vagas: readonly VagaParaControle[];
  planejados: readonly PlanejadoParaControle[];
  realizados: readonly RealizadoParaControle[];
  notas: readonly NotaParaControle[];
  /** id → nome (colaboradores, funções e usuários) para a linha já vir com os nomes. */
  nomesDeColaboradores: ReadonlyMap<string, string>;
  nomesDeFuncoes: ReadonlyMap<string, string>;
  nomesDeUsuarios: ReadonlyMap<string, string>;
}

// ── Contrato de saída ───────────────────────────────────────────────────────
/** Status de UMA linha (os seis que a tela ordena e pinta). */
export type StatusDaPrestacao =
  | "planejamento_pendente"
  | "aguardando_prestacao"
  | "prestacao_recebida"
  | "devolvida_para_ajuste"
  | "aprovada_faturamento"
  | "recusada";

/** Filtros aceitos em `?status=`: os seis status + os quatro cards de métrica da tela. */
export type FiltroDeStatus = StatusDaPrestacao | "rh_action" | "col_action" | "nf_andamento" | "concluidos";

export const STATUS_DA_PRESTACAO: readonly StatusDaPrestacao[] = [
  "prestacao_recebida",
  "devolvida_para_ajuste",
  "planejamento_pendente",
  "aguardando_prestacao",
  "aprovada_faturamento",
  "recusada",
];

export const FILTROS_DE_STATUS: readonly FiltroDeStatus[] = [
  ...STATUS_DA_PRESTACAO,
  "rh_action",
  "col_action",
  "nf_andamento",
  "concluidos",
];

/** Linhas em que alguém ainda precisa agir (ordem de prioridade da tela). */
export const STATUS_ACIONAVEIS: readonly StatusDaPrestacao[] = ["planejamento_pendente", "aguardando_prestacao", "prestacao_recebida", "devolvida_para_ajuste"];
/** Linhas em que a ação é do RH. */
export const STATUS_DO_RH: readonly StatusDaPrestacao[] = ["prestacao_recebida", "planejamento_pendente"];

export interface LinhaDoControleRh {
  /** `pl-<planejado.id>` quando há Planejado; `ti-<vaga.id>` quando só existe a vaga. */
  id: string;
  status: StatusDaPrestacao;
  /** "RH", "Concluído" ou o nome do responsável da função. */
  responsavelAtual: string;
  /** ISO 8601 ou null — a tela calcula "há N dias" a partir daqui. */
  lastActivityDate: string | null;
  event: EventoParaControle;
  collaboratorId: string | null;
  collaboratorName: string | null;
  functionId: string | null;
  functionName: string | null;
  teamInclusion: { id: string; inclusionNumber: number; status: string; phase: string; emitsNf: boolean | null; createdAt: string | null } | null;
  planned: PlanejadoParaControle | null;
  actual: RealizadoParaControle | null;
  /** NF ligada ao Realizado raiz (uma por prestação), ou null. */
  invoice: NotaParaControle | null;
  /** O colaborador emite NF nesta escalação (isenção definida na escalação: emitsNf === false → false). */
  emiteNf: boolean;
  /** Realizado já libera a NF (isNfEligible). */
  nfElegivel: boolean;
  /** Nome de quem decidiu no RH (actual.rhActionBy), se houver. */
  rhActionByName: string | null;
  /** Ações pendentes do RH nesta linha. */
  rhPrecisaAgir: boolean;
}

export interface ContadoresDoControleRh {
  status: Record<StatusDaPrestacao, number>;
  nf: { pending: number; enviada: number; devolvida: number; aprovada: number; checkinPending: number; checkinDone: number };
  /** Quantas linhas pedem ação do RH (contador do cabeçalho). */
  rhAction: number;
  /**
   * Denominador da barra "Progresso geral" (e do "de N total" do card
   * Concluídos): linhas do recorte inteiro — SEM o filtro de `status` — que um
   * dia terão check-in (ver `linhaContaNoProgresso`). Antes o client calculava
   * isto sobre a lista recebida e, com um status ativo, precisava lembrar o
   * denominador anterior; agora vem pronto.
   */
  totalParaProgresso: number;
}

export interface ControleRh {
  itens: LinhaDoControleRh[];
  /** Contadores sobre TODAS as linhas do recorte (antes do filtro de `status`). */
  contadores: ContadoresDoControleRh;
  /** Funções presentes nas linhas (para o select de filtro), ordenadas por nome. */
  funcoes: { id: string; name: string }[];
  geradoEm: string;
}

// ── Cruzamento ──────────────────────────────────────────────────────────────
const iso = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const chave = (r: { eventId?: string | null; collaboratorId?: string | null; functionId?: string | null }) =>
  `${r.eventId}|${r.collaboratorId}|${r.functionId}`;

interface Decisao { status: StatusDaPrestacao; responsavelAtual: string; lastActivityDate: string | null }

function decidirPeloRealizado(
  actual: RealizadoParaControle | null,
  planned: PlanejadoParaControle,
  resolveResponsavel: (id?: string | null) => string,
  comVaga: boolean,
): Decisao {
  let status: StatusDaPrestacao = "aguardando_prestacao";
  let responsavelAtual = resolveResponsavel(planned.createdBy);
  let lastActivityDate = iso(planned.updatedAt);
  if (!actual) return { status, responsavelAtual, lastActivityDate };

  const rhStatus = actual.rhStatus || "pendente";
  if (rhStatus === "aprovado") {
    status = "aprovada_faturamento"; responsavelAtual = "Concluído";
    lastActivityDate = iso(actual.rhActionAt) ?? lastActivityDate;
  } else if (rhStatus === "rejeitado") {
    status = "recusada"; responsavelAtual = "Concluído";
    lastActivityDate = iso(actual.rhActionAt) ?? lastActivityDate;
  } else if (rhStatus === "devolvido") {
    status = "devolvida_para_ajuste";
    lastActivityDate = iso(actual.rhActionAt) ?? lastActivityDate;
    responsavelAtual = resolveResponsavel(comVaga ? (actual.updatedBy || planned.createdBy) : actual.updatedBy);
  } else if (actual.sentForReview) {
    status = "prestacao_recebida"; responsavelAtual = "RH";
    lastActivityDate = iso(actual.updatedAt) ?? lastActivityDate;
  } else if (comVaga) {
    // Só a linha COM vaga refina "aguardando" pelo Realizado (a órfã mantém o Planejado).
    status = "aguardando_prestacao";
    lastActivityDate = iso(actual.updatedAt) ?? lastActivityDate;
    responsavelAtual = resolveResponsavel(actual.updatedBy || planned.createdBy);
  }
  return { status, responsavelAtual, lastActivityDate };
}

/** O RH precisa agir nesta linha? (status do RH, NF enviada a aprovar ou check-in pendente.) */
export function rhPrecisaAgirNaLinha(l: Pick<LinhaDoControleRh, "status" | "invoice">): boolean {
  const inv = l.invoice;
  const needsRhCheckin = l.status === "aprovada_faturamento" && inv?.status === "aprovada" && !inv?.checkinAt;
  const needsRhNfApproval = l.status === "aprovada_faturamento" && inv?.status === "enviada";
  return STATUS_DO_RH.includes(l.status) || needsRhCheckin || needsRhNfApproval;
}

/** Aplica um dos filtros de `?status=` a uma linha já montada (mesma semântica dos cards da tela). */
export function linhaPassaNoFiltro(l: LinhaDoControleRh, filtro: FiltroDeStatus): boolean {
  const inv = l.invoice;
  switch (filtro) {
    case "rh_action":
      return l.rhPrecisaAgir;
    case "col_action": {
      const nfDevolvida = l.nfElegivel && inv?.status === "devolvida";
      const nfPendente = l.nfElegivel && (!inv || inv.status === "pendente") && l.emiteNf;
      return l.status === "aguardando_prestacao" || l.status === "devolvida_para_ajuste" || nfDevolvida || nfPendente;
    }
    case "nf_andamento": {
      const st = inv?.status || "pendente";
      return l.nfElegivel && ((st === "pendente" && l.emiteNf) || st === "enviada" || st === "devolvida");
    }
    case "concluidos":
      return l.status === "aprovada_faturamento" && inv?.status === "aprovada" && !!inv?.checkinAt;
    default:
      return l.status === filtro;
  }
}

/**
 * A linha entra no denominador do progresso? Exclui quem nunca terá check-in:
 * não compareceu (marcado no Planejado OU no Realizado), recusados, quem não
 * emite NF (definido na escalação) e NF recusada (terminal) — senão o progresso
 * nunca chega a 100%. Mesma regra que a tela aplicava em `contarParaProgresso`.
 */
export function linhaContaNoProgresso(l: Pick<LinhaDoControleRh, "status" | "emiteNf" | "invoice" | "planned" | "actual">): boolean {
  if (l.planned?.didNotAttend || l.actual?.didNotAttend) return false;
  if (l.status === "recusada") return false;
  if (!l.emiteNf) return false;
  if (l.invoice?.status === "recusada") return false;
  return true;
}

export function ehFiltroDeStatus(v: unknown): v is FiltroDeStatus {
  return typeof v === "string" && (FILTROS_DE_STATUS as readonly string[]).includes(v);
}

/**
 * Monta as linhas do Controle RH. `agora` existe para os testes (geradoEm).
 * O `filtro` é aplicado só em `itens`; `contadores` e `funcoes` refletem o
 * recorte inteiro, como os cards da tela (que contam antes de filtrar).
 */
export function montarControleRh(entrada: EntradaDoControleRh, filtro?: FiltroDeStatus | null, agora: Date = new Date()): ControleRh {
  const eventoPorId = new Map(entrada.eventos.map((e) => [e.id, e]));
  const vagasAtivas = entrada.vagas.filter((v) => !v.deletedAt && v.collaboratorId);

  const planejadoPorChave = new Map<string, PlanejadoParaControle>();
  for (const p of entrada.planejados) {
    const k = chave(p);
    if (!planejadoPorChave.has(k)) planejadoPorChave.set(k, p);
  }
  const realizadoPorPlanejado = new Map<string, RealizadoParaControle>();
  const realizadoPorChave = new Map<string, RealizadoParaControle>();
  for (const a of entrada.realizados) {
    if (a.splitParentId) continue;
    if (a.plannedId && !realizadoPorPlanejado.has(a.plannedId)) realizadoPorPlanejado.set(a.plannedId, a);
    const k = chave(a);
    if (!realizadoPorChave.has(k)) realizadoPorChave.set(k, a);
  }
  const realizadoDe = (p: PlanejadoParaControle): RealizadoParaControle | null =>
    realizadoPorPlanejado.get(p.id) || realizadoPorChave.get(chave(p)) || null;

  const notaPorRealizado = new Map<string, NotaParaControle>();
  for (const n of entrada.notas) if (n.budgetActualId) notaPorRealizado.set(n.budgetActualId, n);

  // Isenção de NF: grupo pequeno por (evento, colaborador) — a regra continua sendo a função compartilhada.
  const vagasPorEventoColab = new Map<string, VagaParaControle[]>();
  for (const v of vagasAtivas) {
    const k = `${v.eventId}|${v.collaboratorId}`;
    const g = vagasPorEventoColab.get(k);
    if (g) g.push(v); else vagasPorEventoColab.set(k, [v]);
  }
  const emiteNf = (eventId: string, collaboratorId: string | null, functionId: string | null): boolean => {
    if (!collaboratorId) return true;
    return !nfIsentaPorEscalacao(vagasPorEventoColab.get(`${eventId}|${collaboratorId}`), collaboratorId, functionId, eventId);
  };

  const nomeUsuario = (id?: string | null) => (id ? entrada.nomesDeUsuarios.get(id) ?? null : null);
  const resolveResponsavel = (id?: string | null): string => nomeUsuario(id) ?? "Responsável da função";

  const linhas: LinhaDoControleRh[] = [];
  const planejadosUsados = new Set<string>();
  const idsVistos = new Set<string>();

  const montar = (base: Omit<LinhaDoControleRh, "collaboratorName" | "functionName" | "invoice" | "emiteNf" | "nfElegivel" | "rhActionByName" | "rhPrecisaAgir">): LinhaDoControleRh => {
    const invoice = base.actual ? notaPorRealizado.get(base.actual.id) ?? null : null;
    const parcial = {
      ...base,
      collaboratorName: base.collaboratorId ? entrada.nomesDeColaboradores.get(base.collaboratorId) ?? null : null,
      functionName: base.functionId ? entrada.nomesDeFuncoes.get(base.functionId) ?? null : null,
      invoice,
      emiteNf: emiteNf(base.event.id, base.collaboratorId, base.functionId),
      nfElegivel: base.actual ? isNfEligible(base.actual) : false,
      rhActionByName: nomeUsuario(base.actual?.rhActionBy),
    };
    return { ...parcial, rhPrecisaAgir: rhPrecisaAgirNaLinha(parcial) };
  };

  for (const v of vagasAtivas) {
    const event = eventoPorId.get(v.eventId);
    if (!event) continue;
    const teamInclusion = { id: v.id, inclusionNumber: v.inclusionNumber, status: v.status, phase: v.phase, emitsNf: v.emitsNf, createdAt: iso(v.createdAt) };
    const planned = planejadoPorChave.get(chave(v));
    if (!planned) {
      linhas.push(montar({
        id: `ti-${v.id}`, status: "planejamento_pendente", responsavelAtual: "RH", lastActivityDate: iso(v.createdAt),
        event, collaboratorId: v.collaboratorId, functionId: v.functionId, teamInclusion, planned: null, actual: null,
      }));
      continue;
    }
    const id = `pl-${planned.id}`;
    if (idsVistos.has(id)) continue;
    idsVistos.add(id);
    planejadosUsados.add(planned.id);
    const actual = realizadoDe(planned);
    const d = decidirPeloRealizado(actual, planned, resolveResponsavel, true);
    linhas.push(montar({
      id, ...d, event, collaboratorId: planned.collaboratorId, functionId: planned.functionId, teamInclusion, planned, actual,
    }));
  }

  for (const planned of entrada.planejados) {
    if (planejadosUsados.has(planned.id)) continue;
    const event = eventoPorId.get(planned.eventId);
    if (!event) continue;
    const id = `pl-${planned.id}`;
    if (idsVistos.has(id)) continue;
    idsVistos.add(id);
    const actual = realizadoDe(planned);
    const d = decidirPeloRealizado(actual, planned, resolveResponsavel, false);
    linhas.push(montar({
      id, ...d, event, collaboratorId: planned.collaboratorId, functionId: planned.functionId, teamInclusion: null, planned, actual,
    }));
  }

  const prioridade = new Map(STATUS_DA_PRESTACAO.map((s, i) => [s, i]));
  linhas.sort((a, b) => {
    const pa = prioridade.get(a.status) ?? 99;
    const pb = prioridade.get(b.status) ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.lastActivityDate ? Date.parse(b.lastActivityDate) : 0) - (a.lastActivityDate ? Date.parse(a.lastActivityDate) : 0);
  });

  // Contadores (sobre todas as linhas, como os cards da tela)
  const status = Object.fromEntries(STATUS_DA_PRESTACAO.map((s) => [s, 0])) as Record<StatusDaPrestacao, number>;
  for (const l of linhas) status[l.status] += 1;

  const realizadosElegiveis = entrada.realizados.filter((a) => isNfEligible(a) && !a.splitParentId);
  const idsElegiveis = new Set(realizadosElegiveis.map((a) => a.id));
  const notasRelevantes = entrada.notas.filter((n) => !!n.budgetActualId && idsElegiveis.has(n.budgetActualId));
  const enviadas = new Set(notasRelevantes.filter((n) => n.status !== "pendente").map((n) => n.budgetActualId));
  const nf = {
    pending: realizadosElegiveis.filter((a) => !enviadas.has(a.id) && emiteNf(a.eventId, a.collaboratorId, a.functionId)).length,
    enviada: notasRelevantes.filter((n) => n.status === "enviada").length,
    devolvida: notasRelevantes.filter((n) => n.status === "devolvida").length,
    aprovada: notasRelevantes.filter((n) => n.status === "aprovada").length,
    checkinPending: notasRelevantes.filter((n) => n.status === "aprovada" && !n.checkinAt).length,
    checkinDone: notasRelevantes.filter((n) => n.status === "aprovada" && !!n.checkinAt).length,
  };

  const funcoesMap = new Map<string, string>();
  for (const l of linhas) if (l.functionId) funcoesMap.set(l.functionId, l.functionName ?? "-");
  const funcoes = Array.from(funcoesMap, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return {
    itens: filtro ? linhas.filter((l) => linhaPassaNoFiltro(l, filtro)) : linhas,
    contadores: {
      status,
      nf,
      rhAction: linhas.filter((l) => l.rhPrecisaAgir).length,
      totalParaProgresso: linhas.filter(linhaContaNoProgresso).length,
    },
    funcoes,
    geradoEm: agora.toISOString(),
  };
}
