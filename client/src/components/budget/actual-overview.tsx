/**
 * Topo do Orçamento Realizado — 25/09 (modularização); redesenho 08/10.
 *
 * Antes eram três blocos empilhados: o aviso de devolução, um stepper de
 * quatro etapas num cartão próprio e o banner "Total realizado" (faixa azul
 * cheia + quatro KPIs e uma barra) — ~430px antes do primeiro colaborador.
 *
 * Agora é o MESMO painel do Planejado (a etapa anterior do fluxo), lido como
 * um extrato: o total realizado, o planejado de referência, a diferença, e a
 * divisão Casa × Freela; embaixo, numa faixa fina, o andamento da aprovação
 * do RH e em qual etapa o evento está. Nada saiu: total, planejado, diferença
 * (com o sentido), prestações, em revisão, aprovadas, devolvidas e as quatro
 * etapas. Os números são do EVENTO inteiro (a busca não mexe no painel); o
 * recorte dos filtros aparece na contagem da lista.
 */
import { AlertCircle, Calculator, Check, Equal, Home, TrendingDown, TrendingUp, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BudgetActual, Event } from "@shared/schema";
import { Metrica, TrilhoDeEtapas } from "./budget-overview-cards";
import { formatCurrency, formatEventDate } from "./types";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Aviso: prestações devolvidas pelo RH (derivado dos itens, item a item —
 *  o status agregado do comparativo ficava stale). */
export function DevolvedBanner({ devolvedItems, getCollaboratorName, onVer }: {
  devolvedItems: BudgetActual[];
  getCollaboratorName: (id?: string | null) => string;
  /** Recorta a lista nas devolvidas (fila de situações). */
  onVer?: () => void;
}) {
  if (devolvedItems.length === 0) return null;
  const commented = devolvedItems.filter(i => i.rhComment);
  const shown = commented.slice(0, 3);
  return (
    <div role="status" className="pas-entra flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3" data-testid="realizado-devolvidas">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-warning-strong" aria-hidden="true" />
      <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-1.75rem)]">
        <p className="m-0 text-sm font-semibold text-warning">
          {devolvedItems.length === 1 ? "1 prestação devolvida pelo RH" : `${devolvedItems.length} prestações devolvidas pelo RH`}
          <span className="font-normal"> — corrija e reenvie para revisão.</span>
        </p>
        {shown.length > 0 && (
          <ul className="m-0 mt-1 p-0 list-none space-y-0.5">
            {shown.map(i => (
              <li key={i.id} className="text-xs leading-5 text-warning">
                <span className="font-semibold">{getCollaboratorName(i.collaboratorId)}:</span> {i.rhComment}
              </li>
            ))}
          </ul>
        )}
        {commented.length > shown.length && (
          <p className="m-0 mt-0.5 text-xs text-warning/80">
            + {commented.length - shown.length} {commented.length - shown.length === 1 ? "outro comentário" : "outros comentários"} nos cards devolvidos
          </p>
        )}
      </div>
      {onVer && (
        <button
          type="button"
          onClick={onVer}
          className="pas-alvo shrink-0 max-sm:ml-7 inline-flex items-center h-8 px-2.5 rounded-lg text-xs font-semibold text-warning border border-warning/30 bg-card/60 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="realizado-ver-devolvidas"
        >
          Ver devolvidas
        </button>
      )}
    </div>
  );
}

export interface TotaisDoResumo {
  totalRealizado: number;
  totalPlanejado: number;
  totalCasa: number;
  totalFreela: number;
  prestacaoCount: number;
}

export interface ResumoDoRealizadoProps {
  selectedEvent: Event | undefined;
  /** Prestações do evento (sem filtro). */
  eventItems: BudgetActual[];
  totais: TotaisDoResumo;
}

/** "+R$ 630,00" / "−R$ 120,00" / "R$ 0,00" — a diferença com o sentido escrito. */
export function diferencaComSinal(d: number): string {
  if (Math.abs(d) <= 1) return formatCurrency(0);
  return `${d > 0 ? "+" : "−"}${formatCurrency(Math.abs(d))}`;
}

export function ResumoDoRealizado({ selectedEvent, eventItems, totais }: ResumoDoRealizadoProps) {
  const { totalRealizado, totalPlanejado, totalCasa, totalFreela, prestacaoCount } = totais;
  const diferenca = totalRealizado - totalPlanejado;
  const igual = Math.abs(diferenca) <= 1;
  const pct = totalPlanejado > 0 && !igual ? Math.round((diferenca / totalPlanejado) * 1000) / 10 : null;

  // Etapa: tudo enviado ou aprovado → a bola está com o RH (Aprovação).
  const allSentOrApproved = eventItems.length > 0 && eventItems.every(i => i.sentForReview || i.rhStatus === "aprovado");
  const etapaAtual = allSentOrApproved ? 3 : 2;

  // Andamento da aprovação, contado por escalação (os filhos de uma divisão seguem o titular).
  const titulares = eventItems.filter(i => !i.splitParentId);
  const nAprovadas = titulares.filter(i => i.rhStatus === "aprovado").length;
  const nAusentes = titulares.filter(i => i.didNotAttend).length;
  const tudoAprovado = prestacaoCount > 0 && nAprovadas === prestacaoCount;
  const pctAprovado = prestacaoCount > 0 ? Math.round((nAprovadas / prestacaoCount) * 100) : 0;

  return (
    <section aria-label="Resumo do realizado" className="pla-resumo rea-resumo rounded-xl border border-border bg-card overflow-hidden" data-testid="resumo-realizado">
      <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]">
        {/* O número da tela. */}
        <div className="col-span-2 lg:col-span-1 min-w-0 px-4 pt-3.5 pb-3 max-lg:border-b border-border">
          <p className="m-0 text-xs font-medium text-slate-600">
            Total realizado
            {selectedEvent?.startDate && (
              <span className="text-muted-foreground font-normal"> · {formatEventDate(selectedEvent.startDate)}</span>
            )}
          </p>
          <p className="m-0 mt-0.5 text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] tabular-nums text-primary" data-testid="total-realizado">
            {formatCurrency(totalRealizado)}
          </p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground tabular-nums truncate">
            {/* Com divisão, a escalação vira mais de uma prestação: as duas contagens aparecem. */}
            {eventItems.length !== prestacaoCount
              ? <>{plural(prestacaoCount, "escalação", "escalações")} · {plural(eventItems.length, "prestação", "prestações")}</>
              : plural(prestacaoCount, "prestação", "prestações")}
            {nAusentes > 0 && <span title="Quem não participou fica fora dos totais"> · {nAusentes} não {nAusentes === 1 ? "participou" : "participaram"}</span>}
          </p>
        </div>
        <Metrica icon={Calculator} label="Planejado" value={formatCurrency(totalPlanejado)} sub="enviado do Planejado" cor="text-muted-foreground"
          tooltip="Soma do planejado de referência das prestações (sem quem não participou)" />
        <Metrica
          icon={igual ? Equal : diferenca > 0 ? TrendingUp : TrendingDown}
          label="Diferença"
          value={diferencaComSinal(diferenca)}
          corValor={igual ? "text-foreground" : diferenca > 0 ? "text-danger" : "text-success"}
          sub={igual ? "igual ao planejado" : pct !== null ? `${Math.abs(pct).toLocaleString("pt-BR")}% ${diferenca > 0 ? "acima" : "abaixo"} do previsto` : `${diferenca > 0 ? "acima" : "abaixo"} do planejado`}
          cor={igual ? "text-muted-foreground" : diferenca > 0 ? "text-danger" : "text-success"}
          tooltip="Realizado menos planejado: positivo = gastou mais que o previsto"
        />
        <Metrica icon={Home} label="Casa" value={formatCurrency(totalCasa)} sub={plural(titulares.filter(i => i.collaboratorType === "casa").length, "colaborador", "colaboradores")} cor="text-primary" tooltip="Colaboradores que trabalham no próprio estado" />
        <Metrica icon={UserCheck} label="Freela" value={formatCurrency(totalFreela)} sub={plural(titulares.filter(i => i.collaboratorType === "freela").length, "colaborador", "colaboradores")} cor="text-warning" tooltip="Colaboradores contratados por evento" />
      </div>

      {/* Andamento: quanto o RH já aprovou e em que etapa o evento está. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 border-t border-border bg-surface-muted/60">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0 max-sm:w-full" data-testid="progresso-aprovacao">
          <span className="text-xs font-medium text-slate-600 whitespace-nowrap">Aprovação do RH</span>
          <span
            role="progressbar"
            aria-label="Prestações aprovadas pelo RH"
            aria-valuemin={0}
            aria-valuemax={prestacaoCount}
            aria-valuenow={nAprovadas}
            className="relative w-28 sm:w-36 h-1.5 rounded-full bg-border overflow-hidden shrink-0 max-sm:flex-1"
          >
            <span className="pla-progresso absolute inset-y-0 left-0 rounded-full bg-success-strong" style={{ width: `${pctAprovado}%` }} />
          </span>
          <span className={cn("text-xs tabular-nums whitespace-nowrap", tudoAprovado ? "text-success font-semibold" : "text-muted-foreground")}>
            {tudoAprovado
              ? <><Check className="inline w-3.5 h-3.5 -mt-0.5 mr-0.5" aria-hidden="true" />Todas aprovadas</>
              : `${nAprovadas} de ${prestacaoCount} aprovadas`}
          </span>
        </div>
        <div className="md:ml-auto min-w-0">
          <TrilhoDeEtapas atual={etapaAtual} />
        </div>
      </div>
    </section>
  );
}
