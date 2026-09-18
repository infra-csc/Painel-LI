/**
 * Números da aba Análises da Escalação (01/09) — lógica pura.
 *
 * A tela não respondia "como estão os eventos". Os dois banners contavam
 * pendência da LINHA; ninguém contava COBERTURA: quantas vagas de cada evento
 * ainda estão sem nome, e com quanto prazo.
 *
 * **Regra de fonte de dados, e ela importa:** as Análises leem a base do
 * recorte de evento, período e excluídas — NÃO dos filtros de situação nem da
 * fila. "Quantas faltam escalar" não pode ser respondido por uma lista já
 * filtrada por "vaga aberta". Linhas canceladas saem de todos os totais.
 *
 * **Preenchimento é sobre NOME, não sobre status.** Uma vaga com o gestor já
 * tem gente. Misturar as duas coisas produzia um "60%" que contradizia o
 * "faltam 2" logo ao lado — dois números na mesma faixa dizendo coisas
 * diferentes sobre o mesmo fato.
 */
import type { TeamInclusion } from "@shared/schema";
import { diaLocal, ehFimDeSemana, pegaFimDeSemana, inicioDoDia } from "./scaling-period";
import { getScalingStatusKey } from "./scaling-status";

const MS_DIA = 86_400_000;

export interface AnalyticsContext {
  temNome: (i: TeamInclusion) => boolean;
  temTroca: (i: TeamInclusion) => boolean;
  temPedido: (i: TeamInclusion) => boolean;
  getEventName: (eventId: string | null) => string;
  getFunctionName: (functionId: string | null) => string;
  getCollaboratorName: (collaboratorId?: string | null) => string;
  /**
   * Datas do EVENTO, que não são as da escala: a equipe entra dias antes para
   * montar. Quem pede gente fala a data do evento ("Primavera São Paulo, dia
   * 12"), então é ela que sai no relatório.
   */
  getEventDates?: (eventId: string | null) => { startDate?: string | null; endDate?: string | null } | undefined;
}

export type BucketKey = "escalado" | "salvo" | "gestor" | "vaga" | "aprovacao" | "validacao";

/**
 * A ordem é de RESOLVIDO para PENDENTE — a barra se lê da esquerda como
 * progresso. Mesma ordem no empilhamento e na legenda.
 *
 * Validação e aprovação (dono, 18/09: "sinto que não está completa") — a vaga
 * nasce na Validação de Escala, passa pela Aprovação e só então chega à
 * escalação. Sem essas duas etapas o evento parecia mais vazio do que estava.
 */
export const BUCKETS: { key: BucketKey; label: string; cor: string }[] = [
  // Sem "Aprovado" (15/09): confirmada é Escalado; com nome sem confirmar é Salvo.
  { key: "escalado", label: "Escalado", cor: "#10B981" },
  { key: "salvo", label: "Salvo · falta confirmar", cor: "#6366F1" },
  { key: "gestor", label: "Com o gestor", cor: "#EF4444" },
  { key: "vaga", label: "Vaga aberta", cor: "#FBBF24" },
  { key: "aprovacao", label: "Em aprovação", cor: "#C084FC" },
  { key: "validacao", label: "Em validação", cor: "#94A3B8" },
];

/** A vaga ainda está na Validação/Aprovação de Escala (antes da escalação). */
export const ehSugestao = (i: TeamInclusion): boolean =>
  (i as any).phase === "sugestao" || String(i.status ?? "").startsWith("sugestao_");

/** As quatro etapas do caminho da vaga, na ordem em que ela anda. */
export type Etapa = "validacao" | "aprovacao" | "escalacao" | "completa";

export function etapaDaLinha(i: TeamInclusion, ctx: AnalyticsContext): Etapa {
  if (ehSugestao(i)) return i.status === "sugestao_validada" ? "aprovacao" : "validacao";
  return bucketDaLinha(i, ctx) === "escalado" ? "completa" : "escalacao";
}

export function bucketDaLinha(i: TeamInclusion, ctx: AnalyticsContext): BucketKey {
  if (ehSugestao(i)) return i.status === "sugestao_validada" ? "aprovacao" : "validacao";
  if (!ctx.temNome(i)) return "vaga";
  if (i.status === "aguardando_producao") return "gestor";
  const key = getScalingStatusKey(i);
  if (key === "escalado") return "escalado";
  if (key === "salvo") return "salvo";
  return "vaga";
}

export interface Kpis {
  /** Vagas com nome ÷ vagas vivas, arredondado. 100 quando não há vaga. */
  preenchimentoPct: number;
  faltamEscalar: number;
  /**
   * Dias até a próxima escala a COMEÇAR. Só olha o futuro de propósito: com
   * eventos antigos na base, o menor número é sempre de algo que já aconteceu,
   * e o KPI dizia "já começou" para sempre — verdade inútil.
   * null quando não há nenhuma escala futura.
   */
  prazoMaisCurtoDias: number | null;
  travadas: number;
  totalVivas: number;
  /** Por etapa (18/09): quantas estão em cada ponto do caminho. */
  emValidacao: number;
  emAprovacao: number;
  /** Já na escalação, ainda não confirmadas (sem nome, salvas ou com o gestor). */
  emEscalacao: number;
  completas: number;
  /** Escalação completa ÷ vagas vivas, arredondado. */
  completaPct: number;
}

/** Linhas vivas do recorte — canceladas, excluídas e sugestões negadas nunca entram nos totais. */
export function vagasVivas(linhas: TeamInclusion[]): TeamInclusion[] {
  return linhas.filter((i) => i.status !== "cancelado" && i.status !== "sugestao_negada" && !i.deletedAt);
}

/** Quantas vagas em cada etapa. */
export function contarEtapas(linhas: TeamInclusion[], ctx: AnalyticsContext): Record<Etapa, number> {
  const c: Record<Etapa, number> = { validacao: 0, aprovacao: 0, escalacao: 0, completa: 0 };
  for (const i of linhas) c[etapaDaLinha(i, ctx)] += 1;
  return c;
}

export function calcularKpis(linhas: TeamInclusion[], ctx: AnalyticsContext, hoje: Date): Kpis {
  const vivas = vagasVivas(linhas);
  const etapas = contarEtapas(vivas, ctx);
  // "Faltam escalar" é sobre a escalação: sugestão ainda não pode ser escalada.
  const naEscalacao = vivas.filter((i) => !ehSugestao(i));
  const comNome = vivas.filter((i) => ctx.temNome(i)).length;
  const inicios = vivas.map((i) => diaLocal(i.scheduleStartDate)).filter((d): d is Date => !!d);
  const base = inicioDoDia(hoje).getTime();
  return {
    preenchimentoPct: vivas.length === 0 ? 100 : Math.round((comNome / vivas.length) * 100),
    faltamEscalar: naEscalacao.filter((i) => !ctx.temNome(i)).length,
    emValidacao: etapas.validacao,
    emAprovacao: etapas.aprovacao,
    emEscalacao: etapas.escalacao,
    completas: etapas.completa,
    completaPct: vivas.length === 0 ? 100 : Math.round((etapas.completa / vivas.length) * 100),
    prazoMaisCurtoDias: (() => {
      const futuros = inicios.map((d) => d.getTime()).filter((t) => t >= base);
      return futuros.length === 0 ? null : Math.round((Math.min(...futuros) - base) / MS_DIA);
    })(),
    travadas: vivas.filter((i) => i.status === "aguardando_producao" || ctx.temTroca(i) || ctx.temPedido(i)).length,
    totalVivas: vivas.length,
  };
}

export interface EventoAnalisado {
  eventId: string;
  nome: string;
  /** Menor início → maior fim das vagas deste evento. */
  ini: Date | null;
  fim: Date | null;
  /** Dias até o início. Negativo = já começou. */
  prazoDias: number | null;
  total: number;
  abertas: number;
  preenchimentoPct: number;
  /** Quantas vagas cruzam um sábado ou domingo. */
  noFimDeSemana: number;
  /**
   * Prazo curto E vaga aberta. É o único cruzamento que muda a decisão do dia:
   * prazo curto sozinho não é problema, e vaga aberta com 70 dias de folga
   * também não.
   */
  critico: boolean;
  /**
   * A última escala do evento já passou. Uma vaga aberta aqui é histórico, não
   * trabalho: sem esta distinção, todo evento antigo entrava como "crítico"
   * (vaga aberta + prazo negativo) e ocupava o topo da lista para sempre.
   */
  jaTerminou: boolean;
  segmentos: { key: BucketKey; label: string; cor: string; n: number; pct: number }[];
  /** Quantas em cada etapa — os números que antes só dava para ler pela barra (18/09). */
  etapas: Record<Etapa, number>;
  /** Detalhe de "em escalação": sem nome, salvo (falta confirmar), com o gestor. */
  naEscalacao: { semNome: number; salvo: number; gestor: number };
  /** Escalação completa ÷ vagas do evento. */
  completaPct: number;
}

/** Abaixo disto, com vaga aberta, o evento entra em alerta. */
export const DIAS_PRAZO_CRITICO = 21;

export function analisarPorEvento(linhas: TeamInclusion[], ctx: AnalyticsContext, hoje: Date): EventoAnalisado[] {
  const vivas = vagasVivas(linhas);
  const porEvento = new Map<string, TeamInclusion[]>();
  for (const i of vivas) {
    const lista = porEvento.get(i.eventId);
    if (lista) lista.push(i); else porEvento.set(i.eventId, [i]);
  }
  const base = inicioDoDia(hoje).getTime();

  const out: EventoAnalisado[] = [];
  porEvento.forEach((doEvento, eventId) => {
    const periodos = doEvento
      .map((i) => {
        const ini = diaLocal(i.scheduleStartDate);
        return ini ? { ini, fim: diaLocal(i.scheduleEndDate) ?? ini } : null;
      })
      .filter((p): p is { ini: Date; fim: Date } => !!p);
    const ini = periodos.length ? new Date(Math.min(...periodos.map((p) => p.ini.getTime()))) : null;
    const fim = periodos.length ? new Date(Math.max(...periodos.map((p) => p.fim.getTime()))) : null;
    // Sem nome NA ESCALAÇÃO — sugestão em validação/aprovação ainda não se escala.
    const abertas = doEvento.filter((i) => !ehSugestao(i) && !ctx.temNome(i)).length;
    const prazoDias = ini ? Math.round((ini.getTime() - base) / MS_DIA) : null;
    const jaTerminou = !!fim && fim.getTime() < base;
    const etapas = contarEtapas(doEvento, ctx);
    const buckets = doEvento.map((i) => bucketDaLinha(i, ctx));
    const quantos = (k: BucketKey) => buckets.filter((b) => b === k).length;

    out.push({
      eventId,
      nome: ctx.getEventName(eventId),
      ini, fim, prazoDias,
      total: doEvento.length,
      abertas,
      preenchimentoPct: Math.round(((doEvento.length - abertas) / doEvento.length) * 100),
      noFimDeSemana: periodos.filter((p) => pegaFimDeSemana(p.ini, p.fim)).length,
      jaTerminou,
      // Crítico: prazo curto com vaga ainda sem nome OU ainda presa na validação/aprovação.
      critico: (abertas > 0 || etapas.validacao + etapas.aprovacao > 0) && !jaTerminou && prazoDias !== null && prazoDias <= DIAS_PRAZO_CRITICO,
      etapas,
      naEscalacao: { semNome: quantos("vaga"), salvo: quantos("salvo"), gestor: quantos("gestor") },
      completaPct: Math.round((etapas.completa / doEvento.length) * 100),
      segmentos: BUCKETS.map((b) => {
        const n = quantos(b.key);
        return { ...b, n, pct: (n / doEvento.length) * 100 };
      // Segmento zerado NÃO é renderizado: um span de 0% ainda desenharia 1px
      // de cor falsa na barra.
      }).filter((s) => s.n > 0),
    });
  });

  // Ordem de trabalho, nesta ordem de importância: o que é crítico, depois o
  // que está mais perto, e por último o que já terminou — que não é ação de
  // hoje por mais buraco que tenha.
  return out.sort((a, b) => {
    if (a.jaTerminou !== b.jaTerminou) return a.jaTerminou ? 1 : -1;
    if (a.critico !== b.critico) return a.critico ? -1 : 1;
    if (a.prazoDias === null) return 1;
    if (b.prazoDias === null) return -1;
    // Entre os terminados, o mais recente primeiro; entre os futuros, o mais
    // próximo primeiro.
    return a.jaTerminou ? b.prazoDias - a.prazoDias : a.prazoDias - b.prazoDias;
  });
}

export interface FuncaoDescoberta {
  functionId: string;
  nome: string;
  abertas: number;
  total: number;
}

/** Funções com vaga sem nome, da mais descoberta para a menos. */
export function funcoesDescobertas(linhas: TeamInclusion[], ctx: AnalyticsContext): FuncaoDescoberta[] {
  const porFuncao = new Map<string, { abertas: number; total: number }>();
  // Só a escalação: sugestão em validação/aprovação ainda não é "falta gente".
  for (const i of vagasVivas(linhas).filter((x) => !ehSugestao(x))) {
    const atual = porFuncao.get(i.functionId) ?? { abertas: 0, total: 0 };
    atual.total += 1;
    if (!ctx.temNome(i)) atual.abertas += 1;
    porFuncao.set(i.functionId, atual);
  }
  const out: FuncaoDescoberta[] = [];
  porFuncao.forEach((v, functionId) => {
    if (v.abertas > 0) out.push({ functionId, nome: ctx.getFunctionName(functionId), abertas: v.abertas, total: v.total });
  });
  return out.sort((a, b) => b.abertas - a.abertas || a.nome.localeCompare(b.nome, "pt-BR"));
}

export interface Gargalo {
  inclusion: TeamInclusion;
  id: string;
  nome: string;
  funcao: string;
  /** O que está travando: "com o gestor", "troca de colaborador", "pedido de ajuste". */
  oque: string;
  tipo: "gestor" | "analise";
  /** Dias parados. null quando não há data de referência. */
  diasParado: number | null;
}

/** Quanto tempo de espera já conta como atraso visível. */
export const DIAS_ESPERA_ATRASADA = 3;

/**
 * Aprovação do gestor, troca e pedido de ajuste travam a compra. Os atrasados
 * vêm primeiro — é a lista de quem cobrar hoje.
 */
export function gargalos(linhas: TeamInclusion[], ctx: AnalyticsContext, hoje: Date): Gargalo[] {
  const base = inicioDoDia(hoje).getTime();
  const dias = (valor: string | Date | null | undefined): number | null => {
    if (!valor) return null;
    const d = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.round((base - inicioDoDia(d).getTime()) / MS_DIA));
  };

  const out: Gargalo[] = [];
  for (const i of vagasVivas(linhas)) {
    const comum = {
      inclusion: i,
      id: `#${i.inclusionNumber ?? ""}`,
      nome: (i as any).empreitaEmpresa ? `Empreita · ${(i as any).empreitaEmpresa}` : ctx.temNome(i) ? ctx.getCollaboratorName(i.collaboratorId) : "Vaga sem nome",
      funcao: ctx.getFunctionName(i.functionId),
    };
    if (i.status === "aguardando_producao") {
      // `updatedAt` é a melhor aproximação da transição de status disponível
      // na lista: quando o status é este, a última gravação foi o envio.
      out.push({ ...comum, oque: "com o gestor", tipo: "gestor", diasParado: dias(i.updatedAt) });
    } else if (ctx.temTroca(i)) {
      out.push({ ...comum, oque: "troca de colaborador", tipo: "analise", diasParado: dias(i.updatedAt) });
    } else if (ctx.temPedido(i)) {
      out.push({ ...comum, oque: "pedido de ajuste", tipo: "analise", diasParado: dias(i.updatedAt) });
    }
  }
  return out.sort((a, b) => (b.diasParado ?? -1) - (a.diasParado ?? -1));
}

/** "em 12 dias" / "começa hoje" / "já começou". */
export function textoDePrazo(dias: number | null): string {
  if (dias === null) return "sem data";
  if (dias < 0) return "já começou";
  if (dias === 0) return "começa hoje";
  return `em ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/** "8 pegam fim de semana" / "nenhuma no fim de semana" / "todas pegam…". */
export function textoDeFimDeSemana(n: number, total: number): string {
  if (n === 0) return "nenhuma no fim de semana";
  if (n === total) return "todas pegam fim de semana";
  return `${n} pegam fim de semana`;
}

export { ehFimDeSemana };
