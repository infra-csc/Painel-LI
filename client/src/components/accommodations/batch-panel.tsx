import { Hotel, Save, ChevronDown, ChevronRight, ListChecks, BedDouble, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BatchDraft } from "./types";
import { isCheckOutAfterCheckIn } from "./utils";

export interface BatchPanelProps {
  expanded: boolean;
  onToggle: () => void;
  draft: BatchDraft;
  onChange: <K extends keyof BatchDraft>(field: K, value: NonNullable<BatchDraft[K]>) => void;
  onClear: () => void;
  /** Quantidade de inclusões selecionadas E ainda elegíveis. */
  selectedCount: number;
  canEdit: boolean;
  applying: boolean;
  /** Passo 1: valida e abre a confirmação. */
  onApply: () => void;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  /** Passo 2: executa o lote. */
  onConfirm: () => void;
}

type StepStatus = "done" | "partial" | "empty";
const DOT: Record<StepStatus, string> = { done: "bg-green-500", partial: "bg-yellow-400 animate-pulse", empty: "bg-red-400" };
const TXT: Record<StepStatus, string> = { done: "text-slate-700", partial: "text-yellow-700", empty: "text-slate-400" };
const INPUT = "h-[38px] bg-slate-50 border-slate-200 rounded-xl text-sm";
const FIELD_LBL = "text-[11px] font-semibold text-slate-500 uppercase tracking-tight";

/** Card recolhível "Aplicar em Lote" + formulário + rodapé de ação + confirmação. */
export default function BatchPanel({
  expanded, onToggle, draft, onChange, onClear, selectedCount, canEdit, applying, onApply,
  confirmOpen, onConfirmOpenChange, onConfirm,
}: BatchPanelProps) {
  const hotelStatus: StepStatus = draft.hotelName && draft.hotelLocation ? "done" : (draft.hotelName || draft.hotelLocation) ? "partial" : "empty";
  const selectionStatus: StepStatus = selectedCount > 0 ? "done" : "empty";
  const ready = selectedCount > 0 && !!draft.hotelName && !!draft.hotelLocation;
  const partial = !ready && (selectedCount > 0 || !!draft.hotelName);
  const isEmpty = Object.values(draft).every((v) => !v);
  const plural = selectedCount === 1 ? "hospedagem" : "hospedagens";

  return (
    <>
      {/* Cabeçalho recolhível */}
      <div
        className="bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors overflow-hidden"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Aplicar em lote — expandir ou recolher"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        data-testid="button-toggle-quick-register"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
            <Hotel className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Aplicar em Lote</p>
            <p className="text-xs text-slate-400 font-medium">Aplicar mesmos dados a múltiplas hospedagens</p>
          </div>
        </div>
        <div className="pr-4">
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
            {expanded ? <ChevronDown className="w-4 h-4 text-amber-500" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-6">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-slate-900">Aplicar em Lote</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Insira os dados comuns para múltiplas hospedagens simultaneamente.</p>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3 p-3">
            {/* Coluna esquerda */}
            <div className="col-span-12 lg:col-span-8 space-y-2">
              <section className="rounded-xl overflow-hidden border border-slate-200">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                  <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center shrink-0">
                    <Hotel className="w-3 h-3 text-white" />
                  </div>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600">Dados do Hotel</h4>
                </div>
                <div className="p-4 bg-white space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="quick-hotel-name" className={FIELD_LBL}>Nome do Hotel *</Label>
                      <Input id="quick-hotel-name" placeholder="Hotel Copacabana" value={draft.hotelName || ""}
                        onChange={(e) => onChange("hotelName", e.target.value)} className={INPUT} data-testid="input-quick-hotel-name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="quick-hotel-location" className={FIELD_LBL}>Localização *</Label>
                      <Input id="quick-hotel-location" placeholder="Rio de Janeiro, RJ" value={draft.hotelLocation || ""}
                        onChange={(e) => onChange("hotelLocation", e.target.value)} className={INPUT} data-testid="input-quick-hotel-location" />
                    </div>
                  </div>
                  {/* Check-in/out do lote — opcionais: em branco, cada inclusão usa seu período de trabalho */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className={FIELD_LBL}>Check-in <span className="text-slate-300 normal-case">(opcional — padrão: início da escala)</span></Label>
                      <div className="grid grid-cols-[1fr_110px] gap-2">
                        <Input id="quick-checkin-date" type="date" aria-label="Data de check-in do lote" value={draft.checkInDate || ""}
                          onChange={(e) => onChange("checkInDate", e.target.value)} className={INPUT} data-testid="input-quick-checkin-date" />
                        <Input id="quick-checkin-time" type="time" aria-label="Hora de check-in do lote" value={draft.checkInTime || ""}
                          onChange={(e) => onChange("checkInTime", e.target.value)} className={INPUT} data-testid="input-quick-checkin-time" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={FIELD_LBL}>Check-out <span className="text-slate-300 normal-case">(opcional — padrão: término da escala)</span></Label>
                      <div className="grid grid-cols-[1fr_110px] gap-2">
                        <Input id="quick-checkout-date" type="date" aria-label="Data de check-out do lote" min={draft.checkInDate || undefined} value={draft.checkOutDate || ""}
                          onChange={(e) => onChange("checkOutDate", e.target.value)} className={INPUT} data-testid="input-quick-checkout-date" />
                        <Input id="quick-checkout-time" type="time" aria-label="Hora de check-out do lote" value={draft.checkOutTime || ""}
                          onChange={(e) => onChange("checkOutTime", e.target.value)} className={INPUT} data-testid="input-quick-checkout-time" />
                      </div>
                    </div>
                  </div>
                  {!isCheckOutAfterCheckIn(draft) && (
                    <p className="text-[12px] text-red-600 flex items-center gap-1.5" role="alert">
                      <AlertCircle className="w-3.5 h-3.5" /> O check-out deve ser igual ou posterior ao check-in.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-accommodation-observations" className={FIELD_LBL}>Observações <span className="text-slate-300 normal-case">(opcional)</span></Label>
                    <Textarea id="quick-accommodation-observations" placeholder="Informações adicionais..." value={draft.accommodationObservations || ""}
                      onChange={(e) => onChange("accommodationObservations", e.target.value)}
                      className="text-sm resize-none bg-slate-50 border-slate-200 rounded-xl h-[72px]" data-testid="textarea-quick-accommodation-observations" />
                  </div>
                </div>
              </section>
            </div>

            {/* Coluna direita: status da operação */}
            <div className="col-span-12 lg:col-span-4 space-y-3">
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                  <div className="w-5 h-5 rounded-md bg-slate-500 flex items-center justify-center shrink-0">
                    <ListChecks className="w-3 h-3 text-white" />
                  </div>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600">Status da Operação</h4>
                </div>
                <ul className="p-3 space-y-2.5 bg-white">
                  <li className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${DOT[hotelStatus]}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-semibold ${TXT[hotelStatus]}`}>Dados do hotel</p>
                      <p className="text-[11px] text-slate-400">{hotelStatus === "done" ? "Nome e localização OK" : hotelStatus === "partial" ? "Dados incompletos" : "Nenhum campo preenchido"}</p>
                    </div>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${DOT[selectionStatus]}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-semibold ${TXT[selectionStatus]}`}>Hospedagens selecionadas</p>
                      <p className="text-[11px] text-slate-400">{selectedCount > 0 ? `${selectedCount} na fila` : "Selecione na tabela"}</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Rodapé de ação */}
          <div className="border-t border-slate-100 px-5 py-3 bg-slate-50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl transition-all ${selectedCount > 0 ? "bg-primary text-white shadow-lg shadow-blue-200" : "bg-slate-200 text-slate-400"}`}>
                <BedDouble className="w-[18px] h-[18px]" />
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-70 leading-none mb-0.5">Hospedagens</p>
                  <p className="text-lg font-black leading-none">{selectedCount}</p>
                </div>
              </div>
              {ready ? (
                <span className="flex items-center gap-1.5 px-4 py-1.5 bg-green-100 text-green-700 rounded-full text-[11px] font-bold uppercase tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Pronto para aplicar
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
            {canEdit && (
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={onClear} disabled={isEmpty} data-testid="button-clear-quick"
                  className="rounded-xl border-slate-200 text-slate-500 hover:text-slate-700">
                  Limpar Campos
                </Button>
                <Button onClick={onApply} disabled={selectedCount === 0 || applying} data-testid="button-apply-to-selected"
                  className={`h-[38px] px-6 font-bold rounded-xl flex items-center gap-2 transition-all ${selectedCount === 0
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                    : "bg-primary text-white hover:bg-primary-hover shadow-lg shadow-blue-200"}`}>
                  <Save className="w-4 h-4" />
                  {applying ? "Aplicando..." : `Aplicar a ${selectedCount} ${selectedCount === 1 ? "Hospedagem" : "Hospedagens"}`}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmação do lote */}
      <AlertDialog open={confirmOpen} onOpenChange={onConfirmOpenChange}>
        <AlertDialogContent className="max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar a {selectedCount} {plural}?</AlertDialogTitle>
            <AlertDialogDescription>
              Os dados de <span className="font-semibold text-slate-700">{draft.hotelName}</span>
              {draft.hotelLocation ? <> ({draft.hotelLocation})</> : null} serão registrados
              nas inclusões selecionadas e o status de cada uma avança para "hospedagem registrada".
              {!draft.checkInDate || !draft.checkOutDate
                ? " As datas de check-in/out não informadas usam o período de trabalho de cada inclusão."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} data-testid="button-confirm-batch" className="bg-primary hover:bg-primary-hover">
              Aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
