/**
 * Peças dos Painéis de passagens e de hospedagem (30/10): filtros na URL,
 * estados (carregando/erro/vazio), o quadro "Fora do prazo" e as barras
 * "feitas × não feitas por evento". As duas telas usam as mesmas peças, cada
 * uma com a sua etapa — a régua é a do Quadro de prazos (logistica-dos-paineis.ts).
 *
 * Anatomia e cores das Análises de passagens (components/tickets/analises/
 * partes.tsx — Painel, Numero, Barra): cor só com significado e sempre com o
 * texto junto — vermelho = prazo vencido, âmbar = vence em até 3 dias,
 * verde = feito, cinza = esperando a escala.
 */
import { useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AlertCircle, ArrowRight, CheckCircle2, Info, Loader2, RotateCw, X } from "lucide-react";
import { FiltroMultiplo, FiltroUnico, FiltroDeLista, type OpcaoDeFiltro } from "@/components/common/filter-popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Painel } from "@/components/tickets/analises/partes";
import {
  PERIODOS_DO_PAINEL, RECORTE_PADRAO, ROTULOS_DA_ETAPA, temRecorteNoPainel, textoDoAtraso, textoDoPrazo,
  type EtapaDaLogistica, type GrupoDoPrazo, type LinhaDaLogistica, type PeriodoDoPainel, type RecorteDoPainel,
} from "./logistica-dos-paineis";

// ── URL ─────────────────────────────────────────────────────────────────────

/**
 * Os filtros moram na URL (recarregar ou mandar o link abre a mesma visão).
 * Só vai para a URL o que difere do padrão. `null` apaga o parâmetro; texto
 * (mesmo vazio — "tipo não informado") grava.
 */
export function useParametrosDaUrl() {
  const busca = useSearch();
  const [local, navegar] = useLocation();
  const params = useMemo(() => new URLSearchParams(busca), [busca]);
  const definir = useCallback((mudancas: Record<string, string | null>) => {
    const p = new URLSearchParams(busca);
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null) p.delete(k); else p.set(k, v);
    }
    const qs = p.toString();
    navegar(qs ? `${local}?${qs}` : local, { replace: true });
  }, [busca, local, navegar]);
  return { params, definir };
}

const PERIODOS = new Set<string>(PERIODOS_DO_PAINEL.map((p) => p.id));

export function recorteDaUrl(p: URLSearchParams): RecorteDoPainel {
  const periodo = p.get("periodo");
  return {
    periodo: periodo && PERIODOS.has(periodo) ? (periodo as PeriodoDoPainel) : RECORTE_PADRAO.periodo,
    eventId: p.get("evento") || "all",
    funcoes: (p.get("funcao") ?? "").split(",").filter(Boolean),
  };
}

export function recorteNaUrl(r: RecorteDoPainel): Record<string, string | null> {
  return {
    periodo: r.periodo === RECORTE_PADRAO.periodo ? null : r.periodo,
    evento: r.eventId === "all" ? null : r.eventId,
    funcao: r.funcoes.length ? r.funcoes.join(",") : null,
  };
}

// ── Formatação ──────────────────────────────────────────────────────────────

export const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

/** "às 14:32" (hoje) / "em 29/10 às 18:05". */
export function textoDaHora(ms: number, agora: Date = new Date()): string {
  const d = new Date(ms);
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const mesmoDia = d.toDateString() === agora.toDateString();
  return mesmoDia ? `às ${hora}` : `em ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} às ${hora}`;
}

// ── Barra de filtros ────────────────────────────────────────────────────────

export function FiltrosDoPainel({ recorte, onRecorte, opcoes, atualizando, atualizadoEm, onAtualizar }: {
  recorte: RecorteDoPainel;
  onRecorte: (r: RecorteDoPainel) => void;
  opcoes: { eventos: OpcaoDeFiltro[]; funcoes: OpcaoDeFiltro[] } | null;
  atualizando: boolean;
  atualizadoEm: number | null;
  onAtualizar: () => void;
}) {
  const set = (patch: Partial<RecorteDoPainel>) => onRecorte({ ...recorte, ...patch });
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center" data-testid="filtros-do-painel">
      <div className="col-span-2 sm:w-[228px]">
        <FiltroDeLista
          valor={recorte.periodo}
          onChange={(v) => set({ periodo: v as PeriodoDoPainel })}
          opcoes={PERIODOS_DO_PAINEL}
          testid="painel-periodo"
          larguraPopover={240}
        />
      </div>
      <div className="col-span-2 sm:w-[280px]">
        <FiltroUnico
          valor={recorte.eventId}
          onChange={(v) => set({ eventId: v })}
          opcoes={opcoes?.eventos ?? []}
          rotuloTodos="Todos os eventos"
          placeholderBusca="Buscar evento…"
          testid="painel-evento"
          larguraPopover={340}
        />
      </div>
      <div className="col-span-2 sm:w-[220px]">
        <FiltroMultiplo
          valores={recorte.funcoes}
          onChange={(v) => set({ funcoes: v })}
          opcoes={opcoes?.funcoes ?? []}
          rotuloTodos="Todas as funções"
          placeholderBusca="Buscar função…"
          testid="painel-funcao"
          rotuloVarios={(n) => `${n} funções`}
        />
      </div>
      {temRecorteNoPainel(recorte) && (
        <button
          type="button"
          onClick={() => onRecorte(RECORTE_PADRAO)}
          className="inline-flex h-[34px] items-center justify-center gap-1 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="painel-limpar"
        >
          <X className="h-4 w-4" aria-hidden="true" />Limpar
        </button>
      )}
      <div className={cn("flex items-center justify-end gap-2 sm:ml-auto", temRecorteNoPainel(recorte) ? "" : "col-span-2")}>
        <p className="m-0 flex items-center gap-1.5 text-2xs text-muted-foreground" aria-live="polite" data-testid="painel-atualizado">
          {atualizando && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {atualizando ? "Atualizando…" : atualizadoEm ? `Atualizado ${textoDaHora(atualizadoEm)}` : ""}
        </p>
        <Button variant="outline" size="sm" className="h-[34px] rounded-lg" onClick={onAtualizar} disabled={atualizando} data-testid="painel-atualizar">
          <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Atualizar
        </Button>
      </div>
    </div>
  );
}

// ── Estados ─────────────────────────────────────────────────────────────────

export function EsqueletoDoPainel() {
  const painel = (linhas: number) => (
    <div className="rounded-xl border border-border bg-card">
      <div className="space-y-1.5 border-b border-border px-4 py-3"><div className="pas-osso h-3.5 w-44" /><div className="pas-osso h-2.5 w-64 max-w-full" /></div>
      <div className="space-y-3 px-4 py-4">
        {Array.from({ length: linhas }).map((_, i) => (
          <div key={i} className="flex items-center gap-3"><div className="pas-osso h-3 w-32" /><div className="pas-osso h-2.5 flex-1" /><div className="pas-osso h-3 w-14" /></div>
        ))}
      </div>
    </div>
  );
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-4" data-testid="painel-carregando">
      <span className="sr-only">Carregando o painel…</span>
      <div aria-hidden="true" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 bg-card px-4 py-3.5"><div className="pas-osso h-3 w-20" /><div className="pas-osso h-6 w-24" /><div className="pas-osso h-2.5 w-28" /></div>
        ))}
      </div>
      <div aria-hidden="true">{painel(4)}</div>
      <div aria-hidden="true">{painel(6)}</div>
    </div>
  );
}

export function EstadoDoPainel({ icone, titulo, texto, acao, tom, testid }: {
  icone: ReactNode; titulo: string; texto: ReactNode; acao?: ReactNode; tom?: "erro" | "ok"; testid: string;
}) {
  return (
    <div
      role={tom === "erro" ? "alert" : undefined}
      className={cn("pas-entra flex flex-col items-center rounded-xl border bg-card px-6 py-12 text-center", tom === "erro" ? "border-danger/25" : "border-border")}
      data-testid={testid}
    >
      <span
        className={cn(
          "mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full",
          tom === "erro" ? "bg-danger-soft text-danger" : tom === "ok" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {icone}
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">{titulo}</h2>
      <p className="m-0 mt-1.5 max-w-[480px] text-sm leading-relaxed text-muted-foreground">{texto}</p>
      {acao && <div className="mt-5 flex flex-wrap justify-center gap-2">{acao}</div>}
    </div>
  );
}

export function ErroDoPainel({ erro, onTentar }: { erro: unknown; onTentar: () => void }) {
  const msg = erro instanceof Error ? erro.message : "";
  return (
    <EstadoDoPainel
      testid="painel-erro"
      tom="erro"
      icone={<AlertCircle className="h-5 w-5" />}
      titulo="Não foi possível carregar o painel"
      texto={msg || "Verifique sua conexão e tente de novo."}
      acao={
        <Button variant="outline" onClick={onTentar} className="rounded-lg" data-testid="painel-tentar-de-novo">
          <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Tentar de novo
        </Button>
      }
    />
  );
}

/** Aviso discreto de dado que fica fora de uma conta — nada some calado. */
export function NotaDoPainel({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <p className="m-0 flex items-start gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs leading-5 text-slate-600" data-testid={testid}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// ── Para onde cada linha leva ───────────────────────────────────────────────

/**
 * Passagem → a tela Passagens no evento, só as pendentes (`?event=&status=pending`,
 * filters-url.ts). Hotel → a Hospedagem no evento (`?event=`, 30/10) — onde se
 * registra a reserva que falta.
 */
export function destinoDaEtapa(etapa: EtapaDaLogistica, eventId: string): string {
  return etapa === "passagem"
    ? `/tickets?event=${encodeURIComponent(eventId)}&status=pending`
    : `/accommodations?event=${encodeURIComponent(eventId)}`;
}

function LinkDeAcao({ href, children, testid, className }: { href: string; children: ReactNode; testid?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-primary transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      data-testid={testid}
    >
      {children}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

// ── Fora do prazo ───────────────────────────────────────────────────────────

const TOM_DO_GRUPO: Record<GrupoDoPrazo, { chip: string; titulo: string; ponto: string }> = {
  atrasado: { chip: "bg-danger-soft text-danger", titulo: "Prazo vencido", ponto: "bg-danger-strong" },
  vence_logo: { chip: "bg-warning-soft text-warning", titulo: "Vencem em até 3 dias", ponto: "bg-warning-strong" },
};

function LinhaForaDoPrazo({ l, grupo, etapa }: { l: LinhaDaLogistica; grupo: GrupoDoPrazo; etapa: EtapaDaLogistica }) {
  const r = ROTULOS_DA_ETAPA[etapa];
  // Prazo vencido só com vagas esperando a escala: o Quadro não pinta a
  // coluna da logística — aqui também não (sem vermelho), mas a linha fica.
  const soEsperando = l.aFazer === 0;
  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-border px-4 py-3 first:border-t-0 md:grid-cols-[minmax(0,1fr)_auto_auto]"
      data-testid={`fora-${etapa}-${l.eventId}`}
      data-grupo={grupo}
    >
      <div className="min-w-0">
        <p className="m-0 line-clamp-2 text-[13px] font-medium leading-5 text-foreground md:line-clamp-1" title={l.nome}>{l.nome}</p>
        <p className="m-0 mt-0.5 text-2xs leading-4 text-muted-foreground">
          Evento {l.rotuloDaData}
          {l.diasAteOEvento !== null && <> · {l.diasAteOEvento === 0 ? "é hoje" : `em ${plural(l.diasAteOEvento, "dia", "dias")}`}</>}
          {" · "}{textoDoPrazo(l)}
        </p>
      </div>
      <LinkDeAcao href={destinoDaEtapa(etapa, l.eventId)} testid={`abrir-${etapa}-${l.eventId}`} className="md:order-3">
        <span className="hidden sm:inline">{r.acao}</span><span className="sm:hidden">Abrir</span>
      </LinkDeAcao>
      <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 md:order-2 md:col-span-1 md:justify-end">
        <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-2xs font-semibold", soEsperando ? "bg-muted text-slate-600" : TOM_DO_GRUPO[grupo].chip)}>
          {soEsperando ? "Travado na escala" : textoDoAtraso(l.atraso)}
        </span>
        {l.aFazer > 0 && (
          <span className="text-[13px] text-foreground">
            <strong className="font-semibold tabular-nums">{l.aFazer.toLocaleString("pt-BR")}</strong> {r.aFazer}
          </span>
        )}
        {l.esperandoEscala > 0 && (
          <span className="text-xs text-muted-foreground" title="A escala destas vagas ainda não foi confirmada — a compra espera por ela.">
            {l.aFazer > 0 ? "+ " : ""}{plural(l.esperandoEscala, "esperando a escala", "esperando a escala")}
          </span>
        )}
        <span className="text-2xs tabular-nums text-muted-foreground">{l.feitas}/{l.precisam} {r.feitas}</span>
      </div>
    </li>
  );
}

export function ForaDoPrazo({ etapa, grupos, diasAntes }: {
  etapa: EtapaDaLogistica;
  grupos: Record<GrupoDoPrazo, LinhaDaLogistica[]>;
  diasAntes: number;
}) {
  const r = ROTULOS_DA_ETAPA[etapa];
  const total = grupos.atrasado.length + grupos.vence_logo.length;
  const aFazer = grupos.atrasado.reduce((s, l) => s + l.aFazer, 0);
  const id = useId();
  return (
    <Painel
      testid={`fora-do-prazo-${etapa}`}
      titulo="Fora do prazo"
      pergunta={`Eventos com ${r.varias} por fazer depois do prazo (D-${diasAntes}) ou vencendo em até 3 dias`}
      corpoRente
      resposta={total === 0 ? undefined : (
        <p className="m-0">
          {grupos.atrasado.length > 0 ? (
            <>
              <strong className="font-semibold text-danger">{plural(aFazer, r.uma, r.varias)} {r.aFazer}</strong> com o prazo vencido
              em {plural(grupos.atrasado.filter((l) => l.aFazer > 0).length, "evento", "eventos")}
            </>
          ) : "Nenhum prazo vencido"}
          {grupos.vence_logo.length > 0 && <>; {plural(grupos.vence_logo.length, "evento vence", "eventos vencem")} em até 3 dias</>}.
        </p>
      )}
      rodape={
        <>
          Mesma régua do Quadro de prazos: prazo = dia do evento − {diasAntes} dias. “{r.aFazer[0].toUpperCase() + r.aFazer.slice(1)}” = escala confirmada, precisa e ainda não tem;
          “esperando a escala” = ainda falta confirmar a escala. Eventos que já aconteceram ficam de fora.
        </>
      }
    >
      {total === 0 ? (
        <div className="flex items-center gap-3 px-4 py-3" data-testid={`fora-do-prazo-${etapa}-vazio`}>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success" aria-hidden="true">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <p className="m-0 text-[13px] text-slate-700">
            Nenhum evento com {r.uma} fora do prazo nem vencendo nos próximos 3 dias.
          </p>
        </div>
      ) : (
        (["atrasado", "vence_logo"] as const).filter((g) => grupos[g].length > 0).map((g) => (
          <section key={g} aria-labelledby={`${id}-${g}`} className="border-t border-border first:border-t-0">
            <h3 id={`${id}-${g}`} className="m-0 flex items-center gap-2 bg-surface-muted px-4 py-1.5 text-2xs font-semibold uppercase tracking-[0.04em] text-slate-600">
              <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", TOM_DO_GRUPO[g].ponto)} />
              {TOM_DO_GRUPO[g].titulo} · {plural(grupos[g].length, "evento", "eventos")}
            </h3>
            <ul className="m-0 list-none p-0">
              {grupos[g].map((l) => <LinhaForaDoPrazo key={l.eventId} l={l} grupo={g} etapa={etapa} />)}
            </ul>
          </section>
        ))
      )}
    </Painel>
  );
}

// ── Feitas × não feitas por evento ──────────────────────────────────────────

const LIMITE_DE_EVENTOS = 12;

function corDoAFazer(l: LinhaDaLogistica): string {
  if (l.situacao === "atrasado") return "bg-danger-strong";
  if (l.situacao === "vence_logo") return "bg-warning-strong";
  return "bg-primary/45";
}

function LinhaDeCobertura({ l, etapa }: { l: LinhaDaLogistica; etapa: EtapaDaLogistica }) {
  const r = ROTULOS_DA_ETAPA[etapa];
  const pct = (n: number) => (l.precisam > 0 ? (n / l.precisam) * 100 : 0);
  const segmentos = [
    { n: l.feitas, cor: "bg-success-strong", nome: r.feitas },
    { n: l.aFazer, cor: corDoAFazer(l), nome: r.aFazer },
    { n: l.esperandoEscala, cor: "bg-slate-300", nome: "esperando a escala" },
  ].filter((s) => s.n > 0); // segmento zerado não desenha 1px de cor falsa
  const descricao = segmentos.map((s) => `${s.n} ${s.nome}`).join(", ");
  return (
    <li>
      <Link
        href={destinoDaEtapa(etapa, l.eventId)}
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-surface-muted focus-visible:bg-brand-soft focus-visible:outline-none sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)_96px] xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)_96px]"
        data-testid={`cobertura-${etapa}-${l.eventId}`}
        title={`${l.nome}: ${descricao}. ${r.acao}`}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="line-clamp-1 min-w-0 text-[13px] font-medium text-foreground group-hover:text-primary">{l.nome}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
          </span>
          <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
            {l.rotuloDaData}
            {l.diasAteOEvento !== null && <> · {l.diasAteOEvento === 0 ? "hoje" : `em ${plural(l.diasAteOEvento, "dia", "dias")}`}</>}
            {(l.situacao === "atrasado" || l.situacao === "vence_logo") && (
              <span className={l.situacao === "atrasado" ? "font-semibold text-danger" : "font-semibold text-warning"}> · {textoDoAtraso(l.atraso)}</span>
            )}
          </span>
        </span>
        <span className="text-right leading-tight sm:order-3">
          <span className="block text-[13px] font-semibold tabular-nums text-foreground">{l.pctFeitas}%</span>
          <span className="block text-2xs tabular-nums text-muted-foreground">{l.feitas}/{l.precisam}</span>
        </span>
        <span
          role="img"
          aria-label={`${l.pctFeitas}% ${r.feitas}: ${descricao}`}
          className="col-span-2 flex h-2.5 min-w-0 overflow-hidden rounded-full bg-muted sm:order-2 sm:col-span-1"
        >
          {segmentos.map((s) => (
            <span key={s.nome} className={cn("h-full transition-[width] duration-300 motion-reduce:transition-none", s.cor)} style={{ width: `${pct(s.n)}%` }} />
          ))}
        </span>
      </Link>
    </li>
  );
}

export function CoberturaPorEvento({ etapa, linhas, titulo, pergunta }: {
  etapa: EtapaDaLogistica;
  linhas: LinhaDaLogistica[];
  titulo: string;
  pergunta: string;
}) {
  const [todos, setTodos] = useState(false);
  const r = ROTULOS_DA_ETAPA[etapa];
  const visiveis = todos ? linhas : linhas.slice(0, LIMITE_DE_EVENTOS);
  const precisam = linhas.reduce((s, l) => s + l.precisam, 0);
  const feitas = linhas.reduce((s, l) => s + l.feitas, 0);
  const completos = linhas.filter((l) => l.feitas === l.precisam).length;
  return (
    <Painel
      testid={`cobertura-${etapa}`}
      titulo={titulo}
      pergunta={pergunta}
      corpoRente
      resposta={linhas.length === 0 ? undefined : (
        <p className="m-0">
          <strong className="font-semibold text-foreground">{plural(feitas, r.umaFeita, r.feitas)}</strong> de {precisam.toLocaleString("pt-BR")} que {precisam === 1 ? "precisa" : "precisam"}
          {" "}({precisam > 0 ? Math.round((feitas / precisam) * 100) : 100}%) · {plural(completos, "evento completo", "eventos completos")} de {linhas.length}.
        </p>
      )}
      rodape={
        <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-success-strong" />{r.feitas}</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-danger-strong" />{r.aFazer} · prazo vencido</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-warning-strong" />{r.aFazer} · vence em até 3 dias</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-primary/45" />{r.aFazer} · no prazo</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-slate-300" />esperando a escala</span>
        </span>
      }
    >
      {linhas.length === 0 ? (
        <p className="m-0 px-4 py-3 text-[13px] text-muted-foreground" data-testid={`cobertura-${etapa}-vazia`}>
          Nenhum evento pela frente com vagas que {r.precisam} neste recorte.
        </p>
      ) : (
        <>
          <ul className="m-0 list-none divide-y divide-border p-0">
            {visiveis.map((l) => <LinhaDeCobertura key={l.eventId} l={l} etapa={etapa} />)}
          </ul>
          {linhas.length > LIMITE_DE_EVENTOS && (
            <div className="border-t border-border px-4 pt-2.5">
              <button
                type="button"
                onClick={() => setTodos((v) => !v)}
                className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={todos}
                data-testid={`cobertura-${etapa}-todos`}
              >
                {todos ? "Mostrar só os próximos" : `Mostrar todos os ${linhas.length} eventos`}
              </button>
            </div>
          )}
        </>
      )}
    </Painel>
  );
}
