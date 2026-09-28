/**
 * Barra de contexto da Escalação (25/09 — extraída de pages/scaling.tsx):
 * 56px no lugar dos 76px de cabeçalho que repetiam o que o breadcrumb já
 * dizia. Aqui mora o resumo REAL do recorte, as abas e o Exportar.
 */
import { CalendarDays, Download, List, TrendingUp } from "lucide-react";
import type { ScalingAba } from "./use-scaling-filters";

const ABAS = [["fila", "Fila de trabalho", List], ["escala", "Escala", CalendarDays], ["analises", "Análises", TrendingUp]] as const;

export function ScalingHeaderBar({ resumoTopo, aba, onAba, canExport, onExportar }: {
  resumoTopo: string;
  aba: ScalingAba;
  onAba: (aba: ScalingAba) => void;
  canExport: boolean;
  onExportar: () => void;
}) {
  return (
    // `flex-wrap` + altura mínima (23/09): em 375px título, abas e Exportar
    // quebram linha em vez de estourar. Fica abaixo da barra do topo
    // (`--sticky-top`) — `z-25` não existe no Tailwind, por isso não fixava.
    <div className="sticky top-[var(--sticky-top)] z-30 flex flex-wrap items-center gap-x-4 gap-y-2 min-h-14 py-2 px-[var(--page-gutter)] bg-card border-b border-border">
      <h1 className="text-base font-semibold text-foreground whitespace-nowrap">Escalação</h1>
      <div aria-hidden="true" className="w-px h-5 bg-border" />
      <span className="min-w-0 text-xs text-muted-foreground truncate" data-testid="resumo-topo">{resumoTopo}</span>

      <div role="tablist" aria-label="Modo da tela" className="inline-flex gap-0.5 p-[3px] rounded-lg border border-border bg-background shrink-0">
        {ABAS.map(([k, label, Icone]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={aba === k}
            onClick={() => onAba(k)}
            data-testid={`aba-${k}`}
            className={`inline-flex items-center gap-1.5 h-7 px-[11px] rounded-md text-sm whitespace-nowrap transition-colors ${
              aba === k
                ? "bg-card border border-border shadow-1 text-primary font-semibold"
                : "border border-transparent text-muted-foreground font-medium hover:text-primary"
            }`}
          >
            <Icone className="w-[15px] h-[15px]" aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      {canExport && (
        <button
          type="button"
          onClick={onExportar}
          title={aba === "analises"
            ? "Gera a lista do que falta escalar, por evento e função, pronta para colar."
            : "Escolha as colunas e o formato (Excel ou PDF). O arquivo pode conter dados pessoais dos colaboradores."}
          data-testid="button-export-excel"
          className="ml-auto inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary-hover shrink-0"
        >
          <Download className="w-4 h-4" aria-hidden="true" /> Exportar
        </button>
      )}
    </div>
  );
}
