/**
 * Uma linha da Grade do espelho (25/09 — extraída de GradeView).
 * Memoizada: a grade tem ~36 células editáveis por pessoa, e cada tecla na
 * busca re-renderizava todas elas.
 */
import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MirrorRow } from "@shared/operational-mirror-types";
import { estadoDaCelula } from "@shared/mirror-cell-state";
import { contextoDaLinha, type GruposConfirmados } from "@shared/mirror-pendencia";
import { ROOM_TYPE_OPTIONS, type DrawerKind } from "./drawers";
import { EditableCell } from "./editable-cell";
import { SituacaoPill } from "./situacao-pill";
import { BARRA, genderLabel, type Block, type OpenDrawer, type PendenciaDe, type SaveCell } from "./mirror-shared";

export interface GradeRowProps {
  r: MirrorRow;
  hiddenBlocks: Set<Block>;
  compact: boolean;
  saveCell: SaveCell;
  openDrawer: OpenDrawer;
  editMode: boolean;
  canEdit: boolean;
  confirmados: GruposConfirmados;
  pendenciaDe: PendenciaDe;
  irParaVisao: (v: "uber" | "quartos") => void;
}

export const GradeRow = memo(function GradeRow({ r, hiddenBlocks, compact, saveCell, openDrawer, editMode, canEdit, confirmados, pendenciaDe, irParaVisao }: GradeRowProps) {
  const show = (b: Block) => !hiddenBlocks.has(b);
  // Lápis "editar em detalhe" só para quem pode abrir o drawer
  const edit = (kind: DrawerKind) => canEdit ? () => openDrawer(kind, r) : undefined;
  const t: Partial<NonNullable<MirrorRow["ticket"]>> = r.ticket || {};
  const a: Partial<NonNullable<MirrorRow["accommodation"]>> = r.accommodation || {};
  const ctx = contextoDaLinha(r, confirmados);
  const { abertos } = pendenciaDe(r);
  const est = (campo: string, valor: unknown) => estadoDaCelula(campo, valor, ctx);
  const g = r.collaborator.gender && r.collaborator.gender !== "unknown" ? genderLabel[r.collaborator.gender] : null;
  const uf = r.collaborator.state || null;
  return (
    <tr className="border-b hover:bg-primary/[0.04] group" data-testid={`row-${r.teamInclusionId}`}>
      <td className={`sticky left-0 z-20 bg-card group-hover:bg-muted px-2 py-1 font-medium border-r border-border/40 min-w-[210px]`}>
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Dois ou mais blocos abertos: o alerta fica junto do
              nome, onde o olho passa primeiro. */}
          {abertos.length >= 2 && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-label={`${abertos.length} blocos abertos`} />}
          <Tooltip><TooltipTrigger asChild><div className="truncate max-w-[176px] leading-tight">{r.collaborator.fullName}</div></TooltipTrigger><TooltipContent>{r.collaborator.fullName}</TooltipContent></Tooltip>
        </div>
        {/* A segunda linha só existe quando há o que dizer: antes
            todas as linhas exibiam "? · —" e isso virava ruído. */}
        {(g || uf) && <div className="text-2xs text-muted-foreground/70 leading-tight">{[g, uf].filter(Boolean).join(" · ")}</div>}
      </td>
      <td className={`sticky left-[210px] z-20 bg-card group-hover:bg-muted px-2 py-1 border-r border-border/40 min-w-[120px] capitalize`}>{r.function.area || r.function.name || "—"}</td>
      <EditableCell rowId={r.teamInclusionId} field="schedule.startDate" value={r.schedule.startDate} estado={est("schedule.startDate", r.schedule.startDate)} type="date" onSave={saveCell} compact={compact} editMode={editMode} etapa={BARRA.schedule} />
      <EditableCell rowId={r.teamInclusionId} field="schedule.departureDate" value={r.schedule.flightDepartureDate} estado={est("schedule.departureDate", r.schedule.flightDepartureDate)} type="date" onSave={saveCell} compact={compact} editMode={editMode} />
      <EditableCell rowId={r.teamInclusionId} field="schedule.endDate" value={r.schedule.endDate} estado={est("schedule.endDate", r.schedule.endDate)} type="date" onSave={saveCell} compact={compact} editMode={editMode} />
      <EditableCell rowId={r.teamInclusionId} field="schedule.returnDate" value={r.schedule.flightReturnDate} estado={est("schedule.returnDate", r.schedule.flightReturnDate)} type="date" onSave={saveCell} compact={compact} editMode={editMode} />
      {show("passagem") && <>
        <EditableCell rowId={r.teamInclusionId} field="ticket.value" value={t.value} estado={est("ticket.value", t.value)} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" onEdit={edit("ticket")} etapa={BARRA.ticket} />
        <EditableCell rowId={r.teamInclusionId} field="ticket.departureAirport" value={t.departureAirport} estado={est("ticket.departureAirport", t.departureAirport)} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
        <EditableCell rowId={r.teamInclusionId} field="ticket.actualDepartureTime" value={t.actualDepartureTime} estado={est("ticket.actualDepartureTime", t.actualDepartureTime)} type="time" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
        <EditableCell rowId={r.teamInclusionId} field="ticket.actualReturnTime" value={t.actualReturnTime} estado={est("ticket.actualReturnTime", t.actualReturnTime)} type="time" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
        <EditableCell rowId={r.teamInclusionId} field="ticket.returnOriginAirport" value={t.returnOriginAirport} estado={est("ticket.returnOriginAirport", t.returnOriginAirport)} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
        <EditableCell rowId={r.teamInclusionId} field="ticket.locator" value={t.locator} estado={est("ticket.locator", t.locator)} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="mono" />
        <EditableCell rowId={r.teamInclusionId} field="ticket.ticketCompany" value={t.ticketCompany} estado={est("ticket.ticketCompany", t.ticketCompany)} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
        <EditableCell rowId={r.teamInclusionId} field="ticket.purchaseOrderNumber" value={t.purchaseOrderNumber} estado={est("ticket.purchaseOrderNumber", t.purchaseOrderNumber)} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
        <EditableCell rowId={r.teamInclusionId} field="ticket.checkIn3" value={t.checkIn3} estado={est("ticket.checkIn3", t.checkIn3)} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
      </>}
      {show("hospedagem") && <>
        <EditableCell rowId={r.teamInclusionId} field="accommodation.hotelName" value={a.hotelName} estado={est("accommodation.hotelName", a.hotelName)} type="text" onSave={saveCell} compact={compact} editMode={editMode} onEdit={edit("accommodation")} etapa={BARRA.hotel} />
        <EditableCell rowId={r.teamInclusionId} field="accommodation.reservationNumber" value={a.reservationNumber} estado={est("accommodation.reservationNumber", a.reservationNumber)} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="mono" />
        <EditableCell rowId={r.teamInclusionId} field="accommodation.checkInDate" value={a.checkInDate} estado={est("accommodation.checkInDate", a.checkInDate)} type="date" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
        <EditableCell rowId={r.teamInclusionId} field="accommodation.checkOutDate" value={a.checkOutDate} estado={est("accommodation.checkOutDate", a.checkOutDate)} type="date" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
        <EditableCell rowId={r.teamInclusionId} field="accommodation.nightsCount" value={a.nightsCount} estado={est("accommodation.nightsCount", a.nightsCount)} type="int" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
        <EditableCell rowId={r.teamInclusionId} field="accommodation.roomType" value={a.roomType} estado={est("accommodation.roomType", a.roomType)} aoConfirmar={() => irParaVisao("quartos")} type="select" options={ROOM_TYPE_OPTIONS} onSave={saveCell} compact={compact} editMode={editMode} variant="room" />
        <EditableCell rowId={r.teamInclusionId} field="accommodation.dailyRate" value={a.dailyRate} estado={est("accommodation.dailyRate", a.dailyRate)} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" />
        <EditableCell rowId={r.teamInclusionId} field="accommodation.lateCheckout" value={a.lateCheckout} estado={est("accommodation.lateCheckout", a.lateCheckout)} type="bool" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
        <EditableCell rowId={r.teamInclusionId} field="accommodation.totalCents" value={a.totalCents} estado={est("accommodation.totalCents", a.totalCents)} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" />
        <EditableCell rowId={r.teamInclusionId} field="accommodation.paymentCompany" value={a.paymentCompany} estado={est("accommodation.paymentCompany", a.paymentCompany)} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
        <EditableCell rowId={r.teamInclusionId} field="accommodation.hotelOc" value={a.hotelOc} estado={est("accommodation.hotelOc", a.hotelOc)} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
        <EditableCell rowId={r.teamInclusionId} field="accommodation.checkIn4" value={a.checkIn4} estado={est("accommodation.checkIn4", a.checkIn4)} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
      </>}
      {show("bagagem") && <>
        <EditableCell rowId={r.teamInclusionId} field="baggage.amountCents" value={r.baggage.extraCents} estado={est("baggage.amountCents", r.baggage.extraCents)} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" etapa={BARRA.baggage} />
        <EditableCell rowId={r.teamInclusionId} field="baggage.oc" value={r.baggage.oc} estado={est("baggage.oc", r.baggage.oc)} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
        <EditableCell rowId={r.teamInclusionId} field="baggage.checkIn" value={r.baggage.checkIn} estado={est("baggage.checkIn", r.baggage.checkIn)} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
      </>}
      {show("uber") && <>
        <EditableCell rowId={r.teamInclusionId} field="uber.amountCents" value={r.uber.totalCents} estado={est("uber.amountCents", r.uber.totalCents)} aoConfirmar={() => irParaVisao("uber")} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" etapa={BARRA.uber} />
        <EditableCell rowId={r.teamInclusionId} field="uber.oc" value={r.uber.oc} estado={est("uber.oc", r.uber.oc)} aoConfirmar={() => irParaVisao("uber")} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
        <EditableCell rowId={r.teamInclusionId} field="uber.checkIn" value={r.uber.checkIn} estado={est("uber.checkIn", r.uber.checkIn)} aoConfirmar={() => irParaVisao("uber")} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
      </>}
      {show("locacao") && <>
        <EditableCell rowId={r.teamInclusionId} field="carRental.company" value={r.carRental.company} estado={est("carRental.company", r.carRental.company)} type="text" onSave={saveCell} compact={compact} editMode={editMode} onEdit={edit("extras")} etapa={BARRA.car} />
        <EditableCell rowId={r.teamInclusionId} field="carRental.amountCents" value={r.carRental.totalCents} estado={est("carRental.amountCents", r.carRental.totalCents)} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" />
        <EditableCell rowId={r.teamInclusionId} field="carRental.oc" value={r.carRental.oc} estado={est("carRental.oc", r.carRental.oc)} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
        <EditableCell rowId={r.teamInclusionId} field="carRental.checkIn" value={r.carRental.checkIn} estado={est("carRental.checkIn", r.carRental.checkIn)} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
      </>}
      {show("pendencias") && <>
        <td className="px-2 py-1 border-r border-border/30 text-center whitespace-nowrap">
          <SituacaoPill abertos={abertos.length} pendencies={r.pendencies} testId={`pend-${r.teamInclusionId}`} />
        </td>
        <EditableCell rowId={r.teamInclusionId} field="observations" value={r.observations} estado={est("observations", r.observations)} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
      </>}
    </tr>
  );
});
