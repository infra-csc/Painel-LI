/**
 * O prazo do colaborador no portal (28/10, Fase 3 — prazos e cobranças):
 * "Confirme até sex, 31/10", "Envie a nota até hoje" e, passado o prazo, um
 * aviso calmo e claro (sem vermelho de erro — o que importa é ele agir).
 * A regra e a data vêm do servidor (shared/prazos-honorarios).
 */
import { CalendarClock, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fraseDoPrazo } from "./formatos";
import { Aviso } from "./pecas";
import type { PrazoDoPortal } from "./tipos";

export function PrazoDoColaborador({ prazo, className }: { prazo: PrazoDoPortal; className?: string }) {
  const f = fraseDoPrazo(prazo);
  if (f.atrasado) {
    return (
      <Aviso tom="atencao" icone={Clock3} titulo={f.titulo} className={className} role="status">
        {f.detalhe}
      </Aviso>
    );
  }
  return (
    <p className={cn("m-0 flex items-center gap-1.5 text-[15px] font-semibold", f.hoje ? "text-warning" : "text-foreground", className)} data-testid="prazo-do-colaborador">
      <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
      {f.titulo}
    </p>
  );
}
