/**
 * Aba "Pedidos" do Histórico (25/09 — extraída da página): busca + tipo +
 * status e a tabela, com link para a Aprovação.
 *
 * 07/10 (redesenho premium): o desenho da fila da Aprovação, em leitura —
 * filete do TIPO à esquerda, tipo e situação juntos com a data de abertura,
 * quem pediu para qual vaga, o motivo em citação e a decisão (quem, quando,
 * o comentário). Abaixo da largura útil da tabela a mesma marcação vira
 * cartões (`.hes-tabela`), com "Abrir na Aprovação" no rodapé do cartão.
 */
import { Link } from "wouter";
import { ArrowUpRight, Hourglass, PencilLine, SearchX } from "lucide-react";
import type { ScalingChangeRequest } from "@shared/schema";
import { CHANGE_REQUEST_STATUS_LABELS, CHANGE_REQUEST_TYPE_LABELS, type ChangeRequestType } from "@shared/scaling-validation-rules";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuscaDaLista, LimparFiltros } from "@/components/common/barra-de-filtros";
import { AcaoDoEstado } from "@/components/scaling-validation/validation-page/estados";
import { LinhaDoEvento } from "@/components/scaling-approval/linha-do-evento";
import { cn, formatDateRange } from "@/lib/utils";
import { scalingHref } from "@/lib/use-scaling-event";
import { RequestStatusBadge, RequestTypeBadge, formatDateTimeBr } from "@/components/scaling-approval/request-badges";
import { EstadoDoHistorico } from "./estados-do-historico";
import { ALL, TH } from "./event-view-shared";
import type { EventHistory } from "./use-event-history";

/** Filete por tipo de pedido — a mesma leitura de cor da fila da Aprovação. */
const RAIL: Record<ChangeRequestType, string> = {
  ajuste: "bg-warning-strong",
  inclusao: "bg-success-strong",
  exclusao: "bg-danger-strong",
};

const SELECT = "h-9 w-full rounded-lg bg-card text-sm sm:w-auto";

export interface EventRequestsTabProps {
  h: EventHistory;
  eventId: string;
  canOpenApproval: boolean;
}

export function EventRequestsTab({ h, eventId, canOpenApproval }: EventRequestsTabProps) {
  const {
    requests, search, setSearch, requestTypeFilter, setRequestTypeFilter, requestStatusFilter, setRequestStatusFilter,
    requestTypesInView, requestStatusesInView, reqHasFilters, clearReqFilters, filteredRequests, functionNameById, rowById, eventNameOf, eventById,
  } = h;
  const vagaDe = (r: ScalingChangeRequest) => (r.teamInclusionId ? `vaga #${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "?"}` : "vaga nova");
  const periodoDoEvento = (id: string) => {
    const ev = eventById.get(id);
    return ev ? formatDateRange(ev.startDate, ev.endDate, { withYear: true }) : null;
  };

  if (requests.length === 0) {
    return (
      <EstadoDoHistorico
        icone={<PencilLine aria-hidden="true" />}
        titulo={eventId ? "Nenhum pedido neste evento" : "Nenhum pedido nos eventos do recorte"}
        texto="As áreas não abriram pedidos de ajuste, inclusão ou exclusão."
        testId="hes-pedidos-vazio"
      />
    );
  }
  return (
    <>
      {/* Mesma barra da Lista (busca + dois Selects). */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="min-w-0 sm:w-[340px]">
          <BuscaDaLista valor={search} onChange={setSearch} placeholder="Função, #ID, área, pessoa ou texto" rotulo="Buscar pedido" testid="hes-busca-pedidos" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="min-w-0">
            <Label htmlFor="ev-req-type" className="sr-only">Tipo do pedido</Label>
            <Select value={requestTypeFilter} onValueChange={setRequestTypeFilter}>
              <SelectTrigger id="ev-req-type" className={cn(SELECT, "sm:min-w-[160px]", requestTypeFilter !== ALL && "border-primary/40 text-primary")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os tipos</SelectItem>
                {requestTypesInView.map((t) => <SelectItem key={t} value={t}>{CHANGE_REQUEST_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor="ev-req-status" className="sr-only">Status do pedido</Label>
            <Select value={requestStatusFilter} onValueChange={setRequestStatusFilter}>
              <SelectTrigger id="ev-req-status" className={cn(SELECT, "sm:min-w-[170px]", requestStatusFilter !== ALL && "border-primary/40 text-primary")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os status</SelectItem>
                {requestStatusesInView.map((s) => <SelectItem key={s} value={s}>{CHANGE_REQUEST_STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {reqHasFilters && <div className="sm:ml-auto"><LimparFiltros onClick={clearReqFilters} testid="hes-limpar-pedidos" /></div>}
      </div>

      {filteredRequests.length === 0 ? (
        <EstadoDoHistorico
          icone={<SearchX aria-hidden="true" />}
          titulo="Nenhum pedido com esses filtros"
          texto="Ajuste a busca, o tipo ou o status do pedido."
          acao={reqHasFilters ? <AcaoDoEstado principal={false} onClick={clearReqFilters}>Limpar filtros</AcaoDoEstado> : undefined}
          testId="hes-pedidos-sem-resultado"
        />
      ) : (
        <div className="hes-caixa">
          <div className="hes-tabela">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">{eventId ? "Histórico de pedidos do evento" : "Histórico de pedidos dos eventos do recorte"}</caption>
              <thead className="hes-cabecalho border-b border-border bg-surface-muted">
                <tr>
                  <th scope="col" className="w-2 p-0"><span className="sr-only">Tipo (faixa)</span></th>
                  <th scope="col" className={cn(TH, "w-[176px]")}>Pedido</th>
                  <th scope="col" className={cn(TH, "w-[22%]")}>Função e vaga</th>
                  <th scope="col" className={TH}>Motivo</th>
                  <th scope="col" className={cn(TH, "w-[26%]")}>Decisão</th>
                  {canOpenApproval && <th scope="col" className="w-[84px] p-0"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((r) => {
                  const nome = functionNameById.get(r.functionId) ?? "Sem função";
                  return (
                    <tr key={r.id} className="hes-linha hes-linha-leitura border-b border-border align-top last:border-b-0">
                      <td data-col="rail" className="relative w-2 p-0">
                        <span className={cn("absolute inset-y-2.5 left-0 w-[3px] rounded-r-full", RAIL[r.requestType as ChangeRequestType] ?? "bg-slate-300")} aria-hidden="true" />
                      </td>
                      <td data-col="pedido" data-largo className="px-3 py-3">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1">
                            <RequestTypeBadge type={r.requestType} />
                            <RequestStatusBadge status={r.status} />
                          </div>
                          <span className="block text-2xs tabular-nums text-muted-foreground">Aberto em {formatDateTimeBr(r.createdAt)}</span>
                        </div>
                      </td>
                      <td data-col="funcao" data-largo className="px-3 py-3">
                        <div className="min-w-0 space-y-0.5">
                          <span className="block break-words text-sm font-semibold leading-5 text-foreground">{nome}</span>
                          <span className="block break-words text-2xs leading-4 text-muted-foreground">
                            <span className="font-medium tabular-nums text-slate-600">{vagaDe(r)}</span>
                            <span> · por {r.requestedByName}</span>
                          </span>
                          {/* Sem filtro de evento, o pedido precisa dizer de qual ele é. */}
                          {!eventId && <LinhaDoEvento nome={eventNameOf(r)} periodo={periodoDoEvento(r.eventId)} className="pt-1" />}
                        </div>
                      </td>
                      <td data-col="motivo" data-largo data-rotulo="Motivo" className="px-3 py-3">
                        {r.reason
                          ? <p className="line-clamp-3 break-words border-l-2 border-border pl-2 text-xs italic leading-relaxed text-slate-600" title={r.reason}>{r.reason}</p>
                          : <p className="text-xs text-muted-foreground">Sem motivo informado</p>}
                      </td>
                      <td data-col="decisao" data-largo data-rotulo="Decisão" className="px-3 py-3">
                        {r.reviewedByName ? (
                          <div className="space-y-0.5">
                            <span className="block text-2xs text-muted-foreground">
                              <span className="font-medium text-slate-600">{r.reviewedByName}</span> · <span className="tabular-nums">{formatDateTimeBr(r.reviewedAt)}</span>
                            </span>
                            {r.reviewComment
                              ? <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">{r.reviewComment}</p>
                              : <p className="text-xs text-muted-foreground">Sem comentário.</p>}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Hourglass className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" /> Aguardando decisão do aprovador.
                          </span>
                        )}
                      </td>
                      {canOpenApproval && (
                        <td data-col="acoes" className="py-2 pl-0 pr-2 text-right">
                          <Link
                            href={scalingHref("/scaling-approval", eventId, { request: r.id })}
                            title="Abrir na Aprovação"
                            className="hes-abrir-aprovacao val-alvo inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-primary transition-colors hover:border-primary/30 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Abrir na Aprovação o pedido de ${(CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType).toLowerCase()} — ${nome}, ${vagaDe(r)}`}
                          >
                            <span className="hes-so-tabela">Abrir</span><span className="hes-so-cartao">Abrir na Aprovação</span><ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
