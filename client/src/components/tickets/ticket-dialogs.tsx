// Diálogos auxiliares da tela de Passagens: descartar alterações, avisos
// cronológicos, confirmação e resumo do lote. O modal "Sucesso" + OK saiu em
// 23/09 — virou toast (`toastSucessoDaVaga` em components/common/toast-sucesso).
import { CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import type { TicketFormValues } from "@/lib/ticket-form";
import { formatDate } from "./use-tickets-data";
import type { BatchResult } from "./types";

// ── Descartar alterações? ── (ConfirmDialog único, 23/09: destrutivo → foco no Cancelar)
export function DiscardChangesDialog({ open, onCancel, onDiscard, backToView }: { open: boolean; onCancel: () => void; onDiscard: () => void; backToView?: boolean }) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => { if (!o) onCancel(); }}
      title="Descartar alterações?"
      description={backToView
        ? "Há alterações que ainda não foram salvas. Ao cancelar, a passagem volta a ser exibida como está registrada."
        : "Há dados preenchidos que ainda não foram registrados. Ao fechar, eles serão perdidos."}
      cancelLabel="Continuar editando"
      confirmLabel="Descartar"
      tone="danger"
      onConfirm={onDiscard}
      className="max-w-[420px]"
    />
  );
}

// ── Avisos cronológicos (não bloqueantes) ──
export function ChronologyWarningsDialog({ warnings, onCancel, onConfirm }: { warnings: string[] | null; onCancel: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={!!warnings} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="max-w-[480px] border-warning/25">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-warning">
            <AlertCircle className="w-5 h-5 text-warning-strong" aria-hidden="true" />Confira as datas antes de continuar
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <ul className="list-disc pl-5 space-y-1 text-sm text-warning bg-warning-soft border border-warning/25 rounded-lg p-3">
                {warnings?.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              <p className="text-xs text-muted-foreground">
                Esses avisos não impedem o registro, mas os horários alimentam alimentação e mobilidade no Planejado. Confirme se está correto.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar e corrigir</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-warning-strong hover:bg-warning/90 text-white">Continuar mesmo assim</AlertDialogAction>
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
      rows.push(["Volta", `${q.actualReturnDate ? formatDate(q.actualReturnDate) : "—"} · ${q.actualReturnTime || "—"} → chegada ${q.returnArrivalTime || "—"}`]);
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
          <div className="bg-surface-muted border border-border rounded-xl p-3 space-y-1.5 text-xs">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-start gap-3">
                <span className="w-24 shrink-0 text-muted-foreground font-medium">{k}</span>
                <span className="font-semibold text-slate-700 break-words">{v}</span>
              </div>
            ))}
          </div>
          <div className="max-h-32 overflow-y-auto border border-border rounded-xl p-3 text-xs text-slate-600 space-y-0.5">
            {names.map((nm, i) => <div key={i}>{nm}</div>)}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-primary hover:bg-primary-hover text-primary-foreground">Confirmar e aplicar</AlertDialogAction>
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
              ? <><CheckCircle className="w-5 h-5 text-success-strong" aria-hidden="true" /> Lote concluído</>
              : <><AlertCircle className="w-5 h-5 text-warning-strong" aria-hidden="true" /> Lote concluído com falhas</>}
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
          <ul className="max-h-48 overflow-y-auto bg-danger-soft border border-danger/30 rounded-xl p-3 text-xs text-danger space-y-1 list-disc pl-7" data-testid="batch-failures">
            {result.failures.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        )}
        <div className="flex justify-end">
          <Button onClick={onClose} className="bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl px-5">OK</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
