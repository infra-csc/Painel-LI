/**
 * "Vagas paradas": sugestões que a área nunca validou (sugestao_pendente, sem
 * pedido) há ≥ STALLED_DAYS dias. O aprovador pode aprovar direto ou reprovar (bypass).
 *
 * 07/10 (redesenho): a explicação virou uma faixa curta e calma (era um bloco
 * âmbar de três parágrafos que gritava mais do que as vagas), a tabela usa a
 * linha da Validação e vira cartões abaixo de 1280px (`.apr-tabela`), e o lote
 * foi para a barra escura flutuante — o mesmo desenho das vagas aguardando.
 */
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCheck, CheckCircle2, Clock, Timer, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { cn } from "@/lib/utils";
import { formatDateBr } from "@/lib/dates";
import { PeriodCell } from "@/components/scaling-validation/suggestions-list/suggestion-cells";
import { LogisticaDaVaga } from "./logistica-da-vaga";
import { eventPeriodLabel } from "@/components/scaling-validation/suggestions-list";
import { VagaCard, pessoasDiaDaVaga } from "@/components/scaling-validation/vaga-card";
import { EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";
import { DANGER_DAYS, STALLED_DAYS } from "@shared/scaling-validation-rules";
import { isStaleDecisionError } from "./use-decisions";
import { APROVAR_DA_LINHA, ICONE_DA_LINHA, SOBRE_ESCURO, TH } from "./tokens";
import type { StalledRow as SuggestionRow } from "./types";
import { LinhaDoEvento } from "./linha-do-evento";

interface StalledSuggestionsProps {
  rows: SuggestionRow[];
  functionNameById: Map<string, string>;
  /**
   * Se o usuário pode decidir ESTA vaga — vem do servidor (`canDecide` por linha
   * no GET de sugestões). O servidor confere a mesma regra (403 fora disso) — aqui
   * só evitamos mostrar botões que vão falhar.
   */
  canActOn: (row: SuggestionRow) => boolean;
  /** Nome(s) do(s) aprovador(es) da função da linha, para explicar quem decide. */
  approverNamesFor?: (row: SuggestionRow) => string[];
  /**
   * "Todos os eventos": a linha do evento aparece (a lista mistura eventos e a
   * ordem continua sendo pelo tempo parado). Com filtro por evento ela some.
   */
  showEvent?: boolean;
  /** Decidir VÁRIAS de uma vez (lote) — mesma decisão, mesmo comentário. */
  onDecideMany?: (rows: SuggestionRow[], kind: "approve" | "reject", comment?: string) => Promise<unknown> | void;
  busy?: boolean;
  /**
   * Devolva a Promise da mutation (`mutateAsync`): o diálogo só fecha quando o
   * servidor confirma — num 500 o comentário continua ali para reenviar.
   */
  onDecide: (row: SuggestionRow, kind: "approve" | "reject", comment?: string) => void | Promise<unknown>;
}

/**
 * Desde quando a vaga espera a área — a DATA do envio da logística, em tom
 * neutro. Sem "há N dias" em vermelho (regra do dono, 04/09: contagem de dias
 * virava alarme permanente sem mudar a decisão); a ordem da lista já põe a
 * mais antiga no topo.
 */
function SugeridaEm({ row }: { row: SuggestionRow }) {
  const quando = row.suggestionSentAt ?? row.createdAt;
  return (
    <span className="block text-xs text-slate-600">
      <span className="block font-medium tabular-nums text-foreground">{quando ? formatDateBr(new Date(quando)) : "Sem data"}</span>
      <span className="block text-2xs text-muted-foreground">enviada pela logística</span>
    </span>
  );
}

export function StalledSuggestions({ rows, functionNameById, canActOn, approverNamesFor, showEvent = false, busy, onDecide, onDecideMany }: StalledSuggestionsProps) {
  /** O diálogo serve a UMA vaga (botão da linha) ou a VÁRIAS (barra de seleção). */
  const [confirm, setConfirm] = useState<{ rows: SuggestionRow[]; kind: "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selecionaveis = useMemo(() => rows.filter((r) => canActOn(r)), [rows, canActOn]);
  const selecionadas = useMemo(() => selecionaveis.filter((r) => selected.has(r.id)), [selecionaveis, selected]);
  const todasMarcadas = selecionaveis.length > 0 && selecionadas.length === selecionaveis.length;
  const alternar = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarTodas = () => setSelected(todasMarcadas ? new Set() : new Set(selecionaveis.map((r) => r.id)));
  const openConfirm = (row: SuggestionRow, kind: "approve" | "reject") => { setComment(""); setConfirm({ rows: [row], kind }); };
  const openConfirmMany = (kind: "approve" | "reject") => { if (selecionadas.length) { setComment(""); setConfirm({ rows: selecionadas, kind }); } };
  /**
   * Fecha SÓ no sucesso (04/09, mesmo padrão de "Vagas aguardando aprovação"):
   * fechar no clique jogava fora o comentário num 500 e deixava o aprovador sem
   * saber se a decisão entrou. A exceção é o item que mudou por baixo (404/409):
   * a vaga saiu da lista, então o diálogo fecha — o toast vem da mutation.
   */
  const doConfirm = async () => {
    if (!confirm) return;
    const texto = comment.trim() || undefined;
    try {
      if (confirm.rows.length === 1 || !onDecideMany) {
        for (const row of confirm.rows) await onDecide(row, confirm.kind, texto);
      } else {
        await onDecideMany(confirm.rows, confirm.kind, texto);
      }
      setSelected(new Set());
      setConfirm(null);
    } catch (err) {
      if (isStaleDecisionError(err)) { setSelected(new Set()); setConfirm(null); }
    }
  };
  const unica = confirm && confirm.rows.length === 1 ? confirm.rows[0] : null;
  const nConfirm = confirm?.rows.length ?? 0;
  /** O botão declara o destino da vaga — como no diálogo de reajustar/negar da fila. */
  const rotuloAcao = busy
    ? "Decidindo…"
    : confirm?.kind === "approve"
      ? `Aprovar direto${nConfirm > 1 ? ` (${nConfirm})` : ""} · vira Inclusão`
      : `Reprovar${nConfirm > 1 ? ` (${nConfirm})` : ""} · fica negada`;

  if (rows.length === 0) {
    return (
      <EstadoDaValidacao
        icone={<CheckCircle2 aria-hidden="true" />}
        titulo="Nenhuma vaga parada na área"
        texto={showEvent
          ? `Vaga parada é a que a área responsável não validou há ${STALLED_DAYS} dias ou mais. Hoje nenhum evento tem uma assim.`
          : `Vaga parada é a que a área responsável não validou há ${STALLED_DAYS} dias ou mais. Neste evento todas as pendentes são mais recentes ou já têm pedido aberto.`}
        testId="paradas-vazio"
      />
    );
  }

  const nSel = selecionadas.length;
  const podeSelecionar = !!onDecideMany && selecionaveis.length > 0;

  return (
    <>
      {/* O que é uma vaga "parada" e o que o aprovador faz com ela (dono,
          11/09: "está estranho, não dá para entender o que é"). Faixa neutra:
          a cor de alerta fica para o "parada há N dias" de cada vaga. */}
      <section className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted/70 px-4 py-3 text-xs leading-relaxed text-slate-700" aria-labelledby="paradas-o-que-e" data-testid="paradas-explicacao">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card text-warning ring-1 ring-border" aria-hidden="true">
          <Timer className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 space-y-1">
          <p id="paradas-o-que-e" className="text-[13px] font-semibold leading-5 text-foreground">O que é uma vaga parada</p>
          <p>
            A Logística sugeriu a vaga, mas a <span className="font-semibold text-foreground">área responsável não validou nem pediu ajuste há {STALLED_DAYS} dias ou mais</span>.
            Enquanto isso ela não chega em você pelo caminho normal — e a escala do evento fica travada.
          </p>
          <p>
            <span className="font-semibold text-foreground">O que você pode fazer:</span> destravar por cima da área — <span className="font-semibold text-foreground">Aprovar direto</span> (a vaga vira Inclusão sem a validação da área)
            ou <span className="font-semibold text-foreground">Reprovar</span> (fica registrada como negada). Se preferir esperar a área validar, não faça nada aqui. A decisão fica no histórico da vaga.
          </p>
        </div>
      </section>

      {/* Barra de lote (04/09): decidir 17 vagas paradas uma a uma era 17
          confirmações iguais. Escura e flutuante desde 07/10. */}
      {onDecideMany && nSel > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div role="region" aria-label="Ações para as vagas paradas selecionadas" data-testid="paradas-lote"
            className="val-sobe pointer-events-auto flex w-full max-w-2xl flex-col items-stretch gap-2.5 rounded-xl bg-foreground px-3.5 py-2.5 text-white shadow-3 sm:w-auto sm:flex-row sm:items-center sm:gap-3 sm:py-2 sm:pl-4 sm:pr-2">
            <div className="flex min-w-0 items-center gap-2.5 sm:mr-1">
              <CheckCheck className="h-4 w-4 shrink-0 text-white/60" aria-hidden="true" />
              <div className="min-w-0 flex-1" aria-live="polite">
                <span className="block whitespace-nowrap text-sm font-semibold leading-5 tabular-nums">{nSel} {nSel === 1 ? "vaga selecionada" : "vagas selecionadas"}</span>
                <span className="block text-2xs leading-4 text-white/60">Uma decisão e um comentário para todas as marcadas.</span>
              </div>
              <Button type="button" size="sm" variant="ghost" className="val-alvo h-8 w-8 shrink-0 rounded-lg p-0 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <span aria-hidden="true" className="hidden h-6 w-px bg-white/15 sm:block" />
            <div className="flex items-center gap-1.5 sm:shrink-0">
              <Button type="button" size="sm" variant="ghost" className={cn(SOBRE_ESCURO, "flex-1 hover:border-danger-strong/60 hover:bg-danger-strong/20 sm:flex-none")} disabled={busy} onClick={() => openConfirmMany("reject")}>
                <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Reprovar ({nSel})
              </Button>
              <Button type="button" size="sm" className="val-alvo h-8 flex-[1.4] rounded-lg bg-success px-3 text-xs font-semibold text-white hover:bg-success/90 disabled:bg-white/10 disabled:text-white/40 disabled:opacity-100 sm:flex-none" disabled={busy} onClick={() => openConfirmMany("approve")}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Aprovar direto ({nSel})
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="apr-tabela xl:rounded-xl xl:border xl:border-border xl:bg-card xl:shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Vagas sem validação da área há {STALLED_DAYS} dias ou mais</caption>
          <thead className="apr-cabecalho sticky z-10 border-b border-border bg-surface-muted [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
            <tr>
              {onDecideMany && (
                <th scope="col" data-col={podeSelecionar ? "sel" : "sel-vazio"} className="w-11 py-2.5 pl-3 pr-1 text-left">
                  <span className="inline-flex h-5 items-center gap-2.5">
                    <Checkbox checked={todasMarcadas} disabled={busy || selecionaveis.length === 0} onCheckedChange={alternarTodas} aria-label="Selecionar todas as vagas que você pode decidir" />
                    <span className="apr-so-cartao whitespace-nowrap text-xs font-medium text-slate-600" aria-hidden="true">
                      {todasMarcadas ? "Desmarcar todas" : `Selecionar todas (${selecionaveis.length})`}
                    </span>
                  </span>
                </th>
              )}
              <th scope="col" className={TH}>Vaga</th>
              <th scope="col" className={cn(TH, "hidden w-[160px] 2xl:table-cell")}>Período</th>
              <th scope="col" className={cn(TH, "w-[150px]")}>Sugerida em</th>
              <th scope="col" className={cn(TH, "w-[256px] 2xl:w-[360px]")}>Logística</th>
              <th scope="col" className={cn(TH, "w-[236px] text-right")}>Decisão</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const canAct = canActOn(row);
              const approvers = approverNamesFor?.(row) ?? [];
              const lockReason = approvers.length ? `Aprovador: ${approvers.join(", ")}` : "Você não é aprovador desta função";
              const fnName = functionNameById.get(row.functionId) ?? "Sem função";
              const marcada = selected.has(row.id);
              const obs = row.observations?.trim();
              return (
                <tr key={row.id} data-testid={`parada-row-${row.inclusionNumber}`} data-selecionada={marcada || undefined}
                  className={cn("apr-linha border-b border-border align-top last:border-b-0", marcada ? "bg-brand-soft/50" : "bg-card hover:bg-surface-muted/60")}>
                  {onDecideMany && (
                    <td data-col="sel" className="w-11 py-3 pl-3 pr-1">
                      <span className="inline-flex h-5 items-center">
                        {canAct && <Checkbox checked={marcada} disabled={busy} onCheckedChange={() => alternar(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />}
                      </span>
                    </td>
                  )}
                  <td data-primeira className="px-3 py-3">
                    <div className="min-w-0 space-y-0.5">
                      <span className="block break-words text-sm font-semibold leading-5 text-foreground" title={fnName}>{fnName}</span>
                      <span className="flex min-w-0 items-start gap-1.5 text-2xs leading-4">
                        <span className="shrink-0 font-mono font-medium tabular-nums text-muted-foreground">#{row.inclusionNumber}</span>
                        <span className="text-muted-foreground/60" aria-hidden="true">·</span>
                        {obs ? <span className="line-clamp-2 min-w-0 text-slate-600" title={obs}>{obs}</span> : <span className="text-muted-foreground">Sem observações</span>}
                      </span>
                      {showEvent && <LinhaDoEvento nome={row.eventName} periodo={eventPeriodLabel(row)} className="pt-1" />}
                      <span className="block pt-0.5 text-xs text-foreground 2xl:hidden"><PeriodCell row={row} /></span>
                    </div>
                  </td>
                  <td data-col="so-tabela" className="hidden px-3 py-3 2xl:table-cell"><PeriodCell row={row} stacked /></td>
                  <td data-rotulo="Sugerida em" className="px-3 py-3"><SugeridaEm row={row} /></td>
                  <td data-rotulo="Logística" className="px-3 py-3"><LogisticaDaVaga row={row} /></td>
                  <td data-col="acoes" className="whitespace-nowrap py-2.5 pl-2 pr-3 text-right">
                    {canAct ? (
                      <span className="inline-flex items-center gap-1">
                        <button type="button" disabled={busy} onClick={() => openConfirm(row, "reject")}
                          aria-label={`Reprovar a vaga #${row.inclusionNumber} sem validação da área`} title="Reprovar"
                          className={cn(ICONE_DA_LINHA, "w-auto gap-1.5 px-2.5 text-xs font-medium hover:bg-danger-soft hover:text-danger")}>
                          <XCircle className="h-4 w-4" aria-hidden="true" /> Reprovar
                        </button>
                        <button type="button" disabled={busy} onClick={() => openConfirm(row, "approve")}
                          aria-label={`Aprovar direto a vaga #${row.inclusionNumber}`} className={APROVAR_DA_LINHA}>
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Aprovar direto
                        </button>
                      </span>
                    ) : (
                      <span className="inline-block max-w-[220px] whitespace-normal text-left text-2xs leading-4 text-muted-foreground xl:text-right" title={lockReason}>{lockReason}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ConfirmDialog único (23/09). Enquanto decide (`pending`), o diálogo não
          fecha por Esc/clique fora: fechar no meio deixaria a decisão em curso
          sem feedback. Reprovar é destrutivo (tom danger, foco no Voltar). */}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => { if (!o && !busy) setConfirm(null); }}
        title={confirm && confirm.rows.length > 1
          ? (confirm.kind === "approve" ? `Aprovar ${confirm.rows.length} vagas direto, sem validação da área?` : `Reprovar ${confirm.rows.length} vagas sem validação da área?`)
          : (confirm?.kind === "approve" ? "Aprovar vaga direto, sem validação da área?" : "Reprovar vaga sem validação da área?")}
        description={confirm && confirm.rows.length > 1
          ? (confirm.kind === "approve" ? "Todas viram Inclusão de Equipe (aguardando escalação) imediatamente." : "Todas saem da escala e ficam registradas como negadas.")
          : (confirm?.kind === "approve" ? "Ela vira Inclusão de Equipe (aguardando escalação) imediatamente." : "Ela sai da escala e fica registrada como negada.")}
        icon={confirm?.kind === "approve" ? CheckCircle2 : XCircle}
        tone={confirm?.kind === "approve" ? "default" : "danger"}
        className="!max-w-[580px] max-h-[88vh] overflow-y-auto"
        cancelLabel="Voltar"
        confirmLabel={rotuloAcao}
        pending={busy}
        onConfirm={() => { void doConfirm(); }}
      >
        {/* Em lote a lista nomeia cada vaga: "17 vagas" sem os nomes é
            assinar em branco. */}
        {confirm && !unica && (
          <ul className="max-h-[200px] divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card text-xs" data-testid="paradas-lote-lista">
            {confirm.rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3.5 py-2">
                <span className="font-mono text-2xs font-medium tabular-nums text-muted-foreground">#{row.inclusionNumber}</span>
                <span className="break-words font-semibold text-foreground">{functionNameById.get(row.functionId) ?? "Sem função"}</span>
                {row.eventName && <span className="break-words text-muted-foreground">· {row.eventName}</span>}
              </li>
            ))}
          </ul>
        )}
        {/* Passar por cima da área é a decisão mais pesada da tela: a vaga
            precisa estar à vista, com quanto tempo está parada. */}
        {confirm && unica && (
          <>
            <VagaCard
              row={unica}
              functionName={functionNameById.get(unica.functionId)}
              badge={
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold whitespace-nowrap",
                  unica.daysPending >= DANGER_DAYS ? "bg-danger-soft text-danger border-danger/25" : "bg-warning-soft text-warning border-warning/25",
                )}>
                  <Clock className="w-3 h-3" aria-hidden="true" /> sem validação da área
                </span>
              }
              nota="A área nunca validou esta vaga."
            />
            <section
              className={cn("relative overflow-hidden rounded-xl border py-3 pl-4 pr-3.5", confirm.kind === "approve" ? "border-success/25 bg-success-soft/60 text-success" : "border-danger/25 bg-danger-soft/60 text-danger")}
              aria-labelledby="bypass-depois"
            >
              <span className="absolute inset-y-0 left-0 w-[3px] bg-current opacity-70" aria-hidden="true" />
              <p id="bypass-depois" className="text-[13px] font-semibold leading-5">O que acontece depois</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-700 marker:text-current">
                {confirm.kind === "approve" ? (
                  <>
                    <li>A vaga vira Inclusão de Equipe e já pode ser escalada.</li>
                    <li>A área perde a chance de validar esta vaga — o pulo fica registrado com o seu nome.</li>
                    <li>
                      Entram <span className="font-semibold tabular-nums">{pessoasDiaDaVaga(unica)}</span>{" "}
                      {pessoasDiaDaVaga(unica) === 1 ? "pessoa-dia" : "pessoas-dia"} no total do evento.
                    </li>
                    <li>
                      {unica.needsTicket || unica.needsAccommodation
                        ? <>Compras passa a ter {[unica.needsTicket ? "passagem" : null, unica.needsAccommodation ? "hospedagem" : null].filter(Boolean).join(" e ")} para comprar.</>
                        : <>Nenhuma compra é gerada — a vaga não pede passagem nem hospedagem.</>}
                    </li>
                  </>
                ) : (
                  <>
                    <li>A vaga sai da escala e fica registrada como negada.</li>
                    <li>A área nunca chegou a validar: a recusa fica registrada com o seu nome.</li>
                    <li>Nenhuma compra é gerada para esta vaga.</li>
                    <li>As outras vagas da mesma função não são afetadas.</li>
                  </>
                )}
                <li>Seu comentário fica no histórico da vaga e é o que a área lê.</li>
              </ul>
            </section>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="bypass-comment" className="text-sm font-medium text-foreground">Comentário <span className="font-normal text-muted-foreground">(opcional)</span></Label>
          <Textarea id="bypass-comment" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} className="rounded-lg bg-card text-sm text-foreground" placeholder="Por que decidir por cima da área?" />
          <p className="text-2xs text-muted-foreground">Fica registrado no histórico da vaga.</p>
        </div>
      </ConfirmDialog>
    </>
  );
}

export default StalledSuggestions;
