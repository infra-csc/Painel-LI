/**
 * Sticky Footer do Planejado — barra de progresso do envio e botão
 * "Enviar Planejamento (N)" — 25/09 (modularização). Extraída de
 * budget-planned.tsx sem alteração visual.
 */
import { CheckCheck, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstatisticasDoPlanejado } from "@/hooks/use-budget-engine";
import { formatCurrency } from "./types";

export interface EnviarParaRealizadoBarProps {
  totalGeral: number;
  stats: EstatisticasDoPlanejado;
  selectedIds: Set<string>;
  onSend: (ids: string[]) => void;
}

export function EnviarParaRealizadoBar({ totalGeral, stats, selectedIds, onSend }: EnviarParaRealizadoBarProps) {
  return (
    <div className="sticky bg-card/82 backdrop-blur-lg border-t border-t-border/70 shadow-2" style={{
      bottom: 0,
      zIndex: 40,
      borderRadius: "14px 14px 0 0",
    }}>
      <div className="mx-auto flex items-center gap-6" style={{ maxWidth: 1024, padding: "9px 24px" }}>

        {/* Esquerda: Total do Evento — label empilhado + valor */}
        <div className="shrink-0 pr-6 border-r border-r-border">
          <div className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground" style={{ marginBottom: 3 }}>
            Valor Total do Evento
          </div>
          <div className="text-lg font-semibold tracking-[-0.02em] text-primary tabular-nums leading-none" style={{
            fontFeatureSettings: '"tnum"',
          }}>
            {formatCurrency(totalGeral)}
          </div>
        </div>

        {/* Centro: progresso do envio */}
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-2.5">
            <div className="rounded-full overflow-hidden bg-border/80" style={{ flex: 1, height: 4 }}>
              <div className={cn("rounded-full", (stats.progressoEnvio >= 100 ? "shadow-1" : "shadow-none"))} style={{
                height: "100%",
                transition: "width 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
                width: `${stats.progressoEnvio}%`,
                background: stats.progressoEnvio >= 100
                  ? "var(--success)"
                  : "var(--primary)",
              }} />
            </div>
            <span className={cn("text-2xs font-normal tracking-[0.01em] whitespace-nowrap", (stats.progressoEnvio >= 100 ? "text-success" : "text-muted-foreground"))}>
              {stats.enviados}/{stats.total}
              {stats.progressoEnvio >= 100 && <span className="ml-1">✓</span>}
            </span>
          </div>
        </div>

        {/* Direita: botão de ação */}
        {stats.progressoEnvio >= 100 ? (
          <div className="flex items-center gap-2 rounded-xl bg-success-soft border border-success/25 shrink-0" style={{
            padding: "8px 18px",
          }}>
            <CheckCheck className="w-4 h-4 text-success" aria-hidden="true" />
            <span className="text-sm font-bold text-success">Todos Enviados</span>
          </div>
        ) : (
          <button
            onClick={() => selectedIds.size > 0 ? onSend(Array.from(selectedIds)) : undefined}
            disabled={selectedIds.size === 0}
            className={cn("flex items-center rounded-xl border-0 shrink-0 text-sm font-semibold", (selectedIds.size > 0 ? "cursor-pointer" : "cursor-not-allowed"), (selectedIds.size > 0 ? "bg-success" : "bg-border"), (selectedIds.size > 0 ? "text-white" : "text-muted-foreground"), (selectedIds.size > 0 ? "shadow-2" : "shadow-none"), (selectedIds.size === 0 ? "opacity-70" : "opacity-100"))} style={{
              gap: 7,
              height: 38,
              paddingLeft: 18,
              paddingRight: 18,
              transition: "all 0.2s ease",
            }}
          >
            <Send style={{ width: 14, height: 14 }} aria-hidden="true" />
            {selectedIds.size > 0
              ? `Enviar Planejamento (${selectedIds.size})`
              : "Selecione colaboradores"}
          </button>
        )}
      </div>
    </div>
  );
}

export default EnviarParaRealizadoBar;
