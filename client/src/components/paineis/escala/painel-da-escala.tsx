/**
 * Painel da escala (Painéis, 30/10) — a tela inteira, menos a casca da página.
 *
 * Números do topo (sempre visíveis, levam à aba) + três abas: Atrasos,
 * Aprovações e Comparar. A aba e os eventos comparados ficam na URL
 * (`?aba=comparar&eventos=a,b`) para o link copiado abrir o mesmo recorte.
 */
import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { CloudOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AcaoDoEstado, EstadoVazio } from "@/components/scaling/scaling-page/estados-da-pagina";
import { Skeleton } from "@/components/ui/skeleton";
import { atrasosPorEvento, esperasPorEvento, plural } from "./painel-escala-dados";
import { AtrasosPorEvento } from "./atrasos-por-evento";
import { AguardandoDecisao } from "./aguardando-decisao";
import { CompararEventos, MAX_EVENTOS } from "./comparar-eventos";
import { NumeroDoTopo, Segmentos } from "./comum-escala";
import type { PainelEscala } from "./use-painel-escala";
import { CHAVE_SUGESTOES } from "./use-painel-escala";

export type AbaDoPainel = "atrasos" | "aprovacoes" | "comparar";
export const ABAS: readonly (readonly [AbaDoPainel, string])[] = [["atrasos", "Atrasos"], ["aprovacoes", "Aprovações"], ["comparar", "Comparar"]] as const;

/** Lê/grava a aba e os eventos comparados na URL (substituindo, sem empilhar histórico). */
export function useEstadoNaUrl() {
  const busca = useSearch();
  const [caminho, navegar] = useLocation();
  const p = new URLSearchParams(busca);
  const abaCrua = p.get("aba");
  const aba: AbaDoPainel = abaCrua === "aprovacoes" || abaCrua === "comparar" ? abaCrua : "atrasos";
  const eventos = (p.get("eventos") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_EVENTOS);
  const escrever = (mudar: (q: URLSearchParams) => void) => {
    const q = new URLSearchParams(busca);
    mudar(q);
    // Vírgula legível no link ("eventos=a,b"): o URLSearchParams a codificaria.
    const s = q.toString().replace(/%2C/gi, ",");
    navegar(s ? `${caminho}?${s}` : caminho, { replace: true });
  };
  return {
    aba,
    eventos,
    setAba: (a: AbaDoPainel) => escrever((q) => { if (a === "atrasos") q.delete("aba"); else q.set("aba", a); }),
    setEventos: (ids: string[]) => escrever((q) => { if (ids.length) q.set("eventos", ids.join(",")); else q.delete("eventos"); }),
  };
}

export function SeletorDeAba({ aba, onAba }: { aba: AbaDoPainel; onAba: (a: AbaDoPainel) => void }) {
  return <Segmentos rotulo="Painel" valor={aba} onChange={onAba} opcoes={ABAS} testId="aba-painel" />;
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando o painel" data-testid="painel-carregando">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-muted sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-card px-4 py-3.5"><Skeleton className="h-3 w-24" /><Skeleton className="mt-2.5 h-6 w-12" /><Skeleton className="mt-2 h-3 w-28" /></div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="mb-3 h-12 w-full" />)}
      </div>
    </div>
  );
}

export function PainelDaEscala({ p, aba, onAba, eventos, onEventos }: {
  p: PainelEscala; aba: AbaDoPainel; onAba: (a: AbaDoPainel) => void; eventos: string[]; onEventos: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const atrasos = useMemo(() => atrasosPorEvento(p.eventos, p.ctx, p.hoje, p.dias), [p.eventos, p.ctx, p.hoje, p.dias]);
  const esperas = useMemo(() => esperasPorEvento(p.eventos, p.ctx, p.hoje, p.dias), [p.eventos, p.ctx, p.hoje, p.dias]);

  if (p.erro) {
    return (
      <EstadoVazio
        tom="erro"
        testId="painel-erro"
        icone={<CloudOff className="h-5 w-5" aria-hidden="true" />}
        titulo="Não foi possível carregar a escala"
        texto="As vagas não chegaram do servidor. Tente de novo em instantes."
        acao={(
          <AcaoDoEstado onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
            void queryClient.invalidateQueries({ queryKey: CHAVE_SUGESTOES });
          }} testId="button-tentar-de-novo">
            Tentar de novo
          </AcaoDoEstado>
        )}
      />
    );
  }
  if (p.carregando) return <Esqueleto />;

  const vagasAtrasadas = atrasos.reduce((s, l) => s + l.vagasAtrasadas, 0);
  const vagasVencendo = atrasos.reduce((s, l) => s + l.vagasVencendo, 0);
  const eventosComAtraso = atrasos.filter((l) => l.vagasAtrasadas > 0).length;
  const esperasAtrasadas = esperas.flatMap((e) => e.grupos).filter((g) => g.atrasado);
  const vagasEsperandoAtrasadas = esperasAtrasadas.reduce((s, g) => s + g.vagas.length, 0);
  const pior = atrasos[0];
  const futuros = p.eventos.filter((e) => !e.jaTerminou).length;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="painel-escala">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-muted sm:grid-cols-4">
        <NumeroDoTopo
          rotulo="Eventos com atraso"
          valor={String(eventosComAtraso)}
          sub={`de ${futuros} ${plural(futuros, "evento futuro", "eventos futuros")}`}
          tom={eventosComAtraso > 0 ? "perigo" : "ok"}
          onClick={() => onAba("atrasos")}
          testId="topo-eventos-atraso"
        />
        <NumeroDoTopo
          rotulo="Vagas atrasadas"
          valor={String(vagasAtrasadas)}
          sub={vagasVencendo > 0 ? `+ ${vagasVencendo} vencem em até 3 dias` : "nenhuma vencendo nos próximos 3 dias"}
          tom={vagasAtrasadas > 0 ? "perigo" : vagasVencendo > 0 ? "alerta" : "ok"}
          onClick={() => onAba("atrasos")}
          testId="topo-vagas-atrasadas"
        />
        <NumeroDoTopo
          rotulo="Decisões atrasadas"
          valor={String(vagasEsperandoAtrasadas)}
          sub={vagasEsperandoAtrasadas > 0 ? "vagas esperando 3+ dias ou com prazo vencido" : "nada esperando além da conta"}
          tom={vagasEsperandoAtrasadas > 0 ? "perigo" : "ok"}
          onClick={() => onAba("aprovacoes")}
          testId="topo-decisoes"
        />
        <NumeroDoTopo
          rotulo="Pior atraso"
          valor={pior?.piorAtraso != null ? `${pior.piorAtraso} ${plural(pior.piorAtraso, "dia", "dias")}` : "—"}
          sub={pior?.piorAtraso != null ? pior.evento.nome : "nenhum prazo vencido"}
          tom={pior?.piorAtraso != null ? "perigo" : "ok"}
          onClick={() => onAba("atrasos")}
          testId="topo-pior-atraso"
        />
      </div>

      {aba === "atrasos" && <AtrasosPorEvento linhas={atrasos} ctx={p.ctx} hoje={p.hoje} dias={p.dias} />}
      {aba === "aprovacoes" && <AguardandoDecisao esperas={esperas} />}
      {aba === "comparar" && (
        <CompararEventos
          selecionados={eventos}
          onSelecionados={onEventos}
          eventos={p.eventos}
          events={p.events}
          linhas={p.todas}
          ctx={p.ctxComparacao}
          podeVerValores={p.podeVerValores}
          hoje={p.hoje}
        />
      )}
    </div>
  );
}
