/**
 * Ações em massa da Escalação: barra "Confirmar selecionadas (N)" + AlertDialog
 * listando as N + execução SEQUENCIAL via POST /api/team-inclusions/:id/confirm
 * com resumo (ok/falhas). Cada linha só entra se o usuário puder confirmá-la.
 */
import { useState } from "react";
import { Check, CheckCheck, X, AlertCircle, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { isCityFromSP } from "./scaling-utils";
import type { TeamInclusion } from "@shared/schema";
import { confirmInclusionRequest } from "./use-scaling-mutations";

export interface BulkResult { inclusion: TeamInclusion; ok: boolean; message?: string }

export interface BulkConfirmBarProps {
  selected: TeamInclusion[];
  onClear: () => void;
  getEventName: (id: string | null) => string;
  getFunctionName: (id: string | null) => string;
  getCollaboratorName: (id?: string | null) => string;
  /** Chamado ao terminar (após invalidar as consultas) */
  onDone?: (results: BulkResult[]) => void;
}

export default function BulkConfirmBar({ selected, onClear, getEventName, getFunctionName, getCollaboratorName, onDone }: BulkConfirmBarProps) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<BulkResult[] | null>(null);

  if (selected.length === 0 && !open) return null;

  const run = async () => {
    setRunning(true);
    setProgress(0);
    const out: BulkResult[] = [];
    for (const inclusion of selected) {
      try {
        // Envia o que a linha já tem gravado; o servidor decide status/fase
        await confirmInclusionRequest(inclusion.id, {
          collaboratorId: inclusion.collaboratorId || "",
          observations: inclusion.observations || "",
          // Mesma normalização do modal: cidade vazia/SP grava "São Paulo - SP"
          city: isCityFromSP(inclusion.city) ? "São Paulo - SP" : (inclusion.city || ""),
          atendimentoTipo: (inclusion as any).atendimentoTipo || null,
          percurseiroTipo: (inclusion as any).percurseiroTipo || null,
          needsTicket: inclusion.needsTicket,
          needsAccommodation: inclusion.needsAccommodation,
        });
        out.push({ inclusion, ok: true });
      } catch (err: any) {
        out.push({ inclusion, ok: false, message: err?.body?.message || err?.message || "Erro desconhecido" });
      }
      setProgress(out.length);
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    setResults(out);
    setRunning(false);
    onDone?.(out);
  };

  // A página (onDone) tira da seleção as que deram certo — as que falharam
  // continuam selecionadas para tentar de novo.
  const close = () => {
    if (running) return;
    setOpen(false);
    setResults(null);
  };

  const okCount = results?.filter(r => r.ok).length ?? 0;
  const failCount = results ? results.length - okCount : 0;

  return (
    <>
      {selected.length > 0 && (
        <div
          className="sticky bottom-3 z-30 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg shadow-blue-100"
          role="region"
          aria-label="Ações em massa"
          data-testid="bulk-confirm-bar"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <CheckCheck className="w-4 h-4 text-[#2563EB]" />
          </div>
          <p className="text-[13px] font-semibold text-slate-700 flex-1 min-w-0">
            {selected.length === 1 ? "1 escalação selecionada" : `${selected.length} escalações selecionadas`}
            <span className="text-slate-400 font-normal"> · prontas para confirmar</span>
          </p>
          <Button
            variant="outline"
            onClick={onClear}
            className="rounded-xl h-9 text-[12px] border-slate-200 text-slate-600 hover:bg-slate-50"
            data-testid="button-bulk-clear"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Limpar seleção
          </Button>
          <Button
            onClick={() => { setResults(null); setOpen(true); }}
            style={{ background: "#2563EB", boxShadow: "0 4px 14px #2563EB40" }}
            className="rounded-xl h-9 text-[12px] font-bold text-white hover:opacity-90"
            data-testid="button-bulk-confirm"
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            Confirmar selecionadas ({selected.length})
          </Button>
        </div>
      )}

      <AlertDialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
        <AlertDialogContent className="max-w-[560px] rounded-2xl p-0 gap-0 overflow-hidden" data-testid="dialog-bulk-confirm">
          <div className="px-6 pt-6 pb-4">
            <AlertDialogHeader className="space-y-1 text-left">
              <AlertDialogTitle className="text-[16px] font-bold text-slate-900">
                {results ? "Resumo da confirmação em massa" : `Confirmar ${selected.length} ${selected.length === 1 ? "escalação" : "escalações"}?`}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[12px] text-slate-500">
                {results
                  ? `${okCount} confirmada${okCount !== 1 ? "s" : ""} com sucesso${failCount > 0 ? ` · ${failCount} com falha` : ""}.`
                  : "O status de cada escalação será decidido pelo servidor (cenotécnica vai para aprovação da Produção; sem logística vai direto para Aprovado). A execução é sequencial."}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>

          <div className="max-h-[46vh] overflow-y-auto border-y border-slate-100 bg-slate-50/60 px-6 py-3 space-y-1.5">
            {(results ?? selected.map(inclusion => ({ inclusion, ok: true as const }))).map((r, idx) => (
              <div
                key={r.inclusion.id}
                className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 bg-white ${results ? (r.ok ? "border-emerald-200" : "border-red-200") : "border-slate-200"}`}
                data-testid={`bulk-row-${r.inclusion.id}`}
              >
                {results ? (
                  r.ok
                    ? <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-label="Confirmada" />
                    : <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" aria-label="Falhou" />
                ) : running && idx === progress ? (
                  <Loader2 className="w-4 h-4 text-[#2563EB] animate-spin shrink-0 mt-0.5" aria-label="Confirmando" />
                ) : running && idx < progress ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <span className="text-[11px] font-mono font-bold text-[#2563EB] bg-blue-50 border border-blue-100 rounded-md px-1.5 py-0.5 shrink-0">#{r.inclusion.inclusionNumber ?? "—"}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold text-slate-800 truncate">
                    {results && <span className="font-mono text-slate-400 mr-1.5">#{r.inclusion.inclusionNumber ?? "—"}</span>}
                    {getFunctionName(r.inclusion.functionId)} · {getCollaboratorName(r.inclusion.collaboratorId)}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{getEventName(r.inclusion.eventId)}</div>
                  {results && !r.ok && r.message && (
                    <div className="text-[11px] text-red-600 mt-0.5">{r.message}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="px-6 py-4">
            <AlertDialogFooter className="gap-2 sm:gap-2">
              {results ? (
                <AlertDialogAction
                  onClick={close}
                  className="rounded-xl h-9 text-[12px] font-semibold text-white"
                  style={{ background: "#2563EB" }}
                  data-testid="button-bulk-close"
                >
                  Fechar
                </AlertDialogAction>
              ) : (
                <>
                  <AlertDialogCancel disabled={running} className="rounded-xl h-9 text-[12px] border-slate-200 text-slate-600 hover:bg-slate-50 mt-0">
                    Cancelar
                  </AlertDialogCancel>
                  <Button
                    onClick={run}
                    disabled={running}
                    className="rounded-xl h-9 text-[12px] font-bold text-white hover:opacity-90"
                    style={{ background: "#2563EB" }}
                    data-testid="button-bulk-run"
                  >
                    {running ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Confirmando {progress + 1 > selected.length ? selected.length : progress + 1} de {selected.length}…</>
                    ) : (
                      <><Check className="w-3.5 h-3.5 mr-1.5" />Confirmar {selected.length}</>
                    )}
                  </Button>
                </>
              )}
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
