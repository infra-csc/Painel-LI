/**
 * Cartão da vaga (30/08) — o mesmo bloco em todo diálogo que decide sobre ela:
 * pedir exclusão, aprovar, devolver, reprovar, aprovar em lote.
 *
 * Antes cada um desses diálogos era só título e caixa de comentário: quem
 * decidia precisava lembrar de cor o que estava na linha que acabou de clicar.
 * Aqui a vaga se apresenta — quem é, quando trabalha, o que a logística já
 * reservou — para a decisão sair com o contexto à vista.
 *
 * Só apresentação: nada aqui lê ou grava.
 */
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { formatDayMonthBr } from "@/lib/dates";
import { cn, formatDiarias } from "@/lib/utils";
import { LegChip, NeedChips, SECTION_TITLE } from "./logistics-chips";
import { workDaysOf, type SuggestionRow } from "./types";

/** Dias de trabalho em "dd/mm – dd/mm" (ou o dia único). Vazio → "Sem período". */
export function periodoDaVaga(row: Pick<SuggestionRow, "workDays">): string {
  const dias = workDaysOf(row);
  if (dias.length === 0) return "Sem período";
  const primeiro = dias[0];
  const ultimo = dias[dias.length - 1];
  return primeiro === ultimo ? formatDayMonthBr(primeiro) : `${formatDayMonthBr(primeiro)} – ${formatDayMonthBr(ultimo)}`;
}

/**
 * Pessoas-dia da vaga: uma pessoa por dia de trabalho. É a unidade em que a
 * escala é contada, e o que some do total quando a vaga sai.
 */
export function pessoasDiaDaVaga(row: Pick<SuggestionRow, "workDays" | "dailyRates">): number {
  const dias = workDaysOf(row);
  return dias.length || row.dailyRates || 0;
}

type LinhaDaVaga = Pick<
  SuggestionRow,
  | "inclusionNumber" | "area" | "observations" | "workDays" | "dailyRates"
  | "needsTicket" | "needsAccommodation"
  | "transportModeIda" | "flightDepartureDate" | "flightArrivalSuggestedTime"
  | "transportModeVolta" | "flightReturnDate" | "flightReturnSuggestedTime"
>;

export interface VagaCardProps {
  row: LinhaDaVaga;
  functionName?: string | null;
  /** Rótulo acima dos chips — a exclusão diz "Logística que deixa de ser necessária". */
  rotuloLogistica?: string;
  /** Selo à direita do título (tempo de espera, por exemplo). */
  badge?: ReactNode;
  /** Linha extra sob o período ("Validada por … · …", "A área nunca validou"). */
  nota?: ReactNode;
  className?: string;
}

export function VagaCard({ row, functionName, rotuloLogistica = "Logística", badge, nota, className }: VagaCardProps) {
  const dias = workDaysOf(row);
  const temLogistica = !!(row.needsTicket || row.needsAccommodation || row.transportModeIda || row.transportModeVolta || row.flightDepartureDate || row.flightReturnDate);

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-primary">
          #{row.inclusionNumber}
        </span>
        <span className="truncate text-sm font-semibold text-slate-800">{functionName ?? "Sem função"}</span>
        <span className="truncate text-xs text-slate-500">{row.area || "Sem área"}</span>
        {badge ? <span className="ml-auto shrink-0">{badge}</span> : null}
      </div>

      <p className="text-xs text-slate-600">
        <span className="font-mono tabular-nums text-slate-700">{periodoDaVaga(row)}</span>
        <span className="text-slate-500" aria-hidden="true"> · </span>
        {formatDiarias(dias.length || row.dailyRates || 0)}
      </p>
      {nota ? <p className="text-[11px] text-slate-500">{nota}</p> : null}

      {/* Títulos e textos de ausência em slate-500 (04/09): slate-400 sobre
          branco fica abaixo do contraste mínimo para texto; 400 é só para
          ícone decorativo. */}
      <div className="space-y-1">
        <p className={SECTION_TITLE}>{rotuloLogistica}</p>
        {temLogistica ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <NeedChips needsTicket={row.needsTicket} needsAccommodation={row.needsAccommodation} />
            <LegChip dir="ida" mode={row.transportModeIda} date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime} />
            <LegChip dir="volta" mode={row.transportModeVolta} date={row.flightReturnDate} time={row.flightReturnSuggestedTime} />
          </div>
        ) : (
          <p className="text-xs italic text-slate-500">Sem passagem e sem hospedagem.</p>
        )}
      </div>

      <div className="space-y-1">
        <p className={SECTION_TITLE}>Observações</p>
        <p className={cn("text-xs", row.observations ? "text-slate-600" : "italic text-slate-500")}>
          {row.observations || "Sem observações."}
        </p>
      </div>
    </div>
  );
}

export default VagaCard;

/**
 * Diárias não se digita (30/08): é 1 por dia de trabalho. Enquanto foi campo
 * livre, dava para marcar 5 dias e pedir 3 diárias sem perceber, e quem
 * recebia o pedido lia um número que não fecha com o próprio calendário.
 */
export function DiariasDerivadas({ dias, id }: { dias: number; id: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-slate-600">Diárias</Label>
      <output id={id} className="flex h-9 items-baseline gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3" aria-live="polite">
        <span className="text-[15px] font-bold tabular-nums text-slate-800">{dias}</span>
        <span className="text-xs text-slate-500">{dias === 1 ? "diária" : "diárias"}</span>
      </output>
      <p className="text-[11px] text-slate-500">1 por dia de trabalho — muda ao marcar os dias acima.</p>
    </div>
  );
}
