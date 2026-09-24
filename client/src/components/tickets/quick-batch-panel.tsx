// Painel "Aplicar em Lote": mesmos dados para várias passagens selecionadas.
// Os campos vêm de TicketFormFields (compartilhados com o modal).
import { Plane, Bus, Truck, FileText, ChevronDown, ChevronRight, Paperclip, NotebookPen, ClipboardCheck, Users, Rocket } from "lucide-react";
import AttachmentUpload from "@/components/ui/attachment-upload";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getMissingRequiredFields, hasUnsavedTicketInput, type TicketFormValues, type PlannedImpactContext } from "@/lib/ticket-form";
import type { Event } from "@shared/schema";
import TicketFormFields, { fieldTestIdSlug } from "./ticket-form-fields";
import type { FormFieldHelpers, TicketFormHandlers } from "./types";
import { cn } from "@/lib/utils";

interface QuickBatchPanelProps {
  expanded: boolean;
  onToggle: () => void;
  quick: TicketFormValues | undefined;
  helpers: FormFieldHelpers;
  handlers: TicketFormHandlers;
  /** Evento filtrado (quando há um só) — pré-preenche datas do rodoviário e alimenta o impacto. */
  filteredEvent: Event | undefined;
  impactCtx?: PlannedImpactContext;
  selectedCount: number;
  canEdit: boolean;
  isPending: boolean;
  onClear: () => void;
  onApply: () => void;
}

const quickTestId = (name: string) => `input-quick-${fieldTestIdSlug(name)}`;

export default function QuickBatchPanel({
  expanded, onToggle, quick, helpers, handlers, filteredEvent, impactCtx, selectedCount, canEdit, isPending, onClear, onApply,
}: QuickBatchPanelProps) {
  const q = quick;
  const transportType = q?.transportType || "aereo";
  const isOneWay = !!q?.isOneWay;

  const setTransport = (value: string) => {
    if (value === "rodoviario" && filteredEvent) {
      handlers.onPatch("quick", {
        transportType: value,
        actualDepartureDate: filteredEvent.startDate || q?.actualDepartureDate || "",
        actualReturnDate: filteredEvent.endDate || q?.actualReturnDate || "",
      });
    } else {
      handlers.onFieldChange("quick", "transportType", value);
    }
  };

  // Barra de progresso
  const allFields = [
    !!q?.transportType, !!q?.value, !!q?.purchaseOrderNumber,
    !!q?.departureCityOrigin, !!q?.departureCityDestination,
    !!q?.departureAirport, !!q?.destinationAirport,
    !!q?.actualDepartureDate, !!q?.actualDepartureTime, !!q?.actualArrivalTime,
    ...(isOneWay ? [] : [
      !!q?.returnCityOrigin, !!q?.returnCityDestination,
      !!q?.returnOriginAirport, !!q?.returnDestinationAirport,
      !!q?.actualReturnDate, !!q?.actualReturnTime,
    ]),
  ];
  const filled = allFields.filter(Boolean).length;
  const total = allFields.length;
  const pct = Math.round((filled / total) * 100);
  const barColor = pct === 100 ? "var(--success-strong)" : pct >= 50 ? "var(--warning-strong)" : "var(--primary)";

  // Status da operação
  const hasLoc = !!q?.purchaseOrderNumber;
  const hasOrigin = !!(q?.departureCityOrigin && q?.departureAirport);
  const hasDestination = !!(q?.departureCityDestination && q?.destinationAirport);
  const hasDates = !!(q?.actualDepartureDate && q?.actualDepartureTime && q?.actualArrivalTime);
  const attachCount = q?.attachmentIds?.length || 0;
  type S = "done" | "partial" | "empty";
  const financialStatus: S = hasLoc ? "done" : "empty";
  const idaStatus: S = hasOrigin && hasDestination && hasDates ? "done" : hasOrigin || hasDestination ? "partial" : "empty";
  const attachStatus: S = attachCount > 0 ? "done" : "empty";
  const selectionStatus: S = selectedCount > 0 ? "done" : "empty";
  const dot = (status: S) => {
    const map = { done: "bg-success-strong", partial: "bg-warning-strong", empty: "bg-danger-strong" };
    return <div className={`w-2 h-2 rounded-full shrink-0 ${map[status]} ${status === "partial" ? "animate-pulse" : ""}`} />;
  };
  const textColor = (status: S) => (status === "done" ? "text-slate-700" : status === "partial" ? "text-warning" : "text-muted-foreground");

  const ready = selectedCount > 0 && !!q && getMissingRequiredFields(q).length === 0;
  const partial = !ready && (selectedCount > 0 || hasUnsavedTicketInput(q));

  return (
    <>
      <div
        className="bg-card rounded-xl border border-border shadow-1 flex items-center justify-between cursor-pointer hover:bg-surface-muted transition-colors overflow-hidden"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Aplicar em lote — expandir ou recolher"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-warning-soft flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-warning-strong" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Aplicar em Lote</p>
            <p className="text-2xs text-muted-foreground">Aplicar mesmos dados a múltiplas passagens</p>
          </div>
        </div>
        <div className="pr-4">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${expanded ? "bg-warning-soft text-warning-strong" : "bg-surface-muted text-muted-foreground"}`}>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-2">
          {/* Cabeçalho interno */}
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Aplicar em Lote</h3>
              <p className="text-2xs text-muted-foreground mt-0.5">Insira os dados da operação para múltiplos passageiros simultaneamente.</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5" data-testid="select-quick-transport-type">
                {[
                  { value: "aereo", label: "Aérea", Icon: Plane },
                  { value: "rodoviario", label: "Rodoviária", Icon: Bus },
                  { value: "van", label: "Van", Icon: Truck },
                ].map(opt => {
                  const active = transportType === opt.value;
                  return (
                    <button key={opt.value} type="button" onClick={() => setTransport(opt.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${active ? "bg-card shadow-1 text-primary" : "text-muted-foreground hover:text-slate-600"}`}>
                      <opt.Icon className="w-3.5 h-3.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 pl-3 border-l border-border">
                <span className="text-xs font-semibold text-slate-600 select-none whitespace-nowrap">Apenas ida</span>
                <button
                  type="button" role="switch"
                  aria-checked={isOneWay}
                  aria-label="Apenas ida"
                  data-testid="checkbox-quick-one-way"
                  onClick={() => handlers.onFieldChange("quick", "isOneWay", !isOneWay)}
                  className={cn("relative inline-flex items-center rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 shrink-0", (isOneWay ? "bg-primary" : "bg-border"))}
                  style={{ width: 40, height: 22 }}
                >
                  <span className="inline-block w-4 h-4 bg-card rounded-full shadow-1 transition-all duration-200 ease-in-out"
                    style={{ transform: isOneWay ? "translateX(20px)" : "translateX(2px)" }} />
                </button>
              </div>
            </div>
          </div>

          {/* Barra de progresso */}
          <div className="px-4 py-1.5 bg-surface-muted border-b border-border flex items-center gap-3">
            <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-2xs font-black" style={{ color: barColor }}>{filled}</span>
              <span className="text-2xs font-medium text-muted-foreground">/ {total}</span>
            </div>
          </div>

          {/* Corpo: 8 + 4 colunas */}
          <div className="grid grid-cols-12 gap-3 p-3">
            <div className="col-span-12 lg:col-span-8 space-y-2">
              <TicketFormFields
                scope="quick"
                variant="batch"
                form={q || {}}
                helpers={helpers}
                handlers={handlers}
                impactCtx={impactCtx}
                testId={quickTestId}
              />
            </div>

            <div className="col-span-12 lg:col-span-4 space-y-2">
              <section className="rounded-xl border border-border overflow-hidden bg-card">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-muted border-b border-border">
                  <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center shrink-0"><Paperclip className="w-3 h-3 text-white" /></div>
                  <h4 className="text-2xs font-black uppercase tracking-widest text-slate-600">Anexos</h4>
                </div>
                <div className="p-3">
                  <AttachmentUpload
                    attachmentIds={q?.attachmentIds || []}
                    onAttachmentsChange={(attachmentIds) => handlers.onFieldChange("quick", "attachmentIds", attachmentIds)}
                    disabled={!canEdit}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-border overflow-hidden bg-card">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-muted border-b border-border">
                  <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center shrink-0"><NotebookPen className="w-3 h-3 text-white" /></div>
                  <h4 className="text-2xs font-black uppercase tracking-widest text-slate-600">Observações</h4>
                </div>
                <div className="p-3">
                  <Textarea
                    placeholder="Adicione notas relevantes sobre este lote de passagens..."
                    value={q?.ticketObservations || ""}
                    onChange={(e) => handlers.onFieldChange("quick", "ticketObservations", e.target.value)}
                    className="text-xs resize-none bg-surface-muted border-border rounded-lg"
                    style={{ height: 60 }}
                    data-testid="textarea-quick-ticket-observations"
                  />
                </div>
              </section>

              <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-muted border-b border-border">
                  <div className="w-5 h-5 rounded-md bg-slate-500 flex items-center justify-center shrink-0"><ClipboardCheck className="w-3 h-3 text-white" /></div>
                  <h4 className="text-2xs font-black uppercase tracking-widest text-slate-600">Status da Operação</h4>
                </div>
                <ul className="p-3 space-y-2 bg-card">
                  <li className="flex items-center gap-2">
                    {dot(financialStatus)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-2xs font-semibold ${textColor(financialStatus)}`}>Dados financeiros</p>
                      <p className="text-2xs text-muted-foreground">{financialStatus === "done" ? "LOC preenchida" : "LOC pendente"}</p>
                    </div>
                  </li>
                  <li className="flex items-center gap-2">
                    {dot(idaStatus)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-2xs font-semibold ${textColor(idaStatus)}`}>
                        {transportType === "rodoviario" ? "Trecho de embarque" : transportType === "van" ? "Trajeto da van" : "Trecho de ida"}
                      </p>
                      <p className="text-2xs text-muted-foreground">
                        {idaStatus === "done" ? "Origem, destino, data e chegada OK" : idaStatus === "partial" ? "Informações incompletas" : "Nenhum campo preenchido"}
                      </p>
                    </div>
                  </li>
                  <li className="flex items-center gap-2">
                    {dot(attachStatus)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-2xs font-semibold ${textColor(attachStatus)}`}>Arquivos anexados</p>
                      <p className="text-2xs text-muted-foreground">{attachCount > 0 ? `${attachCount} arquivo(s)` : "Nenhum (opcional)"}</p>
                    </div>
                  </li>
                  <li className="flex items-center gap-2">
                    {dot(selectionStatus)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-2xs font-semibold ${textColor(selectionStatus)}`}>Passagens selecionadas</p>
                      <p className="text-2xs text-muted-foreground">{selectedCount > 0 ? `${selectedCount} na fila` : "Selecione na tabela"}</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Rodapé */}
          <div className="border-t border-border px-4 py-2 bg-surface-muted flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${selectedCount > 0 ? "bg-primary text-primary-foreground shadow-2 " : "bg-border text-muted-foreground"}`}>
                <Users className="h-4 w-4" aria-hidden="true" />
                <div>
                  <p className="text-2xs font-bold uppercase tracking-widest opacity-70 leading-none mb-0.5">Passageiros</p>
                  <p className="text-lg font-black leading-none">{selectedCount}</p>
                </div>
              </div>
              <div className="h-7 w-px bg-border" />
              {ready ? (
                <span className="flex items-center gap-1.5 px-4 py-1.5 bg-success-soft text-success rounded-full text-2xs font-bold uppercase tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-success-strong animate-pulse" />Pronto para processar
                </span>
              ) : partial ? (
                <span className="flex items-center gap-1.5 px-4 py-1.5 bg-warning-soft text-warning rounded-full text-2xs font-bold uppercase tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning-strong animate-pulse" />Em andamento
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-4 py-1.5 bg-muted text-muted-foreground rounded-full text-2xs font-bold uppercase tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />Aguardando dados
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {canEdit && (
                <>
                  <Button
                    variant="outline" size="sm"
                    onClick={onClear}
                    disabled={!q || Object.keys(q).length === 0}
                    className="h-[34px] rounded-lg border-border text-xs text-muted-foreground hover:text-slate-700"
                    data-testid="button-clear-quick"
                  >
                    Limpar
                  </Button>
                  <Button
                    onClick={onApply}
                    disabled={selectedCount === 0 || isPending}
                    data-testid="button-apply-to-selected"
                    className={cn("h-[34px] px-5 font-bold rounded-lg text-xs flex items-center gap-2 transition-all", (selectedCount === 0 ? "bg-border" : "bg-primary"), (selectedCount === 0 ? "text-muted-foreground" : "text-white"), (selectedCount > 0 ? "shadow-2" : "shadow-none"), (selectedCount === 0 ? "cursor-not-allowed" : "cursor-pointer"))}
                  >
                    <Rocket className="h-[18px] w-[18px]" aria-hidden="true" />
                    {isPending ? "Aplicando..." : `Aplicar a ${selectedCount} Passageiro${selectedCount !== 1 ? "s" : ""}`}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
