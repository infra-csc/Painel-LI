// Uma linha da tabela de Hospedagem.
//
// 07/10 (redesenho): a MESMA anatomia da linha de Passagens (ticket-row.tsx) —
// borda esquerda que diz de quem é a vez, pílulas de 22px, a linha inteira abre
// o registro, ações à direita. As colunas da hospedagem: Evento (+ local),
// Função (coluna própria, como em Passagens), Colaborador (+ troca), Estadia
// (check-in e check-out com hora e as diárias; sem reserva, o período da escala
// que ela precisa cobrir), Hotel (+ localização) e Situação (+ reserva e a
// urgência da chegada). No celular/tablet a MESMA árvore de células vira um
// cartão por CSS (`.pas-cartao.hos-cartao` no index.css).
//
// Nada saiu da linha antiga: ID, evento, colaborador, função, check-in e
// check-out com hora, hotel e localização, situação, troca pendente/aprovada
// e as ações de ver e registrar continuam aqui, com os mesmos data-testid.
import { forwardRef, memo } from "react";
import { Eye, BedDouble, ArrowLeftRight, LogIn, LogOut, MapPin, CalendarClock } from "lucide-react";
import type { TeamInclusion, Accommodation } from "@shared/schema";
import { cn } from "@/lib/utils";
import { contarDiarias } from "./accommodations-queue";
import { formatDate, initials, toDateInput } from "./utils";

export interface AccommodationRowProps {
  inclusion: TeamInclusion;
  accommodation: Accommodation | undefined;
  rowIdx: number;
  eventName: string;
  eventLocation: string | null;
  functionName: string;
  /** Nome já no formato de exibição; vazio = vaga sem colaborador. */
  collaboratorName: string;
  hasPendingSwap: boolean;
  hasApprovedSwap: boolean;
  /** Alteração aprovada depois do registro, esperando Compras rever (07/10). */
  alteracaoPendente?: boolean;
  /** "chega em 3 dias" — só nas vagas do bloco Urgente. */
  urgencia?: string | null;
  selected: boolean;
  /** Pendente, ativa e de evento aberto: entra no lote. */
  selectable: boolean;
  canEdit: boolean;
  onToggleSelect: (inclusionId: string) => void;
  onOpen: (inclusion: TeamInclusion) => void;
  /** Índice da linha na lista virtual (o virtualizador mede a altura por ele). */
  "data-index"?: number;
}

/** Forma única das pílulas da linha (h22 · px7 · r6 · 11px/500) — a mesma de Passagens. */
const PILULA = "inline-flex items-center gap-1.5 h-[22px] px-[7px] rounded-md text-2xs font-medium whitespace-nowrap";

/** "07/11" — dia e mês, para o período da escala caber numa linha. */
const diaMes = (d: string | null | undefined) => (d ? formatDate(d).slice(0, 5) : "—");

/** Uma ponta da estadia: ícone, data e hora — a mesma leitura da perna da viagem. */
function Ponta({ entrada, data, hora, testid }: { entrada: boolean; data: string | null | undefined; hora: string | null | undefined; testid: string }) {
  const Icone = entrada ? LogIn : LogOut;
  return (
    <div className="flex items-center gap-1 text-xs whitespace-nowrap min-w-0" data-testid={testid}>
      <Icone className={`h-3.5 w-3.5 shrink-0 ${entrada ? "text-success" : "text-success-strong"}`} aria-hidden="true" />
      <span className="sr-only">{entrada ? "Check-in" : "Check-out"}:</span>
      <span className="font-semibold text-slate-700 tabular-nums">{data ? formatDate(data) : "—"}</span>
      {hora && <span className="text-2xs text-muted-foreground tabular-nums">{hora}</span>}
    </div>
  );
}

// `forwardRef` para a tabela virtualizada medir a altura real da linha (nomes
// que quebram, troca pendente) — sem isso o espaçador chuta e a rolagem pula.
const AccommodationRow = forwardRef<HTMLTableRowElement, AccommodationRowProps>(function AccommodationRow({
  inclusion, accommodation, rowIdx, eventName, eventLocation, functionName, collaboratorName,
  hasPendingSwap, hasApprovedSwap, alteracaoPendente, urgencia, selected, selectable, canEdit,
  onToggleSelect, onOpen, "data-index": dataIndex,
}, ref) {
  const cancelado = inclusion.status === "cancelado";
  const n = inclusion.inclusionNumber;
  const open = () => onOpen(inclusion);
  // Cancelada não abre (a página também recusa): a célula não finge ser clicável.
  const cellCls = `px-2.5 py-2.5 align-top ${cancelado ? "" : "cursor-pointer"}`;
  const abrir = cancelado ? undefined : open;
  const diarias = accommodation ? contarDiarias(accommodation.checkInDate, accommodation.checkOutDate) : 0;
  const escalaInicio = toDateInput(inclusion.scheduleStartDate);
  const escalaFim = toDateInput(inclusion.scheduleEndDate);
  // Borda esquerda: âmbar = espera você (reservar, troca em análise, alteração
  // aprovada para rever); verde = registrada; cinza = cancelada.
  const esperaVoce = (hasPendingSwap || !!alteracaoPendente || !accommodation) && !cancelado;

  return (
    <tr
      ref={ref}
      data-index={dataIndex}
      data-testid={`accommodation-row-${n}`}
      className={cn(
        "pas-linha group border-b border-border last:border-0 border-l-[3px]",
        selected
          ? "bg-brand-soft/70 hover:bg-brand-soft"
          : (hasPendingSwap || alteracaoPendente) && !cancelado
          ? "bg-warning-soft/35 hover:bg-warning-soft/60"
          : rowIdx % 2 === 1 ? "bg-surface-muted/50 hover:bg-brand-soft/40" : "bg-card hover:bg-brand-soft/40",
        cancelado ? "opacity-60" : "",
        cancelado ? "border-l-border" : esperaVoce ? "border-l-warning-strong" : "border-l-success-strong",
      )}
    >
      {/* Seleção — só pendentes de evento aberto */}
      <td data-col="sel" className="pl-3 pr-1 py-2.5 align-top whitespace-nowrap w-9" onClick={(e) => e.stopPropagation()}>
        {/* O alvo é o <label> de 40x40: margem não amplia área de clique e
            padding em checkbox nativo não funciona. */}
        {selectable ? (
          <label className="flex items-center justify-center w-10 h-10 -m-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(inclusion.id)}
              aria-label={`Selecionar hospedagem da inclusão #${n ?? ""}`}
              className="rounded border-slate-300 accent-primary w-4 h-4 cursor-pointer"
              data-testid={`checkbox-batch-${n}`}
            />
          </label>
        ) : <div className="w-4 h-4" />}
      </td>

      {/* ID (+ sinal de alteração aprovada) */}
      <td data-col="id" className={`px-1.5 py-2.5 align-top whitespace-nowrap ${cancelado ? "" : "cursor-pointer"}`} onClick={abrir}>
        {/* A linha abre no clique (mouse); pelo teclado o acesso é este botão, invisível até receber foco. */}
        {!cancelado && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); open(); }}
            className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:rounded-md focus:bg-primary focus:px-2 focus:py-1 focus:text-xs focus:text-primary-foreground"
          >
            Abrir vaga #{n || ""}
          </button>
        )}
        <span className="inline-flex items-center gap-1">
          <span className={`${PILULA} bg-brand-soft text-primary font-mono tabular-nums`}>#{n || "N/A"}</span>
          {alteracaoPendente && (
            <span
              className="pas-sinal inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-warning-soft text-warning-strong"
              title="Alteração aprovada depois do registro — confira a hospedagem"
              data-testid={`accommodation-alteracao-${inclusion.id}`}
            >
              <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="sr-only">Alteração aprovada para rever a hospedagem</span>
            </span>
          )}
        </span>
      </td>

      {/* Evento (+ local) */}
      <td data-col="evento" className={cellCls} data-rotulo="Evento" onClick={abrir} data-testid={`accommodation-event-${n}`}>
        <p className="m-0 text-sm font-semibold leading-5 text-foreground">{eventName}</p>
        {eventLocation && (
          <p className="m-0 mt-0.5 flex items-center gap-1 min-w-0 text-2xs leading-4 text-muted-foreground" title={`Local do evento: ${eventLocation}`}>
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">Local do evento:</span>
            <span className="pas-local truncate">{eventLocation}</span>
          </p>
        )}
      </td>

      {/* Função — coluna própria (como em Passagens, 02/10) */}
      <td data-col="funcao" className={cellCls} data-rotulo="Função" onClick={abrir}>
        <p className="m-0 text-sm leading-5 text-foreground">{functionName}</p>
      </td>

      {/* Colaborador (+ troca) */}
      <td data-col="colab" className={cellCls} data-rotulo="Hóspede" onClick={abrir} data-testid={`accommodation-collaborator-${n}`}>
        <div className="flex items-start gap-2.5">
          <div className="pas-avatar w-7 h-7 rounded-full flex items-center justify-center text-2xs font-semibold shrink-0 bg-brand-soft text-primary" aria-hidden="true">
            {collaboratorName ? initials(collaboratorName) : "?"}
          </div>
          <div className="min-w-0 flex flex-col items-start gap-0.5">
            {collaboratorName
              ? <span className="text-sm font-medium leading-5 text-foreground">{collaboratorName}</span>
              : <span className="text-sm leading-5 text-muted-foreground">Sem colaborador</span>}
            {hasPendingSwap && !cancelado && (
              <span className={`${PILULA} bg-warning-soft text-warning`} data-testid={`badge-swap-pending-${n}`}>
                <span className="w-[5px] h-[5px] rounded-full bg-warning shrink-0" aria-hidden="true" />Troca pendente
              </span>
            )}
            {!hasPendingSwap && hasApprovedSwap && !cancelado && (
              <span
                className={`${PILULA} bg-success-soft text-success`}
                title="Esta vaga teve uma troca de colaborador aprovada — confira a hospedagem"
                data-testid={`badge-swap-approved-${n}`}
              >
                <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />Troca aprovada
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Estadia: check-in e check-out com hora, e as diárias */}
      <td data-col="estadia" className={`${cellCls} overflow-hidden`} data-rotulo="Estadia" onClick={abrir}>
        {accommodation ? (
          <div className="flex flex-col gap-0.5">
            <Ponta entrada data={accommodation.checkInDate} hora={accommodation.checkInTime} testid={`accommodation-checkin-${n}`} />
            <Ponta entrada={false} data={accommodation.checkOutDate} hora={accommodation.checkOutTime} testid={`accommodation-checkout-${n}`} />
            {diarias > 0 && (
              <span className="pl-[18px] text-2xs leading-4 text-muted-foreground tabular-nums">{diarias} {diarias === 1 ? "diária" : "diárias"}</span>
            )}
          </div>
        ) : (
          // Sem reserva: o período da escala é o que o hotel precisa cobrir.
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground italic whitespace-nowrap">Sem reserva</span>
            {(escalaInicio || escalaFim) && (
              <span className="text-2xs leading-4 text-muted-foreground tabular-nums whitespace-nowrap" title="Período de trabalho da escala — o que a hospedagem precisa cobrir">
                Escala {diaMes(escalaInicio)} → {diaMes(escalaFim)}
              </span>
            )}
          </div>
        )}
      </td>

      {/* Hotel (+ localização) */}
      <td data-col="hotel" className={`${cellCls} overflow-hidden`} data-rotulo="Hotel" onClick={abrir} data-testid={`accommodation-hotel-${n}`}>
        {accommodation?.hotelName ? (
          <div className="min-w-0">
            <p className="m-0 text-sm font-medium leading-5 text-foreground truncate" title={accommodation.hotelName}>{accommodation.hotelName}</p>
            {accommodation.hotelLocation && (
              <p className="m-0 mt-0.5 text-2xs leading-4 text-muted-foreground truncate" title={accommodation.hotelLocation}>{accommodation.hotelLocation}</p>
            )}
          </div>
        ) : (
          // "Não informado" em itálico cinza-claro lia como erro do sistema;
          // é só trabalho que ainda não foi feito.
          <span className="text-xs text-muted-foreground">Hotel a definir</span>
        )}
      </td>

      {/* Situação (+ reserva, ou a urgência da chegada) */}
      <td data-col="status" className={`${cellCls} text-left`} data-rotulo="Situação" onClick={abrir} data-testid={`accommodation-status-${n}`}>
        {cancelado ? (
          <span className={`${PILULA} bg-muted text-muted-foreground`}>Cancelado</span>
        ) : accommodation ? (
          <div className="flex flex-col items-start gap-1 min-w-0">
            <span className={`${PILULA} bg-success-soft text-success`}>
              <span className="w-[5px] h-[5px] rounded-full bg-success shrink-0" aria-hidden="true" />Registrada
            </span>
            {accommodation.reservationNumber && (
              <span className="pas-resumo block text-2xs text-muted-foreground whitespace-nowrap max-w-full truncate" title={`Número da reserva: ${accommodation.reservationNumber}`}>
                <span className="sr-only">Reserva </span><span className="font-mono">{accommodation.reservationNumber}</span>
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1 min-w-0">
            <span className={`${PILULA} bg-warning-soft text-warning`}>
              <span className="w-[5px] h-[5px] rounded-full bg-warning shrink-0" aria-hidden="true" />Pendente
            </span>
            {urgencia && (
              <span className="pas-resumo inline-flex items-center gap-1 text-2xs font-medium text-danger-strong whitespace-nowrap" title="Sem hotel e a chegada está a menos de uma semana">
                <span className="w-[5px] h-[5px] rounded-full bg-danger-strong shrink-0" aria-hidden="true" />{urgencia}
              </span>
            )}
          </div>
        )}
      </td>

      {/* Ações */}
      <td data-col="acoes" className="pl-1 pr-2 py-2 align-top whitespace-nowrap">
        <div className="pas-acoes flex items-center justify-end gap-1">
          {/* Registrada (ou quem só consulta): ver. Pendente para quem registra: registrar. */}
          {!cancelado && (accommodation || !canEdit ? (
            <button
              type="button"
              onClick={open}
              data-testid={`view-accommodation-${n}`}
              title="Visualizar hospedagem"
              aria-label={`Visualizar hospedagem da inclusão #${n ?? ""}`}
              className="pas-alvo pas-abrir w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-muted-foreground hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Eye className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={open}
              data-testid={`buy-accommodation-${n}`}
              title="Registrar hospedagem"
              aria-label={`Registrar hospedagem da inclusão #${n ?? ""}`}
              className="pas-alvo w-8 h-8 flex items-center justify-center transition-colors bg-brand-soft text-primary hover:bg-primary hover:text-primary-foreground rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BedDouble className="w-4 h-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
});

export default memo(AccommodationRow);
