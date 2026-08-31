import { useState } from "react";
import { CheckCircle2, Clock, Timer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { cn, formatDiarias } from "@/lib/utils";
import { PendingDaysBadge, eventPeriodLabel, periodLabel, workDaysOf } from "@/components/scaling-validation/suggestions-list";
import { VagaCard, pessoasDiaDaVaga } from "@/components/scaling-validation/vaga-card";
import { DANGER_DAYS, STALLED_DAYS } from "@shared/scaling-validation-rules";
import type { StalledRow as SuggestionRow } from "./types";

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
   * "Todos os eventos": a coluna Evento aparece (a lista mistura eventos e a
   * ordem continua sendo pelo tempo parado). Com filtro por evento ela some.
   */
  showEvent?: boolean;
  busy?: boolean;
  onDecide: (row: SuggestionRow, kind: "approve" | "reject", comment?: string) => void;
}

const TH = "px-2.5 py-2 text-left text-[11px] uppercase tracking-[0.06em] text-slate-500 font-semibold whitespace-nowrap border-b border-slate-200";

/**
 * "Vagas paradas": sugestões que a área nunca validou (sugestao_pendente, sem
 * pedido) há ≥ STALLED_DAYS dias. O aprovador pode aprovar direto ou reprovar (bypass).
 */
export function StalledSuggestions({ rows, functionNameById, canActOn, approverNamesFor, showEvent = false, busy, onDecide }: StalledSuggestionsProps) {
  const [confirm, setConfirm] = useState<{ row: SuggestionRow; kind: "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("");

  const openConfirm = (row: SuggestionRow, kind: "approve" | "reject") => { setComment(""); setConfirm({ row, kind }); };
  const doConfirm = () => {
    if (!confirm) return;
    onDecide(confirm.row, confirm.kind, comment.trim() || undefined);
    setConfirm(null);
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nenhuma vaga parada"
        description={showEvent
          ? `Nenhum evento tem vaga esperando validação da área há ${STALLED_DAYS} dias ou mais sem pedido aberto.`
          : `Todas as vagas pendentes deste evento têm menos de ${STALLED_DAYS} dias ou já estão com pedido aberto.`}
      />
    );
  }

  return (
    <>
      <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <Timer className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          <span className="font-semibold">Vagas que a área nunca validou há {STALLED_DAYS} dias ou mais.</span>{" "}
          Você pode aprovar direto ou reprovar sem a validação da área — a decisão fica registrada no histórico da vaga.
        </span>
      </p>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <caption className="sr-only">Vagas sem validação da área há {STALLED_DAYS} dias ou mais</caption>
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={TH}>Vaga</th>
                {showEvent && <th scope="col" className={cn(TH, "min-w-[170px]")}>Evento</th>}
                <th scope="col" className={TH}>Área</th>
                <th scope="col" className={TH}>Período / diárias</th>
                <th scope="col" className={TH}>Parada há</th>
                <th scope="col" className={cn(TH, "text-right min-w-[250px]")}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const days = workDaysOf(row);
                const canAct = canActOn(row);
                const approvers = approverNamesFor?.(row) ?? [];
                const lockReason = approvers.length ? `Aprovador: ${approvers.join(", ")}` : "Você não é aprovador desta função";
                const fnName = functionNameById.get(row.functionId) ?? "Sem função";
                return (
                  <tr key={row.id} className={cn("border-b border-slate-100", i % 2 === 1 ? "bg-slate-50/50" : "bg-white")}>
                    <td className="px-2.5 py-2 align-middle max-w-[260px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-800 tabular-nums">#{row.inclusionNumber}</span>
                        <div className="min-w-0">
                          <span className="block font-semibold text-slate-800 truncate" title={fnName}>{fnName}</span>
                          <span className="block text-[11px] text-slate-400 truncate" title={row.observations ?? undefined}>{row.observations || "Sem observações"}</span>
                        </div>
                      </div>
                    </td>
                    {showEvent && (
                      <td className="px-2.5 py-2 align-middle max-w-[220px]">
                        <span className="block truncate text-[13px] font-semibold text-slate-700" title={row.eventName ?? undefined}>
                          {row.eventName ?? "Evento sem nome"}
                        </span>
                        <span className="block font-mono text-[11px] text-slate-400">{eventPeriodLabel(row) || "Sem período"}</span>
                      </td>
                    )}
                    <td className="px-2.5 py-2 align-middle text-xs text-slate-600">{row.area ?? "Sem área"}</td>
                    <td className="px-2.5 py-2 align-middle whitespace-nowrap">
                      <span className="font-mono tabular-nums text-xs text-slate-700">{periodLabel(row)}</span>
                      <span className="ml-1.5 text-[11px] text-slate-400">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
                    </td>
                    <td className="px-2.5 py-2 align-middle"><PendingDaysBadge row={row} approverNames={approvers} /></td>
                    <td className="px-2.5 py-2 align-middle text-right">
                      {canAct ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Button type="button" size="sm" variant="outline" className="h-7 rounded-lg px-2.5 text-xs text-red-700 border-red-200 hover:bg-red-50" disabled={busy} onClick={() => openConfirm(row, "reject")}>
                            <XCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Reprovar
                          </Button>
                          <Button type="button" size="sm" className="h-7 rounded-lg px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => openConfirm(row, "approve")}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Aprovar direto
                          </Button>
                        </span>
                      ) : (
                        <span className="inline-block max-w-[220px] truncate text-[11px] text-slate-400" title={lockReason}>{lockReason}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent className="!max-w-[560px] max-h-[88vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "approve" ? "Aprovar vaga direto, sem validação da área?" : "Reprovar vaga sem validação da área?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "approve"
                ? "Ela vira Inclusão de Equipe (aguardando escalação) imediatamente."
                : "Ela sai da escala e fica registrada como negada."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Passar por cima da área é a decisão mais pesada da tela: a vaga
              precisa estar à vista, com quanto tempo está parada. */}
          {confirm && (
            <>
              <VagaCard
                row={confirm.row}
                functionName={functionNameById.get(confirm.row.functionId)}
                badge={
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                    confirm.row.daysPending >= DANGER_DAYS ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200",
                  )}>
                    <Clock className="w-3 h-3" aria-hidden="true" /> parada há {confirm.row.daysPending} {confirm.row.daysPending === 1 ? "dia" : "dias"}
                  </span>
                }
                nota="A área nunca validou esta vaga."
              />
              <section
                className={cn("rounded-2xl border p-3 space-y-1.5", confirm.kind === "approve" ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/60")}
                aria-labelledby="bypass-depois"
              >
                <p id="bypass-depois" className={cn("text-[11px] font-bold uppercase tracking-wide", confirm.kind === "approve" ? "text-emerald-700" : "text-red-700")}>
                  O que acontece depois
                </p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
                  {confirm.kind === "approve" ? (
                    <>
                      <li>A vaga vira Inclusão de Equipe e já pode ser escalada.</li>
                      <li>A área perde a chance de validar esta vaga — o pulo fica registrado com o seu nome.</li>
                      <li>
                        Entram <span className="font-semibold tabular-nums">{pessoasDiaDaVaga(confirm.row)}</span>{" "}
                        {pessoasDiaDaVaga(confirm.row) === 1 ? "pessoa-dia" : "pessoas-dia"} no total do evento.
                      </li>
                      <li>
                        {confirm.row.needsTicket || confirm.row.needsAccommodation
                          ? <>Compras passa a ter {[confirm.row.needsTicket ? "passagem" : null, confirm.row.needsAccommodation ? "hospedagem" : null].filter(Boolean).join(" e ")} para comprar.</>
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
          <div className="space-y-1">
            <Label htmlFor="bypass-comment" className="text-xs text-slate-600">Comentário (opcional)</Label>
            <Textarea id="bypass-comment" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} className="rounded-lg text-sm bg-white" placeholder="Fica registrado no histórico da vaga." />
            <p className="text-[11px] text-slate-400">Fica registrado no histórico da vaga.</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doConfirm(); }} className={confirm?.kind === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}>
              {confirm?.kind === "approve" ? "Aprovar direto" : "Reprovar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default StalledSuggestions;
