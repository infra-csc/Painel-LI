/**
 * Extras da aba Buscar (etapa 2, 09/10 — "faz todos"):
 *  - `PrecosAcompanhados`: as escalações marcadas para acompanhar preço (o
 *    agendador checa 1x/dia), com o aviso de queda ou de tendência "subir";
 *  - `AlertasDeGrupo`: 10+ pessoas no mesmo trecho e dia → pedir tarifa de grupo;
 *  - `ResumoDeTendencia`: "N escalações com tendência de subir — compre
 *    primeiro" (só admin: é a aba Previsão resumida);
 *  - `AvisoDeRemarcacao`: a Busca aberta pelo aviso de alteração.
 *
 * Todos no mesmo formato de aviso da família (faixa com ícone, frase e uma
 * ação), em ordem de urgência, e só quando existem — nada de enfeite.
 */
import { useState } from "react";
import { BellRing, CalendarClock, Check, ChevronDown, Copy, Loader2, RefreshCw, Search, TrendingUp, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AlertaDeGrupo } from "@shared/regras-da-busca";
import { moeda } from "@/components/tickets/analises/formato";
import { ddmm, diaCurto, haQuanto, plural } from "./formato";
import { useAcoesDoAcompanhamento, type ListaDeAcompanhamentos, type AcompanhamentoNaTela } from "./use-busca-de-passagens";
import { VISUAL_DA_TENDENCIA } from "./analises/previsao";

// ── Faixa de aviso (a mesma geometria dos avisos de teto da tela) ──────────

function Faixa({ tom, icone, children, acoes, testid, role = "status" }: {
  tom: "alerta" | "perigo" | "marca" | "neutro"; icone: React.ReactNode; children: React.ReactNode; acoes?: React.ReactNode; testid: string; role?: "status" | "alert";
}) {
  const cls = {
    alerta: "border-warning/30 bg-warning-soft/50",
    perigo: "border-danger/25 bg-danger-soft/50",
    marca: "border-primary/25 bg-brand-soft/60",
    neutro: "border-border bg-card",
  }[tom];
  return (
    <div role={role} className={cn("pas-entra flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-2.5", cls)} data-testid={testid}>
      <span className="shrink-0" aria-hidden="true">{icone}</span>
      <div className="min-w-0 flex-1 basis-[260px] text-sm leading-5 text-foreground">{children}</div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{acoes}</div>}
    </div>
  );
}

// ── Remarcação pelo aviso de alteração ─────────────────────────────────────

export function AvisoDeRemarcacao({ numeros, onFechar }: { numeros: Array<{ numero: number | null; ida: string | null; volta: string | null }>; onFechar: () => void }) {
  if (numeros.length === 0) return null;
  return (
    <Faixa tom="marca" testid="aviso-remarcacao" icone={<CalendarClock className="h-4 w-4 text-primary" />}
      acoes={<button type="button" onClick={onFechar} aria-label="Fechar o aviso de remarcação" className="pas-alvo inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"><X className="h-4 w-4" aria-hidden="true" /></button>}>
      <span className="font-semibold">Remarcação pelo aviso de alteração.</span>{" "}
      <span className="text-slate-600">
        A busca usa as datas NOVAS da escalação ({numeros.map((n) => `#${n.numero ?? "?"}: ${[n.ida && `ida ${ddmm(n.ida)}`, n.volta && `volta ${ddmm(n.volta)}`].filter(Boolean).join(", ")}`).join(" · ")}), não as da passagem registrada.
      </span>
    </Faixa>
  );
}

// ── Tendência (resumo da Previsão — só admin) ──────────────────────────────

export function ResumoDeTendencia({ ids, emBreve, onSelecionar, onVerPrevisao }: { ids: string[]; emBreve: number; onSelecionar: () => void; onVerPrevisao: () => void }) {
  if (ids.length === 0) return null;
  return (
    <Faixa tom="perigo" testid="resumo-tendencia" icone={<TrendingUp className="h-4 w-4 text-danger" />}
      acoes={<>
        <Button size="sm" variant="outline" className="h-8 rounded-lg bg-card" onClick={onVerPrevisao}>Ver previsão</Button>
        <Button size="sm" className="h-8 rounded-lg" onClick={onSelecionar} data-testid="selecionar-tendencia-subir">Selecionar {ids.length === 1 ? "esta" : `estas ${ids.length}`}</Button>
      </>}>
      <span className="font-semibold">{plural(ids.length, "escalação com tendência de subir", "escalações com tendência de subir")} — compre primeiro.</span>{" "}
      <span className="text-slate-600">{emBreve > 0 ? `${emBreve} com voo em até 14 dias. ` : ""}Estimativa pelo histórico das rotas, não certeza.</span>
    </Faixa>
  );
}

// ── Alerta de grupo ────────────────────────────────────────────────────────

export function AlertasDeGrupo({ alertas, onSelecionar }: { alertas: AlertaDeGrupo[]; onSelecionar: (ids: string[]) => void }) {
  const { toast } = useToast();
  const [aberto, setAberto] = useState<string | null>(null);
  if (alertas.length === 0) return null;
  const copiar = (a: AlertaDeGrupo) => {
    const texto = [`Tarifa de grupo — ${a.origem} → ${a.destino} em ${ddmm(a.data)} (${a.vagas.length} pessoas)`, ...a.vagas.map((v) => `#${v.numero ?? "?"} ${toTitleCase(v.nome)}`)].join("\n");
    void navigator.clipboard?.writeText(texto).then(() => toast({ title: "Lista copiada", description: "Cole no e-mail para a companhia." })).catch(() => undefined);
  };
  return (
    <>
      {alertas.map((a) => (
        <div key={a.chave} className="pas-entra overflow-hidden rounded-xl border border-info/30 bg-info-soft/50" data-testid={`alerta-grupo-${a.origem}-${a.destino}-${a.data}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
            <Users className="h-4 w-4 shrink-0 text-info-strong" aria-hidden="true" />
            <p className="m-0 min-w-0 flex-1 basis-[260px] text-sm leading-5 text-foreground">
              <span className="font-semibold">{a.vagas.length} pessoas voam <span className="font-mono">{a.origem} → {a.destino}</span> em {diaCurto(a.data)}</span>{" "}
              <span className="text-slate-600">— peça tarifa de grupo à companhia antes de comprar uma a uma.</span>
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 rounded-lg bg-card" aria-expanded={aberto === a.chave} onClick={() => setAberto((x) => (x === a.chave ? null : a.chave))}>
                Ver a lista<ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", aberto === a.chave && "rotate-180")} aria-hidden="true" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 rounded-lg bg-card" onClick={() => copiar(a)}><Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Copiar</Button>
              <Button size="sm" variant="outline" className="h-8 rounded-lg bg-card" onClick={() => onSelecionar(a.vagas.map((v) => v.vagaId))}>Selecionar</Button>
            </div>
          </div>
          {aberto === a.chave && (
            <ul className="m-0 grid list-none gap-x-6 gap-y-1 border-t border-info/20 bg-card/70 px-4 py-2.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {a.vagas.map((v) => (
                <li key={v.vagaId} className="flex min-w-0 items-center gap-2"><span className="font-mono font-semibold text-primary">#{v.numero ?? "?"}</span><span className="truncate text-slate-700">{toTitleCase(v.nome)}</span></li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}

// ── Preços acompanhados ────────────────────────────────────────────────────

function LinhaAcompanhada({ a, onBuscar, onParar, parando }: { a: AcompanhamentoNaTela; onBuscar: (id: string) => void; onParar: (id: string) => void; parando: boolean }) {
  // Arredonda o módulo (−12,5% vira −13%, igual ao texto do aviso).
  const variacao = a.precoInicial && a.ultimoPreco ? Math.sign(a.ultimoPreco - a.precoInicial) * Math.round(Math.abs((a.ultimoPreco - a.precoInicial) / a.precoInicial) * 100) : null;
  const t = a.tendencia ? VISUAL_DA_TENDENCIA[a.tendencia] : null;
  const IconeT = t?.icone;
  return (
    <li className={cn("bpa-acomp", !a.ativo && "opacity-70")} data-testid={`acompanhamento-${a.teamInclusionId}`}>
      <div data-area="quem" className="min-w-0">
        <p className="m-0 flex min-w-0 items-center gap-2 text-sm">
          {a.avisoNovo && <span className="h-2 w-2 shrink-0 rounded-full bg-warning-strong" aria-label="Aviso novo" />}
          <span className="font-mono text-2xs font-semibold text-primary">#{a.inclusionNumber ?? "?"}</span>
          <span className="truncate font-medium text-foreground">{toTitleCase(a.colaborador ?? "A definir")}</span>
        </p>
        <p className="m-0 truncate text-2xs text-muted-foreground"><span className="font-mono">{a.rotas.join(" + ") || "rota"}</span> · {a.eventName ?? "Evento"}</p>
      </div>
      <div data-area="preco" className="min-w-0 text-xs">
        {a.ultimoPreco ? (
          <p className="m-0 tabular-nums">
            <span className="text-sm font-semibold text-foreground">{moeda(a.ultimoPreco)}</span>
            {a.precoInicial && a.precoInicial !== a.ultimoPreco && <span className="ml-1.5 text-muted-foreground">era {moeda(a.precoInicial)}{variacao !== null && <span className={cn("ml-1 font-semibold", variacao < 0 ? "text-success" : "text-danger")}>{variacao > 0 ? "+" : "−"}{Math.abs(variacao)}%</span>}</span>}
          </p>
        ) : <p className="m-0 text-muted-foreground">sem preço ainda — entra na próxima checagem</p>}
        <p className="m-0 text-2xs text-muted-foreground">{a.ativo ? (a.ultimaChecagemEm ? `checado ${haQuanto(a.ultimaChecagemEm)}` : "aguardando a primeira checagem") : a.motivoParada ?? "parado"}</p>
      </div>
      <div data-area="aviso" className="min-w-0">
        {a.avisoTexto ? (
          <p className={cn("m-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold", a.aviso === "caiu" ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
            {a.aviso === "caiu" ? <TrendingUp className="h-3 w-3 rotate-180" aria-hidden="true" /> : <TrendingUp className="h-3 w-3" aria-hidden="true" />}{a.avisoTexto}
          </p>
        ) : t && IconeT ? (
          <p className={cn("m-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium", t.pilula)}><IconeT className="h-3 w-3" aria-hidden="true" />{t.rotulo}</p>
        ) : null}
      </div>
      <div data-area="acoes" className="flex items-center justify-end gap-1">
        {a.ativo && (
          <>
            <Button size="sm" variant="ghost" className="pas-alvo h-8 rounded-lg px-2 text-xs" onClick={() => onBuscar(a.teamInclusionId)}><Search className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Selecionar</Button>
            <Button size="sm" variant="ghost" className="pas-alvo h-8 rounded-lg px-2 text-xs text-muted-foreground hover:text-danger" onClick={() => onParar(a.id)} disabled={parando} data-testid={`parar-acompanhamento-${a.teamInclusionId}`}>Parar</Button>
          </>
        )}
      </div>
    </li>
  );
}

export function PrecosAcompanhados({ dados, aberto, onAbrir, admin, onSelecionar }: {
  dados: ListaDeAcompanhamentos | undefined;
  aberto: boolean;
  onAbrir: (v: boolean) => void;
  admin: boolean;
  onSelecionar: (vagaId: string) => void;
}) {
  const { toast } = useToast();
  const { parar, vistos, checar } = useAcoesDoAcompanhamento();
  if (!dados || dados.itens.length === 0) return null;
  const ativos = dados.itens.filter((i) => i.ativo);
  const novos = dados.itens.filter((i) => i.avisoNovo);
  const pararUm = (id: string) => parar.mutate(id, {
    onSuccess: () => toast({ title: "Parou de acompanhar", description: "A escalação sai da checagem diária." }),
    onError: (e) => toast({ title: "Não foi possível parar", description: apiErrorMessage(e, "Tente de novo."), variant: "destructive" }),
  });
  const checarAgora = () => checar.mutate(undefined, {
    onSuccess: (r) => toast({
      title: "Preços checados",
      description: `${plural(r.checadas, "escalação", "escalações")} · ${plural(r.consultas, "consulta gasta", "consultas gastas")}${r.avisos ? ` · ${plural(r.avisos, "aviso novo", "avisos novos")}` : ""}${r.puladas ? ` · ${r.puladas} sem checar (teto do mês)` : ""}.`,
    }),
    onError: (e) => toast({ title: "Não foi possível checar", description: apiErrorMessage(e, "Tente de novo."), variant: "destructive" }),
  });
  return (
    <section className={cn("pas-entra overflow-hidden rounded-xl border bg-card", novos.length ? "border-warning/35" : "border-border")} aria-label="Preços acompanhados" data-testid="precos-acompanhados">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <button type="button" onClick={() => onAbrir(!aberto)} aria-expanded={aberto} className="flex min-w-0 flex-1 basis-[260px] items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="abrir-acompanhados">
          <BellRing className={cn("h-4 w-4 shrink-0", novos.length ? "text-warning-strong" : "text-muted-foreground")} aria-hidden="true" />
          <span className="min-w-0 text-sm leading-5">
            <span className="font-semibold text-foreground">Preços acompanhados</span>
            <span className="text-muted-foreground"> · {ativos.length} de {dados.limite} · checagem diária às {dados.hora}h</span>
            {novos.length > 0 && <span className="ml-2 inline-flex h-5 items-center rounded-md bg-warning-soft px-1.5 text-2xs font-semibold text-warning-strong">{plural(novos.length, "mudou", "mudaram")}</span>}
          </span>
          <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150", aberto && "rotate-180")} aria-hidden="true" />
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {novos.length > 0 && (
            <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => vistos.mutate(undefined)} disabled={vistos.isPending} data-testid="avisos-vistos">
              {vistos.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}Marcar como visto
            </Button>
          )}
          {admin && ativos.length > 0 && (
            <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={checarAgora} disabled={checar.isPending} title="Roda a checagem agora — rota no cache não gasta; respeita o teto do mês" data-testid="checar-agora">
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", checar.isPending && "animate-spin")} aria-hidden="true" />Checar agora
            </Button>
          )}
        </div>
      </div>
      {aberto && (
        <ul className="m-0 list-none border-t border-border p-0">
          {dados.itens.map((a) => <LinhaAcompanhada key={a.id} a={a} onBuscar={onSelecionar} onParar={pararUm} parando={parar.isPending} />)}
        </ul>
      )}
      {aberto && (
        <p className="m-0 border-t border-border bg-surface-muted px-4 py-2 text-2xs leading-4 text-muted-foreground">
          Uma vez por dia o app consulta as rotas acompanhadas (rota no cache não gasta; no teto do mês, pula). Avisa no sino quando o preço cai {dados.quedaPct}% ou mais, ou quando a tendência vira “subir”. Para sozinho quando a passagem é registrada.
        </p>
      )}
    </section>
  );
}
