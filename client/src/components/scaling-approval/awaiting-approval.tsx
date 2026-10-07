/**
 * "Vagas aguardando aprovação": vagas em `sugestao_validada` — a área já validou
 * e agora depende do aprovador. Caminho normal do fluxo (regra de 19/08):
 * aprovar (em lote ou linha a linha), reprovar ou devolver para a área — as duas
 * últimas com comentário obrigatório.
 *
 * 07/10 (redesenho): a linha lê como a da Validação — função em cima,
 * "#número · observação" embaixo, o evento e o período na mesma coluna, a
 * logística em chips (ida, volta, passagem, hotel), e a decisão discreta à
 * direita: "Aprovar" em contorno verde (cheio só no hover) e os ícones de
 * devolver/reprovar sem borda. Abaixo de 1280px a MESMA tabela vira cartões
 * (CSS `.apr-tabela`). O lote saiu de um cartão branco no topo da lista para
 * a barra escura flutuante da Validação e da Escalação.
 */
import { useMemo, useState } from "react";
import { CheckCheck, CheckCircle2, Lock, MessageSquareText, Undo2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { cn, formatDiarias } from "@/lib/utils";
import { formatDateBr } from "@/lib/dates";
import { eventPeriodLabel, periodLabel, workDaysOf } from "@/components/scaling-validation/suggestions-list";
import { PeriodCell } from "@/components/scaling-validation/suggestions-list/suggestion-cells";
import { LogisticaDaVaga } from "./logistica-da-vaga";
import { NeedChips } from "@/components/scaling-validation/logistics-chips";
import { VagaCard, pessoasDiaDaVaga } from "@/components/scaling-validation/vaga-card";
import { ValidationNoteBlock, ValidationNoteHint } from "@/components/scaling-validation/validation-note-blocks";
import { EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";
import { daysAwaitingApproval } from "@shared/scaling-validation-rules";
import { isStaleDecisionError } from "./use-decisions";
import { APROVAR_DA_LINHA, ICONE_DA_LINHA, SOBRE_ESCURO, TH } from "./tokens";
import type { StalledRow as SuggestionRow, VagaDecisionKind } from "./types";
import { LinhaDoEvento } from "./linha-do-evento";

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
   * está travando a escala. Com um evento filtrado a linha do evento some.
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

const MAX_LISTED = 5;
const COMENTARIO_MAX = 500;

/**
 * Dias aguardando o aprovador — helper único do shared
 * (`daysAwaitingApproval`), o mesmo que o badge da Validação de Escala usa.
 * Conta a partir de `validatedAt`: o `daysPending` da linha conta desde o envio
 * da logística e incluiria o tempo da própria validação da área.
 */
export function daysAwaiting(row: SuggestionRow): number {
  return daysAwaitingApproval(row);
}

/** Quem validou e quando — o nome resolvido; sem nome, a data (nunca o UUID). */
function ValidatedCell({ row, userNameById }: { row: SuggestionRow; userNameById?: Map<string, string> }) {
  const name = row.validatedBy ? userNameById?.get(row.validatedBy) : undefined;
  const when = row.validatedAt ? formatDateBr(new Date(row.validatedAt)) : null;
  return (
    <span className="block text-xs text-slate-600">
      <span className="inline-flex items-center gap-1">
        {name ? <span className="font-medium text-foreground">{name}</span> : <span className="text-muted-foreground">Área responsável</span>}
        {/* Observação de quem validou (24/09): ícone com o texto no tooltip; o painel completo está no diálogo de decisão. */}
        <ValidationNoteHint note={row.validationNote} />
      </span>
      {when && <span className="block text-2xs tabular-nums text-muted-foreground">{when}</span>}
    </span>
  );
}

function LockedHint({ reason }: { reason: string }) {
  // Sem tab stop: a mesma razão já está escrita, visível, na coluna de
  // decisão ("Aprovador: …"). Aqui o cadeado é só o sinal — texto oculto para
  // o leitor de tela, tooltip para o mouse.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex h-5 items-center justify-center text-muted-foreground/70">
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="sr-only">{reason}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

/** Uma vaga numa linha de lista de diálogo: "#119 Cenotécnica · Maratona…". */
function LinhaDaVaga({ r, functionName, showEvent }: { r: SuggestionRow; functionName: string; showEvent: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="font-mono text-2xs font-medium tabular-nums text-muted-foreground">#{r.inclusionNumber}</span>
      <span className="break-words font-semibold text-foreground">{functionName}</span>
      {/* Lote de "todos os eventos" pode misturar eventos: o aprovador
          precisa ver isso ANTES de confirmar. */}
      {showEvent && <span className="break-words text-muted-foreground">{r.eventName ?? "Sem evento"}</span>}
    </div>
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

/** "O que acontece depois" — o mesmo desenho dos avisos do detalhe (filete + título em caixa de frase). */
function DepoisDaDecisao({ id, tom, children }: { id: string; tom: "danger" | "warning" | "success"; children: React.ReactNode }) {
  const cls = { danger: "border-danger/25 bg-danger-soft/60 text-danger", warning: "border-warning/25 bg-warning-soft/60 text-warning", success: "border-success/25 bg-success-soft/60 text-success" }[tom];
  return (
    <section className={cn("relative overflow-hidden rounded-xl border py-3 pl-4 pr-3.5", cls)} aria-labelledby={id}>
      <span className="absolute inset-y-0 left-0 w-[3px] bg-current opacity-70" aria-hidden="true" />
      <p id={id} className="text-[13px] font-semibold leading-5">O que acontece depois</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-700 marker:text-current">{children}</ul>
    </section>
  );
}

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
      <EstadoDaValidacao
        icone={<CheckCircle2 aria-hidden="true" />}
        titulo="Nenhuma vaga aguardando aprovação"
        texto="Quando uma área validar a escala sugerida, as vagas aparecem aqui para você aprovar, reprovar ou devolver."
        testId="aguardando-vazio"
      />
    );
  }

  const fnName = (r: SuggestionRow) => functionNameById.get(r.functionId) ?? "Sem função";
  /** Explicação de por que Reprovar/Devolver ficam desabilitados — visível, e os botões apontam para ela. */
  const dicaDoLote = podeLote
    ? "Devolver e reprovar: um comentário para todas."
    : `Reprovar e devolver: uma vaga por vez${nSel > 1 ? " — deixe só uma marcada para usar esses botões." : "."}`;

  return (
    <>
      {/* Barra de lote — escura e flutuante, a mesma da Validação e da Escalação. */}
      {nSel > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div role="region" aria-label="Ações para as vagas selecionadas"
            className="val-sobe pointer-events-auto flex w-full max-w-3xl flex-col items-stretch gap-2.5 rounded-xl bg-foreground px-3.5 py-2.5 text-white shadow-3 md:w-auto md:flex-row md:items-center md:gap-3 md:py-2 md:pl-4 md:pr-2">
            <div className="flex min-w-0 items-start gap-2.5 md:mr-1 md:items-center">
              <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-white/60 md:mt-0" aria-hidden="true" />
              <div className="min-w-0 flex-1 md:max-w-[300px]" aria-live="polite">
                <span className="block whitespace-nowrap text-sm font-semibold leading-5">{nSel} {nSel === 1 ? "vaga selecionada" : "vagas selecionadas"}</span>
                <span id="awaiting-uma-por-vez" className="block text-2xs leading-4 text-white/60">{dicaDoLote}</span>
              </div>
              <Button type="button" size="sm" variant="ghost" className="val-alvo h-8 w-8 shrink-0 rounded-lg p-0 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <span aria-hidden="true" className="hidden h-6 w-px bg-white/15 md:block" />
            <div className="flex flex-nowrap items-center gap-1.5 md:shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={-1} className="inline-flex flex-1 md:flex-none">
                    <Button type="button" size="sm" variant="ghost" className={cn(SOBRE_ESCURO, "w-full md:w-auto")} disabled={(!podeLote && !single) || busy} aria-describedby="awaiting-uma-por-vez" onClick={() => (podeLote ? openDecisionMany("devolver") : single && openDecision("devolver", single))}>
                      <Undo2 className="h-3.5 w-3.5 md:mr-1.5" aria-hidden="true" /> <span className="sr-only md:not-sr-only">Devolver para a área{podeLote && nSel > 1 ? ` (${nSel})` : ""}</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                {!podeLote && !single && <TooltipContent side="top" className="text-xs">Selecione apenas uma vaga para devolver</TooltipContent>}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={-1} className="inline-flex flex-1 md:flex-none">
                    <Button type="button" size="sm" variant="ghost" className={cn(SOBRE_ESCURO, "w-full hover:border-danger-strong/60 hover:bg-danger-strong/20 md:w-auto")} disabled={(!podeLote && !single) || busy} aria-describedby="awaiting-uma-por-vez" onClick={() => (podeLote ? openDecisionMany("reprovar") : single && openDecision("reprovar", single))}>
                      <XCircle className="h-3.5 w-3.5 md:mr-1.5" aria-hidden="true" /> <span className="sr-only md:not-sr-only">Reprovar{podeLote && nSel > 1 ? ` (${nSel})` : ""}</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                {!podeLote && !single && <TooltipContent side="top" className="text-xs">Selecione apenas uma vaga para reprovar</TooltipContent>}
              </Tooltip>
              <Button type="button" size="sm" className="val-alvo h-8 flex-[1.6] rounded-lg bg-success px-3 text-xs font-semibold text-white hover:bg-success/90 disabled:bg-white/10 disabled:text-white/40 disabled:opacity-100 md:flex-none" disabled={busy} onClick={() => setConfirmRows(selectedRows)}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Aprovar ({nSel})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabela (≥ xl) que vira cartões abaixo disso — ver `.apr-tabela`. Sem
          overflow aqui: o cabeçalho gruda abaixo da barra da tela. */}
      <div className="apr-tabela xl:rounded-xl xl:border xl:border-border xl:bg-card xl:shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Vagas validadas pela área, aguardando a decisão do aprovador</caption>
          <thead className="apr-cabecalho sticky z-10 border-b border-border bg-surface-muted [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
            <tr>
              <th scope="col" data-col={selectableIds.size > 0 ? "sel" : "sel-vazio"} className="w-11 py-2.5 pl-3 pr-1 text-left">
                <span className="inline-flex h-5 items-center gap-2.5">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    disabled={selectableIds.size === 0}
                    onCheckedChange={toggleAll}
                    className="data-[state=indeterminate]:bg-primary/70 data-[state=indeterminate]:text-primary-foreground"
                    aria-label={allSelected ? "Desmarcar todas as vagas" : "Selecionar todas as vagas que você pode decidir"}
                  />
                  <span className="apr-so-cartao whitespace-nowrap text-xs font-medium text-slate-600" aria-hidden="true">
                    {allSelected ? "Desmarcar todas" : `Selecionar todas (${selectableIds.size})`}
                  </span>
                </span>
              </th>
              <th scope="col" className={TH}>Vaga</th>
              <th scope="col" className={cn(TH, "hidden w-[160px] 2xl:table-cell")}>Período</th>
              <th scope="col" className={cn(TH, "w-[156px]")}>Validada por</th>
              <th scope="col" className={cn(TH, "w-[256px] 2xl:w-[360px]")}>Logística</th>
              <th scope="col" className={cn(TH, "w-[200px] text-right")}>Decisão</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selectable = selectableIds.has(row.id);
              const isSelected = selectable && selected.has(row.id);
              const approvers = approverNamesFor?.(row) ?? [];
              const lockReason = approvers.length ? `Aprovador: ${approvers.join(", ")}` : "Você não é aprovador desta função";
              const nome = fnName(row);
              const obs = row.observations?.trim();
              return (
                <tr key={row.id} data-testid={`awaiting-row-${row.inclusionNumber}`} data-selecionada={isSelected || undefined}
                  className={cn("apr-linha border-b border-border align-top last:border-b-0",
                    isSelected ? "bg-brand-soft/50" : "bg-card hover:bg-surface-muted/60")}>
                  <td data-col="sel" className="w-11 py-3 pl-3 pr-1">
                    <span className="inline-flex h-5 items-center">
                      {selectable ? (
                        <Checkbox checked={isSelected} onCheckedChange={() => toggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />
                      ) : (
                        <LockedHint reason={approvers.length ? `Você não é aprovador desta função. Aprovador: ${approvers.join(", ")}` : "Você não é aprovador desta função"} />
                      )}
                    </span>
                  </td>
                  <td data-primeira className="px-3 py-3">
                    <div className="min-w-0 space-y-0.5">
                      <span className="block break-words text-sm font-semibold leading-5 text-foreground" title={nome}>{nome}</span>
                      <span className="flex min-w-0 items-start gap-1.5 text-2xs leading-4">
                        <span className="shrink-0 font-mono font-medium tabular-nums text-muted-foreground">#{row.inclusionNumber}</span>
                        <span className="text-muted-foreground/60" aria-hidden="true">·</span>
                        {obs
                          ? <span className="line-clamp-2 min-w-0 text-slate-600" title={obs}>{obs}</span>
                          : <span className="text-muted-foreground">Sem observações</span>}
                      </span>
                      {showEvent && <LinhaDoEvento nome={row.eventName} periodo={eventPeriodLabel(row)} className="pt-1" />}
                      {/* Abaixo de 2xl o período é a última linha do bloco "Vaga". */}
                      <span className="block pt-0.5 text-xs text-foreground 2xl:hidden"><PeriodCell row={row} /></span>
                    </div>
                  </td>
                  <td data-col="so-tabela" className="hidden px-3 py-3 2xl:table-cell"><PeriodCell row={row} stacked /></td>
                  <td data-rotulo="Validada por" className="px-3 py-3"><ValidatedCell row={row} userNameById={userNameById} /></td>
                  <td data-rotulo="Logística" className="px-3 py-3"><LogisticaDaVaga row={row} /></td>
                  <td data-col="acoes" className="whitespace-nowrap py-2.5 pl-2 pr-3 text-right">
                    {selectable ? (
                      <span className="inline-flex items-center gap-0.5">
                        <button type="button" disabled={busy} onClick={() => openDecision("devolver", row)}
                          aria-label={`Devolver a vaga #${row.inclusionNumber} para a área`} title="Devolver para a área"
                          className={cn(ICONE_DA_LINHA, "hover:bg-warning-soft hover:text-warning")}>
                          <Undo2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" disabled={busy} onClick={() => openDecision("reprovar", row)}
                          aria-label={`Reprovar a vaga #${row.inclusionNumber}`} title="Reprovar vaga"
                          className={cn(ICONE_DA_LINHA, "mr-1 hover:bg-danger-soft hover:text-danger")}>
                          <XCircle className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" disabled={busy} onClick={() => setConfirmRows([row])}
                          aria-label={`Aprovar a vaga #${row.inclusionNumber}`} className={cn(APROVAR_DA_LINHA, "w-[92px]")}>
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Aprovar
                        </button>
                      </span>
                    ) : (
                      <span className="inline-block max-w-[190px] whitespace-normal text-left text-2xs leading-4 text-muted-foreground xl:text-right" title={lockReason}>{lockReason}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-xs text-slate-700">
          {(confirmRows ?? []).slice(0, MAX_LISTED).map((r) => {
            const quemValidou = r.validatedBy ? userNameById?.get(r.validatedBy) : undefined;
            return (
              <li key={r.id} className="space-y-1.5 px-3.5 py-2.5">
                <LinhaDaVaga r={r} functionName={fnName(r)} showEvent={showEvent} />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
                  <span className="tabular-nums text-slate-600">{periodLabel(r)}</span>
                  <span>· {formatDiarias(workDaysOf(r).length || r.dailyRates || 0)}</span>
                  <span>· validada por {quemValidou ?? "área responsável"}{r.validatedAt ? ` · ${formatDateBr(new Date(r.validatedAt))}` : ""}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.needsTicket || r.needsAccommodation
                    ? <NeedChips needsTicket={r.needsTicket} needsAccommodation={r.needsAccommodation} />
                    : <span className="text-2xs text-muted-foreground">Sem logística</span>}
                </div>
                {r.observations && <p className="line-clamp-2 text-2xs italic text-muted-foreground" title={r.observations}>{r.observations}</p>}
                {/* O que a área quis dizer ao validar — o aprovador lê ANTES de aprovar. */}
                {r.validationNote?.trim() && (
                  <p className="flex items-start gap-1.5 rounded-md bg-info-soft px-2 py-1.5 text-2xs text-info">
                    <MessageSquareText className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="whitespace-pre-line break-words"><span className="font-semibold">Observação da validação:</span> {r.validationNote.trim()}</span>
                  </p>
                )}
              </li>
            );
          })}
          {nConfirm > MAX_LISTED && (
            <li className="px-3.5 py-2 text-muted-foreground">
              … e mais {nConfirm - MAX_LISTED} {nConfirm - MAX_LISTED === 1 ? "vaga" : "vagas"}
            </li>
          )}
        </ul>
        {/* O que o lote significa somado — o número que o aprovador leva para
            a conversa com Compras e com a produção. Uma faixa, como o resumo. */}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
          {[
            { rotulo: "Pessoas-dia", valor: String(resumoLote.pessoasDia) },
            { rotulo: "Com passagem", valor: `${resumoLote.comPassagem} de ${nConfirm}` },
            { rotulo: "Com hotel", valor: `${resumoLote.comHotel} de ${nConfirm}` },
            { rotulo: "Espera mais longa", valor: resumoLote.esperaMaisLonga <= 0 ? "hoje" : `${resumoLote.esperaMaisLonga} ${resumoLote.esperaMaisLonga === 1 ? "dia" : "dias"}` },
          ].map((c) => (
            <div key={c.rotulo} className="bg-card px-3 py-2">
              <dt className="text-2xs text-muted-foreground">{c.rotulo}</dt>
              <dd className="text-sm font-semibold tabular-nums text-foreground">{c.valor}</dd>
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
        className="!max-w-[580px] max-h-[88vh] overflow-y-auto"
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
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-xs text-slate-700" data-testid="decisao-lote-lista">
            {decision.rows.slice(0, MAX_LISTED).map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3.5 py-2">
                <LinhaDaVaga r={r} functionName={fnName(r)} showEvent={showEvent} />
                <span className="text-2xs tabular-nums text-muted-foreground">{periodLabel(r)}</span>
              </li>
            ))}
            {nDec > MAX_LISTED && (
              <li className="px-3.5 py-2 text-muted-foreground">… e mais {nDec - MAX_LISTED} {nDec - MAX_LISTED === 1 ? "vaga" : "vagas"}</li>
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
            {/* Observação de quem validou (24/09) — o aprovador decide lendo o que a área quis dizer. */}
            <ValidationNoteBlock
              id="decisao-obs-validacao"
              note={decisionRow.validationNote}
              byName={decisionRow.validatedBy ? userNameById?.get(decisionRow.validatedBy) : undefined}
              at={decisionRow.validatedAt}
            />
            <DepoisDaDecisao id="vaga-depois" tom={decision.kind === "reprovar" ? "danger" : "warning"}>
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
            </DepoisDaDecisao>
          </>
        )}
        {/* Consequências do LOTE, somadas — o que muda para a produção e para Compras. */}
        {decision && nDec > 1 && (
          <DepoisDaDecisao id="vagas-depois" tom={decision.kind === "reprovar" ? "danger" : "warning"}>
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
          </DepoisDaDecisao>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="vaga-decision-comment" className="text-sm font-medium text-foreground">Comentário para a área (obrigatório)</Label>
          <Textarea
            id="vaga-decision-comment" rows={3} maxLength={COMENTARIO_MAX} value={comment} required aria-required="true"
            aria-describedby="vaga-decision-comment-dica"
            onChange={(e) => setComment(e.target.value)} className="rounded-lg bg-card text-sm text-foreground"
            placeholder="Explique o que precisa ser revisto — fica registrado no histórico da vaga."
          />
          <div className="flex items-center justify-between gap-2">
            <p id="vaga-decision-comment-dica" className="text-2xs text-muted-foreground">Sem comentário a área não sabe o que corrigir.</p>
            {comment.length > COMENTARIO_MAX - 100 && <span className="text-2xs tabular-nums text-muted-foreground" aria-live="polite">{comment.length}/{COMENTARIO_MAX}</span>}
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}


export default AwaitingApproval;
