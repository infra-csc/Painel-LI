import { useState } from "react";
import { CheckCircle2, Timer, XCircle } from "lucide-react";
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
import { STALLED_DAYS } from "@shared/scaling-validation-rules";
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "approve" ? "Aprovar vaga direto, sem validação da área?" : "Reprovar vaga sem validação da área?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vaga #{confirm?.row.inclusionNumber} · {confirm ? functionNameById.get(confirm.row.functionId) ?? "Função" : ""}.{" "}
              {confirm?.kind === "approve"
                ? "Ela vira Inclusão de Equipe (aguardando escalação) imediatamente."
                : "Ela sai da escala e fica registrada como negada."}
            </AlertDialogDescription>
          </AlertDialogHeader>
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
