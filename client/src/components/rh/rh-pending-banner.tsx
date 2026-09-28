// Extraído de rh-control.tsx em 25/09 (modularização): faixa "N pendências
// aguardando ação do RH" com atalhos por categoria, barra de progresso geral
// e CTA "Ver pendências" (aplica o card-filtro rh_action).
import type { RhControlData } from "./use-rh-control-data";
import type { RhFiltros } from "./use-rh-filtros";

export interface RhPendingBannerProps {
  dados: Pick<RhControlData, "rhActionCount" | "statusCounts" | "invoiceCounts" | "concludedCount" | "totalForProgress" | "progressPct">;
  filtros: RhFiltros;
}

export function RhPendingBanner({ dados, filtros: f }: RhPendingBannerProps) {
  const { rhActionCount, statusCounts, invoiceCounts, concludedCount, totalForProgress, progressPct } = dados;
  const rhReceivedCount = statusCounts.prestacao_recebida || 0;
  const rhPlanPendingCount = statusCounts.planejamento_pendente || 0;
  const rhNfPendingCount = invoiceCounts.enviada;
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="h-[3px] bg-warning-strong" />
      <div className="flex items-center gap-5 px-5 py-4">
        {/* Count badge */}
        <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl text-white bg-warning-strong">
          {rhActionCount}
        </div>

        {/* Text + progress */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {rhActionCount} pendência{rhActionCount !== 1 ? "s" : ""} aguardando ação do RH
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {rhPlanPendingCount > 0 && (
              <button
                onClick={() => { f.setFilterStatus("planejamento_pendente"); f.setFilterCheckinOnly(false); }}
                className="text-2xs text-muted-foreground hover:text-slate-700 cursor-pointer underline decoration-dashed border-0 p-0 bg-transparent"
              >· {rhPlanPendingCount} planejamento{rhPlanPendingCount > 1 ? "s" : ""}</button>
            )}
            {rhReceivedCount > 0 && (
              <button
                onClick={() => { f.setFilterStatus("prestacao_recebida"); f.setFilterCheckinOnly(false); }}
                className="text-2xs text-muted-foreground hover:text-slate-700 cursor-pointer underline decoration-dashed border-0 p-0 bg-transparent"
              >· {rhReceivedCount} comparativo{rhReceivedCount > 1 ? "s" : ""}</button>
            )}
            {rhNfPendingCount > 0 && (
              <button
                onClick={() => { f.setFilterInvoiceStatus("enviada"); f.setFilterStatus("all"); f.setFilterCheckinOnly(false); }}
                className="text-2xs text-primary hover:text-primary-hover cursor-pointer underline decoration-dashed border-0 p-0 bg-transparent"
              >· {rhNfPendingCount} nota{rhNfPendingCount > 1 ? "s fiscais" : " fiscal"}</button>
            )}
            {(invoiceCounts.checkinPending || 0) > 0 && (
              <button
                onClick={() => { f.setFilterCheckinOnly(true); f.setFilterStatus("all"); }}
                className="text-2xs text-primary font-medium hover:text-primary-hover cursor-pointer underline decoration-dashed border-0 p-0 bg-transparent"
              >· {invoiceCounts.checkinPending} check-in{(invoiceCounts.checkinPending || 0) > 1 ? "s" : ""}</button>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[240px]">
              <div
                className="h-full rounded-full transition-all duration-500 bg-warning-strong"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Progresso geral: <span className="font-semibold text-slate-700">{concludedCount}</span> de {totalForProgress} itens
            </span>
          </div>
        </div>

        {/* CTA */}
        <button
          className="text-xs font-bold px-4 py-2 rounded-lg text-white transition-colors shrink-0 shadow-1 bg-warning-strong"
          onClick={() => {
            f.setFilterEvent("all");
            f.setFilterFunction("all");
            f.setFilterCollaborator("all");
            f.setFilterInvoiceStatus("all");
            f.setSearchTerm("");
            f.setFilterStatus("rh_action");
            f.setFilterCheckinOnly(false);
            f.setShowConcluded(false);
            setTimeout(() => document.getElementById("rh-listing")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
          }}
        >
          Ver pendências
        </button>
      </div>
    </div>
  );
}

export default RhPendingBanner;
