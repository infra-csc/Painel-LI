/**
 * Atividade recente (30/10) — a barra de filtros: período, evento, tipo (com a
 * contagem de cada um) e os recortes "com passagem", "com hotel", "atrasados"
 * e "só não vistos".
 */
import type { ReactNode } from "react";
import { BedDouble, Check, Clock3, Eye, FilterX, Plane } from "lucide-react";
import type { Event } from "@shared/schema";
import EventCombobox from "@/components/ui/event-combobox";
import { cn } from "@/lib/utils";
import {
  ROTULO_DO_PERIODO, ROTULO_DO_TIPO, TIPOS_DA_ATIVIDADE,
  type PeriodoDaAtividade, type TipoDaAtividade,
} from "../comum/atividade-tipos";

export interface FiltrosDaTela {
  periodo: PeriodoDaAtividade;
  eventId: string | null;
  tipo: TipoDaAtividade | null;
  comPassagem: boolean;
  comHotel: boolean;
  atrasados: boolean;
  naoVistos: boolean;
}

export const FILTROS_PADRAO: FiltrosDaTela = {
  periodo: "24h", eventId: null, tipo: null, comPassagem: false, comHotel: false, atrasados: false, naoVistos: false,
};

const PERIODOS: PeriodoDaAtividade[] = ["hoje", "24h", "7d"];

/** Lê os filtros da URL (links da Visão geral: `?tipo=pedido&periodo=24h`). */
export function filtrosDaUrl(busca: string): FiltrosDaTela {
  const p = new URLSearchParams(busca);
  const periodo = p.get("periodo");
  const tipo = p.get("tipo");
  return {
    periodo: PERIODOS.includes(periodo as PeriodoDaAtividade) ? (periodo as PeriodoDaAtividade) : FILTROS_PADRAO.periodo,
    eventId: p.get("eventId") || null,
    tipo: TIPOS_DA_ATIVIDADE.includes(tipo as TipoDaAtividade) ? (tipo as TipoDaAtividade) : null,
    comPassagem: p.get("passagem") === "1",
    comHotel: p.get("hotel") === "1",
    atrasados: p.get("atrasados") === "1",
    naoVistos: p.get("novos") === "1",
  };
}

export function buscaDosFiltros(f: FiltrosDaTela): string {
  const p = new URLSearchParams();
  if (f.periodo !== FILTROS_PADRAO.periodo) p.set("periodo", f.periodo);
  if (f.eventId) p.set("eventId", f.eventId);
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.comPassagem) p.set("passagem", "1");
  if (f.comHotel) p.set("hotel", "1");
  if (f.atrasados) p.set("atrasados", "1");
  if (f.naoVistos) p.set("novos", "1");
  return p.toString();
}

export function temFiltro(f: FiltrosDaTela): boolean {
  return !!f.eventId || !!f.tipo || f.comPassagem || f.comHotel || f.atrasados || f.naoVistos;
}

function Alternar({ ativo, onClick, children, testId, disabled, title }: { ativo: boolean; onClick: () => void; children: ReactNode; testId: string; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60",
        ativo ? "border-primary bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:border-slate-300",
      )}
      data-testid={testId}
    >
      {ativo && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function FiltrosDaAtividade({ f, onChange, eventos, resumo, total, atrasadosProntos }: {
  f: FiltrosDaTela;
  onChange: (patch: Partial<FiltrosDaTela>) => void;
  eventos: Event[];
  resumo: Record<TipoDaAtividade, number> | null;
  total: number | null;
  /** A régua dos prazos já carregou (o filtro "Atrasados" depende dela). */
  atrasadosProntos: boolean;
}) {
  const somaDoResumo = resumo ? TIPOS_DA_ATIVIDADE.reduce((s, t) => s + resumo[t], 0) : null;
  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-card p-3" data-testid="filtros-atividade">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Período" className="inline-flex rounded-lg border border-border bg-background p-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={f.periodo === p}
              onClick={() => onChange({ periodo: p })}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                f.periodo === p ? "bg-card text-primary shadow-1" : "text-muted-foreground hover:text-slate-700",
              )}
              data-testid={`periodo-${p}`}
            >
              {ROTULO_DO_PERIODO[p]}
            </button>
          ))}
        </div>
        <div className="w-full min-w-0 sm:w-[260px]">
          <EventCombobox
            events={eventos}
            value={f.eventId ?? "all"}
            onValueChange={(v) => onChange({ eventId: v && v !== "all" ? v : null })}
            placeholder="Todos os eventos"
            showAllOption
            testId="filtro-evento-atividade"
            className="h-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Alternar ativo={f.comPassagem} onClick={() => onChange({ comPassagem: !f.comPassagem })} testId="filtro-com-passagem">
            <Plane className="h-3.5 w-3.5" aria-hidden="true" />Com passagem
          </Alternar>
          <Alternar ativo={f.comHotel} onClick={() => onChange({ comHotel: !f.comHotel })} testId="filtro-com-hotel">
            <BedDouble className="h-3.5 w-3.5" aria-hidden="true" />Com hotel
          </Alternar>
          <Alternar
            ativo={f.atrasados}
            onClick={() => onChange({ atrasados: !f.atrasados })}
            testId="filtro-atrasados"
            disabled={!atrasadosProntos && !f.atrasados}
            title={atrasadosProntos ? "Vagas paradas numa etapa com o prazo vencido (régua do Quadro de prazos)" : "Calculando os prazos…"}
          >
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Atrasados
          </Alternar>
          <Alternar ativo={f.naoVistos} onClick={() => onChange({ naoVistos: !f.naoVistos })} testId="filtro-nao-vistos">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />Só não vistos
          </Alternar>
        </div>
        {temFiltro(f) && (
          <button
            type="button"
            onClick={() => onChange({ eventId: null, tipo: null, comPassagem: false, comHotel: false, atrasados: false, naoVistos: false })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-primary sm:ml-auto"
            data-testid="button-limpar-filtros-atividade"
          >
            <FilterX className="h-3.5 w-3.5" aria-hidden="true" />Limpar filtros
          </button>
        )}
      </div>
      <div role="radiogroup" aria-label="Tipo" className="flex flex-wrap gap-1.5">
        {([null, ...TIPOS_DA_ATIVIDADE] as (TipoDaAtividade | null)[]).map((t) => {
          const ativo = f.tipo === t;
          const n = t === null ? (somaDoResumo ?? total) : resumo?.[t] ?? null;
          return (
            <button
              key={t ?? "todos"}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => onChange({ tipo: t })}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                ativo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-slate-700 hover:border-slate-300",
              )}
              data-testid={`tipo-${t ?? "todos"}`}
            >
              {t === null ? "Tudo" : ROTULO_DO_TIPO[t]}
              {n !== null && <span className={cn("tabular-nums", ativo ? "opacity-80" : "text-muted-foreground")}>{n}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
