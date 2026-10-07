/**
 * Filtros da aba Análises — os mesmos popovers da Lista (filter-popover),
 * com o número de passagens que cada opção deixa. Período pela data de
 * INÍCIO do evento (padrão: últimos 3 meses e os próximos).
 */
import { Loader2, X } from "lucide-react";
import { FiltroDeLista, FiltroUnico } from "@/components/common/filter-popover";
import type { AnaliseDePassagens } from "@shared/analise-de-passagens";
import { FILTROS_PADRAO, PRESETS_DO_PERIODO, temRecorte, type FiltrosDaAba } from "./use-analises-de-passagens";

const CAMPO_DATA =
  "h-[34px] w-full rounded-lg border border-border bg-card px-2.5 text-sm text-foreground tabular-nums transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12";

export function FiltrosDaAnalise({ filtros, onChange, opcoes, atualizando }: {
  filtros: FiltrosDaAba;
  onChange: (f: FiltrosDaAba) => void;
  opcoes?: AnaliseDePassagens["opcoes"];
  atualizando: boolean;
}) {
  const set = (patch: Partial<FiltrosDaAba>) => onChange({ ...filtros, ...patch });
  const datasInvertidas = filtros.preset === "custom" && !!filtros.de && !!filtros.ate && filtros.de > filtros.ate;
  const transportes = [{ id: "all", nome: "Todo transporte" }, ...(opcoes?.transportes ?? []).map((t) => ({ id: t.id, nome: t.nome }))];
  const contagemTransporte = new Map((opcoes?.transportes ?? []).map((t) => [t.id, t.n]));

  return (
    <div className="flex flex-col gap-2" data-testid="filtros-analise">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="col-span-2 sm:w-[264px]">
          <FiltroDeLista
            valor={filtros.preset}
            onChange={(v) => set({ preset: v as FiltrosDaAba["preset"] })}
            opcoes={PRESETS_DO_PERIODO}
            testid="analise-periodo"
            larguraPopover={252}
          />
        </div>
        {filtros.preset === "custom" && (
          <div className="col-span-2 grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="shrink-0">De</span>
              <input type="date" value={filtros.de} onChange={(e) => set({ de: e.target.value })} className={`${CAMPO_DATA} sm:w-[148px]`} aria-invalid={datasInvertidas || undefined} data-testid="analise-de" />
            </label>
            <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="shrink-0">até</span>
              <input type="date" value={filtros.ate} onChange={(e) => set({ ate: e.target.value })} className={`${CAMPO_DATA} sm:w-[148px]`} aria-invalid={datasInvertidas || undefined} data-testid="analise-ate" />
            </label>
          </div>
        )}
        <div className="col-span-2 sm:w-[260px]">
          <FiltroUnico
            valor={filtros.eventId}
            onChange={(v) => set({ eventId: v })}
            opcoes={opcoes?.eventos ?? []}
            rotuloTodos="Todos os eventos"
            placeholderBusca="Buscar evento…"
            testid="analise-evento"
          />
        </div>
        <div className="sm:w-[176px]">
          <FiltroUnico
            valor={filtros.companhia}
            onChange={(v) => set({ companhia: v })}
            opcoes={opcoes?.companhias ?? []}
            rotuloTodos="Todas as cias."
            placeholderBusca="Buscar companhia…"
            testid="analise-companhia"
            larguraPopover={260}
          />
        </div>
        <div className="sm:w-[176px]">
          <FiltroDeLista
            valor={filtros.transporte}
            onChange={(v) => set({ transporte: v })}
            opcoes={transportes}
            contagens={contagemTransporte}
            testid="analise-transporte"
            larguraPopover={220}
          />
        </div>
        {temRecorte(filtros) && (
          <button
            type="button"
            onClick={() => onChange(FILTROS_PADRAO)}
            className="col-span-2 inline-flex h-[34px] items-center justify-center gap-1 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-1"
            data-testid="analise-limpar"
          >
            <X className="h-4 w-4" aria-hidden="true" />Limpar
          </button>
        )}
        <p className="col-span-2 m-0 flex items-center gap-1.5 text-2xs text-muted-foreground sm:ml-auto" aria-live="polite">
          {atualizando && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {atualizando ? "Atualizando…" : "Período pela data de início do evento"}
        </p>
      </div>
      {datasInvertidas && (
        <p role="alert" className="m-0 text-xs text-danger">A data inicial está depois da final — ajuste o período.</p>
      )}
    </div>
  );
}
