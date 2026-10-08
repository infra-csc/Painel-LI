/**
 * As três visões do Controle de Bagagem: a lista e os dois relatórios.
 *
 * 08/10 (redesenho): saíram da barra da tela. Lá, ao lado do resumo, do CSV e
 * do "Nova solicitação", elas quebravam a barra de 56px em duas linhas em 1366
 * — e um seletor de três botões com ícone no meio das ações lia como mais
 * ação. Aqui são abas de verdade, com filete na ativa e o total de cada visão
 * ao lado do nome (o que existe, sem recorte), abrindo o conteúdo que trocam.
 *
 * Mesmo comportamento de antes: `role="tablist"`, setas trocam e levam o foco,
 * Tab entra só na ativa, e os mesmos ids e `data-testid`.
 */
import { CalendarDays, ClipboardList, Users } from "lucide-react";
import type { TabId } from "./baggage-core";

export const ABAS: { id: TabId; label: string; curto: string; icon: typeof ClipboardList }[] = [
  { id: "solicitacoes", label: "Solicitações", curto: "Solicitações", icon: ClipboardList },
  { id: "colaboradores", label: "Por colaborador", curto: "Colaborador", icon: Users },
  { id: "eventos", label: "Por evento", curto: "Evento", icon: CalendarDays },
];

export default function BaggageTabs({ ativa, onTrocar, contagens }: {
  ativa: TabId;
  onTrocar: (t: TabId) => void;
  /** Quantos itens cada visão tem (sem recorte); null enquanto carrega. */
  contagens: Record<TabId, number> | null;
}) {
  return (
    <div className="pas-rolagem-x -mx-[var(--page-gutter)] px-[var(--page-gutter)] sm:mx-0 sm:px-0 border-b border-border">
      <div role="tablist" aria-label="Visões do Controle de Bagagem" className="flex items-end gap-1 min-w-max">
        {ABAS.map(t => {
          const Icone = t.icon;
          const on = ativa === t.id;
          const n = contagens?.[t.id];
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onTrocar(t.id)}
              onKeyDown={e => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const idx = ABAS.findIndex(x => x.id === ativa);
                const next = e.key === "ArrowRight"
                  ? (idx + 1) % ABAS.length
                  : (idx - 1 + ABAS.length) % ABAS.length;
                onTrocar(ABAS[next].id);
                document.getElementById(`tab-${ABAS[next].id}`)?.focus();
              }}
              className={`group relative inline-flex items-center gap-1.5 sm:gap-2 h-11 px-2.5 sm:px-3 -mb-px text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring rounded-t-md ${
                on ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`tab-${t.id}`}
            >
              <Icone className={`hidden sm:block w-4 h-4 shrink-0 ${on ? "" : "text-muted-foreground group-hover:text-foreground"}`} aria-hidden="true" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.curto}</span>
              {n != null && (
                <span
                  className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-2xs font-semibold tabular-nums transition-colors ${
                    on ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground"}`}
                >
                  {n}
                </span>
              )}
              {/* Filete da ativa: cresce do centro, a mesma microinteração da fila. */}
              <span
                aria-hidden="true"
                className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none ${on ? "scale-x-100" : "scale-x-0"}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
