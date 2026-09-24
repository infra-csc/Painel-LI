/**
 * Barra de filtros da Escalação (01/09) — uma linha no lugar do grid de seis
 * campos iguais que a tela usava.
 *
 * Cada controle mostra o próprio recorte no rótulo (o nome do evento, o
 * período escolhido, quantos filtros estão ligados), porque um filtro ativo
 * que não se anuncia faz o usuário ler a lista errada sem perceber.
 *
 * Os contadores ao lado de cada opção são hipotéticos e cruzados: "quantas
 * linhas sobram se eu marcar ISTO mantendo o resto". Por isso a base recebida
 * é sempre a lista SEM o filtro em questão.
 */
import { forwardRef, useMemo, useState, Fragment } from "react";
import { Briefcase, Check, ChevronDown, CalendarDays, Search, SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TeamInclusion } from "@shared/schema";
import ScalingPeriodFilter from "./scaling-period-filter";
import type { DatasDoEvento } from "./scaling-period";
import { PRESETS_SEM_REALIZADOS, RECORTE_EVENTOS_LABEL, type PeriodConfig, type RecorteDeEventos } from "./scaling-period";
import {
  FLAG_GROUPS, contadoresDasFlags, contarFlagsAtivas, normalizarBusca,
  type FlagKey, type QueueContext,
} from "./scaling-queue";

interface Props {
  busca: string;
  onBusca: (v: string) => void;

  /** Eventos marcados, por id. Vazio = todos. */
  eventos: Record<string, boolean>;
  onEventos: (v: Record<string, boolean>) => void;
  /** Todos os eventos com vaga, já com a contagem de linhas de cada um. */
  opcoesDeEvento: { id: string; nome: string; n: number }[];

  /** Funções marcadas, por id (10/09). Vazio = todas. */
  funcoes: Record<string, boolean>;
  onFuncoes: (v: Record<string, boolean>) => void;
  /** Funções com vaga no recorte, já com a contagem de cada uma. */
  opcoesDeFuncao: { id: string; nome: string; n: number }[];

  periodo: PeriodConfig;
  onPeriodo: (v: PeriodConfig) => void;
  /** Base do contador de período: recorte de evento aplicado, período não. */
  linhasSemPeriodo: TeamInclusion[];
  hoje: Date;
  /** Datas dos eventos: habilita medir o período pela data do evento (22/09). */
  datasDoEvento?: DatasDoEvento;

  flags: Record<string, boolean>;
  onFlags: (v: Record<string, boolean>) => void;
  /** Base do contador de flags: tudo aplicado menos as próprias flags. */
  linhasSemFlags: TeamInclusion[];
  queueContext: QueueContext;

  verExcluidos: boolean;
  onVerExcluidos: (v: boolean) => void;
  /** Recorte de eventos — Futuros (padrão) · Todos · Realizados (04/09). */
  recorteEventos: RecorteDeEventos;
  onRecorteEventos: (v: RecorteDeEventos) => void;
  /** Quantas linhas cada posição deixaria (base: tudo aplicado menos ela). */
  contagemPorRecorte: Record<RecorteDeEventos, number>;

  /** "10 vagas" ou "6 de 10 vagas" quando há recorte. */
  contagem: string;
}

/**
 * Botão de popover no padrão da barra: 34px, rótulo com o recorte dentro.
 *
 * Encaminha ref e props porque vai direto dentro de `PopoverTrigger asChild`.
 * Envolvê-lo num `<span>` fazia o Radix pendurar o clique e o aria-expanded no
 * span: o botão recebia foco, mas Enter não abria nada — o filtro ficava
 * inacessível para quem navega por teclado.
 */
const BotaoFiltro = forwardRef<HTMLButtonElement, {
  ativo: boolean; icone: React.ReactNode; texto: string; testid: string; maxW?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ ativo, icone, texto, testid, maxW = "max-w-[320px]", className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      data-testid={testid}
      {...props}
      className={`inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg border bg-card text-sm font-medium text-slate-700 ${maxW} hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary ${
        ativo ? "border-primary/40" : "border-border"
      } ${className ?? ""}`}
    >
      {icone}
      <span className="truncate">{texto}</span>
      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
    </button>
  ),
);
BotaoFiltro.displayName = "BotaoFiltro";

/** Caixa de marcação desenhada — o Checkbox do shadcn não cabe em 16px aqui. */
function Caixa({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded border ${
        on ? "bg-primary border-primary text-primary-foreground" : "bg-card border-slate-300 text-transparent"
      }`}
    >
      <Check className="w-3 h-3" strokeWidth={3} />
    </span>
  );
}

/**
 * Popover de marcação múltipla com busca — o mesmo para Evento e Função.
 * O rótulo do botão diz o que está marcado; a lista de chips abaixo da barra
 * (`ChipsDaSelecao`) é onde cada marcação fica visível e pode ser tirada uma
 * a uma: com dois eventos marcados o botão só dizia "2 eventos", e o usuário
 * não achava como desmarcar um (10/09).
 */
function PopoverDeMarcacao({ icone, rotulo, vazio, placeholder, testid, marcados, onMarcados, opcoes }: {
  icone: React.ReactNode;
  rotulo: string;
  vazio: string;
  placeholder: string;
  testid: string;
  marcados: Record<string, boolean>;
  onMarcados: (v: Record<string, boolean>) => void;
  opcoes: { id: string; nome: string; n: number }[];
}) {
  const [busca, setBusca] = useState("");
  const ids = Object.keys(marcados).filter((k) => marcados[k]);
  const texto = ids.length === 0 ? vazio
    : ids.length === 1 ? (opcoes.find((o) => o.id === ids[0])?.nome ?? `1 ${rotulo}`)
    : `${ids.length} ${rotulo}s`;
  const lista = useMemo(() => {
    const q = normalizarBusca(busca);
    const ordenada = [...opcoes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return q ? ordenada.filter((o) => normalizarBusca(o.nome).includes(q)) : ordenada;
  }, [opcoes, busca]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <BotaoFiltro ativo={ids.length > 0} icone={icone} texto={texto} testid={`button-filtro-${testid}`} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] p-0 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-background">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder.replace("…", "")}
            data-testid={`input-busca-${testid}`}
            className="flex-1 min-w-0 h-[26px] bg-transparent text-sm text-foreground outline-none"
          />
          {ids.length > 0 && (
            <button
              type="button"
              onClick={() => onMarcados({})}
              className="h-6 px-2 rounded-md text-xs font-medium text-primary hover:bg-brand-soft shrink-0"
              data-testid={`button-limpar-${testid}s`}
            >
              Limpar
            </button>
          )}
        </div>
        <div className="max-h-[240px] overflow-y-auto p-1.5">
          {lista.map((o) => (
            <button
              key={o.id}
              type="button"
              role="checkbox"
              aria-checked={!!marcados[o.id]}
              onClick={() => onMarcados({ ...marcados, [o.id]: !marcados[o.id] })}
              className="flex items-center gap-2.5 w-full min-h-[32px] px-2 py-1.5 rounded-md text-sm text-slate-700 text-left hover:bg-muted"
              data-testid={`opcao-${testid}-${o.id}`}
            >
              <Caixa on={!!marcados[o.id]} />
              <span className="flex-1 min-w-0 truncate">{o.nome}</span>
              <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">{o.n}</span>
            </button>
          ))}
          {lista.length === 0 && (
            <p className="px-2 py-3.5 text-center text-xs text-muted-foreground">{`Nenhum ${rotulo} com esse nome.`}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Um chip por marcação, com o "×" que a tira — o que faltava para ver e desfazer a seleção (10/09). */
function ChipsDaSelecao({ grupo, marcados, onMarcados, opcoes, nomeFallback }: {
  grupo: string;
  marcados: Record<string, boolean>;
  onMarcados: (v: Record<string, boolean>) => void;
  opcoes: { id: string; nome: string }[];
  nomeFallback: string;
}) {
  const ids = Object.keys(marcados).filter((k) => marcados[k]);
  if (ids.length === 0) return null;
  return (
    <>
      {ids.map((id) => {
        const nome = opcoes.find((o) => o.id === id)?.nome ?? nomeFallback;
        return (
          <span
            key={`${grupo}-${id}`}
            className="inline-flex max-w-[360px] items-center gap-1 rounded-md border border-primary/25 bg-brand-soft py-0.5 pl-2 pr-1 text-xs font-medium text-primary"
            data-testid={`chip-${grupo}-${id}`}
          >
            <span className="text-2xs font-semibold uppercase tracking-wide text-primary/70">{grupo}</span>
            <span className="truncate">{nome}</span>
            <button
              type="button"
              onClick={() => { const next = { ...marcados }; delete next[id]; onMarcados(next); }}
              aria-label={`Tirar ${grupo} ${nome} do filtro`}
              title="Tirar do filtro"
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-primary/15"
              data-testid={`chip-remover-${grupo}-${id}`}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        );
      })}
    </>
  );
}

export default function ScalingFilterBar(p: Props) {
  /**
   * Os contadores só existem enquanto o popover está aberto — e são
   * calculados de uma vez, não uma varredura por opção. Com a lista inteira
   * na tela, a diferença entre as duas coisas é a tela travar ou não a cada
   * clique.
   */
  const [filtrosAberto, setFiltrosAberto] = useState(false);
  const contagens = useMemo(
    () => (filtrosAberto ? contadoresDasFlags(p.linhasSemFlags, p.flags, p.queueContext) : {}),
    [filtrosAberto, p.linhasSemFlags, p.flags, p.queueContext],
  );

  const temMarcacao = Object.values(p.eventos).some(Boolean) || Object.values(p.funcoes).some(Boolean);

  const nFlags = contarFlagsAtivas(p.flags);
  const alternaFlag = (key: FlagKey) => p.onFlags({ ...p.flags, [key]: !p.flags[key] });

  return (
    <div className="space-y-2">
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-[1_1_260px] max-w-[320px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
        <input
          type="text"
          value={p.busca}
          onChange={(e) => p.onBusca(e.target.value)}
          aria-label="Buscar por ID, nome ou função"
          placeholder="Buscar por ID, nome ou função…"
          data-testid="input-busca-escalacao"
          className="w-full h-[34px] pl-[33px] pr-3 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12"
        />
      </div>

      <PopoverDeMarcacao
        icone={<CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />}
        rotulo="evento" vazio="Todos os eventos" placeholder="Buscar evento…" testid="evento"
        marcados={p.eventos} onMarcados={p.onEventos} opcoes={p.opcoesDeEvento}
      />

      {/* Função (dono, 10/09): o mesmo popover do evento. */}
      <PopoverDeMarcacao
        icone={<Briefcase className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />}
        rotulo="função" vazio="Todas as funções" placeholder="Buscar função…" testid="funcao"
        marcados={p.funcoes} onMarcados={p.onFuncoes} opcoes={p.opcoesDeFuncao}
      />

      <ScalingPeriodFilter valor={p.periodo} onChange={p.onPeriodo} linhas={p.linhasSemPeriodo} hoje={p.hoje} presets={PRESETS_SEM_REALIZADOS} datasDoEvento={p.datasDoEvento} />

      <Popover open={filtrosAberto} onOpenChange={setFiltrosAberto}>
        <PopoverTrigger asChild>
          <BotaoFiltro
            ativo={nFlags > 0}
            icone={<SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />}
            texto={nFlags === 0 ? "Filtros" : `Filtros · ${nFlags}`}
            testid="button-filtros"
            maxW="max-w-[200px]"
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[560px] p-0 rounded-xl overflow-hidden">
          <div className="flex items-center px-3.5 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Filtros</span>
            {/* Dentro da lista OU, entre listas E: escrito porque é o que
                permite "precisa de passagem E não comprada" e ninguém adivinha.
                Passagem e Hospedagem têm duas listas cada (o traço separa). */}
            <span className="ml-2 text-xs text-muted-foreground" title="O número ao lado de cada opção é quantas vagas do recorte atual ela alcança.">
              mesma lista soma · entre listas cruza · nº = quantas do recorte
            </span>
            {nFlags > 0 && (
              <button
                type="button"
                onClick={() => p.onFlags({})}
                className="ml-auto h-[26px] px-2.5 rounded-md text-xs font-medium text-primary hover:bg-brand-soft"
                data-testid="button-limpar-flags"
              >
                Limpar
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-3.5 max-h-[70vh] overflow-y-auto">
            {FLAG_GROUPS.map((g) => (
              <div key={g.id}>
                <p className="mb-1 px-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {g.titulo}
                </p>
                <div className="flex flex-col gap-px">
                  {g.opcoes.map((o, idx) => (
                    <Fragment key={o.key}>
                    {idx > 0 && o.eixo !== g.opcoes[idx - 1].eixo && (
                      <div className="my-1 mx-2 border-t border-border" aria-hidden="true" data-testid={`flag-eixo-${g.id}-${o.eixo}`} />
                    )}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={!!p.flags[o.key]}
                      onClick={() => alternaFlag(o.key)}
                      className={`flex items-center gap-2.5 min-h-[30px] px-2 rounded-md text-sm text-left hover:bg-muted ${
                        p.flags[o.key] ? "text-primary font-medium" : "text-slate-700"
                      }`}
                      data-testid={`flag-${o.key}`}
                    >
                      <Caixa on={!!p.flags[o.key]} />
                      <span className="flex-1 min-w-0 truncate">{o.label}</span>
                      <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
                        {contagens[o.key] ?? 0}
                      </span>
                    </button>
                    </Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        role="switch"
        aria-checked={p.verExcluidos}
        onClick={() => p.onVerExcluidos(!p.verExcluidos)}
        data-testid="toggle-excluidas"
        className={`inline-flex items-center gap-2 h-[34px] pl-2.5 pr-3 rounded-lg border text-sm font-medium shrink-0 transition-colors ${
          p.verExcluidos ? "border-primary/40 bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:bg-muted"
        }`}
      >
        <span className={`relative inline-flex items-center w-8 h-[18px] rounded-full shrink-0 transition-colors ${p.verExcluidos ? "bg-primary" : "bg-slate-300"}`}>
          <span
            className="absolute left-0.5 h-3.5 w-3.5 rounded-full bg-card shadow-1 transition-transform"
            style={{ transform: `translateX(${p.verExcluidos ? "14px" : "0"})` }}
          />
        </span>
        Excluídas
      </button>

      {/* Recorte de eventos (04/09): a tela abre em "Futuros"; "Todos" tira o
          recorte e "Realizados" mostra só o que já terminou. */}
      <div role="radiogroup" aria-label="Recorte de eventos" className="inline-flex h-[34px] shrink-0 items-center rounded-lg border border-border bg-card p-0.5" data-testid="recorte-eventos">
        {(["futuros", "todos", "realizados"] as RecorteDeEventos[]).map((k) => {
          const on = p.recorteEventos === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => p.onRecorteEventos(k)}
              data-testid={`recorte-eventos-${k}`}
              title={k === "futuros" ? "Eventos que ainda vão acontecer ou estão acontecendo (vaga sem data conta como futura)" : k === "realizados" ? "Só eventos que já terminaram" : "Sem recorte de evento"}
              className={`inline-flex h-[28px] items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                on ? "bg-brand-soft text-primary" : "text-slate-600 hover:bg-muted"
              }`}
            >
              {RECORTE_EVENTOS_LABEL[k]}
              <span className="text-2xs tabular-nums text-muted-foreground">{p.contagemPorRecorte[k]}</span>
            </button>
          );
        })}
      </div>

      <span className="ml-auto text-xs text-muted-foreground tabular-nums whitespace-nowrap shrink-0" data-testid="contagem-vagas">
        {p.contagem}
      </span>
    </div>

    {/* Marcações visíveis, uma a uma, com o "×" — sem isto o botão dizia
        "2 eventos" e não havia como tirar só um (10/09). */}
    {temMarcacao && (
      <div className="flex flex-wrap items-center gap-1.5" data-testid="chips-selecao">
        <ChipsDaSelecao grupo="evento" marcados={p.eventos} onMarcados={p.onEventos} opcoes={p.opcoesDeEvento} nomeFallback="Evento" />
        <ChipsDaSelecao grupo="função" marcados={p.funcoes} onMarcados={p.onFuncoes} opcoes={p.opcoesDeFuncao} nomeFallback="Função" />
        <button
          type="button"
          onClick={() => { p.onEventos({}); p.onFuncoes({}); }}
          className="h-6 px-2 rounded-md text-xs font-medium text-slate-600 hover:bg-muted"
          data-testid="button-limpar-marcacoes"
        >
          Limpar marcações
        </button>
      </div>
    )}
    </div>
  );
}
