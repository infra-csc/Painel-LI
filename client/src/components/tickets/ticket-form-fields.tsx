// Campos do formulário de passagem — os MESMOS para o lote ("quick") e para o
// modal individual. Obrigatoriedade (asterisco), erro inline e o payload vêm
// de @/lib/ticket-form; aqui só há apresentação. `variant` ajusta o visual
// (o lote é compacto, o modal é espaçado) sem mudar campos nem regra.
import { useMemo, useState, type ReactNode } from "react";
import { Bus, Truck, CreditCard, AlertTriangle, Calculator, PlaneTakeoff, PlaneLanding } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/forms/required-mark";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  isFieldRequired,
  toCents,
  voltaCompradaAParte,
  tiposDoFormulario,
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
        Horário em que o colaborador chega ao destino. Define alimentação (almoço até 13h, jantar até 19h) e mobilidade (madrugada 20h–5h) no Planejado.
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
  // Tipo POR TRECHO (28/10, vaga #4618): a volta pode ser de ônibus numa passagem aérea.
  const tipos = tiposDoFormulario(form);
  const misto = tipos.ida !== tipos.volta;
  // Volta comprada à parte (28/10 — dono: "deveria SOMAR os valores de ida e
  // volta"): cada trecho com o seu valor e o seu bilhete/LOC; o total é a soma.
  const [abrirVoltaAParte, setAbrirVoltaAParte] = useState(false);
  // Só no modal e com ida E volta neste bilhete; volta de outro tipo já abre separada.
  const podeVoltaAParte = variant === "modal" && !form.isOneWay && !form.isReturnOnly && form.transportType !== "van";
  const aParte = podeVoltaAParte && (misto || abrirVoltaAParte || voltaCompradaAParte(form));
  const totalCents = (toCents(form.value) ?? 0) + (aParte ? toCents(form.returnValue) ?? 0 : 0);
  const brl = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const oneWay = !!form.isOneWay;
  // Bilhete só de volta: os campos da ida não são deste registro.
  const returnOnly = !!form.isReturnOnly;
  const isRodo = type === "rodoviario";
  const voltaRodo = tipos.volta === "rodoviario";
  const isVan = type === "van";
  const isBatch = variant === "batch";

  const set = (field: string, value: unknown) => handlers.onFieldChange(scope, field, value);
  const R = (field: string) => (isFieldRequired(type, oneWay, field, returnOnly, form.returnTransportType) ? <RequiredMark /> : null);
  const E = (field: string) => helpers.errCls(scope, field);
  const M = (field: string) => helpers.fieldErrorMsg(scope, field);
  const val = (field: keyof TicketFormValues & string) => (form[field] as string | undefined) || "";

  // Estilos por variante
  const L = isBatch
    ? "text-2xs font-semibold text-muted-foreground uppercase tracking-tight"
    : "text-xs font-medium text-slate-600 mb-1.5 block";
  const L2 = isBatch ? "text-2xs font-semibold text-muted-foreground uppercase tracking-tight" : L;
  const I = isBatch ? "h-[34px] bg-surface-muted border-border rounded-lg text-xs" : "";
  const IATA = "h-[34px] bg-surface-muted border-border rounded-lg text-2xs font-bold uppercase text-center";
  const card = isBatch ? "rounded-xl overflow-hidden border border-border" : "bg-card border border-border rounded-xl p-4";
  const fieldWrap = isBatch ? "space-y-1.5" : "";
  const idPrefix = isBatch ? undefined : (name: string) => `${name}-${scope}`;
  const idOf = (name: string) => (idPrefix ? idPrefix(name) : undefined);

  // Funções (não componentes): componentes definidos aqui dentro remontariam a cada tecla e perderiam o foco.
  // 07/10: a cor fica no ícone e no título (ida = marca, volta = âmbar), não
  // num quadradinho colorido nem num fundo inteiro — e nada de emoji.
  const sectionHeader = ({ title, icon, tone }: { title: string; icon: ReactNode; tone: "blue" | "orange" | "slate" }) => {
    const tx = tone === "blue" ? "text-primary" : tone === "orange" ? "text-warning" : "text-slate-600";
    if (!isBatch) {
      return (
        <h4 className={`m-0 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] ${tx}`}>
          {icon}{title}
        </h4>
      );
    }
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-muted">
        {icon}
        <h4 className={`m-0 text-2xs font-semibold uppercase tracking-[0.06em] ${tx}`}>{title}</h4>
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
            ? sectionHeader({ title: "Dados da van", tone: "slate", icon: <Truck className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" /> })
            : <h4 className="m-0 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"><Truck className="w-3.5 h-3.5" aria-hidden="true" />Dados da van</h4>}
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
                  className="text-xs resize-none bg-surface-muted border-border rounded-lg h-20"
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
    const evBadge = <span className="text-2xs font-medium bg-muted text-muted-foreground px-1.5 py-px rounded-md normal-case">Local do evento</span>;
    // Cada trecho com o rótulo do SEU tipo (28/10): Aeroporto × Rodoviária.
    const rodo = leg === "ida" ? isRodo : voltaRodo;

    if (isBatch && !rodo) {
      // Aéreo no lote: Cidade + IATA na mesma linha
      const pair = (cityF: keyof TicketFormValues & string, airF: keyof TicketFormValues & string, label: string, exCity: string, exIata: string) => (
        <div className="space-y-1.5">
          <Label className={L2}>{label}{R(airF)}</Label>
          <div className="flex gap-2">
            <Input placeholder={exCity} value={val(cityF)} onChange={(e) => set(cityF, e.target.value)} className={`${I} flex-1`} data-testid={testId(cityF)} disabled={disabled} />
            <Input placeholder={exIata} value={val(airF)} onChange={(e) => set(airF, e.target.value)} className={`${IATA}${E(airF)} text-2xs font-bold w-14 shrink-0 px-1`} data-testid={testId(airF)} disabled={disabled} />
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
        {textField({ field: cityO, label: "Cidade de origem", placeholder: exO })}
        {textField({ field: airO, label: leg === "ida" ? "Rodoviária de origem" : "Rodoviária Origem (volta)", placeholder: leg === "ida" ? "Ex: Rodoviária do Tietê" : "Ex: Rodoviária Novo Rio" })}
        {textField({ field: cityD, label: "Cidade de destino", placeholder: exD })}
        {textField({ field: airD, label: leg === "ida" ? "Rodoviária de destino" : "Rodoviária Destino (volta)", placeholder: leg === "ida" ? "Ex: Rodoviária Novo Rio" : "Ex: Rodoviária do Tietê" })}
      </>);
    }
    // Modal: cidades primeiro, depois aeroportos/rodoviárias
    return (<>
      {textField({ field: cityO, label: "Cidade de origem", placeholder: exO, extraLabel: leg === "volta" ? evBadge : undefined })}
      {textField({ field: cityD, label: "Cidade de destino", placeholder: exD, extraLabel: leg === "ida" ? evBadge : undefined })}
      {textField({ field: airO, label: rodo ? "Rodoviária de origem" : "Aeroporto de origem", placeholder: rodo ? "Ex: Terminal Rodoviário" : (leg === "ida" ? "Ex: GRU, CGH, BSB" : "Ex: SDU, GIG, GRU") })}
      {textField({ field: airD, label: rodo ? "Rodoviária de destino" : "Aeroporto de destino", placeholder: rodo ? "Ex: Terminal Rodoviário" : (leg === "ida" ? "Ex: SDU, GIG, RJ" : "Ex: GRU, CGH, BSB") })}
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
    <section className={isBatch ? card : "bg-card border border-border rounded-xl p-4 space-y-3"}>
      {sectionHeader({
        title: isBatch ? (isRodo ? "Embarque" : "Trecho de ida") : misto ? `Ida · ${isRodo ? "Rodoviária" : "Aérea"}` : "Ida",
        tone: "blue",
        icon: isRodo ? <Bus className="w-3.5 h-3.5 text-primary" aria-hidden="true" /> : <PlaneTakeoff className="w-3.5 h-3.5 text-primary" aria-hidden="true" />,
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
    <section className={isBatch ? card : "bg-card border border-border rounded-xl p-4 space-y-3"}>
      {sectionHeader({
        title: isBatch ? (voltaRodo ? "Desembarque" : "Trecho de volta") : misto ? `Volta · ${voltaRodo ? "Rodoviária" : "Aérea"}` : "Volta",
        tone: "orange",
        icon: voltaRodo ? <Bus className="w-3.5 h-3.5 text-warning-strong" aria-hidden="true" /> : <PlaneLanding className="w-3.5 h-3.5 text-warning-strong" aria-hidden="true" />,
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
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1">
          {isRodo ? <Bus className="w-3.5 h-3.5" aria-hidden="true" /> : qual === "IDA" ? <PlaneTakeoff className="w-3.5 h-3.5" aria-hidden="true" /> : <PlaneLanding className="w-3.5 h-3.5" aria-hidden="true" />}{qual === "IDA" ? "Ida" : "Volta"}
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
          ? sectionHeader({ title: "Dados financeiros", tone: "slate", icon: <CreditCard className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" /> })
          : <h4 className="m-0 mb-3 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"><CreditCard className="w-3.5 h-3.5" aria-hidden="true" />Informações da compra</h4>}
        <div className={isBatch ? "p-3 bg-card grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"}>
          <div className={fieldWrap}>
            <Label htmlFor={idOf("purchaseOrderNumber")} className={L}>{aParte ? `${isRodo ? "Bilhete" : "LOC"} da ida` : misto ? "LOC / Bilhete" : isRodo ? "Bilhete" : "LOC"}{R("purchaseOrderNumber")}</Label>
            <Input
              id={idOf("purchaseOrderNumber")}
              placeholder={isBatch ? (isRodo ? "Ex: 012345678" : "Ex: AX782Q") : aParte ? (isRodo ? "Número do bilhete" : "Número da LOC") : misto ? "Ex: AX782Q / 012345678" : (isRodo ? "Número do bilhete" : "Número da LOC")}
              value={val("purchaseOrderNumber")}
              onChange={(e) => set("purchaseOrderNumber", e.target.value)}
              className={`${I}${isBatch ? " font-mono" : ""}${E("purchaseOrderNumber")}`}
              data-testid={testId("purchase-order")}
              disabled={disabled}
            />
            {M("purchaseOrderNumber")}
          </div>
          <div className={fieldWrap}>
            <Label htmlFor={idOf("purchaseDate")} className={L}>Data da compra</Label>
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
          <div className={isBatch ? fieldWrap : ""}>
            <Label htmlFor={idOf("value")} className={L}>{aParte ? "Valor da ida" : "Valor da passagem"}{R("value")}</Label>
            {/* Guarda o texto como digitado; a conversão para centavos usa parseBrNumber. */}
            <Input
              id={idOf("value")}
              placeholder="0,00" type="text" inputMode="decimal"
              value={val("value")}
              onChange={(e) => set("value", e.target.value)}
              className={`${isBatch ? I : "tabular-nums"}${E("value")}`}
              data-testid={testId("ticket-value")}
              disabled={disabled}
            />
            {M("value")}
          </div>
        </div>
        {/* VOLTA COMPRADA À PARTE (28/10, vaga #4618): bilhete e valor da volta;
            o valor da passagem é a soma (é o total que entra no custo). */}
        {podeVoltaAParte && (aParte ? (
          <div className="mt-4 border-t border-border pt-4" data-testid={`volta-a-parte-${scope}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor={idOf("returnPurchaseOrderNumber")} className={L}>{voltaRodo ? "Bilhete" : "LOC"} da volta</Label>
                <Input
                  id={idOf("returnPurchaseOrderNumber")}
                  placeholder={voltaRodo ? "Número do bilhete" : "Número da LOC"}
                  value={val("returnPurchaseOrderNumber")}
                  onChange={(e) => set("returnPurchaseOrderNumber", e.target.value)}
                  className={E("returnPurchaseOrderNumber")}
                  data-testid={testId("return-purchase-order")}
                  disabled={disabled}
                />
              </div>
              <div>
                <Label htmlFor={idOf("returnValue")} className={L}>Valor da volta</Label>
                <Input
                  id={idOf("returnValue")}
                  placeholder="0,00" type="text" inputMode="decimal"
                  value={val("returnValue")}
                  onChange={(e) => set("returnValue", e.target.value)}
                  className={`tabular-nums${E("returnValue")}`}
                  data-testid={testId("return-ticket-value")}
                  disabled={disabled}
                />
                {M("returnValue")}
              </div>
              <div className="flex flex-col justify-end">
                <div className="rounded-lg bg-surface-muted px-3 py-2" aria-live="polite" data-testid={`total-ida-volta-${scope}`}>
                  <div className="text-2xs text-muted-foreground">Total da passagem (ida + volta)</div>
                  <div className="text-sm font-semibold tabular-nums text-foreground">{brl(totalCents)}</div>
                </div>
              </div>
            </div>
          </div>
        ) : !disabled && (
          <button
            type="button"
            onClick={() => setAbrirVoltaAParte(true)}
            className="mt-3 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            data-testid={`abrir-volta-a-parte-${scope}`}
          >
            Volta comprada à parte? Informar bilhete e valor da volta
          </button>
        ))}
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
