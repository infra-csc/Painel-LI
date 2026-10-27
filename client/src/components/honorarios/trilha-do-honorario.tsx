/**
 * TRILHA ÚNICA do honorário (Módulo de Honorários, Fase 0 — 26/10).
 *
 * O caminho do slide 8, igual em todas as telas do grupo Honorários:
 *   Previsto → Pré-aprovado → Em evento → Confirmado → Validado →
 *   OC emitida → NF enviada → NF lançada no M4 → Pago
 * Antes cada tela tinha a sua (Realizado 4 passos, Comparativo 5, Controle 6,
 * Notas 3). A regra de "onde o registro está" é uma só, no servidor e aqui:
 * shared/trilha-honorarios.ts.
 *
 * Duas formas:
 *  - `TrilhaDoRegistro` — UMA pessoa num evento (o cartão do Painel de
 *    honorários): feitas em verde com ✓, a etapa esperada com o anel, desvio
 *    (devolvido em âmbar, recusado em vermelho), "em breve" tracejado para o
 *    que o app ainda não faz (OC e pagamento), "não emite" quando pula a nota;
 *  - `TrilhaDoEvento` — o evento inteiro: quantos registros ESTÃO em cada
 *    etapa e em cada desvio; as etapas que a tela atual cuida ficam marcadas.
 *
 * No estreito, o registro vira uma barra de 9 segmentos com a frase do que
 * falta; o evento vira uma grade 3 × 3.
 *
 * 28/10 (Fase 2): OC emitida e Pago são reais (nada mais "em breve"); no
 * legado as duas aparecem riscadas com "não se aplica" (quem não emite NF,
 * as etapas da nota também).
 */
import { Check, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ETAPAS_DA_TRILHA, ROTULO_DO_DESVIO, definicaoDaEtapa, indiceDaEtapa,
  type ContagemDaTrilha, type DesvioDaTrilha, type EstadoDaEtapa, type EtapaDaTrilha, type PosicaoNaTrilha,
} from "@shared/trilha-honorarios";

const TOTAL = ETAPAS_DA_TRILHA.length;

/** Dica de uma etapa: o que é, quem faz e onde acontece hoje. */
function dicaDaEtapa(id: EtapaDaTrilha): string {
  const d = definicaoDaEtapa(id);
  if (!d.disponivel) return `${d.rotulo} — em breve. ${d.descricao}.`;
  return `${d.rotulo} — ${d.descricao}.${d.ondeHoje ? ` Hoje: ${d.ondeHoje}.` : ""}`;
}

/** "2 devolvidos", "1 não participou" — a contagem dos desvios na trilha do evento. */
const DESVIO_NO_SINGULAR: Record<DesvioDaTrilha, string> = { devolvido: "devolvido", recusado: "recusado", nao_participou: "não participou", concluido_fora_do_fluxo: "concluído fora do fluxo" };
const DESVIO_NO_PLURAL: Record<DesvioDaTrilha, string> = { devolvido: "devolvidos", recusado: "recusados", nao_participou: "não participaram", concluido_fora_do_fluxo: "concluídos fora do fluxo" };

const TOM_DO_DESVIO: Record<DesvioDaTrilha, string> = {
  devolvido: "bg-warning-soft text-warning border-warning/25",
  recusado: "bg-danger-soft text-danger border-danger/25",
  nao_participou: "bg-muted text-slate-600 border-transparent",
  concluido_fora_do_fluxo: "bg-muted text-slate-600 border-transparent",
};

/** Ponto de uma etapa (20px), com a cor do estado e do desvio. */
function Ponto({ estado, desvio, numero }: { estado: EstadoDaEtapa; desvio: DesvioDaTrilha | null; numero: number }) {
  const atualComDesvio = estado === "atual" && (desvio === "devolvido" || desvio === "recusado");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative z-[1] inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 text-2xs font-semibold tabular-nums",
        estado === "feita" && "bg-success-strong text-white",
        estado === "atual" && !atualComDesvio && "pla-etapa-atual bg-card border-2 border-primary text-primary",
        atualComDesvio && desvio === "devolvido" && "bg-card border-2 border-warning-strong text-warning-strong",
        atualComDesvio && desvio === "recusado" && "bg-danger-strong text-white",
        estado === "futura" && "bg-muted border border-border text-muted-foreground",
        estado === "em_breve" && "bg-card border border-dashed border-slate-400 text-muted-foreground",
        estado === "nao_se_aplica" && "bg-card border border-border text-muted-foreground",
      )}
    >
      {estado === "feita" ? <Check className="w-3 h-3" strokeWidth={3.5} />
        : atualComDesvio && desvio === "recusado" ? <X className="w-3 h-3" strokeWidth={3.5} />
        : estado === "atual" ? <span className="w-2 h-2 rounded-full bg-current" />
        : estado === "em_breve" ? <Clock className="w-2.5 h-2.5" aria-hidden="true" />
        : estado === "nao_se_aplica" ? "–"
        : numero}
    </span>
  );
}

/** Filete entre dois pontos (só no largo). */
function Filete({ feito }: { feito: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("absolute top-[9px] h-px right-[calc(50%+14px)] left-[calc(-50%+14px)]", feito ? "bg-success-strong/60" : "bg-border")}
    />
  );
}

export interface TrilhaDoRegistroProps {
  posicao: PosicaoNaTrilha;
  className?: string;
}

/** A trilha de UM registro (uma pessoa num evento). */
export function TrilhaDoRegistro({ posicao, className }: TrilhaDoRegistroProps) {
  const { estados, desvio, etapa, aguardando } = posicao;
  const aqui = definicaoDaEtapa(etapa);
  const iAqui = indiceDaEtapa(etapa);
  return (
    <div className={cn("min-w-0", className)} data-testid="trilha-do-registro" data-etapa={etapa} data-desvio={desvio ?? ""}>
      {/* Largo: as nove etapas numa linha. */}
      <ol className="m-0 p-0 list-none hidden md:grid grid-cols-9 min-w-0" aria-label={`Trilha do honorário: ${aqui.rotulo}${desvio ? ` (${ROTULO_DO_DESVIO[desvio]})` : ""}`}>
        {ETAPAS_DA_TRILHA.map((def, i) => {
          const estado = estados[def.id];
          return (
            <li
              key={def.id}
              className="relative flex flex-col items-center gap-1 min-w-0 px-0.5 text-center"
              title={dicaDaEtapa(def.id)}
              aria-current={estado === "atual" ? "step" : undefined}
              data-estado={estado}
            >
              {i > 0 && <Filete feito={estados[ETAPAS_DA_TRILHA[i - 1].id] === "feita" && estado === "feita"} />}
              <Ponto estado={estado} desvio={desvio} numero={i + 1} />
              <span
                className={cn(
                  "text-2xs leading-[14px] max-w-full",
                  estado === "feita" ? "text-success" : estado === "atual" ? "font-semibold text-foreground" : "text-muted-foreground",
                  estado === "nao_se_aplica" && "line-through decoration-border",
                )}
              >
                {def.rotulo}
              </span>
              {estado === "em_breve" && <span className="text-2xs leading-3 uppercase tracking-[0.04em] text-muted-foreground">em breve</span>}
              {estado === "nao_se_aplica" && <span className="text-2xs leading-3 text-muted-foreground" data-testid={`trilha-nao-se-aplica-${def.id}`}>não se aplica</span>}
            </li>
          );
        })}
      </ol>

      {/* Estreito: barra de nove segmentos. */}
      <div className="md:hidden flex items-center gap-[3px]" aria-hidden="true">
        {ETAPAS_DA_TRILHA.map((def) => {
          const estado = estados[def.id];
          return (
            <span
              key={def.id}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                estado === "feita" ? "bg-success-strong"
                  : estado === "atual" ? (desvio === "recusado" ? "bg-danger-strong" : desvio === "devolvido" ? "bg-warning-strong" : "bg-primary")
                  : estado === "em_breve" ? "border border-dashed border-slate-400"
                  : "bg-border",
              )}
            />
          );
        })}
      </div>

      {/* O que falta — nas duas larguras. */}
      <p className="m-0 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5" data-testid="trilha-aguardando">
        <span className="font-semibold text-foreground">
          <span className="md:hidden text-muted-foreground font-normal">Etapa {iAqui + 1} de {TOTAL} · </span>
          {aqui.rotulo}
        </span>
        {desvio && (
          <span className={cn("inline-flex items-center h-5 px-1.5 rounded-md border text-2xs font-medium", TOM_DO_DESVIO[desvio])}>
            {ROTULO_DO_DESVIO[desvio]}
          </span>
        )}
        <span className="text-muted-foreground">{aguardando}</span>
      </p>
    </div>
  );
}

export interface TrilhaDoEventoProps {
  contagem: ContagemDaTrilha | undefined;
  /** Etapas que ESTA tela cuida (ficam marcadas). */
  foco?: readonly EtapaDaTrilha[];
  carregando?: boolean;
  /** Falhou: a trilha some sem derrubar a tela (o resto do painel continua). */
  erro?: boolean;
  /** "deste evento" (padrão) ou "do recorte" (Painel com vários eventos). */
  escopo?: string;
  /** Nota miúda embaixo da trilha (ex.: por que a contagem difere da lista). */
  nota?: string;
  className?: string;
}

/**
 * A trilha do EVENTO: quantos registros estão em cada etapa. Faixa de um
 * painel de resumo (sem borda própria) — quem usa põe a borda de cima.
 */
export function TrilhaDoEvento({ contagem, foco = [], carregando, erro, escopo = "deste evento", nota, className }: TrilhaDoEventoProps) {
  if (erro) return null;
  const desvios = contagem
    ? (Object.entries(contagem.porDesvio) as [DesvioDaTrilha, number][]).filter(([, n]) => n > 0)
    : [];
  return (
    <div className={cn("min-w-0 px-4 py-3", className)} data-testid="trilha-do-evento" aria-busy={carregando || undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2.5">
        <p className="m-0 text-xs font-medium text-slate-600">
          Trilha do honorário
          {contagem && <span className="font-normal text-muted-foreground"> · onde {contagem.total === 1 ? "está o registro" : `estão os ${contagem.total} registros`} {escopo}</span>}
        </p>
        {desvios.length > 0 && (
          <p className="m-0 flex flex-wrap items-center gap-1.5" data-testid="trilha-desvios">
            {desvios.map(([d, n]) => (
              <span key={d} className={cn("inline-flex items-center h-5 px-1.5 rounded-md border text-2xs font-medium tabular-nums", TOM_DO_DESVIO[d])}>
                {n} {(n === 1 ? DESVIO_NO_SINGULAR : DESVIO_NO_PLURAL)[d]}
              </span>
            ))}
          </p>
        )}
      </div>
      <ol className="m-0 p-0 list-none grid grid-cols-3 md:grid-cols-9 gap-y-2.5 min-w-0" aria-label="Quantos registros estão em cada etapa">
        {ETAPAS_DA_TRILHA.map((def, i) => {
          const n = contagem?.porEtapa[def.id] ?? 0;
          const daTela = foco.includes(def.id);
          return (
            <li
              key={def.id}
              className={cn("relative flex flex-col items-center gap-1 min-w-0 px-0.5 text-center", daTela && "md:bg-brand-soft/60 rounded-lg")}
              title={dicaDaEtapa(def.id)}
              data-etapa={def.id}
              data-testid={`trilha-evento-${def.id}`}
            >
              {i > 0 && <span aria-hidden="true" className="hidden md:block absolute top-[11px] h-px right-[calc(50%+16px)] left-[calc(-50%+16px)] bg-border" />}
              <span
                className={cn(
                  "relative z-[1] inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full text-xs font-semibold tabular-nums",
                  !def.disponivel ? "bg-card border border-dashed border-slate-400 text-muted-foreground"
                    : carregando ? "bg-muted text-transparent"
                    : n > 0 ? (daTela ? "bg-primary text-primary-foreground" : "bg-foreground/85 text-background")
                    : "bg-muted text-muted-foreground",
                )}
              >
                {!def.disponivel ? <Clock className="w-3 h-3" aria-hidden="true" /> : carregando ? "0" : n}
              </span>
              <span className={cn("text-2xs leading-[14px] max-w-full", daTela ? "font-semibold text-primary" : n > 0 ? "text-slate-700" : "text-muted-foreground")}>
                {def.rotulo}
              </span>
              <span className="sr-only">{def.disponivel ? `${n} ${n === 1 ? "registro" : "registros"}` : "em breve"}</span>
              {!def.disponivel && <span aria-hidden="true" className="text-2xs leading-3 uppercase tracking-[0.04em] text-muted-foreground">em breve</span>}
            </li>
          );
        })}
      </ol>
      {nota && <p className="m-0 mt-2.5 text-2xs leading-4 text-muted-foreground" data-testid="trilha-nota">{nota}</p>}
    </div>
  );
}
