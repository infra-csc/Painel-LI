/**
 * Aba Análises da Escalação (01/09; revisão 18/09 — "deixe 10/10").
 *
 * Responde "como estão os eventos" pelo caminho INTEIRO da vaga: em validação
 * (com a área) → em aprovação (com o aprovador) → em escalação (sem nome, salvo
 * ou com o gestor) → escalação completa. Cada evento escreve as quantidades (a
 * barra sozinha não dizia quantas) e leva ao lugar onde se resolve: Escalação,
 * Validação ou Aprovação, já filtradas pelo evento.
 *
 * Os números vêm de scaling-analytics-data.ts, que lê a base do recorte de
 * evento/período/excluídas e NÃO dos filtros de situação: "quantas faltam
 * escalar" não pode ser respondido por uma lista já filtrada por "vaga aberta".
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { BedDouble, Plane } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import {
  BUCKETS, DIAS_ESPERA_ATRASADA, analisarPorEvento, calcularKpis, funcoesDescobertas,
  gargalos, textoDeFimDeSemana, textoDePrazo, type AnalyticsContext, type Gargalo,
} from "./scaling-analytics-data";

/**
 * Quantos eventos a lista mostra antes de pedir "mostrar mais". A base real tem
 * duzentos, e sem corte o cartão empurrava "Onde falta gente" e "Esperando
 * alguém decidir" para fora de qualquer tela. A ordem já é a de trabalho.
 */
const EVENTOS_POR_VEZ = 12;

const dm = (d: Date | null) =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "—";

const COR = Object.fromEntries(BUCKETS.map((b) => [b.key, b.cor])) as Record<string, string>;

/** Cor do marcador de cada tipo de espera — a mesma da barra quando existe. */
const COR_DA_ESPERA: Record<Gargalo["tipo"], string> = {
  gestor: "#EF4444",
  analise: "#A855F7",
  validacao: COR.validacao,
  aprovacao: COR.aprovacao,
};

const BOTAO = "inline-flex h-[30px] shrink-0 items-center rounded-lg border border-border bg-card px-2.5 text-[12px] font-medium text-primary no-underline hover:border-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

interface Props {
  linhas: TeamInclusion[];
  /**
   * Vagas ainda na Validação/Aprovação de Escala do mesmo recorte (18/09): sem
   * elas o evento parecia mais vazio do que estava.
   */
  sugestoes?: TeamInclusion[];
  ctx: AnalyticsContext;
  hoje: Date;
  /** Leva à Fila filtrada por este evento — mantendo o período escolhido. */
  onVerVagasDoEvento: (eventId: string) => void;
  /** Leva à Fila com a fila "Escalar" e a busca preenchida com a função. */
  onVerFuncao: (nomeDaFuncao: string) => void;
  /** Abre o modal daquela linha. */
  onAbrirLinha: (inclusion: TeamInclusion) => void;
}

function Kpi({ rotulo, valor, sub, cor }: { rotulo: string; valor: string; sub: string; cor: string }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums" style={{ color: cor }}>{valor}</p>
      <p className="mt-1.5 truncate text-[12px] text-muted-foreground" title={sub}>{sub}</p>
    </div>
  );
}

/** "2 em validação" com a bolinha da cor da etapa — o número que antes só a barra mostrava. */
function Contagem({ n, texto, cor, detalhe }: { n: number; texto: string; cor: string; detalhe?: string }) {
  if (n === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: cor }} />
      <span className="font-semibold tabular-nums text-slate-800">{n}</span> {texto}
      {detalhe && <span className="text-muted-foreground">({detalhe})</span>}
    </span>
  );
}

/** "5 de 12 passagens emitidas · 7 faltam" — verde quando completo, âmbar quando falta. */
function LinhaDeLogistica({ icone, feitos, precisam, feito, oque }: {
  icone: React.ReactNode; feitos: number; precisam: number; feito: string; oque: string;
}) {
  if (precisam === 0) return null;
  const faltam = precisam - feitos;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${faltam === 0 ? "text-[#047857]" : "text-slate-600"}`}>
      {icone}
      <span><span className="font-semibold tabular-nums text-slate-800">{feitos}</span> de <span className="tabular-nums">{precisam}</span> {oque} {feito}</span>
      {faltam > 0 && <span className="font-medium text-[#B45309]">· {faltam} {faltam === 1 ? "falta" : "faltam"}</span>}
    </span>
  );
}

const linkDaEtapa = (etapa: "validacao" | "aprovacao", eventId: string) =>
  `${etapa === "validacao" ? "/scaling-validation" : "/scaling-approval"}?eventId=${encodeURIComponent(eventId)}`;

export default function ScalingAnalytics({ linhas, sugestoes = [], ctx, hoje, onVerVagasDoEvento, onVerFuncao, onAbrirLinha }: Props) {
  // O caminho inteiro da vaga: validação → aprovação → escalação → completa.
  // Tudo memoizado (18/09): antes os quatro cálculos rodavam a cada render —
  // inclusive ao clicar em "Mostrar mais", que não muda nenhum número.
  const todas = useMemo(() => (sugestoes.length ? [...linhas, ...sugestoes] : linhas), [linhas, sugestoes]);
  const kpis = useMemo(() => calcularKpis(todas, ctx, hoje), [todas, ctx, hoje]);
  const eventos = useMemo(() => analisarPorEvento(todas, ctx, hoje), [todas, ctx, hoje]);
  const funcoes = useMemo(() => funcoesDescobertas(linhas, ctx), [linhas, ctx]);
  const travas = useMemo(() => gargalos(todas, ctx, hoje), [todas, ctx, hoje]);
  const maiorFalta = useMemo(() => Math.max(1, ...funcoes.map((f) => f.abertas)), [funcoes]);
  const hojeBr = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [quantosEventos, setQuantosEventos] = useState(EVENTOS_POR_VEZ);
  const eventosVisiveis = eventos.slice(0, quantosEventos);

  return (
    <div className="flex flex-col gap-4" data-testid="aba-analises">
      {/* O caminho da vaga, da esquerda para a direita. */}
      {/* 1px de fundo entre os cartões = divisória que fecha em 2, 4 ou 8 colunas. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-slate-100 sm:grid-cols-4 2xl:grid-cols-8">
        <Kpi
          rotulo="Em validação"
          valor={String(kpis.emValidacao)}
          sub={kpis.emValidacao === 0 ? "nada esperando a área" : "esperando a área validar"}
          cor={kpis.emValidacao === 0 ? "#047857" : "#475569"}
        />
        <Kpi
          rotulo="Em aprovação"
          valor={String(kpis.emAprovacao)}
          sub={kpis.emAprovacao === 0 ? "nada esperando o aprovador" : "validadas, esperando o aprovador"}
          cor={kpis.emAprovacao === 0 ? "#047857" : "#7E22CE"}
        />
        <Kpi
          rotulo="Em escalação"
          valor={String(kpis.emEscalacao)}
          sub={kpis.faltamEscalar > 0 ? `${kpis.faltamEscalar} sem nome` : kpis.emEscalacao === 0 ? "nada pendente" : "com nome, falta confirmar"}
          cor={kpis.emEscalacao === 0 ? "#047857" : "#B45309"}
        />
        <Kpi
          rotulo="Escalação completa"
          valor={String(kpis.completas)}
          sub={`${kpis.completaPct}% de ${kpis.totalVivas} ${kpis.totalVivas === 1 ? "vaga" : "vagas"}`}
          cor={kpis.completaPct === 100 ? "#047857" : "#0F172A"}
        />
        {/* Depois da escalação: a passagem é o que o time mais cobra (18/09). */}
        <Kpi
          rotulo="Passagens"
          valor={`${kpis.logistica.passagens.emitidas}/${kpis.logistica.passagens.precisam}`}
          sub={kpis.logistica.passagens.precisam === 0
            ? "nenhuma vaga precisa"
            : kpis.logistica.passagens.emitidas === kpis.logistica.passagens.precisam
              ? "todas emitidas"
              : `${kpis.logistica.passagens.precisam - kpis.logistica.passagens.emitidas} faltam emitir`}
          cor={kpis.logistica.passagens.emitidas === kpis.logistica.passagens.precisam ? "#047857" : "#B45309"}
        />
        <Kpi
          rotulo="Hospedagem"
          valor={`${kpis.logistica.hoteis.reservados}/${kpis.logistica.hoteis.precisam}`}
          sub={kpis.logistica.hoteis.precisam === 0
            ? "nenhuma vaga precisa"
            : kpis.logistica.hoteis.reservados === kpis.logistica.hoteis.precisam
              ? "todas reservadas"
              : `${kpis.logistica.hoteis.precisam - kpis.logistica.hoteis.reservados} faltam reservar`}
          cor={kpis.logistica.hoteis.reservados === kpis.logistica.hoteis.precisam ? "#047857" : "#B45309"}
        />
        <Kpi
          rotulo="Próximo prazo"
          valor={kpis.prazoMaisCurtoDias === null ? "—" : textoDePrazo(kpis.prazoMaisCurtoDias)}
          sub={kpis.prazoMaisCurtoDias === null ? "nenhuma escala futura no recorte" : "até a próxima escala começar"}
          cor="#0F172A"
        />
        <Kpi
          rotulo="Travadas"
          valor={String(kpis.travadas)}
          sub={kpis.travadas === 0 ? "nada esperando decisão" : "gestor, troca ou ajuste"}
          cor={kpis.travadas === 0 ? "#047857" : "#B91C1C"}
        />
      </div>

      <section aria-label="Cobertura por evento" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3">
          <p className="text-[14px] font-semibold text-slate-900">Por evento</p>
          <p className="text-[12px] text-muted-foreground">Prazos contados de {hojeBr}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:ml-auto">
            {BUCKETS.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span aria-hidden="true" className="h-2 w-2 rounded-[2px]" style={{ background: b.cor }} />
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {eventosVisiveis.map((e) => {
          const naEscalacao = e.etapas.escalacao + e.etapas.completa;
          return (
            <div
              key={e.eventId}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-50 px-4 py-[13px] last:border-b-0 hover:bg-[#FBFCFE] ${e.jaTerminou ? "opacity-65" : ""}`}
            >
              <div className="min-w-0 basis-full sm:basis-auto sm:flex-[1_1_32%]">
                <p className="truncate text-[13px] font-semibold text-slate-900" title={e.nome}>{e.nome}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {dm(e.ini)} – {dm(e.fim)} ·{" "}
                  <span
                    className={e.critico ? "rounded bg-[#FFFBEB] px-1 py-px font-medium text-[#B45309]" : ""}
                    data-testid={e.critico ? `prazo-critico-${e.eventId}` : undefined}
                  >
                    {textoDePrazo(e.prazoDias)}
                  </span>
                  {" · "}{textoDeFimDeSemana(e.noFimDeSemana, e.total)}
                </p>
              </div>

              <div className="min-w-0 basis-full sm:basis-auto sm:min-w-[220px] sm:flex-[1_1_42%]">
                <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Andamento de ${e.nome}`}>
                  {e.segmentos.map((s) => (
                    <span key={s.key} title={`${s.label}: ${s.n}`} style={{ width: `${s.pct}%`, background: s.cor }} />
                  ))}
                </div>
                {/* Os números de cada etapa (18/09: "só sei pelo gráfico, não tenho a quantidade"). */}
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-600" data-testid={`etapas-${e.eventId}`}>
                  <Contagem n={e.etapas.validacao} texto="em validação" cor={COR.validacao} />
                  <Contagem n={e.etapas.aprovacao} texto="em aprovação" cor={COR.aprovacao} />
                  <Contagem
                    n={e.etapas.escalacao}
                    texto="em escalação"
                    cor={COR.vaga}
                    detalhe={[
                      e.naEscalacao.semNome ? `${e.naEscalacao.semNome} sem nome` : "",
                      e.naEscalacao.salvo ? `${e.naEscalacao.salvo} salvo` : "",
                      e.naEscalacao.gestor ? `${e.naEscalacao.gestor} com o gestor` : "",
                    ].filter(Boolean).join(" · ") || undefined}
                  />
                  <Contagem n={e.etapas.completa} texto="escalação completa" cor={COR.escalado} />
                  <span className="tabular-nums text-muted-foreground">· {e.total} {e.total === 1 ? "vaga" : "vagas"}</span>
                </p>
                {/* Depois da escalação: passagem e hotel (18/09). */}
                {(e.logistica.passagens.precisam > 0 || e.logistica.hoteis.precisam > 0) && (
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" data-testid={`logistica-${e.eventId}`}>
                    <LinhaDeLogistica
                      icone={<Plane className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      feitos={e.logistica.passagens.emitidas}
                      precisam={e.logistica.passagens.precisam}
                      oque={e.logistica.passagens.precisam === 1 ? "passagem" : "passagens"}
                      feito={e.logistica.passagens.precisam === 1 ? "emitida" : "emitidas"}
                    />
                    <LinhaDeLogistica
                      icone={<BedDouble className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      feitos={e.logistica.hoteis.reservados}
                      precisam={e.logistica.hoteis.precisam}
                      oque={e.logistica.hoteis.precisam === 1 ? "hospedagem" : "hospedagens"}
                      feito={e.logistica.hoteis.precisam === 1 ? "reservada" : "reservadas"}
                    />
                  </p>
                )}
              </div>

              <span className="w-16 shrink-0 text-right leading-tight" title="Escalação completa (confirmada) sobre o total de vagas do evento">
                <span
                  className="block text-[17px] font-semibold tabular-nums"
                  style={{ color: e.completaPct === 100 ? "#047857" : e.critico ? "#B45309" : "#0F172A" }}
                >
                  {e.completaPct}%
                </span>
                <span className="block text-[10px] text-muted-foreground">completa</span>
              </span>

              {/* Cada botão leva ao lugar onde a etapa se resolve, já no evento. */}
              <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                {e.etapas.validacao > 0 && (
                  <Link href={linkDaEtapa("validacao", e.eventId)} className={BOTAO} data-testid={`link-validacao-${e.eventId}`}>
                    Validação
                  </Link>
                )}
                {e.etapas.aprovacao > 0 && (
                  <Link href={linkDaEtapa("aprovacao", e.eventId)} className={BOTAO} data-testid={`link-aprovacao-${e.eventId}`}>
                    Aprovação
                  </Link>
                )}
                {naEscalacao > 0 && (
                  <button type="button" onClick={() => onVerVagasDoEvento(e.eventId)} className={BOTAO} data-testid={`button-ver-vagas-${e.eventId}`}>
                    Ver vagas
                  </button>
                )}
                {e.logistica.passagens.precisam > 0 && (
                  <Link href={`/tickets?event=${encodeURIComponent(e.eventId)}`} className={BOTAO} data-testid={`link-passagens-${e.eventId}`}>
                    Passagens
                  </Link>
                )}
              </div>
            </div>
          );
        })}

        {eventos.length > quantosEventos && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border bg-background px-4 py-2.5">
            <span className="text-[12px] tabular-nums text-[#475569]">
              Mostrando {eventosVisiveis.length} de {eventos.length} eventos · os mais urgentes primeiro
            </span>
            <button
              type="button"
              onClick={() => setQuantosEventos((n) => n + EVENTOS_POR_VEZ)}
              className="h-[26px] rounded-[7px] border border-border bg-card px-2.5 text-[12px] font-medium text-primary hover:border-primary hover:bg-brand-soft"
              data-testid="button-mais-eventos"
            >
              Mostrar mais {Math.min(EVENTOS_POR_VEZ, eventos.length - quantosEventos)}
            </button>
            <button
              type="button"
              onClick={() => setQuantosEventos(eventos.length)}
              className="h-[26px] rounded-[7px] px-2 text-[12px] font-medium text-muted-foreground hover:text-primary"
              data-testid="button-todos-eventos"
            >
              Mostrar todos
            </button>
          </div>
        )}

        {eventos.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            Nenhuma vaga viva neste recorte.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section aria-label="Funções descobertas" className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-[14px] font-semibold text-slate-900">Onde falta gente</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Funções com vaga sem nome na escalação, da mais descoberta para a menos.</p>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {funcoes.map((f) => (
              <button
                key={f.functionId}
                type="button"
                onClick={() => onVerFuncao(f.nome)}
                className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-[11px] text-left last:border-b-0 hover:bg-[#FBFCFE] focus-visible:bg-brand-soft focus-visible:outline-none"
                data-testid={`button-funcao-descoberta-${f.functionId}`}
              >
                <span className="w-[116px] shrink-0 truncate text-[13px] text-slate-700" title={f.nome}>{f.nome}</span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-2 rounded-full bg-[#FBBF24]" style={{ width: `${(f.abertas / maiorFalta) * 100}%` }} />
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#B45309]">{f.abertas}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">de {f.total}</span>
              </button>
            ))}
          </div>
          {funcoes.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-[#047857]">Todas as vagas da escalação deste recorte já têm nome.</p>
          )}
        </section>

        <section aria-label="Escalações travadas" className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-[14px] font-semibold text-slate-900">Esperando alguém decidir</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Validação, aprovação, gestor, troca e pedido de ajuste — o que está parado há mais tempo primeiro.</p>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {travas.map((g) => {
              const etapa = g.tipo === "validacao" || g.tipo === "aprovacao" ? g.tipo : null;
              const conteudo = (
                <>
                  <span aria-hidden="true" className="h-[26px] w-[3px] shrink-0 rounded-full" style={{ background: COR_DA_ESPERA[g.tipo] }} />
                  <span className="w-[46px] shrink-0 font-mono text-[12px] text-muted-foreground">{etapa ? `×${g.quantidade}` : g.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-slate-900" title={g.nome}>{g.nome}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{g.funcao} · {g.oque}</span>
                  </span>
                  {g.diasParado !== null && (
                    <span className={`shrink-0 whitespace-nowrap text-[12px] ${g.diasParado >= DIAS_ESPERA_ATRASADA ? "font-semibold text-[#B91C1C]" : "text-muted-foreground"}`}>
                      {g.diasParado === 0 ? "hoje" : `há ${g.diasParado} ${g.diasParado === 1 ? "dia" : "dias"}`}
                    </span>
                  )}
                </>
              );
              const cls = "flex w-full items-center gap-2.5 border-b border-slate-50 px-4 py-[11px] text-left no-underline last:border-b-0 hover:bg-[#FBFCFE] focus-visible:bg-brand-soft focus-visible:outline-none";
              // Validação/aprovação resolvem-se em outra tela — o link já leva ao evento.
              return etapa && g.eventId ? (
                <Link key={`${etapa}-${g.eventId}`} href={linkDaEtapa(etapa, g.eventId)} className={cls} data-testid={`link-espera-${etapa}-${g.eventId}`}>
                  {conteudo}
                </Link>
              ) : (
                <button key={g.inclusion.id} type="button" onClick={() => onAbrirLinha(g.inclusion)} className={cls} data-testid={`button-gargalo-${g.inclusion.id}`}>
                  {conteudo}
                </button>
              );
            })}
          </div>
          {travas.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-[#047857]">Nada esperando decisão neste recorte.</p>
          )}
        </section>
      </div>
    </div>
  );
}
