/**
 * Lista da aba Buscar (09/10): uma linha por ESCALAÇÃO que precisa de passagem
 * aérea, dizendo o que a busca vai usar — quem, para onde, de onde, quando e
 * em qual horário — e o que falta. Clicar na linha seleciona (é o que se faz
 * aqui); a caixa à esquerda é o mesmo gesto, com alvo de 40px.
 *
 * Largo: grade de 6 colunas com cabeçalho grudado. Estreito: a MESMA linha
 * vira cartão por CSS (`.pas-bp-linha`, áreas da grade) — nada é duplicado.
 */
import { memo } from "react";
import { ArrowRight, CheckCircle2, Route, PlaneTakeoff, PlaneLanding, CircleDot } from "lucide-react";
import { formatarMoeda, toTitleCase } from "@/lib/format";
import { faixaDeHorario, faixaEmTexto, type AjusteDaBusca } from "@shared/busca-de-passagens";
import { aeroportosDaCidade } from "@shared/aeroportos-do-brasil";
import { cidadeDoEvento } from "@shared/janela-de-viagem";
import type { LinhaDaBusca } from "./linhas-da-busca";
import { PilulaDeFalta } from "./corrigir-falta";
import { diaCurto } from "./formato";

const PILULA = "inline-flex items-center gap-1 h-[22px] px-[7px] rounded-md text-2xs font-medium whitespace-nowrap";
const TRECHO: Record<LinhaDaBusca["trecho"], string> = {
  ida_e_volta: "Ida e volta",
  so_ida: "Só ida",
  so_volta: "Só volta",
  direto: "Trecho direto",
};

/** Origem → destino que a busca vai usar (ou o que falta para saber). */
function Viagem({ l }: { l: LinhaDaBusca }) {
  const ida = l.rotas.find((x) => x.perna !== "volta");
  const volta = l.rotas.find((x) => x.perna === "volta");
  const casa = l.ajuste.aeroportoDeCasa ?? aeroportosDaCidade(l.cidadeDeSaida)[0] ?? null;
  const origem = ida ? ida.origem : volta ? volta.destino : casa;
  const destino = ida ? ida.destino : volta ? volta.origem : l.evento?.aeroportoIata ?? null;
  const Codigo = ({ c, falta }: { c: string | null; falta: string }) =>
    c ? <span className="font-mono font-semibold tabular-nums text-foreground">{c}</span> : <span className="text-warning-strong">{falta}</span>;
  return (
    <div className="min-w-0">
      <p className="m-0 truncate text-sm font-medium leading-5 text-foreground" title={l.evento?.location ?? undefined}>{l.evento?.name ?? "Evento"}</p>
      <p className="m-0 mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs leading-5 text-muted-foreground">
        <span className="inline-flex shrink-0 items-center gap-1">
          <Codigo c={l.trecho === "direto" && ida ? ida.origem : origem} falta={l.cidadeDeSaida ? "saída?" : "sem cidade"} />
          <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <Codigo c={destino} falta={"aeroporto?"} />
        </span>
        <span aria-hidden="true">·</span>
        {l.trecho === "direto" ? (
          <span className="inline-flex items-center gap-1 font-medium text-primary"><Route className="h-3 w-3 shrink-0" aria-hidden="true" />trecho direto{volta ? ` · volta ${volta.destino}` : ""}</span>
        ) : <span>{TRECHO[l.trecho]}</span>}
        <span className="min-w-0 truncate">· {l.trecho === "direto" ? l.cidadeDoEvento : `de ${cidadeDoEvento(l.cidadeDeSaida) || "—"}`}</span>
      </p>
    </div>
  );
}

function Datas({ l }: { l: LinhaDaBusca }) {
  const chegada = faixaEmTexto(faixaDeHorario(l.chegarAte, "chegar_ate")).replace("a partir de ", "após ");
  const saida = faixaEmTexto(faixaDeHorario(l.sairApos, "sair_apos")).replace("a partir de ", "após ");
  const Linha = ({ ida, dia, faixa }: { ida: boolean; dia: string | null; faixa: string }) => {
    const Icone = ida ? PlaneTakeoff : PlaneLanding;
    return (
      <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
        <Icone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{ida ? "Ida" : "Volta"}</span>
        <span className={`tabular-nums ${dia ? "font-medium text-foreground" : "text-muted-foreground"}`}>{dia ? diaCurto(dia) : "sem data"}</span>
        {faixa && <span className="min-w-0 truncate text-muted-foreground">· {ida ? "chegar" : "sair"} {faixa}</span>}
      </span>
    );
  };
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs leading-5">
      {l.trecho !== "so_volta" && <Linha ida dia={l.dataIda} faixa={chegada} />}
      {l.trecho !== "so_ida" && (l.trecho !== "direto" || l.dataVolta) && <Linha ida={false} dia={l.dataVolta} faixa={saida} />}
    </div>
  );
}

export const LinhaDeEscalacao = memo(function LinhaDeEscalacao({ l, selecionada, onAlternar, onAjustar, podeCorrigir, indice }: {
  l: LinhaDaBusca;
  selecionada: boolean;
  onAlternar: (id: string) => void;
  onAjustar: (vagaId: string, patch: Partial<AjusteDaBusca>) => void;
  podeCorrigir: boolean;
  indice: number;
}) {
  const id = l.vaga.id;
  const pronta = l.faltas.length === 0;
  const evento = l.evento;
  return (
    <li
      role="row"
      aria-selected={selecionada}
      onClick={() => onAlternar(id)}
      className={`pas-bp-linha cursor-pointer border-b border-border px-3 py-3 last:border-0 lg:items-center lg:py-2.5 ${selecionada ? "" : indice % 2 === 1 ? "bg-surface-muted/50 hover:bg-brand-soft/40" : "bg-card hover:bg-brand-soft/40"}`}
      data-testid={`linha-busca-${id}`}
    >
      <div data-area="sel" role="gridcell" className="flex items-start lg:items-center" onClick={(e) => e.stopPropagation()}>
        <label className="flex h-10 w-10 -m-2 items-center justify-center cursor-pointer">
          <input
            type="checkbox"
            checked={selecionada}
            onChange={() => onAlternar(id)}
            aria-label={`Selecionar a escalação #${l.vaga.inclusionNumber ?? ""} de ${toTitleCase(l.colaborador)}`}
            className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-primary"
            data-testid={`selecionar-${id}`}
          />
        </label>
      </div>

      <div data-area="quem" role="gridcell" className="min-w-0">
        <p className="m-0 flex items-start gap-2 min-w-0">
          <span className={`${PILULA} shrink-0 bg-brand-soft font-mono tabular-nums text-primary`}>#{l.vaga.inclusionNumber ?? "—"}</span>
          <span className="min-w-0 text-sm font-medium leading-5 text-foreground">{toTitleCase(l.colaborador)}</span>
        </p>
        <p className="m-0 mt-0.5 truncate text-2xs leading-4 text-muted-foreground">{l.funcao}</p>
      </div>

      <div data-area="via" role="gridcell" className="min-w-0"><Viagem l={l} /></div>
      <div data-area="data" role="gridcell" className="min-w-0"><Datas l={l} /></div>

      <div data-area="situ" role="gridcell" className="flex min-w-0 flex-wrap items-center gap-1 sm:max-lg:justify-end">
        {l.comprada ? (
          <span className={`${PILULA} bg-success-soft text-success`} title="Já tem passagem registrada — a busca compara com o preço de hoje">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Comprada{l.valorPagoCentavos ? ` · ${formatarMoeda(l.valorPagoCentavos)}` : ""}
          </span>
        ) : pronta ? (
          <span className={`${PILULA} bg-muted text-slate-600`}>
            <CircleDot className="h-3 w-3 text-primary" aria-hidden="true" />Pronta para buscar
          </span>
        ) : null}
        {l.faltas.map((f, i) => (
          <PilulaDeFalta key={`${f.tipo}-${i}`} falta={f} nomeDoEvento={f.eventId ? (f.eventId === evento?.id ? evento?.name : undefined) : undefined} ajuste={l.ajuste} onAjustar={(p) => onAjustar(id, p)} podeCorrigir={podeCorrigir} />
        ))}
      </div>
    </li>
  );
});

export function CabecaDaLista({ todasMarcadas, algumaMarcada, onTodas, n }: { todasMarcadas: boolean; algumaMarcada: boolean; onTodas: () => void; n: number }) {
  return (
    <div role="row" className="pas-bp-cabeca items-center px-3 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      <div role="columnheader" className="flex items-center">
        <label className="flex h-10 w-10 -m-2 items-center justify-center cursor-pointer">
          <input
            type="checkbox"
            checked={todasMarcadas}
            ref={(el) => { if (el) el.indeterminate = algumaMarcada && !todasMarcadas; }}
            onChange={onTodas}
            disabled={n === 0}
            aria-label={todasMarcadas ? "Desmarcar todas" : "Selecionar todas as escalações da lista"}
            className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-primary"
            data-testid="selecionar-todas"
          />
        </label>
      </div>
      <div role="columnheader">Escalação</div>
      <div role="columnheader">Evento e rota da busca</div>
      <div role="columnheader">Datas e horários sugeridos</div>
      <div role="columnheader">Situação</div>
    </div>
  );
}
