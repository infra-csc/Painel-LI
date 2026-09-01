/**
 * Aba Análises da Escalação (01/09).
 *
 * A tela contava pendência de LINHA e não contava COBERTURA: quantas vagas de
 * cada evento ainda estão sem nome, e com quanto prazo. Esta aba responde isso
 * e devolve o usuário para a fila já filtrada — ver o problema e ir trabalhar
 * nele são o mesmo gesto.
 *
 * Os números vêm de scaling-analytics-data.ts, que lê a base do recorte de
 * evento/período/excluídas e NÃO dos filtros de situação: "quantas faltam
 * escalar" não pode ser respondido por uma lista já filtrada por "vaga aberta".
 */
import { useState } from "react";
import type { TeamInclusion } from "@shared/schema";
import {
  BUCKETS, DIAS_ESPERA_ATRASADA, analisarPorEvento, calcularKpis, funcoesDescobertas,
  gargalos, textoDeFimDeSemana, textoDePrazo, type AnalyticsContext,
} from "./scaling-analytics-data";

/**
 * Quantos eventos a lista mostra antes de pedir "mostrar mais". O protótipo
 * tinha quatro eventos de amostra; a base real tem duzentos, e sem corte o
 * cartão empurrava "Onde falta gente" e "Esperando alguém decidir" para fora
 * de qualquer tela. Como a ordem já é a de trabalho, os primeiros são os que
 * importam.
 */
const EVENTOS_POR_VEZ = 12;

const dm = (d: Date | null) =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "—";

interface Props {
  linhas: TeamInclusion[];
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
    <div className="flex-1 min-w-0 px-4 py-3.5 border-l border-slate-100 first:border-l-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums leading-none" style={{ color: cor }}>{valor}</p>
      <p className="mt-1.5 text-[12px] text-muted-foreground truncate">{sub}</p>
    </div>
  );
}

export default function ScalingAnalytics({ linhas, ctx, hoje, onVerVagasDoEvento, onVerFuncao, onAbrirLinha }: Props) {
  const kpis = calcularKpis(linhas, ctx, hoje);
  const eventos = analisarPorEvento(linhas, ctx, hoje);
  const funcoes = funcoesDescobertas(linhas, ctx);
  const travas = gargalos(linhas, ctx, hoje);
  const hojeBr = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [quantosEventos, setQuantosEventos] = useState(EVENTOS_POR_VEZ);
  const eventosVisiveis = eventos.slice(0, quantosEventos);

  return (
    <div className="flex flex-col gap-4" data-testid="aba-analises">
      <div className="flex rounded-xl border border-border bg-card overflow-hidden">
        <Kpi
          rotulo="Preenchimento"
          valor={`${kpis.preenchimentoPct}%`}
          sub={`${kpis.totalVivas - kpis.faltamEscalar} de ${kpis.totalVivas} vagas com nome`}
          cor={kpis.preenchimentoPct === 100 ? "#047857" : "#0F172A"}
        />
        <Kpi
          rotulo="Faltam escalar"
          valor={String(kpis.faltamEscalar)}
          sub={kpis.faltamEscalar === 0 ? "nenhuma vaga aberta" : "vagas sem nome"}
          cor={kpis.faltamEscalar === 0 ? "#047857" : "#B45309"}
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

      <section aria-label="Cobertura por evento" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <p className="text-[14px] font-semibold text-slate-900">Por evento</p>
          <p className="text-[12px] text-muted-foreground">Prazos contados de {hojeBr}</p>
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            {BUCKETS.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span aria-hidden="true" className="w-2 h-2 rounded-[2px]" style={{ background: b.cor }} />
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {eventosVisiveis.map((e) => (
          <div key={e.eventId} className={`flex items-center gap-4 px-4 py-[13px] border-b border-slate-50 last:border-b-0 hover:bg-[#FBFCFE] ${e.jaTerminou ? "opacity-65" : ""}`}>
            <div className="flex-[1_1_40%] min-w-0">
              <p className="text-[13px] font-semibold text-slate-900 truncate">{e.nome}</p>
              <p className="text-[12px] text-muted-foreground truncate">
                {dm(e.ini)} – {dm(e.fim)} ·{" "}
                <span
                  className={e.critico ? "rounded px-1 py-px font-medium text-[#B45309] bg-[#FFFBEB]" : ""}
                  data-testid={e.critico ? `prazo-critico-${e.eventId}` : undefined}
                >
                  {textoDePrazo(e.prazoDias)}
                </span>
                {" · "}{textoDeFimDeSemana(e.noFimDeSemana, e.total)}
              </p>
            </div>

            <div className="flex-[1_1_34%] min-w-[160px]">
              <div className="flex h-2 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`Cobertura de ${e.nome}`}>
                {e.segmentos.map((s) => (
                  <span key={s.key} title={`${s.label}: ${s.n}`} style={{ width: `${s.pct}%`, background: s.cor }} />
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                {e.total} {e.total === 1 ? "vaga" : "vagas"} ·{" "}
                <span className={e.abertas === 0 ? "text-[#047857]" : "font-medium text-[#B45309]"}>
                  {e.abertas === 0 ? "nenhuma sem nome" : `${e.abertas} sem nome`}
                </span>
              </p>
            </div>

            <span
              className="w-14 shrink-0 text-right text-[17px] font-semibold tabular-nums"
              style={{ color: e.preenchimentoPct === 100 ? "#047857" : e.critico ? "#B45309" : "#0F172A" }}
            >
              {e.preenchimentoPct}%
            </span>

            <button
              type="button"
              onClick={() => onVerVagasDoEvento(e.eventId)}
              className="shrink-0 h-[30px] px-2.5 rounded-lg border border-border bg-card text-[12px] font-medium text-primary hover:border-primary hover:bg-brand-soft"
              data-testid={`button-ver-vagas-${e.eventId}`}
            >
              Ver vagas
            </button>
          </div>
        ))}

        {eventos.length > quantosEventos && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-background border-t border-border">
            <span className="text-[12px] text-[#475569] tabular-nums">
              Mostrando {eventosVisiveis.length} de {eventos.length} eventos · os mais urgentes primeiro
            </span>
            <button
              type="button"
              onClick={() => setQuantosEventos((n) => n + EVENTOS_POR_VEZ)}
              className="h-[26px] px-2.5 rounded-[7px] border border-border bg-card text-[12px] font-medium text-primary hover:border-primary hover:bg-brand-soft"
              data-testid="button-mais-eventos"
            >
              Mostrar mais {Math.min(EVENTOS_POR_VEZ, eventos.length - quantosEventos)}
            </button>
            <button
              type="button"
              onClick={() => setQuantosEventos(eventos.length)}
              className="h-[26px] px-2 rounded-[7px] text-[12px] font-medium text-muted-foreground hover:text-primary"
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section aria-label="Funções descobertas" className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-[14px] font-semibold text-slate-900">Onde falta gente</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Funções com vaga sem nome, da mais descoberta para a menos.</p>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
          {funcoes.map((f) => (
            <button
              key={f.functionId}
              type="button"
              onClick={() => onVerFuncao(f.nome)}
              className="flex items-center gap-3 w-full px-4 py-[11px] border-b border-slate-50 last:border-b-0 text-left hover:bg-[#FBFCFE] focus-visible:outline-none focus-visible:bg-brand-soft"
              data-testid={`button-funcao-descoberta-${f.functionId}`}
            >
              <span className="w-[116px] shrink-0 text-[13px] text-slate-700 truncate">{f.nome}</span>
              <span className="flex-1 min-w-0 h-2 rounded-full bg-slate-100 overflow-hidden">
                <span
                  className="block h-2 rounded-full bg-[#FBBF24]"
                  style={{ width: `${(f.abertas / Math.max(...funcoes.map((x) => x.abertas))) * 100}%` }}
                />
              </span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#B45309]">{f.abertas}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">de {f.total}</span>
            </button>
          ))}
          </div>
          {funcoes.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-[#047857]">Todas as vagas deste recorte já têm nome.</p>
          )}
        </section>

        <section aria-label="Escalações travadas" className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-[14px] font-semibold text-slate-900">Esperando alguém decidir</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Aprovação do gestor, troca e pedido de ajuste travam a compra.</p>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
          {travas.map((g) => (
            <button
              key={g.inclusion.id}
              type="button"
              onClick={() => onAbrirLinha(g.inclusion)}
              className="flex items-center gap-2.5 w-full px-4 py-[11px] border-b border-slate-50 last:border-b-0 text-left hover:bg-[#FBFCFE]"
              data-testid={`button-gargalo-${g.inclusion.id}`}
            >
              <span
                aria-hidden="true"
                className="w-[3px] h-[26px] rounded-full shrink-0"
                style={{ background: g.tipo === "gestor" ? "#EF4444" : "#A855F7" }}
              />
              <span className="w-[46px] shrink-0 font-mono text-[12px] text-muted-foreground">{g.id}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] text-slate-900 truncate">{g.nome}</span>
                <span className="block text-[11px] text-muted-foreground truncate">{g.funcao} · {g.oque}</span>
              </span>
              {g.diasParado !== null && (
                <span
                  className={`shrink-0 text-[12px] whitespace-nowrap ${
                    g.diasParado >= DIAS_ESPERA_ATRASADA ? "font-semibold text-[#B91C1C]" : "text-muted-foreground"
                  }`}
                >
                  {g.diasParado === 0 ? "hoje" : `há ${g.diasParado} ${g.diasParado === 1 ? "dia" : "dias"}`}
                </span>
              )}
            </button>
          ))}
          </div>
          {travas.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-[#047857]">Nada travado neste recorte.</p>
          )}
        </section>
      </div>
    </div>
  );
}
