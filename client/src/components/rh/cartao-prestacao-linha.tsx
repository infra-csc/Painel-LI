// Extraído de rh-control.tsx em 25/09 (modularização): a linha clicável do
// cartão de prestação (avatar, nome, badge de status, alerta de prazo e os
// chips/botões de ação, incluindo a aprovação inline de NF). O corpo
// expandido fica em `cartao-prestacao-corpo.tsx`.
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { useToast } from "@/hooks/use-toast";
import { ChevronDown, AlertTriangle } from "lucide-react";
import type { NotaParaControle, PrestacaoItem } from "./prestacao-types";
import type { StatusConfigEntry } from "./status-config";
import { CHAVE_CONTROLE_RH, avatarColorRh, initialsRh, timeInStatus, type NavigationTarget } from "./prestacao-utils";

export type ToastFn = ReturnType<typeof useToast>["toast"];

export interface CartaoPrestacaoLinhaProps {
  item: PrestacaoItem;
  config: StatusConfigEntry;
  isExpanded: boolean;
  isResubmitted: boolean | null | undefined;
  navTarget: NavigationTarget | null;
  needsRhAction: boolean;
  days: number;
  colName: string;
  nfEligible: boolean;
  nfInvCard: NotaParaControle | undefined;
  nfStatus: string;
  hasCheckin: boolean;
  itemEmitsNf: boolean;
  canRh: boolean;
  approvingInvoiceId: string | null;
  nfApproving: boolean;
  setApprovingInvoiceId: (id: string | null) => void;
  setNfApproving: (v: boolean) => void;
  toast: ToastFn;
  navigate: (path: string) => void;
  toggleExpand: (id: string) => void;
}

export function CartaoPrestacaoLinha({
  item, config, isExpanded, isResubmitted, navTarget, needsRhAction, days, colName,
  nfEligible, nfInvCard, nfStatus, hasCheckin, itemEmitsNf, canRh,
  approvingInvoiceId, nfApproving, setApprovingInvoiceId, setNfApproving, toast,
  navigate, toggleExpand,
}: CartaoPrestacaoLinhaProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={() => toggleExpand(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleExpand(item.id);
        }
      }}
    >
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarColorRh(colName)}`}>
        {initialsRh(colName)}
      </div>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">{colName}</span>
          {item.status === "aprovada_faturamento" ? (
            <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full border ${
              nfStatus === "aprovada" && hasCheckin
                ? "bg-success-soft text-success border-success/25"
                : nfStatus === "aprovada" && !hasCheckin
                ? "bg-brand-soft text-primary border-primary/25"
                : nfStatus === "enviada"
                ? "bg-brand-soft text-primary border-primary/25"
                : nfStatus === "devolvida"
                ? "bg-warning-soft text-warning border-warning/25"
                : nfStatus === "recusada"
                ? "bg-danger-soft text-danger border-danger/25"
                : !itemEmitsNf
                ? "bg-muted text-muted-foreground border-border"
                : "bg-warning-soft text-warning border-warning/25"
            }`}>
              {nfStatus === "aprovada" && hasCheckin ? "Concluído"
                : nfStatus === "aprovada" && !hasCheckin ? "Ag. Check-in"
                : nfStatus === "enviada" ? "NF em análise"
                : nfStatus === "devolvida" ? "NF devolvida"
                : nfStatus === "recusada" ? "NF recusada"
                : !itemEmitsNf ? "Não emite NF"
                : "Ag. Nota Fiscal"}
            </span>
          ) : (
            <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full border ${config.badgeCls}`}>
              {config.shortLabel}
            </span>
          )}
          {isResubmitted && (
            <span className="text-2xs bg-brand-soft text-primary border border-primary/25 font-medium px-1.5 py-0.5 rounded-full">Reenviado</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <p className="text-xs text-muted-foreground truncate">
            {item.functionName ?? "-"}
            {item.planned?.collaboratorType && (
              <span className="ml-1 text-muted-foreground">· {item.planned.collaboratorType === 'casa' ? 'Casa' : 'Freela'}</span>
            )}
          </p>
          {(() => {
            if (item.status === "aprovada_faturamento") return null;
            const today = new Date(); today.setHours(0, 0, 0, 0);
            // Parse local de "YYYY-MM-DD" — new Date(string) interpretaria como UTC
            const parseLocalDate = (s: string | Date | null | undefined): Date | null => {
              if (!s) return null;
              const [y, m, d] = String(s).split("T")[0].split("-").map(Number);
              if (!y || !m || !d) return null;
              return new Date(y, m - 1, d);
            };
            const evEnd = parseLocalDate(item.event.endDate);
            const evStart = parseLocalDate(item.event.startDate);
            const isPending = item.status === "planejamento_pendente" || item.status === "prestacao_recebida";
            if (isPending) {
              if (evEnd && evEnd < today) {
                const dAgo = Math.floor((today.getTime() - evEnd.getTime()) / 864e5);
                return (
                  <span className="text-2xs font-semibold text-danger-strong flex items-center gap-0.5 shrink-0">
                    <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" /> Evento encerrado há {dAgo} dia{dAgo !== 1 ? 's' : ''}
                  </span>
                );
              }
              if (evStart) {
                const dUntil = Math.floor((evStart.getTime() - today.getTime()) / 864e5);
                if (dUntil <= 14) {
                  return (
                    <span className="text-2xs font-semibold text-warning-strong flex items-center gap-0.5 shrink-0">
                      <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" /> Evento em {dUntil <= 0 ? 'andamento' : `${dUntil} dia${dUntil !== 1 ? 's' : ''}`}
                    </span>
                  );
                }
              }
              return null;
            }
            if (days > 30) {
              return (
                <span className="text-2xs font-semibold text-danger-strong flex items-center gap-0.5 shrink-0">
                  <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" /> {timeInStatus(item.lastActivityDate)}
                </span>
              );
            }
            return days > 0 ? <span className="text-2xs text-muted-foreground shrink-0">{timeInStatus(item.lastActivityDate)}</span> : null;
          })()}
        </div>
      </div>

      {/* Action button + chevron */}
      <div className="flex items-center gap-2 shrink-0">
        {/* "Próxima ação" context label */}
        {!isExpanded && (() => {
          if (item.status === "aguardando_prestacao")
            return <span className="text-2xs text-muted-foreground hidden sm:block">Ag. colaborador</span>;
          if (item.status === "devolvida_para_ajuste")
            return <span className="text-2xs text-warning-strong hidden sm:block">Devolvida</span>;
          if (nfEligible && nfStatus === "pendente" && !itemEmitsNf)
            return null; // isento — o badge "Não emite NF" já informa, nada a cobrar
          if (nfEligible && nfStatus === "pendente")
            return <span className="text-2xs text-warning-strong hidden sm:block">Ag. nota fiscal</span>;
          return null;
        })()}
        {needsRhAction && navTarget && !isExpanded && (
          <button
            className={cn("text-2xs font-semibold h-7 px-3 rounded-md text-white transition-colors", (item.status === "prestacao_recebida" ? "bg-success" : "bg-primary"))}
            onClick={(e) => { e.stopPropagation(); navigate(navTarget.path); }}
          >
            {item.status === "prestacao_recebida" ? "Analisar" : "Planejar"}
          </button>
        )}
        {nfEligible && !isExpanded && (() => {
          if (nfStatus === "aprovada") {
            const approvedDateStr = nfInvCard?.paymentDate
              ? new Date(nfInvCard.paymentDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
              : nfInvCard?.approvedAt
              ? new Date(nfInvCard.approvedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
              : "";
            return (
              <span className="text-2xs font-medium text-success bg-success-soft border border-success/25 rounded-md px-2 py-1">
                NF Aprovada{approvedDateStr ? ` · ${approvedDateStr}` : ""}
              </span>
            );
          }
          if (nfStatus === "enviada") {
            // Ações de aprovação de NF são exclusivas do RH/admin
            if (!canRh) {
              return (
                <span className="text-2xs font-medium text-primary bg-brand-soft border border-primary/25 rounded-md px-2 py-1">
                  NF em análise
                </span>
              );
            }
            const isApprovingThis = approvingInvoiceId === nfInvCard?.id;
            if (isApprovingThis) {
              // Aprovar não pede data: a data de pagamento entra só no
              // Check-in Financeiro (mesma cerimônia da tela de Notas Fiscais).
              return (
                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  <span className="text-2xs text-muted-foreground whitespace-nowrap">Aprovar esta nota?</span>
                  <button
                    disabled={nfApproving}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!nfInvCard?.id) return;
                      setNfApproving(true);
                      try {
                        await apiRequest("POST", `/api/invoices/${nfInvCard.id}/approve`, {});
                        // A fila vem do endpoint agregado; a chave global de
                        // notas continua para a tela de Notas Fiscais.
                        await Promise.all([
                          queryClient.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] }),
                          queryClient.invalidateQueries({ queryKey: ["/api/invoices"] }),
                        ]);
                        setApprovingInvoiceId(null);
                        toast({
                          title: "Nota aprovada!",
                          description: "Faça o Check-in Financeiro para definir a data de pagamento.",
                        });
                      } catch (err) {
                        toast({
                          title: "Erro ao aprovar nota",
                          description: apiErrorMessage(err, "Tente novamente"),
                          variant: "destructive",
                        });
                      } finally {
                        setNfApproving(false);
                      }
                    }}
                    className="text-2xs font-semibold h-7 px-2.5 rounded-md disabled:opacity-50 text-white transition-colors bg-success"
                  >
                    {nfApproving ? "..." : "Confirmar"}
                  </button>
                  <button
                    aria-label="Cancelar aprovação"
                    onClick={(e) => { e.stopPropagation(); setApprovingInvoiceId(null); }}
                    className="text-2xs h-7 px-2 rounded-md border border-border text-muted-foreground hover:bg-surface-muted transition-colors"
                  >✕</button>
                </div>
              );
            }
            return (
              <button
                className="text-2xs font-semibold h-7 px-3 rounded-md text-white transition-colors bg-primary-hover"
                onClick={(e) => { e.stopPropagation(); setApprovingInvoiceId(nfInvCard?.id || null); }}
              >
                Aprovar NF
              </button>
            );
          }
          if (nfStatus === "devolvida") {
            return <span className="text-2xs font-medium text-warning-strong border border-warning/25 rounded-md px-2 py-1">NF devolvida</span>;
          }
          // Recusa é terminal — chip vermelho, sem CTA
          if (nfStatus === "recusada") {
            return <span className="text-2xs font-semibold text-danger bg-danger-soft border border-danger/25 rounded-md px-2 py-1">NF recusada</span>;
          }
          // Isento (escalação) — nada a cobrar. Em aprovada_faturamento o badge
          // ao lado do nome já diz "Não emite NF"; nos demais mostra chip neutro.
          if (!itemEmitsNf) {
            return item.status === "aprovada_faturamento"
              ? null
              : <span className="text-2xs font-medium text-muted-foreground bg-muted border border-border rounded-md px-2 py-1">Não emite NF</span>;
          }
          return <span className="text-2xs font-semibold rounded-md px-2 py-1 border bg-warning-soft text-warning border-warning/25">Ag. Nota Fiscal</span>;
        })()}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </div>
    </div>
  );
}
