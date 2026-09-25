/**
 * Aba "Lista" do Histórico (25/09 — extraída da página): situação atual de cada
 * vaga — filtros, tabela (desktop) e cartões (celular).
 */
import { ChevronRight, Info, Search } from "lucide-react";
import { SUGESTAO_STATUS, isSuggestionInclusion } from "@shared/scaling-validation-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { cn, formatDateRange, formatDiarias } from "@/lib/utils";
import { workDaysOf, ymd } from "@/components/scaling-validation/types";
import { periodLabel } from "@/components/scaling-validation/suggestions-list";
import { LegChip, NeedChips } from "@/components/scaling-validation/logistics-chips";
import { OriginBadge } from "./origin-badge";
import { ALL, LABEL, ORIGIN_DOT, SCROLL_X, TH, fmtShort, isDeleted, lastMoveOf, originKey, plural, semLogistica, type EventViewRow } from "./event-view-shared";
import type { EventHistory } from "./use-event-history";

function LogisticaChips({ row }: { row: EventViewRow }) {
  return (
    <>
      <NeedChips needsTicket={row.needsTicket} needsAccommodation={row.needsAccommodation} />
      <LegChip dir="ida" mode={row.transportModeIda} date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime} />
      <LegChip dir="volta" mode={row.transportModeVolta} date={row.flightReturnDate} time={row.flightReturnSuggestedTime} />
      {semLogistica(row) && <span className="text-2xs text-muted-foreground">Sem logística</span>}
    </>
  );
}

export interface EventInclusionsTableProps {
  h: EventHistory;
  eventId: string;
  /** `?tab=escala` sem evento: a Lista explica e leva o foco ao seletor. */
  escalaSemEvento: boolean;
  onFocusEventPicker: () => void;
}

export function EventInclusionsTable({ h, eventId, escalaSemEvento, onFocusEventPicker }: EventInclusionsTableProps) {
  const {
    search, setSearch, functionFilter, setFunctionFilter, originFilter, setOriginFilter, functionsInEvent, originsInEvent,
    listHasFilters, clearListFilters, filteredRows, functionNameById, eventNameOf, setDetailId,
  } = h;
  return (
    <>
      {/* `?tab=escala` sem evento: em vez de trocar de aba em silêncio, a
          Lista diz o que aconteceu e leva o foco ao seletor de evento. */}
      {escalaSemEvento && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-brand-soft px-3.5 py-2.5">
          <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-xs text-slate-700">
            <span className="font-semibold text-foreground">O quadro Escala precisa de um evento.</span>{" "}
            Ele cruza função × dia de UM evento; enquanto isso, a Lista mostra as vagas de todos.
          </p>
          <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg text-xs" onClick={onFocusEventPicker}>
            Escolher evento
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5">
        <div className="relative min-w-[240px] flex-1 space-y-1">
          <Label htmlFor="ev-search" className="sr-only">Buscar vaga</Label>
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="ev-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, #ID, área ou observação" className="h-8 pl-8 rounded-lg text-xs" />
        </div>
        <div className="min-w-[170px]">
          <Label htmlFor="ev-function" className="sr-only">Função</Label>
          <Select value={functionFilter} onValueChange={setFunctionFilter}>
            <SelectTrigger id="ev-function" className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as funções</SelectItem>
              {functionsInEvent.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[190px]">
          <Label htmlFor="ev-origin" className="sr-only">Origem / status</Label>
          <Select value={originFilter} onValueChange={setOriginFilter}>
            <SelectTrigger id="ev-origin" className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as origens</SelectItem>
              {originsInEvent.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {listHasFilters && (
          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-primary" onClick={clearListFilters}>Limpar filtros</Button>
        )}
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState
          live={false}
          className="rounded-xl"
          variant="filtered"
          title="Nada encontrado com esses filtros"
          description="Ajuste a busca, a função ou o filtro de origem/status."
          onClearFilters={listHasFilters ? clearListFilters : undefined}
        />
      ) : (
        <>
          <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden">
            <div className={SCROLL_X} tabIndex={0} role="region" aria-label="Tabela de vagas (rolagem horizontal)">
              <table className="w-full min-w-[1040px] text-sm">
                <caption className="sr-only">{eventId ? "Vagas do evento na Validação de Escala" : "Vagas dos eventos do recorte na Validação de Escala"}</caption>
                <thead className="bg-surface-muted border-b border-border">
                  <tr>
                    <th scope="col" className="w-9 border-b border-border px-0"><span className="sr-only">Origem</span></th>
                    <th scope="col" className={TH}>Vaga</th>
                    {!eventId && <th scope="col" className={cn(TH, "min-w-[170px]")}>Evento</th>}
                    <th scope="col" className={TH}>Período / diárias</th>
                    <th scope="col" className={TH}>Logística</th>
                    <th scope="col" className={cn(TH, "min-w-[230px]")}>Origem / status</th>
                    <th scope="col" className={cn(TH, "min-w-[200px]")}>Último movimento</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => {
                    const days = workDaysOf(row);
                    const dim = isDeleted(row) || (isSuggestionInclusion(row) && row.status === SUGESTAO_STATUS.NEGADA);
                    const last = lastMoveOf(row);
                    const fnName = functionNameById.get(row.functionId) ?? "Sem função";
                    // Logística nos MESMOS chips da Validação (ícone + ida/volta com data):
                    // cada chip carrega o próprio aria-label, então nada fica escondido
                    // num tooltip que só abre no hover.
                    return (
                      <tr key={row.id} className={cn("border-b border-border", i % 2 === 1 ? "bg-surface-muted/40" : "bg-card")}>
                        <td className="w-9 px-0 py-2">
                          <span className={cn("ml-2 block h-10 w-1 rounded-full", ORIGIN_DOT[originKey(row)])} aria-hidden="true" />
                        </td>
                        <td className="px-3 py-2 max-w-[280px]">
                          <div className="min-w-0">
                            {/* #ID e nome num botão só: UMA parada de tabulação por
                                linha (eram duas para a mesma ação), e o alvo de clique
                                cresce sem o #ID deixar de parecer um chip. */}
                            <button
                              type="button" onClick={() => setDetailId(row.id)} title={`Ver o detalhe completo de ${fnName}`}
                              className="group flex max-w-full items-center gap-2 rounded text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className="inline-flex shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-2xs font-semibold text-primary tabular-nums transition-colors group-hover:bg-primary group-hover:text-white">#{row.inclusionNumber}</span>
                              {/* Negada/excluída: riscada e mais clara — mas ainda legível (slate-500, não 400). */}
                              <span className={cn("truncate text-sm font-semibold transition-colors group-hover:text-primary", dim ? "text-muted-foreground line-through" : "text-foreground")}>{fnName}</span>
                            </button>
                            <span className="mt-0.5 block truncate text-2xs text-muted-foreground" title={row.observations ?? undefined}>
                              {row.observations || "Sem observações"}
                            </span>
                          </div>
                        </td>
                        {!eventId && (
                          <td className="px-3 py-2 max-w-[220px]">
                            <span className="block truncate text-sm font-semibold text-slate-700" title={eventNameOf(row)}>{eventNameOf(row)}</span>
                            <span className="block font-mono text-2xs text-muted-foreground">
                              {row.eventStartDate ? formatDateRange(ymd(row.eventStartDate), ymd(row.eventEndDate) || ymd(row.eventStartDate), { withYear: true }) : "Sem datas"}
                            </span>
                          </td>
                        )}
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={cn("font-mono text-xs tabular-nums", dim ? "text-muted-foreground" : "text-slate-700")}>{periodLabel(row)}</span>
                          <span className="ml-1 text-2xs text-muted-foreground">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex min-w-[220px] flex-wrap items-center gap-1">
                            <LogisticaChips row={row} />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <OriginBadge row={row} />
                            {row.requests.length > 0 && <span className="text-2xs text-muted-foreground">{plural(row.requests.length, "pedido", "pedidos")}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="block text-xs text-slate-600">{last.label}</span>
                          <span className="block font-mono text-2xs text-muted-foreground">{fmtShort(last.at)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="md:hidden space-y-2" aria-label={eventId ? "Vagas do evento" : "Vagas dos eventos do recorte"}>
            {filteredRows.map((row) => {
              const days = workDaysOf(row);
              const last = lastMoveOf(row);
              const fnName = functionNameById.get(row.functionId) ?? "Sem função";
              return (
                /* O cartão inteiro abre o drawer (no desktop o #ID/nome já
                   abriam; no celular não havia como). O botão é só o
                   título e se "estica" pelo cartão via ::after — assim o
                   HTML continua válido (sem <dl> dentro de <button>) e a
                   seta à direita diz que o cartão é clicável. */
                <li key={row.id} className="relative rounded-xl border border-border bg-card p-3 space-y-2 transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-slate-300">
                  <div className="flex items-start gap-2">
                    <button
                      type="button" onClick={() => setDetailId(row.id)} title={`Ver o detalhe completo de ${fnName}`}
                      className="min-w-0 flex-1 text-left focus-visible:outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
                    >
                      <span className="block truncate text-sm font-semibold text-foreground">
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{row.inclusionNumber}</span>
                        {fnName}
                      </span>
                    </button>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </div>
                  {!eventId && <p className={cn(LABEL, "truncate font-semibold text-slate-600")}>{eventNameOf(row)}</p>}
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Período</dt><dd className="font-mono text-slate-700">{periodLabel(row)} · {formatDiarias(days.length || row.dailyRates || 0)}</dd>
                    <dt className="text-muted-foreground">Último movimento</dt><dd className="text-slate-700">{last.label}{last.at ? ` · ${fmtShort(last.at)}` : ""}</dd>
                  </dl>
                  <div className="flex flex-wrap items-center gap-1">
                    <LogisticaChips row={row} />
                  </div>
                  {row.observations && <p className="text-xs text-muted-foreground italic">{row.observations}</p>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <OriginBadge row={row} />
                    {row.requests.length > 0 && <span className="text-xs text-muted-foreground">{plural(row.requests.length, "pedido", "pedidos")}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
