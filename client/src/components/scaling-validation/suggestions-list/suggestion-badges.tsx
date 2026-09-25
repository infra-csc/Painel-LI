/**
 * Selos de status de uma vaga sugerida (25/09 — extraídos de suggestions-list.tsx):
 * pílula de status, dias parada, pedido em aberto, decisões do aprovador e o
 * `StatusCell` que os combina na tabela, nos cards e no detalhe.
 */
import { Clock, MessageSquareWarning, Undo2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateBr } from "@/lib/dates";
import {
  SUGESTAO_STATUS, SUGESTAO_STATUS_LABELS, CHANGE_REQUEST_TYPE_LABELS,
  STALLED_DAYS, DANGER_DAYS, daysAwaitingApproval, pendingSeverity,
  type SugestaoStatus, type ChangeRequestType,
  type LastDecisionInfo, type LastVagaDecisionInfo,
} from "@shared/scaling-validation-rules";
import { DECISION_TONE, describeLastDecision, describeVagaDecision, type DecisionDescription, type SuggestionRow } from "../types";
import { StatusBadge, TONE_CLASS, toneDoStatus } from "@/components/common/status-badge";
import { dayText } from "../logistics-chips";
import { ValidationNoteHint } from "../validation-note-blocks";

/**
 * Filete colorido no início da linha — leitura do status antes de ler o texto.
 * Mesmo tom da pílula (23/09): pendente/ajuste = warning, validada = info
 * (passou adiante, está com o aprovador), aprovada = success, negada = danger.
 */
export const railClass = (status: string) => TONE_CLASS[toneDoStatus(status)].dot;

/** Pílula de status da sugestão — StatusBadge único; rótulo do shared ("Negada" para recusa). */
export function SuggestionStatusBadge({ status }: { status: string }) {
  const s = status as SugestaoStatus;
  const label = SUGESTAO_STATUS_LABELS[s] ?? status;
  return <StatusBadge tone={toneDoStatus(status)}>{label}</StatusBadge>;
}

/** O mínimo que os badges de atraso precisam saber da vaga. */
export type PendingDaysRow = Pick<SuggestionRow, "status" | "daysPending" | "validatedAt">;

/**
 * Contador de dias parado — limiares vêm do shared (STALLED_DAYS / DANGER_DAYS).
 *
 * DUAS contagens, porque a bola muda de mão:
 *  - vaga ainda pendente → "pendente há N dias" desde o envio da logística;
 *  - vaga em `sugestao_validada` → "aguardando aprovação há N dias" contado do
 *    `validatedAt` (`daysAwaitingApproval`, o mesmo helper da coluna
 *    "Aguardando" da tela do aprovador). A área não pode ler "parada há 6 dias"
 *    numa vaga cujo atraso é do aprovador.
 *
 * `approverNames`: aprovador(es) da função, quando a tela souber — vai para o
 * tooltip da vaga validada ("quem tem de decidir"). Lista vazia é tratada pelo
 * `NoApproverBadge`.
 *
 * Selo SECUNDÁRIO (04/09): sem `tabIndex` — o texto do selo já diz tudo que
 * importa ("pendente há 6 dias"); o tooltip é complemento para o mouse. Um
 * tab-stop por selo fazia a fila de 40 linhas ter 120 paradas de teclado.
 */
export function PendingDaysBadge({ row, approverNames }: { row: PendingDaysRow; approverNames?: string[] }) {
  const awaiting = row.status === SUGESTAO_STATUS.VALIDADA;
  const days = awaiting ? daysAwaitingApproval(row) : row.daysPending;
  if (row.status === SUGESTAO_STATUS.APROVADA || row.status === SUGESTAO_STATUS.NEGADA) return null;
  const sev = pendingSeverity(days);
  if (sev === "ok") return null;
  const danger = sev === "danger";
  const who = approverNames?.length ? ` Quem decide: ${approverNames.join(", ")}.` : "";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <StatusBadge tone={danger ? "danger" : "warning"} icon={Clock}>
          {awaiting ? "aguardando aprovação" : "pendente"} há {days} {days === 1 ? "dia" : "dias"}
        </StatusBadge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {awaiting
          ? `A área já validou — a decisão está com o aprovador há ${days} ${days === 1 ? "dia" : "dias"}.${who}`
          : danger ? `Parada há ${DANGER_DAYS} dias ou mais — priorize.` : `Parada há ${STALLED_DAYS} dias ou mais.`}
      </TooltipContent>
    </Tooltip>
  );
}

// O badge vermelho "sem aprovador" foi REMOVIDO em 26/08 (decisão do dono: "não
// tem isso de sem aprovador" — existe um aprovador padrão do sistema, então
// nenhuma vaga validada fica sem quem decida). A salvaguarda continua onde ela
// é acionável: na aba "Validação de Escala" dentro de Funções, que mostra ao
// admin quais funções estão no aprovador padrão. Aqui, na tela da ÁREA, o aviso
// era só ruído — quem valida não cadastra aprovador.

function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const weekday = dayText(d).split(" ")[0];
  return `${weekday ? `${weekday} ` : ""}${formatDateBr(d)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function PendingRequestBadge({ row }: { row: SuggestionRow }) {
  const r = row.pendingRequest;
  if (!r) return null;
  const label = CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Selo PRINCIPAL da vaga com pedido: fica focável — o motivo do pedido só existe no tooltip. */}
        <StatusBadge tone="warning" icon={MessageSquareWarning} tabIndex={0}>
          Com pedido de {label.toLowerCase()}
        </StatusBadge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
        <p className="font-semibold">Aguardando o aprovador</p>
        {r.reason && <p className="whitespace-pre-wrap">{r.reason}</p>}
        <p className="text-muted-foreground">por {r.requestedByName}{r.createdAt ? ` · ${fmtDateTime(r.createdAt)}` : ""}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Badge + tooltip de uma decisão do aprovador (comentário, quem e quando). */
function DecisionBadge(
  { d, heading, label, comment, byName, at }:
  { d: DecisionDescription; heading: string; label?: string; comment: string | null; byName: string | null; at: string | null },
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <StatusBadge tone={DECISION_TONE[d.tone]} icon={Undo2}>
          {label ?? d.title}
        </StatusBadge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
        <p className="font-semibold">{heading}</p>
        <p className="whitespace-pre-wrap">{comment?.trim() ? comment : <span className="italic text-muted-foreground">Sem comentário do aprovador.</span>}</p>
        <p className="text-muted-foreground">{byName ?? "Aprovador"}{at ? ` · ${fmtDateTime(at)}` : ""}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Decisão do aprovador sobre um PEDIDO: "Devolvida pelo aprovador" / "Pedido negado"… */
export function LastDecisionBadge({ info }: { info: LastDecisionInfo | null | undefined }) {
  const d = describeLastDecision(info);
  if (!info || !d) return null;
  const typeLabel = CHANGE_REQUEST_TYPE_LABELS[info.requestType] ?? info.requestType;
  return (
    <DecisionBadge
      d={d} heading={`${d.title} · pedido de ${typeLabel.toLowerCase()}`}
      comment={info.comment} byName={info.byName} at={info.at}
    />
  );
}

/**
 * Decisão do aprovador sobre a VAGA — devolver/reprovar/aprovar não criam
 * pedido, então vêm do `lastVagaDecision` do GET (lido de
 * `team_inclusion_logs`), com o comentário obrigatório do aprovador.
 */
export function VagaDecisionBadge({ info }: { info: LastVagaDecisionInfo | null | undefined }) {
  const d = describeVagaDecision(info);
  if (!info || !d) return null;
  return <DecisionBadge d={d} heading={d.title} comment={info.comment} byName={info.byName} at={info.at} />;
}

const ts = (v: string | null | undefined) => (v ? new Date(v).getTime() || 0 : 0);

/**
 * UM selo "Voltou do aprovador" (04/09) no lugar de dois. A vaga podia carregar
 * ao mesmo tempo a decisão sobre um PEDIDO e a decisão sobre a VAGA, e a linha
 * mostrava dois selos compridos ("Devolvida pelo aprovador (reajuste)" +
 * "Devolvida pelo aprovador para nova validação") dizendo quase a mesma coisa.
 * Aqui vale a decisão MAIS RECENTE; o tooltip traz o título completo, o
 * comentário e quem decidiu, e o drawer continua mostrando as duas na íntegra.
 * O rótulo curto só vale quando a vaga de fato voltou (warn/danger); uma
 * decisão positiva mantém o próprio título.
 */
function ReturnedBadge({ row }: { row: Pick<SuggestionRow, "lastDecision" | "lastVagaDecision"> }) {
  const req = row.lastDecision ? describeLastDecision(row.lastDecision) : null;
  const vaga = row.lastVagaDecision ? describeVagaDecision(row.lastVagaDecision) : null;
  if (!req && !vaga) return null;
  const useVaga = !!vaga && (!req || ts(row.lastVagaDecision?.at) >= ts(row.lastDecision?.at));
  if (useVaga && vaga && row.lastVagaDecision) {
    const info = row.lastVagaDecision;
    return (
      <DecisionBadge d={vaga} heading={vaga.title} label={vaga.tone === "ok" ? undefined : "Voltou do aprovador"}
        comment={info.comment} byName={info.byName} at={info.at} />
    );
  }
  if (req && row.lastDecision) {
    const info = row.lastDecision;
    const typeLabel = CHANGE_REQUEST_TYPE_LABELS[info.requestType] ?? info.requestType;
    return (
      <DecisionBadge d={req} heading={`${req.title} · pedido de ${typeLabel.toLowerCase()}`} label={req.tone === "ok" ? undefined : "Voltou do aprovador"}
        comment={info.comment} byName={info.byName} at={info.at} />
    );
  }
  return null;
}

/**
 * Todos os badges de status de uma vaga (mesma ordem na tabela e nos cards):
 * selo principal + dias parada + "voltou do aprovador".
 * `approverNames`: aprovador(es) da função — `undefined` quando a tela não sabe
 * (aí nada é afirmado); `[]` significa "função sem aprovador cadastrado".
 */
export function StatusCell({ row }: { row: SuggestionRow; approverNames?: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* Com pedido em aberto, UM selo só — o do pedido, que diz o tipo certo e
          traz motivo/autor no tooltip. O status cru ("Com pedido de ajuste")
          ao lado de "pedido de exclusão" dizia duas coisas diferentes sobre a
          mesma vaga. */}
      {row.pendingRequest
        ? <PendingRequestBadge row={row} />
        : <SuggestionStatusBadge status={row.status} />}
      {/* "pendente há N dias" saiu da lista (04/09): a contagem virava ruído
          vermelho em toda linha; o recorte "Atrasadas" continua nos KPIs. */}
      <ReturnedBadge row={row} />
      {/* Observação de quem validou (24/09): ícone com o texto no tooltip —
          só na vaga validada (ao voltar para validação o servidor a zera). */}
      {row.status === SUGESTAO_STATUS.VALIDADA && <ValidationNoteHint note={row.validationNote} />}
    </div>
  );
}
