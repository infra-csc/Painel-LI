/**
 * Aba "Pedidos" do Histórico (25/09 — extraída da página): busca + tipo +
 * status, tabela (desktop) e cartões (celular), com link para a Aprovação.
 */
import { Link } from "wouter";
import { ExternalLink, PencilLine, Search } from "lucide-react";
import type { ScalingChangeRequest } from "@shared/schema";
import { CHANGE_REQUEST_STATUS_LABELS, CHANGE_REQUEST_TYPE_LABELS, type ChangeRequestStatus } from "@shared/scaling-validation-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";
import { scalingHref } from "@/lib/use-scaling-event";
import { RequestStatusBadge, RequestTypeBadge, formatDateTimeBr } from "@/components/scaling-approval/request-badges";
import { ALL, LABEL, SCROLL_X, TH } from "./event-view-shared";
import type { EventHistory } from "./use-event-history";

export interface EventRequestsTabProps {
  h: EventHistory;
  eventId: string;
  canOpenApproval: boolean;
}

export function EventRequestsTab({ h, eventId, canOpenApproval }: EventRequestsTabProps) {
  const {
    requests, search, setSearch, requestTypeFilter, setRequestTypeFilter, requestStatusFilter, setRequestStatusFilter,
    requestTypesInView, requestStatusesInView, reqHasFilters, clearReqFilters, filteredRequests, functionNameById, rowById, eventNameOf,
  } = h;
  const approvalLink = (r: ScalingChangeRequest) => (
    canOpenApproval ? (
      <Link href={scalingHref("/scaling-approval", eventId, { request: r.id })} className="inline-flex items-center gap-1 text-2xs font-medium text-primary hover:underline whitespace-nowrap">
        <ExternalLink className="w-3 h-3" aria-hidden="true" /> Abrir na Aprovação
      </Link>
    ) : null
  );
  const vagaDe = (r: ScalingChangeRequest) => (r.teamInclusionId ? `vaga #${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "?"}` : "vaga nova");

  if (requests.length === 0) {
    return (
      <EmptyState
        live={false}
        className="rounded-xl"
        icon={PencilLine}
        title={eventId ? "Nenhum pedido neste evento" : "Nenhum pedido nos eventos do recorte"}
        description="As áreas não abriram pedidos de ajuste, inclusão ou exclusão."
      />
    );
  }
  return (
    <>
      {/* Mesma barra da Lista (busca + dois Selects): a aba tinha só a tabela, e
          com dezenas de pedidos achar um era rolar a tela inteira. */}
      <div className="flex flex-wrap items-end gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5">
        <div className="relative min-w-[240px] flex-1 space-y-1">
          <Label htmlFor="ev-req-search" className="sr-only">Buscar pedido</Label>
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="ev-req-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, #ID, área, pessoa ou texto" className="h-8 pl-8 rounded-lg text-xs" />
        </div>
        <div className="min-w-[150px]">
          <Label htmlFor="ev-req-type" className="sr-only">Tipo do pedido</Label>
          <Select value={requestTypeFilter} onValueChange={setRequestTypeFilter}>
            <SelectTrigger id="ev-req-type" className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os tipos</SelectItem>
              {requestTypesInView.map((t) => <SelectItem key={t} value={t}>{CHANGE_REQUEST_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[190px]">
          <Label htmlFor="ev-req-status" className="sr-only">Status do pedido</Label>
          <Select value={requestStatusFilter} onValueChange={setRequestStatusFilter}>
            <SelectTrigger id="ev-req-status" className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os status</SelectItem>
              {requestStatusesInView.map((s) => <SelectItem key={s} value={s}>{CHANGE_REQUEST_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {reqHasFilters && (
          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-primary" onClick={clearReqFilters}>Limpar filtros</Button>
        )}
      </div>

      {filteredRequests.length === 0 ? (
        <EmptyState
          live={false}
          className="rounded-xl"
          variant="filtered"
          title="Nada encontrado com esses filtros"
          description="Ajuste a busca, o tipo ou o status do pedido."
          onClearFilters={reqHasFilters ? clearReqFilters : undefined}
        />
      ) : (
        <>
          <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden">
            <div className={SCROLL_X} tabIndex={0} role="region" aria-label="Tabela de pedidos (rolagem horizontal)">
              <table className="w-full min-w-[900px] text-sm">
                <caption className="sr-only">{eventId ? "Histórico de pedidos do evento" : "Histórico de pedidos dos eventos do recorte"}</caption>
                <thead className="bg-surface-muted border-b border-border">
                  <tr>
                    <th scope="col" className={TH}>Tipo</th>
                    <th scope="col" className={cn(TH, "min-w-[240px]")}>Função / vaga</th>
                    <th scope="col" className={TH}>Aberto em</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={cn(TH, "min-w-[300px]")}>Decisão / comentário</th>
                    {canOpenApproval && <th scope="col" className={cn(TH, "text-right")}><span className="sr-only">Ações</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r, i) => (
                    <tr key={r.id} className={cn("border-b border-border align-top", i % 2 === 1 ? "bg-surface-muted/40" : "bg-card")}>
                      <td className="px-3 py-2.5 align-top"><RequestTypeBadge type={r.requestType} /></td>
                      <td className="px-3 py-2.5 align-top max-w-[280px]">
                        <span className="block text-sm font-semibold text-foreground truncate">{functionNameById.get(r.functionId) ?? "Sem função"}</span>
                        {/* Sem filtro de evento, o pedido precisa dizer de qual ele é. */}
                        {!eventId && <span className="block truncate text-2xs font-semibold text-muted-foreground" title={eventNameOf(r)}>{eventNameOf(r)}</span>}
                        <span className="block font-mono text-2xs text-muted-foreground">{vagaDe(r)}</span>
                        {r.reason && <span className="mt-0.5 block text-xs text-slate-600 line-clamp-2" title={r.reason}>{r.reason}</span>}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap">
                        <span className="block font-mono text-2xs text-muted-foreground">{formatDateTimeBr(r.createdAt)}</span>
                        <span className="block text-2xs text-muted-foreground">por {r.requestedByName}</span>
                      </td>
                      <td className="px-3 py-2.5 align-top"><RequestStatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5 align-top min-w-[300px]">
                        {r.reviewedByName ? (
                          <>
                            <span className="block text-2xs text-muted-foreground">{r.reviewedByName} · {formatDateTimeBr(r.reviewedAt)}</span>
                            {r.reviewComment && <span className="block text-xs text-slate-700 whitespace-pre-wrap break-words">{r.reviewComment}</span>}
                          </>
                        ) : <span className="text-xs text-muted-foreground">Aguardando decisão do aprovador.</span>}
                      </td>
                      {canOpenApproval && <td className="px-3 py-2.5 align-top text-right">{approvalLink(r)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="md:hidden space-y-2" aria-label={eventId ? "Pedidos do evento" : "Pedidos dos eventos do recorte"}>
            {filteredRequests.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex flex-wrap items-start gap-1.5">
                  <RequestTypeBadge type={r.requestType} />
                  <RequestStatusBadge status={r.status} />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {functionNameById.get(r.functionId) ?? "Sem função"}
                  <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">{vagaDe(r)}</span>
                </p>
                {!eventId && <p className={cn(LABEL, "truncate font-semibold text-slate-600")}>{eventNameOf(r)}</p>}
                <p className={LABEL}>por {r.requestedByName} · {formatDateTimeBr(r.createdAt)}</p>
                {r.reason && <p className="text-xs text-slate-600">{r.reason}</p>}
                {r.reviewedByName && (
                  <p className="border-t border-border pt-2 text-xs text-slate-700">
                    <span className="block text-xs text-muted-foreground">{CHANGE_REQUEST_STATUS_LABELS[r.status as ChangeRequestStatus] ?? r.status} · {r.reviewedByName} · {formatDateTimeBr(r.reviewedAt)}</span>
                    {r.reviewComment}
                  </p>
                )}
                {approvalLink(r)}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
