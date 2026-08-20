import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { cn, formatDiarias } from "@/lib/utils";
import { PendingDaysBadge, periodLabel, workDaysOf } from "@/components/scaling-validation/suggestions-list";
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
  busy?: boolean;
  onDecide: (row: SuggestionRow, kind: "approve" | "reject", comment?: string) => void;
}

const TH = "px-3 py-2 text-left text-xs uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap";

/**
 * "Vagas paradas": sugestões que a área nunca validou (sugestao_pendente, sem
 * pedido) há ≥ STALLED_DAYS dias. O aprovador pode aprovar direto ou reprovar (bypass).
 */
export function StalledSuggestions({ rows, functionNameById, canActOn, approverNamesFor, busy, onDecide }: StalledSuggestionsProps) {
  const [confirm, setConfirm] = useState<{ row: SuggestionRow; kind: "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("");

  const openConfirm = (row: SuggestionRow, kind: "approve" | "reject") => { setComment(""); setConfirm({ row, kind }); };
  const doConfirm = () => {
    if (!confirm) return;
    onDecide(confirm.row, confirm.kind, comment.trim() || undefined);
    setConfirm(null);
  };

  if (rows.length === 0) {
    return <EmptyState icon={CheckCircle2} title="Nenhuma vaga parada" description={`Todas as vagas pendentes deste evento têm menos de ${STALLED_DAYS} dias ou já estão com pedido aberto.`} />;
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Vagas sem validação da área há {STALLED_DAYS} dias ou mais</caption>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={TH}>ID</th>
                <th className={TH}>Função</th>
                <th className={TH}>Área</th>
                <th className={TH}>Período / diárias</th>
                <th className={TH}>Parada há</th>
                <th className={cn(TH, "text-right")}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const days = workDaysOf(row);
                const canAct = canActOn(row);
                const approvers = approverNamesFor?.(row) ?? [];
                return (
                  <tr key={row.id} className={cn("border-b border-slate-100", i % 2 === 1 ? "bg-slate-50/40" : "bg-white")}>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 tabular-nums">#{row.inclusionNumber}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800 max-w-[240px]">
                      <span className="block truncate" title={functionNameById.get(row.functionId)}>{functionNameById.get(row.functionId) ?? "—"}</span>
                      {row.observations && <span className="block text-[11px] font-normal text-slate-400 truncate" title={row.observations}>{row.observations}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.area ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="font-mono tabular-nums text-slate-700">{periodLabel(row)}</span>
                      <span className="ml-1.5 text-slate-400">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
                    </td>
                    <td className="px-3 py-2"><PendingDaysBadge row={row} /></td>
                    <td className="px-3 py-2">
                      {canAct ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button type="button" size="sm" className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => openConfirm(row, "approve")}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Aprovar direto
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg text-red-700 border-red-200 hover:bg-red-50" disabled={busy} onClick={() => openConfirm(row, "reject")}>
                            <XCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Reprovar
                          </Button>
                        </div>
                      ) : (
                        <p className="text-right text-[11px] text-slate-400 max-w-[220px] ml-auto truncate" title={approvers.length ? `Aprovador: ${approvers.join(", ")}` : undefined}>
                          {approvers.length ? `Aprovador: ${approvers.join(", ")}` : "Você não é aprovador desta função"}
                        </p>
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
            <Textarea id="bypass-comment" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} className="rounded-lg text-sm" placeholder="Fica registrado no histórico da vaga." />
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
