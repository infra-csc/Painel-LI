/**
 * "Escala | Honorários" — a troca de seção nas telas da Validação e da
 * Aprovação (16/10). O dono pediu os honorários "em outra aba, pois é
 * financeiro": a escala continua com as abas dela; os honorários ficam ao
 * lado, separados, e só aparecem para quem participa.
 *
 * A seção inicial vem de `?aba=honorarios` (link do sino) e depois vive no
 * estado da tela — trocar de evento na barra não a perde.
 */
import { CircleDollarSign, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

export type SecaoDaTela = "escala" | "honorarios";

/** Lida UMA vez, na montagem (o link do sino traz `?aba=honorarios`). */
export function secaoInicialDaUrl(): SecaoDaTela {
  if (typeof window === "undefined") return "escala";
  return new URLSearchParams(window.location.search).get("aba") === "honorarios" ? "honorarios" : "escala";
}

export function SeletorDeSecao({ secao, onSecao, pendentes, rotuloEscala = "Escala" }: {
  secao: SecaoDaTela;
  onSecao: (s: SecaoDaTela) => void;
  /** Contador da seção de honorários (o que espera a pessoa). */
  pendentes?: number;
  rotuloEscala?: string;
}) {
  const botao = (valor: SecaoDaTela, rotulo: string, Icone: typeof ClipboardList, n?: number) => {
    const on = secao === valor;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => onSecao(valor)}
        data-testid={`secao-${valor}`}
        className={cn(
          "val-alvo relative -mb-px inline-flex h-10 items-center gap-2 px-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icone className={cn("h-4 w-4", on ? (valor === "honorarios" ? "text-success" : "text-primary") : "")} aria-hidden="true" />
        {rotulo}
        {n ? <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-warning-soft px-1.5 text-2xs font-semibold tabular-nums text-warning">{n}</span> : null}
        <span aria-hidden="true" className={cn("absolute inset-x-0 bottom-0 h-0.5 rounded-full transition-transform duration-200 ease-out motion-reduce:transition-none", valor === "honorarios" ? "bg-success-strong" : "bg-primary", on ? "scale-x-100" : "scale-x-0")} />
      </button>
    );
  };
  return (
    <div role="tablist" aria-label="Seção da tela" className="flex items-end gap-5 border-b border-border" data-testid="seletor-de-secao">
      {botao("escala", rotuloEscala, ClipboardList)}
      {botao("honorarios", "Honorários", CircleDollarSign, pendentes)}
      <span className="mb-2.5 ml-auto hidden text-2xs text-muted-foreground sm:block">
        {secao === "honorarios" ? "Financeiro da cenotécnica — não altera a escala" : ""}
      </span>
    </div>
  );
}
