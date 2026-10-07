/**
 * Lista | Análises na barra de Passagens (07/10) — SÓ ADMIN.
 *
 * Mesmo seletor da Escalação (Fila | Escala | Análises). Para qualquer outro
 * papel o componente não existe: a tela de Passagens fica exatamente como
 * era. A rota GET /api/tickets/analises também recusa os outros papéis.
 */
import { List, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isAdmin } from "@/lib/role-utils";
import { visaoNaUrl, type VisaoDaAnalise } from "./url-da-analise";

export type AbaDePassagens = "lista" | "analises";

const ABAS = [
  ["lista", "Lista", List],
  ["analises", "Análises", TrendingUp],
] as const;

/** `?aba=analises` → "analises"; qualquer outra coisa → "lista". */
export function abaDaUrl(search: string): AbaDePassagens {
  return new URLSearchParams(search).get("aba") === "analises" ? "analises" : "lista";
}

/**
 * Acrescenta `aba=analises` — e a visão da análise (`an_*`) — à query dos
 * filtros da Lista. Na Lista (o padrão) a query fica só com os filtros dela.
 */
export function comAba(qs: string, aba: AbaDePassagens, visao?: VisaoDaAnalise): string {
  if (aba !== "analises") return qs;
  const p = new URLSearchParams(qs);
  p.set("aba", "analises");
  if (visao) visaoNaUrl(p, visao);
  return p.toString();
}

export function AbasDePassagens({ aba, onAba, className }: { aba: AbaDePassagens; onAba: (aba: AbaDePassagens) => void; className?: string }) {
  const { user } = useAuth();
  if (!isAdmin(user)) return null;
  return (
    <div role="tablist" aria-label="Modo da tela" className={`inline-flex shrink-0 gap-0.5 rounded-lg border border-border bg-background p-[3px] ${className ?? ""}`} data-testid="abas-passagens">
      {ABAS.map(([k, rotulo, Icone]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={aba === k}
          onClick={() => onAba(k)}
          data-testid={`aba-passagens-${k}`}
          className={`pas-alvo inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-[11px] text-sm transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            aba === k ? "bg-card font-semibold text-primary shadow-1 ring-1 ring-border" : "font-medium text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icone className="h-[15px] w-[15px]" aria-hidden="true" />
          {rotulo}
        </button>
      ))}
    </div>
  );
}
