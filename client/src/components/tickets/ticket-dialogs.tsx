// Diálogos auxiliares da tela de Passagens: sucesso, descartar alterações,
// avisos cronológicos, confirmação e resumo do lote.
import { CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { TicketFormValues } from "@/lib/ticket-form";
import { formatDate } from "./use-tickets-data";
import type { BatchResult, SuccessInfo } from "./types";

// ── Sucesso ──
export function TicketSuccessDialog({ open, info, onClose }: { open: boolean; info: SuccessInfo | null; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[440px] gap-0 p-0 overflow-hidden" data-testid="dialog-ticket-success">
        <div className="flex flex-col items-center px-8 py-7">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: "#DCFCE7" }}>
            <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <circle cx="18" cy="18" r="18" fill="#16A34A" fillOpacity="0.12" />
              <path d="M10 18.5L15.5 24L26 13" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <DialogHeader className="items-center space-y-1 mb-3">
            <DialogTitle className="text-lg font-bold text-slate-800">Sucesso</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 text-center">{info?.message}</DialogDescription>
          </DialogHeader>
          {info?.inclusionNumber != null && (
            <span className="mb-4 px-3 py-0.5 rounded-full text-sm font-bold" style={{ background: "#EEF2FF", color: "#4F46E5" }}>#{info.inclusionNumber}</span>
          )}
          <div className="w-full border-t border-slate-100 mb-4" />
          <div className="w-full space-y-2 mb-5">
            {[["Evento", info?.eventName], ["Colaborador", info?.collaboratorName], ["Função", info?.functionName]].map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 text-sm">
                <span className="text-slate-400 font-medium shrink-0">{k}</span>
                <span className="text-slate-700 font-semibold text-right">{v}</span>
              </div>
            ))}
          </div>
          <Button onClick={onClose} className="w-full py-2.5 rounded-xl font-semibold text-white text-sm" style={{ background: "#2563EB" }}>OK</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Descartar alterações? ──
export function DiscardChangesDialog({ open, onCancel, onDiscard, backToView }: { open: boolean; onCancel: () => void; onDiscard: () => void; backToView?: boolean }) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="max-w-[420px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
          <AlertDialogDescription>
            {backToView
              ? "Há alterações que ainda não foram salvas. Ao cancelar, a passagem volta a ser exibida como está registrada."
              : "Há dados preenchidos que ainda não foram registrados. Ao fechar, eles serão perdidos."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard} className="bg-red-600 hover:bg-red-700 text-white">Descartar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Avisos cronológicos (não bloqueantes) ──
export function ChronologyWarningsDialog({ warnings, onCancel, onConfirm }: { warnings: string[] | null; onCancel: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={!!warnings} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="max-w-[480px] border-amber-200">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-800">
            <AlertCircle className="w-5 h-5 text-amber-500" />Confira as datas antes de continuar
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <ul className="list-disc pl-5 space-y-1 text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {warnings?.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              <p className="text-[12px] text-slate-500">
                Esses avisos não impedem o registro, mas os horários alimentam alimentação e mobilidade no Planejado. Confirme se está correto.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar e corrigir</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-amber-500 hover:bg-amber-600 text-white">Continuar mesmo assim</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Confirmação do lote ──
export function BatchConfirmDialog({ open, quick, names, onCancel, onConfirm }: {
  open: boolean; quick: TicketFormValues; names: string[]; onCancel: () => void; onConfirm: () => void;
}) {
  const q = quick;
  const type = q.transportType || "aereo";
  const isVan = type === "van";
  const isRodo = type === "rodoviario";
  const n = names.length;
  const rows: Array<[string, string]> = [
    ["Tipo", isVan ? "Van" : isRodo ? "Rodoviário" : "Aéreo"],
    [isVan ? "Empresa" : isRodo ? "Bilhete" : "LOC", q.purchaseOrderNumber || "—"],
  ];
  if (!isVan) {
    rows.push(["Ida", `${q.actualDepartureDate ? formatDate(q.actualDepartureDate) : "—"} · ${q.actualDepartureTime || "—"} → chegada ${q.actualArrivalTime || "—"}`]);
    rows.push(["Trecho ida", `${q.departureAirport || "—"} → ${q.destinationAirport || "—"}`]);
    if (q.isOneWay) {
      rows.push(["Volta", "Apenas ida"]);
    } else {
      rows.push(["Volta", `${q.actualReturnDate ? formatDate(q.actualReturnDate) : "—"} · ${q.actualReturnTime || "—"}`]);
      rows.push(["Trecho volta", `${q.returnOriginAirport || "—"} → ${q.returnDestinationAirport || "—"}`]);
    }
    if (q.value) rows.push(["Valor", q.value]);
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="max-w-[560px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Aplicar a {n} passageiro{n !== 1 ? "s" : ""}?</AlertDialogTitle>
          <AlertDialogDescription>Os mesmos dados abaixo serão registrados em todas as passagens selecionadas. Confira antes de confirmar.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-[12px]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-start gap-3">
                <span className="w-24 shrink-0 text-slate-400 font-medium">{k}</span>
                <span className="font-semibold text-slate-700 break-words">{v}</span>
              </div>
            ))}
          </div>
          <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-xl p-3 text-[12px] text-slate-600 space-y-0.5">
            {names.map((nm, i) => <div key={i}>{nm}</div>)}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-[#0033CC] hover:bg-[#002299] text-white">Confirmar e aplicar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Resumo pós-execução do lote ──
export function BatchResultDialog({ result, onClose }: { result: BatchResult | null; onClose: () => void }) {
  return (
    <Dialog open={!!result} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result && result.failures.length === 0
              ? <><CheckCircle className="w-5 h-5 text-green-600" /> Lote concluído</>
              : <><AlertCircle className="w-5 h-5 text-amber-500" /> Lote concluído com falhas</>}
          </DialogTitle>
          <DialogDescription>
            {result && (
              <>
                {result.created} passagem{result.created !== 1 ? "ns" : ""} criada{result.created !== 1 ? "s" : ""}
                {result.updated > 0 && <>, {result.updated} atualizada{result.updated !== 1 ? "s" : ""} (já existiam)</>}
                {result.failures.length > 0 && <>, {result.failures.length} falha{result.failures.length !== 1 ? "s" : ""}</>}.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {result && result.failures.length > 0 && (
          <ul className="max-h-48 overflow-y-auto bg-red-50 border border-red-200 rounded-xl p-3 text-[12px] text-red-700 space-y-1 list-disc pl-7" data-testid="batch-failures">
            {result.failures.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        )}
        <div className="flex justify-end">
          <Button onClick={onClose} style={{ background: "#2563EB" }} className="text-white rounded-xl px-5">OK</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
