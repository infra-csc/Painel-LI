// Extraído de rh-control.tsx em 25/09 (modularização): os 4 cards de métrica
// do topo (Aguardando RH / Colaborador / Nota Fiscal / Concluídos). Clicar num
// card aplica o filtro correspondente na fila (clicar de novo limpa).
//
// `MetricCard` e `MetricLine` eram declarados DENTRO do render da página
// (tipo novo a cada render → React desmontava e remontava os 4 botões a cada
// tecla na busca, perdendo o foco). Aqui viraram componentes de módulo: mesmo
// HTML, mesmas classes, só sem o remount.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Users, Clock, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PrestacaoStatus } from "./prestacao-types";
import type { InvoiceCounts } from "./use-rh-control-data";
import type { RhFiltros } from "./use-rh-filtros";

const MetricLine = ({ label, val, color }: { label: string; val: number; color: string }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-sm font-bold tabular-nums w-7 text-right shrink-0" style={{ color: val > 0 ? color : 'var(--muted-foreground)' }}>{val}</span>
    <span className={cn("text-xs", (val > 0 ? "text-slate-600" : "text-muted-foreground"))}>{label}</span>
  </div>
);

const MetricCard = ({
  stripColor, icon: Icon, iconColor, title, value, children, onClick, active, isLoading,
}: {
  stripColor: string; icon: LucideIcon; iconColor: string; title: string; value: number; children: ReactNode;
  onClick: () => void; active: boolean; isLoading: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={active ? "Clique para limpar este filtro" : "Clique para filtrar a lista por esta categoria"}
    className={`bg-card rounded-xl border overflow-hidden flex flex-col text-left cursor-pointer transition-all hover:shadow-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
      active ? "border-primary ring-2 ring-primary/25 shadow-1" : "border-border"
    }`}
  >
    <div className="h-[3px] w-full" style={{ background: stripColor }} />
    <div className="p-5 flex flex-col flex-1 w-full">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
        <span className="text-xs font-semibold text-slate-600">{title}</span>
      </div>
      <div className="text-4xl font-bold tabular-nums mt-1 mb-3" style={{ color: iconColor }}>
        {isLoading ? <span className="inline-block w-12 h-9 bg-border rounded animate-pulse motion-reduce:animate-none" /> : value}
      </div>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  </button>
);

export interface RhSummaryProps {
  /** `contadores.status` do servidor — sobre todas as linhas do recorte de evento. */
  statusCounts: Record<string, number>;
  invoiceCounts: InvoiceCounts;
  rhActionCount: number;
  concludedCount: number;
  totalForProgress: number;
  isLoading: boolean;
  filtros: RhFiltros;
}

export function RhSummary({ statusCounts, invoiceCounts, rhActionCount, concludedCount, totalForProgress, isLoading, filtros }: RhSummaryProps) {
  const { filterStatus, setFilterEvent, setFilterFunction, setFilterCollaborator, setFilterInvoiceStatus, setSearchTerm, setFilterCheckinOnly, setShowConcluded, setFilterStatus } = filtros;

  const rhPlan = statusCounts.planejamento_pendente || 0;
  const rhComp = statusCounts.prestacao_recebida || 0;
  const rhNf   = invoiceCounts.enviada;
  const chk = invoiceCounts.checkinPending || 0;   // NF approved, RH check-in pending
  // Itens únicos (rhActionCount) — as sublinhas se sobrepõem e somariam a mais
  const rhTotal = rhActionCount;

  const colReal = (statusCounts.aguardando_prestacao || 0) + (statusCounts.devolvida_para_ajuste || 0);
  const colNfDev = invoiceCounts.devolvida;
  // NF ainda não lançada pelo colaborador — "Aguardando lançamento" na tela de NFs
  const colNfPend = invoiceCounts.pending;
  const colTotal = colReal + colNfDev + colNfPend;

  // "Em andamento" = approved actuals in NF/invoicing stage (excluding check-in which is in Aguardando RH)
  const nfAgNf    = invoiceCounts.pending;         // NF not yet submitted
  const nfAnalise = invoiceCounts.enviada;         // NF under RH review
  const nfDevNf   = invoiceCounts.devolvida;       // NF returned for correction
  const emAndamento = nfAgNf + nfAnalise + nfDevNf;
  const recusada = statusCounts.recusada || 0;

  // Clique no card aplica o filtro correspondente (clicar de novo limpa)
  const applyCardFilter = (status: PrestacaoStatus) => {
    setFilterEvent("all");
    setFilterFunction("all");
    setFilterCollaborator("all");
    setFilterInvoiceStatus("all");
    setSearchTerm("");
    setFilterCheckinOnly(false);
    setShowConcluded(false);
    setFilterStatus(prev => (prev === status ? "all" : status));
    setTimeout(() => document.getElementById("rh-listing")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard stripColor="var(--danger-strong)" icon={AlertTriangle} iconColor="var(--danger-strong)" title="Aguardando RH" value={rhTotal} isLoading={isLoading}
          onClick={() => applyCardFilter("rh_action")} active={filterStatus === "rh_action"}>
          <MetricLine label="Planejamento" val={rhPlan} color="var(--danger-strong)" />
          <MetricLine label="Comparativo"  val={rhComp} color="var(--danger-strong)" />
          <MetricLine label="Nota Fiscal"  val={rhNf}   color="var(--danger-strong)" />
          {chk > 0 && <MetricLine label="Check-in" val={chk} color="var(--primary)" />}
        </MetricCard>

        <MetricCard stripColor="var(--primary)" icon={Users} iconColor="var(--primary)" title="Aguardando Colaborador" value={colTotal} isLoading={isLoading}
          onClick={() => applyCardFilter("col_action")} active={filterStatus === "col_action"}>
          <MetricLine label="Realizado"    val={colReal}   color="var(--primary)" />
          <MetricLine label="NF devolvida" val={colNfDev}  color="var(--primary)" />
          <MetricLine label="Aguardando lançamento" val={colNfPend} color="var(--primary)" />
        </MetricCard>

        <MetricCard stripColor="var(--warning)" icon={Clock} iconColor="var(--warning)" title="Nota Fiscal" value={emAndamento} isLoading={isLoading}
          onClick={() => applyCardFilter("nf_andamento")} active={filterStatus === "nf_andamento"}>
          <MetricLine label="Ag. envio"    val={nfAgNf}    color="var(--warning)" />
          <MetricLine label="Em análise"   val={nfAnalise} color="var(--warning)" />
          <MetricLine label="NF devolvida" val={nfDevNf}   color="var(--warning)" />
        </MetricCard>

        <MetricCard stripColor="var(--success)" icon={CheckCircle} iconColor="var(--success)" title="Concluídos" value={concludedCount} isLoading={isLoading}
          onClick={() => applyCardFilter("concluidos")} active={filterStatus === "concluidos"}>
          <MetricLine label={`de ${totalForProgress} total`} val={concludedCount} color="var(--success)" />
          {recusada > 0 && <MetricLine label={`recusado${recusada !== 1 ? 's' : ''}`} val={recusada} color="var(--danger-strong)" />}
        </MetricCard>
      </div>
      <p className="text-2xs text-muted-foreground mt-1.5">
        Clique em um card para filtrar a lista. As categorias se sobrepõem — um item pode aparecer em mais de um card.
      </p>
    </div>
  );
}
