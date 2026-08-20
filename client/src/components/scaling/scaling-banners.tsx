/**
 * Banners do topo da Escalação: aprovações de cenotécnica pendentes (gestor)
 * e trocas de colaborador aguardando análise (com atalho de filtro).
 */
import { AlertCircle, ArrowLeftRight } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";

export function ProductionApprovalsBanner({ pending, inView, hasActiveFilters }: {
  pending: TeamInclusion[];
  inView: TeamInclusion[];
  hasActiveFilters: boolean;
}) {
  if (pending.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl">
      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
        <AlertCircle className="w-4 h-4 text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-red-700">
          {pending.length === 1
            ? "1 escalação de cenotécnica aguardando sua aprovação"
            : `${pending.length} escalações de cenotécnica aguardando sua aprovação`}
          {hasActiveFilters && (
            <span className="font-medium text-red-500"> ({inView.length} na visão atual)</span>
          )}
        </p>
        <p className="text-[11px] text-red-500 mt-0.5 break-words">
          {pending.map(i => `#${i.inclusionNumber}`).join(", ")} — clique na escalação para aprovar ou reprovar.
        </p>
      </div>
      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-red-600 text-white text-[11px] font-bold shrink-0">
        {pending.length}
      </span>
    </div>
  );
}

export function PendingSwapsBanner({ all, inView, hasActiveFilters, showOnlyPendingSwaps, onShow, onClear }: {
  all: TeamInclusion[];
  inView: TeamInclusion[];
  hasActiveFilters: boolean;
  showOnlyPendingSwaps: boolean;
  onShow: () => void;
  onClear: () => void;
}) {
  if (all.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
      <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
        <ArrowLeftRight className="w-4 h-4 text-purple-600" />
      </div>
      <p className="text-[13px] font-medium text-purple-800 flex-1 min-w-0">
        {all.length === 1
          ? "1 solicitação de troca de colaborador aguardando análise"
          : `${all.length} solicitações de troca de colaborador aguardando análise`}
        {hasActiveFilters && (
          <span className="text-purple-500 font-normal"> ({inView.length} na visão atual)</span>
        )}
      </p>
      {inView.length === 0 ? (
        <span className="shrink-0 text-[12px] text-purple-500">Nenhuma na visão atual — ajuste os filtros.</span>
      ) : showOnlyPendingSwaps ? (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-[12px] font-semibold text-purple-700 hover:text-purple-900 underline underline-offset-2"
          data-testid="button-clear-pending-swaps"
        >
          Mostrar todos
        </button>
      ) : (
        <button
          type="button"
          onClick={onShow}
          className="shrink-0 rounded-lg bg-purple-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-purple-700 transition-colors"
          data-testid="button-show-pending-swaps"
        >
          Ver trocas pendentes
        </button>
      )}
    </div>
  );
}
