/**
 * O evento de uma linha (modo "Todos os eventos"): nome em cima, período
 * embaixo, alinhados ao texto ao lado do ícone (07/10). Numa linha só o
 * período longo quebrava no meio do nome ("Maratona de / Salvador · 21/11…").
 * Datas em fonte proporcional com números tabulares — a monoespaçada do
 * sistema parecia máquina de escrever ao lado do resto da linha.
 */
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

export function LinhaDoEvento({ nome, periodo, className }: { nome: string | null | undefined; periodo?: string | null; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-start gap-1.5 text-2xs leading-4 text-muted-foreground", className)}>
      <CalendarDays className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block break-words font-semibold text-slate-600" title={nome ?? undefined}>{nome ?? "Evento sem nome"}</span>
        {periodo && <span className="block tabular-nums">{periodo}</span>}
      </span>
    </span>
  );
}
