/**
 * Popover de edição em lote da planilha do Planejado — 25/09 (modularização).
 * Antes triplicado nos 3 cabeçalhos. Aplica somente aos pendentes visíveis:
 * linha enviada ou ausente nunca recebe override, então a antiga opção
 * "Apenas pendentes" deixou de existir.
 *
 * 08/10: o mesmo campo "R$" do diálogo de lote, Enter aplica, Esc cancela
 * (o Esc é tratado pela planilha), e o aviso de alcance antes dos botões.
 */
import { Layers } from "lucide-react";

export interface BatchPopoverProps {
  title: string;
  value: string;
  onChangeValue: (v: string) => void;
  onCancel: () => void;
  onApply: () => void;
}

export function BatchPopover({ title, value, onChangeValue, onCancel, onApply }: BatchPopoverProps) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="pla-lote-pop absolute right-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-border bg-card shadow-3 p-3 text-left normal-case tracking-normal font-normal"
    >
      <p className="m-0 mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Layers className="w-3.5 h-3.5 text-primary" aria-hidden="true" />{title}
      </p>
      <div className="flex items-center gap-2 h-9 rounded-lg border border-border px-2.5 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/12">
        <span className="text-xs font-medium text-muted-foreground" aria-hidden="true">R$</span>
        <input
          type="text" inputMode="decimal" placeholder="0,00"
          aria-label={title}
          value={value}
          onChange={e => onChangeValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") onApply(); }}
          autoFocus
          className="flex-1 min-w-0 bg-transparent text-right text-sm font-semibold tabular-nums text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
        />
      </div>
      <p className="m-0 mt-2 mb-3 text-2xs leading-4 text-muted-foreground">Vale para os pendentes visíveis (filtro atual). Enviados e “não participou” ficam como estão.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 h-8 rounded-lg border border-border bg-card text-xs font-medium text-slate-700 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Cancelar</button>
        <button type="button" onClick={onApply} className="flex-1 h-8 rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Aplicar</button>
      </div>
    </div>
  );
}

export default BatchPopover;
