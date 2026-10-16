/**
 * Navegação entre as ROTAS da busca (16/10). Largo: coluna à esquerda, uma
 * linha por rota com o trecho, as datas, quem viaja e a situação (menor custo
 * / sem voo / ainda sem preço / buscando / falhou). Estreito: a mesma lista
 * vira abas roláveis no topo (CSS `.bpr-rotas`).
 */
import { useEffect, useRef } from "react";
import { ArrowRight, CircleAlert, Loader2, Plane, Route } from "lucide-react";
import { formatarMoeda, toTitleCase } from "@/lib/format";
import { ordenarOpcoes, type RotaNaTela } from "@shared/busca-de-passagens";
import { ddmm, plural } from "../formato";
import type { VagaDaOpcao } from "../opcao-de-voo";

export type SituacaoDaRota = "carregando" | "erro" | "nao_consultada" | "sem_voo" | "com_preco";

export interface ResumoDaRota { situacao: SituacaoDaRota; menor: number | null; opcoes: number }

/** Situação e menor custo total da rota (data sugerida), pela mesma regra da lista de opções. */
export function resumoDaRota(rota: RotaNaTela, carregando: boolean): ResumoDaRota {
  if (carregando) return { situacao: "carregando", menor: null, opcoes: 0 };
  if (rota.erro) return { situacao: "erro", menor: null, opcoes: 0 };
  if (!rota.resultado) return { situacao: "nao_consultada", menor: null, opcoes: 0 };
  const opcoes = ordenarOpcoes(rota.resultado.itinerarios, rota, { diariaCentavos: rota.diariaCentavos, malaCentavos: rota.malaCentavos });
  if (opcoes.length === 0) return { situacao: "sem_voo", menor: null, opcoes: 0 };
  return { situacao: "com_preco", menor: opcoes[0].custoTotalCentavos, opcoes: opcoes.length };
}

const PERNA: Record<RotaNaTela["perna"], string> = { ida_e_volta: "Ida e volta", ida: "Só ida", volta: "Só volta" };

function Situacao({ r }: { r: ResumoDaRota }) {
  if (r.situacao === "carregando") return <span className="inline-flex items-center gap-1 text-2xs font-medium text-primary"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />buscando</span>;
  if (r.situacao === "erro") return <span className="inline-flex items-center gap-1 text-2xs font-medium text-danger"><CircleAlert className="h-3 w-3" aria-hidden="true" />falhou</span>;
  if (r.situacao === "nao_consultada") return <span className="text-2xs font-medium text-muted-foreground">sem preço ainda</span>;
  if (r.situacao === "sem_voo") return <span className="inline-flex items-center gap-1 text-2xs font-semibold text-warning-strong"><Plane className="h-3 w-3" aria-hidden="true" />sem voo</span>;
  return <span className="text-sm font-semibold tabular-nums text-foreground">{formatarMoeda(r.menor)}</span>;
}

export function NavegacaoDeRotas({ rotas, resumos, escolhida, onEscolher, vagaPorId }: {
  rotas: RotaNaTela[];
  resumos: Map<string, ResumoDaRota>;
  escolhida: string | null;
  onEscolher: (chave: string) => void;
  vagaPorId: Map<string, VagaDaOpcao>;
}) {
  const lista = useRef<HTMLDivElement | null>(null);
  // A rota escolhida fica à vista na faixa rolável (celular) e na coluna.
  // Rola SÓ a faixa/coluna das rotas (scrollIntoView rolaria a página inteira).
  useEffect(() => {
    const caixa = lista.current;
    const el = caixa?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!caixa || !el) return;
    const rolavel = [caixa, caixa.closest<HTMLElement>('[data-area="nav"]')].find((c): c is HTMLElement => !!c && (c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1));
    if (!rolavel) return;
    const r = el.getBoundingClientRect(), c = rolavel.getBoundingClientRect();
    if (r.left < c.left || r.right > c.right) rolavel.scrollLeft += r.left - c.left - 8;
    if (r.top < c.top || r.bottom > c.bottom) rolavel.scrollTop += r.top - c.top - 8;
  }, [escolhida]);
  // ↑/↓ (← → no celular) trocam de rota sem sair do teclado.
  const teclas = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const passo = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!passo || rotas.length < 2) return;
    e.preventDefault();
    const i = Math.max(0, rotas.findIndex((r) => r.chave === escolhida));
    const proxima = rotas[(i + passo + rotas.length) % rotas.length];
    onEscolher(proxima.chave);
    requestAnimationFrame(() => lista.current?.querySelector<HTMLElement>(`[data-testid="nav-rota-${CSS.escape(proxima.chave)}"]`)?.focus());
  };
  const semVoo = rotas.filter((r) => resumos.get(r.chave)?.situacao === "sem_voo").length;
  return (
    <nav aria-label="Rotas da busca" className="bpr-nav" data-testid="rotas-da-busca">
      <p className="bpr-nav-titulo m-0 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {plural(rotas.length, "rota", "rotas")}{semVoo ? <span className="normal-case tracking-normal text-warning-strong"> · {semVoo} sem voo</span> : null}
      </p>
      <div ref={lista} className="bpr-rotas" onKeyDown={teclas} aria-describedby="bpr-nav-dica">
        <span id="bpr-nav-dica" className="sr-only">Use as setas para trocar de rota.</span>
        {rotas.map((r, i) => {
          const res = resumos.get(r.chave) ?? { situacao: "nao_consultada" as const, menor: null, opcoes: 0 };
          const on = r.chave === escolhida;
          const pessoas = r.vagas.map((v) => vagaPorId.get(v.vagaId)).filter((v): v is VagaDaOpcao => !!v);
          return (
            <button
              key={r.chave}
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => onEscolher(r.chave)}
              className="bpr-rota pas-bp-chega"
              data-situacao={res.situacao}
              style={{ ["--i" as string]: Math.min(i, 8) }}
              data-testid={`nav-rota-${r.chave}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {r.origem}<ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /><span className="sr-only"> para </span>{r.destino}
                </span>
                <Situacao r={res} />
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2 text-2xs leading-4 text-muted-foreground">
                <span className="truncate tabular-nums">{ddmm(r.dataIda)}{r.dataVolta ? ` → ${ddmm(r.dataVolta)}` : ""} · {r.trechoDireto ? <span className="inline-flex items-center gap-0.5 font-medium text-primary"><Route className="h-3 w-3" aria-hidden="true" />direto</span> : PERNA[r.perna]}</span>
                {res.situacao === "com_preco" && <span className="bpr-nav-extra shrink-0 tabular-nums">{plural(res.opcoes, "opção", "opções")}</span>}
              </span>
              <span className="bpr-nav-extra mt-1 truncate text-2xs leading-4 text-slate-600">
                {pessoas.slice(0, 2).map((p) => `#${p.numero ?? "?"} ${toTitleCase(p.nome).split(" ")[0]}`).join(", ")}
                {pessoas.length > 2 ? ` +${pessoas.length - 2}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
