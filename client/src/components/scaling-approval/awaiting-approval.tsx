import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Lock, Undo2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { cn, formatDiarias } from "@/lib/utils";
import { formatDateBr } from "@/lib/dates";
import { eventPeriodLabel, periodLabel, workDaysOf } from "@/components/scaling-validation/suggestions-list";
import { DANGER_DAYS, STALLED_DAYS, daysAwaitingApproval, pendingSeverity } from "@shared/scaling-validation-rules";
import { isStaleDecisionError } from "./use-decisions";
import type { StalledRow as SuggestionRow, VagaDecisionKind } from "./types";

interface AwaitingApprovalProps {
  rows: SuggestionRow[];
  functionNameById: Map<string, string>;
  /** userId → nome (vem dos responsáveis das funções) para resolver `validatedBy`. */
  userNameById?: Map<string, string>;
  /** Nome(s) do(s) aprovador(es) da função da linha, para explicar quem decide. */
  approverNamesFor?: (row: SuggestionRow) => string[];
  /**
   * "Todos os eventos": a fila mistura eventos, então cada linha precisa dizer
   * de qual é. A ORDEM continua sendo por tempo de espera (a vaga mais antiga
   * no topo, venha do evento que vier) — agrupar por evento esconderia a que
   * está travando a escala. Com um evento filtrado a coluna some.
   */
  showEvent?: boolean;
  busy?: boolean;
  /** Aprovação em lote (POST /aprovar-lote). */
  onApprove: (rows: SuggestionRow[]) => void;
  /**
   * Reprovar / devolver: uma vaga por vez, comentário obrigatório. Devolva a
   * Promise da mutation (`mutateAsync`): o diálogo só fecha e só limpa o
   * comentário quando ela RESOLVE — num 500 o texto continua ali para reenviar.
   */
  onDecide: (row: SuggestionRow, kind: VagaDecisionKind, comment: string) => void | Promise<unknown>;
}

const TH = "px-2.5 py-2 text-left text-[11px] uppercase tracking-[0.06em] text-slate-500 font-semibold whitespace-nowrap border-b border-slate-200";
const BADGE = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap";
/** Botão de ação por linha (ícone só) — mesma caixa 28×28 do mockup. */
const ICON_BTN = "h-7 w-7 p-0 rounded-lg";
const MAX_LISTED = 5;

/**
 * Dias aguardando o aprovador — helper único do shared
 * (`daysAwaitingApproval`), o mesmo que o badge da Validação de Escala usa.
 * Conta a partir de `validatedAt`: o `daysPending` da linha conta desde o envio
 * da logística e incluiria o tempo da própria validação da área.
 */
export function daysAwaiting(row: SuggestionRow): number {
  return daysAwaitingApproval(row);
}

function AwaitingBadge({ days }: { days: number }) {
  const sev = pendingSeverity(days);
  const text = days <= 0 ? "hoje" : `há ${days} ${days === 1 ? "dia" : "dias"}`;
  // Neutro: sem tooltip, só a etiqueta cinza (mesma caixa das demais — a coluna não "pula").
  if (sev === "ok") {
    return (
      <span className={cn(BADGE, "bg-slate-50 text-slate-500 border-slate-200")}>
        <Clock className="w-3 h-3" aria-hidden="true" /> {text}
      </span>
    );
  }
  const danger = sev === "danger";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn(BADGE, danger ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200")}>
          <Clock className="w-3 h-3" aria-hidden="true" /> {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {danger ? `Aguardando aprovação há ${DANGER_DAYS} dias ou mais — priorize.` : `Aguardando aprovação há ${STALLED_DAYS} dias ou mais.`}
      </TooltipContent>
    </Tooltip>
  );
}

const CHIP = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

function TravelCell({ row }: { row: SuggestionRow }) {
  const items = [
    { on: !!row.needsTicket, label: "Passagem", title: "Precisa de passagem", cls: "bg-violet-50 text-violet-700" },
    { on: !!row.needsAccommodation, label: "Hotel", title: "Precisa de hospedagem", cls: "bg-sky-50 text-sky-700" },
  ].filter((i) => i.on);
  if (items.length === 0) {
    return <span className={cn(CHIP, "bg-slate-50 text-slate-400")} aria-label="Sem passagem e sem hotel">—</span>;
  }
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      {items.map((i) => <span key={i.label} className={cn(CHIP, i.cls)} title={i.title}>{i.label}</span>)}
    </span>
  );
}

function ValidatedCell({ row, userNameById }: { row: SuggestionRow; userNameById?: Map<string, string> }) {
  const name = row.validatedBy ? userNameById?.get(row.validatedBy) : undefined;
  const when = row.validatedAt ? formatDateBr(new Date(row.validatedAt)) : null;
  // Sem nome (o GET só traz o id) o que importa é a data — nunca mostrar o UUID.
  return (
    <span className="block text-xs text-slate-600">
      {name ? <span className="font-semibold text-slate-700">{name}</span> : <span className="text-slate-500">Área responsável</span>}
      {when && <span className="block font-mono tabular-nums text-[11px] text-slate-400">{when}</span>}
    </span>
  );
}

function LockedHint({ reason }: { reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex items-center justify-center text-slate-400" aria-label={reason}>
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

const DECISION_COPY: Record<VagaDecisionKind, { title: string; help: string; action: string; cls: string }> = {
  reprovar: {
    title: "Reprovar vaga validada?",
    help: "A vaga sai da escala e fica registrada como negada. Explique o motivo para a área.",
    action: "Reprovar",
    cls: "bg-red-600 hover:bg-red-700",
  },
  devolver: {
    title: "Devolver a vaga para a área?",
    help: "A vaga volta para “aguardando validação da área” e o contador de atraso recomeça. Diga o que precisa ser revisto.",
    action: "Devolver",
    cls: "bg-amber-600 hover:bg-amber-700",
  },
};

/**
 * "Vagas aguardando aprovação": vagas em `sugestao_validada` — a área já validou
 * e agora depende do aprovador. Caminho normal do fluxo (regra de 19/08):
 * aprovar (em lote ou linha a linha), reprovar ou devolver para a área — as duas
 * últimas com comentário obrigatório, uma vaga por vez.
 */
export function AwaitingApproval({
  rows, functionNameById, userNameById, approverNamesFor, showEvent = false, busy, onApprove, onDecide,
}: AwaitingApprovalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Vagas do diálogo de aprovação — o da barra (seleção) e o do botão da linha usam o mesmo. */
  const [confirmRows, setConfirmRows] = useState<SuggestionRow[] | null>(null);
  const [decision, setDecision] = useState<{ kind: VagaDecisionKind; row: SuggestionRow } | null>(null);
  const [comment, setComment] = useState("");

  const selectableIds = useMemo(() => new Set(rows.filter((r) => r.canDecide === true).map((r) => r.id)), [rows]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  // A seleção se limpa sozinha: vaga decidida sai desta lista (vira Inclusão,
  // negada ou volta a pendente) e some de `selectableIds`.
  const selectedRows = useMemo(
    () => Array.from(selected).filter((id) => selectableIds.has(id)).map((id) => rowById.get(id)!).filter(Boolean),
    [selected, selectableIds, rowById],
  );
  const nSel = selectedRows.length;
  const single = nSel === 1 ? selectedRows[0] : null;

  const allSelected = selectableIds.size > 0 && nSel === selectableIds.size;
  const someSelected = nSel > 0 && !allSelected;
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds));

  const openDecision = (kind: VagaDecisionKind, row: SuggestionRow) => { setComment(""); setDecision({ kind, row }); };
  /**
   * Fecha e limpa SÓ no sucesso: fechar antes da resposta fazia o aprovador
   * redigitar o comentário obrigatório inteiro num 500. A exceção é o item que
   * mudou por baixo (404/409): a vaga saiu da lista, então o diálogo fecha —
   * ficar aberto viraria um "Vaga #undefined". O toast de erro vem da mutation.
   */
  const submitDecision = async () => {
    const text = comment.trim();
    if (!decision || !text) return;
    try {
      await onDecide(decision.row, decision.kind, text);
      setDecision(null);
      setComment("");
    } catch (err) {
      if (isStaleDecisionError(err)) { setDecision(null); setComment(""); }
    }
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nenhuma vaga aguardando aprovação"
        description="Quando uma área validar a escala sugerida, as vagas aparecem aqui para você aprovar, reprovar ou devolver."
      />
    );
  }

  const copy = decision ? DECISION_COPY[decision.kind] : null;
  const nConfirm = confirmRows?.length ?? 0;

  return (
    <>
      {nSel > 0 && (
        <div role="region" aria-label="Ações para as vagas selecionadas"
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
          <div className="mr-auto min-w-0">
            <span className="block text-sm font-semibold text-slate-700">{nSel} {nSel === 1 ? "vaga selecionada" : "vagas selecionadas"}</span>
            <span className="block text-[11px] text-slate-500">Reprovar e devolver: uma vaga por vez.</span>
          </div>
          <Button type="button" size="sm" variant="ghost" className={cn(ICON_BTN, "text-slate-500")} onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
            <X className="w-4 h-4" />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={single ? -1 : 0} className="inline-flex">
                <Button type="button" size="sm" variant="outline" className="h-7 rounded-lg text-xs" disabled={!single || busy} onClick={() => single && openDecision("devolver", single)}>
                  <Undo2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Devolver para a área
                </Button>
              </span>
            </TooltipTrigger>
            {!single && <TooltipContent side="top" className="text-xs">Selecione apenas uma vaga para devolver</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={single ? -1 : 0} className="inline-flex">
                <Button type="button" size="sm" variant="outline" className="h-7 rounded-lg text-xs text-red-700 border-red-200 hover:bg-red-50" disabled={!single || busy} onClick={() => single && openDecision("reprovar", single)}>
                  <XCircle className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Reprovar
                </Button>
              </span>
            </TooltipTrigger>
            {!single && <TooltipContent side="top" className="text-xs">Selecione apenas uma vaga para reprovar</TooltipContent>}
          </Tooltip>
          <Button type="button" size="sm" className="h-7 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => setConfirmRows(selectedRows)}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Aprovar ({nSel})
          </Button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-[13px]">
            <caption className="sr-only">Vagas validadas pela área, aguardando a decisão do aprovador</caption>
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={cn(TH, "w-10 px-1 text-center")}>
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    disabled={selectableIds.size === 0}
                    onCheckedChange={toggleAll}
                    className="data-[state=indeterminate]:bg-primary/70 data-[state=indeterminate]:text-primary-foreground"
                    aria-label={allSelected ? "Desmarcar todas as vagas" : "Selecionar todas as vagas que você pode decidir"}
                  />
                </th>
                <th scope="col" className={TH}>Vaga</th>
                {showEvent && <th scope="col" className={cn(TH, "min-w-[170px]")}>Evento</th>}
                <th scope="col" className={TH}>Período / diárias</th>
                <th scope="col" className={TH}>Validada por</th>
                <th scope="col" className={TH}>Aguardando</th>
                <th scope="col" className={cn(TH, "text-center")}>Logística</th>
                <th scope="col" className={cn(TH, "text-right min-w-[210px]")}>Decisão</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const selectable = selectableIds.has(row.id);
                const isSelected = selectable && selected.has(row.id);
                const approvers = approverNamesFor?.(row) ?? [];
                const lockReason = approvers.length ? `Aprovador: ${approvers.join(", ")}` : "Você não é aprovador desta função";
                const days = workDaysOf(row);
                const fnName = functionNameById.get(row.functionId) ?? "—";
                return (
                  <tr key={row.id} data-testid={`awaiting-row-${row.inclusionNumber}`}
                    className={cn("border-b border-slate-100", isSelected ? "bg-brand-soft/50" : i % 2 === 1 ? "bg-slate-50/50" : "bg-white")}>
                    <td className="px-1 py-2 text-center align-middle">
                      {selectable ? (
                        <Checkbox checked={isSelected} onCheckedChange={() => toggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />
                      ) : (
                        <LockedHint reason={approvers.length ? `Você não é aprovador desta função. Aprovador: ${approvers.join(", ")}` : "Você não é aprovador desta função"} />
                      )}
                    </td>
                    <td className="px-2.5 py-2 align-middle max-w-[260px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-800 tabular-nums">#{row.inclusionNumber}</span>
                        <div className="min-w-0">
                          <span className="block font-semibold text-slate-800 truncate" title={fnName}>{fnName}</span>
                          <span className="block text-[11px] text-slate-400 truncate" title={row.observations ?? undefined}>
                            {row.area ?? "Sem área"}{row.observations ? ` · ${row.observations}` : ""}
                          </span>
                        </div>
                      </div>
                    </td>
                    {showEvent && (
                      <td className="px-2.5 py-2 align-middle max-w-[220px]">
                        <span className="block truncate text-[13px] font-semibold text-slate-700" title={row.eventName ?? undefined}>
                          {row.eventName ?? "Evento sem nome"}
                        </span>
                        <span className="block font-mono text-[11px] text-slate-400">{eventPeriodLabel(row) || "—"}</span>
                      </td>
                    )}
                    <td className="px-2.5 py-2 align-middle whitespace-nowrap">
                      <span className="font-mono tabular-nums text-xs text-slate-700">{periodLabel(row)}</span>
                      <span className="ml-1.5 text-[11px] text-slate-400">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
                    </td>
                    <td className="px-2.5 py-2 align-middle"><ValidatedCell row={row} userNameById={userNameById} /></td>
                    <td className="px-2.5 py-2 align-middle"><AwaitingBadge days={daysAwaiting(row)} /></td>
                    <td className="px-2.5 py-2 align-middle text-center"><TravelCell row={row} /></td>
                    <td className="px-2.5 py-2 align-middle text-right">
                      {selectable ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button type="button" size="sm" variant="outline" className={ICON_BTN} disabled={busy}
                                onClick={() => openDecision("devolver", row)} aria-label={`Devolver a vaga #${row.inclusionNumber} para a área`}>
                                <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Devolver para a área</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button type="button" size="sm" variant="outline" className={cn(ICON_BTN, "text-red-700 border-red-200 hover:bg-red-50")} disabled={busy}
                                onClick={() => openDecision("reprovar", row)} aria-label={`Reprovar a vaga #${row.inclusionNumber}`}>
                                <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Reprovar vaga</TooltipContent>
                          </Tooltip>
                          <Button type="button" size="sm" className="h-7 rounded-lg px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy}
                            onClick={() => setConfirmRows([row])} aria-label={`Aprovar a vaga #${row.inclusionNumber}`}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Aprovar
                          </Button>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 truncate inline-block max-w-[200px]" title={lockReason}>{lockReason}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Aprovar (lote ou uma vaga) */}
      <AlertDialog open={confirmRows !== null} onOpenChange={(o) => { if (!o) setConfirmRows(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar {nConfirm} {nConfirm === 1 ? "vaga" : "vagas"}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{nConfirm === 1 ? "A vaga vira" : "As vagas viram"} Inclusão de Equipe (aguardando escalação) e {nConfirm === 1 ? "sai" : "saem"} desta lista.</p>
                <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-xs text-slate-700">
                  {(confirmRows ?? []).slice(0, MAX_LISTED).map((r) => (
                    <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-800">#{r.inclusionNumber}</span>
                      <span className="truncate font-semibold">{functionNameById.get(r.functionId) ?? "—"}</span>
                      {/* Lote de "todos os eventos" pode misturar eventos: o
                          aprovador precisa ver isso ANTES de confirmar. */}
                      {showEvent && <span className="truncate text-slate-500">{r.eventName ?? "—"}</span>}
                      <span className="ml-auto font-mono text-slate-500 whitespace-nowrap">{periodLabel(r)}</span>
                    </li>
                  ))}
                  {nConfirm > MAX_LISTED && (
                    <li className="px-3 py-1.5 text-slate-500">
                      … e mais {nConfirm - MAX_LISTED} {nConfirm - MAX_LISTED === 1 ? "vaga" : "vagas"}
                    </li>
                  )}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={busy || nConfirm === 0}
              onClick={(e) => { e.preventDefault(); if (confirmRows) onApprove(confirmRows); setConfirmRows(null); }}
            >
              {busy ? "Aprovando…" : `Aprovar (${nConfirm})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reprovar / devolver — comentário obrigatório */}
      <AlertDialog open={decision !== null} onOpenChange={(o) => { if (!o) setDecision(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              Vaga #{decision?.row.inclusionNumber} · {decision ? functionNameById.get(decision.row.functionId) ?? "Função" : ""}. {copy?.help}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="vaga-decision-comment" className="text-xs text-slate-600">Comentário para a área (obrigatório)</Label>
            <Textarea
              id="vaga-decision-comment" rows={3} maxLength={500} value={comment} required aria-required="true"
              onChange={(e) => setComment(e.target.value)} className="rounded-lg text-sm bg-white"
              placeholder="Explique o que precisa ser revisto — fica registrado no histórico da vaga."
            />
            <p className="text-[11px] text-slate-400">Sem comentário a área não sabe o que corrigir.</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={copy?.cls}
              disabled={busy || comment.trim() === ""}
              onClick={(e) => { e.preventDefault(); submitDecision(); }}
            >
              {copy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default AwaitingApproval;
