/**
 * Barra de filtros dos Colaboradores (25/09 — extraída da página; 07/10 —
 * redesenho na família Passagens/Hospedagem).
 *
 * Busca (a peça comum `BuscaDaLista`: Esc apaga, "limpar" próprio) e o tipo
 * de vínculo como seletor segmentado à vista — são só quatro opções, e cada
 * uma diz quantos a lista vai mostrar. A situação (status) mora na faixa logo
 * acima, que conta e filtra ao mesmo tempo. À direita, o recorte ("12 de 60")
 * e o "Limpar filtros" quando há algo ligado.
 */
import { BuscaDaLista, LimparFiltros } from "@/components/common/barra-de-filtros";
import { cn } from "@/lib/utils";
import type { CollaboratorsList } from "./use-collaborators-list";

const TIPOS = [
  { id: "all", nome: "Todos" },
  { id: "freela", nome: "Freela" },
  { id: "casa", nome: "Casa" },
  { id: "local", nome: "Local" },
];

export function CollaboratorsFilterBar({ lista, podeVerDadosPessoais }: { lista: CollaboratorsList; podeVerDadosPessoais: boolean }) {
  const { filters, setFilter, clearFilters, hasFilters, filtered, collaborators, porTipo } = lista;
  const total = collaborators?.length ?? 0;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2.5 sm:gap-y-2">
      <BuscaDaLista
        valor={filters.search}
        onChange={(v) => setFilter("search", v)}
        rotulo={podeVerDadosPessoais ? "Buscar por nome ou documento" : "Buscar por nome"}
        placeholder={podeVerDadosPessoais ? "Nome, CPF ou RG" : "Nome do colaborador"}
        testid="col-busca"
      />

      {/* Tipo de vínculo: segmentado, rola de lado no celular se faltar largura. */}
      <div className="pas-rolagem-x -mx-[var(--page-gutter)] px-[var(--page-gutter)] sm:mx-0 sm:px-0">
        <div
          role="radiogroup"
          aria-label="Tipo de vínculo"
          className="inline-flex items-center h-[34px] p-[3px] gap-0.5 rounded-lg border border-border bg-card"
          data-testid="col-tipo"
          // Grupo de rádio de verdade: uma parada de Tab e as setas trocam a opção.
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
            e.preventDefault();
            const i = Math.max(0, TIPOS.findIndex((t) => t.id === filters.type));
            const passo = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
            const prox = TIPOS[(i + passo + TIPOS.length) % TIPOS.length];
            setFilter("type", prox.id);
            (e.currentTarget.querySelector(`[data-testid="col-tipo-${prox.id}"]`) as HTMLButtonElement | null)?.focus();
          }}
        >
          {TIPOS.map((t) => {
            const marcado = filters.type === t.id || (t.id === "all" && !TIPOS.some((x) => x.id === filters.type));
            const n = porTipo[t.id] ?? 0;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={marcado}
                tabIndex={marcado ? 0 : -1}
                onClick={() => setFilter("type", t.id)}
                className={cn(
                  "col-segmento pas-alvo inline-flex items-center gap-1.5 h-full px-2.5 rounded-md text-sm whitespace-nowrap transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  marcado ? "bg-brand-soft text-primary font-medium" : "text-slate-600 hover:bg-muted hover:text-foreground",
                )}
                data-testid={`col-tipo-${t.id}`}
              >
                {t.nome}
                <span className={cn("text-2xs tabular-nums", marcado ? "text-primary/80" : "text-muted-foreground", n === 0 && !marcado && "opacity-60")}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {hasFilters && (
        <div className="pas-entra flex items-center gap-2 sm:ml-auto">
          <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite" data-testid="col-recorte">
            <span className="font-semibold text-foreground">{filtered.length}</span> de {total}
          </span>
          <LimparFiltros onClick={clearFilters} testid="col-limpar" />
        </div>
      )}
    </div>
  );
}
