/**
 * Janela do PEDIDO DE AJUSTE — até quando a área ainda pode pedir mudança
 * numa vaga.
 *
 * Regra do dono (26/08): "pedido de ajuste pode ser feito mesmo após escalado,
 * no modal de escalação, até comprar a passagem; e se não tiver passagem pode
 * ser feito sempre". Ou seja: o fim da validação NÃO fecha mais a porta. O que
 * fecha é a COMPRA DA PASSAGEM — a partir dali mudar dia/horário custa dinheiro
 * e vira assunto da logística.
 *
 * Duas portas, cada uma na sua tela (decisão do dono, 26/08):
 *  - vaga ainda em validação (`phase = 'sugestao'`) → tela de Validação;
 *  - vaga JÁ ESCALADA (qualquer fase depois) → modal de Escalação. Na Validação
 *    a área só pede "mais uma pessoa" (pedido de inclusão), não ajuste de quem
 *    já está escalado.
 *
 * Quem é bloqueado pela compra: a ÁREA. O administrador continua podendo abrir
 * o pedido — mesma escolha já feita para evento encerrado (`event-window.ts`),
 * para não deixar o acerto sem saída.
 *
 * Mora em `shared/` porque servidor e client precisam da MESMA resposta: o
 * servidor é a trava (403) e a tela só esconde/explica o que a API vai recusar.
 * Arquivo próprio, e não dentro de `scaling-validation-rules`, porque isto não
 * é a máquina de estados da sugestão: é a janela de tempo do pedido cruzada com
 * o estado da passagem.
 */
import { SUGESTAO_PHASE, SUGESTAO_STATUS } from "./scaling-validation-rules";

/**
 * `tickets.ticket_status` que significam "já comprada". 'pendente' é pedido
 * ainda não comprado e 'cancelada' voltou a ficar livre — nenhum dos dois trava.
 */
export const PURCHASED_TICKET_STATUSES = ["comprada", "confirmada"] as const;

/** Motivo do bloqueio — a tela mostra a mensagem, o servidor devolve no 403. */
export type ChangeWindowBlock =
  | "passagem_comprada"
  | "vaga_cancelada"
  | "vaga_excluida";

export const CHANGE_WINDOW_BLOCK_MSG: Record<ChangeWindowBlock, string> = {
  passagem_comprada:
    "A passagem já foi EMITIDA — mudança de data agora tem custo e passa pela logística. Fale com a logística ou com o administrador.",
  vaga_cancelada: "Vaga cancelada — não há o que ajustar.",
  vaga_excluida: "Vaga excluída da escala — não há o que ajustar.",
};

/** O mínimo que a regra precisa saber da vaga. */
export interface InclusionForChangeWindow {
  phase?: string | null;
  status?: string | null;
  deletedAt?: Date | string | null;
}

/** O mínimo que a regra precisa saber da passagem. */
export interface TicketForChangeWindow {
  /** Carimbo de "emitida" — o ato explícito de quem compra. Manda em tudo. */
  emittedAt?: Date | string | null;
  ticketStatus?: string | null;
  purchaseDate?: Date | string | null;
  purchaseOrderNumber?: string | null;
  locator?: string | null;
}

/**
 * A passagem já foi comprada?
 *
 * Não olha só o `ticketStatus`: na prática a logística às vezes preenche a
 * compra (data, OC, localizador) e esquece de mexer no status. Qualquer um
 * desses sinais conta como comprada — errar para o lado de "já comprou" só
 * manda a área falar com a logística; errar para o outro lado deixa alguém
 * remarcar um voo pago achando que está tudo bem.
 *
 * Sem passagem nenhuma (null/undefined) → false: "se não tiver, pode sempre".
 */
export function isTicketPurchased(ticket: TicketForChangeWindow | null | undefined): boolean {
  if (!ticket) return false;
  // O carimbo de EMITIDA vem antes de qualquer inferência: é alguém dizendo
  // "o bilhete saiu", não um palpite a partir de campo preenchido.
  if (ticket.emittedAt) return true;
  const status = (ticket.ticketStatus ?? "").trim().toLowerCase();
  if ((PURCHASED_TICKET_STATUSES as readonly string[]).includes(status)) return true;
  if (status === "cancelada") return false; // compra desfeita: volta a liberar
  return Boolean(ticket.purchaseDate || ticket.purchaseOrderNumber?.trim() || ticket.locator?.trim());
}

/** Alguma das passagens da vaga já foi comprada? (ida e volta podem ser linhas separadas) */
export function hasPurchasedTicket(tickets: readonly TicketForChangeWindow[] | null | undefined): boolean {
  return (tickets ?? []).some(isTicketPurchased);
}

/** A vaga já saiu da etapa de Validação de Escala (ou seja: já está escalada)? */
export function isPostValidationInclusion(
  inclusion: InclusionForChangeWindow | null | undefined,
): boolean {
  return Boolean(inclusion) && (inclusion!.phase ?? "") !== SUGESTAO_PHASE;
}

export interface ChangeWindow {
  /** Pode abrir pedido de ajuste/exclusão sobre esta vaga? */
  allowed: boolean;
  /** Preenchido só quando `allowed` é false. */
  block?: ChangeWindowBlock;
  /** Texto pt-BR pronto para a tela e para o 403. */
  message?: string;
  /**
   * true quando a vaga já está escalada — o pedido NÃO mexe na fase da vaga e
   * o aprovador não tem a opção "devolver para a área validar".
   */
  postScaling: boolean;
  /** true quando só passou porque o ator é administrador (a área veria bloqueio). */
  adminOverride: boolean;
}

export interface ChangeWindowOptions {
  /** Ator é administrador — passa pelo bloqueio da passagem comprada. */
  isAdmin?: boolean;
  /** Passagens da vaga (uma ou mais linhas de `tickets`). */
  tickets?: readonly TicketForChangeWindow[] | null;
}

/**
 * Pode abrir pedido de ajuste/exclusão sobre esta vaga, e em que regime?
 *
 *  - vaga excluída (soft delete) ou cancelada → não, para ninguém;
 *  - vaga em `sugestao` → sim, como sempre foi (a máquina de estados cuida do
 *    resto: `nextSuggestionState(..., 'pedir_ajuste')` só aceita pendente/validada);
 *  - vaga já escalada, sem passagem comprada → sim, em regime `postScaling`;
 *  - vaga já escalada, com passagem comprada → só administrador.
 *
 * Esta função NÃO decide permissão de papel (isso é `canValidateInclusion`) nem
 * evento encerrado (`isEventLockedFor`); as três travas se somam.
 */
export function changeRequestWindow(
  inclusion: InclusionForChangeWindow | null | undefined,
  opts: ChangeWindowOptions = {},
): ChangeWindow {
  const postScaling = isPostValidationInclusion(inclusion);
  const deny = (block: ChangeWindowBlock): ChangeWindow => ({
    allowed: false, block, message: CHANGE_WINDOW_BLOCK_MSG[block], postScaling, adminOverride: false,
  });

  if (!inclusion) return deny("vaga_excluida");
  if (inclusion.deletedAt) return deny("vaga_excluida");

  const status = (inclusion.status ?? "").trim();
  if (status === "cancelado") return deny("vaga_cancelada");
  if (status === SUGESTAO_STATUS.NEGADA) return deny("vaga_cancelada");

  // Ainda na Validação: o fluxo de sempre, nada a ver com passagem.
  if (!postScaling) return { allowed: true, postScaling: false, adminOverride: false };

  if (hasPurchasedTicket(opts.tickets)) {
    if (!opts.isAdmin) return deny("passagem_comprada");
    return { allowed: true, postScaling: true, adminOverride: true };
  }

  return { allowed: true, postScaling: true, adminOverride: false };
}
