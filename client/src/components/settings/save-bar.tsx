// Extraído de system-settings.tsx em 25/09 (modularização): barra flutuante
// de salvamento — o ÚNICO ponto que grava a tela Valores padrão. Recebe só
// contadores e callbacks; quem decide o que salvar é useSettingsForm.
import { Save, X } from "lucide-react";

export interface SaveBarProps {
  totalUnsaved: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

export function SaveBar({ totalUnsaved, saving, onSave, onDiscard }: SaveBarProps) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex min-w-[340px] -translate-x-1/2 items-center gap-4 rounded-xl bg-slate-800 py-2.5 pl-5 pr-4 shadow-3">
      <span className="flex-1 text-sm text-muted-foreground">
        <span className="font-bold text-slate-50">{totalUnsaved}</span>{' '}
        alteraç{totalUnsaved === 1 ? 'ão' : 'ões'} não salva{totalUnsaved === 1 ? '' : 's'}
      </span>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground shadow-2 transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-slate-600"
      >
        <Save className="h-3.5 w-3.5" aria-hidden="true" />
        {saving ? 'Salvando…' : 'Salvar'}
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-slate-200"
        title="Descartar alterações"
        aria-label="Descartar alterações"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
