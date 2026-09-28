// Extraído de rh-control.tsx em 25/09 (modularização): o acordeão de um
// evento na fila (cabeçalho com contadores por etapa + tooltip "Etapas
// presentes") e a lista de cartões memoizados dentro dele.
// Desde o endpoint agregado a linha já traz NF (`invoice`) e isenção
// (`emiteNf`) — os resolvedores por id da página deixaram de existir.
import { memo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight } from "lucide-react";
import type { EventGroup } from "./prestacao-types";
import { CartaoPrestacao } from "./cartao-prestacao";
import type { ToastFn } from "./cartao-prestacao-linha";

export interface RhEventGroupProps {
  group: EventGroup;
  isOpen: boolean;
  onToggle: (eventId: string) => void;
  expandedCards: Set<string>;
  expandedDetails: Set<string>;
  approvingInvoiceId: string | null;
  nfApproving: boolean;
  canRh: boolean;
  toggleExpand: (id: string) => void;
  toggleDetails: (id: string) => void;
  navigate: (path: string) => void;
  setApprovingInvoiceId: (id: string | null) => void;
  setNfApproving: (v: boolean) => void;
  toast: ToastFn;
}

export const RhEventGroup = memo(function RhEventGroup({
  group, isOpen, onToggle, expandedCards, expandedDetails, approvingInvoiceId, nfApproving, canRh,
  toggleExpand, toggleDetails, navigate, setApprovingInvoiceId, setNfApproving, toast,
}: RhEventGroupProps) {
  const statuses = group.items.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {} as Record<string, number>);
  // Split aprovada_faturamento: only truly concluded when NF is approved
  const nfApprovedCount = group.items.filter(i => {
    if (i.status !== "aprovada_faturamento" || !i.actual) return false;
    const inv = i.invoice;
    return inv?.status === "aprovada" && !!inv?.checkinAt;
  }).length;
  const checkinPendingGroupCount = group.items.filter(i => {
    if (i.status !== "aprovada_faturamento" || !i.actual) return false;
    const inv = i.invoice;
    return inv?.status === "aprovada" && !inv?.checkinAt;
  }).length;
  // "Ag. NF" exclui concluídos, check-ins pendentes e quem não emite NF
  // (definido na escalação) — alinha com a tela de Notas Fiscais
  const agNfCount = group.items.filter(i => {
    if (i.status !== "aprovada_faturamento") return false;
    if (i.actual && !i.emiteNf) return false;
    if (!i.actual) return true;
    const inv = i.invoice;
    if (inv?.status === "recusada") return false; // NF recusada é terminal — não está "ag. NF"
    const isDone = inv?.status === "aprovada" && !!inv?.checkinAt;
    const isChkPending = inv?.status === "aprovada" && !inv?.checkinAt;
    return !isDone && !isChkPending;
  }).length;
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden shadow-1">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-muted/60 transition-colors"
        onClick={() => onToggle(group.event.id)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
          <div className="text-left min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{group.event.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{group.items.length} ite{group.items.length === 1 ? 'm' : 'ns'}</span>
              {group.actionNeeded > 0 && (
                <span className="inline-flex items-center gap-1 text-2xs font-bold px-2 py-0.5 rounded-full bg-warning-soft text-warning border border-warning/25">
                  {group.actionNeeded} pendente{group.actionNeeded !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 shrink-0">
                {statuses.prestacao_recebida ? <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-brand-soft text-primary border border-primary/25">{statuses.prestacao_recebida} comparativo{statuses.prestacao_recebida !== 1 ? 's' : ''}</span> : null}
                {statuses.planejamento_pendente ? <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-warning-soft text-warning border border-warning/25">{statuses.planejamento_pendente} planejamento{statuses.planejamento_pendente !== 1 ? 's' : ''}</span> : null}
                {statuses.devolvida_para_ajuste ? <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-warning-soft text-warning border border-warning/25">{statuses.devolvida_para_ajuste} devolvido{statuses.devolvida_para_ajuste !== 1 ? 's' : ''}</span> : null}
                {statuses.aguardando_prestacao ? <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{statuses.aguardando_prestacao} aguardando</span> : null}
                {agNfCount > 0 ? <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-warning-soft text-warning border border-warning/25">{agNfCount} ag. NF</span> : null}
                {checkinPendingGroupCount > 0 ? <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-brand-soft text-primary border border-primary/40">{checkinPendingGroupCount} check-in</span> : null}
                {nfApprovedCount > 0 ? <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-success-soft text-success border border-success/25">{nfApprovedCount} concluído{nfApprovedCount !== 1 ? 's' : ''}</span> : null}
                {statuses.recusada ? <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-danger-soft text-danger border border-danger/25">{statuses.recusada} recusado{statuses.recusada !== 1 ? 's' : ''}</span> : null}
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-2xs space-y-1 p-2.5">
              <div className="font-semibold text-slate-600 mb-1.5">Etapas presentes</div>
              {statuses.prestacao_recebida ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary/40 shrink-0" /><span className="text-primary">Comparativo ({statuses.prestacao_recebida})</span></div> : null}
              {statuses.planejamento_pendente ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning-strong shrink-0" /><span className="text-warning">Planejamento pendente ({statuses.planejamento_pendente})</span></div> : null}
              {statuses.devolvida_para_ajuste ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning-strong shrink-0" /><span className="text-warning">Devolvida ({statuses.devolvida_para_ajuste})</span></div> : null}
              {statuses.aguardando_prestacao ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" /><span className="text-muted-foreground">Aguardando prestação ({statuses.aguardando_prestacao})</span></div> : null}
              {agNfCount > 0 ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary/40 shrink-0" /><span className="text-primary">Aguardando Nota Fiscal ({agNfCount})</span></div> : null}
              {nfApprovedCount > 0 ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success-strong shrink-0" /><span className="text-success">Concluído ({nfApprovedCount})</span></div> : null}
              {statuses.recusada ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-danger-strong shrink-0" /><span className="text-danger">Recusada ({statuses.recusada})</span></div> : null}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </button>

      {isOpen && (
        <div className="border-t border-border px-3 py-2 space-y-1.5 bg-surface-muted/40">
          {group.items.map(item => (
            <CartaoPrestacao
              key={item.id}
              item={item}
              expandido={expandedCards.has(item.id)}
              detalhes={expandedDetails.has(item.id)}
              approvingInvoiceId={approvingInvoiceId}
              nfApproving={nfApproving}
              canRh={canRh}
              toggleExpand={toggleExpand}
              toggleDetails={toggleDetails}
              navigate={navigate}
              setApprovingInvoiceId={setApprovingInvoiceId}
              setNfApproving={setNfApproving}
              toast={toast}
            />
          ))}
        </div>
      )}
    </div>
  );
});
