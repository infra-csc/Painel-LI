/**
 * Eventos lado a lado (Painel da escala, 30/10).
 *
 * Escolha 2 a 4 eventos e veja a escala de cada um: pessoas, diárias,
 * diárias por pessoa, quem precisa de passagem e hotel, local × viajante,
 * casa × freela e — só para quem já vê valores no Financeiro — o valor do
 * Planejado. Embaixo, pessoas por função, as maiores diferenças primeiro.
 * Os eventos escolhidos ficam na URL (`?eventos=a,b`), então o link copiado
 * abre a mesma comparação.
 *
 * Regras de contagem (diárias, pessoas) em painel-escala-dados.ts.
 */
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Plus, Sparkles, X } from "lucide-react";
import EventCombobox from "@/components/ui/event-combobox";
import { fetchJson } from "@/lib/queryClient";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BudgetPlanned, Event, TeamInclusion } from "@shared/schema";
import { rotuloDaDataDoEvento, type EventoAnalisado } from "@/components/scaling/scaling-analytics-data";
import {
  compararPorFuncao, eventosParecidos, gruposParecidos, numero, pct, plural, resumirEvento,
  type ContextoDaComparacao, type EventoParaComparar, type ResumoDoEvento,
} from "./painel-escala-dados";
import { BOTAO_PEQUENO, Secao, Segmentos } from "./comum-escala";

export const MAX_EVENTOS = 4;

/**
 * Uma cor por evento, na ordem em que foi escolhido (nunca pelo tamanho). O
 * app não tem cores categóricas; estas quatro passaram no validador de
 * paleta (daltonismo e contraste) e sempre vêm com o nome escrito ao lado.
 */
export const CORES_DOS_EVENTOS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"] as const;

interface Props {
  selecionados: string[];
  onSelecionados: (ids: string[]) => void;
  /** Todos os eventos com vagas (inclusive os já realizados — comparar com a edição anterior). */
  eventos: EventoAnalisado[];
  /** Cadastro dos eventos (para o seletor). */
  events: Event[];
  linhas: TeamInclusion[];
  ctx: ContextoDaComparacao;
  podeVerValores: boolean;
  hoje: Date;
}

function usePlanejado(ids: string[], ativo: boolean) {
  const qs = useQueries({
    queries: ids.map((id) => ({
      // Mesma chave do Planejado (use-budget-queries.ts) — cache e invalidação compartilhados.
      queryKey: ["/api/budget-planned", id],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson<BudgetPlanned[]>(`/api/budget-planned?eventId=${encodeURIComponent(id)}`, signal),
      enabled: ativo,
      staleTime: 60_000,
    })),
  });
  return ids.map((_, k) => {
    const q = qs[k];
    if (!ativo) return { estado: "oculto" as const, total: 0, linhas: 0 };
    if (q?.isLoading) return { estado: "carregando" as const, total: 0, linhas: 0 };
    if (q?.isError || !q?.data) return { estado: "erro" as const, total: 0, linhas: 0 };
    return { estado: "ok" as const, total: q.data.reduce((s, r) => s + (Number(r.totalValue) || 0), 0), linhas: q.data.length };
  });
}

function Composicao({ partes, rotulo }: { partes: { n: number; cor: string; nome: string }[]; rotulo: string }) {
  const total = partes.reduce((s, p) => s + p.n, 0);
  const visiveis = partes.filter((p) => p.n > 0);
  return (
    <span className="block">
      <span className="flex h-2 w-full gap-[2px]" role="img" aria-label={`${rotulo}: ${partes.map((p) => `${p.n} ${p.nome}`).join(", ")}`}>
        {total === 0 ? <span className="h-2 w-full rounded-full bg-muted" /> : visiveis.map((p, i) => (
          <span
            key={p.nome}
            title={`${p.n} ${p.nome} (${pct(p.n, total)}%)`}
            className={cn("block h-full", i === 0 && "rounded-l-full", i === visiveis.length - 1 && "rounded-r-full")}
            style={{ width: `${(p.n / total) * 100}%`, background: p.cor, minWidth: 3 }}
          />
        ))}
      </span>
      <span className="mt-1 block text-2xs leading-snug text-slate-600">
        {partes.map((p) => `${pct(p.n, total)}% ${p.nome}`).join(" · ")}
      </span>
    </span>
  );
}

export function CompararEventos({ selecionados, onSelecionados, eventos, events, linhas, ctx, podeVerValores, hoje }: Props) {
  const [ordem, setOrdem] = useState<"diferenca" | "nome">("diferenca");
  const [soDiferencas, setSoDiferencas] = useState(false);

  const porId = useMemo(() => new Map(eventos.map((e) => [e.eventId, e])), [eventos]);
  const validos = selecionados.filter((id) => porId.has(id)).slice(0, MAX_EVENTOS);
  const paraComparar = useMemo<EventoParaComparar[]>(
    () => eventos.map((e) => ({ id: e.eventId, nome: e.nome, data: e.dataEvento ?? null })),
    [eventos],
  );
  const opcoes = useMemo(() => {
    const comVagas = new Set(eventos.map((e) => e.eventId));
    return events.filter((e) => comVagas.has(e.id) && !validos.includes(e.id));
  }, [events, eventos, validos]);

  // Atalhos: circuitos com 2+ eventos, começando pela próxima etapa de cada um.
  const atalhos = useMemo(() => {
    const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    return gruposParecidos(paraComparar).slice(0, 6).map((g) => {
      const datas = new Map(paraComparar.map((e) => [e.id, e.data ?? ""]));
      const proximo = g.ids.find((id) => (datas.get(id) ?? "") >= hojeIso) ?? g.ids[g.ids.length - 1];
      return { ...g, escolha: eventosParecidos(proximo, paraComparar, MAX_EVENTOS) };
    });
  }, [paraComparar, hoje]);

  const parecidos = validos.length > 0 && validos.length < MAX_EVENTOS
    ? eventosParecidos(validos[0], paraComparar, MAX_EVENTOS + validos.length).filter((id) => !validos.includes(id))
    : [];

  const resumos = useMemo<ResumoDoEvento[]>(() => validos.map((id) => resumirEvento(id, linhas, ctx)), [validos, linhas, ctx]);
  const funcoes = useMemo(() => {
    const l = compararPorFuncao(resumos, (id) => ctx.getFunctionName(id));
    const filtradas = soDiferencas ? l.filter((f) => f.diferencaGrande) : l;
    return ordem === "nome" ? [...filtradas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) : filtradas;
  }, [resumos, ctx, ordem, soDiferencas]);
  const nDiferencas = useMemo(() => compararPorFuncao(resumos, (id) => ctx.getFunctionName(id)).filter((f) => f.diferencaGrande).length, [resumos, ctx]);
  const planejado = usePlanejado(validos, podeVerValores);

  const adicionar = (id: string) => {
    if (!id || id === "all" || validos.includes(id) || validos.length >= MAX_EVENTOS) return;
    onSelecionados([...validos, id]);
  };
  const remover = (id: string) => onSelecionados(validos.filter((x) => x !== id));

  const barraDeEscolha = (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3" data-testid="escolha-de-eventos">
      {validos.map((id, k) => (
        <span key={id} className="inline-flex h-[30px] max-w-full items-center gap-1.5 rounded-lg border border-border bg-background pl-2 pr-1 text-xs font-medium text-foreground" data-testid={`chip-evento-${id}`}>
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CORES_DOS_EVENTOS[k] }} />
          <span className="max-w-[220px] truncate" title={porId.get(id)?.nome}>{porId.get(id)?.nome}</span>
          <button type="button" onClick={() => remover(id)} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Tirar ${porId.get(id)?.nome} da comparação`}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      {validos.length < MAX_EVENTOS && (
        <div className="w-full sm:w-[280px]">
          <EventCombobox
            events={opcoes}
            value=""
            onValueChange={adicionar}
            placeholder={validos.length === 0 ? "Escolher o primeiro evento…" : "Adicionar evento…"}
            showAllOption={false}
            testId="combobox-comparar"
            className="h-[30px] text-xs"
          />
        </div>
      )}
      {parecidos.length > 0 && (
        <button
          type="button"
          className={BOTAO_PEQUENO}
          onClick={() => onSelecionados([...validos, ...parecidos].slice(0, MAX_EVENTOS))}
          title={`Mesmo nome-base de ${porId.get(validos[0])?.nome}`}
          data-testid="button-parecidos"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Comparar com parecidos ({Math.min(parecidos.length, MAX_EVENTOS - validos.length)})
        </button>
      )}
      {validos.length > 0 && (
        <button type="button" onClick={() => onSelecionados([])} className="h-[30px] rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-primary" data-testid="button-limpar-comparacao">
          Limpar
        </button>
      )}
    </div>
  );

  if (validos.length < 2) {
    return (
      <Secao titulo="Eventos lado a lado" descricao="Escolha de 2 a 4 eventos para comparar a escala: pessoas por função, diárias, logística e composição." testId="secao-comparar">
        {barraDeEscolha}
        <div className="px-4 py-8 text-center" data-testid="comparar-vazio">
          <p className="text-base font-semibold text-foreground">{validos.length === 0 ? "Nenhum evento escolhido" : "Escolha mais um evento"}</p>
          <p className="mx-auto mt-1 max-w-[460px] text-sm text-muted-foreground">
            {validos.length === 0
              ? (atalhos.length > 0 ? "Use o seletor acima ou comece por um circuito — as etapas mais próximas de hoje entram juntas." : "Use o seletor acima para escolher os eventos. Depois do primeiro, “Comparar com parecidos” completa com as outras etapas do mesmo circuito.")
              : parecidos.length > 0 ? "Adicione outro evento ou use “Comparar com parecidos”." : "Adicione outro evento pelo seletor."}
          </p>
          {validos.length === 0 && atalhos.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2" data-testid="atalhos-circuitos">
              {atalhos.map((a) => (
                <button key={a.base} type="button" className={BOTAO_PEQUENO} onClick={() => onSelecionados(a.escolha)} data-testid={`atalho-${a.base}`}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />{a.rotulo} <span className="text-muted-foreground">· {a.ids.length} eventos</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Secao>
    );
  }

  const maxPessoas = Math.max(1, ...resumos.map((r) => r.pessoas));
  const maxDiarias = Math.max(1, ...resumos.map((r) => r.diarias));
  const maxFuncao = Math.max(1, ...funcoes.flatMap((f) => f.valores.map((v) => v.pessoas)));
  const evento = (id: string) => porId.get(id)!;

  type Linha = { rotulo: string; dica?: string; celula: (r: ResumoDoEvento, k: number) => React.ReactNode; testId: string };
  const metricas: Linha[] = [
    {
      rotulo: "Data do evento", testId: "data",
      celula: (r) => <span className="tabular-nums">{rotuloDaDataDoEvento(evento(r.eventId))}</span>,
    },
    {
      rotulo: "Pessoas", dica: "Uma por vaga viva (validação e aprovação incluídas); empreita por empresa conta as pessoas dela.", testId: "pessoas",
      celula: (r, k) => (
        <span className="block">
          <span className="text-base font-semibold tabular-nums">{numero(r.pessoas)}</span>
          <span className="mt-1 block h-1.5 rounded-full" style={{ width: `${(r.pessoas / maxPessoas) * 100}%`, background: CORES_DOS_EVENTOS[k], minWidth: 3 }} aria-hidden="true" />
        </span>
      ),
    },
    {
      rotulo: "Diárias", dica: "Dias de trabalho da vaga × pessoas, + ½ por dia de 1,5 diária. Não desconta dia útil da casa.", testId: "diarias",
      celula: (r, k) => (
        <span className="block">
          <span className="text-base font-semibold tabular-nums">{numero(r.diarias)}</span>
          <span className="mt-1 block h-1.5 rounded-full" style={{ width: `${(r.diarias / maxDiarias) * 100}%`, background: CORES_DOS_EVENTOS[k], minWidth: 3 }} aria-hidden="true" />
        </span>
      ),
    },
    { rotulo: "Diárias por pessoa", testId: "diarias-por-pessoa", celula: (r) => <span className="tabular-nums">{r.diariasPorPessoa === null ? "—" : numero(r.diariasPorPessoa)}</span> },
    { rotulo: "Precisam de passagem", testId: "passagem", celula: (r) => <span className="tabular-nums">{r.passagem} <span className="text-2xs text-muted-foreground">({pct(r.passagem, r.pessoas)}%)</span></span> },
    { rotulo: "Precisam de hotel", testId: "hotel", celula: (r) => <span className="tabular-nums">{r.hotel} <span className="text-2xs text-muted-foreground">({pct(r.hotel, r.pessoas)}%)</span></span> },
    {
      rotulo: "Local × viajante", dica: "Viajante: precisa de passagem ou de hotel.", testId: "local-viajante",
      celula: (r) => <Composicao rotulo="Local × viajante" partes={[{ n: r.viajantes, cor: "var(--primary)", nome: "viajantes" }, { n: r.locais, cor: "var(--neutral)", nome: "locais" }]} />,
    },
    {
      rotulo: "Casa × freela", dica: "Pelo cadastro do colaborador. Freela inclui local e empreita; sem nome = vaga ainda sem colaborador.", testId: "casa-freela",
      celula: (r) => <Composicao rotulo="Casa × freela" partes={[{ n: r.casa, cor: "var(--primary)", nome: "casa" }, { n: r.freela, cor: "var(--info-strong)", nome: "freela" }, { n: r.semNome, cor: "var(--warning-strong)", nome: "sem nome" }]} />,
    },
    { rotulo: "Ainda em validação/aprovação", dica: "Podem mudar antes de chegar à Escalação.", testId: "em-sugestao", celula: (r) => <span className="tabular-nums">{r.emSugestao}</span> },
  ];
  if (podeVerValores) {
    metricas.push({
      rotulo: "Valor planejado", dica: "Soma do total das linhas do Planejado do evento.", testId: "valor-planejado",
      celula: (_r, k) => {
        const p = planejado[k];
        if (p.estado === "carregando") return <span className="text-xs text-muted-foreground">carregando…</span>;
        if (p.estado === "erro") return <span className="text-xs text-danger">não carregou</span>;
        if (p.linhas === 0) return <span className="text-xs text-muted-foreground">sem Planejado</span>;
        return <span className="font-semibold tabular-nums">{formatarMoeda(p.total)}</span>;
      },
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Secao titulo="Eventos lado a lado" descricao="Inclui as vagas ainda em validação e aprovação; canceladas ficam de fora." testId="secao-comparar">
        {barraDeEscolha}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm" style={{ minWidth: 132 + validos.length * 116 }}>
            <caption className="sr-only">Comparação da escala entre os eventos escolhidos</caption>
            <colgroup><col style={{ width: "22%" }} />{validos.map((id) => <col key={id} />)}</colgroup>
            <thead>
              <tr className="border-b border-border bg-surface-muted/60">
                <th scope="col" className="sticky left-0 z-[1] bg-surface-muted px-4 py-2 text-2xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">Evento</th>
                {validos.map((id, k) => (
                  <th key={id} scope="col" className="border-l border-border px-3 py-2 align-top font-normal">
                    <span className="flex items-start gap-1.5">
                      <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CORES_DOS_EVENTOS[k] }} />
                      <span className="line-clamp-2 text-xs font-semibold text-foreground" title={evento(id).nome}>{evento(id).nome}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricas.map((m) => (
                <tr key={m.testId} className="border-b border-border last:border-b-0" data-testid={`metrica-${m.testId}`}>
                  <th scope="row" className="sticky left-0 z-[1] bg-card px-4 py-2.5 align-top text-xs font-medium text-slate-700 max-sm:px-3" title={m.dica}>
                    {m.rotulo}
                    {m.dica && <span className="mt-0.5 block text-2xs font-normal leading-snug text-muted-foreground max-md:hidden">{m.dica}</span>}
                  </th>
                  {resumos.map((r, k) => (
                    <td key={r.eventId} className="border-l border-border px-3 py-2.5 align-top text-foreground" data-testid={`metrica-${m.testId}-${r.eventId}`}>
                      {m.celula(r, k)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao
        titulo="Pessoas por função"
        descricao={<>Diferença grande: {nDiferencas === 0 ? "nenhuma" : `${nDiferencas} ${plural(nDiferencas, "função", "funções")}`} com 3+ pessoas de diferença e 30%+ do maior.</>}
        acoes={(
          <>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
              <input type="checkbox" checked={soDiferencas} onChange={(e) => setSoDiferencas(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" data-testid="check-so-diferencas" />
              Só diferenças grandes
            </label>
            <Segmentos rotulo="Ordem" valor={ordem} onChange={setOrdem} opcoes={[["diferenca", "Maior diferença"], ["nome", "A–Z"]] as const} testId="ordem-funcoes" />
          </>
        )}
        testId="secao-por-funcao"
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-2xs text-slate-600" aria-label="Legenda">
          {validos.map((id, k) => (
            <span key={id} className="inline-flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-sm" style={{ background: CORES_DOS_EVENTOS[k] }} />
              <span className="max-w-[220px] truncate">{evento(id).nome}</span>
            </span>
          ))}
          <span className="text-muted-foreground">· número = pessoas; diárias ao lado</span>
        </div>
        {funcoes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma função com diferença grande entre esses eventos.</p>
        ) : (
          <ul className="divide-y divide-border">
            {funcoes.map((f) => (
              <li key={f.functionId} className={cn("grid grid-cols-1 gap-x-4 gap-y-1.5 px-4 py-2.5 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]", f.diferencaGrande && "bg-warning-soft/40")} data-testid={`funcao-${f.functionId}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground" title={f.nome}>{f.nome}</p>
                  {f.diferencaGrande && (
                    <p className="text-2xs font-semibold text-warning" data-testid={`diferenca-${f.functionId}`}>diferença de {numero(f.amplitude)} {plural(f.amplitude, "pessoa", "pessoas")}</p>
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  {f.valores.map((v, k) => (
                    <div key={validos[k]} className="flex items-center gap-2" title={`${evento(validos[k]).nome}: ${numero(v.pessoas)} pessoas · ${numero(v.diarias)} diárias`}>
                      <span className="flex min-w-0 flex-1">
                        {v.pessoas > 0 ? (
                          <span className="block h-2 rounded-r-full" style={{ width: `${(v.pessoas / maxFuncao) * 100}%`, background: CORES_DOS_EVENTOS[k], minWidth: 3 }} aria-hidden="true" />
                        ) : <span className="block h-2 w-[3px] rounded-full bg-muted" aria-hidden="true" />}
                      </span>
                      <span className={cn("w-8 shrink-0 text-right text-xs font-semibold tabular-nums", v.pessoas === 0 ? "text-muted-foreground" : "text-foreground")}>{numero(v.pessoas)}</span>
                      <span className="w-[76px] shrink-0 text-right text-2xs tabular-nums text-muted-foreground">{numero(v.diarias)} {plural(v.diarias, "diária", "diárias")}</span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}
