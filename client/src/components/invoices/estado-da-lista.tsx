// Notas fiscais (08/10, redesenho): o bloco de estado das listas — vazio de
// verdade, nada neste recorte, nenhum evento — no mesmo desenho das telas
// irmãs (ícone num círculo, título, uma frase do porquê e UMA saída).
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EstadoDaLista({ icone: Icone, titulo, texto, acao, tom = "neutro", testid, moldura = true }: {
  icone: LucideIcon;
  titulo: string;
  texto?: ReactNode;
  /** A saída (botão ou link) — opcional. */
  acao?: ReactNode;
  tom?: "neutro" | "marca";
  testid?: string;
  /** Sem a moldura de cartão quando já está dentro de um. */
  moldura?: boolean;
}) {
  return (
    <div
      className={`pas-entra flex flex-col items-center text-center px-6 py-12 ${moldura ? "rounded-xl border border-border bg-card" : ""}`}
      data-testid={testid}
    >
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center w-11 h-11 rounded-full mb-3 ${tom === "marca" ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground"}`}
      >
        <Icone className="w-5 h-5" />
      </span>
      <h3 className="m-0 text-base font-semibold text-foreground">{titulo}</h3>
      {texto && <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">{texto}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

/** Botão secundário das saídas (Limpar filtros, Ir para Lançamento…). */
export const BOTAO_SAIDA =
  "inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
