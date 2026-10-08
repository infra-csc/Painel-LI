/**
 * Aba "Lista" do Histórico (25/09 — extraída da página): situação atual de cada
 * vaga — filtros e tabela.
 *
 * 07/10 (redesenho premium): a tabela da Validação e da Aprovação — cabeçalho
 * em caixa de frase que gruda abaixo da barra da tela, filete da situação à
 * esquerda, linha inteira clicável (abre o detalhe da vaga) com o "›" à
 * direita, e o evento embaixo do nome no modo "Todos os eventos" (era uma
 * coluna a mais que obrigava a tabela a rolar de lado). Como na Validação, o
 * período mora na célula da vaga (nome · "#ID · observação" · período) e a
 * logística vem ida/volta primeiro, curta abaixo de 2xl — a coluna própria de
 * Período espremia a Situação em duas linhas. Quando a largura útil
 * fica estreita a MESMA marcação vira cartões pelo CSS (`.hes-tabela`, por
 * container query) — antes havia uma segunda lista só para o celular.
 */
import type { MouseEvent } from "react";
import { ChevronRight, Info, SearchX } from "lucide-react";
import { SUGESTAO_STATUS, isSuggestionInclusion } from "@shared/scaling-validation-rules";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuscaDaLista, LimparFiltros } from "@/components/common/barra-de-filtros";
import { AcaoDoEstado } from "@/components/scaling-validation/validation-page/estados";
import { LinhaDoEvento } from "@/components/scaling-approval/linha-do-evento";
import { cn, formatDateRange, formatDiarias } from "@/lib/utils";
import { workDaysOf, ymd } from "@/components/scaling-validation/types";
import { periodLabel } from "@/components/scaling-validation/suggestions-list";
import { LegChip, NeedChips } from "@/components/scaling-validation/logistics-chips";
import { OriginBadge } from "./origin-badge";
import { EstadoDoHistorico } from "./estados-do-historico";
import { ALL, AVISO, ORIGIN_DOT, TH, fmtShort, isDeleted, lastMoveOf, originKey, plural, semLogistica, type EventViewRow } from "./event-view-shared";
import type { EventHistory } from "./use-event-history";

function LogisticaChips({ row }: { row: EventViewRow }) {
  if (semLogistica(row)) return <span className="text-xs text-muted-foreground">Sem logística</span>;
  // Ida e volta primeiro, depois o que a vaga precisa — a ordem da Validação e
  // da Aprovação. Abaixo de 2xl as pernas saem curtas ("Ida · 20/11"): inteiras,
  // em 1366, empilhavam passagem, ida e volta em três linhas.
  const chips = (curtas: boolean) => (
    <>
      <LegChip dir="ida" mode={row.transportModeIda} date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime} compact={curtas} />
      <LegChip dir="volta" mode={row.transportModeVolta} date={row.flightReturnDate} time={row.flightReturnSuggestedTime} compact={curtas} />
      <NeedChips needsTicket={row.needsTicket} needsAccommodation={row.needsAccommodation} />
    </>
  );
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-1 2xl:hidden">{chips(true)}</div>
      <div className="hidden min-w-0 flex-wrap items-center gap-1 2xl:flex">{chips(false)}</div>
    </>
  );
}

/**
 * A linha inteira abre o detalhe, mas cliques que nasceram num controle da
 * linha (o próprio botão do nome, links) ou que terminam uma seleção de texto
 * são ignorados — copiar uma observação não abre o drawer por cima.
 */
function cliqueDaLinha(e: MouseEvent<HTMLElement>): boolean {
  if ((e.target as HTMLElement).closest("button, a, input")) return false;
  return (window.getSelection?.()?.toString() ?? "") === "";
}

/** Select da barra de filtros — 36px, o mesmo da Validação. */
const SELECT = "h-9 w-full rounded-lg bg-card text-sm sm:w-auto";

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
        <div className={cn(AVISO, "items-center border-primary/20 bg-brand-soft/70 text-slate-700")}>
          <Info className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold text-foreground">O quadro Escala precisa de um evento.</span>{" "}
            Ele cruza função × dia de UM evento; enquanto isso, a Lista mostra as vagas de todos.
          </p>
          <button
            type="button" onClick={onFocusEventPicker}
            className="val-alvo inline-flex h-8 shrink-0 items-center rounded-lg border border-primary/25 bg-card px-3 text-xs font-medium text-primary transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Escolher evento
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="min-w-0 sm:w-[340px]">
          <BuscaDaLista valor={search} onChange={setSearch} placeholder="Função, #ID, área ou observação" rotulo="Buscar vaga" testid="hes-busca-lista" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="min-w-0">
            <Label htmlFor="ev-function" className="sr-only">Função</Label>
            <Select value={functionFilter} onValueChange={setFunctionFilter}>
              <SelectTrigger id="ev-function" className={cn(SELECT, "sm:min-w-[180px]", functionFilter !== ALL && "border-primary/40 text-primary")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as funções</SelectItem>
                {functionsInEvent.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor="ev-origin" className="sr-only">Origem / status</Label>
            <Select value={originFilter} onValueChange={setOriginFilter}>
              <SelectTrigger id="ev-origin" className={cn(SELECT, "sm:min-w-[200px]", originFilter !== ALL && "border-primary/40 text-primary")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as situações</SelectItem>
                {originsInEvent.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {listHasFilters && <div className="sm:ml-auto"><LimparFiltros onClick={clearListFilters} testid="hes-limpar-lista" /></div>}
      </div>

      {filteredRows.length === 0 ? (
        <EstadoDoHistorico
          icone={<SearchX aria-hidden="true" />}
          titulo="Nenhuma vaga com esses filtros"
          texto="Ajuste a busca, a função ou a situação."
          acao={listHasFilters ? <AcaoDoEstado principal={false} onClick={clearListFilters}>Limpar filtros</AcaoDoEstado> : undefined}
          testId="hes-lista-sem-resultado"
        />
      ) : (
        <div className="hes-caixa">
          <div className="hes-tabela">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">{eventId ? "Vagas do evento na Validação de Escala" : "Vagas dos eventos do recorte na Validação de Escala"}</caption>
              <thead className="hes-cabecalho border-b border-border bg-surface-muted">
                <tr>
                  <th scope="col" className="w-2 p-0"><span className="sr-only">Situação (faixa)</span></th>
                  <th scope="col" className={cn(TH, "w-[28%] 2xl:w-[24%]")}>Vaga e período</th>
                  <th scope="col" className={TH}>Logística</th>
                  <th scope="col" className={cn(TH, "w-[27%] 2xl:w-[22%]")}>Situação</th>
                  <th scope="col" className={cn(TH, "w-[150px]")}>Último movimento</th>
                  <th scope="col" className="w-9 p-0"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const days = workDaysOf(row);
                  const dim = isDeleted(row) || (isSuggestionInclusion(row) && row.status === SUGESTAO_STATUS.NEGADA);
                  const last = lastMoveOf(row);
                  const fnName = functionNameById.get(row.functionId) ?? "Sem função";
                  return (
                    <tr
                      key={row.id}
                      onClick={(e) => { if (cliqueDaLinha(e)) setDetailId(row.id); }}
                      data-esmaecida={dim || undefined}
                      className="hes-linha border-b border-border align-top last:border-b-0"
                    >
                      <td data-col="rail" className="relative w-2 p-0">
                        <span className={cn("absolute inset-y-2.5 left-0 w-[3px] rounded-r-full", ORIGIN_DOT[originKey(row)])} aria-hidden="true" />
                      </td>
                      <td data-col="vaga" data-largo className="px-3 py-3">
                        <div className="min-w-0 space-y-0.5">
                          {/* O nome num botão só: UMA parada de tabulação por
                              linha (o rótulo leva o #ID). A linha inteira também
                              abre (mouse). Mesma leitura da Validação: nome,
                              depois "#ID · observação", depois o período. */}
                          <button
                            type="button" onClick={() => setDetailId(row.id)}
                            title={`Ver o detalhe completo de ${fnName}`}
                            aria-label={`Ver o detalhe completo da vaga #${row.inclusionNumber} — ${fnName}`}
                            className="group block max-w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {/* Negada/excluída: riscada e mais clara — mas ainda legível. */}
                            <span className={cn("break-words text-sm font-semibold leading-5 transition-colors group-hover:text-primary", dim ? "text-muted-foreground line-through decoration-muted-foreground/60" : "text-foreground")}>{fnName}</span>
                          </button>
                          <span className="flex min-w-0 items-baseline gap-1.5 text-2xs leading-4">
                            <span className="shrink-0 font-mono font-medium tabular-nums text-muted-foreground">#{row.inclusionNumber}</span>
                            <span className="text-muted-foreground" aria-hidden="true">·</span>
                            <span className={cn("hes-obs min-w-0 truncate", row.observations ? "text-slate-600" : "text-muted-foreground")} title={row.observations ?? undefined}>
                              {row.observations || "Sem observações"}
                            </span>
                          </span>
                          <span className={cn("block pt-0.5 text-xs tabular-nums", dim ? "text-muted-foreground" : "text-slate-700")}>
                            <span className="whitespace-nowrap">{periodLabel(row)}</span>
                            <span className="text-muted-foreground"> · {formatDiarias(days.length || row.dailyRates || 0)}</span>
                          </span>
                          {/* Sem filtro de evento, a vaga diz de qual evento é. */}
                          {!eventId && (
                            <LinhaDoEvento
                              nome={eventNameOf(row)}
                              periodo={row.eventStartDate ? formatDateRange(ymd(row.eventStartDate), ymd(row.eventEndDate) || ymd(row.eventStartDate), { withYear: true }) : "Sem datas"}
                              className="pt-1"
                            />
                          )}
                        </div>
                      </td>
                      <td data-col="logistica" data-largo data-rotulo="Logística" className="px-3 py-3">
                        <LogisticaChips row={row} />
                      </td>
                      <td data-col="situacao" data-rotulo="Situação" className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5 [&>span:first-child]:whitespace-normal">
                          <OriginBadge row={row} />
                          {row.requests.length > 0 && <span className="text-2xs text-muted-foreground">{plural(row.requests.length, "pedido", "pedidos")}</span>}
                        </div>
                      </td>
                      <td data-col="ultimo" data-rotulo="Último movimento" className="px-3 py-3">
                        <span className="block text-xs leading-4 text-slate-700">{last.label}</span>
                        <span className="mt-0.5 block text-2xs tabular-nums text-muted-foreground">{fmtShort(last.at)}</span>
                      </td>
                      <td data-col="abrir" className="py-3 pl-0 pr-2.5 text-right">
                        <ChevronRight className="hes-abrir ml-auto mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </td>
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
