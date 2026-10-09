/**
 * Barra de SELEÇÃO da aba Buscar (09/10) — grudada no rodapé, como a de
 * Passagens. Diz ANTES de gastar o que a busca vai fazer: "3 rotas · 1 já em
 * cache · gasta 2 consultas" (prévia de graça, recalculada a cada seleção ou
 * ajuste) e trava o botão no teto do mês e durante a busca (sem clique duplo).
 */
import { Layers, Loader2, Search, X } from "lucide-react";
import type { RespostaDaBusca } from "@shared/busca-de-passagens";
import type { ErroDaBusca } from "./use-busca-de-passagens";
import { plural } from "./formato";

export function BarraDeSelecao({ nSel, resposta, previaCarregando, erro, buscando, painelAberto, bloqueadoPeloTeto, naoConfigurada, compradas, onLimpar, onVerPainel, onBuscar }: {
  nSel: number;
  resposta: RespostaDaBusca | null;
  previaCarregando: boolean;
  erro: ErroDaBusca | null;
  buscando: boolean;
  painelAberto: boolean;
  bloqueadoPeloTeto: boolean;
  naoConfigurada: boolean;
  /** Quantas das selecionadas já têm passagem (comparação com o pago). */
  compradas: number;
  onLimpar: () => void;
  onVerPainel: () => void;
  onBuscar: () => void;
}) {
  if (nSel === 0) return null;
  const rotas = resposta?.rotas ?? [];
  const semPreco = rotas.filter((r) => !r.resultado).length;
  const emCache = rotas.length - semPreco;
  const faltando = new Set((resposta?.faltando ?? []).map((f) => f.vagaId)).size;
  const desabilitado = buscando || rotas.length === 0 || bloqueadoPeloTeto || (naoConfigurada && semPreco > 0);
  return (
    <div className="pas-sobe sticky bottom-3 z-20" data-testid="barra-busca">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-foreground py-2 pl-4 pr-2 text-background shadow-3">
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="flex flex-wrap items-center gap-x-2">
            <p className="m-0 text-sm font-semibold tabular-nums">{plural(nSel, "escalação selecionada", "escalações selecionadas")}</p>
            <button type="button" onClick={onLimpar} className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-background/75 hover:bg-background/10 hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60" data-testid="limpar-selecao-busca">
              <X className="h-3.5 w-3.5" aria-hidden="true" />Limpar
            </button>
          </div>
          <p className="m-0 text-xs leading-5 text-background/70" aria-live="polite" data-testid="previa-consumo">
            {previaCarregando && !resposta ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />calculando as rotas…</span>
            ) : resposta ? (
              <span key={`${rotas.length}-${semPreco}`} className="pas-bp-pulso">
                {plural(rotas.length, "rota", "rotas")}
                {emCache > 0 ? ` · ${emCache} já em cache` : ""}
                {" · "}
                <strong className="font-semibold text-background">{semPreco === 0 ? (rotas.length ? "não gasta consulta" : "nada a consultar") : `gasta ${plural(semPreco, "consulta", "consultas")}`}</strong>
                {faltando > 0 ? ` · ${plural(faltando, "escalação com dado faltando fica de fora", "escalações com dado faltando ficam de fora")}` : ""}
                {compradas > 0 ? ` · ${plural(compradas, "comprada (compara com o pago)", "compradas (compara com o pago)")}` : ""}
              </span>
            ) : erro ? erro.mensagem : null}
          </p>
          {bloqueadoPeloTeto && !buscando && (
            <p className="m-0 text-xs font-semibold leading-5 text-background" role="alert">O teto de consultas do mês não comporta esta busca.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {rotas.some((r) => r.resultado) && !painelAberto && semPreco > 0 && (
            <button type="button" onClick={onVerPainel} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-background/25 px-3 text-xs font-semibold text-background hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60">
              <Layers className="h-4 w-4" aria-hidden="true" />Ver o que já tem preço
            </button>
          )}
          <button
            type="button"
            onClick={onBuscar}
            disabled={desabilitado}
            className="pas-alvo inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
            data-testid="buscar-precos"
          >
            {buscando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            {buscando ? "Buscando…" : semPreco === 0 && rotas.length > 0 ? "Ver preços" : `Buscar preços${rotas.length ? ` (${plural(rotas.length, "rota", "rotas")})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
