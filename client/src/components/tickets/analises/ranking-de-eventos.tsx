/**
 * "Qual evento gastamos mais, e menos?" (pergunta do dono, 07/10).
 *
 * Total e por pessoa: evento grande gasta mais no total, então o "por
 * pessoa" é o que compara eventos de tamanhos diferentes. Clicar no evento
 * leva à Lista de Passagens já filtrada por ele.
 *
 * Evento só com passagens sem valor não entra no ranking (apareceria como
 * "o que menos gastou", com R$ 0) — o rodapé diz quantos ficaram de fora.
 */
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { EventoDaAnalise } from "@shared/analise-de-passagens";
import { cn } from "@/lib/utils";
import { dataCurta, largura, moeda, plural } from "./formato";
import { Barra, Painel, Segmentado } from "./partes";
import type { OrdemDosEventos } from "./url-da-analise";

/** Até isto, a lista inteira cabe; acima, "mais" e "menos" com 5 de cada. */
const CABE_INTEIRA = 8;
const POR_PONTA = 5;

type Modo = OrdemDosEventos;

function LinhaDoEvento({ e, modo, maior, ponta, onVer }: {
  e: EventoDaAnalise; modo: Modo; maior: number; ponta: "mais" | "menos" | null; onVer: (id: string) => void;
}) {
  const valor = modo === "total" ? e.gasto : e.porPessoa;
  return (
    <li>
      <button
        type="button"
        onClick={() => onVer(e.eventId)}
        className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-muted focus-visible:bg-brand-soft focus-visible:outline-none"
        data-testid={`evento-${e.eventId}`}
        title={`Ver as passagens de ${e.nome} na lista`}
      >
        <span className="min-w-0">
          <span className="flex items-start gap-1.5 sm:items-center">
            {ponta && (
              <span
                aria-hidden="true"
                className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full sm:mt-0", ponta === "mais" ? "bg-danger-strong" : "bg-success-strong")}
              />
            )}
            <span className="line-clamp-2 min-w-0 text-[13px] font-medium text-foreground group-hover:text-primary sm:line-clamp-1">{e.nome}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-primary opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" aria-hidden="true" />
          </span>
          <span className="mt-0.5 block text-2xs text-muted-foreground sm:truncate">
            {dataCurta(e.inicio)} · {plural(e.passagens, "passagem", "passagens")} · {plural(e.pessoas, "pessoa", "pessoas")}
            {e.trocas > 0 && <> · {plural(e.trocas, "troca", "trocas")}</>}
          </span>
        </span>
        <span className="text-right leading-tight">
          <span className="block text-[13px] font-semibold tabular-nums text-foreground">{moeda(valor)}</span>
          <span className="block text-2xs tabular-nums text-muted-foreground">
            {modo === "total" ? (e.porPessoa !== null ? `${moeda(e.porPessoa)} por pessoa` : "sem pessoa") : `${moeda(e.gasto)} no total`}
          </span>
        </span>
        <Barra
          className="col-span-2 h-1.5"
          pct={largura(valor, maior)}
          tom={ponta === "mais" ? "caro" : ponta === "menos" ? "barato" : "normal"}
        />
      </button>
    </li>
  );
}

export function RankingDeEventos({ eventos, onVerEvento, modo, onModo }: {
  eventos: EventoDaAnalise[]; onVerEvento: (eventId: string) => void; modo: Modo; onModo: (m: Modo) => void;
}) {
  const [todos, setTodos] = useState(false);

  const ordenados = useMemo(() => {
    const valor = (e: EventoDaAnalise) => (modo === "total" ? e.gasto : e.porPessoa ?? -1);
    return eventos
      .filter((e) => e.comValor > 0 && (modo === "total" || e.porPessoa !== null))
      .sort((a, b) => valor(b) - valor(a) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [eventos, modo]);
  const semValor = eventos.filter((e) => e.comValor === 0).length;
  const maior = ordenados.length ? (modo === "total" ? ordenados[0].gasto : ordenados[0].porPessoa ?? 0) : 0;

  const mais = ordenados[0];
  const menos = ordenados.length > 1 ? ordenados[ordenados.length - 1] : undefined;
  const valorDe = (e: EventoDaAnalise) => (modo === "total" ? e.gasto : e.porPessoa);

  const resposta = !mais ? (
    <p className="m-0 text-muted-foreground">Nenhum evento com passagem com valor neste recorte.</p>
  ) : !menos ? (
    <p className="m-0">
      Só um evento com passagem com valor: <strong className="font-semibold text-foreground">{mais.nome}</strong>, {moeda(valorDe(mais))}{modo === "pessoa" ? " por pessoa" : ""}.
    </p>
  ) : (
    <p className="m-0">
      {modo === "pessoa" ? "Por pessoa, gastamos" : "Gastamos"} mais em <strong className="font-semibold text-danger">{mais.nome}</strong>{" "}
      (<span className="tabular-nums">{moeda(valorDe(mais))}</span>) e menos em{" "}
      <strong className="font-semibold text-success">{menos.nome}</strong> (<span className="tabular-nums">{moeda(valorDe(menos))}</span>).
    </p>
  );

  const dividir = !todos && ordenados.length > CABE_INTEIRA;
  const ponta = (i: number, n: number): "mais" | "menos" | null => (n < 2 ? null : i === 0 ? "mais" : i === n - 1 ? "menos" : null);
  const linha = (e: EventoDaAnalise, p: "mais" | "menos" | null) => (
    <LinhaDoEvento key={e.eventId} e={e} modo={modo} maior={maior} ponta={p} onVer={onVerEvento} />
  );
  const Separador = ({ texto, cor }: { texto: string; cor: string }) => (
    <li aria-hidden="true" className={cn("px-4 pb-1 pt-3 text-2xs font-semibold", cor)}>{texto}</li>
  );

  return (
    <Painel
      testid="analise-eventos"
      titulo="Em qual evento gastamos mais e menos"
      pergunta={modo === "total" ? "Gasto com passagens e bagagem por evento" : "Gasto dividido pelas pessoas que viajaram — compara eventos de tamanhos diferentes"}
      acao={<Segmentado rotulo="Ordenar por" valor={modo} onChange={onModo} opcoes={[["total", "Total"], ["pessoa", "Por pessoa"]] as const} testid="eventos-modo" />}
      resposta={resposta}
      corpoRente
      rodape={
        <>
          Clique no evento para ver as passagens dele na lista.
          {semValor > 0 && <> {plural(semValor, "evento tem", "eventos têm")} só passagens sem valor e não entra{semValor === 1 ? "" : "m"} no ranking.</>}
        </>
      }
    >
      {ordenados.length > 0 && (
        <ul className="m-0 -mt-1 list-none p-0" aria-label="Eventos por gasto">
          {dividir ? (
            <>
              <Separador texto="Gastamos mais" cor="text-danger" />
              {ordenados.slice(0, POR_PONTA).map((e, i) => linha(e, i === 0 ? "mais" : null))}
              <Separador texto="Gastamos menos" cor="text-success" />
              {ordenados.slice(-POR_PONTA).map((e, i) => linha(e, i === POR_PONTA - 1 ? "menos" : null))}
            </>
          ) : (
            ordenados.map((e, i) => linha(e, ponta(i, ordenados.length)))
          )}
        </ul>
      )}
      {ordenados.length > CABE_INTEIRA && (
        <div className="mx-4 mt-2 flex items-center gap-3 border-t border-border pt-2.5">
          <span className="text-xs tabular-nums text-slate-600">
            {todos ? `Todos os ${ordenados.length} eventos` : `${POR_PONTA * 2} de ${ordenados.length} eventos`}
          </span>
          <button
            type="button"
            onClick={() => setTodos((v) => !v)}
            className="h-[26px] rounded-md border border-border bg-card px-2.5 text-xs font-medium text-primary transition-colors hover:border-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="eventos-ver-todos"
          >
            {todos ? "Mostrar só os extremos" : "Ver todos"}
          </button>
        </div>
      )}
    </Painel>
  );
}
