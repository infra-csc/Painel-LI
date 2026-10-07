/** Lista de atalhos do teclado (Ctrl+/ ou ⌘/), agrupada e com uma tecla por `<kbd>`. */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { SHORTCUTS, type Atalho } from "./shortcuts";
import { Keys } from "./kbd";

const GRUPOS: Atalho["grupo"][] = ["Navegação", "Menu", "Geral"];

export default function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[440px] p-0 gap-0 rounded-2xl overflow-hidden bg-card outline-none"
        // Foco no próprio diálogo, não no X: aberto pelo mouse (botão "?"), o
        // anel de foco no X parecia um botão selecionado. Tab segue normal.
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.focus(); }}
      >
        <DialogHeader className="flex-row items-center gap-3 space-y-0 text-left px-5 pt-5 pb-4 border-b border-border">
          <span className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg bg-brand-soft text-primary">
            <Keyboard className="w-[18px] h-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0 pr-6">
            <DialogTitle className="text-base">Atalhos do teclado</DialogTitle>
            <DialogDescription className="mt-1 text-xs">Funcionam em qualquer tela do painel.</DialogDescription>
          </div>
        </DialogHeader>
        <div className="px-5 py-3">
          {GRUPOS.map((g) => {
            const itens = SHORTCUTS.filter((s) => s.grupo === g);
            if (itens.length === 0) return null;
            return (
              <section key={g} aria-label={g} className="py-1.5">
                <h3 className="m-0 mb-1 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{g}</h3>
                <ul className="m-0 p-0 list-none">
                  {itens.map((s) => (
                    <li key={s.keys} className="flex items-center justify-between gap-4 min-h-[38px]">
                      <span className="text-[13px] text-slate-700">{s.what}</span>
                      <Keys parts={s.parts} label={s.keys} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
