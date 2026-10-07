// Painel "Aplicar em lote": mesmos dados para várias passagens selecionadas.
// Os campos vêm de TicketFormFields (compartilhados com o modal).
//
// 07/10 (redesenho): a faixa "Aplicar em lote" de 56px que ficava sempre na
// tela, fechada, saiu — o painel abre pelo botão da barra da tela ou pela barra
// de seleção ("Preencher dados em lote"). Aberto, ele é o mesmo: os mesmos
// campos, o progresso, o status da operação e o rodapé com o "Aplicar".
import { useEffect, useRef, type ReactNode } from "react";
import { Plane, Bus, Truck, X, Paperclip, NotebookPen, ClipboardCheck, Users, Check } from "lucide-react";
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

/** Cabeçalho de cada seção da coluna lateral (mesmo desenho das seções do formulário). */
function Secao({ icone: Icone, titulo, children }: { icone: typeof Paperclip; titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border overflow-hidden bg-card">
      <h4 className="m-0 flex items-center gap-2 px-3 py-2 bg-surface-muted border-b border-border text-2xs font-semibold uppercase tracking-[0.06em] text-slate-600">
        <Icone className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
        {titulo}
      </h4>
      {children}
    </section>
  );
}

export default function QuickBatchPanel({
  expanded, onToggle, quick, helpers, handlers, filteredEvent, impactCtx, selectedCount, canEdit, isPending, onClear, onApply,
}: QuickBatchPanelProps) {
  const q = quick;
  const transportType = q?.transportType || "aereo";
  const isOneWay = !!q?.isOneWay;
  const tituloRef = useRef<HTMLHeadingElement>(null);
  // Abriu: o foco vai para o título do painel (teclado e leitor de tela sabem onde estão).
  useEffect(() => { if (expanded) tituloRef.current?.focus({ preventScroll: true }); }, [expanded]);

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
  const barColor = pct === 100 ? "bg-success-strong" : pct >= 50 ? "bg-warning-strong" : "bg-primary";
  const barText = pct === 100 ? "text-success" : pct >= 50 ? "text-warning" : "text-primary";

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
    const map = { done: "bg-success-strong", partial: "bg-warning-strong", empty: "bg-border" };
    return <span aria-hidden="true" className={`mt-1 w-2 h-2 rounded-full shrink-0 ${map[status]}`} />;
  };
  const textColor = (status: S) => (status === "done" ? "text-foreground" : status === "partial" ? "text-warning" : "text-slate-600");

  const ready = selectedCount > 0 && !!q && getMissingRequiredFields(q).length === 0;
  const partial = !ready && (selectedCount > 0 || hasUnsavedTicketInput(q));

  if (!expanded) return null;

  return (
    <section className="pas-entra bg-card rounded-xl border border-border overflow-hidden shadow-1" aria-labelledby="titulo-lote-passagens">
      {/* Cabeçalho: o que é, modalidade, "Apenas ida" e fechar */}
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 id="titulo-lote-passagens" ref={tituloRef} tabIndex={-1} className="m-0 text-sm font-semibold text-foreground outline-none">Aplicar em lote</h3>
          <p className="m-0 text-xs text-muted-foreground mt-0.5">Os mesmos dados da compra para todas as passagens marcadas na lista.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5" role="radiogroup" aria-label="Modalidade" data-testid="select-quick-transport-type">
            {[
              { value: "aereo", label: "Aérea", Icon: Plane },
              { value: "rodoviario", label: "Rodoviária", Icon: Bus },
              { value: "van", label: "Van", Icon: Truck },
            ].map(opt => {
              const active = transportType === opt.value;
              return (
                <button key={opt.value} type="button" role="radio" aria-checked={active} onClick={() => setTransport(opt.value)}
                  className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-card shadow-1 text-primary" : "text-muted-foreground hover:text-slate-700"}`}>
                  <opt.Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 pl-3 border-l border-border cursor-pointer">
            <span className="text-xs font-medium text-slate-600 select-none whitespace-nowrap">Apenas ida</span>
            <button
              type="button" role="switch"
              aria-checked={isOneWay}
              aria-label="Apenas ida"
              data-testid="checkbox-quick-one-way"
              onClick={() => handlers.onFieldChange("quick", "isOneWay", !isOneWay)}
              className={cn("relative inline-flex items-center w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 shrink-0", isOneWay ? "bg-primary" : "bg-slate-300")}
            >
              <span className={cn("inline-block w-4 h-4 bg-card rounded-full shadow-1 transition-transform duration-200", isOneWay ? "translate-x-[18px]" : "translate-x-0.5")} />
            </button>
          </label>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Fechar o painel de lote"
            title="Fechar"
            className="pas-alvo inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="px-4 py-1.5 bg-surface-muted border-b border-border flex items-center gap-3">
        <div className="flex-1 h-1 rounded-full bg-border overflow-hidden" role="progressbar" aria-label="Campos preenchidos" aria-valuemin={0} aria-valuemax={total} aria-valuenow={filled}>
          <div className={`h-full rounded-full transition-[width] duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-2xs tabular-nums text-muted-foreground shrink-0">
          <span className={`font-semibold ${barText}`}>{filled}</span> / {total} campos
        </span>
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
          <Secao icone={Paperclip} titulo="Anexos">
            <div className="p-3">
              <AttachmentUpload
                attachmentIds={q?.attachmentIds || []}
                onAttachmentsChange={(attachmentIds) => handlers.onFieldChange("quick", "attachmentIds", attachmentIds)}
                disabled={!canEdit}
              />
            </div>
          </Secao>

          <Secao icone={NotebookPen} titulo="Observações">
            <div className="p-3">
              <Textarea
                aria-label="Observações do lote"
                placeholder="Adicione notas relevantes sobre este lote de passagens…"
                value={q?.ticketObservations || ""}
                onChange={(e) => handlers.onFieldChange("quick", "ticketObservations", e.target.value)}
                className="text-xs resize-none bg-surface-muted border-border rounded-lg h-[60px]"
                data-testid="textarea-quick-ticket-observations"
              />
            </div>
          </Secao>

          <Secao icone={ClipboardCheck} titulo="Status da operação">
            <ul className="m-0 p-3 space-y-2 list-none">
              <li className="flex items-start gap-2">
                {dot(financialStatus)}
                <div className="flex-1 min-w-0">
                  <p className={`m-0 text-xs font-medium ${textColor(financialStatus)}`}>Dados financeiros</p>
                  <p className="m-0 text-2xs text-muted-foreground">{financialStatus === "done" ? "LOC preenchida" : "LOC pendente"}</p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                {dot(idaStatus)}
                <div className="flex-1 min-w-0">
                  <p className={`m-0 text-xs font-medium ${textColor(idaStatus)}`}>
                    {transportType === "rodoviario" ? "Trecho de embarque" : transportType === "van" ? "Trajeto da van" : "Trecho de ida"}
                  </p>
                  <p className="m-0 text-2xs text-muted-foreground">
                    {idaStatus === "done" ? "Origem, destino, data e chegada OK" : idaStatus === "partial" ? "Informações incompletas" : "Nenhum campo preenchido"}
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                {dot(attachStatus)}
                <div className="flex-1 min-w-0">
                  <p className={`m-0 text-xs font-medium ${textColor(attachStatus)}`}>Arquivos anexados</p>
                  <p className="m-0 text-2xs text-muted-foreground">{attachCount > 0 ? `${attachCount} arquivo(s)` : "Nenhum (opcional)"}</p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                {dot(selectionStatus)}
                <div className="flex-1 min-w-0">
                  <p className={`m-0 text-xs font-medium ${textColor(selectionStatus)}`}>Passagens selecionadas</p>
                  <p className="m-0 text-2xs text-muted-foreground">{selectedCount > 0 ? `${selectedCount} na fila` : "Selecione na tabela"}</p>
                </div>
              </li>
            </ul>
          </Secao>
        </div>
      </div>

      {/* Rodapé */}
      <div className="border-t border-border px-4 py-2.5 bg-surface-muted flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium tabular-nums transition-colors ${selectedCount > 0 ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground"}`}>
            <Users className="h-4 w-4" aria-hidden="true" />
            <span><span className="font-semibold">{selectedCount}</span> {selectedCount === 1 ? "passageiro" : "passageiros"}</span>
          </span>
          {ready ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success-strong" aria-hidden="true" />Pronto para processar
            </span>
          ) : partial ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
              <span className="w-1.5 h-1.5 rounded-full bg-warning-strong" aria-hidden="true" />Em andamento
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" aria-hidden="true" />Aguardando dados
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {canEdit && (
            <>
              <Button
                variant="ghost" size="sm"
                onClick={onClear}
                disabled={!q || Object.keys(q).length === 0}
                className="h-[34px] rounded-lg text-xs text-muted-foreground hover:text-slate-700"
                data-testid="button-clear-quick"
              >
                Limpar
              </Button>
              <Button
                onClick={onApply}
                disabled={selectedCount === 0 || isPending}
                data-testid="button-apply-to-selected"
                className="h-[34px] px-4 font-semibold rounded-lg text-xs gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground disabled:bg-border disabled:text-muted-foreground disabled:opacity-100"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {isPending ? "Aplicando…" : `Aplicar a ${selectedCount} ${selectedCount !== 1 ? "passageiros" : "passageiro"}`}
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
