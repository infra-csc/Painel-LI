// Cards de KPI da tela de Passagens + banner de trocas pendentes.
import { CheckCircle, Clock, Ticket as TicketIcon, AlertCircle, ArrowLeftRight, Wallet } from "lucide-react";
import { formatBrl, type TicketsData } from "./use-tickets-data";

export function TicketsKpis({ kpis }: { kpis: TicketsData["kpis"] }) {
  const cards = [
    { label: "Total Geral", value: String(kpis.total), stripe: "bg-slate-700", iconBg: "bg-slate-100", iconTx: "text-slate-600", valTx: "#374151", Icon: TicketIcon },
    { label: "Compradas", value: String(kpis.compradas), stripe: "bg-emerald-500", iconBg: "bg-emerald-50", iconTx: "text-emerald-600", valTx: "#059669", Icon: CheckCircle },
    // Inclusão cancelada não é "aguardando".
    { label: "Aguardando", value: String(kpis.aguardando), stripe: "bg-amber-400", iconBg: "bg-amber-50", iconTx: "text-amber-500", valTx: "#D97706", Icon: Clock },
    // Qualidade: comprada mas sem horário de chegada → o Planejado não calcula alimentação/mobilidade.
    { label: "Sem chegada", value: String(kpis.semChegada), stripe: "bg-rose-400", iconBg: "bg-rose-50", iconTx: "text-rose-500", valTx: "#E11D48", Icon: AlertCircle },
    // Valor total/médio das compradas com valor informado (van e rodoviário sem valor ficam fora da média).
    {
      label: "Valor comprado", value: formatBrl(kpis.valor.totalCents),
      sub: kpis.valor.count > 0 ? `média ${formatBrl(kpis.valor.avgCents)} · ${kpis.valor.count} c/ valor` : "sem valores informados",
      stripe: "bg-blue-500", iconBg: "bg-blue-50", iconTx: "text-blue-600", valTx: "#1D4ED8", Icon: Wallet, small: true,
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map(card => (
        <div key={card.label} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" data-testid={`kpi-${card.label}`}>
          <div className={`h-0.5 w-full ${card.stripe}`} />
          <div className="px-4 py-3 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg} ${card.iconTx}`}><card.Icon className="w-4 h-4" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase leading-none mb-1">{card.label}</p>
              <p className={`${card.small ? "text-[15px]" : "text-[22px]"} font-bold leading-none truncate`} style={{ color: card.valTx }} title={card.value}>{card.value}</p>
              {card.sub && <p className="text-[10px] text-slate-400 mt-1 truncate">{card.sub}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PendingSwapsBanner({ count, active, onToggle }: { count: number; active: boolean; onToggle: () => void }) {
  if (count <= 0) return null;
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 border text-left transition-colors ${active ? "bg-amber-100 border-amber-400" : "bg-amber-50 border-amber-200 hover:bg-amber-100"}`}
    >
      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0"><ArrowLeftRight className="w-4 h-4 text-amber-600" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-amber-800 leading-snug">
          {count === 1 ? "1 solicitação de troca de colaborador aguarda sua análise" : `${count} solicitações de troca de colaborador aguardam sua análise`}
        </p>
        <p className="text-[11px] text-amber-600 mt-0.5">
          {active ? "Mostrando apenas linhas com troca pendente — clique para ver todas" : "Clique aqui para filtrar e ver apenas as linhas com troca pendente"}
        </p>
      </div>
      <span className="shrink-0 text-[11px] font-bold bg-amber-200 text-amber-800 px-2.5 py-1 rounded-full">
        {active ? "Filtro ativo" : `${count} pendente${count !== 1 ? "s" : ""}`}
      </span>
    </button>
  );
}
