/**
 * Filtros da aba Buscar (09/10) — as peças comuns de Passagens/Hospedagem
 * (`components/common/barra-de-filtros.tsx` e `filter-popover.tsx`): busca,
 * evento, "Sai de", destino, funções e data da ida à vista; trecho e dado
 * faltando em "Filtros", com etiqueta removível quando fogem do padrão.
 * A situação (Pendentes / Compradas / Todas) fica na faixa acima da barra.
 */
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FiltroMultiplo, FiltroUnico, type OpcaoDeFiltro } from "@/components/common/filter-popover";
import { BuscaDaLista, EtiquetaDeFiltro, LimparFiltros, MaisFiltros } from "@/components/common/barra-de-filtros";
import { FILTROS_PADRAO, type FiltrosDaBusca } from "./filtros-da-busca";
import { ddmm } from "./formato";

const TRECHOS = [
  { id: "todos", nome: "Todos os trechos" },
  { id: "ida_e_volta", nome: "Ida e volta" },
  { id: "so_ida", nome: "Só ida" },
  { id: "so_volta", nome: "Só volta" },
  { id: "direto", nome: "Trecho direto (pinga-pinga)" },
];
const FALTAS = [
  { id: "todas", nome: "Todas" },
  { id: "prontas", nome: "Prontas para buscar" },
  { id: "com_falta", nome: "Com dado faltando" },
  { id: "sem_data", nome: "Sem data (ou data inválida)" },
  { id: "sem_cidade", nome: "Sem cidade de saída" },
  { id: "sem_aeroporto", nome: "Aeroporto do evento a confirmar" },
];
type Lista = "trecho" | "falta";
const LISTAS = [
  { chave: "trecho" as Lista, titulo: "Trecho", etiqueta: "Trecho", opcoes: TRECHOS, testid: "filtro-trecho" },
  { chave: "falta" as Lista, titulo: "Dado faltando", etiqueta: "Dados", opcoes: FALTAS, testid: "filtro-falta" },
];

function DataDaIda({ de, ate, onChange }: { de: string; ate: string; onChange: (de: string, ate: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const ativo = !!(de || ate);
  const texto = de && ate ? `Ida ${ddmm(de)}–${ddmm(ate)}` : de ? `Ida a partir de ${ddmm(de)}` : ate ? `Ida até ${ddmm(ate)}` : "Data da ida";
  const hoje = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const mais = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return iso(d); };
  const campo = "h-9 w-full rounded-lg border border-border bg-card px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12";
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" className={`pas-alvo inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 ${ativo ? "border-primary/40 text-primary" : "border-border text-slate-700"}`} data-testid="filtro-data-ida">
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{texto}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[min(300px,calc(100vw-24px))] space-y-3 rounded-xl p-3.5">
        <p className="m-0 text-sm font-semibold text-foreground">Data da ida</p>
        <div className="flex flex-wrap gap-1.5">
          {[[7, "Próximos 7 dias"], [30, "Próximos 30 dias"], [60, "Próximos 60 dias"]].map(([n, r]) => (
            <button key={n} type="button" onClick={() => { onChange(iso(hoje), mais(Number(n))); setAberto(false); }} className="h-8 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-slate-700 hover:bg-muted">{r}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">De<input type="date" value={de} onChange={(e) => onChange(e.target.value, ate)} className={`${campo} mt-1 normal-case tracking-normal`} /></label>
          <label className="block text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Até<input type="date" value={ate} onChange={(e) => onChange(de, e.target.value)} className={`${campo} mt-1 normal-case tracking-normal`} /></label>
        </div>
        {ativo && <button type="button" onClick={() => { onChange("", ""); setAberto(false); }} className="h-8 rounded-md px-2 text-xs font-medium text-primary hover:bg-brand-soft">Qualquer data</button>}
      </PopoverContent>
    </Popover>
  );
}

export function BarraDeFiltrosDaBusca({ filtros, onChange, eventos, saidas, destinos, funcoes, count, total }: {
  filtros: FiltrosDaBusca;
  onChange: (f: FiltrosDaBusca) => void;
  eventos: OpcaoDeFiltro[];
  saidas: OpcaoDeFiltro[];
  destinos: OpcaoDeFiltro[];
  funcoes: OpcaoDeFiltro[];
  count: number;
  total: number;
}) {
  const set = <K extends keyof FiltrosDaBusca>(k: K, v: FiltrosDaBusca[K]) => onChange({ ...filtros, [k]: v });
  const ligadas = LISTAS.filter((l) => filtros[l.chave] !== l.opcoes[0].id);
  const algum = JSON.stringify({ ...filtros, situacao: "pendentes" }) !== JSON.stringify(FILTROS_PADRAO);
  return (
    <div className="space-y-2" role="search" aria-label="Filtros das escalações">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
        <BuscaDaLista valor={filtros.q} onChange={(v) => set("q", v)} placeholder="Nome, #ID, função" rotulo="Buscar por nome, número da vaga ou função" testid="busca-escalacao" compacta />
        <div className="pas-rolagem-x -mx-[var(--page-gutter)] flex items-center gap-1.5 px-[var(--page-gutter)] sm:contents">
          <div className="max-w-[220px] shrink-0">
            <FiltroUnico valor={filtros.evento} onChange={(v) => set("evento", v)} opcoes={eventos} rotuloTodos="Todos os eventos" placeholderBusca="Buscar evento…" testid="filtro-evento" larguraPopover={360} />
          </div>
          <div className="max-w-[200px] shrink-0">
            <FiltroUnico valor={filtros.saida} onChange={(v) => set("saida", v)} opcoes={saidas} rotuloTodos="Sai de" placeholderBusca="Buscar cidade…" testid="filtro-saida" />
          </div>
          <div className="max-w-[200px] shrink-0">
            <FiltroUnico valor={filtros.destino} onChange={(v) => set("destino", v)} opcoes={destinos} rotuloTodos="Destino" placeholderBusca="Buscar destino…" testid="filtro-destino" />
          </div>
          <div className="max-w-[200px] shrink-0">
            <FiltroMultiplo valores={filtros.funcoes} onChange={(ids) => set("funcoes", ids)} opcoes={funcoes} rotuloTodos="Todas as funções" placeholderBusca="Buscar função…" testid="filtro-funcao" />
          </div>
          <DataDaIda de={filtros.de} ate={filtros.ate} onChange={(de, ate) => onChange({ ...filtros, de, ate })} />
          <MaisFiltros
            listas={LISTAS}
            valorDe={(c) => filtros[c as Lista]}
            onEscolher={(c, id) => set(c as Lista, id as never)}
            contagem={ligadas.length}
            mostrarPadrao={ligadas.length > 0}
            onPadrao={() => onChange({ ...filtros, trecho: "todos", falta: "todas" })}
            testid="filtros-mais-busca"
          />
        </div>
      </div>
      {algum && (
        <div className="flex flex-wrap items-center gap-1.5">
          {ligadas.map((l) => (
            <EtiquetaDeFiltro key={l.chave} etiqueta={l.etiqueta} valor={l.opcoes.find((o) => o.id === filtros[l.chave])?.nome} titulo={l.titulo} onTirar={() => set(l.chave, l.opcoes[0].id as never)} />
          ))}
          <LimparFiltros onClick={() => onChange({ ...FILTROS_PADRAO, situacao: filtros.situacao })} testid="limpar-filtros-busca" />
          <span className="ml-auto text-xs tabular-nums text-muted-foreground" aria-live="polite">{count} de {total} {total === 1 ? "escalação" : "escalações"}</span>
        </div>
      )}
    </div>
  );
}
