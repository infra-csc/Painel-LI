/**
 * Diálogo "Edição em lote" da planilha do Planejado — 25/09 (modularização).
 * Radix Dialog (Esc, foco preso, aria); pergunta antes de descartar um valor
 * digitado (`useConfirmarDescarte` fica no chamador, que controla o estado).
 */
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AdvancedBatch } from "./types";

export interface AdvancedBatchDialogProps {
  advancedBatch: AdvancedBatch | null;
  setAdvancedBatch: React.Dispatch<React.SetStateAction<AdvancedBatch | null>>;
  selectedCount: number;
  /** Fecha respeitando "Descartar?" quando há valor digitado. */
  pedirParaFechar: (fechar: () => void) => void;
  onApply: () => void;
}

export function AdvancedBatchDialog({ advancedBatch, setAdvancedBatch, selectedCount, pedirParaFechar, onApply }: AdvancedBatchDialogProps) {
  const batchValueRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={!!advancedBatch} onOpenChange={(v) => { if (!v) pedirParaFechar(() => setAdvancedBatch(null)); }}>
    {advancedBatch && (
      <DialogContent
        className="max-w-md rounded-xl p-6 gap-0"
        onOpenAutoFocus={(e) => { e.preventDefault(); batchValueRef.current?.focus(); }}
      >
          <DialogHeader className="mb-5 text-left">
            <DialogTitle className="text-base font-bold text-foreground">Edição em lote</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Aplica um mesmo valor a várias vagas de uma vez.
            </DialogDescription>
          </DialogHeader>
          {/* Target */}
          <fieldset className="mb-4">
            <legend className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quem será afetado</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["all", "casa", "freela", "selected"] as const).map(t => (
                <button key={t} type="button" aria-pressed={advancedBatch.target === t} onClick={() => setAdvancedBatch(p => p ? { ...p, target: t } : p)}
                  className={`text-xs px-3 py-2 rounded-lg border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${advancedBatch.target === t ? "border-primary bg-brand-soft text-primary" : "border-border text-slate-600 hover:bg-surface-muted"}`}>
                  {t === "all" ? "Todos" : t === "casa" ? "Somente CASA" : t === "freela" ? "Somente FREELA" : `Selecionados (${selectedCount})`}
                </button>
              ))}
            </div>
          </fieldset>
          {/* Field */}
          <fieldset className="mb-4">
            <legend className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">O que alterar</legend>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["vdia", "Diária (R$/dia)", "border-primary bg-surface-muted text-primary"],
                ["alimUtil", "Alimentação útil", "border-primary bg-surface-muted text-primary"],
                ["alimFds", "Alimentação FDS", "border-warning-strong bg-surface-muted text-warning"],
                ["mob", "Mobilidade", "border-primary bg-surface-muted text-primary"],
              ] as const).map(([f, label, ativo]) => (
                <button key={f} type="button" aria-pressed={advancedBatch.field === f} onClick={() => setAdvancedBatch(p => p ? { ...p, field: f } : p)}
                  className={`text-xs px-3 py-2 rounded-lg border font-medium transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${advancedBatch.field === f ? ativo : "border-border text-slate-600 hover:bg-surface-muted"}`}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          {/* Value */}
          <div className="mb-5">
            <label htmlFor="batch-novo-valor" className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {advancedBatch.field === "mob" ? "Novo valor (R$ total ida+volta)" : "Novo valor (R$/dia)"}
            </label>
            <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/20">
              <span className="text-muted-foreground text-sm font-medium" aria-hidden="true">R$</span>
              <input
                id="batch-novo-valor"
                ref={batchValueRef}
                type="text" inputMode="decimal" placeholder="0,00"
                value={advancedBatch.value}
                onChange={e => setAdvancedBatch(p => p ? { ...p, value: e.target.value } : p)}
                onKeyDown={e => { if (e.key === "Enter") onApply(); }}
                className="flex-1 text-right text-sm font-mono font-semibold outline-none bg-transparent text-foreground"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => pedirParaFechar(() => setAdvancedBatch(null))} className="flex-1 h-10 rounded-xl">Cancelar</Button>
            <Button type="button" onClick={onApply} className="flex-1 h-10 rounded-xl font-bold">
              Aplicar ajuste
            </Button>
          </div>
      </DialogContent>
    )}
    </Dialog>
  );
}

export default AdvancedBatchDialog;
