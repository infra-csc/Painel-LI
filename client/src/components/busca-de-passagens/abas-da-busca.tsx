/**
 * Abas da tela Busca de passagens (09/10). REGRA ÚNICA de quem vê o quê:
 * Compras vê só "Buscar"; as abas de análise e o Consumo são do admin — a
 * mesma decisão da aba Análises de Passagens ("só aparecer para admin").
 * Para liberar uma aba a Compras depois, é mexer em `ABAS_POR_PAPEL` e nas
 * rotas de leitura correspondentes — em nenhum outro lugar.
 */
import { BarChart3, CalendarClock, Gauge, Scale, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isAdmin } from "@/lib/role-utils";
import type { User } from "@shared/schema";
import type { AbaDaBusca } from "./filtros-da-busca";

export const ROTULO_DA_ABA: Record<AbaDaBusca, { rotulo: string; curto: string; icone: LucideIcon }> = {
  buscar: { rotulo: "Buscar", curto: "Buscar", icone: Search },
  "preco-por-rota": { rotulo: "Preço por rota", curto: "Rotas", icone: BarChart3 },
  "pago-x-encontrado": { rotulo: "Pago × encontrado", curto: "Pago", icone: Scale },
  "melhor-momento": { rotulo: "Melhor momento", curto: "Momento", icone: CalendarClock },
  consumo: { rotulo: "Consumo", curto: "Consumo", icone: Gauge },
};

const ABAS_POR_PAPEL = {
  admin: ["buscar", "preco-por-rota", "pago-x-encontrado", "melhor-momento", "consumo"] as AbaDaBusca[],
  purchasing: ["buscar"] as AbaDaBusca[],
};

export function abasVisiveis(user: User | null): AbaDaBusca[] {
  return isAdmin(user) ? ABAS_POR_PAPEL.admin : ABAS_POR_PAPEL.purchasing;
}

export function AbasDaBusca({ abas, aba, onAba, className }: { abas: AbaDaBusca[]; aba: AbaDaBusca; onAba: (a: AbaDaBusca) => void; className?: string }) {
  if (abas.length <= 1) return null;
  return (
    <div role="tablist" aria-label="Abas da busca de passagens" className={`pas-rolagem-x inline-flex max-w-full shrink-0 gap-0.5 rounded-lg border border-border bg-background p-[3px] ${className ?? ""}`} data-testid="abas-busca">
      {abas.map((k) => {
        const { rotulo, curto, icone: Icone } = ROTULO_DA_ABA[k];
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={aba === k}
            onClick={() => onAba(k)}
            data-testid={`aba-busca-${k}`}
            title={rotulo}
            className={`pas-alvo inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-[10px] text-sm transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              aba === k ? "bg-card font-semibold text-primary shadow-1 ring-1 ring-border" : "font-medium text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icone className="h-[15px] w-[15px]" aria-hidden="true" />
            <span className="2xl:hidden">{curto}</span><span className="hidden 2xl:inline">{rotulo}</span>
          </button>
        );
      })}
    </div>
  );
}
