/**
 * Filtros LOCAIS das opções (16/10): recortam o que já veio do fornecedor —
 * nenhum clique aqui chama a API. Companhia, paradas, faixa de horário de
 * partida/chegada e a ordem. Largo: uma barra; celular: "Filtros" abre uma
 * folha inferior com os mesmos grupos (alvos de 44px).
 */
import { useState } from "react";
import { ArrowDownUp, Clock3, SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CIAS_DOS_FILTROS, FAIXAS_DO_DIA, FILTROS_DAS_OPCOES_PADRAO, ORDENS, filtrosLigados, type FaixaDoDia, type FiltrosDasOpcoes, type OrdemDasOpcoes } from "./estado-dos-resultados";

export interface ContagemDosFiltros {
  /** Opções por companhia, mantendo os outros filtros. */
  cias: Record<string, number>;
  /** Opções diretas / com até 1 conexão / todas, mantendo os outros filtros. */
  paradas: { todas: number; "0": number; "1": number };
}

const CHIP = "pas-alvo inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const chipCls = (on: boolean) => (on ? "border-primary/40 bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:bg-muted");

function Companhias({ f, onF, n }: { f: FiltrosDasOpcoes; onF: (f: FiltrosDasOpcoes) => void; n: ContagemDosFiltros }) {
  const alternar = (id: string) => onF({ ...f, cias: f.cias.includes(id) ? f.cias.filter((c) => c !== id) : [...f.cias, id] });
  return (
    <div role="group" aria-label="Companhia" className="flex flex-wrap gap-1.5">
      {CIAS_DOS_FILTROS.map((c) => {
        const on = f.cias.includes(c.id);
        return (
          <button key={c.id} type="button" aria-pressed={on} onClick={() => alternar(c.id)} className={cn(CHIP, chipCls(on))} data-testid={`filtro-cia-${c.id}`}>
            {c.nome}<span className={cn("tabular-nums", on ? "text-primary/80" : "text-muted-foreground", !on && !(n.cias[c.id] ?? 0) && "opacity-60")}>{n.cias[c.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

function Paradas({ f, onF, n }: { f: FiltrosDasOpcoes; onF: (f: FiltrosDasOpcoes) => void; n: ContagemDosFiltros }) {
  const itens: Array<{ id: FiltrosDasOpcoes["paradas"]; rotulo: string }> = [{ id: "todas", rotulo: "Todas" }, { id: "0", rotulo: "Direto" }, { id: "1", rotulo: "Até 1 conexão" }];
  return (
    <div role="radiogroup" aria-label="Paradas" className="inline-flex rounded-lg border border-border bg-background p-[3px]">
      {itens.map((i) => {
        const on = f.paradas === i.id;
        return (
          <button key={i.id} type="button" role="radio" aria-checked={on} onClick={() => onF({ ...f, paradas: i.id })} data-testid={`filtro-paradas-${i.id}`}
            className={cn("pas-alvo inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-card font-semibold text-primary shadow-1 ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
            {i.rotulo}<span className="tabular-nums opacity-75">{n.paradas[i.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

function FaixaDoDiaCampo({ rotulo, valor, onValor, testid }: { rotulo: string; valor: FaixaDoDia; onValor: (v: FaixaDoDia) => void; testid: string }) {
  const itens: Array<{ id: FaixaDoDia; rotulo: string; texto?: string }> = [{ id: "qualquer", rotulo: "Qualquer" }, ...FAIXAS_DO_DIA];
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{rotulo}</legend>
      <div role="radiogroup" aria-label={rotulo} className="grid grid-cols-5 gap-1">
        {itens.map((i) => {
          const on = valor === i.id;
          return (
            <button key={i.id} type="button" role="radio" aria-checked={on} onClick={() => onValor(i.id)} data-testid={`${testid}-${i.id}`}
              className={cn("pas-alvo flex min-h-[40px] flex-col items-center justify-center rounded-md border px-1 text-2xs leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", chipCls(on), on && "font-semibold")}>
              <span>{i.rotulo}</span>
              {i.texto && <span className={cn("tabular-nums", on ? "text-primary/75" : "text-muted-foreground")}>{i.texto}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Horarios({ f, onF, temVolta, soVolta }: { f: FiltrosDasOpcoes; onF: (f: FiltrosDasOpcoes) => void; temVolta: boolean; soVolta: boolean }) {
  return (
    <div className="space-y-3">
      <FaixaDoDiaCampo rotulo={soVolta ? "Partida da volta" : "Partida da ida"} valor={f.partida} onValor={(v) => onF({ ...f, partida: v })} testid="filtro-partida" />
      <FaixaDoDiaCampo rotulo={soVolta ? "Chegada da volta" : "Chegada da ida"} valor={f.chegada} onValor={(v) => onF({ ...f, chegada: v })} testid="filtro-chegada" />
      {temVolta && <FaixaDoDiaCampo rotulo="Partida da volta" valor={f.partidaVolta} onValor={(v) => onF({ ...f, partidaVolta: v })} testid="filtro-partida-volta" />}
    </div>
  );
}

function Ordem({ f, onF, className }: { f: FiltrosDasOpcoes; onF: (f: FiltrosDasOpcoes) => void; className?: string }) {
  return (
    <Select value={f.ordem} onValueChange={(v) => onF({ ...f, ordem: v as OrdemDasOpcoes })}>
      <SelectTrigger className={cn("pas-alvo h-8 w-[172px] gap-1.5 rounded-lg border-border bg-card px-2.5 text-xs", className)} aria-label="Ordenar opções" data-testid="ordem-das-opcoes">
        <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /><SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {ORDENS.map((o) => <SelectItem key={o.id} value={o.id} className="text-sm">{o.rotulo}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function BarraDeFiltrosDasOpcoes({ filtros, onFiltros, contagem, visiveis, total, temVolta, soVolta }: {
  filtros: FiltrosDasOpcoes;
  onFiltros: (f: FiltrosDasOpcoes) => void;
  contagem: ContagemDosFiltros;
  visiveis: number;
  total: number;
  temVolta: boolean;
  soVolta: boolean;
}) {
  const [folha, setFolha] = useState(false);
  const ligados = filtrosLigados(filtros);
  const horarios = (filtros.partida !== "qualquer" ? 1 : 0) + (filtros.chegada !== "qualquer" ? 1 : 0) + (filtros.partidaVolta !== "qualquer" ? 1 : 0);
  const limpar = () => onFiltros({ ...FILTROS_DAS_OPCOES_PADRAO, ordem: filtros.ordem });
  // Com filtro ligado, a conta "N de M" fica logo abaixo da barra (sem disputar espaço com os botões).
  const contador = (
    <p className="m-0 w-full text-xs tabular-nums text-muted-foreground" aria-live="polite" data-testid="contagem-opcoes">
      {ligados
        ? <>Mostrando <span className="font-semibold text-foreground">{visiveis}</span> de {total} {total === 1 ? "opção" : "opções"} · os filtros só recortam o que já veio
          <button type="button" onClick={limpar} className="ml-2 inline-flex items-center gap-1 rounded px-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="limpar-filtros-opcoes"><X className="h-3 w-3" aria-hidden="true" />Limpar filtros</button></>
        : <span className="sr-only">{total} {total === 1 ? "opção" : "opções"}</span>}
    </p>
  );
  return (
    <div className="bpr-filtros" data-testid="filtros-das-opcoes">
      {/* Largo: tudo numa barra. */}
      <div className="bpr-filtros-inline min-w-0 flex-1 flex-wrap items-center gap-2">
        <Companhias f={filtros} onF={onFiltros} n={contagem} />
        <span className="h-5 w-px bg-border" aria-hidden="true" />
        <Paradas f={filtros} onF={onFiltros} n={contagem} />
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={cn(CHIP, chipCls(horarios > 0))} data-testid="abrir-horarios">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Horários{horarios > 0 && <span className="rounded bg-primary px-1 text-2xs font-semibold tabular-nums text-primary-foreground">{horarios}</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[380px] p-3.5">
            <p className="m-0 mb-3 text-xs leading-5 text-muted-foreground">Só recorta as opções que já vieram — não gasta consulta.</p>
            <Horarios f={filtros} onF={onFiltros} temVolta={temVolta} soVolta={soVolta} />
          </PopoverContent>
        </Popover>
      </div>
      {/* Celular: um botão abre a folha. */}
      <button type="button" onClick={() => setFolha(true)} className={cn(CHIP, chipCls(ligados > 0), "bpr-filtros-botao")} data-testid="abrir-filtros-opcoes">
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />Filtros{ligados > 0 && <span className="rounded bg-primary px-1 text-2xs font-semibold tabular-nums text-primary-foreground">{ligados}</span>}
      </button>
      <div className="ml-auto flex shrink-0 items-center">
        <Ordem f={filtros} onF={onFiltros} />
      </div>
      {contador}

      <Sheet open={folha} onOpenChange={setFolha}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl px-4 pb-4 pt-5" data-testid="folha-filtros-opcoes">
          <SheetTitle className="text-base font-semibold">Filtrar as opções</SheetTitle>
          <SheetDescription className="mt-0.5 text-xs text-muted-foreground">Recorta o que já veio. Não gasta consulta.</SheetDescription>
          <div className="mt-4 space-y-4">
            <div>
              <p className="m-0 mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Companhia</p>
              <Companhias f={filtros} onF={onFiltros} n={contagem} />
            </div>
            <div>
              <p className="m-0 mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Paradas</p>
              <Paradas f={filtros} onF={onFiltros} n={contagem} />
            </div>
            <Horarios f={filtros} onF={onFiltros} temVolta={temVolta} soVolta={soVolta} />
          </div>
          <div className="sticky bottom-0 -mx-4 mt-5 flex items-center gap-2 border-t border-border bg-card px-4 pt-3">
            <button type="button" onClick={limpar} disabled={ligados === 0} className="pas-alvo h-11 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-muted disabled:opacity-50">Limpar</button>
            <button type="button" onClick={() => setFolha(false)} className="pas-alvo ml-auto h-11 flex-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover" data-testid="aplicar-filtros-opcoes">
              {visiveis === 0 ? "Nenhuma opção — ver assim mesmo" : `Ver ${visiveis} ${visiveis === 1 ? "opção" : "opções"}`}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
