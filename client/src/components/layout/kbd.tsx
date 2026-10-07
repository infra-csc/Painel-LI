/**
 * TECLA — uma `<kbd>` por tecla, no mesmo desenho em toda a casca (busca do
 * topo, paleta, menu do usuário, diálogo de atalhos). Antes cada lugar montava
 * a sua com classes próprias e o modificador colado ("CtrlK").
 */
import { cn } from "@/lib/utils";

export function Kbd({ children, className, tone = "default" }: { children: React.ReactNode; className?: string; tone?: "default" | "inverse" }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-[5px] font-sans text-2xs font-medium leading-none",
        tone === "inverse"
          ? "bg-white/15 text-white"
          : "border border-border border-b-2 bg-card text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Sequência de teclas ("Ctrl" "K"). `label` vai para o leitor de tela no lugar das peças. */
export function Keys({ parts, label, className, tone }: { parts: string[]; label?: string; className?: string; tone?: "default" | "inverse" }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 shrink-0", className)} aria-label={label} role={label ? "img" : undefined}>
      {parts.map((p, i) => <Kbd key={i} tone={tone}>{p}</Kbd>)}
    </span>
  );
}
