/**
 * Popover de edição em lote da planilha do Planejado — 25/09 (modularização).
 * Antes triplicado nos 3 cabeçalhos. Aplica somente aos pendentes visíveis:
 * linha enviada ou ausente nunca recebe override, então a antiga opção
 * "Apenas Pendentes" deixou de existir.
 */
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
      className="absolute right-0 top-full mt-1 z-50 bg-card rounded-xl border border-border shadow-3 p-3 w-56 text-left"
      style={{ minWidth: "220px" }}
    >
      <div className="text-2xs font-semibold text-slate-600 mb-2">{title}</div>
      <input
        type="text" inputMode="decimal" placeholder="0,00"
        aria-label={title}
        value={value}
        onChange={e => onChangeValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onApply(); }}
        autoFocus
        className="w-full h-8 border border-border rounded-md px-2 text-right text-xs font-mono outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 mb-2"
      />
      <p className="text-2xs text-muted-foreground mb-3">Aplica aos pendentes visíveis (filtro atual)</p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 h-7 text-2xs border border-border rounded-md text-muted-foreground hover:bg-surface-muted transition-colors">Cancelar</button>
        <button onClick={onApply} className="flex-1 h-7 text-2xs rounded-md text-primary-foreground font-semibold bg-primary">Aplicar</button>
      </div>
    </div>
  );
}

export default BatchPopover;
