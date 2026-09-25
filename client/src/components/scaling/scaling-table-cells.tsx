/**
 * Regras de exibição das células da tabela da Escalação (25/09 — extraídas de
 * scaling-table.tsx): pílula de situação, aviso de troca pendente, a linha de
 * detalhe abaixo da pílula e os chips de "Precisa de".
 */
import type { ReactNode } from "react";
import { Plane, Bus, BedDouble, Receipt, Headset, Bike, Hammer } from "lucide-react";
import type { TeamInclusion, Ticket, Accommodation } from "@shared/schema";
import type { PendingChangeRequest } from "./use-scaling-data";
import { isPercursoFunction } from "@shared/calculation-rules";
import { isCenotecnicaFunction as isCenoEmpreitaFunction } from "@shared/alimentacao";
import { ATENDIMENTO_SHORT, PERCURSEIRO_SHORT, CENO_FREELA_SHORT, type NormalizedSwap } from "./scaling-utils";
import { getScalingStatusKey } from "./scaling-status";
import { StatusDaVagaBadge } from "@/components/common/status-badge";

/**
 * A pílula de situação — a mesma na linha, no modal e no resumo. Desde 23/09
 * é o `StatusDaVagaBadge` (StatusBadge único, rounded-full, tokens): esta
 * tabela era a única com pílula rounded-md e hex próprio.
 */
export function getStatusBadge(
  inclusion: Pick<TeamInclusion, "status" | "collaboratorId"> & { empreitaEmpresa?: string | null },
  size: "sm" | "md" | "lg" = "sm",
): ReactNode {
  return (
    <StatusDaVagaBadge
      status={inclusion.status}
      collaboratorId={inclusion.collaboratorId}
      empreitaEmpresa={inclusion.empreitaEmpresa}
      size={size === "sm" ? "sm" : "md"}
    />
  );
}

/**
 * Regra ÚNICA do aviso de troca pendente (antes cada aba tinha a sua):
 * - o solicitante vê a própria troca até abrir o registro;
 * - Compras/admin vê SEMPRE (16/09): antes só em vaga sem passagem/hotel, e a
 *   troca de vaga com logística ainda não comprada entrava no menu e na fila
 *   "Em análise" sem nada na linha que dissesse o porquê;
 * - os demais papéis não veem.
 */
export function shouldShowPendingSwapBadge(
  swap: Pick<NormalizedSwap, "id" | "requestedBy"> | undefined,
  inclusion: Pick<TeamInclusion, "needsTicket" | "needsAccommodation">,
  opts: { currentUserId?: string; isAdminOrPurchasing: boolean; seenSwapIds: Set<string> },
): boolean {
  if (!swap) return false;
  if (opts.seenSwapIds.has(swap.id)) return false;
  const isRequester = !!opts.currentUserId && swap.requestedBy === opts.currentUserId;
  if (isRequester) return true;
  return opts.isAdminOrPurchasing;
}

/** "VINICIUS JOSE CAMPOS" → "Vinicius". Cabe na linha de detalhe; o nome inteiro vai no title. */
// 25/09: a expressão tinha perdido a barra do `\s` numa substituição automática
// (dividia na letra "s") e o primeiro nome saía errado. Corrigido.
function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR");
}

/** "2026-07-22T…" → "22/07". Data curta, para caber na linha de detalhe. */
function diaMes(valor: string | Date | null | undefined): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * A linha de detalhe abaixo da pílula: quem está esperando o quê, em texto.
 * É a informação que antes exigia abrir o registro para descobrir.
 */
export function detalheDaSituacao(
  inclusion: TeamInclusion,
  opts: { swap?: NormalizedSwap; pedido?: PendingChangeRequest },
): { texto: string; sufixo?: string; titulo: string; tom: "troca" | "pedido" | "neutro" } | null {
  if (opts.swap) {
    const nome = opts.swap.newCollaboratorName?.trim();
    // "Em análise" na frente (15/09): no fim, a linha cortava e a troca
    // pendente parecia decidida ao lado da pílula "Aprovado" (que é da vaga).
    // A pílula da linha já diz "Troca em análise" (15/09); aqui vai quem sai e
    // quem entra, sem repetir.
    const atual = opts.swap.currentCollaboratorName?.trim();
    const texto = nome
      ? (atual ? `${primeiroNome(atual)} → ${primeiroNome(nome)}` : `Entra ${nome}`)
      : "Troca em análise";
    // O título carrega quem pediu e por quê: a linha tem espaço para a frase
    // curta, mas essa informação não pode sumir da lista — era o que o antigo
    // badge "Troca pendente" guardava no hover.
    const porQuem = opts.swap.requestedByName?.trim();
    return {
      texto,
      titulo: [texto, porQuem ? `pedida por ${porQuem}` : null, opts.swap.reason?.trim() || null]
        .filter(Boolean).join(" · "),
      tom: "troca",
    };
  }
  if (opts.pedido) {
    const tipo = opts.pedido.requestType === "exclusao" ? "exclusão" : "ajuste";
    const quando = diaMes(opts.pedido.createdAt);
    // Curto para caber numa linha do chip (04/09: três linhas na coluna
    // Situação ficavam pesadas); o texto inteiro vai no tooltip.
    const texto = `${tipo === "exclusão" ? "Exclusão" : "Ajuste"} c/ aprovador`;
    const sufixo = quando ? `desde ${quando}` : undefined;
    const completo = `Pedido de ${tipo} com o aprovador${quando ? ` desde ${quando}` : ""}`;
    return {
      texto,
      sufixo,
      titulo: [completo, opts.pedido.requestedByName ? `por ${opts.pedido.requestedByName}` : null, opts.pedido.reason || null]
        .filter(Boolean).join(" · "),
      tom: "pedido",
    };
  }
  if (inclusion.status === "aguardando_producao") {
    // `updatedAt` é a melhor aproximação da transição: quando o status é este,
    // a última gravação foi justamente o envio ao gestor.
    const quando = diaMes(inclusion.updatedAt);
    const texto = quando ? `Enviada ao gestor em ${quando}` : "Enviada ao gestor";
    return { texto, titulo: texto, tom: "neutro" };
  }
  // "Salvo" na pílula; aqui fica claro o que falta (dono, 15/09).
  if (getScalingStatusKey(inclusion) === "salvo") {
    return { texto: "Falta confirmar a escalação", titulo: "Colaborador salvo, mas a escalação ainda não foi confirmada", tom: "neutro" };
  }
  const aprovado = diaMes(inclusion.approvedByProductionAt);
  if (aprovado && getScalingStatusKey(inclusion) === "escalado") {
    const texto = `Aprovada pelo gestor em ${aprovado}`;
    return { texto, titulo: texto, tom: "neutro" };
  }
  return null;
}

/** Um chip de "Precisa de" — só o que é verdade é desenhado. */
export interface Need { key: string; icon: ReactNode; label: string; title: string; cls: string }

const NEED_INFO = "bg-brand-soft text-info";
const NEED_NEUTRO = "bg-muted text-slate-600";
const NEED_FALTA = "bg-warning-soft text-warning";

export function needsDaLinha(
  inclusion: TeamInclusion,
  opts: {
    ticket?: Ticket;
    funcao: string;
    /** Passagem efetivamente COMPRADA (não só registrada). */
    passagemComprada?: boolean;
    /** Reserva de hotel já existente. */
    hospedagem?: Accommodation;
  },
): Need[] {
  const needs: Need[] = [];
  // O chip diz do que a vaga precisa E se aquilo já está resolvido: azul
  // quando está, âmbar enquanto falta. A lista antiga trazia essa informação
  // numa pílula roxa separada ("Hotel"), que dizia "reservada" com a mesma
  // palavra que a coluna ao lado usava para dizer "precisa" — duas leituras
  // possíveis para o mesmo rótulo.
  if (inclusion.needsTicket) {
    const tipo = opts.ticket?.transportType;
    const comprada = !!opts.passagemComprada;
    const nome = tipo === "van" ? "Van" : tipo === "rodoviario" ? "Rodoviária" : "Passagem";
    const anexos = opts.ticket?.attachmentIds?.length ?? 0;
    needs.push({
      key: "transporte",
      icon: tipo === "rodoviario" ? <Bus className="w-3.5 h-3.5" aria-hidden="true" /> : <Plane className="w-3.5 h-3.5" aria-hidden="true" />,
      label: nome,
      title: comprada
        ? `${nome} comprada${anexos ? ` · ${anexos} ${anexos === 1 ? "anexo" : "anexos"}` : ""}`
        : `Precisa de transporte — ainda não comprada`,
      cls: comprada ? NEED_INFO : NEED_FALTA,
    });
  }
  if (inclusion.needsAccommodation) {
    const reservada = !!opts.hospedagem;
    // O clipe colado em "Hotel 📎" escondia um dado real num caractere; a
    // contagem de anexos passa para o título, onde dá para ler.
    const anexos = opts.hospedagem?.attachmentIds?.length ?? 0;
    needs.push({
      key: "hotel",
      icon: <BedDouble className="w-3.5 h-3.5" aria-hidden="true" />,
      label: "Hotel",
      title: reservada
        ? `Hospedagem reservada${opts.hospedagem?.hotelName ? ` · ${opts.hospedagem.hotelName}` : ""}${anexos ? ` · ${anexos} ${anexos === 1 ? "anexo" : "anexos"}` : ""}`
        : "Precisa de hospedagem — ainda não reservada",
      cls: reservada ? NEED_INFO : NEED_FALTA,
    });
  }
  if (inclusion.emitsNf === false) {
    needs.push({ key: "nf", icon: <Receipt className="w-3.5 h-3.5" aria-hidden="true" />, label: "Sem NF", title: "Não emite nota fiscal", cls: NEED_NEUTRO });
  }
  const at = ATENDIMENTO_SHORT[inclusion.atendimentoTipo ?? ""];
  if (at) {
    needs.push({ key: "atendimento", icon: <Headset className="w-3.5 h-3.5" aria-hidden="true" />, label: at.label, title: `Tipo de atendimento: ${at.label}`, cls: NEED_NEUTRO });
  }
  if (isPercursoFunction(opts.funcao)) {
    const p = PERCURSEIRO_SHORT[inclusion.percurseiroTipo ?? ""];
    // O tipo do percurseiro é definido NO PLANEJADO (decisão de 17/08): a
    // Escalação mostra quando já existe e não cobra quando falta.
    if (p) needs.push({ key: "percurseiro", icon: <Bike className="w-3.5 h-3.5" aria-hidden="true" />, label: p.short, title: `Tipo do percurseiro: ${p.label}`, cls: NEED_NEUTRO });
  }
  if (isCenoEmpreitaFunction(opts.funcao)) {
    const c = CENO_FREELA_SHORT[inclusion.cenoFreelaTipo ?? ""];
    needs.push(c
      ? { key: "freela", icon: <Hammer className="w-3.5 h-3.5" aria-hidden="true" />, label: c.short, title: `Tipo de freela: ${c.label}`, cls: NEED_NEUTRO }
      // Âmbar porque falta algo, não porque está errado: sinaliza, não bloqueia.
      : { key: "freela", icon: <Hammer className="w-3.5 h-3.5" aria-hidden="true" />, label: "definir freela", title: "Cenotécnica sem tipo de freela — o Planejado precisa do tipo para o valor fechado", cls: NEED_FALTA });
  }
  return needs;
}
