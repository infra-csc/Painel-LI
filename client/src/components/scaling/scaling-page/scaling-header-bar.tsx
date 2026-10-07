/**
 * Barra de contexto da Escalação (25/09 — extraída de pages/scaling.tsx):
 * 56px no lugar dos 76px de cabeçalho que repetiam o que o breadcrumb já
 * dizia. Aqui mora o resumo REAL do recorte, as abas e o Exportar.
 *
 * 07/10: do tablet para cima é UMA linha de 56px (o cabeçalho da tabela gruda
 * logo abaixo dela); no celular, título + Exportar em cima e as abas inteiras
 * embaixo, em vez de três linhas soltas. Enquanto a lista não chega, o resumo
 * diz "carregando" — antes afirmava "nenhuma vaga no recorte".
 */
import { CalendarDays, Download, List, TrendingUp } from "lucide-react";
import type { ScalingAba } from "./use-scaling-filters";

const ABAS = [
  ["fila", "Fila de trabalho", "Fila", List],
  ["escala", "Escala", "Escala", CalendarDays],
  ["analises", "Análises", "Análises", TrendingUp],
] as const;

export function ScalingHeaderBar({ resumoTopo, aba, onAba, canExport, onExportar, estado = "pronta" }: {
  resumoTopo: string;
  aba: ScalingAba;
  onAba: (aba: ScalingAba) => void;
  canExport: boolean;
  onExportar: () => void;
  /** A lista ainda não chegou ou falhou: o resumo diz isso e o Exportar espera. */
  estado?: "pronta" | "carregando" | "erro";
}) {
  const resumo = estado === "carregando" ? "carregando as vagas…" : estado === "erro" ? "lista indisponível" : resumoTopo;
  const exportarTravado = estado !== "pronta";
  return (
    // Fica abaixo da barra do topo (`--sticky-top`). Uma linha só a partir de
    // `md` — o topo grudado do cabeçalho da tabela conta com os 56px.
    <div className="sticky top-[var(--sticky-top)] z-30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-2 px-[var(--page-gutter)] bg-card border-b border-border md:flex md:h-14 md:py-0 md:gap-x-4">
      <h1 className="text-base font-semibold tracking-[-0.01em] text-foreground whitespace-nowrap">Escalação</h1>
      {/* O resumo fica à direita das abas a partir do tablet: as abas não
          andam de lugar quando o texto muda ("carregando…" → "69 vagas…"). */}
      <span
        className={`min-w-0 truncate text-xs tabular-nums md:order-3 md:ml-auto md:text-right ${estado === "erro" ? "text-danger" : "text-muted-foreground"}`}
        data-testid="resumo-topo"
        aria-live="polite"
      >
        {resumo}
      </span>

      <div
        role="tablist"
        aria-label="Modo da tela"
        className="order-last col-span-3 grid grid-cols-3 gap-0.5 rounded-lg border border-border bg-background p-[3px] md:order-2 md:inline-flex md:shrink-0"
      >
        {ABAS.map(([k, label, curto, Icone]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={aba === k}
            onClick={() => onAba(k)}
            data-testid={`aba-${k}`}
            className={`esc-alvo inline-flex items-center justify-center gap-1.5 h-7 px-[11px] rounded-md text-sm whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              aba === k
                ? "bg-card shadow-1 ring-1 ring-border text-primary font-semibold"
                : "text-muted-foreground font-medium hover:text-foreground"
            }`}
          >
            <Icone className="w-[15px] h-[15px]" aria-hidden="true" />
            <span className="sm:hidden">{curto}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {canExport && (
        <button
          type="button"
          onClick={onExportar}
          disabled={exportarTravado}
          title={exportarTravado
            ? "Espere a lista carregar para exportar."
            : aba === "analises"
            ? "Gera a lista do que falta escalar, por evento e função, pronta para colar."
            : "Escolha as colunas e o formato (Excel ou PDF). O arquivo pode conter dados pessoais dos colaboradores."}
          data-testid="button-export-excel"
          // Contorno (07/10): exportar é ação de apoio — o botão cheio era o
          // elemento mais forte da tela e competia com o trabalho da lista.
          className="esc-alvo justify-self-end md:order-4 inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg border border-border bg-card text-sm font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Exportar</span>
        </button>
      )}
    </div>
  );
}
