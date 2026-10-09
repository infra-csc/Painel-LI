/**
 * A lista do Log de auditoria (redesenho 08/10).
 *
 * Antes: um cartão com borda por registro (uma pilha de caixas brancas iguais)
 * que abria ali mesmo, empurrando a lista. Agora um LOG de verdade, numa
 * moldura só: os dias como cabeçalhos (grudam abaixo da barra no desktop), e
 * cada registro numa linha densa — hora · marcador do tom sobre o fio do dia ·
 * quem fez o quê (com o contexto e as duas primeiras mudanças, antes → depois)
 * · a ação · o módulo. A linha inteira abre o detalhe no painel lateral, sem
 * perder o lugar na lista. Em largura útil estreita (container query) a linha
 * vira cartão: hora, ação e módulo descem para uma linha de apoio.
 *
 * A paginação continua a do servidor (30 por página), no rodapé da moldura.
 */
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { LogDescrito } from "@shared/log-auditoria";
import { cn, fixEncoding } from "@/lib/utils";
import { toTitleCase } from "@/lib/format";
import { TOM, horaBr, plural, rotuloDoDia, type SystemLog } from "./auditoria-utils";

export interface ItemDoLog { log: SystemLog; d: LogDescrito }
export interface DiaDoLog { chave: string; principal: string; data: string; itens: ItemDoLog[] }

export const nomeDaPessoa = (log: SystemLog) => toTitleCase(fixEncoding(log.userName)) || "Sistema";

/** Agrupa na ordem em que vieram (mais recentes primeiro). */
export function agruparPorDia(itens: ItemDoLog[]): DiaDoLog[] {
  const dias: DiaDoLog[] = [];
  for (const item of itens) {
    const r = rotuloDoDia(item.log.createdAt);
    const ultimo = dias[dias.length - 1];
    if (ultimo?.chave === r.chave) ultimo.itens.push(item); else dias.push({ ...r, itens: [item] });
  }
  return dias;
}

/** "—" do formatador vira "vazio" (um travessão sozinho não diz nada). */
export function Valor({ v, className }: { v: string; className?: string }) {
  return v === "—"
    ? <span className={cn("italic text-muted-foreground", className)}>vazio</span>
    : <span className={className}>{v}</span>;
}

/** As duas primeiras mudanças, antes → depois, numa linha que corta com elegância. */
function MudancasEmLinha({ d }: { d: LogDescrito }) {
  if (d.mudancas.length === 0) {
    return d.dados.length > 0 && d.resumo
      ? <span className="aud-resumo text-muted-foreground">{d.resumo}</span>
      : null;
  }
  const resto = d.mudancas.length - 2;
  return (
    <span className="aud-resumo">
      {d.mudancas.slice(0, 2).map((m, i) => (
        <span key={`${m.campo}-${i}`} className="aud-mud">
          <span className="text-muted-foreground">{m.campo}</span>
          <Valor v={m.antes} className="aud-mud-antes" />
          <span aria-label="mudou para" className="text-muted-foreground">→</span>
          <Valor v={m.depois} className="aud-mud-depois" />
        </span>
      ))}
      {resto > 0 && <span className="shrink-0 text-muted-foreground">+{plural(resto, "campo", "campos")}</span>}
    </span>
  );
}

function Linha({ item, selecionada, onAbrir }: { item: ItemDoLog; selecionada: boolean; onAbrir: (id: string) => void }) {
  const { log, d } = item;
  const tom = TOM[d.tom];
  const Icone = tom.icon;
  return (
    <li className="aud-item">
      <button
        type="button"
        onClick={() => onAbrir(log.id)}
        aria-haspopup="dialog"
        aria-current={selecionada ? "true" : undefined}
        className="aud-linha"
        data-tom={d.tom}
        data-testid={`log-${log.logNumber}`}
      >
        <time dateTime={log.createdAt} className="aud-c-hora">{horaBr(log.createdAt)}</time>
        <span className={cn("aud-c-marca", tom.marca)} aria-hidden="true"><Icone className="h-3.5 w-3.5" /></span>
        <span className="aud-c-texto">
          <span className="block text-sm leading-5 text-foreground">
            <span className="font-semibold">{nomeDaPessoa(log)}</span> {d.frase}
          </span>
          {/* Só na largura estreita: hora, ação e módulo descem para cá. */}
          <span className="aud-apoio">
            <span className="tabular-nums">{horaBr(log.createdAt)}</span>
            <span className={cn("aud-chip", tom.chip)}>{d.acao}</span>
            <span>{d.modulo}</span>
          </span>
          {d.contexto.length > 0 && <span className="aud-contexto">{d.contexto.join(" · ")}</span>}
          <MudancasEmLinha d={d} />
        </span>
        <span className="aud-c-acao"><span className={cn("aud-chip", tom.chip)}>{d.acao}</span></span>
        <span className="aud-c-modulo">{d.modulo}</span>
        <span className="aud-c-abrir" aria-hidden="true"><ChevronRight className="h-4 w-4" /></span>
      </button>
    </li>
  );
}

function Paginacao({ page, pages, total, limite, onPage }: { page: number; pages: number; total: number; limite: number; onPage: (n: number) => void }) {
  const de = (page - 1) * limite + 1;
  const ate = Math.min(page * limite, total);
  const inicio = Math.max(1, Math.min(page - 2, pages - 4));
  const numeros = Array.from({ length: Math.min(5, pages) }, (_, i) => inicio + i).filter((n) => n <= pages);
  const BTN = "pas-alvo inline-flex h-8 min-w-[2rem] items-center justify-center gap-1 rounded-md border border-border bg-card px-2 text-sm font-medium text-slate-700 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <nav className="aud-paginacao" aria-label="Páginas do log">
      <p className="text-xs text-muted-foreground tabular-nums">
        <span className="font-medium text-slate-700">{de.toLocaleString("pt-BR")}–{ate.toLocaleString("pt-BR")}</span> de {plural(total, "registro", "registros")}
        <span className="text-muted-foreground"> · Página {page} de {pages}</span>
      </p>
      <div className="flex items-center gap-1">
        <button type="button" className={BTN} onClick={() => onPage(1)} disabled={page <= 1} aria-label="Primeira página"><ChevronsLeft className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" className={BTN} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /><span className="hidden md:inline pr-1">Anterior</span>
        </button>
        {numeros.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPage(n)}
            aria-label={`Página ${n}`}
            aria-current={n === page ? "page" : undefined}
            className={cn(BTN, "tabular-nums", n === page && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
          >
            {n}
          </button>
        ))}
        <button type="button" className={BTN} onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Próxima página">
          <span className="hidden md:inline pl-1">Próxima</span><ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={BTN} onClick={() => onPage(pages)} disabled={page >= pages} aria-label="Última página"><ChevronsRight className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </nav>
  );
}

export function ListaDaAuditoria({ dias, selecionadoId, onAbrir, atualizando, paginacao, onPage, resumo }: {
  dias: DiaDoLog[];
  selecionadoId: string | null;
  onAbrir: (id: string) => void;
  /** Buscando outra página/filtro com a lista anterior na tela. */
  atualizando: boolean;
  paginacao: { page: number; limit: number; total: number; pages: number };
  onPage: (n: number) => void;
  /** A linha do topo: quantos registros, e o recorte. */
  resumo: ReactNode;
}) {
  return (
    <section className="aud-caixa" aria-label="Registros do log" aria-busy={atualizando} data-testid="aud-lista">
      <div className={cn("aud-moldura", atualizando && "aud-atualizando")}>
        {atualizando && <div className="aud-progresso" role="progressbar" aria-label="Atualizando os registros" />}
        <div className="aud-topo">{resumo}</div>
        <div className="aud-cabecalho" aria-hidden="true">
          <span className="text-right">Hora</span>
          <span />
          <span>O que aconteceu</span>
          <span>Ação</span>
          <span>Módulo</span>
          <span />
        </div>
        {dias.map((g) => (
          <section key={g.chave} aria-label={`${g.principal}, ${g.data}`}>
            <h3 className="aud-dia">
              <span className="text-xs font-semibold text-foreground tabular-nums">{g.principal}</span>
              <span className="text-2xs text-muted-foreground">{g.data} · {plural(g.itens.length, "registro", "registros")}</span>
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </h3>
            <ol className="aud-trilha">
              {g.itens.map((item) => <Linha key={item.log.id} item={item} selecionada={item.log.id === selecionadoId} onAbrir={onAbrir} />)}
            </ol>
          </section>
        ))}
        {paginacao.pages > 1 && (
          <Paginacao page={paginacao.page} pages={paginacao.pages} total={paginacao.total} limite={paginacao.limit} onPage={onPage} />
        )}
      </div>
    </section>
  );
}
