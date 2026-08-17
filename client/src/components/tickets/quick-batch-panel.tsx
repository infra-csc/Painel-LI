// Painel "Aplicar em Lote": mesmos dados para várias passagens selecionadas.
// Os campos vêm de TicketFormFields (compartilhados com o modal).
import { Plane, Bus, Truck, FileText, ChevronDown, ChevronRight, Paperclip, NotebookPen, ClipboardCheck } from "lucide-react";
import AttachmentUpload from "@/components/ui/attachment-upload";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getMissingRequiredFields, hasUnsavedTicketInput, type TicketFormValues, type PlannedImpactContext } from "@/lib/ticket-form";
import type { Event } from "@shared/schema";
import TicketFormFields, { fieldTestIdSlug } from "./ticket-form-fields";
import type { FormFieldHelpers, TicketFormHandlers } from "./types";

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
  const barColor = pct === 100 ? "#22C55E" : pct >= 50 ? "#F59E0B" : "#0033CC";

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
    const map = { done: "bg-green-500", partial: "bg-yellow-400", empty: "bg-red-400" };
    return <div className={`w-2 h-2 rounded-full shrink-0 ${map[status]} ${status === "partial" ? "animate-pulse" : ""}`} />;
  };
  const textColor = (status: S) => (status === "done" ? "text-slate-700" : status === "partial" ? "text-yellow-700" : "text-slate-400");

  const ready = selectedCount > 0 && !!q && getMissingRequiredFields(q).length === 0;
  const partial = !ready && (selectedCount > 0 || hasUnsavedTicketInput(q));

  return (
    <>
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors overflow-hidden"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Aplicar em lote — expandir ou recolher"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-slate-800">Aplicar em Lote</p>
            <p className="text-[11px] text-slate-400">Aplicar mesmos dados a múltiplas passagens</p>
          </div>
        </div>
        <div className="pr-4">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${expanded ? "bg-amber-50 text-amber-500" : "bg-slate-50 text-slate-400"}`}>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          {/* Cabeçalho interno */}
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-slate-900">Aplicar em Lote</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Insira os dados da operação para múltiplos passageiros simultaneamente.</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5" data-testid="select-quick-transport-type">
                {[
                  { value: "aereo", label: "Aérea", Icon: Plane },
                  { value: "rodoviario", label: "Rodoviária", Icon: Bus },
                  { value: "van", label: "Van", Icon: Truck },
                ].map(opt => {
                  const active = transportType === opt.value;
                  return (
                    <button key={opt.value} type="button" onClick={() => setTransport(opt.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${active ? "bg-white shadow-sm text-[#0033CC]" : "text-slate-400 hover:text-slate-600"}`}>
                      <opt.Icon className="w-3.5 h-3.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                <span className="text-[12px] font-semibold text-slate-600 select-none whitespace-nowrap">Apenas ida</span>
                <button
                  type="button" role="switch"
                  aria-checked={isOneWay}
                  aria-label="Apenas ida"
                  data-testid="checkbox-quick-one-way"
                  onClick={() => handlers.onFieldChange("quick", "isOneWay", !isOneWay)}
                  className="relative inline-flex items-center rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0033CC] focus:ring-offset-1 shrink-0"
                  style={{ width: 40, height: 22, backgroundColor: isOneWay ? "#0033CC" : "#CBD5E1" }}
                >
                  <span className="inline-block w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ease-in-out"
                    style={{ transform: isOneWay ? "translateX(20px)" : "translateX(2px)" }} />
                </button>
              </div>
            </div>
          </div>

          {/* Barra de progresso */}
          <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
            <div className="flex-1 h-1 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] font-black" style={{ color: barColor }}>{filled}</span>
              <span className="text-[11px] font-medium text-slate-400">/ {total}</span>
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
              <section className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                  <div className="w-5 h-5 rounded-md bg-[#0033CC] flex items-center justify-center shrink-0"><Paperclip className="w-3 h-3 text-white" /></div>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600">Anexos</h4>
                </div>
                <div className="p-3">
                  <AttachmentUpload
                    attachmentIds={q?.attachmentIds || []}
                    onAttachmentsChange={(attachmentIds) => handlers.onFieldChange("quick", "attachmentIds", attachmentIds)}
                    disabled={!canEdit}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                  <div className="w-5 h-5 rounded-md bg-[#0033CC] flex items-center justify-center shrink-0"><NotebookPen className="w-3 h-3 text-white" /></div>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600">Observações</h4>
                </div>
                <div className="p-3">
                  <Textarea
                    placeholder="Adicione notas relevantes sobre este lote de passagens..."
                    value={q?.ticketObservations || ""}
                    onChange={(e) => handlers.onFieldChange("quick", "ticketObservations", e.target.value)}
                    className="text-xs resize-none bg-slate-50 border-slate-200 rounded-lg"
                    style={{ height: 60 }}
                    data-testid="textarea-quick-ticket-observations"
                  />
                </div>
              </section>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                  <div className="w-5 h-5 rounded-md bg-slate-500 flex items-center justify-center shrink-0"><ClipboardCheck className="w-3 h-3 text-white" /></div>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600">Status da Operação</h4>
                </div>
                <ul className="p-3 space-y-2 bg-white">
                  <li className="flex items-center gap-2">
                    {dot(financialStatus)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] font-semibold ${textColor(financialStatus)}`}>Dados financeiros</p>
                      <p className="text-[10px] text-slate-400">{financialStatus === "done" ? "LOC preenchida" : "LOC pendente"}</p>
                    </div>
                  </li>
                  <li className="flex items-center gap-2">
                    {dot(idaStatus)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] font-semibold ${textColor(idaStatus)}`}>
                        {transportType === "rodoviario" ? "Trecho de embarque" : transportType === "van" ? "Trajeto da van" : "Trecho de ida"}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {idaStatus === "done" ? "Origem, destino, data e chegada OK" : idaStatus === "partial" ? "Informações incompletas" : "Nenhum campo preenchido"}
                      </p>
                    </div>
                  </li>
                  <li className="flex items-center gap-2">
                    {dot(attachStatus)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] font-semibold ${textColor(attachStatus)}`}>Arquivos anexados</p>
                      <p className="text-[10px] text-slate-400">{attachCount > 0 ? `${attachCount} arquivo(s)` : "Nenhum (opcional)"}</p>
                    </div>
                  </li>
                  <li className="flex items-center gap-2">
                    {dot(selectionStatus)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] font-semibold ${textColor(selectionStatus)}`}>Passagens selecionadas</p>
                      <p className="text-[10px] text-slate-400">{selectedCount > 0 ? `${selectedCount} na fila` : "Selecione na tabela"}</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Rodapé */}
          <div className="border-t border-slate-100 px-4 py-2 bg-slate-50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${selectedCount > 0 ? "bg-[#0033CC] text-white shadow-md shadow-blue-200" : "bg-slate-200 text-slate-400"}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>group</span>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-70 leading-none mb-0.5">Passageiros</p>
                  <p className="text-[18px] font-black leading-none">{selectedCount}</p>
                </div>
              </div>
              <div className="h-7 w-px bg-slate-200" />
              {ready ? (
                <span className="flex items-center gap-1.5 px-4 py-1.5 bg-green-100 text-green-700 rounded-full text-[11px] font-bold uppercase tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Pronto para processar
                </span>
              ) : partial ? (
                <span className="flex items-center gap-1.5 px-4 py-1.5 bg-yellow-100 text-yellow-700 rounded-full text-[11px] font-bold uppercase tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />Em andamento
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-100 text-slate-400 rounded-full text-[11px] font-bold uppercase tracking-wide">
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
                    className="h-[34px] rounded-lg border-slate-200 text-[12px] text-slate-500 hover:text-slate-700"
                    data-testid="button-clear-quick"
                  >
                    Limpar
                  </Button>
                  <Button
                    onClick={onApply}
                    disabled={selectedCount === 0 || isPending}
                    data-testid="button-apply-to-selected"
                    className="h-[34px] px-5 font-bold rounded-lg text-[12px] flex items-center gap-2 transition-all"
                    style={{
                      background: selectedCount === 0 ? "#E2E8F0" : "#0033CC",
                      color: selectedCount === 0 ? "#94A3B8" : "white",
                      boxShadow: selectedCount > 0 ? "0 4px 14px rgba(0,51,204,0.3)" : "none",
                      cursor: selectedCount === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>rocket_launch</span>
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
