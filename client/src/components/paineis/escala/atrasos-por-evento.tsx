/**
 * Atrasos por evento (Painel da escala, 30/10).
 *
 * Uma linha por evento futuro com vaga parada numa etapa cujo prazo venceu ou
 * vence em até 3 dias — a mesma régua e as mesmas cores do Quadro de prazos
 * das Análises. Clicar numa célula abre o MESMO detalhe do Quadro (as vagas
 * exatas daquele número, "Copiar lista" para cobrar e o atalho para a tela de
 * trabalho já no evento).
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { ROTULO_DA_ETAPA, type DiasDosPrazos } from "@shared/prazos-da-escala";
import {
  quadroDoEvento, rotuloDaDataDoEvento, textoDePrazo,
  type AnalyticsContext, type QuadroDoEvento,
} from "@/components/scaling/scaling-analytics-data";
import { DetalheDaEtapa } from "@/components/scaling/scaling-analytics-quadro-detalhe";
import { cn } from "@/lib/utils";
import {
  ETAPAS_DO_PAINEL, ROTULO_DO_PAINEL, atrasadasPorEtapa, plural, textoDoAtraso,
  type CelulaDeAtraso, type EtapaDoPainel, type EventoComAtraso,
} from "./painel-escala-dados";
import { Barra, Secao } from "./comum-escala";

const POR_VEZ = 15;
const dm = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "—");

/** Grade das linhas: evento + 4 etapas + pior atraso. No celular, cartão. */
const GRADE = "sm:grid sm:grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,1fr))_minmax(0,0.8fr)]";

export function hrefDaEscalacao(eventId: string) {
  return `/scaling?eventId=${encodeURIComponent(eventId)}`;
}

function Celula({ c, onAbrir, testId }: { c: CelulaDeAtraso; onAbrir: () => void; testId: string }) {
  const n = c.vagas.length;
  const rotulo = ROTULO_DO_PAINEL[c.etapa];
  if (n === 0) {
    return (
      <div className="flex min-h-[44px] flex-col justify-center px-3 py-1.5 sm:min-h-[64px] sm:items-center sm:py-2 sm:border-l sm:border-border" data-testid={testId}>
        <span className="text-2xs text-muted-foreground sm:hidden">{rotulo}</span>
        <span className="text-sm text-muted-foreground" aria-label={`${rotulo}: nenhuma vaga parada`}>—</span>
      </div>
    );
  }
  const atrasada = c.situacao === "atrasado";
  const vence = c.situacao === "vence_logo";
  const texto = atrasada || vence ? textoDoAtraso(c) : `prazo ${dm(c.prazo)}`;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        "flex min-h-[64px] w-full flex-col justify-center rounded-lg px-3 py-2 text-left hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:items-center sm:rounded-none sm:border-l sm:border-border sm:text-center",
        atrasada ? "bg-danger-soft" : vence ? "bg-warning-soft" : "bg-surface-muted sm:bg-transparent",
      )}
      title={`${n} ${rotulo.toLowerCase()} · prazo ${dm(c.prazo)}${texto ? ` · ${texto}` : ""}`}
      aria-label={`${rotulo}: ${n} ${plural(n, "vaga", "vagas")}, ${texto}. Ver as vagas`}
      data-testid={testId}
    >
      <span className="text-2xs text-muted-foreground sm:hidden">{rotulo}</span>
      <span className="text-base font-semibold leading-tight tabular-nums text-foreground">{n}</span>
      <span className={cn("whitespace-nowrap text-2xs", atrasada ? "font-semibold text-danger" : vence ? "font-semibold text-warning" : "text-muted-foreground")}>
        {texto}
      </span>
    </button>
  );
}

export function AtrasosPorEvento({ linhas, ctx, hoje, dias }: {
  linhas: EventoComAtraso[]; ctx: AnalyticsContext; hoje: Date; dias: DiasDosPrazos;
}) {
  const [, navegar] = useLocation();
  const [quantos, setQuantos] = useState(POR_VEZ);
  const [alvo, setAlvo] = useState<{ eventId: string; etapa: EtapaDoPainel } | null>(null);
  const porEtapa = useMemo(() => atrasadasPorEtapa(linhas), [linhas]);
  const maxEtapa = Math.max(1, ...ETAPAS_DO_PAINEL.map((e) => porEtapa[e].atrasadas + porEtapa[e].vencendo));
  const linhaDoAlvo = alvo ? linhas.find((l) => l.evento.eventId === alvo.eventId) : undefined;
  const quadroDoAlvo = useMemo<QuadroDoEvento | null>(
    () => (linhaDoAlvo ? quadroDoEvento(linhaDoAlvo.evento.vagas, ctx) : null),
    [linhaDoAlvo, ctx],
  );
  const visiveis = linhas.slice(0, quantos);

  if (linhas.length === 0) {
    return (
      <Secao titulo="Atrasos por evento" testId="secao-atrasos">
        <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="atrasos-vazio">
          <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
          <p className="mt-3 text-base font-semibold text-foreground">Nenhuma etapa da escala atrasada</p>
          <p className="mt-1 max-w-[440px] text-sm text-muted-foreground">
            Nenhum evento futuro tem vaga parada em validação, aprovação, sem nome ou a confirmar com o prazo vencido ou vencendo nos próximos 3 dias.
          </p>
        </div>
      </Secao>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <Secao
        titulo="Atrasos por evento"
        descricao={<>Vagas paradas em cada etapa com o prazo vencido ou vencendo em até 3 dias. Prazos D-N da data do evento, os mesmos do Quadro das Análises. Clique para ver as vagas.</>}
        testId="secao-atrasos"
      >
        <div className={cn("hidden border-b border-border bg-surface-muted/60 text-2xs font-semibold uppercase tracking-[0.05em] text-muted-foreground", GRADE)} aria-hidden="true">
          <span className="px-4 py-2">Evento</span>
          {ETAPAS_DO_PAINEL.map((e) => (
            <span key={e} className="border-l border-border px-2 py-2 text-center" title={`${ROTULO_DA_ETAPA[e]} · D-${dias[e]}`}>
              {ROTULO_DO_PAINEL[e]}
              <span className="block font-semibold normal-case tracking-normal text-slate-600 tabular-nums">D-{dias[e]}</span>
            </span>
          ))}
          <span className="border-l border-border px-2 py-2 text-center">Pior atraso</span>
        </div>
        <ul>
          {visiveis.map((l) => {
            const e = l.evento;
            return (
              <li key={e.eventId} className={cn("border-b border-border px-3 py-3 last:border-b-0 sm:px-0 sm:py-0", GRADE)} data-testid={`atraso-${e.eventId}`}>
                <div className="min-w-0 pb-2 sm:px-4 sm:py-2.5">
                  <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-foreground" title={e.nome}>{e.nome}</p>
                  <p className="truncate text-2xs text-muted-foreground">
                    Evento {rotuloDaDataDoEvento(e)} · {textoDePrazo(e.prazoDias)} · {e.total} {plural(e.total, "vaga", "vagas")}
                  </p>
                  {/* No celular o pior atraso fica junto do nome. */}
                  {l.piorAtraso !== null && (
                    <p className="mt-0.5 text-2xs font-semibold text-danger sm:hidden">{l.piorAtraso} {plural(l.piorAtraso, "dia", "dias")} de atraso no pior caso</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:contents">
                  {ETAPAS_DO_PAINEL.map((etapa) => (
                    <Celula
                      key={etapa}
                      c={l.celulas[etapa]}
                      onAbrir={() => setAlvo({ eventId: e.eventId, etapa })}
                      testId={`celula-${etapa}-${e.eventId}`}
                    />
                  ))}
                </div>
                <div className="hidden flex-col items-center justify-center border-l border-border px-2 py-2 text-center sm:flex">
                  {l.piorAtraso !== null ? (
                    <>
                      <span className="text-base font-semibold tabular-nums text-danger">{l.piorAtraso}d</span>
                      <span className="text-2xs text-muted-foreground">{l.vagasAtrasadas} {plural(l.vagasAtrasadas, "atrasada", "atrasadas")}</span>
                    </>
                  ) : (
                    <span className="text-2xs font-medium text-warning">vence logo</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {linhas.length > quantos && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border bg-background px-4 py-2.5">
            <span className="text-xs tabular-nums text-slate-600">Mostrando {visiveis.length} de {linhas.length} eventos · os mais atrasados primeiro</span>
            <button type="button" onClick={() => setQuantos((n) => n + POR_VEZ)} className="h-[26px] rounded-md border border-border bg-card px-2.5 text-xs font-medium text-primary hover:border-primary hover:bg-brand-soft" data-testid="button-mais-atrasos">
              Mostrar mais
            </button>
          </div>
        )}
      </Secao>

      <Secao titulo="Onde está o atraso" descricao="Vagas atrasadas e vencendo, somando os eventos." testId="grafico-etapas">
        <ul className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-1">
          {ETAPAS_DO_PAINEL.map((etapa) => {
            const { atrasadas, vencendo } = porEtapa[etapa];
            return (
              <li key={etapa} data-testid={`grafico-etapa-${etapa}`}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-700">{ROTULO_DO_PAINEL[etapa]}</span>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="font-semibold text-danger">{atrasadas}</span> atrasadas
                    {vencendo > 0 && <> · <span className="font-semibold text-warning">{vencendo}</span> vencendo</>}
                  </span>
                </div>
                <div className="mt-1.5 flex">
                  {atrasadas + vencendo > 0 ? (
                    <Barra
                      max={maxEtapa}
                      rotulo={`${ROTULO_DO_PAINEL[etapa]}: ${atrasadas} atrasadas, ${vencendo} vencendo`}
                      segmentos={[
                        { valor: atrasadas, cor: "var(--danger-strong)", titulo: `${atrasadas} atrasadas` },
                        { valor: vencendo, cor: "var(--warning-strong)", titulo: `${vencendo} vencendo em até 3 dias` },
                      ]}
                    />
                  ) : <span className="h-2 w-full rounded-full bg-muted" />}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-danger-strong" />prazo vencido</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-warning-strong" />vence em até 3 dias</span>
        </p>
      </Secao>

      {alvo && linhaDoAlvo && quadroDoAlvo && (
        <DetalheDaEtapa
          evento={linhaDoAlvo.evento}
          quadro={quadroDoAlvo}
          etapa={alvo.etapa}
          ctx={ctx}
          dias={dias}
          hoje={hoje}
          onFechar={() => setAlvo(null)}
          onVerVagasDoEvento={(id) => navegar(hrefDaEscalacao(id))}
        />
      )}
    </div>
  );
}
