import { useId, useMemo } from "react";
import { BedDouble, Check, PlaneLanding, PlaneTakeoff, Ticket, TriangleAlert, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CampoSaiDe } from "@/components/scaling/campo-sai-de";
import { SAI_DE_SP, validarSaiDeOpcional } from "@shared/swap-sai-de";
import { ModeSelect } from "./mode-select";
import { avisosDeViagem } from "./travel-warnings";
import type { SuggestionGridRow } from "./scaling-grid-utils";
import { TrechoDaPerna, modoDaIda, modoDaVolta, type EventoParaTrecho, type PatchDeTrechos } from "./trechos-da-perna";

export interface LogisticsPanelProps {
  row: SuggestionGridRow;
  disabled?: boolean;
  onChangeRow: (rowId: string, patch: Partial<SuggestionGridRow>) => void;
  /**
   * Dias da grade com quantidade > 0 nesta linha ("AAAA-MM-DD"). Com eles o
   * painel AVISA (não trava) quando ida/volta não batem com as diárias — o
   * mesmo `avisosDeViagem` do cartão de viagem dos pedidos.
   */
  workDays?: string[];
  /** Outros eventos para "vem direto de / segue direto para" (09/10), do mais próximo ao mais longe. */
  eventos?: EventoParaTrecho[];
}

const GROUP = "flex items-center gap-1.5 text-xs font-semibold text-foreground";
const FIELD_LABEL = "mb-1 block text-2xs font-medium text-muted-foreground";
// Mesmo placeholder/title do TimeField dos pedidos (travel-fields.tsx): o
// horário sugerido é texto livre com faixa, e as duas telas têm de dizer isso
// com as mesmas palavras.
const TIME_PLACEHOLDER = "ex.: 8-14h, 22h";
const TIME_TITLE = "Opcional — pode ser uma faixa (8-14h) ou uma hora (22h)";
const inputCls = (filled: boolean) =>
  cn(
    "h-8 text-xs rounded-lg transition-colors focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground",
    filled ? "bg-brand-soft/60 border-primary/30" : "bg-card border-border",
  );

function Toggle({ label, icon: Icon, on, disabled, onToggle, rowName }: {
  label: string; icon: LucideIcon; on: boolean; disabled?: boolean; onToggle: (v: boolean) => void; rowName: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`Precisa de ${label.toLowerCase()} — ${rowName}`}
      disabled={disabled}
      onClick={() => onToggle(!on)}
      className={cn(
        "sug-alvo inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        on ? "border-primary/40 bg-brand-soft text-primary" : "border-border bg-card text-slate-600 hover:border-primary/30 hover:text-primary",
      )}
    >
      {on ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
      {label}
    </button>
  );
}

/**
 * Painel de logística de UMA linha da grade: campos rotulados agrupados em
 * Ida · Volta · Precisa de · Observação. Fica FORA da tabela (num cartão logo
 * abaixo da grade) para continuar visível mesmo com a grade rolada.
 * Controlado — todo change vai para `onChangeRow` da página.
 *
 * 07/10 (redesenho): Ida e Volta lado a lado com o ícone da perna; "Precisa de"
 * e a observação numa segunda linha com rótulo de campo de verdade (antes um
 * `padding-top` de 18px fingia o rótulo e, quando a linha quebrava, sobrava um
 * buraco); os botões de hotel/passagem mostram o ✓ quando marcados.
 */
export function LogisticsPanel({ row, disabled, onChangeRow, workDays, eventos = [] }: LogisticsPanelProps) {
  const patch = (p: Partial<SuggestionGridRow>) => onChangeRow(row.rowId, p);
  // ids reais para <Label htmlFor>: o painel é um só por vez, mas o useId
  // evita colisão com os campos de período/observação da página.
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  // Só ida / só volta / trecho direto (09/10): a perna que não existe esconde os campos.
  // "Vem direto de outro evento" apaga o "Sai de": a origem é a cidade daquele evento.
  const patchTrechos = ({ flightDepartureSuggestedTime: _semCampoNaGrade, ...resto }: PatchDeTrechos) =>
    patch(resto.idaVemDoEventoId ? { ...resto, city: "" } : resto);
  const idaNormal = modoDaIda(row) !== "sem";
  // "Sai de" (09/10): some quando a ida vem direto de outro evento.
  const comSaiDe = modoDaIda(row) !== "direto";
  const cidade = row.city ?? "";
  const saiDeSP = cidade.trim() === SAI_DE_SP;
  const cidadeOk = !!cidade.trim() && !validarSaiDeOpcional(cidade);
  const voltaNormal = modoDaVolta(row) === "normal";
  const avisos = useMemo(
    () => avisosDeViagem({ flightDepartureDate: row.flightDepartureDate, flightReturnDate: row.flightReturnDate }, workDays),
    [row.flightDepartureDate, row.flightReturnDate, workDays],
  );
  return (
    <div className="space-y-3.5">
      <div className="grid gap-x-8 gap-y-4 xl:grid-cols-2">
        <fieldset className="min-w-0">
          <legend className={GROUP}><PlaneTakeoff className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Ida</legend>
          <TrechoDaPerna perna="ida" valor={row} eventos={eventos} disabled={disabled} idBase={id} onPatch={patchTrechos} contexto={row.functionName} className="mt-2" />
          {idaNormal && (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,150px)_minmax(0,140px)_minmax(0,1fr)]">
            <div className="min-w-0">
              <Label htmlFor={f("modal-ida")} className={FIELD_LABEL}>Modal</Label>
              <ModeSelect id={f("modal-ida")} className="w-full" value={row.transportModeIda} disabled={disabled} label={`Modal de ida — ${row.functionName}`} onChange={(v) => patch({ transportModeIda: v })} />
            </div>
            <div className="min-w-0">
              <Label htmlFor={f("data-ida")} className={FIELD_LABEL}>Data</Label>
              <Input id={f("data-ida")} type="date" value={row.flightDepartureDate} disabled={disabled} aria-label={`Data de ida — ${row.functionName}`}
                onChange={(e) => patch({ flightDepartureDate: e.target.value })} className={cn(inputCls(!!row.flightDepartureDate), "w-full tabular-nums")} />
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <Label htmlFor={f("hora-ida")} className={FIELD_LABEL}>Desembarque (chegada)</Label>
              <Input id={f("hora-ida")} type="text" placeholder={TIME_PLACEHOLDER} title={disabled ? undefined : TIME_TITLE} maxLength={40}
                value={row.flightArrivalSuggestedTime} disabled={disabled} aria-label={`Horário de desembarque — ${row.functionName}`}
                onChange={(e) => patch({ flightArrivalSuggestedTime: e.target.value })} className={cn(inputCls(!!row.flightArrivalSuggestedTime), "w-full tabular-nums sm:max-w-[180px]")} />
            </div>
          </div>
          )}
          {/* "Sai de" (09/10) DEPOIS de modal/data/horário: assim a linha de campos da ida continua alinhada com a da volta. */}
          {comSaiDe && (
            <div className="mt-3 max-w-[440px]">
              <CampoSaiDe
                key={row.rowId}
                id="sug-sai-de"
                opcional
                rotulo="Sai de"
                rotuloCidade={`Cidade de onde a equipe sai — ${row.functionName}`}
                ajuda="Cidade de onde a equipe desta linha sai — a Escalação pode trocar por pessoa."
                saiDeSP={saiDeSP}
                cidade={saiDeSP ? SAI_DE_SP : cidade}
                desabilitado={disabled}
                classeRotulo="text-2xs text-muted-foreground"
                classeCidade={cn("h-8 text-xs placeholder:text-muted-foreground", cidadeOk && "border-primary/30 bg-brand-soft/60")}
                onChange={(sp, c) => patch({ city: sp ? SAI_DE_SP : c })}
              />
            </div>
          )}
        </fieldset>

        <fieldset className="min-w-0 xl:border-l xl:border-border xl:pl-8">
          <legend className={GROUP}><PlaneLanding className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Volta</legend>
          <TrechoDaPerna perna="volta" valor={row} eventos={eventos} disabled={disabled} idBase={id} onPatch={patchTrechos} contexto={row.functionName} className="mt-2" />
          {voltaNormal && (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,150px)_minmax(0,140px)_minmax(0,1fr)]">
            <div className="min-w-0">
              <Label htmlFor={f("modal-volta")} className={FIELD_LABEL}>Modal</Label>
              <ModeSelect id={f("modal-volta")} className="w-full" value={row.transportModeVolta} disabled={disabled} label={`Modal de volta — ${row.functionName}`} onChange={(v) => patch({ transportModeVolta: v })} />
            </div>
            <div className="min-w-0">
              <Label htmlFor={f("data-volta")} className={FIELD_LABEL}>Data</Label>
              {/* min = data da ida: o seletor já não oferece volta antes da ida (data digitada continua validada pela regra). */}
              <Input id={f("data-volta")} type="date" value={row.flightReturnDate} disabled={disabled} aria-label={`Data de volta — ${row.functionName}`}
                min={row.flightDepartureDate || undefined}
                onChange={(e) => patch({ flightReturnDate: e.target.value })} className={cn(inputCls(!!row.flightReturnDate), "w-full tabular-nums")} />
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <Label htmlFor={f("hora-volta")} className={FIELD_LABEL}>Embarque (saída)</Label>
              <Input id={f("hora-volta")} type="text" placeholder={TIME_PLACEHOLDER} title={disabled ? undefined : TIME_TITLE} maxLength={40}
                value={row.flightReturnSuggestedTime} disabled={disabled} aria-label={`Horário de embarque da volta — ${row.functionName}`}
                onChange={(e) => patch({ flightReturnSuggestedTime: e.target.value })} className={cn(inputCls(!!row.flightReturnSuggestedTime), "w-full tabular-nums sm:max-w-[180px]")} />
            </div>
          </div>
          )}
        </fieldset>
      </div>

      <div className="flex flex-col gap-x-8 gap-y-3 border-t border-border pt-3.5 sm:flex-row sm:items-end">
        <fieldset className="min-w-0 shrink-0">
          <legend className={FIELD_LABEL}>Precisa de</legend>
          <div className="flex items-center gap-2">
            <Toggle label="Hotel" icon={BedDouble} on={row.needsAccommodation} disabled={disabled} rowName={row.functionName} onToggle={(v) => patch({ needsAccommodation: v })} />
            <Toggle label="Passagem" icon={Ticket} on={row.needsTicket} disabled={disabled} rowName={row.functionName} onToggle={(v) => patch({ needsTicket: v })} />
          </div>
        </fieldset>

        <div className="min-w-0 flex-1">
          <Label htmlFor={f("obs")} className={FIELD_LABEL}>Observação da linha<span className="sr-only"> — {row.functionName}</span></Label>
          <Input id={f("obs")} value={row.observations} disabled={disabled} maxLength={500} placeholder="Ex.: chega junto com a carreta"
            onChange={(e) => patch({ observations: e.target.value })} className={cn(inputCls(!!row.observations), "w-full")} />
        </div>
      </div>

      {/* Avisos de viagem × diárias: aviso, não erro — o envio segue. A frase
          "dá para enviar" aparece UMA vez, no rodapé, e não em cada item. */}
      {avisos.length > 0 && (
        <div className="sug-entra flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2.5 text-xs text-warning" role="status" data-testid="sug-logistics-avisos">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 space-y-0.5">
            <ul className="space-y-0.5">
              {avisos.map((a) => (
                <li key={a} className="font-medium">{a}</li>
              ))}
            </ul>
            <p className="text-warning/90">Só um aviso — dá para enviar assim mesmo.</p>
          </div>
        </div>
      )}

      <p className="text-2xs leading-relaxed text-muted-foreground">
        Horário é uma faixa ou janela para Compras (ex.: "8-14h", "20h+"), não a hora exata do voo — quem compra confirma na tela de Passagens.
      </p>
    </div>
  );
}

export default LogisticsPanel;
