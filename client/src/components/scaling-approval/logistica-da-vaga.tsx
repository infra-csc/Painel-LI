/**
 * Logística de uma vaga na lista da Aprovação (07/10): ida e volta em chips
 * (curtos abaixo de 2xl, inteiros de 2xl para cima) e o que a vaga precisa
 * (passagem, hotel) UMA vez só — o `LogisticsChips` da Validação duplica os
 * dois blocos inteiros, e aqui cada necessidade precisa existir uma vez para
 * quem lê com leitor de tela.
 */
import { LegChip, NeedChips, legValue } from "@/components/scaling-validation/logistics-chips";
import type { StalledRow } from "./types";

export function LogisticaDaVaga({ row }: { row: StalledRow }) {
  const temPerna = [
    row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime,
    row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime,
  ].some((v) => legValue(v) !== null);
  // Ausência não ganha chip: numa coluna de chips coloridos, um chip cinza
  // pesaria igual a uma necessidade real.
  if (!temPerna && !row.needsTicket && !row.needsAccommodation) {
    return <span className="text-xs text-muted-foreground">Sem logística</span>;
  }
  const pernas = (compacta: boolean) => (
    <>
      <LegChip dir="ida" mode={row.transportModeIda} date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime} compact={compacta} />
      <LegChip dir="volta" mode={row.transportModeVolta} date={row.flightReturnDate} time={row.flightReturnSuggestedTime} compact={compacta} />
    </>
  );
  return (
    <div className="flex flex-wrap items-center gap-1">
      {temPerna && <span className="contents 2xl:hidden">{pernas(true)}</span>}
      {temPerna && <span className="hidden 2xl:contents">{pernas(false)}</span>}
      <NeedChips needsTicket={row.needsTicket} needsAccommodation={row.needsAccommodation} />
    </div>
  );
}
