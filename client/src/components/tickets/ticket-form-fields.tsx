// Campos do formulário de passagem — os MESMOS para o lote ("quick") e para o
// modal individual. Obrigatoriedade (asterisco), erro inline e o payload vêm
// de @/lib/ticket-form; aqui só há apresentação. `variant` ajusta o visual
// (o lote é compacto, o modal é espaçado) sem mudar campos nem regra.
import { useMemo, type ReactNode } from "react";
import { Plane, Bus, Truck, CreditCard, AlertTriangle, Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/forms/required-mark";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  isFieldRequired,
  todayIso,
  buildPlannedImpact,
  formatPlannedImpact,
  suggestionDivergences,
  type TicketFormValues,
  type PlannedImpactContext,
  type TravelSuggestion,
} from "@/lib/ticket-form";
import type { FormFieldHelpers, TicketFormHandlers } from "./types";
import { cn } from "@/lib/utils";

export type FormVariant = "batch" | "modal";

interface TicketFormFieldsProps {
  scope: string;
  variant: FormVariant;
  form: TicketFormValues;
  disabled?: boolean;
  helpers: FormFieldHelpers;
  handlers: TicketFormHandlers;
  /** Contexto para a linha "Impacto no Planejado" (dias do período, valores de refeição). */
  impactCtx?: PlannedImpactContext;
  /** Sugestão da escalação — gera o aviso de divergência (informativo). */
  suggestion?: TravelSuggestion;
  /** Gera o data-testid dos inputs (lote: input-quick-x; modal: input-x-<id>). */
  testId: (name: string) => string;
}

/** Slug histórico dos data-testids por campo (lote: input-quick-<slug>; modal: input-<slug>-<id>). */
export function fieldTestIdSlug(name: string): string {
  const map: Record<string, string> = {
    departureCityOrigin: "departure-city-origin", departureCityDestination: "departure-city-destination",
    departureAirport: "departure-airport", destinationAirport: "destination-airport",
    returnCityOrigin: "return-city-origin", returnCityDestination: "return-city-destination",
    returnOriginAirport: "return-origin-airport", returnDestinationAirport: "return-destination-airport",
    actualDepartureDate: "departure-date", actualDepartureTime: "departure-time", actualArrivalTime: "arrival-time",
    actualReturnDate: "return-date", actualReturnTime: "return-time", returnArrivalTime: "return-arrival-time",
  };
  return map[name] ?? name;
}

/** Tooltip "Por que é obrigatório?" da chegada da ida. */
export function ArrivalHint() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center justify-center w-6 h-6 -my-1 rounded-full text-primary text-2xs font-bold cursor-help ml-0.5 normal-case focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Por que é obrigatório?"><span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-brand-soft" aria-hidden="true">?</span></button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-2xs leading-snug">
        Horário em que o colaborador chega ao destino. Define alimentação (almoço até 11h, jantar até 19h) e mobilidade (madrugada 20h–5h) no Planejado.
      </TooltipContent>
    </Tooltip>
  );
}

/** Linha discreta "Impacto no Planejado" — só informativa, atualiza ao digitar. */
export function PlannedImpactLine({ form, ctx, className = "" }: { form: TicketFormValues; ctx?: PlannedImpactContext; className?: string }) {
  const lines = useMemo(() => formatPlannedImpact(buildPlannedImpact(form, ctx)), [form, ctx]);
  if (lines.length === 0) return null;
  return (
    <div className={`flex items-start gap-1.5 text-2xs leading-snug text-muted-foreground ${className}`} data-testid="planned-impact" aria-live="polite">
      <Calculator className="w-3 h-3 text-muted-foreground shrink-0 mt-[1px]" aria-hidden="true" />
      <span>
        <span className="font-semibold text-slate-600">Impacto no Planejado:</span>{" "}
        {lines.map((l, i) => (
          <span key={i}>{i > 0 && <span className="text-muted-foreground mx-1">·</span>}{l}</span>
        ))}
      </span>
    </div>
  );
}

/** Aviso amarelo (informativo) quando o comprado diverge muito da sugestão. */
export function SuggestionDivergenceNotice({ form, suggestion }: { form: TicketFormValues; suggestion?: TravelSuggestion }) {
  const warnings = useMemo(() => (suggestion ? suggestionDivergences(form, suggestion) : []), [form, suggestion]);
  if (warnings.length === 0) return null;
  return (
    <div className="flex items-start gap-2 bg-warning-soft border border-warning/25 rounded-xl px-3 py-2" role="status" data-testid="suggestion-divergence">
      <AlertTriangle className="w-3.5 h-3.5 text-warning-strong shrink-0 mt-[1px]" aria-hidden="true" />
      <div className="text-2xs text-warning leading-snug">
        <span className="font-semibold">Difere da sugestão da escalação</span> — confira se está correto:
        <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      </div>
    </div>
  );
}

export default function TicketFormFields({
  scope, variant, form, disabled = false, helpers, handlers, impactCtx, suggestion, testId,
}: TicketFormFieldsProps) {
  const type = form.transportType || "aereo";
  const oneWay = !!form.isOneWay;
  // Bilhete só de volta: os campos da ida não são deste registro.
  const returnOnly = !!form.isReturnOnly;
  const isRodo = type === "rodoviario";
  const isVan = type === "van";
  const isBatch = variant === "batch";

  const set = (field: string, value: unknown) => handlers.onFieldChange(scope, field, value);
  const R = (field: string) => (isFieldRequired(type, oneWay, field, returnOnly) ? <RequiredMark /> : null);
  const E = (field: string) => helpers.errCls(scope, field);
  const M = (field: string) => helpers.fieldErrorMsg(scope, field);
  const val = (field: keyof TicketFormValues & string) => (form[field] as string | undefined) || "";

  // Estilos por variante
  const L = isBatch
    ? "text-2xs font-semibold text-muted-foreground uppercase tracking-tight"
    : "text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1 block";
  const L2 = isBatch ? "text-2xs font-semibold text-muted-foreground uppercase tracking-tight" : L;
  const I = isBatch ? "h-[34px] bg-surface-muted border-border rounded-lg text-xs" : "";
  const IATA = "h-[34px] bg-surface-muted border-border rounded-lg text-2xs font-bold uppercase text-center";
  const card = isBatch ? "rounded-xl overflow-hidden border border-border" : "bg-card border border-border rounded-xl p-4";
  const fieldWrap = isBatch ? "space-y-1.5" : "";
  const idPrefix = isBatch ? undefined : (name: string) => `${name}-${scope}`;
  const idOf = (name: string) => (idPrefix ? idPrefix(name) : undefined);

  // Funções (não componentes): componentes definidos aqui dentro remontariam a cada tecla e perderiam o foco.
  const sectionHeader = ({ title, icon, tone }: { title: string; icon: ReactNode; tone: "blue" | "orange" | "slate" }) => {
    if (!isBatch) {
      const color = tone === "blue" ? "var(--primary)" : tone === "orange" ? "var(--warning)" : undefined;
      return (
        <div className={`text-2xs font-black uppercase tracking-[0.12em] ${tone === "slate" ? "text-muted-foreground mb-3" : "flex items-center gap-1.5"}`} style={color ? { color } : undefined}>
          {icon} {title}
        </div>
      );
    }
    const bg = tone === "blue" ? "bg-brand-soft border-primary/25" : tone === "orange" ? "bg-warning-soft border-warning/25" : "bg-surface-muted border-border";
    const dot = tone === "orange" ? "bg-warning-strong" : "bg-primary";
    const tx = tone === "blue" ? "text-primary" : tone === "orange" ? "text-warning-strong" : "text-slate-600";
    return (
      <div className={`flex items-center gap-2 px-3 py-2.5 border-b ${bg}`}>
        <div className={`w-5 h-5 rounded-md ${dot} flex items-center justify-center shrink-0`}>{icon}</div>
        <h4 className={`text-2xs font-black uppercase tracking-widest ${tx}`}>{title}</h4>
      </div>
    );
  };

  const textField = ({ field, label, placeholder, cls, wrapCls, extraLabel, required = true }: {
    field: keyof TicketFormValues & string; label: string; placeholder?: string; cls?: string; wrapCls?: string; extraLabel?: ReactNode; required?: boolean;
  }) => (
    <div className={`${fieldWrap} ${wrapCls || ""}`}>
      <Label htmlFor={idOf(field)} className={`${L2}${extraLabel ? " flex items-center gap-1.5" : ""}`}>
        {label}{required && R(field)}{extraLabel}
      </Label>
      <Input
        id={idOf(field)}
        placeholder={placeholder}
        value={val(field)}
        onChange={(e) => set(field, e.target.value)}
        className={`${cls ?? I}${E(field)}`}
        data-testid={testId(field)}
        disabled={disabled}
      />
      {M(field)}
    </div>
  );

  // ── Van ──
  if (isVan) {
    return (
      <div className={isBatch ? "space-y-3" : "bg-card border border-border rounded-xl p-4 space-y-4"}>
        <section className={isBatch ? card : ""}>
          {isBatch
            ? sectionHeader({ title: "Dados da Van", tone: "slate", icon: <Truck className="w-3 h-3 text-white" aria-hidden="true" /> })
            : <div className="text-2xs font-black uppercase tracking-[0.12em] text-muted-foreground">Dados da Van</div>}
          <div className={isBatch ? "p-3 bg-card space-y-3" : "mt-3 space-y-3"}>
            <div className={fieldWrap}>
              <Label htmlFor={idOf("vanCompany")} className={L}>Nome da Empresa{R("purchaseOrderNumber")}</Label>
              <Input
                id={idOf("vanCompany")}
                placeholder="Ex: Transluz Transportes"
                value={val("purchaseOrderNumber")}
                onChange={(e) => set("purchaseOrderNumber", e.target.value)}
                className={`${I}${E("purchaseOrderNumber")}`}
                data-testid={testId("van-company")}
                disabled={disabled}
              />
              {M("purchaseOrderNumber")}
            </div>
            {isBatch && (
              <div className={fieldWrap}>
                <Label className={L}>Observação</Label>
                <Textarea
                  placeholder="Horário de saída, ponto de encontro, número de vagas…"
                  value={val("ticketObservations")}
                  onChange={(e) => set("ticketObservations", e.target.value)}
                  className="text-xs resize-none bg-surface-muted border-border rounded-lg"
                  style={{ height: 80 }}
                  data-testid="textarea-quick-van-observations"
                  disabled={disabled}
                />
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  // ── Aéreo / Rodoviário ──
  const legPlace = (leg: "ida" | "volta") => {
    const cityO = leg === "ida" ? "departureCityOrigin" : "returnCityOrigin";
    const cityD = leg === "ida" ? "departureCityDestination" : "returnCityDestination";
    const airO = leg === "ida" ? "departureAirport" : "returnOriginAirport";
    const airD = leg === "ida" ? "destinationAirport" : "returnDestinationAirport";
    const exO = leg === "ida" ? "Ex: São Paulo" : "Ex: Rio de Janeiro";
    const exD = leg === "ida" ? "Ex: Rio de Janeiro" : "Ex: São Paulo";
    const evBadge = <span className="text-2xs font-medium bg-border text-muted-foreground px-1.5 py-0.5 rounded-full normal-case">Local do evento</span>;

    if (isBatch && !isRodo) {
      // Aéreo no lote: Cidade + IATA na mesma linha
      const pair = (cityF: keyof TicketFormValues & string, airF: keyof TicketFormValues & string, label: string, exCity: string, exIata: string) => (
        <div className="space-y-1.5">
          <Label className={L2}>{label}{R(airF)}</Label>
          <div className="flex gap-2">
            <Input placeholder={exCity} value={val(cityF)} onChange={(e) => set(cityF, e.target.value)} className={`${I} flex-1`} data-testid={testId(cityF)} disabled={disabled} />
            <Input placeholder={exIata} value={val(airF)} onChange={(e) => set(airF, e.target.value)} className={`${IATA}${E(airF)} text-2xs font-bold`} style={{ width: 56 }} data-testid={testId(airF)} disabled={disabled} />
          </div>
          {M(airF)}
        </div>
      );
      return (<>
        {pair(cityO, airO, "Cidade Origem / Aeroporto Origem", leg === "ida" ? "Ex: São Paulo" : "Ex: Manaus", leg === "ida" ? "GRU" : "MAO")}
        {pair(cityD, airD, "Cidade Destino / Aeroporto Destino", leg === "ida" ? "Ex: Manaus" : "Ex: São Paulo", leg === "ida" ? "MAO" : "GRU")}
      </>);
    }
    if (isBatch) {
      // Rodoviário no lote: cidade + rodoviária, origem depois destino
      return (<>
        {textField({ field: cityO, label: "Cidade de Origem", placeholder: exO })}
        {textField({ field: airO, label: leg === "ida" ? "Rodoviária Origem" : "Rodoviária Origem (volta)", placeholder: leg === "ida" ? "Ex: Rodoviária do Tietê" : "Ex: Rodoviária Novo Rio" })}
        {textField({ field: cityD, label: "Cidade de Destino", placeholder: exD })}
        {textField({ field: airD, label: leg === "ida" ? "Rodoviária Destino" : "Rodoviária Destino (volta)", placeholder: leg === "ida" ? "Ex: Rodoviária Novo Rio" : "Ex: Rodoviária do Tietê" })}
      </>);
    }
    // Modal: cidades primeiro, depois aeroportos/rodoviárias
    return (<>
      {textField({ field: cityO, label: "Cidade Origem", placeholder: exO, extraLabel: leg === "volta" ? evBadge : undefined })}
      {textField({ field: cityD, label: "Cidade Destino", placeholder: exD, extraLabel: leg === "ida" ? evBadge : undefined })}
      {textField({ field: airO, label: isRodo ? "Rodoviária Origem" : "Aeroporto Origem", placeholder: isRodo ? "Ex: Terminal Rodoviário" : (leg === "ida" ? "Ex: GRU, CGH, BSB" : "Ex: SDU, GIG, GRU") })}
      {textField({ field: airD, label: isRodo ? "Rodoviária Destino" : "Aeroporto Destino", placeholder: isRodo ? "Ex: Terminal Rodoviário" : (leg === "ida" ? "Ex: SDU, GIG, RJ" : "Ex: GRU, CGH, BSB") })}
    </>);
  };

  const dateTime = (field: keyof TicketFormValues & string, label: string, kind: "date" | "time", extra?: ReactNode, wrapCls?: string, inputCls?: string, hint?: string) => (
    <div className={`${fieldWrap} ${wrapCls || ""}`}>
      <Label htmlFor={idOf(field)} className={`${L2}${extra ? " flex items-center" : ""}`}>{label}{R(field)}{extra}</Label>
      <Input id={idOf(field)} type={kind} value={val(field)} onChange={(e) => set(field, e.target.value)} className={`${inputCls ?? I}${E(field)}`} data-testid={testId(field)} disabled={disabled} />
      {M(field)}
      {hint && <p className={`text-2xs text-muted-foreground leading-snug${isBatch ? "" : " mt-1"}`}>{hint}</p>}
    </div>
  );

  const idaSection = (
    <section className={isBatch ? card : "bg-surface-muted border border-border rounded-xl p-4 space-y-3"}>
      {sectionHeader({
        title: isBatch ? (isRodo ? "Embarque" : "Trecho de Ida") : "IDA",
        tone: "blue",
        icon: isBatch ? (isRodo ? <Bus className="w-3 h-3 text-white" aria-hidden="true" /> : <Plane className="w-3 h-3 text-white" aria-hidden="true" />) : (isRodo ? "🚌" : "🛫"),
      })}
      <div className={isBatch ? "p-3 bg-card space-y-2" : "space-y-3"}>
        {legPlace("ida")}
        <div className={`grid grid-cols-1 md:grid-cols-2 ${isBatch ? "gap-3" : "gap-2"}`}>
          {dateTime("actualDepartureDate", "Data (ida)", "date")}
          {dateTime("actualDepartureTime", "Horário (ida)", "time")}
          {dateTime("actualArrivalTime", "Chegada (ida)", "time", <ArrivalHint />, isBatch ? undefined : "md:col-span-2", isBatch ? undefined : "md:max-w-[50%]", "Define alimentação e mobilidade no Planejado.")}
        </div>
      </div>
    </section>
  );

  const voltaSection = (
    <section className={isBatch ? card : "bg-surface-muted border border-border rounded-xl p-4 space-y-3"}>
      {sectionHeader({
        title: isBatch ? (isRodo ? "Desembarque" : "Trecho de Volta") : "VOLTA",
        tone: "orange",
        icon: isBatch ? (isRodo ? <Bus className="w-3 h-3 text-white" aria-hidden="true" /> : <Plane className="w-3 h-3 text-white rotate-180" aria-hidden="true" />) : (isRodo ? "🚌" : "🛬"),
      })}
      <div className={isBatch ? "p-3 bg-card space-y-2" : "space-y-3"}>
        {legPlace("volta")}
        <div className={`grid grid-cols-1 md:grid-cols-2 ${isBatch ? "gap-3" : "gap-2"}`}>
          {dateTime("actualReturnDate", "Data (volta)", "date")}
          {dateTime("actualReturnTime", "Horário (volta)", "time")}
          {dateTime("returnArrivalTime", "Chegada (volta)", "time", undefined, isBatch ? undefined : "md:col-span-2", isBatch ? undefined : "md:max-w-[50%]", "Chegada das 20h às 5h muda a mobilidade da volta no Planejado.")}
        </div>
      </div>
    </section>
  );

  /** Trecho que não pertence a este bilhete (só ida ou só volta). */
  const trechoAusente = (qual: "IDA" | "VOLTA") => (
    <div className="bg-surface-muted border border-dashed border-border rounded-xl p-4 flex items-center justify-center">
      <div className="text-center">
        <div className="text-2xs font-black uppercase tracking-[0.12em] text-muted-foreground mb-1">
          {isRodo ? "🚌" : qual === "IDA" ? "🛫" : "🛬"} {qual}
        </div>
        <div className="text-xs text-muted-foreground">
          {qual === "VOLTA" ? "Bilhete só de ida" : "Bilhete só de volta"}
        </div>
        <div className="mt-1 text-2xs text-muted-foreground max-w-[200px] mx-auto leading-snug">
          {qual === "IDA"
            ? "A ida foi emitida em outro bilhete — registre-a separadamente."
            : "A volta será registrada à parte, se houver."}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Financeiro / Informações da Compra */}
      <section className={card}>
        {isBatch
          ? sectionHeader({ title: "Dados Financeiros", tone: "slate", icon: <CreditCard className="w-3 h-3 text-white" aria-hidden="true" /> })
          : <div className="text-2xs font-black uppercase tracking-[0.12em] text-muted-foreground mb-3">Informações da Compra</div>}
        <div className={isBatch ? "p-3 bg-card grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
          <div className={fieldWrap}>
            <Label htmlFor={idOf("purchaseOrderNumber")} className={L}>{isRodo ? "Bilhete" : "LOC"}{R("purchaseOrderNumber")}</Label>
            <Input
              id={idOf("purchaseOrderNumber")}
              placeholder={isBatch ? (isRodo ? "Ex: 012345678" : "Ex: AX782Q") : (isRodo ? "Número do bilhete" : "Número da LOC")}
              value={val("purchaseOrderNumber")}
              onChange={(e) => set("purchaseOrderNumber", e.target.value)}
              className={`${I}${isBatch ? " font-mono" : ""}${E("purchaseOrderNumber")}`}
              data-testid={testId("purchase-order")}
              disabled={disabled}
            />
            {M("purchaseOrderNumber")}
          </div>
          <div className={fieldWrap}>
            <Label htmlFor={idOf("purchaseDate")} className={L}>Data da Compra</Label>
            <Input
              id={idOf("purchaseDate")}
              type="date"
              value={isBatch ? (val("purchaseDate") || todayIso()) : val("purchaseDate")}
              max={todayIso()}
              onChange={(e) => set("purchaseDate", e.target.value)}
              className={`${I}${E("purchaseDate")}`}
              data-testid={testId("purchase-date")}
              disabled={disabled}
            />
            {M("purchaseDate")}
          </div>
          <div className={isBatch ? fieldWrap : "mt-3 md:col-span-2"}>
            <Label htmlFor={idOf("value")} className={L}>Valor da Passagem{R("value")}</Label>
            {/* Guarda o texto como digitado; a conversão para centavos usa parseBrNumber. */}
            <Input
              id={idOf("value")}
              placeholder="0,00" type="text" inputMode="decimal"
              value={val("value")}
              onChange={(e) => set("value", e.target.value)}
              className={`${isBatch ? I : "max-w-[160px]"}${E("value")}`}
              data-testid={testId("ticket-value")}
              disabled={disabled}
            />
            {M("value")}
          </div>
        </div>
      </section>

      {/* Ida | Volta */}
      <div className={`grid grid-cols-1 ${isBatch ? "md:grid-cols-2 gap-5" : "lg:grid-cols-2 gap-4"}`}>
        {returnOnly ? trechoAusente("IDA") : idaSection}
        {isBatch ? (
          <div className={cn("overflow-hidden", (oneWay ? "opacity-0" : "opacity-100"), (oneWay ? "pointer-events-none" : "pointer-events-auto"))} style={{
            transition: "all 0.3s ease",
            maxHeight: oneWay ? "0px" : "800px",
          }}>
            {voltaSection}
          </div>
        ) : (oneWay ? trechoAusente("VOLTA") : voltaSection)}
      </div>

      {/* Impacto ao vivo + divergência da sugestão — informativos */}
      <PlannedImpactLine form={form} ctx={impactCtx} className={isBatch ? "px-1" : ""} />
      <SuggestionDivergenceNotice form={form} suggestion={suggestion} />
    </>
  );
}
