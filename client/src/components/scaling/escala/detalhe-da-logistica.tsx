/**
 * Detalhes da logística da aba Escala (23/10) — no padrão do detalhe do
 * Quadro de prazos (scaling-analytics-quadro-detalhe): cabeçalho com o
 * contexto, a lista que forma o número clicado, "Copiar lista" e a ação que
 * leva à tela onde aquilo se resolve.
 *
 * - DetalheDaFuncao: a célula função × (Passagem | Carro/van | Hotel | Sem
 *   nome), ou o nome da função. Cada vaga com a viagem completa.
 * - DetalheDoDia: quem chega, quem sai e quem dorme no hotel num dia, por
 *   horário — o que Compras e o Uber/transfer precisam para planejar. Com
 *   `functionId` (clique numa célula do quadro), o mesmo dia recortado pela
 *   função, com a aba "Na escala" (quem trabalha). O hotel da noite separa quem
 *   precisa e ainda não tem reserva de quem já está reservado.
 *
 * As listas leem o MESMO resumo (shared/logistica-da-escala) que pinta as
 * células: o número da célula e o tamanho da lista batem por construção.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowRight, BedDouble, Check, Copy, PlaneLanding, PlaneTakeoff, Search, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { hasPermission } from "@/lib/role-utils";
import { cn } from "@/lib/utils";
import type { TeamInclusion } from "@shared/schema";
import {
  faltaNoMovimento, minutoDoMovimento, noiteNoHotel, resumoDoMovimento,
  type EstadoDoItem, type LogisticaDaCelula, type LogisticaDaVagaNaEscala, type Movimento, type ResumoDaLogistica,
} from "@shared/logistica-da-escala";
import { somarDiasISO } from "@shared/janela-de-viagem";
import { CartaoDaViagem, type FocoDoCartao } from "./cartao-da-viagem";
import {
  codigosDaPassagem, diaCurto, diaPorExtenso, dm, horaDaLista, horarioDoTrecho, modoECompanhia, movimentoEmTexto, ORIGEM_DAS_NOITES, plural, rotaDoTrecho,
} from "./formatos";

const BUSCA_A_PARTIR_DE = 15;

export interface ContextoDaEscala {
  resumo: ResumoDaLogistica;
  /** A mesma logística recortada por função × dia (as células do quadro). */
  celulas: Map<string, Map<string, LogisticaDaCelula>>;
  vagaPorId: Map<string, TeamInclusion>;
  nomeDaVaga: (v: TeamInclusion) => string | null;
  nomeDaFuncao: (functionId: string) => string;
  /** Um evento marcado no filtro (as ações levam a ele). */
  eventoUnico: { id: string; name: string } | null;
  onAbrirVaga: (v: TeamInclusion) => void;
  onEscalarFuncao: (nomeDaFuncao: string) => void;
}

// ── Casca comum ───────────────────────────────────────────────────────────

function Casca({ eyebrow, titulo, descricao, abas, children, rodape, onFechar, testId }: {
  eyebrow: string; titulo: string; descricao: ReactNode; abas?: ReactNode; children: ReactNode; rodape: ReactNode; onFechar: () => void; testId: string;
}) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent
        className="flex max-h-[88vh] max-w-[760px] flex-col gap-0 overflow-hidden p-0 [&>button:last-child]:hidden max-sm:h-[100dvh] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0"
        data-testid={testId}
      >
        <div className="flex items-start gap-3 border-b border-border px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">{eyebrow}</p>
            <DialogTitle className="mt-1 truncate text-lg font-semibold leading-tight text-foreground" title={titulo}>{titulo}</DialogTitle>
            <DialogDescription asChild>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">{descricao}</div>
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </DialogClose>
        </div>
        {abas && <div className="border-b border-border px-5 py-2.5">{abas}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
        <div className="grid grid-cols-2 gap-2 border-t border-border bg-background px-5 py-3 sm:flex sm:items-center sm:justify-end">{rodape}</div>
      </DialogContent>
    </Dialog>
  );
}

function Abas<K extends string>({ opcoes, valor, onValor, rotulo }: {
  opcoes: { key: K; rotulo: string; detalhe?: string; tom?: "ok" | "falta" | "neutro" }[]; valor: K; onValor: (k: K) => void; rotulo: string;
}) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="group" aria-label={rotulo}>
      {opcoes.map((o) => {
        const ativo = o.key === valor;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={ativo}
            onClick={() => onValor(o.key)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition-colors sm:h-8",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativo ? "border-primary bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:bg-surface-muted",
            )}
            data-testid={`aba-${o.key}`}
          >
            {o.rotulo}
            {o.detalhe && (
              <span className={cn(
                "tabular-nums font-semibold",
                ativo ? "text-primary" : o.tom === "falta" ? "text-warning" : o.tom === "ok" ? "text-success" : "text-muted-foreground",
              )}>{o.detalhe}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function useCopiar() {
  const { toast } = useToast();
  return (texto: string, descricao: string) => {
    void navigator.clipboard?.writeText(texto)
      .then(() => toast({ title: "Lista copiada", description: descricao }))
      .catch(() => toast({ title: "Não foi possível copiar", description: "Selecione a lista e copie à mão.", variant: "destructive" }));
  };
}

function Vazio({ children }: { children: ReactNode }) {
  return <div className="mt-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground" data-testid="logistica-vazio">{children}</div>;
}

function BuscaDaLista({ valor, onValor }: { valor: string; onValor: (v: string) => void }) {
  return (
    <div className="relative mb-2">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input value={valor} onChange={(e) => onValor(e.target.value)} placeholder="Buscar por nome, função ou #número" aria-label="Buscar na lista" className="h-11 pl-9 sm:h-9" data-testid="logistica-busca" />
    </div>
  );
}

// ── Detalhe por função ────────────────────────────────────────────────────

export type FocoDaFuncao = "todas" | "passagem" | "terrestre" | "hotel" | "sem_nome";
export interface AlvoDaFuncao { tipo: "funcao"; functionId: string | null; foco: FocoDaFuncao }

const ROTULO_DO_FOCO: Record<Exclude<FocoDaFuncao, "todas">, string> = {
  passagem: "Passagem", terrestre: "Carro/van", hotel: "Hotel", sem_nome: "Sem nome",
};

const estadoNoFoco = (l: LogisticaDaVagaNaEscala, foco: FocoDaFuncao): EstadoDoItem | "sem_nome" | "com_nome" =>
  foco === "passagem" ? l.passagem : foco === "terrestre" ? l.terrestre : foco === "hotel" ? l.hotel
    : foco === "sem_nome" ? (l.semNome ? "sem_nome" : "com_nome") : "tem";

export function DetalheDaFuncao({ alvo, ctx, onFechar }: { alvo: AlvoDaFuncao; ctx: ContextoDaEscala; onFechar: () => void }) {
  const { user } = useAuth();
  const [, navegar] = useLocation();
  const copiar = useCopiar();
  const [foco, setFoco] = useState<FocoDaFuncao>(alvo.foco);
  const [busca, setBusca] = useState("");

  const doRecorte = useMemo(
    () => Array.from(ctx.resumo.porVaga.values()).filter((l) => alvo.functionId === null || l.functionId === alvo.functionId),
    [ctx.resumo, alvo.functionId],
  );
  const agregado = alvo.functionId ? ctx.resumo.porFuncao.get(alvo.functionId) : null;
  const tot = agregado ?? ctx.resumo.total;
  const nomeDaFuncao = alvo.functionId ? ctx.nomeDaFuncao(alvo.functionId) : "Todas as funções";

  const lista = useMemo(() => {
    const relevantes = doRecorte.filter((l) => {
      const e = estadoNoFoco(l, foco);
      return foco === "todas" || (foco === "sem_nome" ? e === "sem_nome" : e !== "nao_precisa");
    });
    const peso = (l: LogisticaDaVagaNaEscala) => (estadoNoFoco(l, foco) === "falta" ? 0 : 1);
    const quando = (l: LogisticaDaVagaNaEscala) => (l.chegada ? `${l.chegada.dia}${String(minutoDoMovimento(l.chegada)).padStart(4, "0")}` : "9");
    return relevantes.sort((a, b) => peso(a) - peso(b) || quando(a).localeCompare(quando(b))
      || (ctx.vagaPorId.get(a.vagaId)?.inclusionNumber ?? 0) - (ctx.vagaPorId.get(b.vagaId)?.inclusionNumber ?? 0));
  }, [doRecorte, foco, ctx.vagaPorId]);

  const texto = (l: LogisticaDaVagaNaEscala) => {
    const v = ctx.vagaPorId.get(l.vagaId);
    return v ? `#${v.inclusionNumber} ${ctx.nomeDaVaga(v) ?? "sem nome"} ${ctx.nomeDaFuncao(v.functionId)}` : "";
  };
  const termo = busca.trim().toLowerCase().replace(/#/g, "");
  const filtradas = termo ? lista.filter((l) => texto(l).toLowerCase().includes(termo)) : lista;
  const faltam = filtradas.filter((l) => estadoNoFoco(l, foco) === "falta");
  const resolvidas = filtradas.filter((l) => estadoNoFoco(l, foco) !== "falta");
  const temSecoes = foco === "passagem" || foco === "terrestre" || foco === "hotel";

  const razao = (c: { precisam: number; tem: number }) => (c.precisam === 0 ? "—" : `${c.tem}/${c.precisam}`);
  const tom = (c: { precisam: number; tem: number }) => (c.precisam === 0 ? "neutro" : c.tem >= c.precisam ? "ok" : "falta") as "ok" | "falta" | "neutro";
  const abas = [
    { key: "todas" as const, rotulo: "Todas", detalhe: String(tot.vagas) },
    { key: "passagem" as const, rotulo: "Passagem", detalhe: razao(tot.passagem), tom: tom(tot.passagem) },
    { key: "terrestre" as const, rotulo: "Carro/van", detalhe: razao(tot.terrestre), tom: tom(tot.terrestre) },
    { key: "hotel" as const, rotulo: "Hotel", detalhe: razao(tot.hotel), tom: tom(tot.hotel) },
    { key: "sem_nome" as const, rotulo: "Sem nome", detalhe: String(tot.semNome), tom: (tot.semNome > 0 ? "falta" : "neutro") as "falta" | "neutro" },
  ];

  const evento = ctx.eventoUnico;
  const acao = (() => {
    const ir = (href: string) => () => { onFechar(); navegar(href); };
    if (foco === "sem_nome" && alvo.functionId) {
      return { rotulo: "Escalar na Fila de trabalho", pode: true, ir: () => { onFechar(); ctx.onEscalarFuncao(nomeDaFuncao); } };
    }
    if (foco === "hotel") {
      return { rotulo: "Abrir no Espelho operacional", pode: hasPermission(user ?? null, "canAccessScreen3"), ir: ir(evento ? `/operational-mirror?eventId=${encodeURIComponent(evento.id)}` : "/operational-mirror") };
    }
    return { rotulo: "Abrir em Passagens", pode: hasPermission(user ?? null, "canAccessScreen3"), ir: ir(evento ? `/tickets?event=${encodeURIComponent(evento.id)}` : "/tickets") };
  })();

  const copiarLista = () => {
    const cab = `${evento?.name ?? "Escala"} — ${nomeDaFuncao}${foco !== "todas" ? ` · ${ROTULO_DO_FOCO[foco]}` : ""}`;
    const linhas = filtradas.map((l) => {
      const v = ctx.vagaPorId.get(l.vagaId);
      if (!v) return "";
      const ida = l.chegada ? `chega ${dm(l.chegada.dia)} ${horaDaLista(l.chegada)}` : null;
      const volta = l.saida ? `sai ${dm(l.saida.dia)} ${horaDaLista(l.saida)}` : null;
      const estado = foco !== "todas" && foco !== "sem_nome" ? (estadoNoFoco(l, foco) === "falta" ? "FALTA" : "ok") : null;
      return [`#${v.inclusionNumber}`, ctx.nomeDaVaga(v) ?? "sem nome", alvo.functionId ? null : ctx.nomeDaFuncao(v.functionId), estado, ida, volta].filter(Boolean).join(" · ");
    });
    copiar([cab, ...linhas].join("\n"), "Cole na mensagem para Compras ou para a área.");
  };

  const cartao = (l: LogisticaDaVagaNaEscala) => {
    const v = ctx.vagaPorId.get(l.vagaId);
    if (!v) return null;
    return (
      <li key={l.vagaId}>
        <CartaoDaViagem
          vaga={v}
          l={l}
          nome={ctx.nomeDaVaga(v)}
          funcao={alvo.functionId ? null : ctx.nomeDaFuncao(v.functionId)}
          foco={foco === "todas" ? null : (foco as FocoDoCartao)}
          onAbrirVaga={(vaga) => { onFechar(); ctx.onAbrirVaga(vaga); }}
        />
      </li>
    );
  };

  const f = agregado;
  return (
    <Casca
      testId="detalhe-logistica-funcao"
      eyebrow={`Logística${evento ? ` · ${evento.name}` : ""}`}
      titulo={nomeDaFuncao}
      onFechar={onFechar}
      descricao={(
        <>
          <span><span className="font-semibold tabular-nums text-foreground">{tot.vagas}</span> {plural(tot.vagas, "vaga", "vagas")}</span>
          {f?.primeiraChegada && (
            <span className="inline-flex items-center gap-1"><PlaneLanding className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />1ª chegada <span className="font-semibold tabular-nums text-foreground">{diaCurto(f.primeiraChegada.dia)} {horaDaLista(f.primeiraChegada)}</span></span>
          )}
          {f?.ultimaSaida && (
            <span className="inline-flex items-center gap-1"><PlaneTakeoff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />última saída <span className="font-semibold tabular-nums text-foreground">{diaCurto(f.ultimaSaida.dia)} {horaDaLista(f.ultimaSaida)}</span></span>
          )}
        </>
      )}
      abas={<Abas opcoes={abas} valor={foco} onValor={(k) => { setFoco(k); setBusca(""); }} rotulo="O que mostrar" />}
      rodape={(
        <>
          {filtradas.length > 0 && (
            <Button type="button" variant="outline" className="h-11 gap-1.5 sm:mr-auto sm:h-9" onClick={copiarLista} data-testid="logistica-copiar">
              <Copy className="h-4 w-4" aria-hidden="true" /> Copiar lista
            </Button>
          )}
          <DialogClose asChild>
            <Button type="button" variant="outline" className={cn("h-11 sm:h-9", filtradas.length === 0 && "col-span-2")}>Fechar</Button>
          </DialogClose>
          {acao.pode && (
            <Button type="button" className="order-first col-span-2 h-11 gap-1.5 sm:order-none sm:h-9" onClick={acao.ir} data-testid="logistica-acao">
              {acao.rotulo} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </>
      )}
    >
      {lista.length > BUSCA_A_PARTIR_DE && <BuscaDaLista valor={busca} onValor={setBusca} />}
      {lista.length === 0 ? (
        <Vazio>
          {foco === "sem_nome" ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-success">Todas as vagas têm nome <Check className="h-4 w-4" aria-hidden="true" /></span>
          ) : foco === "todas" ? "Nenhuma vaga neste recorte." : `Ninguém ${alvo.functionId ? "nesta função" : "no recorte"} precisa ${foco === "passagem" ? "de passagem" : foco === "terrestre" ? "de carro/van" : "de hotel"}.`}
        </Vazio>
      ) : termo && filtradas.length === 0 ? (
        <Vazio>Nenhuma vaga com “{busca.trim()}”.</Vazio>
      ) : temSecoes ? (
        <>
          {faltam.length > 0 && (
            <section aria-label="Faltam">
              <h3 className="pt-1 text-2xs font-semibold uppercase tracking-[0.05em] text-warning" data-testid="logistica-faltam">Faltam · {faltam.length}</h3>
              <ul className="divide-y divide-border">{faltam.map(cartao)}</ul>
            </section>
          )}
          {resolvidas.length > 0 && (
            <section aria-label="Resolvidas" className={faltam.length > 0 ? "mt-3 border-t border-border pt-3" : ""}>
              <h3 className="pt-1 text-2xs font-semibold uppercase tracking-[0.05em] text-success" data-testid="logistica-resolvidas">Resolvidas · {resolvidas.length}</h3>
              <ul className="divide-y divide-border">{resolvidas.map(cartao)}</ul>
            </section>
          )}
        </>
      ) : (
        <ul className="divide-y divide-border" data-testid="logistica-lista">{filtradas.map(cartao)}</ul>
      )}
    </Casca>
  );
}

// ── Detalhe por dia (e por função × dia) ──────────────────────────────────

export type FocoDoDia = "trabalham" | "chegam" | "saem" | "hotel";
/**
 * O dia inteiro (rodapé, agenda) ou uma célula do quadro (`functionId`): a
 * mesma lista, recortada pela função.
 */
export interface AlvoDoDia { tipo: "dia"; dia: string; foco: FocoDoDia; functionId?: string | null }

const DIA_VAZIO = { chegam: [] as Movimento[], saem: [] as Movimento[], noHotel: [] as string[], semReserva: [] as string[], trabalham: [] as string[] };

type ItemDoHotel = { v: TeamInclusion; l: LogisticaDaVagaNaEscala };

export function DetalheDoDia({ alvo, ctx, onFechar }: { alvo: AlvoDoDia; ctx: ContextoDaEscala; onFechar: () => void }) {
  const { user } = useAuth();
  const [, navegar] = useLocation();
  const copiar = useCopiar();
  const daFuncao = alvo.functionId ?? null;
  const [foco, setFoco] = useState<FocoDoDia>(alvo.foco === "trabalham" && !daFuncao ? "chegam" : alvo.foco);

  const base = useMemo(() => {
    if (daFuncao) {
      const c = ctx.celulas.get(daFuncao)?.get(alvo.dia);
      return c ? { chegam: c.chegam, saem: c.saem, noHotel: c.noHotel, semReserva: c.semReserva, trabalham: c.trabalham } : DIA_VAZIO;
    }
    const d = ctx.resumo.porDia.get(alvo.dia);
    return d ? { ...d, trabalham: [] as string[] } : DIA_VAZIO;
  }, [ctx.celulas, ctx.resumo, daFuncao, alvo.dia]);

  const movimentos = foco === "chegam" ? base.chegam : foco === "saem" ? base.saem : [];
  const { reservados, semReserva, trabalham } = useMemo(() => {
    const itens = (ids: readonly string[]) => ids.map((id) => ({ v: ctx.vagaPorId.get(id), l: ctx.resumo.porVaga.get(id) }))
      .filter((x): x is ItemDoHotel => !!x.v && !!x.l);
    const porNome = (a: ItemDoHotel, b: ItemDoHotel) => (ctx.nomeDaVaga(a.v) ?? "~").localeCompare(ctx.nomeDaVaga(b.v) ?? "~", "pt-BR");
    const porHotel = (a: ItemDoHotel, b: ItemDoHotel) =>
      String(a.l.hospedagem?.hotelName ?? "").localeCompare(String(b.l.hospedagem?.hotelName ?? ""), "pt-BR") || porNome(a, b);
    return {
      reservados: itens(base.noHotel).sort(porHotel),
      semReserva: itens(base.semReserva).sort(porNome),
      trabalham: itens(base.trabalham).sort(porNome),
    };
  }, [base, ctx]);
  const noite = noiteNoHotel(base);

  const sugestoes = movimentos.filter((m) => m.fonte === "sugestao").length;
  const evento = ctx.eventoUnico;
  const podeCompras = hasPermission(user ?? null, "canAccessScreen3");
  const nomeDaFuncao = daFuncao ? ctx.nomeDaFuncao(daFuncao) : null;
  const textoDaNoite = noite.precisam === 0 ? "ninguém no hotel" : `hotel: ${noite.reservados} de ${noite.precisam} ${plural(noite.precisam, "reservado", "reservados")}`;

  const copiarLista = () => {
    const recorte = [nomeDaFuncao, diaPorExtenso(alvo.dia)].filter(Boolean).join(" · ");
    const cab = `${evento?.name ?? "Escala"} — ${recorte} · ${
      foco === "chegam" ? resumoDoMovimento("Chegam", base.chegam)
        : foco === "saem" ? resumoDoMovimento("Saem", base.saem)
          : foco === "hotel" ? `No hotel: ${noite.reservados} de ${noite.precisam} reservados`
            : `Na escala: ${trabalham.length}`}`;
    const nomeEFuncao = (v: TeamInclusion) => `${ctx.nomeDaVaga(v) ?? "sem nome"} (${ctx.nomeDaFuncao(v.functionId)})`;
    const linhas = foco === "hotel"
      ? [
        ...semReserva.map(({ v, l }) => `${nomeEFuncao(v)} · SEM RESERVA · precisa ${dm(l.noitesQuePrecisa[0])} → ${dm(somarDiasISO(l.noitesQuePrecisa[l.noitesQuePrecisa.length - 1], 1))}`),
        ...reservados.map(({ v, l }) => `${nomeEFuncao(v)} · ${l.hospedagem?.hotelName ?? ""} · ${dm(l.hospedagem?.checkInDate ?? null)} → ${dm(l.hospedagem?.checkOutDate ?? null)}`),
      ]
      : foco === "trabalham"
        ? trabalham.map(({ v, l }) => [`#${v.inclusionNumber}`, nomeEFuncao(v), l.chegada ? `chega ${dm(l.chegada.dia)} ${horaDaLista(l.chegada)}` : null, l.saida ? `sai ${dm(l.saida.dia)} ${horaDaLista(l.saida)}` : null].filter(Boolean).join(" · "))
        : movimentos.map((m) => {
          const v = ctx.vagaPorId.get(m.vagaId);
          return v ? movimentoEmTexto(m, ctx.nomeDaVaga(v) ?? "sem nome", ctx.nomeDaFuncao(v.functionId)) : "";
        });
    copiar([cab, ...linhas].join("\n"), foco === "hotel" ? "Cole na mensagem para o hotel ou para Compras." : "Cole na mensagem do Uber/transfer ou de Compras.");
  };
  const vazio = foco === "hotel" ? noite.precisam === 0 : foco === "trabalham" ? trabalham.length === 0 : movimentos.length === 0;
  const acaoDoHotel = foco === "hotel";

  const opcoes: { key: FocoDoDia; rotulo: string; detalhe?: string; tom?: "ok" | "falta" | "neutro" }[] = [
    ...(daFuncao ? [{ key: "trabalham" as const, rotulo: "Na escala", detalhe: String(base.trabalham.length) }] : []),
    { key: "chegam", rotulo: "Chegam", detalhe: String(base.chegam.length) },
    { key: "saem", rotulo: "Saem", detalhe: String(base.saem.length) },
    {
      key: "hotel", rotulo: "No hotel",
      detalhe: noite.precisam === 0 ? "—" : `${noite.reservados}/${noite.precisam}`,
      tom: noite.estado === "falta" ? "falta" : noite.estado === "ok" ? "ok" : "neutro",
    },
  ];

  return (
    <Casca
      testId="detalhe-logistica-dia"
      eyebrow={`${daFuncao ? "Logística da função no dia" : "Chegadas e saídas"}${evento ? ` · ${evento.name}` : ""}`}
      titulo={nomeDaFuncao ? `${nomeDaFuncao} · ${diaPorExtenso(alvo.dia)}` : diaPorExtenso(alvo.dia)}
      onFechar={onFechar}
      descricao={(
        <>
          {daFuncao && (base.trabalham.length > 0
            ? <span><span className="font-semibold tabular-nums text-foreground">{base.trabalham.length}</span> na escala</span>
            : <span>ninguém trabalha no dia</span>)}
          <span className="inline-flex items-center gap-1"><PlaneLanding className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{resumoDoMovimento("Chegam", base.chegam)}</span>
          <span className="inline-flex items-center gap-1"><PlaneTakeoff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{resumoDoMovimento("Saem", base.saem)}</span>
          <span className={cn("inline-flex items-center gap-1", noite.estado === "falta" && "font-medium text-warning")}>
            <BedDouble className={cn("h-3.5 w-3.5", noite.estado === "falta" ? "text-warning" : "text-muted-foreground")} aria-hidden="true" />
            {textoDaNoite}
          </span>
        </>
      )}
      abas={<Abas rotulo="O que mostrar" valor={foco} onValor={setFoco} opcoes={opcoes} />}
      rodape={(
        <>
          {!vazio && (
            <Button type="button" variant="outline" className="h-11 gap-1.5 sm:mr-auto sm:h-9" onClick={copiarLista} data-testid="logistica-copiar">
              <Copy className="h-4 w-4" aria-hidden="true" /> Copiar lista
            </Button>
          )}
          <DialogClose asChild>
            <Button type="button" variant="outline" className={cn("h-11 sm:h-9", (vazio || !podeCompras) && "col-span-2")}>Fechar</Button>
          </DialogClose>
          {podeCompras && (
            <Button
              type="button"
              className="order-first col-span-2 h-11 gap-1.5 sm:order-none sm:h-9"
              onClick={() => { onFechar(); navegar(acaoDoHotel ? (evento ? `/operational-mirror?eventId=${encodeURIComponent(evento.id)}` : "/operational-mirror") : (evento ? `/tickets?event=${encodeURIComponent(evento.id)}` : "/tickets")); }}
              data-testid="logistica-acao"
            >
              {acaoDoHotel ? "Abrir no Espelho operacional" : "Abrir em Passagens"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </>
      )}
    >
      {vazio ? (
        <Vazio>
          {foco === "chegam" ? `Ninguém${nomeDaFuncao ? " desta função" : ""} chega neste dia.`
            : foco === "saem" ? `Ninguém${nomeDaFuncao ? " desta função" : ""} sai neste dia.`
              : foco === "hotel" ? `Ninguém${nomeDaFuncao ? " desta função" : ""} precisa de hotel nesta noite.`
                : "Ninguém desta função trabalha neste dia."}
        </Vazio>
      ) : foco === "hotel" ? (
        <>
          {semReserva.length > 0 && (
            <section aria-label="Sem reserva">
              <h3 className="pt-1 text-2xs font-semibold uppercase tracking-[0.05em] text-warning" data-testid="hotel-sem-reserva">Precisam, sem reserva · {semReserva.length}</h3>
              <ul className="mt-1 space-y-2 sm:space-y-0 sm:divide-y sm:divide-border" data-testid="logistica-dia-sem-reserva">
                {semReserva.map(({ v, l }) => {
                  const ultima = l.noitesQuePrecisa[l.noitesQuePrecisa.length - 1];
                  return (
                    <li key={v.id} className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning-soft/40 px-3 py-2.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-1">
                      <BedDouble className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <NomeDaVaga v={v} ctx={ctx} onFechar={onFechar} />
                        <span className="block truncate text-xs text-slate-600">{ctx.nomeDaFuncao(v.functionId)}{v.city ? ` · ${v.city}` : ""}</span>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <span className="block font-semibold text-warning">Sem reserva</span>
                        <span className="block tabular-nums text-slate-600" title={l.fonteDasNoites ? `Noites ${ORIGEM_DAS_NOITES[l.fonteDasNoites]}` : undefined}>
                          {l.fonteDasNoites && l.fonteDasNoites !== "passagem" ? "≈ " : ""}{dm(l.noitesQuePrecisa[0])} → {dm(somarDiasISO(ultima, 1))}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {reservados.length > 0 && (
            <section aria-label="Reservados" className={semReserva.length > 0 ? "mt-3 border-t border-border pt-3" : ""}>
              <h3 className="pt-1 text-2xs font-semibold uppercase tracking-[0.05em] text-success" data-testid="hotel-reservados">Reservados · {reservados.length}</h3>
              <ul className="mt-1 space-y-2 sm:space-y-0 sm:divide-y sm:divide-border" data-testid="logistica-dia-lista">
                {reservados.map(({ v, l }) => (
                  <li key={v.id} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 sm:rounded-none sm:border-0 sm:px-1">
                    <BedDouble className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <NomeDaVaga v={v} ctx={ctx} onFechar={onFechar} />
                      <span className="block truncate text-xs text-slate-600">{ctx.nomeDaFuncao(v.functionId)}</span>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <span className="block font-semibold text-foreground">{l.hospedagem?.hotelName}</span>
                      <span className="block tabular-nums text-slate-600">{dm(l.hospedagem?.checkInDate ?? null)} → {dm(l.hospedagem?.checkOutDate ?? null)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : foco === "trabalham" ? (
        <ul className="divide-y divide-border" data-testid="logistica-dia-escala">
          {trabalham.map(({ v, l }) => (
            <li key={v.id}>
              <CartaoDaViagem vaga={v} l={l} nome={ctx.nomeDaVaga(v)} funcao={null} foco={null} onAbrirVaga={(vaga) => { onFechar(); ctx.onAbrirVaga(vaga); }} />
            </li>
          ))}
        </ul>
      ) : (
        <>
          {sugestoes > 0 && (
            <p className="mb-2 text-2xs text-muted-foreground">
              ≈ horário da sugestão da escala — {sugestoes} {plural(sugestoes, "vaga ainda não tem passagem", "vagas ainda não têm passagem")}.
            </p>
          )}
          <ul className="space-y-2 sm:space-y-0 sm:divide-y sm:divide-border" data-testid="logistica-dia-lista">
            {movimentos.map((m) => <LinhaDoMovimento key={`${m.vagaId}-${m.tipo}`} m={m} ctx={ctx} onFechar={onFechar} />)}
          </ul>
        </>
      )}
    </Casca>
  );
}

function NomeDaVaga({ v, ctx, onFechar }: { v: TeamInclusion; ctx: ContextoDaEscala; onFechar: () => void }) {
  const nome = ctx.nomeDaVaga(v);
  return (
    <button
      type="button"
      onClick={() => { onFechar(); ctx.onAbrirVaga(v); }}
      className={cn("block max-w-full truncate rounded text-left text-sm underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", nome ? "font-semibold text-foreground" : "italic text-muted-foreground")}
      title={`Abrir a vaga #${v.inclusionNumber}`}
    >
      {nome ?? "sem nome"} <span className="font-mono text-2xs font-normal text-muted-foreground">#{v.inclusionNumber}</span>
    </button>
  );
}

/** Uma chegada/saída: a hora em destaque, quem, e o voo (ou a sugestão). Cartão no celular. */
function LinhaDoMovimento({ m, ctx, onFechar }: { m: Movimento; ctx: ContextoDaEscala; onFechar: () => void }) {
  const v = ctx.vagaPorId.get(m.vagaId);
  const l = ctx.resumo.porVaga.get(m.vagaId);
  if (!v || !l) return null;
  const sugestao = m.fonte === "sugestao";
  const meio = modoECompanhia(m);
  const rota = rotaDoTrecho(m);
  const horario = horarioDoTrecho(m);
  const { loc } = codigosDaPassagem(sugestao ? null : l.passagemAtual);
  const falta = faltaNoMovimento(l, m);
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 sm:rounded-none sm:border-0 sm:px-1" data-testid={`movimento-${m.vagaId}`}>
      <span
        className={cn("w-14 shrink-0 pt-px text-base font-semibold leading-tight tabular-nums", sugestao ? "text-muted-foreground" : "text-foreground")}
        title={sugestao ? "Horário da sugestão da escala" : m.tipo === "chegada" ? "Chegada" : "Partida"}
      >
        {horaDaLista(m)}
      </span>
      <div className="min-w-0 flex-1">
        <NomeDaVaga v={v} ctx={ctx} onFechar={onFechar} />
        <span className="block truncate text-xs text-slate-600">{ctx.nomeDaFuncao(v.functionId)}{v.city ? ` · ${v.city}` : ""}</span>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-700">
          {sugestao ? (
            <>
              <span className="rounded-full border border-border px-1.5 py-px text-2xs font-medium text-muted-foreground">sugestão</span>
              <span>{m.textoDaSugestao ?? "sem horário sugerido"}</span>
              {meio && <span className="text-slate-600">· {meio}</span>}
            </>
          ) : (
            <>
              {meio && <span className="font-medium">{meio}</span>}
              {rota && <span className="uppercase tabular-nums">· {rota}</span>}
              {horario && <span className="tabular-nums text-slate-600">· {horario}</span>}
              {loc && <span>· LOC <span className="font-mono font-semibold text-foreground">{loc}</span></span>}
            </>
          )}
          {m.segueParaOutroEvento && <span className="text-slate-600">· segue para outro evento</span>}
          {falta && (
            <span className="rounded-full border border-warning/30 bg-warning-soft px-1.5 py-px text-2xs font-semibold text-warning" data-testid={`falta-${m.vagaId}`}>
              {falta === "passagem" ? "falta a passagem" : "falta registrar o carro/van"}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}
