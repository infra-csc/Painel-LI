import { ArrowDownLeft, ArrowUpRight, BedDouble, Ticket, TriangleAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TRANSPORT_MODES, type TransportMode } from "@shared/scaling-validation-rules";
import type { TeamInclusion } from "@shared/schema";
import { DayLabel, SECTION_TITLE } from "./logistics-chips";
import { ModeSelect } from "./mode-select";
import { addDaysYmd } from "./scaling-grid-utils";
import { ymd } from "./types";
import { avisosDeViagem } from "./travel-warnings";

/** Campos de viagem/logística editáveis nos pedidos (ajuste e inclusão). */
export interface TravelDraft {
  transportModeIda: TransportMode | "";
  flightDepartureDate: string;
  flightDepartureSuggestedTime: string;
  flightArrivalSuggestedTime: string;
  transportModeVolta: TransportMode | "";
  flightReturnDate: string;
  flightReturnSuggestedTime: string;
  needsAccommodation: boolean;
  needsTicket: boolean;
}

export const EMPTY_TRAVEL: TravelDraft = {
  transportModeIda: "",
  flightDepartureDate: "",
  flightDepartureSuggestedTime: "",
  flightArrivalSuggestedTime: "",
  transportModeVolta: "",
  flightReturnDate: "",
  flightReturnSuggestedTime: "",
  needsAccommodation: false,
  needsTicket: false,
};

const asMode = (v: string | null | undefined): TransportMode | "" =>
  (TRANSPORT_MODES as readonly string[]).includes(v ?? "") ? (v as TransportMode) : "";

/** Rascunho a partir de uma vaga existente (para o "de/para" do pedido de ajuste). */
export function travelFromInclusion(i: TeamInclusion): TravelDraft {
  return {
    transportModeIda: asMode(i.transportModeIda),
    flightDepartureDate: ymd(i.flightDepartureDate),
    flightDepartureSuggestedTime: i.flightDepartureSuggestedTime ?? "",
    flightArrivalSuggestedTime: i.flightArrivalSuggestedTime ?? "",
    transportModeVolta: asMode(i.transportModeVolta),
    flightReturnDate: ymd(i.flightReturnDate),
    flightReturnSuggestedTime: i.flightReturnSuggestedTime ?? "",
    needsAccommodation: !!i.needsAccommodation,
    needsTicket: !!i.needsTicket,
  };
}

interface TravelFieldsProps {
  value: TravelDraft;
  onChange: (patch: Partial<TravelDraft>) => void;
  disabled?: boolean;
  idPrefix: string;
  /** Título do cartão — a inclusão o chama de "Logística sugerida". */
  titulo?: string;
  /**
   * "linha" põe ida, volta e "precisa de" lado a lado, separados por régua:
   * cabe no diálogo de largura cheia e mostra a viagem inteira de uma vez.
   * "empilhado" (padrão) é o que cabe na coluna estreita do pedido de ajuste.
   */
  layout?: "linha" | "empilhado";
  /**
   * Dias de trabalho da vaga ("AAAA-MM-DD"). Com eles, o cartão AVISA quando
   * ida/volta não batem com as diárias (04/09) — sem travar: viajar na véspera
   * é normal, mas ida depois do primeiro dia ou volta antes do último quase
   * sempre é engano, e a pessoa precisa ver isso antes de enviar.
   */
  workDays?: string[];
  /**
   * Período do evento ("AAAA-MM-DD"). Com ele, o calendário nativo das datas
   * abre já na janela do evento ±7 dias (04/09): quem digitava "2025" em vez
   * de "2026" mandava uma passagem para o ano passado sem perceber. É só
   * `min`/`max` do `<input type="date">` — a regra de negócio (validateTravel)
   * não muda; datas fora da janela continuam aceitas se digitadas.
   */
  eventStartDate?: string;
  eventEndDate?: string;
}

/** Dias de folga em volta do evento que o calendário oferece sem briga. */
const JANELA_DIAS = 7;

/** Título dos grupos (Ida / Volta / Precisa de) — o mesmo do resto do módulo. */
const GROUP_TITLE = cn("flex items-center gap-1.5", SECTION_TITLE);
const FIELD_LABEL = "text-[11px] font-normal text-slate-500";
const CONTROL = "h-9 w-full rounded-lg text-xs bg-white";
/**
 * Mesma medida do CONTROL, SEM `bg-white`: o `ModeSelect` pinta o próprio fundo
 * (`bg-brand-soft/60`) quando já tem um modal escolhido, e o branco daqui — que
 * chega depois no twMerge — apagava esse sinal de "preenchido".
 */
const CONTROL_MODE = "h-9 w-full rounded-lg text-xs min-w-[136px] text-sm";
/**
 * Grade única das duas pernas: transporte · data · horário.
 * Ida e volta usam ESTA constante — é o que garante o espelho (mesmas colunas,
 * mesmas larguras). Cada perna tem UM horário: desembarque na ida, embarque na
 * volta (os mesmos da Sugestão).
 *
 * Mínimos menores que os de antes (04/09): 110/130/110 somam ~375px com os
 * espaços, o que cabe numa perna de ~430px (metade do diálogo largo em `lg`)
 * e na coluna estreita do pedido de ajuste. Abaixo de 420px de viewport a
 * grade vira uma coluna só — era daí que vinha a rolagem horizontal no celular.
 */
const LEG_GRID = "grid gap-x-3 gap-y-2 grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-[minmax(110px,1.1fr)_minmax(130px,1.15fr)_minmax(110px,1fr)]";

/** O horário sugerido é texto livre, mas sem NENHUM dígito não é horário ("manhã" não serve para Compras). */
const semDigito = (v: string) => v.trim() !== "" && !/\d/.test(v);

/** Rótulo de 11px; nas datas, mostra o dia da semana ao lado (mesmo "Qua 14/10" da grade). */
function FieldLabel({ htmlFor, text, date }: { htmlFor: string; text: string; date?: string }) {
  return (
    <Label htmlFor={htmlFor} className={cn(FIELD_LABEL, "flex items-baseline gap-1.5 truncate")}>
      <span className="truncate">{text}</span>
      {date ? <DayLabel v={date} className="text-[11px] text-slate-500" /> : null}
    </Label>
  );
}

/**
 * Horário sugerido é TEXTO, não hora exata (04/09): a área escreve faixas
 * ("8-14h", "22h", "depois das 18h") e é isso que Compras precisa. O campo era
 * `type="time"`: não mostrava "8-14h" (parecia zerado) e obrigava quem
 * pedia ajuste a inventar um "07:00" que não existia.
 */
function TimeField({ id, label, value, disabled, onChange }: { id: string; label: string; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  // Dica, não trava (04/09): o campo aceita texto livre por decisão do dono,
  // mas "de manhã" sem número nenhum não ajuda Compras. `aria-invalid` avisa
  // quem usa leitor de tela; a borda avisa quem enxerga. O envio segue livre.
  const invalido = semDigito(value);
  return (
    <div className="space-y-1 min-w-0">
      <FieldLabel htmlFor={id} text={label} />
      <Input id={id} type="text" value={value} disabled={disabled} placeholder="ex.: 8-14h, 22h" maxLength={40}
        title={disabled ? undefined : "Opcional — pode ser uma faixa (8-14h) ou uma hora (22h)"}
        aria-invalid={invalido || undefined} aria-describedby={invalido ? `${id}-dica` : undefined}
        onChange={(e) => onChange(e.target.value)} className={cn(CONTROL, "tabular-nums", invalido && "border-amber-400 focus-visible:ring-amber-300")} />
      {invalido && <p id={`${id}-dica`} className="text-[11px] text-amber-700">Inclua um número — ex.: 8-14h ou 22h.</p>}
    </div>
  );
}

/**
 * Bloco de campos de ida/volta + hotel/passagem, reutilizado nos diálogos de
 * pedido: um cartão só, com IDA e VOLTA espelhadas (uma embaixo da outra, mesma
 * grade) e "Precisa de" em linha própria, largura total, no rodapé do cartão.
 */
export function TravelFields({ value, onChange, disabled, idPrefix: p, titulo, layout = "empilhado", workDays, eventStartDate, eventEndDate }: TravelFieldsProps) {
  const emLinha = layout === "linha";
  const avisos = avisosDeViagem(value, workDays);
  // Janela do calendário nativo: evento ±7 dias (só quando a tela sabe o evento).
  const dataMin = eventStartDate ? addDaysYmd(ymd(eventStartDate), -JANELA_DIAS) : undefined;
  const dataMax = eventEndDate ? addDaysYmd(ymd(eventEndDate), JANELA_DIAS) : undefined;
  // Régua de 1px entre ida e volta quando elas ficam lado a lado (só a partir
  // de `lg` — abaixo disso elas empilham e a régua viraria uma linha solta).
  const regua = emLinha ? "lg:border-l lg:border-slate-100 lg:pl-5" : "";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
      {titulo ? <p className={GROUP_TITLE}>{titulo}</p> : null}
      {/* Layout "linha" (04/09): grade de duas colunas a partir de `lg` (ida |
          volta) e "Precisa de" numa faixa própria de largura total embaixo.
          Antes era flex-wrap com `min-w-[440px]` por perna: em 1024px as duas
          pernas não cabiam lado a lado E não encolhiam — a segunda vazava por
          baixo do diálogo, e no celular aparecia rolagem horizontal. `min-w-0`
          nos fieldsets é o que deixa a grade encolher de verdade. */}
      <div className={emLinha ? "grid gap-4 lg:grid-cols-2" : "space-y-3"}>
      <fieldset className="min-w-0 space-y-1.5">
        <legend className={GROUP_TITLE}>
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> Ida
        </legend>
        <div className={LEG_GRID}>
          <div className="space-y-1 min-w-0">
            <FieldLabel htmlFor={`${p}-mode-ida`} text="Transporte" />
            <ModeSelect id={`${p}-mode-ida`} label="Transporte da ida" emptyLabel="Não informado" value={value.transportModeIda}
              disabled={disabled} onChange={(v) => onChange({ transportModeIda: v })} className={CONTROL_MODE} />
          </div>
          <div className="space-y-1 min-w-0">
            <FieldLabel htmlFor={`${p}-date-ida`} text="Data" date={value.flightDepartureDate} />
            <Input id={`${p}-date-ida`} type="date" value={value.flightDepartureDate} disabled={disabled} min={dataMin} max={dataMax}
              onChange={(e) => onChange({ flightDepartureDate: e.target.value })} className={CONTROL} />
          </div>
          {/* Saída da origem NÃO tem campo aqui (decisão do dono, 26/08): a
              Sugestão nunca pediu esse horário — só "Desembarque até" na ida e
              "Embarque a partir" na volta, que são os que a compra e a regra de
              alimentação usam. Uma coluna a mais na ida só desalinhava o
              espelho e não era preenchida por ninguém. */}
          <TimeField id={`${p}-time-chegada`} label="Desembarque (chegada)" value={value.flightArrivalSuggestedTime} disabled={disabled}
            onChange={(v) => onChange({ flightArrivalSuggestedTime: v })} />
        </div>
      </fieldset>

      <fieldset className={cn("min-w-0 space-y-1.5", regua)}>
        <legend className={GROUP_TITLE}>
          <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" /> Volta
        </legend>
        <div className={LEG_GRID}>
          <div className="space-y-1 min-w-0">
            <FieldLabel htmlFor={`${p}-mode-volta`} text="Transporte" />
            <ModeSelect id={`${p}-mode-volta`} label="Transporte da volta" emptyLabel="Não informado" value={value.transportModeVolta}
              disabled={disabled} onChange={(v) => onChange({ transportModeVolta: v })} className={CONTROL_MODE} />
          </div>
          <div className="space-y-1 min-w-0">
            <FieldLabel htmlFor={`${p}-date-volta`} text="Data" date={value.flightReturnDate} />
            {/* A volta nunca antes da ida (já era assim); a janela do evento entra por cima. */}
            <Input id={`${p}-date-volta`} type="date" value={value.flightReturnDate} disabled={disabled}
              min={value.flightDepartureDate || dataMin} max={dataMax}
              onChange={(e) => onChange({ flightReturnDate: e.target.value })} className={CONTROL} />
          </div>
          <TimeField id={`${p}-time-volta`} label="Embarque (saída)" value={value.flightReturnSuggestedTime} disabled={disabled}
            onChange={(v) => onChange({ flightReturnSuggestedTime: v })} />
        </div>
      </fieldset>

      {/* Faixa própria, largura total, nos dois layouts. */}
      <fieldset className={cn("min-w-0 space-y-1.5 border-t border-slate-100 pt-3", emLinha && "lg:col-span-2")}>
        <legend className={GROUP_TITLE}>Precisa de</legend>
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn(NEED_CHIP, value.needsAccommodation ? NEED_ON : NEED_OFF, disabled && "opacity-60 cursor-not-allowed")}>
            <Checkbox id={`${p}-hotel`} checked={value.needsAccommodation} disabled={disabled} onCheckedChange={(c) => onChange({ needsAccommodation: c === true })} />
            <BedDouble className="w-3.5 h-3.5" aria-hidden="true" /> Hotel
          </label>
          <label className={cn(NEED_CHIP, value.needsTicket ? NEED_ON : NEED_OFF, disabled && "opacity-60 cursor-not-allowed")}>
            <Checkbox id={`${p}-ticket`} checked={value.needsTicket} disabled={disabled} onCheckedChange={(c) => onChange({ needsTicket: c === true })} />
            <Ticket className="w-3.5 h-3.5" aria-hidden="true" /> Passagem
          </label>
        </div>
      </fieldset>
      </div>

      {/* Mesmo desenho do painel de logística da Sugestão (04/09): ícone em vez
          do "⚠" em texto (que o leitor de tela soletrava) e a frase "só um
          aviso" UMA vez, no rodapé do bloco — repetida em cada item ela virava
          o texto mais longo da lista e escondia o aviso em si. */}
      {avisos.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800" role="status" data-testid={`${p}-avisos-viagem`}>
          <ul className="space-y-0.5">
            {avisos.map((a) => (
              <li key={a} className="flex items-start gap-1.5">
                <TriangleAlert className="mt-px h-3 w-3 shrink-0 text-amber-600" aria-hidden="true" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-amber-700">Só um aviso — dá para enviar assim mesmo.</p>
        </div>
      )}

      {/* A dica segue os toggles: sem passagem e sem hotel, data e horário não
          viram compra nenhuma, e dizer isso evita o preenchimento por hábito. */}
      <p className="text-[11px] text-slate-500">
        {value.needsTicket || value.needsAccommodation
          ? "Datas e horários são sugestão para Compras — quem compra confirma na tela de Passagens / Hospedagem."
          : "Sem passagem e sem hotel, a vaga nasce direto para escalação — datas e horários ficam apenas como referência."}
      </p>
      <p className="text-[11px] text-slate-500">
        Horários podem ficar em branco (<span className="tabular-nums">--:--</span>). O <span className="font-medium text-slate-600">desembarque da ida</span> e o{" "}
        <span className="font-medium text-slate-600">embarque da volta</span> são os que a regra de alimentação usa (almoço e jantar do primeiro e do último dia).
      </p>
    </div>
  );
}

const NEED_CHIP = "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-primary/30";
const NEED_ON = "border-primary/30 bg-brand-soft text-primary";
const NEED_OFF = "border-slate-200 bg-white text-slate-600 hover:border-primary/30";

/** Erros de consistência dos campos de viagem (vazio = ok). */
export function validateTravel(v: TravelDraft): string[] {
  const out: string[] = [];
  if (v.flightDepartureDate && v.flightReturnDate && v.flightReturnDate < v.flightDepartureDate) out.push("A data de volta não pode ser anterior à data de ida.");
  // Só ida (ou só volta) vale (04/09): a pessoa pode voltar por conta própria
  // ou já estar no destino. Com passagem marcada, basta UMA das datas.
  if (v.needsTicket && !v.flightDepartureDate && !v.flightReturnDate) out.push("Com passagem marcada, informe a data da ida ou da volta.");
  return out;
}

export default TravelFields;
