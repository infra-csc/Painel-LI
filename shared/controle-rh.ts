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
 *    (ambas em shared/prestacao-rules — a MESMA regra da tela de Notas Fiscais);
 *  - 28/10 (revisão, R7): no fluxo novo, cada DIVISÃO com colaborador próprio
 *    (o substituto da "Dividir escalação") é uma linha própria (`dv-<id>`):
 *    OC, NF e pago dela na trilha, nos prazos e nos contadores de NF. A
 *    presença e a confirmação seguem no titular (sem prazo de presença aqui).
 *
 * Funções puras — sem I/O.
 */
import { isNfEligible, nfIsentaPorEscalacao, type EscalacaoLike } from "./prestacao-rules";
import { contarNaTrilha, posicaoNaTrilha, type ContagemDaTrilha, type PosicaoNaTrilha } from "./trilha-honorarios";
import { DATA_DE_CORTE_PADRAO, ehEventoLegado, eventoNoRecorte, type RecorteDoLegado } from "./legado-honorarios";
import { inclusaoDaPrestacao, periodoDaPrestacao } from "./presenca";
import { contarPrazos, prazoDaPrestacao, type ContagemDosPrazos, type PrazoDaPrestacao, type PrazosDosHonorarios } from "./prazos-honorarios";

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
  /** 28/10 (Fase 3): o período da escala — o último dia de trabalho conta os prazos. */
  scheduleStartDate?: string | null;
  scheduleEndDate?: string | null;
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
  /** 28/10 (Fase 2): OC registrada e data do pagamento — a trilha marca OC emitida e Pago. */
  ocNumero?: string | null;
  pagoEm?: string | null;
  /** 28/10 (Fase 3, prazos): os dias trabalhados, o check-out final e o registro da OC. */
  workedDays?: (string | null)[] | null;
  checkoutFinalEm?: Date | string | null;
  ocRegistradaEm?: Date | string | null;
  ocData?: string | null;
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
  /** 28/10 (Fase 3): o histórico (enviado/devolvido) conta o prazo da nota. */
  history?: readonly { type?: string | null; at?: string | null }[] | null;
}

/** A confirmação do colaborador e a contestação dele (28/10, Fase 3). */
export interface ConfirmacaoParaControle {
  actualId: string;
  confirmadoEm: Date | string;
  contestacao: string | null;
  contestacaoResposta: string | null;
  contestacaoRespondidaEm: Date | string | null;
  contestacaoRespondidaPorNome: string | null;
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
  /**
   * Data de corte do legado (26/10, `system_settings.honorarios_data_corte`):
   * evento que TERMINA antes dela é legado. Padrão: 01/11/2026.
   */
  dataDeCorte?: string;
  /** Recorte pedido (padrão "todos" — a rota manda "fluxo_novo" quando a tela não escolhe). */
  recorte?: RecorteDoLegado;
  /** Linhas do legado concluídas fora do fluxo, pelo id da linha (`pl-…`/`ti-…`). */
  conclusoes?: ReadonlyMap<string, ConclusaoForaDoFluxo>;
  /**
   * 28/10 (Fase 3, prazos e cobranças): os dias de cada etapa, o "hoje" de
   * Brasília e as confirmações dos colaboradores (pelo id da prestação). Sem
   * `prazos`, as linhas saem sem prazo (o contrato de antes).
   */
  prazos?: PrazosDosHonorarios;
  hoje?: string;
  confirmacoes?: ReadonlyMap<string, ConfirmacaoParaControle>;
}

/** A contestação do colaborador na linha (28/10): aberta até o DP responder. */
export interface ContestacaoDaLinha {
  texto: string;
  em: string | null;
  respondida: boolean;
  resposta: string | null;
  respondidaEm: string | null;
  respondidaPorNome: string | null;
}

/** "Concluir em lote" do legado: quem, quando e por quê (26/10). */
export interface ConclusaoForaDoFluxo {
  motivo: string;
  porNome: string | null;
  em: string | null;
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
  /** "DP", "Concluído" ou o nome do responsável da função. */
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
  /** Ações pendentes do DP nesta linha (o nome do campo é do contrato antigo). */
  rhPrecisaAgir: boolean;
  /** Onde o registro está na trilha única do honorário (shared/trilha-honorarios). */
  trilha: PosicaoNaTrilha;
  /** O evento terminou antes da data de corte (legado — só leitura no Painel). */
  legado: boolean;
  /** Linha do legado concluída fora do fluxo ("Concluir em lote"), ou null. */
  conclusaoForaDoFluxo: ConclusaoForaDoFluxo | null;
  /**
   * 28/10 (Fase 3): o prazo da etapa atual — quem deve agir, quando vence e a
   * situação (shared/prazos-honorarios). Null no legado e sem prestação.
   */
  prazo: PrazoDaPrestacao | null;
  /** Contestação do colaborador (fluxo novo), aberta ou respondida. */
  contestacao: ContestacaoDaLinha | null;
  /**
   * 28/10 (R7): linha de DIVISÃO da vaga (o substituto) — a prestação do
   * titular e o nome dele; null nas linhas comuns. Opcional para o contrato antigo.
   */
  divisaoDe?: { actualId: string; titularNome: string | null } | null;
}

export interface ContadoresDoControleRh {
  status: Record<StatusDaPrestacao, number>;
  nf: { pending: number; enviada: number; devolvida: number; aprovada: number; checkinPending: number; checkinDone: number };
  /** Quantas linhas pedem ação do DP (contador do cabeçalho). */
  rhAction: number;
  /**
   * Denominador da barra "Progresso geral" (e do "de N total" do card
   * Concluídos): linhas do recorte inteiro — SEM o filtro de `status` — que um
   * dia terão check-in (ver `linhaContaNoProgresso`). Antes o client calculava
   * isto sobre a lista recebida e, com um status ativo, precisava lembrar o
   * denominador anterior; agora vem pronto.
   */
  totalParaProgresso: number;
  /** Quantos registros estão em cada etapa da trilha única (recorte pedido). */
  trilha: ContagemDaTrilha;
  /**
   * Linhas de cada recorte do legado, ANTES de aplicar o recorte pedido — as
   * contagens das abas "Fluxo novo" × "Legado" do Painel de honorários.
   */
  recortes: { fluxoNovo: number; legado: number; legadoConcluido: number };
  /** 28/10 (Fase 3): atrasados e "vence hoje" do recorte (pelo pior prazo de cada linha). */
  prazos: ContagemDosPrazos;
  /** Contestações dos colaboradores ainda sem resposta do DP. */
  contestacoesAbertas: number;
}

export interface ControleRh {
  itens: LinhaDoControleRh[];
  /** Contadores sobre TODAS as linhas do recorte (antes do filtro de `status`). */
  contadores: ContadoresDoControleRh;
  /** Funções presentes nas linhas (para o select de filtro), ordenadas por nome. */
  funcoes: { id: string; name: string }[];
  /** Data de corte do legado usada neste recorte (AAAA-MM-DD). */
  dataDeCorte: string;
  /** Recorte aplicado. */
  recorte: RecorteDoLegado;
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
  // 26/10 (Honorários, Fase 0): com a pré-aprovação, o Planejado é gravado
  // ANTES do envio ao Realizado. Sem prestação, a vez ainda é do DP — pré-
  // aprovar e liberar para a Produção —, não do responsável da função.
  if (!actual && comVaga && !planned.didNotAttend) return { status: "planejamento_pendente", responsavelAtual: "DP", lastActivityDate };
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
    status = "prestacao_recebida"; responsavelAtual = "DP";
    lastActivityDate = iso(actual.updatedAt) ?? lastActivityDate;
  } else if (comVaga) {
    // Só a linha COM vaga refina "aguardando" pelo Realizado (a órfã mantém o Planejado).
    status = "aguardando_prestacao";
    lastActivityDate = iso(actual.updatedAt) ?? lastActivityDate;
    responsavelAtual = resolveResponsavel(actual.updatedBy || planned.createdBy);
  }
  return { status, responsavelAtual, lastActivityDate };
}

/**
 * O DP precisa agir nesta linha? (status do DP, NF enviada a aprovar,
 * lançamento pendente — e, 28/10, contestação do colaborador sem resposta.)
 * Concluída fora do fluxo: não.
 */
export function rhPrecisaAgirNaLinha(l: Pick<LinhaDoControleRh, "status" | "invoice"> & { conclusaoForaDoFluxo?: ConclusaoForaDoFluxo | null; contestacao?: ContestacaoDaLinha | null }): boolean {
  if (l.conclusaoForaDoFluxo) return false;
  if (l.contestacao && !l.contestacao.respondida) return true;
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
      if (l.conclusaoForaDoFluxo) return false;
      const nfDevolvida = l.nfElegivel && inv?.status === "devolvida";
      const nfPendente = l.nfElegivel && (!inv || inv.status === "pendente") && l.emiteNf;
      return l.status === "aguardando_prestacao" || l.status === "devolvida_para_ajuste" || nfDevolvida || nfPendente;
    }
    case "nf_andamento": {
      if (l.conclusaoForaDoFluxo) return false;
      const st = inv?.status || "pendente";
      return l.nfElegivel && ((st === "pendente" && l.emiteNf) || st === "enviada" || st === "devolvida");
    }
    case "concluidos":
      if (l.conclusaoForaDoFluxo) return true;
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
export function linhaContaNoProgresso(l: Pick<LinhaDoControleRh, "status" | "emiteNf" | "invoice" | "planned" | "actual"> & { conclusaoForaDoFluxo?: ConclusaoForaDoFluxo | null }): boolean {
  if (l.conclusaoForaDoFluxo) return false;
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

  // 28/10 (R7): a divisão com colaborador próprio, no fluxo novo, é prestação própria.
  const divisaoDoFluxoNovo = (a: RealizadoParaControle): boolean => {
    if (!a.splitParentId || !a.collaboratorId || a.didNotAttend) return false;
    const ev = eventoPorId.get(a.eventId);
    return !!ev && !ehEventoLegado(ev.endDate, entrada.dataDeCorte ?? DATA_DE_CORTE_PADRAO);
  };
  const realizadoPorId = new Map(entrada.realizados.map((a) => [a.id, a]));

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

  const todas: LinhaDoControleRh[] = [];
  const planejadosUsados = new Set<string>();
  const idsVistos = new Set<string>();

  const dataDeCorte = entrada.dataDeCorte ?? DATA_DE_CORTE_PADRAO;
  const recorte: RecorteDoLegado = entrada.recorte ?? "todos";

  const hoje = entrada.hoje ?? null;
  /** Último dia de trabalho da prestação: a MESMA fonte dos dias da presença (dias trabalhados → escala → evento). */
  const ultimoDia = (actual: RealizadoParaControle, event: EventoParaControle): string | null => {
    const vagas = actual.collaboratorId ? vagasPorEventoColab.get(`${actual.eventId}|${actual.collaboratorId}`) ?? [] : [];
    return periodoDaPrestacao(actual, inclusaoDaPrestacao(actual, vagas) ?? null, event).fim;
  };
  const contestacaoDe = (actualId: string): ContestacaoDaLinha | null => {
    const c = entrada.confirmacoes?.get(actualId);
    if (!c?.contestacao) return null;
    return {
      texto: c.contestacao, em: iso(c.confirmadoEm), respondida: !!c.contestacaoRespondidaEm,
      resposta: c.contestacaoResposta, respondidaEm: iso(c.contestacaoRespondidaEm), respondidaPorNome: c.contestacaoRespondidaPorNome,
    };
  };

  const montar = (base: Omit<LinhaDoControleRh, "collaboratorName" | "functionName" | "invoice" | "emiteNf" | "nfElegivel" | "rhActionByName" | "rhPrecisaAgir" | "trilha" | "legado" | "conclusaoForaDoFluxo" | "prazo" | "contestacao" | "divisaoDe"> & { divisaoDe?: LinhaDoControleRh["divisaoDe"] }): LinhaDoControleRh => {
    const invoice = base.actual ? notaPorRealizado.get(base.actual.id) ?? null : null;
    const legado = ehEventoLegado(base.event.endDate, dataDeCorte);
    // Só o legado é concluído fora do fluxo: uma conclusão gravada para um
    // evento que voltou ao fluxo novo (a data de corte mudou) não vale.
    const conclusaoForaDoFluxo = legado ? entrada.conclusoes?.get(base.id) ?? null : null;
    const emite = emiteNf(base.event.id, base.collaboratorId, base.functionId);
    // 28/10 (Fase 3): prazo e contestação só no fluxo novo, com a prestação.
    const novoComPrestacao = !legado && !!base.actual;
    // 28/10 (R7): a divisão não tem presença própria (fica no titular) — sem prazo de confirmação/check-out.
    const ehDivisao = !!base.divisaoDe;
    const prazo = novoComPrestacao && entrada.prazos && hoje ? prazoDaPrestacao({
      hoje, prazos: entrada.prazos, legado, emiteNf: emite,
      ultimoDia: ehDivisao ? null : ultimoDia(base.actual!, base.event),
      confirmado: ehDivisao || (entrada.confirmacoes?.has(base.actual!.id) ?? false),
      realizado: base.actual, nota: invoice,
    }) : null;
    const contestacao = novoComPrestacao && !base.actual!.didNotAttend ? contestacaoDe(base.actual!.id) : null;
    const parcial = {
      ...base,
      divisaoDe: base.divisaoDe ?? null,
      collaboratorName: base.collaboratorId ? entrada.nomesDeColaboradores.get(base.collaboratorId) ?? null : null,
      functionName: base.functionId ? entrada.nomesDeFuncoes.get(base.functionId) ?? null : null,
      invoice,
      emiteNf: emite,
      nfElegivel: base.actual ? isNfEligible(base.actual) : false,
      rhActionByName: nomeUsuario(base.actual?.rhActionBy),
      legado,
      conclusaoForaDoFluxo,
      prazo,
      contestacao,
      trilha: posicaoNaTrilha({
        planejado: base.planned, realizado: base.actual, nota: invoice, emiteNf: emite,
        concluidoForaDoFluxo: !!conclusaoForaDoFluxo, legado,
      }),
    };
    return { ...parcial, rhPrecisaAgir: rhPrecisaAgirNaLinha(parcial) };
  };

  for (const v of vagasAtivas) {
    const event = eventoPorId.get(v.eventId);
    if (!event) continue;
    const teamInclusion = { id: v.id, inclusionNumber: v.inclusionNumber, status: v.status, phase: v.phase, emitsNf: v.emitsNf, createdAt: iso(v.createdAt) };
    const planned = planejadoPorChave.get(chave(v));
    if (!planned) {
      todas.push(montar({
        id: `ti-${v.id}`, status: "planejamento_pendente", responsavelAtual: "DP", lastActivityDate: iso(v.createdAt),
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
    todas.push(montar({
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
    todas.push(montar({
      id, ...d, event, collaboratorId: planned.collaboratorId, functionId: planned.functionId, teamInclusion: null, planned, actual,
    }));
  }

  // 28/10 (R7): as divisões do fluxo novo — uma linha por substituto, com a decisão do DP dela.
  for (const a of entrada.realizados) {
    if (!divisaoDoFluxoNovo(a)) continue;
    const event = eventoPorId.get(a.eventId)!;
    const titular = realizadoPorId.get(a.splitParentId!);
    const rh = a.rhStatus || "pendente";
    const d: Decisao = rh === "aprovado" ? { status: "aprovada_faturamento", responsavelAtual: "Concluído", lastActivityDate: iso(a.rhActionAt) ?? iso(a.updatedAt) }
      : rh === "rejeitado" ? { status: "recusada", responsavelAtual: "Concluído", lastActivityDate: iso(a.rhActionAt) ?? iso(a.updatedAt) }
      : rh === "devolvido" ? { status: "devolvida_para_ajuste", responsavelAtual: resolveResponsavel(a.updatedBy), lastActivityDate: iso(a.rhActionAt) ?? iso(a.updatedAt) }
      : a.sentForReview ? { status: "prestacao_recebida", responsavelAtual: "DP", lastActivityDate: iso(a.updatedAt) }
      : { status: "aguardando_prestacao", responsavelAtual: resolveResponsavel(a.updatedBy), lastActivityDate: iso(a.updatedAt) };
    todas.push(montar({
      id: `dv-${a.id}`, ...d, event, collaboratorId: a.collaboratorId, functionId: a.functionId, teamInclusion: null, planned: null, actual: a,
      divisaoDe: { actualId: a.splitParentId!, titularNome: titular?.collaboratorId ? entrada.nomesDeColaboradores.get(titular.collaboratorId) ?? null : null },
    }));
  }

  const prioridade = new Map(STATUS_DA_PRESTACAO.map((s, i) => [s, i]));
  todas.sort((a, b) => {
    const pa = prioridade.get(a.status) ?? 99;
    const pb = prioridade.get(b.status) ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.lastActivityDate ? Date.parse(b.lastActivityDate) : 0) - (a.lastActivityDate ? Date.parse(a.lastActivityDate) : 0);
  });

  // Recorte do legado (26/10): as abas contam ANTES de recortar; os demais
  // contadores valem para o recorte pedido.
  const recortes = { fluxoNovo: 0, legado: 0, legadoConcluido: 0 };
  for (const l of todas) {
    if (!l.legado) { recortes.fluxoNovo += 1; continue; }
    recortes.legado += 1;
    if (l.conclusaoForaDoFluxo) recortes.legadoConcluido += 1;
  }
  const linhas = todas.filter((l) => eventoNoRecorte(l.legado, recorte));
  const eventosNoRecorte = new Set(entrada.eventos.filter((e) => eventoNoRecorte(ehEventoLegado(e.endDate, dataDeCorte), recorte)).map((e) => e.id));

  // Contadores (sobre todas as linhas do recorte, como os cards da tela)
  const status = Object.fromEntries(STATUS_DA_PRESTACAO.map((s) => [s, 0])) as Record<StatusDaPrestacao, number>;
  for (const l of linhas) status[l.status] += 1;

  // 28/10 (R7): as divisões do fluxo novo têm nota própria — contam também.
  const realizadosElegiveis = entrada.realizados.filter((a) => isNfEligible(a) && (!a.splitParentId || divisaoDoFluxoNovo(a)) && eventosNoRecorte.has(a.eventId));
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
      trilha: contarNaTrilha(linhas.map((l) => l.trilha)),
      recortes,
      prazos: contarPrazos(linhas.map((l) => l.prazo)),
      contestacoesAbertas: linhas.filter((l) => l.contestacao && !l.contestacao.respondida).length,
    },
    funcoes,
    dataDeCorte,
    recorte,
    geradoEm: agora.toISOString(),
  };
}
