/**
 * Ações em massa da Escalação: barra "Confirmar selecionadas (N)" + ConfirmDialog
 * listando as N + execução SEQUENCIAL via POST /api/team-inclusions/:id/confirm
 * com resumo (ok/falhas). Cada linha só entra se o usuário puder confirmá-la.
 */
import { useState } from "react";
import { Check, CheckCheck, X, AlertCircle, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { avisarAgenda } from "@/hooks/use-vaga-acoes";
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
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<BulkResult[] | null>(null);

  if (selected.length === 0 && !open) return null;

  const run = async () => {
    setRunning(true);
    setProgress(0);
    const out: BulkResult[] = [];
    const avisos: unknown[] = [];
    for (const inclusion of selected) {
      try {
        // Envia o que a linha já tem gravado; o servidor decide status/fase
        const confirmada = await confirmInclusionRequest(inclusion.id, {
          collaboratorId: inclusion.collaboratorId || "",
          observations: inclusion.observations || "",
          // Mesma normalização do modal: cidade vazia/SP grava "São Paulo - SP"
          city: isCityFromSP(inclusion.city) ? "São Paulo - SP" : (inclusion.city || ""),
          atendimentoTipo: (inclusion as any).atendimentoTipo || null,
          percurseiroTipo: (inclusion as any).percurseiroTipo || null,
          needsTicket: inclusion.needsTicket,
          needsAccommodation: inclusion.needsAccommodation,
        });
        if (Array.isArray(confirmada.avisosDeAgenda)) avisos.push(...confirmada.avisosDeAgenda);
        out.push({ inclusion, ok: true });
      } catch (err: unknown) {
        // 409 (já confirmada, conflito de agenda) vem com a explicação do servidor.
        out.push({ inclusion, ok: false, message: apiErrorMessage(err, "Erro desconhecido") });
      }
      setProgress(out.length);
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    setResults(out);
    setRunning(false);
    // Duas viagens no mesmo dia: UM aviso para o lote inteiro, não um por linha.
    avisarAgenda(toast, avisos);
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
          className="sticky bottom-4 z-30 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary bg-card px-3.5 py-2.5 shadow-3"
          role="region"
          aria-label="Ações em massa"
          data-testid="bulk-confirm-bar"
        >
          <div className="w-8 h-8 rounded-lg bg-brand-soft flex items-center justify-center shrink-0">
            <CheckCheck className="w-4 h-4 text-primary" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-slate-700 flex-1 min-w-0">
            {selected.length === 1 ? "1 escalação selecionada" : `${selected.length} escalações selecionadas`}
            <span className="text-muted-foreground font-normal"> · prontas para confirmar</span>
          </p>
          <Button
            variant="outline"
            onClick={onClear}
            className="rounded-xl h-9 text-xs border-border text-slate-600 hover:bg-surface-muted"
            data-testid="button-bulk-clear"
          >
            <X className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            Limpar seleção
          </Button>
          <Button
            onClick={() => { setResults(null); setOpen(true); }}
            className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary-hover shadow-1"
            data-testid="button-bulk-confirm"
          >
            <Check className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            Confirmar selecionadas ({selected.length})
          </Button>
        </div>
      )}

      {/* ConfirmDialog único (23/09): antes da execução é uma confirmação
          (Cancelar → Confirmar N); depois vira o resumo, só com "Fechar". */}
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => { if (!o) close(); }}
        title={results ? "Resumo da confirmação em massa" : `Confirmar ${selected.length} ${selected.length === 1 ? "escalação" : "escalações"}?`}
        description={results
          ? `${okCount} confirmada${okCount !== 1 ? "s" : ""} com sucesso${failCount > 0 ? ` · ${failCount} com falha` : ""}.`
          : "O status de cada escalação será decidido pelo servidor (cenotécnica vai para aprovação do gestor; sem logística vai direto para Aprovado). A execução é sequencial."}
        icon={CheckCheck}
        className="max-w-[580px]"
        testId="dialog-bulk-confirm"
        semConfirmar={!!results}
        cancelLabel={results ? "Fechar" : "Cancelar"}
        confirmLabel={running
          ? `Confirmando ${Math.min(progress + 1, selected.length)} de ${selected.length}…`
          : <><Check className="w-3.5 h-3.5" aria-hidden="true" />Confirmar {selected.length}</>}
        pending={running}
        onConfirm={() => { void run(); }}
        confirmTestId="button-bulk-run"
      >
        <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-border bg-surface-muted px-3 py-2 space-y-1.5">
          {(results ?? selected.map(inclusion => ({ inclusion, ok: true as const }))).map((r, idx) => (
            <div
              key={r.inclusion.id}
              className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 bg-card ${results ? (r.ok ? "border-success/25" : "border-danger/25") : "border-border"}`}
              data-testid={`bulk-row-${r.inclusion.id}`}
            >
              {results ? (
                r.ok
                  ? <Check className="w-4 h-4 text-success shrink-0 mt-0.5" aria-label="Confirmada" />
                  : <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" aria-label="Falhou" />
              ) : running && idx === progress ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0 mt-0.5" aria-label="Confirmando" />
              ) : running && idx < progress ? (
                <Check className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <span className="text-2xs font-mono font-bold text-primary bg-brand-soft rounded-md px-1.5 py-0.5 shrink-0">#{r.inclusion.inclusionNumber ?? "—"}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-foreground truncate">
                  {results && <span className="font-mono text-muted-foreground mr-1.5">#{r.inclusion.inclusionNumber ?? "—"}</span>}
                  {getFunctionName(r.inclusion.functionId)} · {getCollaboratorName(r.inclusion.collaboratorId)}
                </div>
                <div className="text-2xs text-muted-foreground truncate">{getEventName(r.inclusion.eventId)}</div>
                {results && !r.ok && r.message && (
                  <div className="text-2xs text-danger mt-0.5">{r.message}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ConfirmDialog>
    </>
  );
}
