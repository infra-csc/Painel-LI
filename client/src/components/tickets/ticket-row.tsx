// Uma linha da tabela de Passagens.
//
// 07/10 (redesenho): a coluna "Destino" deixou de existir como coluna — o
// local do evento passou para baixo do nome do evento (é o mesmo para todas as
// vagas da prova) e o trecho comprado (GRU → POA, cidades no rodoviário, a
// empresa da van) foi para junto da data e do horário de cada perna, onde é
// lido. Nenhum dado saiu da linha; a tabela cabe em 1366 com o menu aberto.
// No celular/tablet a MESMA árvore de células vira um cartão por CSS
// (`.pas-cartao` no index.css) — nada é renderizado de outro jeito.
import { forwardRef, memo } from "react";
import { Eye, Plane, ArrowLeftRight, Lock, Stamp, Bus, PlaneTakeoff, PlaneLanding, MapPin, CalendarClock, Truck } from "lucide-react";
import type { TeamInclusion, Ticket } from "@shared/schema";
import { extractTravelSuggestion, formatSuggestionDate, hasSuggestionValue } from "@/lib/ticket-form";
import { formatDate, formatBrl, isOneWayTicket, toTitleCase } from "./use-tickets-data";
import { cn } from "@/lib/utils";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import type { SinalDeViagem } from "./use-sinais-de-viagem";
import { IndicacaoDaLogistica, ProblemasDaViagem, SugestaoDeTrechoDireto, TrechoDiretoDaVaga } from "./sinais-da-vaga";

export interface TicketRowProps {
  inclusion: TeamInclusion;
  ticket: Ticket | undefined;
  rowIdx: number;
  eventName: string;
  functionName: string;
  collaboratorName: string;
  eventLocation: string;
  hasPendingSwap: boolean;
  hasApprovedSwap: boolean;
  /** Alteração aprovada depois da compra, esperando Compras remarcar (07/10). */
  alteracaoPendente?: boolean;
  selected: boolean;
  canEdit: boolean;
  /** Evento encerrado: a linha não entra em ações em lote (servidor devolve 403). */
  locked?: boolean;
  onToggleSelect: (inclusionId: string) => void;
  onOpen: (inclusion: TeamInclusion) => void;
  /** Marca/desmarca "passagem emitida" (o bilhete saiu). Desde 07/10 não trava o pedido de ajuste. */
  onToggleEmitida?: (inclusion: TeamInclusion, emitida: boolean) => void;
  emitindo?: boolean;
  /**
   * Sinais de viagem (09/10): cruza outra viagem, data impossível, trecho
   * direto confirmado e a sugestão "pode ir direto de…" para Compras.
   */
  sinal?: SinalDeViagem;
  /** Nome de um evento por id (indicação da logística: "vem direto de X"). */
  nomeDoEvento?: (eventId: string) => string | null | undefined;
  /** Abre o modal já encadeado à vaga anterior ("Registrar trecho direto"). */
  onTrechoDireto?: (inclusion: TeamInclusion, anteriorId: string) => void;
  /** Índice da linha na lista virtual (o virtualizador mede a altura por ele). */
  "data-index"?: number;
}

const transportLabel = (t: Ticket) => (t.transportType === "van" ? "Van" : t.transportType === "rodoviario" ? "Rodoviário" : "Aéreo");

/** Forma única das pílulas da linha (h22 · px7 · r6 · 11px/500). */
const PILULA = "inline-flex items-center gap-1.5 h-[22px] px-[7px] rounded-md text-2xs font-medium whitespace-nowrap";

/** "LOC AX782Q · R$ 1.500,00 · Aéreo" — resumo curto da compra para tooltip/linha. */
export function ticketSummaryLine(t: Ticket): string {
  const parts: string[] = [];
  if (t.purchaseOrderNumber) parts.push(`${t.transportType === "van" ? "Empresa" : t.transportType === "rodoviario" ? "Bilhete" : "LOC"} ${t.purchaseOrderNumber}`);
  if (t.value != null && t.value > 0) parts.push(formatBrl(t.value));
  parts.push(transportLabel(t));
  return parts.join(" · ");
}

/**
 * Uma perna da viagem em duas linhas curtas: a data, e embaixo partida →
 * chegada e o trecho (GRU→CNF). Cabe numa coluna de 176px sem cortar nada;
 * no rodoviário o trecho são cidades e ganha linha própria.
 */
function Perna({ ida, data, partida, chegada, origem, destino, rodo }: {
  ida: boolean; data: string | null | undefined; partida: string | null | undefined; chegada: string | null | undefined;
  origem: string | null | undefined; destino: string | null | undefined; rodo: boolean;
}) {
  const Icone = rodo ? Bus : ida ? PlaneTakeoff : PlaneLanding;
  const temTrecho = !!(origem || destino);
  return (
    <div className="pas-perna">
      <div className="flex items-center gap-1 text-xs whitespace-nowrap min-w-0">
        <Icone className={`h-3.5 w-3.5 shrink-0 ${ida ? "text-success" : "text-success-strong"}`} aria-hidden="true" />
        <span className="sr-only">{ida ? "Ida" : "Volta"}:</span>
        <span className="font-semibold text-slate-700 tabular-nums">{data ? formatDate(data) : "—"}</span>
      </div>
      {(partida || (temTrecho && !rodo)) && (
        <div className="pl-[18px] flex flex-wrap gap-x-1.5 text-2xs leading-4 text-muted-foreground">
          {partida && <span className="tabular-nums whitespace-nowrap">{partida}{chegada ? ` → ${chegada}` : ""}</span>}
          {temTrecho && !rodo && (
            <span className="font-medium uppercase tracking-tight whitespace-nowrap"><span>{origem || "—"}</span>→<span>{destino || "—"}</span></span>
          )}
        </div>
      )}
      {/* Rodoviário: o trecho são cidades (nomes longos) — linha própria, sem cortar. */}
      {temTrecho && rodo && (
        <div className="pl-[18px] text-2xs font-medium leading-4 text-muted-foreground break-words">
          <span>{origem || "—"}</span>→<span>{destino || "—"}</span>
        </div>
      )}
    </div>
  );
}

// 28/09: `forwardRef` para a tabela virtualizada medir a altura real da linha
// (nomes que quebram, sugestões em duas linhas) — sem isso o espaçador chuta
// e a rolagem "pula".
const TicketRow = forwardRef<HTMLTableRowElement, TicketRowProps>(function TicketRow({
  inclusion, ticket, rowIdx, eventName, functionName, collaboratorName, eventLocation, onToggleEmitida, emitindo,
  hasPendingSwap, hasApprovedSwap, alteracaoPendente, selected, canEdit, locked, onToggleSelect, onOpen, sinal, nomeDoEvento, onTrechoDireto, "data-index": dataIndex,
}, ref) {
  const cancelado = inclusion.status === "cancelado";
  const cellCls = `px-2.5 py-2.5 align-top cursor-pointer ${cancelado ? "opacity-60" : ""}`;
  const open = () => onOpen(inclusion);
  const name = toTitleCase(collaboratorName);
  const initials = collaboratorName === "Não escalado" ? "?" : collaboratorName.split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase();
  const suggestion = extractTravelSuggestion(inclusion);
  const idaVazia = !hasSuggestionValue(suggestion.ida);
  const voltaVazia = !hasSuggestionValue(suggestion.retorno);
  const summary = ticket ? ticketSummaryLine(ticket) : "";
  const rodo = ticket?.transportType === "rodoviario";
  // A borda esquerda diz de quem é a vez: âmbar = espera você (compra
  // pendente, troca em análise, alteração aprovada para remarcar); verde =
  // comprada; cinza = cancelada.
  // Viagem que cruza outra ou data impossível (09/10) também esperam alguém de Compras.
  const esperaVoce = hasPendingSwap || !!alteracaoPendente || (!ticket && !cancelado) || (!cancelado && (!!sinal?.cruzaCom?.length || !!sinal?.dataImpossivel));

  return (
    <tr
      ref={ref}
      data-index={dataIndex}
      /* Hover por classe: o style.backgroundColor inline no mouseleave apagava o âmbar da linha com troca pendente. */
      className={cn(
        "pas-linha group border-b border-border last:border-0 border-l-[3px]",
        selected
          ? "bg-brand-soft/70 hover:bg-brand-soft"
          : hasPendingSwap || alteracaoPendente
          ? "bg-warning-soft/35 hover:bg-warning-soft/60"
          : rowIdx % 2 === 1 ? "bg-surface-muted/50 hover:bg-brand-soft/40" : "bg-card hover:bg-brand-soft/40",
        cancelado ? "opacity-50" : "opacity-100",
        cancelado ? "border-l-border" : esperaVoce ? "border-l-warning-strong" : "border-l-success-strong",
      )}
    >
      {/* Checkbox — só para PENDENTES */}
      <td data-col="sel" className="pl-3 pr-1 py-2.5 align-top whitespace-nowrap w-9" onClick={(e) => e.stopPropagation()}>
        {/* O alvo é o <label> de 40x40: margem não amplia área de clique e
            padding em checkbox nativo não funciona. */}
        {!ticket && !cancelado && !locked ? (
          <label className="flex items-center justify-center w-10 h-10 -m-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(inclusion.id)}
              aria-label={`Selecionar passagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
              className="rounded border-slate-300 accent-primary w-4 h-4 cursor-pointer"
              data-testid={`checkbox-ticket-${inclusion.id}`}
            />
          </label>
        ) : <div className="w-4 h-4" />}
      </td>

      {/* ID (+ sinal de alteração aprovada) */}
      <td data-col="id" className={`px-1.5 py-2.5 align-top whitespace-nowrap ${cancelado ? "opacity-60" : "cursor-pointer"}`} onClick={cancelado ? undefined : open}>
        {/* A linha abre no clique (mouse); pelo teclado o acesso é este botão, invisível até receber foco. */}
        {!cancelado && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); open(); }}
            className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:rounded-md focus:bg-primary focus:px-2 focus:py-1 focus:text-xs focus:text-primary-foreground"
          >
            Abrir vaga #{inclusion.inclusionNumber || ""}
          </button>
        )}
        <span className="inline-flex items-center gap-1">
          <span className={`${PILULA} bg-brand-soft text-primary font-mono tabular-nums`}>
            #{inclusion.inclusionNumber || "N/A"}
          </span>
          {alteracaoPendente && (
            <span
              className="pas-sinal inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-warning-soft text-warning-strong"
              title="Alteração aprovada depois da compra — confira e remarque"
              data-testid={`ticket-alteracao-${inclusion.id}`}
            >
              <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="sr-only">Alteração aprovada para remarcar</span>
            </span>
          )}
        </span>
      </td>

      {/* Evento (+ local do evento, que era a primeira linha da coluna Destino) */}
      <td data-col="evento" className={cellCls} data-rotulo="Evento" onClick={open}>
        {eventName === "Evento não encontrado" ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-danger-soft text-danger-strong text-2xs font-semibold rounded-md">⚠ Não encontrado</span>
        ) : (
          <p className="m-0 text-sm font-semibold leading-5 text-foreground">{eventName}</p>
        )}
        {/* Uma linha só (o endereço inteiro no título): é o mesmo para a
            prova toda e não pode transformar cada vaga numa torre. */}
        <p className="m-0 mt-0.5 flex items-center gap-1 min-w-0 text-2xs leading-4 text-muted-foreground" title={`Destino: ${eventLocation}`}>
          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="sr-only">Destino:</span>
          <span className="pas-local truncate">{eventLocation}</span>
        </p>
      </td>

      {/* Função — coluna própria (02/10: "incluir a coluna de função na tela") */}
      <td data-col="funcao" className={cellCls} data-rotulo="Função" onClick={open}>
        <p className="m-0 text-sm leading-5 text-foreground">{functionName}</p>
      </td>

      {/* Colaborador */}
      <td data-col="colab" className={cellCls} data-rotulo="Passageiro" onClick={open}>
        <div className="flex items-start gap-2.5">
          <div className="pas-avatar w-7 h-7 rounded-full flex items-center justify-center text-2xs font-semibold shrink-0 bg-brand-soft text-primary" aria-hidden="true">{initials}</div>
          <div className="min-w-0 flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium leading-5 text-foreground">{name}</span>
            {hasPendingSwap && (
              <span className={`${PILULA} bg-warning-soft text-warning`}>
                <span className="w-[5px] h-[5px] rounded-full bg-warning shrink-0" aria-hidden="true" />
                Troca pendente
              </span>
            )}
            {!hasPendingSwap && hasApprovedSwap && (
              <span className={`${PILULA} bg-success-soft text-success`}>
                <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />Troca aprovada
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Viagem: datas, horários e o trecho de cada perna */}
      <td data-col="viagem" className={`${cellCls} !pr-1 overflow-hidden`} data-rotulo="Viagem" onClick={open} title={summary || undefined}>
        {ticket ? (
          ticket.transportType === "van" ? (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="sr-only">Van confirmada</span>
              <Truck className="h-3.5 w-3.5 text-success shrink-0" aria-hidden="true" />
              <span className="font-semibold text-slate-700">Van</span>
              {ticket.purchaseOrderNumber && <span className="text-muted-foreground truncate">{ticket.purchaseOrderNumber}</span>}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="sr-only">Passagem confirmada</span>
              <Perna
                ida data={ticket.actualDepartureDate} partida={ticket.actualDepartureTime} chegada={ticket.actualArrivalTime}
                origem={rodo ? ticket.departureCityOrigin : ticket.departureAirport}
                destino={rodo ? ticket.departureCityDestination : ticket.destinationAirport}
                rodo={rodo}
              />
              {!isOneWayTicket(ticket) && (
                <Perna
                  ida={false} data={ticket.actualReturnDate} partida={ticket.actualReturnTime} chegada={ticket.returnArrivalTime}
                  origem={rodo ? ticket.returnCityOrigin : ticket.destinationAirport}
                  destino={rodo ? ticket.returnCityDestination : ticket.departureAirport}
                  rodo={rodo}
                />
              )}
              <TrechoDiretoDaVaga sinal={sinal} inclusionId={inclusion.id} />
              {/* Inverso da sugestão (09/10): a próxima vaga começa logo depois, em outra cidade. */}
              {sinal?.seguePara && <SugestaoDeTrechoDireto sinal={{ seguePara: sinal.seguePara, segueDiretoPara: sinal.segueDiretoPara }} inclusionId={inclusion.id} podeRegistrar={false} />}
            </div>
          )
        ) : (
          <>
            <span className="text-xs text-muted-foreground italic whitespace-nowrap">Não comprada</span>
            {!cancelado && (
              <SugestaoDeTrechoDireto
                sinal={sinal} inclusionId={inclusion.id} podeRegistrar={canEdit && !locked}
                onRegistrar={onTrechoDireto ? (anteriorId) => onTrechoDireto(inclusion, anteriorId) : undefined}
              />
            )}
          </>
        )}
        <ProblemasDaViagem sinal={sinal} inclusionId={inclusion.id} />
      </td>

      {/* Sugestões */}
      <td data-col="sugestao" className={`${cellCls}`} data-rotulo="Sugestão" onClick={open}>
        {idaVazia && voltaVazia ? (
          <span className="text-2xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-col gap-0.5" title="Horário sugerido pela escalação — ainda não confirmado">
            <span className="sr-only">Sugestão</span>
            {!idaVazia && (
              <div className="flex flex-wrap items-center gap-x-1 text-2xs">
                <PlaneTakeoff className="h-3 w-3 text-warning-strong shrink-0" aria-hidden="true" />
                <span className="font-semibold text-slate-700 tabular-nums whitespace-nowrap">{formatSuggestionDate(suggestion.ida)}</span>
                {hasSuggestionValue(suggestion.chegada) && <span className="text-muted-foreground break-words">{suggestion.chegada}</span>}
              </div>
            )}
            {!voltaVazia && (
              <div className="flex flex-wrap items-center gap-x-1 text-2xs">
                <PlaneLanding className="h-3 w-3 text-warning-strong shrink-0" aria-hidden="true" />
                <span className="font-semibold text-slate-700 tabular-nums whitespace-nowrap">{formatSuggestionDate(suggestion.retorno)}</span>
                {hasSuggestionValue(suggestion.horario) && <span className="text-muted-foreground break-words">{suggestion.horario}</span>}
              </div>
            )}
          </div>
        )}
        {nomeDoEvento && <IndicacaoDaLogistica inclusion={inclusion} nomeDoEvento={nomeDoEvento} className="mt-1" />}
      </td>

      {/* Status (+ resumo LOC/valor/tipo) */}
      <td data-col="status" className={`${cellCls} text-left`} data-rotulo="Situação" onClick={open}>
        {cancelado ? (
          <span className={`${PILULA} bg-muted text-muted-foreground`}>Cancelado</span>
        ) : ticket ? (
          <div className="flex flex-col items-start gap-1 min-w-0" title={summary}>
            <span className="flex flex-wrap items-center gap-1">
              <span className={`${PILULA} bg-success-soft text-success`}>
                <span className="w-[5px] h-[5px] rounded-full bg-success shrink-0" aria-hidden="true" />Comprada
              </span>
              {ticket.emittedAt && (
                <span
                  className={`${PILULA} bg-brand-soft text-primary`}
                  title="Passagem emitida — o bilhete saiu"
                  data-testid={`ticket-emitida-${inclusion.id}`}
                >
                  <Lock className="w-3 h-3" aria-hidden="true" />Emitida
                </span>
              )}
            </span>
            {/* Resumo em duas linhas (08/10, print do dono: o valor saía cortado):
                o localizador numa, valor e tipo na outra — cada linha inteira,
                sem quebrar o código no meio. O texto completo fica no title. */}
            <span className="pas-resumo flex flex-col text-2xs leading-snug text-muted-foreground max-w-full" title={summary} data-testid={`ticket-summary-${inclusion.id}`}>
              {(() => {
                const partes = summary.split(" · ");
                const temLocalizador = !!ticket.purchaseOrderNumber;
                const primeira = temLocalizador ? partes[0] : null;
                const resto = (temLocalizador ? partes.slice(1) : partes).join(" · ");
                return (
                  <>
                    {primeira && <span className="block truncate">{primeira}</span>}
                    {resto && <span className="block whitespace-nowrap tabular-nums">{resto}</span>}
                  </>
                );
              })()}
            </span>
          </div>
        ) : (
          <span className={`${PILULA} bg-warning-soft text-warning`}>
            <span className="w-[5px] h-[5px] rounded-full bg-warning shrink-0" aria-hidden="true" />Pendente
          </span>
        )}
      </td>

      {/* Ações */}
      <td data-col="acoes" className="pl-1 pr-2 py-2 align-top whitespace-nowrap">
        <div className="pas-acoes flex items-center justify-end gap-1">
          {/* Emitida: o carimbo de quem compra. Marcar não exige a passagem
              preenchida — é aviso de que o bilhete saiu e de que a área não
              pede mais ajuste. Clicar de novo desfaz (erro de clique acontece). */}
          {!cancelado && onToggleEmitida && (
            <MotivoDesabilitado motivo={ticket?.emittedAt
                ? "Passagem emitida — clique para desfazer"
                : "Marcar como emitida — registra que o bilhete saiu"} desabilitado={!canEdit || locked || emitindo}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleEmitida(inclusion, !ticket?.emittedAt); }}
                disabled={!canEdit || locked || emitindo}
                aria-label={ticket?.emittedAt ? "Desfazer emissão da passagem" : "Marcar passagem como emitida"}
                aria-pressed={!!ticket?.emittedAt}
                data-testid={`toggle-emitida-${inclusion.id}`}
                className={`pas-alvo w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed ${ticket?.emittedAt ? "bg-brand-soft text-primary hover:bg-primary/15" : "text-muted-foreground hover:bg-brand-soft hover:text-primary"}`}
              >
                <Stamp className="w-4 h-4" aria-hidden="true" />
              </button>
            </MotivoDesabilitado>
          )}
          {!cancelado && (
            ticket ? (
              <button
                type="button"
                onClick={open}
                data-testid={`view-ticket-${inclusion.inclusionNumber}`}
                title="Visualizar passagem"
                aria-label={`Visualizar passagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
                className="pas-alvo pas-abrir w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-muted-foreground hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Eye className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : canEdit ? (
              <button
                type="button"
                onClick={open}
                data-testid={`buy-ticket-${inclusion.inclusionNumber}`}
                title="Registrar passagem"
                aria-label={`Registrar passagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
                className="pas-alvo w-8 h-8 flex items-center justify-center transition-colors bg-brand-soft text-primary hover:bg-primary hover:text-primary-foreground rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plane className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : null
          )}
        </div>
      </td>
    </tr>
  );
});

export default memo(TicketRow);
