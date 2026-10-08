// Extraído de rh-control.tsx em 25/09 (modularização); redesenho 08/10.
//
// Um evento da fila. Antes: um cartão-acordeão com sombra por evento, contador
// "N pendentes", pílulas coloridas por etapa (repetidas num tooltip "Etapas
// presentes") e, dentro, cartões com borda grossa à esquerda.
//
// Agora é uma FAIXA de grupo dentro da tabela única da fila: o nome do evento
// lidera, ao lado as datas e o local; à direita a composição do evento numa
// linha de leitura (ponto + número + etapa, só as que existem) e quanto ele
// soma. Clicar recolhe/abre; as linhas ficam nas colunas da tabela.
// Os números e as regras de cada etapa são os de antes.
import { memo } from "react";
import { ChevronRight } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACTIONABLE_STATUSES, type EventGroup } from "./prestacao-types";
import { CartaoPrestacao } from "./cartao-prestacao";
import type { ToastFn } from "./cartao-prestacao-linha";
import { periodoDoEvento } from "./prestacao-utils";

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

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export const RhEventGroup = memo(function RhEventGroup({
  group, isOpen, onToggle, expandedCards, expandedDetails, approvingInvoiceId, nfApproving, canRh,
  toggleExpand, toggleDetails, navigate, setApprovingInvoiceId, setNfApproving, toast,
}: RhEventGroupProps) {
  const statuses = group.items.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {} as Record<string, number>);
  // Aprovada para faturamento só é "concluída" com a NF aprovada E o check-in feito.
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

  // Quanto o recorte do evento vale: o realizado quando existe, senão o planejado
  // (sem quem não participou) — a mesma leitura da coluna Valor.
  const soma = group.items.reduce((s, i) => {
    if (i.planned?.didNotAttend || i.actual?.didNotAttend) return s;
    return s + (i.actual?.totalValue ?? i.planned?.totalValue ?? 0);
  }, 0);

  // Composição: só as etapas presentes, na ordem do trabalho. Tom = de quem é a vez.
  const composicao: { n: number; texto: string; tom: string; dica: string }[] = [
    { n: statuses.prestacao_recebida || 0, texto: statuses.prestacao_recebida === 1 ? "comparativo" : "comparativos", tom: "crh-comp-rh", dica: "Comparativo — o RH analisa" },
    { n: statuses.planejamento_pendente || 0, texto: statuses.planejamento_pendente === 1 ? "planejamento" : "planejamentos", tom: "crh-comp-rh", dica: "Planejamento pendente — o RH planeja os valores" },
    { n: checkinPendingGroupCount, texto: "check-in", tom: "crh-comp-rh", dica: "Nota aprovada — falta o Check-in Financeiro" },
    { n: statuses.devolvida_para_ajuste || 0, texto: statuses.devolvida_para_ajuste === 1 ? "devolvido" : "devolvidos", tom: "crh-comp-atencao", dica: "Devolvida — o responsável corrige e reenvia" },
    { n: statuses.aguardando_prestacao || 0, texto: "aguardando", tom: "crh-comp-neutro", dica: "Aguardando prestação — o responsável preenche o realizado" },
    { n: agNfCount, texto: "ag. NF", tom: "crh-comp-atencao", dica: "Aguardando Nota Fiscal" },
    { n: nfApprovedCount, texto: nfApprovedCount === 1 ? "concluído" : "concluídos", tom: "crh-comp-ok", dica: "Concluído — NF aprovada e check-in feito" },
    { n: statuses.recusada || 0, texto: statuses.recusada === 1 ? "recusado" : "recusados", tom: "crh-comp-erro", dica: "Recusada" },
  ].filter(c => c.n > 0);

  // "N pendentes" somava o que está com o responsável e os devolvidos (08/10):
  // agora o número em destaque é só o do RH, e o total vem à parte, discreto.
  const pendentesNoTotal = group.items.filter(i => ACTIONABLE_STATUSES.includes(i.status) || i.rhPrecisaAgir).length;

  const periodo = periodoDoEvento(group.event);
  const temValor = group.items.some(i => (i.actual ?? i.planned) && !(i.planned?.didNotAttend || i.actual?.didNotAttend));

  return (
    <section className={cn("crh-grupo", isOpen && "crh-grupo-aberto")} aria-label={group.event.name}>
      <button
        type="button"
        className="crh-grupo-topo"
        onClick={() => onToggle(group.event.id)}
        aria-expanded={isOpen}
      >
        <ChevronRight className="crh-grupo-seta w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <span className="crh-grupo-nome min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{group.event.name}</span>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">
            {periodo}{periodo ? " · " : ""}{plural(group.items.length, "item", "itens")}
            {group.rhNeeded > 0 && (
              <span className="text-warning font-medium" title="Esperam o RH: comparativo, planejamento, nota a aprovar ou check-in" data-testid="crh-grupo-com-rh">
                {" "}· {group.rhNeeded} com o RH
              </span>
            )}
            {pendentesNoTotal > group.rhNeeded && (
              <span title="Pendentes no total: com o RH, com o responsável (aguardando prestação) e devolvidas" data-testid="crh-grupo-pendentes">
                {" "}· {plural(pendentesNoTotal, "pendente", "pendentes")}{group.rhNeeded > 0 ? " no total" : ""}
              </span>
            )}
            {group.event.location && <span title={group.event.location}> · {group.event.location}</span>}
          </span>
        </span>
        <span className="crh-grupo-composicao">
          {composicao.map(c => (
            <span key={c.texto} className={cn("crh-comp", c.tom)} title={`${c.dica} (${c.n})`}>
              <span className="crh-comp-ponto" aria-hidden="true" />
              <span className="tabular-nums font-semibold">{c.n}</span> {c.texto}
            </span>
          ))}
        </span>
        <span className="crh-grupo-soma tabular-nums" title="Soma do realizado (ou do planejado, onde ainda não há realizado) dos itens visíveis — sem quem não participou">
          {temValor ? formatarMoeda(soma) : <span className="text-xs font-normal text-muted-foreground">sem valores</span>}
        </span>
      </button>

      {isOpen && (
        <div className="crh-grupo-linhas" role="list" aria-label={`Prestações de ${group.event.name}`}>
          {group.items.map(item => (
            <div role="listitem" key={item.id}>
              <CartaoPrestacao
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
            </div>
          ))}
        </div>
      )}
    </section>
  );
});
