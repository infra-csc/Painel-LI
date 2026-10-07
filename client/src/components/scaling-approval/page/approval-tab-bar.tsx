/**
 * Linha das abas da Aprovação (25/09 — extraída de pages/scaling-approval.tsx):
 * as abas, a contagem da aba aberta (única região aria-live da tela) e o
 * filtro "Só as minhas funções" das abas de vagas.
 *
 * 07/10 (redesenho): abas SEGMENTADAS com ícone e contador em pílula — o
 * desenho das abas da Validação e da Escalação. Eram pílulas cinza com
 * "(9)" grudado no rótulo. No celular a faixa rola de lado em vez de quebrar
 * em duas linhas, e os rótulos encurtam.
 */
import { ClipboardCheck, Inbox, Stamp, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { STALLED_DAYS } from "@shared/scaling-validation-rules";
import { ToggleFilter } from "./approval-filter-bar";
import type { ApprovalFilters, ApprovalTab, ContagemPendentes } from "./use-approval-filters";
import type { ApprovalVagas } from "./use-approval-vagas";

/** Aba segmentada — o mesmo desenho das abas da Validação. */
const ABA = "val-alvo h-8 shrink-0 gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-150 hover:text-foreground data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-1 data-[state=active]:ring-1 data-[state=active]:ring-border focus-visible:ring-offset-0";

function Contador({ n, destaque }: { n: number; destaque?: boolean }) {
  if (n <= 0) return null;
  return (
    <span className={cn(
      "ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-2xs font-semibold tabular-nums",
      destaque ? "bg-primary text-primary-foreground" : "bg-muted text-slate-600",
    )}>
      {n}
    </span>
  );
}

function Aba({ value, Icon, curto, longo, n, destaque }: { value: ApprovalTab; Icon: LucideIcon; curto: string; longo: string; n?: number; destaque?: boolean }) {
  return (
    <TabsTrigger value={value} className={ABA}>
      <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
      <span className="lg:hidden">{curto}</span>
      <span className="hidden lg:inline">{longo}</span>
      {n !== undefined && <Contador n={n} destaque={destaque} />}
    </TabsTrigger>
  );
}

export function ApprovalTabBar({ f, v, counts, isApprover, filteredCount, itemsCount, filaIndisponivel = false }: {
  f: ApprovalFilters; v: ApprovalVagas; counts: ContagemPendentes; isApprover: boolean; showMineFilter?: boolean; filteredCount: number; itemsCount: number;
  /** A fila ainda carrega ou falhou: "0 de 0 pedidos" ali seria mentira. */
  filaIndisponivel?: boolean;
}) {
  const { tab } = f;
  const { awaitingRows, stalledRows, suggestionsQuery } = v;
  const vagasIndisponiveis = suggestionsQuery.isLoading || !!suggestionsQuery.error;

  /** Contagem da aba aberta — a única região aria-live da tela. "Decididas" tem a própria nota de rodapé. */
  const contagemDaAba: string | null = (() => {
    switch (tab) {
      case "fila": return filaIndisponivel ? null : `${filteredCount} de ${itemsCount} ${itemsCount === 1 ? "pedido" : "pedidos"}`;
      case "aprovacao": return vagasIndisponiveis ? null : `${awaitingRows.length} ${awaitingRows.length === 1 ? "vaga validada aguardando" : "vagas validadas aguardando"} a sua decisão`;
      case "paradas": return vagasIndisponiveis ? null : `${stalledRows.length} ${stalledRows.length === 1 ? "vaga que a área não validou" : "vagas que a área não validou"} há ${STALLED_DAYS}+ dias`;
      default: return "Decisões já tomadas (somente leitura)";
    }
  })();

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      {/* Rola de lado no celular (sem barra visível) em vez de quebrar linha. */}
      <div className="val-rolagem-x -mx-[var(--page-gutter)] max-w-[calc(100%+2*var(--page-gutter))] px-[var(--page-gutter)] sm:mx-0 sm:max-w-full sm:px-0">
        <TabsList className="h-auto w-max gap-0.5 rounded-lg border border-border bg-background p-[3px]">
          {/* Caminho normal do fluxo desde 19/08: validar não aprova — a vaga passa por aqui. */}
          {isApprover && <Aba value="aprovacao" Icon={Stamp} curto="Aguardando" longo="Vagas aguardando aprovação" n={awaitingRows.length} destaque={tab !== "aprovacao"} />}
          <Aba value="fila" Icon={Inbox} curto="Pedidos" longo="Fila de pedidos" n={counts.pendentes} destaque={false} />
          {isApprover && <Aba value="paradas" Icon={Timer} curto="Paradas" longo="Paradas na área" n={stalledRows.length} />}
          <Aba value="decididas" Icon={ClipboardCheck} curto="Decididas" longo="Decididas" />
        </TabsList>
      </div>
      {contagemDaAba !== null && (
        <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{contagemDaAba}</p>
      )}
    </div>
  );
}

/** A aba de vagas tem o filtro "Só as minhas funções"? Só quando há vaga de outro aprovador. */
export function temFiltroMinhasFuncoes(tab: "aprovacao" | "paradas", v: ApprovalVagas): boolean {
  if (!v.showOnlyMineStalled) return false;
  return tab === "aprovacao" ? v.awaitingRowsAll.some((s) => s.canDecide !== true) : v.stalledRowsAll.length > 0;
}

/** "Só as minhas funções" das abas de vagas (aguardando / paradas). */
export function MinhasFuncoesToggle({ tab, v }: { tab: "aprovacao" | "paradas"; v: ApprovalVagas }) {
  const { awaitingRows, awaitingRowsAll, stalledRows, stalledRowsAll, onlyMineAwaiting, setOnlyMineAwaiting, onlyMineStalled, setOnlyMineStalled } = v;
  if (!temFiltroMinhasFuncoes(tab, v)) return null;
  if (tab === "aprovacao") {
    const ocultas = awaitingRowsAll.length - awaitingRows.length;
    return (
      <ToggleFilter
        pressed={onlyMineAwaiting}
        onPressedChange={setOnlyMineAwaiting}
        label={`Só as minhas funções${onlyMineAwaiting && ocultas > 0 ? ` (${ocultas} ${ocultas === 1 ? "oculta" : "ocultas"})` : ""}`}
      />
    );
  }
  const ocultas = stalledRowsAll.length - stalledRows.length;
  return (
    <ToggleFilter
      pressed={onlyMineStalled}
      onPressedChange={setOnlyMineStalled}
      label={`Só as minhas funções${onlyMineStalled && ocultas > 0 ? ` (${ocultas} ${ocultas === 1 ? "oculta" : "ocultas"})` : ""}`}
    />
  );
}
