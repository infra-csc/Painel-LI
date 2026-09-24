import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Lock, Undo2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { cn, formatDiarias } from "@/lib/utils";
import { formatDateBr } from "@/lib/dates";
import { eventPeriodLabel, periodLabel, workDaysOf } from "@/components/scaling-validation/suggestions-list";
import { VagaCard, pessoasDiaDaVaga } from "@/components/scaling-validation/vaga-card";
import { DANGER_DAYS, STALLED_DAYS, daysAwaitingApproval, pendingSeverity } from "@shared/scaling-validation-rules";
import { isStaleDecisionError } from "./use-decisions";
import { SECTION, STICKY_TD, STICKY_TH, TH } from "./tokens";
import { toneDaSeveridade } from "./request-badges";
import { StatusBadge } from "@/components/common/status-badge";
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
  /**
   * Aprovação em lote (POST /aprovar-lote). Devolva a Promise (`mutateAsync`):
   * o diálogo só fecha quando o servidor responde — fechar no clique deixava o
   * aprovador olhando a lista sem saber se o lote tinha entrado.
   */
  onApprove: (rows: SuggestionRow[]) => void | Promise<unknown>;
  /**
   * Reprovar / devolver: uma vaga por vez, comentário obrigatório. Devolva a
   * Promise da mutation (`mutateAsync`): o diálogo só fecha e só limpa o
   * comentário quando ela RESOLVE — num 500 o texto continua ali para reenviar.
   */
  onDecide: (row: SuggestionRow, kind: VagaDecisionKind, comment: string) => void | Promise<unknown>;
  /**
   * Reprovar / devolver em LOTE com um comentário único (11/09). Sem esta
   * prop os botões da barra voltam a exigir uma vaga só.
   */
  onDecideMany?: (rows: SuggestionRow[], kind: VagaDecisionKind, comment: string) => void | Promise<unknown>;
}

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
  // StatusBadge único (23/09): mesmo tom de atraso da Validação e da fila de pedidos.
  if (sev === "ok") {
    return <StatusBadge tone="neutral" icon={Clock}>{text}</StatusBadge>;
  }
  const danger = sev === "danger";
  const explicacao = danger ? `Aguardando aprovação há ${DANGER_DAYS} dias ou mais — priorize.` : `Aguardando aprovação há ${STALLED_DAYS} dias ou mais.`;
  // Sem tab stop (04/09): um badge só de leitura não é um controle. O leitor de
  // tela recebe a explicação pelo texto oculto; o mouse, pelo tooltip.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <StatusBadge tone={toneDaSeveridade(sev)} icon={Clock}>
          {text}
          <span className="sr-only"> — {explicacao}</span>
        </StatusBadge>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{explicacao}</TooltipContent>
    </Tooltip>
  );
}

const CHIP = "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium whitespace-nowrap";

function TravelCell({ row }: { row: SuggestionRow }) {
  const items = [
    { on: !!row.needsTicket, label: "Passagem", title: "Precisa de passagem", cls: "bg-brand-soft text-primary" },
    { on: !!row.needsAccommodation, label: "Hotel", title: "Precisa de hospedagem", cls: "bg-info-soft text-info" },
  ].filter((i) => i.on);
  if (items.length === 0) {
    // Ausência não ganha chip: numa coluna de chips coloridos, o chip cinza
    // pesa igual a uma necessidade real. Quem não precisa de nada se diz em
    // palavra e em tom discreto.
    return <span className="text-2xs text-muted-foreground">Sem logística</span>;
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
      {name ? <span className="font-semibold text-slate-700">{name}</span> : <span className="text-muted-foreground">Área responsável</span>}
      {when && <span className="block font-mono tabular-nums text-2xs text-muted-foreground">{when}</span>}
    </span>
  );
}

function LockedHint({ reason }: { reason: string }) {
  // Sem tab stop: a mesma razão já está escrita, visível, na coluna "Decisão"
  // da linha ("Aprovador: …"). Aqui o cadeado é só o sinal — texto oculto para
  // o leitor de tela, tooltip para o mouse.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center justify-center text-muted-foreground">
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="sr-only">{reason}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

// `tone` do ConfirmDialog: reprovar é destrutivo (botão em destructive, foco no
// Cancelar); devolver não apaga nada e fica no tom padrão.
const DECISION_COPY: Record<VagaDecisionKind, { title: string; help: string; action: string; tone: "danger" | "default" }> = {
  reprovar: {
    title: "Reprovar vaga validada?",
    help: "A vaga sai da escala e fica registrada como negada. Explique o motivo para a área.",
    action: "Reprovar",
    tone: "danger",
  },
  devolver: {
    title: "Devolver a vaga para a área?",
    help: "A vaga volta para “aguardando validação da área” e o contador de atraso recomeça. Diga o que precisa ser revisto.",
    action: "Devolver",
    tone: "default",
  },
};

/**
 * "Vagas aguardando aprovação": vagas em `sugestao_validada` — a área já validou
 * e agora depende do aprovador. Caminho normal do fluxo (regra de 19/08):
 * aprovar (em lote ou linha a linha), reprovar ou devolver para a área — as duas
 * últimas com comentário obrigatório, uma vaga por vez.
 */
export function AwaitingApproval({
  rows, functionNameById, userNameById, approverNamesFor, showEvent = false, busy, onApprove, onDecide, onDecideMany,
}: AwaitingApprovalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Vagas do diálogo de aprovação — o da barra (seleção) e o do botão da linha usam o mesmo. */
  const [confirmRows, setConfirmRows] = useState<SuggestionRow[] | null>(null);
  /** Uma vaga (botão da linha) ou o lote selecionado (barra) — um comentário para todas. */
  const [decision, setDecision] = useState<{ kind: VagaDecisionKind; rows: SuggestionRow[] } | null>(null);
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

  const openDecision = (kind: VagaDecisionKind, row: SuggestionRow) => { setComment(""); setDecision({ kind, rows: [row] }); };
  const openDecisionMany = (kind: VagaDecisionKind) => { if (selectedRows.length === 0) return; setComment(""); setDecision({ kind, rows: selectedRows }); };
  /** A barra decide em lote quando a página deu o `onDecideMany`; senão, só com uma vaga marcada. */
  const podeLote = !!onDecideMany;
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
      if (decision.rows.length === 1 || !onDecideMany) await onDecide(decision.rows[0], decision.kind, text);
      else await onDecideMany(decision.rows, decision.kind, text);
      setDecision(null);
      setComment("");
    } catch (err) {
      if (isStaleDecisionError(err)) { setDecision(null); setComment(""); }
    }
  };
  /** Aprovar (lote ou uma vaga): mesma regra — fecha só quando o servidor responde. */
  const submitApprove = async () => {
    if (!confirmRows || confirmRows.length === 0) return;
    try {
      await onApprove(confirmRows);
      setConfirmRows(null);
    } catch (err) {
      if (isStaleDecisionError(err)) setConfirmRows(null);
    }
  };

  const copy = decision ? DECISION_COPY[decision.kind] : null;
  /** A vaga única do diálogo de decisão (lote → null: o diálogo lista as marcadas). */
  const decisionRow = decision && decision.rows.length === 1 ? decision.rows[0] : null;
  const nDec = decision?.rows.length ?? 0;
  const pessoasDiaDoLote = (decision?.rows ?? []).reduce((soma, r) => soma + pessoasDiaDaVaga(r), 0);
  const comprasDoLote = (decision?.rows ?? []).filter((r) => r.needsTicket || r.needsAccommodation).length;
  const nConfirm = confirmRows?.length ?? 0;
  /**
   * O lote somado: o que o aprovador leva para Compras e para a produção.
   * FICA ANTES do retorno de lista vazia (11/09): este useMemo estava depois
   * dele, e quando o lote aprovava TODAS as vagas a lista esvaziava, o
   * componente retornava cedo com um hook a menos e o React derrubava a
   * página inteira ("Algo deu errado") logo após a aprovação em lote.
   */
  const resumoLote = useMemo(() => {
    const linhas = confirmRows ?? [];
    return {
      pessoasDia: linhas.reduce((soma, r) => soma + pessoasDiaDaVaga(r), 0),
      comPassagem: linhas.filter((r) => r.needsTicket).length,
      comHotel: linhas.filter((r) => r.needsAccommodation).length,
      esperaMaisLonga: linhas.reduce((maior, r) => Math.max(maior, daysAwaiting(r)), 0),
    };
  }, [confirmRows]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nenhuma vaga aguardando aprovação"
        description="Quando uma área validar a escala sugerida, as vagas aparecem aqui para você aprovar, reprovar ou devolver."
      />
    );
  }


  return (
    <>
      {nSel > 0 && (
        <div role="region" aria-label="Ações para as vagas selecionadas"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <div className="mr-auto min-w-0">
            <span className="block text-sm font-semibold text-slate-700">{nSel} {nSel === 1 ? "vaga selecionada" : "vagas selecionadas"}</span>
            {/* A explicação de por que Reprovar/Devolver ficam desabilitados
                com 2+ selecionadas é ESTA linha, visível — os botões apontam
                para ela por aria-describedby, e o wrapper não é mais tab stop. */}
            <span id="awaiting-uma-por-vez" className="block text-2xs text-muted-foreground">
              {podeLote
                ? "Devolver e reprovar em lote usam um comentário só, para todas as marcadas."
                : `Reprovar e devolver: uma vaga por vez${nSel > 1 ? " — deixe só uma marcada para usar esses botões." : "."}`}
            </span>
          </div>
          <Button type="button" size="sm" variant="ghost" className={cn(ICON_BTN, "text-muted-foreground")} onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
            <X className="w-4 h-4" />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={-1} className="inline-flex">
                <Button type="button" size="sm" variant="outline" className="h-7 rounded-lg text-xs" disabled={(!podeLote && !single) || busy} aria-describedby="awaiting-uma-por-vez" onClick={() => (podeLote ? openDecisionMany("devolver") : single && openDecision("devolver", single))}>
                  <Undo2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Devolver para a área{podeLote && nSel > 1 ? ` (${nSel})` : ""}
                </Button>
              </span>
            </TooltipTrigger>
            {!podeLote && !single && <TooltipContent side="top" className="text-xs">Selecione apenas uma vaga para devolver</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={-1} className="inline-flex">
                <Button type="button" size="sm" variant="outline" className="h-7 rounded-lg text-xs text-danger border-danger/25 hover:bg-danger-soft" disabled={(!podeLote && !single) || busy} aria-describedby="awaiting-uma-por-vez" onClick={() => (podeLote ? openDecisionMany("reprovar") : single && openDecision("reprovar", single))}>
                  <XCircle className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Reprovar{podeLote && nSel > 1 ? ` (${nSel})` : ""}
                </Button>
              </span>
            </TooltipTrigger>
            {!podeLote && !single && <TooltipContent side="top" className="text-xs">Selecione apenas uma vaga para reprovar</TooltipContent>}
          </Tooltip>
          <Button type="button" size="sm" className="h-7 rounded-lg text-xs bg-success hover:bg-success/90 text-white" disabled={busy} onClick={() => setConfirmRows(selectedRows)}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Aprovar ({nSel})
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <caption className="sr-only">Vagas validadas pela área, aguardando a decisão do aprovador</caption>
            <thead className="bg-surface-muted">
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
                <th scope="col" className={cn(TH, "text-center")}>Logística</th>
                <th scope="col" className={cn(TH, STICKY_TH, "text-right min-w-[210px]")}>Decisão</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const selectable = selectableIds.has(row.id);
                const isSelected = selectable && selected.has(row.id);
                const approvers = approverNamesFor?.(row) ?? [];
                const lockReason = approvers.length ? `Aprovador: ${approvers.join(", ")}` : "Você não é aprovador desta função";
                const days = workDaysOf(row);
                const fnName = functionNameById.get(row.functionId) ?? "Sem função";
                // Fundo OPACO na célula grudada: as outras colunas passam por baixo dela na rolagem.
                const stickyBg = isSelected ? "bg-brand-soft" : i % 2 === 1 ? "bg-surface-muted" : "bg-card";
                return (
                  <tr key={row.id} data-testid={`awaiting-row-${row.inclusionNumber}`}
                    className={cn("border-b border-border", isSelected ? "bg-brand-soft/50" : i % 2 === 1 ? "bg-surface-muted/50" : "bg-card")}>
                    <td className="px-1 py-2 text-center align-middle">
                      {selectable ? (
                        <Checkbox checked={isSelected} onCheckedChange={() => toggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />
                      ) : (
                        <LockedHint reason={approvers.length ? `Você não é aprovador desta função. Aprovador: ${approvers.join(", ")}` : "Você não é aprovador desta função"} />
                      )}
                    </td>
                    <td className="px-2.5 py-2 align-middle max-w-[260px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-2xs font-semibold text-primary tabular-nums">#{row.inclusionNumber}</span>
                        <div className="min-w-0">
                          <span className="block font-semibold text-foreground break-words" title={fnName}>{fnName}</span>
                          <span className="block text-2xs text-muted-foreground line-clamp-2 break-words" title={row.observations ?? undefined}>
                            {row.observations || "Sem observações"}
                          </span>
                        </div>
                      </div>
                    </td>
                    {showEvent && (
                      <td className="px-2.5 py-2 align-middle max-w-[220px]">
                        <span className="block break-words text-sm font-semibold text-slate-700" title={row.eventName ?? undefined}>
                          {row.eventName ?? "Evento sem nome"}
                        </span>
                        <span className="block font-mono text-2xs text-muted-foreground">{eventPeriodLabel(row) || "Sem período"}</span>
                      </td>
                    )}
                    <td className="px-2.5 py-2 align-middle whitespace-nowrap">
                      <span className="font-mono tabular-nums text-xs text-slate-700">{periodLabel(row)}</span>
                      <span className="ml-1.5 text-2xs text-muted-foreground">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
                    </td>
                    <td className="px-2.5 py-2 align-middle"><ValidatedCell row={row} userNameById={userNameById} /></td>
                    <td className="px-2.5 py-2 align-middle text-center"><TravelCell row={row} /></td>
                    <td className={cn("px-2.5 py-2 align-middle text-right", STICKY_TD, stickyBg)}>
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
                              <Button type="button" size="sm" variant="outline" className={cn(ICON_BTN, "text-danger border-danger/25 hover:bg-danger-soft")} disabled={busy}
                                onClick={() => openDecision("reprovar", row)} aria-label={`Reprovar a vaga #${row.inclusionNumber}`}>
                                <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Reprovar vaga</TooltipContent>
                          </Tooltip>
                          <Button type="button" size="sm" className="h-7 rounded-lg px-2.5 text-xs bg-success hover:bg-success/90 text-white" disabled={busy}
                            onClick={() => setConfirmRows([row])} aria-label={`Aprovar a vaga #${row.inclusionNumber}`}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Aprovar
                          </Button>
                        </span>
                      ) : (
                        <span className="text-2xs text-muted-foreground inline-block max-w-[220px] line-clamp-2" title={lockReason}>{lockReason}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Aprovar (lote ou uma vaga) — ConfirmDialog único (23/09) */}
      <ConfirmDialog
        open={confirmRows !== null}
        onOpenChange={(o) => { if (!o && !busy) setConfirmRows(null); }}
        title={`Aprovar ${nConfirm} ${nConfirm === 1 ? "vaga" : "vagas"}?`}
        icon={CheckCircle2}
        className="!max-w-[600px] max-h-[88vh] overflow-y-auto"
        cancelLabel="Voltar"
        confirmLabel={busy ? "Aprovando…" : `Aprovar (${nConfirm})`}
        pending={busy}
        confirmDisabled={nConfirm === 0}
        onConfirm={() => { void submitApprove(); }}
      >
                <p>{nConfirm === 1 ? "A vaga vira" : "As vagas viram"} Inclusão de Equipe (aguardando escalação) e {nConfirm === 1 ? "sai" : "saem"} desta lista.</p>
                {/* Uma linha por vaga, com o que a decisão precisa: aprovar em
                    lote não pode ser aprovar às cegas. */}
                <ul className="rounded-lg border border-border bg-card divide-y divide-border text-xs text-slate-700">
                  {(confirmRows ?? []).slice(0, MAX_LISTED).map((r) => {
                    const quemValidou = r.validatedBy ? userNameById?.get(r.validatedBy) : undefined;
                    return (
                      <li key={r.id} className="space-y-1 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-2xs font-semibold text-primary">#{r.inclusionNumber}</span>
                          <span className="break-words font-semibold">{functionNameById.get(r.functionId) ?? "Sem função"}</span>
                          {/* Lote de "todos os eventos" pode misturar eventos: o
                              aprovador precisa ver isso ANTES de confirmar. */}
                          {showEvent && <span className="break-words text-muted-foreground">{r.eventName ?? "Sem evento"}</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
                          <span className="font-mono tabular-nums text-slate-600">{periodLabel(r)}</span>
                          <span>· {formatDiarias(workDaysOf(r).length || r.dailyRates || 0)}</span>
                          <span>· validada por {quemValidou ?? "área responsável"}{r.validatedAt ? ` · ${formatDateBr(new Date(r.validatedAt))}` : ""}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.needsTicket || r.needsAccommodation ? (
                            <>
                              {r.needsTicket && <span className={cn(CHIP, "bg-brand-soft text-primary")}>Passagem</span>}
                              {r.needsAccommodation && <span className={cn(CHIP, "bg-info-soft text-info")}>Hotel</span>}
                            </>
                          ) : <span className="text-2xs text-muted-foreground">Sem logística</span>}
                        </div>
                        {r.observations && <p className="line-clamp-2 text-2xs italic text-muted-foreground" title={r.observations}>{r.observations}</p>}
                      </li>
                    );
                  })}
                  {nConfirm > MAX_LISTED && (
                    <li className="px-3 py-1.5 text-muted-foreground">
                      … e mais {nConfirm - MAX_LISTED} {nConfirm - MAX_LISTED === 1 ? "vaga" : "vagas"}
                    </li>
                  )}
                </ul>
                {/* O que o lote significa somado — é o número que o aprovador
                    leva para a conversa com Compras e com a produção. */}
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { rotulo: "Pessoas-dia", valor: String(resumoLote.pessoasDia) },
                    { rotulo: "Com passagem", valor: `${resumoLote.comPassagem} de ${nConfirm}` },
                    { rotulo: "Com hotel", valor: `${resumoLote.comHotel} de ${nConfirm}` },
                    { rotulo: "Espera mais longa", valor: resumoLote.esperaMaisLonga <= 0 ? "hoje" : `${resumoLote.esperaMaisLonga} ${resumoLote.esperaMaisLonga === 1 ? "dia" : "dias"}` },
                  ].map((c) => (
                    <div key={c.rotulo} className="rounded-lg border border-border bg-card px-2.5 py-1.5">
                      <dt className={SECTION}>{c.rotulo}</dt>
                      <dd className="text-sm font-bold tabular-nums text-foreground">{c.valor}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-2xs text-muted-foreground">
                  Depois de aprovar, a alteração só é possível na Escalação — voltar exige pedido de ajuste da área.
                </p>
      </ConfirmDialog>

      {/* Reprovar / devolver — comentário obrigatório (o textarea vai em `children`) */}
      <ConfirmDialog
        open={decision !== null}
        onOpenChange={(o) => { if (!o && !busy) setDecision(null); }}
        title={nDec > 1 ? (decision?.kind === "reprovar" ? `Reprovar ${nDec} vagas?` : `Devolver ${nDec} vagas para a área?`) : copy?.title}
        description={nDec > 1 ? `${copy?.help ?? ""} O mesmo comentário vai para todas as ${nDec} vagas.` : copy?.help}
        icon={decision?.kind === "reprovar" ? XCircle : Undo2}
        tone={copy?.tone ?? "default"}
        className="!max-w-[560px] max-h-[88vh] overflow-y-auto"
        cancelLabel="Voltar"
        confirmLabel={busy ? "Decidindo…" : nDec > 1 ? `${copy?.action} (${nDec})` : copy?.action}
        pending={busy}
        confirmDisabled={comment.trim() === ""}
        onConfirm={() => { void submitDecision(); }}
      >
          {/* A vaga se apresenta antes do botão: decidir por "#128" sem ver
              período, logística e quem validou é decidir no escuro. No lote,
              uma linha por vaga (as primeiras MAX_LISTED) — nunca às cegas. */}
          {decision && nDec > 1 && (
            <ul className="rounded-lg border border-border bg-card divide-y divide-border text-xs text-slate-700" data-testid="decisao-lote-lista">
              {decision.rows.slice(0, MAX_LISTED).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5">
                  <span className="rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-2xs font-semibold text-primary">#{r.inclusionNumber}</span>
                  <span className="break-words font-semibold">{functionNameById.get(r.functionId) ?? "Sem função"}</span>
                  {showEvent && <span className="break-words text-muted-foreground">{r.eventName ?? "Sem evento"}</span>}
                  <span className="font-mono tabular-nums text-2xs text-muted-foreground">{periodLabel(r)}</span>
                </li>
              ))}
              {nDec > MAX_LISTED && (
                <li className="px-3 py-1.5 text-muted-foreground">… e mais {nDec - MAX_LISTED} {nDec - MAX_LISTED === 1 ? "vaga" : "vagas"}</li>
              )}
            </ul>
          )}
          {decision && decisionRow && (
            <>
              <VagaCard
                row={decisionRow}
                functionName={functionNameById.get(decisionRow.functionId)}
                nota={decisionRow.validatedAt
                  ? `Validada por ${(decisionRow.validatedBy && userNameById?.get(decisionRow.validatedBy)) ?? "área responsável"} · ${formatDateBr(new Date(decisionRow.validatedAt))}`
                  : "A área nunca validou esta vaga."}
              />
              <section
                className={cn("rounded-xl border p-3 space-y-1.5", decision.kind === "reprovar" ? "border-danger/25 bg-danger-soft/60" : "border-warning/25 bg-warning-soft/60")}
                aria-labelledby="vaga-depois"
              >
                <p id="vaga-depois" className={cn("text-2xs font-bold uppercase tracking-wide", decision.kind === "reprovar" ? "text-danger" : "text-warning")}>
                  O que acontece depois
                </p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
                  {decision.kind === "reprovar" ? (
                    <>
                      <li>A vaga sai da escala e fica registrada como negada.</li>
                      <li>
                        Saem <span className="font-semibold tabular-nums">{pessoasDiaDaVaga(decisionRow)}</span>{" "}
                        {pessoasDiaDaVaga(decisionRow) === 1 ? "pessoa-dia" : "pessoas-dia"} do total do evento.
                      </li>
                      <li>
                        {decisionRow.needsTicket || decisionRow.needsAccommodation
                          ? <>Compras deixa de comprar {[decisionRow.needsTicket ? "passagem" : null, decisionRow.needsAccommodation ? "hospedagem" : null].filter(Boolean).join(" e ")}.</>
                          : <>Nenhuma compra é afetada.</>}
                      </li>
                      <li>A validação da área é desfeita — para a vaga voltar, a área precisa sugerir de novo.</li>
                    </>
                  ) : (
                    <>
                      <li>A vaga volta para “aguardando validação da área”, com os dados como estão.</li>
                      <li>O contador de atraso recomeça do zero.</li>
                      <li>A validação já feita é desfeita: a área precisa validar de novo depois de rever.</li>
                      <li>Nada é apagado — nenhum dado da vaga se perde ao devolver.</li>
                    </>
                  )}
                  <li>Seu comentário fica no histórico da vaga e é o que a área lê.</li>
                </ul>
              </section>
            </>
          )}
          {/* Consequências do LOTE, somadas — o que muda para a produção e para Compras. */}
          {decision && nDec > 1 && (
            <section
              className={cn("rounded-xl border p-3 space-y-1.5", decision.kind === "reprovar" ? "border-danger/25 bg-danger-soft/60" : "border-warning/25 bg-warning-soft/60")}
              aria-labelledby="vagas-depois"
            >
              <p id="vagas-depois" className={cn("text-2xs font-bold uppercase tracking-wide", decision.kind === "reprovar" ? "text-danger" : "text-warning")}>
                O que acontece depois
              </p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
                {decision.kind === "reprovar" ? (
                  <>
                    <li>As {nDec} vagas saem da escala e ficam registradas como negadas.</li>
                    <li>Saem <span className="font-semibold tabular-nums">{pessoasDiaDoLote}</span> {pessoasDiaDoLote === 1 ? "pessoa-dia" : "pessoas-dia"} do total.</li>
                    <li>{comprasDoLote > 0 ? `Compras deixa de comprar passagem/hospedagem de ${comprasDoLote} ${comprasDoLote === 1 ? "vaga" : "vagas"}.` : "Nenhuma compra é afetada."}</li>
                  </>
                ) : (
                  <>
                    <li>As {nDec} vagas voltam para “aguardando validação da área”, com os dados como estão.</li>
                    <li>O contador de atraso de cada uma recomeça do zero; a área precisa validar de novo.</li>
                    <li>Nada é apagado — nenhum dado das vagas se perde ao devolver.</li>
                  </>
                )}
                <li>O mesmo comentário fica no histórico de cada vaga e é o que a área lê.</li>
                <li>Uma decisão por vaga, em sequência: se alguma falhar, as outras continuam e o aviso diz quais ficaram.</li>
              </ul>
            </section>
          )}
          <div className="space-y-1">
            <Label htmlFor="vaga-decision-comment" className="text-xs text-slate-600">Comentário para a área (obrigatório)</Label>
            <Textarea
              id="vaga-decision-comment" rows={3} maxLength={500} value={comment} required aria-required="true"
              onChange={(e) => setComment(e.target.value)} className="rounded-lg text-sm bg-card"
              placeholder="Explique o que precisa ser revisto — fica registrado no histórico da vaga."
            />
            <p className="text-2xs text-muted-foreground">Sem comentário a área não sabe o que corrigir.</p>
          </div>
      </ConfirmDialog>
    </>
  );
}

export default AwaitingApproval;
