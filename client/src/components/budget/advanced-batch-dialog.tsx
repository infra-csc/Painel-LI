/**
 * Diálogo "Edição em lote" da planilha do Planejado — 25/09 (modularização).
 * Radix Dialog (Esc, foco preso, aria); pergunta antes de descartar um valor
 * digitado (`useConfirmarDescarte` fica no chamador, que controla o estado).
 *
 * 08/10: cabeçalho da família (ícone, título, o que faz), as duas escolhas
 * como grupos de opção com marca de escolhida, o campo R$ com a unidade certa
 * e o rodapé fixo com Cancelar × Aplicar. Mesmas opções e mesmo efeito.
 */
import { useRef } from "react";
import { Check, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AdvancedBatch } from "./types";

export interface AdvancedBatchDialogProps {
  advancedBatch: AdvancedBatch | null;
  setAdvancedBatch: React.Dispatch<React.SetStateAction<AdvancedBatch | null>>;
  selectedCount: number;
  /** Fecha respeitando "Descartar?" quando há valor digitado. */
  pedirParaFechar: (fechar: () => void) => void;
  onApply: () => void;
}

const OPCAO = "relative flex items-center gap-2 min-h-10 px-3 py-2 rounded-lg border text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none";

function Marca({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex items-center justify-center w-4 h-4 shrink-0 rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-card text-transparent")}>
      <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
    </span>
  );
}

export function AdvancedBatchDialog({ advancedBatch, setAdvancedBatch, selectedCount, pedirParaFechar, onApply }: AdvancedBatchDialogProps) {
  const batchValueRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={!!advancedBatch} onOpenChange={(v) => { if (!v) pedirParaFechar(() => setAdvancedBatch(null)); }}>
    {advancedBatch && (
      <DialogContent
        className="max-w-[460px] w-[95vw] p-0 gap-0 rounded-xl overflow-hidden"
        onOpenAutoFocus={(e) => { e.preventDefault(); batchValueRef.current?.focus(); }}
      >
        <div className="flex items-start gap-3 px-5 pt-4 pb-3.5 pr-12 border-b border-border">
          <span className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-soft text-primary shrink-0" aria-hidden="true">
            <Layers className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="m-0 text-base font-semibold leading-6 text-foreground">Edição em lote</DialogTitle>
            <DialogDescription className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
              Aplica um mesmo valor a várias vagas de uma vez. Enviados e “não participou” ficam como estão.
            </DialogDescription>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Target */}
          <fieldset className="m-0 p-0 border-0">
            <legend className="mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Quem será afetado</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["all", "casa", "freela", "selected"] as const).map(t => {
                const on = advancedBatch.target === t;
                return (
                  <button key={t} type="button" aria-pressed={on} onClick={() => setAdvancedBatch(p => p ? { ...p, target: t } : p)}
                    disabled={t === "selected" && selectedCount === 0}
                    className={cn(OPCAO, on ? "border-primary bg-brand-soft text-primary font-medium" : "border-border text-slate-700 hover:bg-muted")}>
                    <Marca on={on} />
                    {t === "all" ? "Todos" : t === "casa" ? "Somente CASA" : t === "freela" ? "Somente FREELA" : `Selecionados (${selectedCount})`}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {/* Field */}
          <fieldset className="m-0 p-0 border-0">
            <legend className="mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">O que alterar</legend>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["vdia", "Diária", "R$ por dia", "bg-primary"],
                ["alimUtil", "Alimentação útil", "R$ por dia útil", "bg-primary"],
                ["alimFds", "Alimentação FDS", "R$ por dia de FDS", "bg-warning-strong"],
                ["mob", "Mobilidade", "R$ ida + volta", "bg-slate-400"],
              ] as const).map(([f, label, unidade, ponto]) => {
                const on = advancedBatch.field === f;
                return (
                  <button key={f} type="button" aria-pressed={on} onClick={() => setAdvancedBatch(p => p ? { ...p, field: f } : p)}
                    className={cn(OPCAO, "items-start", on ? "border-primary bg-brand-soft" : "border-border hover:bg-muted")}>
                    <Marca on={on} />
                    <span className="min-w-0 -mt-px">
                      <span className={cn("flex items-center gap-1.5 font-medium", on ? "text-primary" : "text-slate-700")}>
                        <span aria-hidden="true" className={cn("w-1.5 h-1.5 rounded-full shrink-0", ponto)} />{label}
                      </span>
                      <span className="block text-2xs text-muted-foreground">{unidade}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          {/* Value */}
          <div>
            <label htmlFor="batch-novo-valor" className="block mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {advancedBatch.field === "mob" ? "Novo valor (R$ total ida+volta)" : "Novo valor (R$/dia)"}
            </label>
            <div className="flex items-center gap-2 h-10 rounded-lg border border-border px-3 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/12">
              <span className="text-sm font-medium text-muted-foreground" aria-hidden="true">R$</span>
              <input
                id="batch-novo-valor"
                ref={batchValueRef}
                type="text" inputMode="decimal" placeholder="0,00"
                value={advancedBatch.value}
                onChange={e => setAdvancedBatch(p => p ? { ...p, value: e.target.value } : p)}
                onKeyDown={e => { if (e.key === "Enter") onApply(); }}
                className="flex-1 min-w-0 bg-transparent text-right text-base font-semibold tabular-nums text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-surface-muted">
          <Button type="button" variant="outline" onClick={() => pedirParaFechar(() => setAdvancedBatch(null))} className="h-9 rounded-lg px-4">Cancelar</Button>
          <Button type="button" onClick={onApply} className="h-9 rounded-lg px-4 font-semibold gap-1.5">
            <Check className="w-4 h-4" aria-hidden="true" />Aplicar ajuste
          </Button>
        </div>
      </DialogContent>
    )}
    </Dialog>
  );
}

export default AdvancedBatchDialog;
