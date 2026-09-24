/**
 * Guardas PURAS da vaga (team_inclusions) — quem pode editar, como o status de
 * logística é derivado e o que um PATCH pode mudar (23/09).
 *
 * Extraídas de server/routes.ts para terem teste sem banco e para o PATCH, o
 * /confirm, as trocas e as rotas de passagem/hospedagem usarem UMA regra. Sem
 * imports de storage/db de propósito: tudo aqui recebe dados e devolve decisão.
 */
import { normalizeRole } from "@shared/roles";
import { CONFIRMED_STATUSES, ehStatusConfirmado, normalizarStatus, podeTransitar, temLogisticaComprada, type StatusDaVaga } from "@shared/vaga-status";
import { listarDiasDeTrabalho } from "@shared/dias-de-trabalho";

// ── Quem edita ───────────────────────────────────────────────────────────────

export interface AtorDaVaga { id: string; role?: string | null }
export interface FuncaoDaVaga { userId?: string | null }

/**
 * Pode mexer na vaga (PATCH, /confirm, abrir troca)? Admin, produção e compras
 * (grupo cadastro) sempre; fora deles, só quem é RESPONSÁVEL da função —
 * cadastrado em function_managers (`ehResponsavelDaFuncao`) ou no campo legado
 * functions.userId. Antes esta checagem existia em duas cópias (PATCH e
 * /confirm) e faltava na abertura de troca.
 */
export function podeEditarVaga(ator: AtorDaVaga, funcao: FuncaoDaVaga | null | undefined, ehResponsavelDaFuncao: boolean): boolean {
  const papel = normalizeRole(ator.role);
  if (papel === "admin" || papel === "production" || papel === "purchasing") return true;
  if (ehResponsavelDaFuncao) return true;
  return !!funcao?.userId && funcao.userId === ator.id;
}

/** Valor da diária é dinheiro: só Financeiro (RH) e administrador. */
export function podeMudarValorDaDiaria(ator: AtorDaVaga): boolean {
  const papel = normalizeRole(ator.role);
  return papel === "admin" || papel === "financial";
}

// ── Status derivado da logística ─────────────────────────────────────────────

export interface PassagemDaVaga { ticketStatus?: string | null }
export interface HospedagemDaVaga { hotelName?: string | null; hotelStatus?: string | null }

/** A passagem conta como registrada? Qualquer linha viva que não esteja cancelada. */
export function passagemConta(t: PassagemDaVaga | null | undefined): boolean {
  return !!t && t.ticketStatus !== "cancelada";
}

/** A hospedagem conta como registrada? Precisa de hotel e não estar cancelada (mesma regra da tela). */
export function hospedagemConta(a: HospedagemDaVaga | null | undefined): boolean {
  return !!a && !!(a.hotelName && String(a.hotelName).trim()) && a.hotelStatus !== "cancelada";
}

export interface EntradaDeLogistica {
  statusAtual: string | null | undefined;
  temPassagem: boolean;
  temHospedagem: boolean;
}

/**
 * Status da vaga DERIVADO do que Compras registrou. Antes o client mandava
 * `passagem_comprada`/`hospedagem_comprada` pelo PATCH depois de criar a
 * passagem/hospedagem — dois pedidos, e o segundo podia falhar ou vir errado.
 *
 * Regras:
 *  - só age sobre escalação CONFIRMADA (escalado, passagem, hospedagem,
 *    aprovacao, *_comprada); nunca sobre aprovado/concluído/cancelado nem sobre
 *    vaga só salva ou em Validação de Escala;
 *  - passagem + hospedagem → hospedagem_passagem_comprada; só passagem →
 *    passagem_comprada; só hospedagem → hospedagem_comprada;
 *  - sem nada registrado não REGRIDE (o registro apagado não desfaz o status —
 *    isso é decisão humana, via troca/cancelamento);
 *  - respeita `podeTransitar`: se a máquina recusa (ex.: passagem_comprada →
 *    hospedagem_comprada), fica como está.
 * Devolve o novo status, ou null quando nada muda.
 */
export function statusDeLogistica(e: EntradaDeLogistica): StatusDaVaga | null {
  const bruto = e.statusAtual ?? "";
  // Legados de confirmação (aguardando_passagem…) contam como confirmados para
  // leitura; a comparação usa o canônico equivalente.
  if (!ehStatusConfirmado(bruto)) return null;
  const atual = normalizarStatus(bruto) ?? "";
  if (atual === "aprovado" || atual === "concluido" || atual === "aguardando_producao") return null;
  let alvo: StatusDaVaga | null = null;
  if (e.temPassagem && e.temHospedagem) alvo = "hospedagem_passagem_comprada";
  else if (e.temPassagem) alvo = temLogisticaComprada(atual) && atual !== "passagem_comprada" ? null : "passagem_comprada";
  else if (e.temHospedagem) alvo = temLogisticaComprada(atual) && atual !== "hospedagem_comprada" ? null : "hospedagem_comprada";
  if (!alvo || alvo === bruto) return null;
  return podeTransitar(bruto, alvo).ok ? alvo : null;
}

// ── Troca direta de colaborador ──────────────────────────────────────────────

/**
 * Trocar o colaborador direto (PATCH/confirm) é proibido quando a escalação já
 * foi confirmada, quando há compra registrada no status ou quando existe
 * passagem/hospedagem viva — nesses casos o caminho é a Solicitação de Troca,
 * que revisa a logística. Devolve o motivo (403) ou null.
 */
export function motivoParaNaoTrocarColaborador(vaga: { status?: string | null }, temPassagemOuHospedagem: boolean): string | null {
  const status = vaga.status ?? "";
  if (CONFIRMED_STATUSES.has(status) || ehStatusConfirmado(status) || temLogisticaComprada(status)) {
    return "Não é possível alterar o colaborador diretamente após a escalação ser confirmada. Use o fluxo de Solicitação de Troca.";
  }
  if (temPassagemOuHospedagem) {
    return "Esta vaga já tem passagem ou hospedagem registrada — troque o colaborador pela Solicitação de Troca, para Compras revisar a logística.";
  }
  return null;
}

// ── Dias de trabalho ─────────────────────────────────────────────────────────

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida a lista de dias do PATCH: todos "YYYY-MM-DD", sem repetição e dentro
 * do período da escala (quando há período). Devolve a lista normalizada
 * (ordenada) ou a mensagem de erro (400). `dailyRates` NUNCA vem do corpo — é
 * sempre o tamanho desta lista.
 */
export function validarDiasDeTrabalho(
  workDays: unknown,
  scheduleStartDate: string | null | undefined,
  scheduleEndDate: string | null | undefined,
): { ok: true; dias: string[] } | { ok: false; erro: string } {
  if (!Array.isArray(workDays)) return { ok: false, erro: "Dias de trabalho devem ser uma lista de datas." };
  const dias = Array.from(new Set(workDays.map((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? "").slice(0, 10))))).sort();
  if (dias.some((d) => !ISO_DIA.test(d))) return { ok: false, erro: "Dia de trabalho em formato inválido (use AAAA-MM-DD)." };
  if (scheduleStartDate && scheduleEndDate) {
    const periodo = new Set(listarDiasDeTrabalho(scheduleStartDate, scheduleEndDate));
    if (periodo.size === 0) return { ok: false, erro: "Período da escala inválido — confira início e fim." };
    const fora = dias.filter((d) => !periodo.has(d));
    if (fora.length > 0) {
      return { ok: false, erro: `Dia(s) fora do período da escala: ${fora.map((d) => d.split("-").reverse().join("/")).join(", ")}.` };
    }
  }
  return { ok: true, dias };
}

// ── Campos de fluxo no PATCH ─────────────────────────────────────────────────

export const CAMPOS_DE_FLUXO_DA_VAGA = ["status", "previousStatus", "phase"] as const;

/**
 * O corpo do PATCH ainda manda status/fase (client antigo)? Se o que ele pede
 * é EXATAMENTE o que a vaga já tem, é um no-op (a rota de passagem/hospedagem
 * já derivou o status) e pode ser ignorado; se pede outra coisa, o cliente
 * precisa usar a rota dedicada — devolve a mensagem (400).
 */
export function motivoParaRecusarFluxoNoPatch(body: Record<string, unknown>, vaga: { status?: string | null; phase?: string | null }): string | null {
  const status = body.status;
  const phase = body.phase;
  if (status === undefined && phase === undefined && body.previousStatus === undefined) return null;
  const statusIgual = status === undefined || status === vaga.status;
  const faseIgual = phase === undefined || phase === vaga.phase;
  if (statusIgual && faseIgual && body.previousStatus === undefined) return null;
  if (status === "cancelado") return "Para cancelar a escalação use POST /api/team-inclusions/:id/cancel.";
  if (status === "reaberto") return "Para reativar a escalação use PATCH /api/team-inclusions/:id/reactivate.";
  return "Status e fase da escalação mudam pelas rotas dedicadas (confirm, cancel, reactivate, approve-production) ou são derivados pelo servidor ao registrar passagem/hospedagem — não pelo PATCH.";
}
