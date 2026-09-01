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
import { useMemo, useState } from "react";
import { Check, ChevronDown, CalendarDays, Search, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TeamInclusion } from "@shared/schema";
import ScalingPeriodFilter from "./scaling-period-filter";
import type { PeriodConfig } from "./scaling-period";
import {
  FLAG_GROUPS, contarComFlag, contarFlagsAtivas, normalizarBusca,
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

  periodo: PeriodConfig;
  onPeriodo: (v: PeriodConfig) => void;
  /** Base do contador de período: recorte de evento aplicado, período não. */
  linhasSemPeriodo: TeamInclusion[];
  hoje: Date;

  flags: Record<string, boolean>;
  onFlags: (v: Record<string, boolean>) => void;
  /** Base do contador de flags: tudo aplicado menos as próprias flags. */
  linhasSemFlags: TeamInclusion[];
  queueContext: QueueContext;

  verExcluidos: boolean;
  onVerExcluidos: (v: boolean) => void;

  /** "10 vagas" ou "6 de 10 vagas" quando há recorte. */
  contagem: string;
}

/** Botão de popover no padrão da barra: 34px, rótulo com o recorte dentro. */
function BotaoFiltro({ ativo, icone, texto, testid, maxW = "max-w-[320px]" }: {
  ativo: boolean; icone: React.ReactNode; texto: string; testid: string; maxW?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg border bg-card text-[13px] font-medium text-slate-700 ${maxW} hover:bg-slate-100 transition-colors ${
        ativo ? "border-[rgba(0,51,204,0.35)]" : "border-border"
      }`}
    >
      {icone}
      <span className="truncate">{texto}</span>
      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
    </button>
  );
}

/** Caixa de marcação desenhada — o Checkbox do shadcn não cabe em 16px aqui. */
function Caixa({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded border ${
        on ? "bg-primary border-primary text-white" : "bg-card border-slate-300 text-transparent"
      }`}
    >
      <Check className="w-3 h-3" strokeWidth={3} />
    </span>
  );
}

export default function ScalingFilterBar(p: Props) {
  const [buscaEvento, setBuscaEvento] = useState("");

  const eventosMarcados = Object.keys(p.eventos).filter((k) => p.eventos[k]);
  const rotuloEvento = eventosMarcados.length === 0
    ? "Todos os eventos"
    : eventosMarcados.length === 1
      ? (p.opcoesDeEvento.find((e) => e.id === eventosMarcados[0])?.nome ?? "1 evento")
      : `${eventosMarcados.length} eventos`;

  const listaDeEventos = useMemo(() => {
    const q = normalizarBusca(buscaEvento);
    const ordenada = [...p.opcoesDeEvento].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return q ? ordenada.filter((e) => normalizarBusca(e.nome).includes(q)) : ordenada;
  }, [p.opcoesDeEvento, buscaEvento]);

  const nFlags = contarFlagsAtivas(p.flags);
  const alternaFlag = (key: FlagKey) => p.onFlags({ ...p.flags, [key]: !p.flags[key] });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-[1_1_260px] max-w-[320px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
        <input
          type="text"
          value={p.busca}
          onChange={(e) => p.onBusca(e.target.value)}
          aria-label="Buscar por ID, nome ou função"
          placeholder="Buscar por ID, nome ou função…"
          data-testid="input-busca-escalacao"
          className="w-full h-[34px] pl-[33px] pr-3 rounded-lg border border-border bg-card text-[13px] text-foreground outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12"
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <span>
            <BotaoFiltro
              ativo={eventosMarcados.length > 0}
              icone={<CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />}
              texto={rotuloEvento}
              testid="button-filtro-evento"
            />
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[420px] p-0 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 bg-background">
            <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <input
              type="text"
              value={buscaEvento}
              onChange={(e) => setBuscaEvento(e.target.value)}
              placeholder="Buscar evento…"
              aria-label="Buscar evento"
              data-testid="input-busca-evento"
              className="flex-1 min-w-0 h-[26px] bg-transparent text-[13px] text-slate-900 outline-none"
            />
            {eventosMarcados.length > 0 && (
              <button
                type="button"
                onClick={() => p.onEventos({})}
                className="h-6 px-2 rounded-md text-[12px] font-medium text-primary hover:bg-brand-soft shrink-0"
                data-testid="button-limpar-eventos"
              >
                Limpar
              </button>
            )}
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1.5">
            {listaDeEventos.map((e) => (
              <button
                key={e.id}
                type="button"
                role="checkbox"
                aria-checked={!!p.eventos[e.id]}
                onClick={() => p.onEventos({ ...p.eventos, [e.id]: !p.eventos[e.id] })}
                className="flex items-center gap-2.5 w-full min-h-[32px] px-2 py-1.5 rounded-[7px] text-[13px] text-slate-700 text-left hover:bg-slate-100"
                data-testid={`opcao-evento-${e.id}`}
              >
                <Caixa on={!!p.eventos[e.id]} />
                <span className="flex-1 min-w-0 truncate">{e.nome}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{e.n}</span>
              </button>
            ))}
            {listaDeEventos.length === 0 && (
              <p className="px-2 py-3.5 text-center text-[12px] text-muted-foreground">Nenhum evento com esse nome.</p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <ScalingPeriodFilter valor={p.periodo} onChange={p.onPeriodo} linhas={p.linhasSemPeriodo} hoje={p.hoje} />

      <Popover>
        <PopoverTrigger asChild>
          <span>
            <BotaoFiltro
              ativo={nFlags > 0}
              icone={<SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />}
              texto={nFlags === 0 ? "Filtros" : `Filtros · ${nFlags}`}
              testid="button-filtros"
              maxW="max-w-[200px]"
            />
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[560px] p-0 rounded-xl overflow-hidden">
          <div className="flex items-center px-3.5 py-3 border-b border-slate-100">
            <span className="text-[13px] font-semibold text-slate-900">Filtros</span>
            {/* Dentro do grupo OU, entre grupos E: escrito porque é o que
                permite "com passagem E sem hospedagem" e ninguém adivinha. */}
            <span className="ml-2 text-[12px] text-muted-foreground">
              dentro do grupo soma; entre grupos, cruza
            </span>
            {nFlags > 0 && (
              <button
                type="button"
                onClick={() => p.onFlags({})}
                className="ml-auto h-[26px] px-2.5 rounded-md text-[12px] font-medium text-primary hover:bg-brand-soft"
                data-testid="button-limpar-flags"
              >
                Limpar
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-3.5 max-h-[70vh] overflow-y-auto">
            {FLAG_GROUPS.map((g) => (
              <div key={g.id}>
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {g.titulo}
                </p>
                <div className="flex flex-col gap-px">
                  {g.opcoes.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      role="checkbox"
                      aria-checked={!!p.flags[o.key]}
                      onClick={() => alternaFlag(o.key)}
                      className={`flex items-center gap-2.5 min-h-[30px] px-2 rounded-[7px] text-[13px] text-left hover:bg-slate-100 ${
                        p.flags[o.key] ? "text-primary font-medium" : "text-slate-700"
                      }`}
                      data-testid={`flag-${o.key}`}
                    >
                      <Caixa on={!!p.flags[o.key]} />
                      <span className="flex-1 min-w-0 truncate">{o.label}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {contarComFlag(p.linhasSemFlags, p.flags, o.key, p.queueContext)}
                      </span>
                    </button>
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
        className={`inline-flex items-center gap-2 h-[34px] pl-2.5 pr-3 rounded-lg border text-[13px] font-medium shrink-0 transition-colors ${
          p.verExcluidos ? "border-[rgba(0,51,204,0.35)] bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:bg-slate-100"
        }`}
      >
        <span className={`relative inline-flex items-center w-8 h-[18px] rounded-full shrink-0 transition-colors ${p.verExcluidos ? "bg-primary" : "bg-slate-300"}`}>
          <span
            className="absolute left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
            style={{ transform: `translateX(${p.verExcluidos ? "14px" : "0"})` }}
          />
        </span>
        Excluídas
      </button>

      <span className="ml-auto text-[12px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0" data-testid="contagem-vagas">
        {p.contagem}
      </span>
    </div>
  );
}
