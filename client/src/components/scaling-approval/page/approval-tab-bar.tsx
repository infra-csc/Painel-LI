/**
 * Linha das abas da Aprovação (25/09 — extraída de pages/scaling-approval.tsx):
 * TabsList com rótulos curtos no celular, os filtros liga/desliga de cada aba
 * e a contagem da aba aberta (única região aria-live da tela).
 */
import { CheckSquare, Square } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { STALLED_DAYS } from "@shared/scaling-validation-rules";
import type { ApprovalFilters, ContagemPendentes } from "./use-approval-filters";
import type { ApprovalVagas } from "./use-approval-vagas";

const TAB_TRIGGER = "h-7 rounded-lg px-3.5 text-sm font-medium";

/**
 * Filtro liga/desliga da barra de abas ("Só as minhas funções" / "Só os que
 * posso decidir"). Botão com `aria-pressed` — mesmo estado do checkbox que
 * substituiu, com a caixa do mockup.
 */
function ToggleFilter({ pressed, onPressedChange, label }: { pressed: boolean; onPressedChange: (v: boolean) => void; label: string }) {
  const Icon = pressed ? CheckSquare : Square;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex items-center gap-2 h-7 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed ? "border-primary/30 bg-brand-soft text-primary" : "border-border bg-card text-slate-600 hover:border-slate-300",
      )}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />{label}
    </button>
  );
}

export function ApprovalTabBar({ f, v, counts, isApprover, showMineFilter, filteredCount, itemsCount }: {
  f: ApprovalFilters; v: ApprovalVagas; counts: ContagemPendentes; isApprover: boolean; showMineFilter: boolean; filteredCount: number; itemsCount: number;
}) {
  const { tab, mineOnly, setMineOnly } = f;
  const { awaitingRows, awaitingRowsAll, stalledRows, stalledRowsAll, showOnlyMineStalled, onlyMineAwaiting, setOnlyMineAwaiting, onlyMineStalled, setOnlyMineStalled } = v;

  /** Contagem da aba aberta — a única região aria-live da tela. "Decididas" tem a própria nota de rodapé. */
  const contagemDaAba: string | null = (() => {
    switch (tab) {
      case "fila": return `${filteredCount} de ${itemsCount} pedido(s)`;
      case "aprovacao": return `${awaitingRows.length} vaga(s) validada(s) aguardando a sua decisão`;
      case "paradas": return `${stalledRows.length} ${stalledRows.length === 1 ? "vaga que a área não validou" : "vagas que a área não validou"} há ${STALLED_DAYS}+ dias`;
      default: return null;
    }
  })();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {/* Quebra linha em vez de vazar (04/09): com quatro abas o TabsList
          passava de 100% no celular e cortava "Decididas". Abaixo de sm os
          rótulos encurtam — o contexto já está no tile e no cabeçalho. */}
      <TabsList className="h-auto max-w-full flex-wrap justify-start rounded-xl bg-muted p-[3px]">
        {/* Caminho normal do fluxo desde 19/08: validar não aprova — a vaga passa por aqui. */}
        {isApprover && (
          <TabsTrigger value="aprovacao" className={TAB_TRIGGER}>
            <span className="sm:hidden">Aguardando</span>
            <span className="hidden sm:inline">Vagas aguardando aprovação</span>
            {awaitingRows.length > 0 ? ` (${awaitingRows.length})` : ""}
          </TabsTrigger>
        )}
        <TabsTrigger value="fila" className={TAB_TRIGGER}>
          <span className="sm:hidden">Pedidos</span>
          <span className="hidden sm:inline">Fila de pedidos</span>
        </TabsTrigger>
        {isApprover && (
          <TabsTrigger value="paradas" className={TAB_TRIGGER}>
            <span className="sm:hidden">Paradas</span>
            <span className="hidden sm:inline">Paradas na área</span>
            {stalledRows.length > 0 ? ` (${stalledRows.length})` : ""}
          </TabsTrigger>
        )}
        <TabsTrigger value="decididas" className={TAB_TRIGGER}>Decididas</TabsTrigger>
      </TabsList>
      <div className="flex flex-wrap items-center gap-3">
        {tab === "fila" && showMineFilter && (
          <ToggleFilter
            pressed={mineOnly}
            onPressedChange={setMineOnly}
            label={`Só os que posso decidir${counts.meus ? ` (${counts.meus})` : ""}`}
          />
        )}
        {tab === "aprovacao" && showOnlyMineStalled && awaitingRowsAll.some((s) => s.canDecide !== true) && (
          <ToggleFilter
            pressed={onlyMineAwaiting}
            onPressedChange={setOnlyMineAwaiting}
            label={`Só as minhas funções${onlyMineAwaiting && awaitingRows.length !== awaitingRowsAll.length ? ` (${awaitingRowsAll.length - awaitingRows.length} oculta(s))` : ""}`}
          />
        )}
        {tab === "paradas" && showOnlyMineStalled && stalledRowsAll.length > 0 && (
          <ToggleFilter
            pressed={onlyMineStalled}
            onPressedChange={setOnlyMineStalled}
            label={`Só as minhas funções${onlyMineStalled && stalledRows.length !== stalledRowsAll.length ? ` (${stalledRowsAll.length - stalledRows.length} oculta(s))` : ""}`}
          />
        )}
        {/* Única região aria-live da tela — a contagem da aba aberta. Em
            "Decididas" some: o texto das paradas ali era um rótulo errado. */}
        {contagemDaAba !== null && (
          <p className="text-xs text-muted-foreground" aria-live="polite">{contagemDaAba}</p>
        )}
      </div>
    </div>
  );
}
