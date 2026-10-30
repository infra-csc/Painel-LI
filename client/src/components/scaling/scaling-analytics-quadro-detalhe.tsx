/**
 * Detalhe de uma célula do Quadro de prazos (dono, 16/10: "quando clicar abrir
 * um modal com detalhe" — "de quais escalações estão ali").
 *
 * O essencial é listar EXATAMENTE as vagas que formam o número da célula: a
 * célula diz "3 a validar", o modal mostra essas 3, com #número e colaborador.
 * As duas leem a mesma função pura (`quadroDoEvento`), então a contagem bate
 * por construção — e há teste disso. Depois vêm, recolhidas, as que ainda estão
 * em etapas anteriores e as que já cumpriram esta etapa.
 *
 * A ação leva para a tela onde a etapa se resolve, já no evento, e só aparece
 * para quem tem acesso a ela. "Copiar lista" ajuda a cobrar as pessoas.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Check, Copy, Search, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { hasPermission, type RolePermissions } from "@/lib/role-utils";
import type { TeamInclusion } from "@shared/schema";
import {
  ETAPA_DO_PROCESSO, ROTULO_DA_ETAPA, diasDeAtraso, prazoDaEtapa, situacaoDoPrazo,
  type DiasDosPrazos, type EtapaComPrazo, type SituacaoDoPrazo,
} from "@shared/prazos-da-escala";
import {
  DIAS_ESPERA_ATRASADA, O_QUE_FALTA, diasParadaNaEtapa, etapaAtualDaVaga, rotuloDaDataDoEvento, textoDaEtapaAtual,
  type AnalyticsContext, type EventoAnalisado, type QuadroDoEvento,
} from "./scaling-analytics-data";

/** A partir de quantas vagas na lista aparece a busca. */
const BUSCA_A_PARTIR_DE = 15;

const dm = (d: Date | null) =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "—";
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

type Situacao = SituacaoDoPrazo | "informativo" | "nenhuma_chegou";

const SITUACAO: Record<Situacao, { texto: string; classe: string }> = {
  atrasado: { texto: "Atrasado", classe: "border-danger/25 bg-danger-soft text-danger" },
  vence_logo: { texto: "Vence logo", classe: "border-warning/25 bg-warning-soft text-warning" },
  no_prazo: { texto: "No prazo", classe: "border-border bg-surface-muted text-slate-700" },
  cumprido: { texto: "Concluída", classe: "border-success/25 bg-success-soft text-success" },
  sem_data: { texto: "Sem data do evento", classe: "border-border bg-surface-muted text-muted-foreground" },
  informativo: { texto: "Informativo", classe: "border-border bg-surface-muted text-muted-foreground" },
  nenhuma_chegou: { texto: "Nenhuma chegou ainda", classe: "border-border bg-surface-muted text-muted-foreground" },
};

interface Acao { rotulo: string; permissao: keyof RolePermissions | null; ir: () => void }

export interface AlvoDoDetalhe { eventId: string; etapa: EtapaComPrazo }

export function DetalheDaEtapa({ evento, quadro, etapa, ctx, dias, hoje, onFechar, onVerVagasDoEvento }: {
  evento: EventoAnalisado;
  quadro: QuadroDoEvento;
  etapa: EtapaComPrazo;
  ctx: AnalyticsContext;
  dias: DiasDosPrazos;
  hoje: Date;
  onFechar: () => void;
  onVerVagasDoEvento: (eventId: string) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navegar] = useLocation();
  const [busca, setBusca] = useState("");

  const prazo = prazoDaEtapa(evento.dataEvento ?? evento.ini, etapa, dias);
  const coluna = etapa === "registro" ? null : quadro.colunas[etapa];
  // Registros: o número da célula é o total cadastrado — a lista são todas.
  const principais = useMemo(() => {
    const lista = coluna ? coluna.paradas : evento.vagas;
    const parada = (i: TeamInclusion) => diasParadaNaEtapa(i, etapaAtualDaVaga(i, ctx), hoje) ?? -1;
    return [...lista].sort((a, b) => parada(b) - parada(a) || (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0));
  }, [coluna, evento.vagas, ctx, hoje]);
  const antes = coluna?.antes ?? [];
  const passaram = coluna?.passaram ?? [];

  const situacao: Situacao = !coluna ? "informativo"
    : principais.length > 0 ? situacaoDoPrazo(prazo, hoje, principais.length)
    : antes.length > 0 ? "nenhuma_chegou" : "cumprido";
  const atraso = diasDeAtraso(prazo, hoje);

  const titulo = coluna
    ? `${principais.length} ${O_QUE_FALTA[coluna.etapa]}`
    : `${principais.length} ${plural(principais.length, "vaga registrada", "vagas registradas")}`;

  const termo = busca.trim().toLowerCase();
  const filtradas = termo
    ? principais.filter((i) => linhaEmTexto(i, ctx).toLowerCase().includes(termo))
    : principais;

  const eventId = evento.eventId;
  const acao: Acao = (() => {
    const ir = (href: string) => () => { onFechar(); navegar(href); };
    const verVagas = { rotulo: "Ver as vagas do evento", permissao: null, ir: () => { onFechar(); onVerVagasDoEvento(eventId); } };
    switch (etapa) {
      case "validacao": return { rotulo: "Abrir na Validação", permissao: "canAccessScalingValidation", ir: ir(`/scaling-validation?eventId=${encodeURIComponent(eventId)}`) };
      case "aprovacao": return { rotulo: "Abrir na Aprovação", permissao: "canAccessScalingApproval", ir: ir(`/scaling-approval?eventId=${encodeURIComponent(eventId)}`) };
      case "passagem": return { rotulo: "Abrir em Passagens", permissao: "canAccessScreen3", ir: ir(`/tickets?event=${encodeURIComponent(eventId)}`) };
      case "hotel": return { rotulo: "Abrir no Espelho operacional", permissao: "canAccessScreen3", ir: ir(`/operational-mirror?eventId=${encodeURIComponent(eventId)}`) };
      default: return verVagas;
    }
  })();
  const podeAgir = !acao.permissao || hasPermission(user ?? null, acao.permissao);

  const copiar = () => {
    const cab = `${evento.nome} — ${ROTULO_DA_ETAPA[etapa]} (prazo ${dm(prazo)}, D-${dias[etapa]})`;
    const texto = [cab, `${titulo}:`, ...principais.map((i) => linhaEmTexto(i, ctx, etapaAtualDaVaga(i, ctx), hoje))].join("\n");
    void navigator.clipboard?.writeText(texto)
      .then(() => toast({ title: "Lista copiada", description: "Cole na mensagem para cobrar quem falta." }))
      .catch(() => toast({ title: "Não foi possível copiar", description: "Selecione a lista e copie à mão.", variant: "destructive" }));
  };

  const etapaLogistica = coluna && (coluna.etapa === "passagem" || coluna.etapa === "hotel") ? coluna.etapa : null;
  const naoPrecisam = etapaLogistica && !coluna?.ninguemPrecisa ? evento.vagas.filter((i) => !precisa(etapaLogistica, i)).length : 0;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent
        className="flex max-h-[88vh] max-w-[680px] flex-col gap-0 overflow-hidden p-0 [&>button:last-child]:hidden max-sm:h-[100dvh] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0"
        data-testid="detalhe-etapa"
      >
        <div className="flex items-start gap-3 border-b border-border px-5 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              {ROTULO_DA_ETAPA[etapa]} · {ETAPA_DO_PROCESSO[etapa]}
            </p>
            <DialogTitle className="mt-1 truncate text-lg font-semibold leading-tight text-foreground" title={evento.nome}>
              {evento.nome}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
                <span>Evento em <span className="font-semibold tabular-nums text-foreground">{evento.dataEvento ? rotuloDaDataDoEvento(evento) : "sem data"}</span></span>
                <span>
                  Prazo <span className="font-semibold tabular-nums text-foreground">{dm(prazo)}</span>{" "}
                  <span className="tabular-nums text-muted-foreground">(D-{dias[etapa]})</span>
                  {prazo && situacao === "atrasado" && atraso !== null && <span className="text-danger"> · {atraso} {plural(atraso, "dia", "dias")} atrasado</span>}
                  {prazo && situacao === "vence_logo" && atraso !== null && <span className="text-warning"> · {atraso === 0 ? "vence hoje" : `vence em ${-atraso} ${plural(-atraso, "dia", "dias")}`}</span>}
                </span>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold ${SITUACAO[situacao].classe}`} data-testid="detalhe-situacao">
                  {SITUACAO[situacao].texto}
                </span>
              </div>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground" data-testid="detalhe-contagem">{titulo}</h3>
            {coluna && <p className="text-2xs text-muted-foreground">Só as vagas paradas nesta etapa</p>}
          </div>

          {principais.length > BUSCA_A_PARTIR_DE && (
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={busca}
                onChange={(ev) => setBusca(ev.target.value)}
                placeholder="Buscar por nome, função ou #número"
                aria-label="Buscar na lista"
                className="h-11 pl-9 sm:h-9"
                data-testid="detalhe-busca"
              />
            </div>
          )}

          {principais.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-border px-4 py-6 text-center" data-testid="detalhe-vazio">
              {coluna?.ninguemPrecisa ? (
                <p className="text-sm text-muted-foreground">Ninguém neste evento precisa {coluna.etapa === "passagem" ? "de passagem" : "de hotel"}.</p>
              ) : antes.length > 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma vaga chegou a esta etapa ainda — {antes.length} em etapas anteriores.</p>
              ) : (
                <p className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                  Nada pendente nesta etapa <Check className="h-4 w-4" aria-hidden="true" />
                </p>
              )}
            </div>
          ) : (
            <ListaDeVagas vagas={filtradas} ctx={ctx} hoje={hoje} mostrarEtapa={!coluna || coluna.etapa === "escalado"} testId="detalhe-lista" />
          )}
          {termo && filtradas.length === 0 && principais.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">Nenhuma vaga com “{busca.trim()}”.</p>
          )}

          {antes.length > 0 && (
            <Recolhido titulo={`${antes.length} em etapas anteriores`} detalhe={resumoPorEtapa(antes, ctx)} testId="detalhe-antes">
              <ListaDeVagas vagas={antes} ctx={ctx} hoje={hoje} mostrarEtapa />
            </Recolhido>
          )}
          {passaram.length > 0 && (
            <Recolhido titulo={`${passaram.length} já ${plural(passaram.length, "cumpriu", "cumpriram")} esta etapa`} testId="detalhe-cumpridas">
              <ListaDeVagas vagas={passaram} ctx={ctx} hoje={hoje} mostrarEtapa semDias />
            </Recolhido>
          )}
          {naoPrecisam > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {naoPrecisam} {plural(naoPrecisam, "vaga não precisa", "vagas não precisam")} {etapaLogistica === "passagem" ? "de passagem" : "de hotel"}.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border bg-background px-5 py-3 sm:flex sm:items-center sm:justify-end">
          {principais.length > 0 && (
            <Button type="button" variant="outline" className="h-11 gap-1.5 sm:mr-auto sm:h-9" onClick={copiar} data-testid="detalhe-copiar">
              <Copy className="h-4 w-4" aria-hidden="true" /> Copiar lista
            </Button>
          )}
          <DialogClose asChild>
            <Button type="button" variant="outline" className={`h-11 sm:h-9 ${principais.length > 0 ? "" : "col-span-2"}`}>Fechar</Button>
          </DialogClose>
          {podeAgir && (
            <Button type="button" className="order-first col-span-2 h-11 gap-1.5 sm:order-none sm:h-9" onClick={acao.ir} data-testid="detalhe-acao">
              {acao.rotulo} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const precisa = (etapa: "passagem" | "hotel", i: TeamInclusion) => (etapa === "passagem" ? !!i.needsTicket : !!i.needsAccommodation);

function nomeDaVaga(i: TeamInclusion, ctx: AnalyticsContext): string | null {
  if (i.empreitaEmpresa) return `Empreita · ${i.empreitaEmpresa}`;
  return ctx.temNome(i) ? ctx.getCollaboratorName(i.collaboratorId) : null;
}

/** "#123 · Produtor · sem nome · área: Ana · parada há 5 dias" — para buscar e copiar. */
function linhaEmTexto(i: TeamInclusion, ctx: AnalyticsContext, etapa?: ReturnType<typeof etapaAtualDaVaga>, hoje?: Date): string {
  const area = ctx.getResponsavelDaFuncao?.(i.functionId);
  const d = etapa && etapa !== "concluida" && hoje ? diasParadaNaEtapa(i, etapa, hoje) : null;
  return [
    `#${i.inclusionNumber ?? ""}`,
    ctx.getFunctionName(i.functionId),
    nomeDaVaga(i, ctx) ?? "sem nome",
    area ? `área: ${area}` : null,
    d !== null ? `parada há ${d} ${plural(d, "dia", "dias")}` : null,
  ].filter(Boolean).join(" · ");
}

/** "8 em validação, 4 sem nome" — de onde vêm as vagas que ainda não chegaram. */
function resumoPorEtapa(vagas: TeamInclusion[], ctx: AnalyticsContext): string {
  const conta = new Map<string, number>();
  for (const i of vagas) {
    const t = textoDaEtapaAtual(i, ctx);
    conta.set(t, (conta.get(t) ?? 0) + 1);
  }
  return Array.from(conta, ([t, n]) => `${n} ${t}`).join(", ");
}

function Recolhido({ titulo, detalhe, testId, children }: { titulo: string; detalhe?: string; testId: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 rounded-lg border border-border" data-testid={testId}>
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 [&::-webkit-details-marker]:hidden">
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
        <span>{titulo}</span>
        {detalhe && <span className="min-w-0 basis-full pl-5 text-xs font-normal text-muted-foreground sm:basis-auto sm:pl-0">({detalhe})</span>}
      </summary>
      <div className="border-t border-border px-1 pb-1">{children}</div>
    </details>
  );
}

function ListaDeVagas({ vagas, ctx, hoje, mostrarEtapa = false, semDias = false, testId }: {
  vagas: TeamInclusion[]; ctx: AnalyticsContext; hoje: Date; mostrarEtapa?: boolean; semDias?: boolean; testId?: string;
}) {
  return (
    <ul className="mt-2 divide-y divide-border" data-testid={testId}>
      {vagas.map((i) => {
        const etapa = etapaAtualDaVaga(i, ctx);
        const nome = nomeDaVaga(i, ctx);
        const area = ctx.getResponsavelDaFuncao?.(i.functionId);
        const d = semDias || etapa === "concluida" ? null : diasParadaNaEtapa(i, etapa, hoje);
        const desde = etapa === "validacao" ? "desde o envio para a área" : etapa === "aprovacao" ? "desde a validação" : "desde a última alteração da vaga";
        return (
          <li key={i.id} className="flex items-start gap-3 px-2 py-2.5" data-testid={`detalhe-vaga-${i.id}`}>
            <span className="w-11 shrink-0 sm:w-14 pt-px font-mono text-xs tabular-nums text-muted-foreground">#{i.inclusionNumber}</span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm ${nome ? "font-medium text-foreground" : "italic text-muted-foreground"}`}>{nome ?? "sem nome"}</span>
              <span className="block truncate text-xs text-slate-600">
                {ctx.getFunctionName(i.functionId)}
                {area && <span className="text-muted-foreground"> · área: {area}</span>}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              {mostrarEtapa && (
                <span className="rounded-full border border-border bg-surface-muted px-2 py-px text-2xs font-medium text-slate-700">{textoDaEtapaAtual(i, ctx)}</span>
              )}
              {d !== null && (
                <span className={`whitespace-nowrap text-xs tabular-nums ${d >= DIAS_ESPERA_ATRASADA ? "font-semibold text-danger" : "text-muted-foreground"}`} title={`Parada ${desde}`}>
                  {d === 0 ? "hoje" : `há ${d} ${plural(d, "dia", "dias")}`}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
