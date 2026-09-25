// Extraído de rh-control.tsx em 25/09 (modularização): o cartão de uma
// prestação de contas na fila do Controle RH (linha + corpo expandido).
//
// Card memoizado com dependências EXPLÍCITAS (23/09). Até 25/09 recebia a
// closure `renderPrestacaoCard` (~500 linhas da página) por ref e declarava
// como props "de comparação" tudo que o card lia do estado da página. Na
// modularização a closure virou este componente e as props passaram a ser
// USADAS de fato — o conjunto comparado pelo `React.memo`: item, expandido,
// detalhes, approvingInvoiceId, nfApproving, canRh, mais os handlers, todos
// com identidade estável na página (useCallback / setters / wouter / toast).
// Desde o endpoint agregado (25/09) a NF, a isenção e os nomes (colaborador,
// função, quem decidiu no RH) vêm DENTRO da linha — um item novo do servidor
// é uma referência nova, então o memo repinta exatamente o que mudou.
// Digitar na busca ou expandir outro card não repinta este.
// REGRA: qualquer novo estado lido dentro do card entra aqui como prop.
import { memo } from "react";
import { toTitleCase } from "@/lib/format";
import type { PrestacaoItem } from "./prestacao-types";
import { statusConfig } from "./status-config";
import { getDiffDays, getLeftBorderStyle, getNavigationTarget } from "./prestacao-utils";
import { CartaoPrestacaoLinha, type ToastFn } from "./cartao-prestacao-linha";
import { CartaoPrestacaoCorpo } from "./cartao-prestacao-corpo";

export interface CartaoPrestacaoProps {
  item: PrestacaoItem;
  expandido: boolean;
  detalhes: boolean;
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

export const CartaoPrestacao = memo(function CartaoPrestacao({
  item, expandido, detalhes, approvingInvoiceId, nfApproving, canRh,
  toggleExpand, toggleDetails, navigate, setApprovingInvoiceId, setNfApproving, toast,
}: CartaoPrestacaoProps) {
  const config = statusConfig[item.status];
  const isExpanded = expandido;
  const isResubmitted = item.actual?.resubmitted;
  const navTarget = getNavigationTarget(item);
  const needsRhAction = item.status === "prestacao_recebida" || item.status === "planejamento_pendente";
  const days = getDiffDays(item.lastActivityDate);
  // NF ligada ao Realizado raiz, já resolvida pelo servidor.
  const invoice = item.invoice ?? undefined;
  const borderStyle = getLeftBorderStyle(item, invoice);
  const colName = item.collaboratorId ? toTitleCase(item.collaboratorName ?? "-") : 'A Definir';
  // NF disponível a partir do envio do Realizado — não espera o comparativo.
  const nfEligible = item.status === "aprovada_faturamento" || item.status === "prestacao_recebida";
  const nfInvCard = nfEligible && item.actual ? invoice : undefined;
  const nfStatus = nfInvCard?.status || "pendente";
  const hasCheckin = !!nfInvCard?.checkinAt; // for the physical check-in button
  // Isento definido na escalação — a linha nunca deve cobrar NF deste item.
  const itemEmitsNf = item.emiteNf;

  return (
    <div
      className={`rounded-lg bg-card border border-border overflow-hidden hover:shadow-1 transition-shadow ${borderStyle.border} ${borderStyle.bg}`}
    >
      {/* Card row */}
      <CartaoPrestacaoLinha
        item={item}
        config={config}
        isExpanded={isExpanded}
        isResubmitted={isResubmitted}
        navTarget={navTarget}
        needsRhAction={needsRhAction}
        days={days}
        colName={colName}
        nfEligible={nfEligible}
        nfInvCard={nfInvCard}
        nfStatus={nfStatus}
        hasCheckin={hasCheckin}
        itemEmitsNf={itemEmitsNf}
        canRh={canRh}
        approvingInvoiceId={approvingInvoiceId}
        nfApproving={nfApproving}
        setApprovingInvoiceId={setApprovingInvoiceId}
        setNfApproving={setNfApproving}
        toast={toast}
        navigate={navigate}
        toggleExpand={toggleExpand}
      />

      {/* Expanded body */}
      {isExpanded && (
        <CartaoPrestacaoCorpo
          item={item}
          invoice={invoice}
          itemEmitsNf={itemEmitsNf}
          navTarget={navTarget}
          hasCheckin={hasCheckin}
          canRh={canRh}
          showDetails={detalhes}
          toggleDetails={toggleDetails}
          navigate={navigate}
        />
      )}
    </div>
  );
});
