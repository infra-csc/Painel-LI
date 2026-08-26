/** Lista de atalhos do teclado (⌘/ ou Ctrl+/). */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SHORTCUTS } from "./shortcuts";

export default function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base">Atalhos do teclado</DialogTitle>
          <DialogDescription className="text-xs">Funcionam em qualquer tela do painel.</DialogDescription>
        </DialogHeader>
        <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-b-0">
              <span className="text-[13px] text-slate-700">{s.what}</span>
              <kbd className="shrink-0 border border-border bg-background rounded-md px-2 py-0.5 font-mono text-[11px] text-slate-500">{s.keys}</kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
