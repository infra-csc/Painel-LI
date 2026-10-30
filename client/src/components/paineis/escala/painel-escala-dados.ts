/**
 * Painel da escala (30/10) — as contas, todas PURAS.
 *
 * Pedido do dono: "pegar atualizações o mais rápido possível para agir". Três
 * perguntas, cada uma com a MESMA régua das telas de trabalho:
 *
 *  1. **Atrasos por evento** — quantas vagas estão paradas em cada etapa com o
 *     prazo vencido ou vencendo. A régua é a do Quadro de prazos das Análises:
 *     cada vaga trava numa etapa só (`quadroDoEvento`), o prazo é D-N da data
 *     do evento (`prazoDaEtapa`, com os Dia(s) do evento do cadastro via
 *     `analisarPorEvento`) e a cor é `situacaoDoPrazo` (vencido / vence em até
 *     3 dias). Passagem e hotel ficam nos painéis próprios.
 *  2. **Esperando decisão** — validação da área, aprovação, gestor da
 *     cenotécnica, troca de colaborador e pedido de ajuste: há quantos dias, e
 *     QUEM precisa agir. "Atrasado" = esperando há 3 dias ou mais
 *     (`DIAS_ESPERA_ATRASADA`, o mesmo do "Esperando alguém decidir") ou com o
 *     prazo da etapa vencido.
 *  3. **Eventos lado a lado** — pessoas por função, diárias, logística e
 *     composição de 2 a 4 eventos (regras de diária em `diariasDaVaga`).
 *
 * Nada aqui busca dado nem conhece React: o hook (use-painel-escala.ts) monta
 * o contexto com as consultas da Escalação e a tela só desenha.
 */
import type { TeamInclusion } from "@shared/schema";
import {
  DIAS_PADRAO, diasDeAtraso, prazoDaEtapa, situacaoDoPrazo,
  type DiasDosPrazos, type SituacaoDoPrazo,
} from "@shared/prazos-da-escala";
import { diasDeTrabalhoDaVaga, normalizarDiasMeiaExtra } from "@shared/meia-diaria";
import {
  DIAS_ESPERA_ATRASADA, diasParadaNaEtapa, ehSugestao, quadroDoEvento, vagasVivas,
  type AnalyticsContext, type EventoAnalisado,
} from "@/components/scaling/scaling-analytics-data";

const MS_DIA = 86_400_000;
const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Dias inteiros entre a data e hoje (0 = hoje). null sem data válida. */
export function diasDesde(valor: string | Date | null | undefined, hoje: Date): number | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((inicioDoDia(hoje).getTime() - inicioDoDia(d).getTime()) / MS_DIA));
}

// ── 1. Atrasos por evento ──────────────────────────────────────────────────

/** As etapas da ESCALA que o painel cobra (passagem e hotel têm painel próprio). */
export type EtapaDoPainel = "validacao" | "aprovacao" | "escalacao" | "escalado";
export const ETAPAS_DO_PAINEL: EtapaDoPainel[] = ["validacao", "aprovacao", "escalacao", "escalado"];

/** Rótulo curto da coluna — o que está parado ali. */
export const ROTULO_DO_PAINEL: Record<EtapaDoPainel, string> = {
  validacao: "Em validação",
  aprovacao: "Em aprovação",
  escalacao: "Sem nome",
  escalado: "A confirmar",
};

export interface CelulaDeAtraso {
  etapa: EtapaDoPainel;
  /** Vagas PARADAS nesta etapa (o mesmo número do Quadro). */
  vagas: TeamInclusion[];
  prazo: Date | null;
  situacao: SituacaoDoPrazo;
  /** Positivo = dias de atraso; negativo = dias de folga; null sem data. */
  atraso: number | null;
}

export interface EventoComAtraso {
  evento: EventoAnalisado;
  celulas: Record<EtapaDoPainel, CelulaDeAtraso>;
  /** Vagas em células com o prazo vencido. */
  vagasAtrasadas: number;
  /** Vagas em células que vencem em até 3 dias. */
  vagasVencendo: number;
  /** Maior atraso entre as células vencidas (dias); null quando nada venceu. */
  piorAtraso: number | null;
  /** Dias até o próximo vencimento entre as que vencem logo; null sem nenhuma. */
  proximoVencimento: number | null;
}

/**
 * Por evento AINDA NÃO TERMINADO, as vagas paradas em cada etapa e o prazo de
 * cada uma. Só entram eventos com alguma célula vencida ou vencendo; a ordem é
 * a de trabalho: maior atraso, mais vagas atrasadas, vencimento mais perto.
 */
export function atrasosPorEvento(eventos: EventoAnalisado[], ctx: AnalyticsContext, hoje: Date, dias: DiasDosPrazos = DIAS_PADRAO): EventoComAtraso[] {
  const out: EventoComAtraso[] = [];
  for (const evento of eventos) {
    if (evento.jaTerminou) continue;
    const quadro = quadroDoEvento(evento.vagas, ctx);
    const base = evento.dataEvento ?? evento.ini;
    let vagasAtrasadas = 0;
    let vagasVencendo = 0;
    let piorAtraso: number | null = null;
    let proximoVencimento: number | null = null;
    const celulas = Object.fromEntries(ETAPAS_DO_PAINEL.map((etapa) => {
      const vagas = quadro.colunas[etapa].paradas;
      const prazo = prazoDaEtapa(base, etapa, dias);
      const situacao = situacaoDoPrazo(prazo, hoje, vagas.length);
      const atraso = diasDeAtraso(prazo, hoje);
      if (situacao === "atrasado") {
        vagasAtrasadas += vagas.length;
        piorAtraso = Math.max(piorAtraso ?? 0, atraso ?? 0);
      } else if (situacao === "vence_logo") {
        vagasVencendo += vagas.length;
        const faltam = -(atraso ?? 0);
        proximoVencimento = proximoVencimento === null ? faltam : Math.min(proximoVencimento, faltam);
      }
      const celula: CelulaDeAtraso = { etapa, vagas, prazo, situacao, atraso };
      return [etapa, celula];
    })) as Record<EtapaDoPainel, CelulaDeAtraso>;
    if (vagasAtrasadas + vagasVencendo === 0) continue;
    out.push({ evento, celulas, vagasAtrasadas, vagasVencendo, piorAtraso, proximoVencimento });
  }
  return out.sort((a, b) =>
    (b.piorAtraso ?? -1) - (a.piorAtraso ?? -1)
    || b.vagasAtrasadas - a.vagasAtrasadas
    || (a.proximoVencimento ?? 99) - (b.proximoVencimento ?? 99)
    || (a.evento.prazoDias ?? 9999) - (b.evento.prazoDias ?? 9999),
  );
}

/** Quantas vagas atrasadas em cada etapa, somando todos os eventos — o gráfico do topo. */
export function atrasadasPorEtapa(linhas: EventoComAtraso[]): Record<EtapaDoPainel, { atrasadas: number; vencendo: number }> {
  const out = Object.fromEntries(ETAPAS_DO_PAINEL.map((e) => [e, { atrasadas: 0, vencendo: 0 }])) as Record<EtapaDoPainel, { atrasadas: number; vencendo: number }>;
  for (const l of linhas) {
    for (const etapa of ETAPAS_DO_PAINEL) {
      const c = l.celulas[etapa];
      if (c.situacao === "atrasado") out[etapa].atrasadas += c.vagas.length;
      else if (c.situacao === "vence_logo") out[etapa].vencendo += c.vagas.length;
    }
  }
  return out;
}

// ── 2. Esperando decisão ───────────────────────────────────────────────────

export type TipoDeEspera = "validacao" | "aprovacao" | "gestor" | "troca" | "ajuste";
export const TIPOS_DE_ESPERA: TipoDeEspera[] = ["validacao", "aprovacao", "gestor", "troca", "ajuste"];

export const ROTULO_DA_ESPERA: Record<TipoDeEspera, string> = {
  validacao: "Validação da área",
  aprovacao: "Aprovação",
  gestor: "Gestor da cenotécnica",
  troca: "Troca de colaborador",
  ajuste: "Pedido de ajuste",
};

/** O que o painel precisa além do contexto das Análises. */
export interface ContextoDoPainel extends AnalyticsContext {
  /** Quem precisa agir nesta espera, para a função da vaga (nomes). Vazio = ninguém cadastrado. */
  quemAge: (tipo: TipoDeEspera, functionId: string) => string[];
  /** Quando a troca pendente da vaga foi pedida. */
  desdeDaTroca?: (i: TeamInclusion) => string | Date | null | undefined;
  /** Quando o pedido de ajuste/exclusão em aberto foi feito. */
  desdeDoPedido?: (i: TeamInclusion) => string | Date | null | undefined;
}

export interface GrupoDeEspera {
  tipo: TipoDeEspera;
  vagas: TeamInclusion[];
  /** Há quantos dias a vaga MAIS ANTIGA espera. */
  diasMaisAntiga: number | null;
  /** Validação/Aprovação: dias de atraso do prazo da etapa (positivo = vencido). */
  atrasoDoPrazo: number | null;
  /** Espera ≥ 3 dias ou prazo da etapa vencido. */
  atrasado: boolean;
  /** Quem age, com quantas vagas cada um — o mais carregado primeiro. */
  quemAge: { nome: string; vagas: number }[];
  /** Funções envolvidas (nomes, sem repetição). */
  funcoes: string[];
}

export interface EsperaDoEvento {
  evento: EventoAnalisado;
  grupos: GrupoDeEspera[];
  /** Maior espera entre os grupos (dias). */
  maiorEspera: number;
  atrasado: boolean;
  totalVagas: number;
}

/** Em qual espera a vaga está (null = não espera decisão de ninguém). Uma vaga, um tipo. */
export function tipoDeEsperaDaVaga(i: TeamInclusion, ctx: AnalyticsContext): TipoDeEspera | null {
  if (ehSugestao(i)) return i.status === "sugestao_validada" ? "aprovacao" : "validacao";
  if (i.status === "aguardando_producao") return "gestor";
  if (ctx.temTroca(i)) return "troca";
  if (ctx.temPedido(i)) return "ajuste";
  return null;
}

/** Há quantos dias a vaga espera nesta etapa. */
export function diasEsperando(i: TeamInclusion, tipo: TipoDeEspera, ctx: ContextoDoPainel, hoje: Date): number | null {
  if (tipo === "validacao" || tipo === "aprovacao") return diasParadaNaEtapa(i, tipo, hoje);
  if (tipo === "troca") return diasDesde(ctx.desdeDaTroca?.(i) ?? i.updatedAt, hoje);
  if (tipo === "ajuste") return diasDesde(ctx.desdeDoPedido?.(i) ?? i.updatedAt, hoje);
  return diasDesde(i.updatedAt, hoje);
}

export const SEM_RESPONSAVEL = "Sem responsável cadastrado";

export function esperasPorEvento(eventos: EventoAnalisado[], ctx: ContextoDoPainel, hoje: Date, dias: DiasDosPrazos = DIAS_PADRAO): EsperaDoEvento[] {
  const out: EsperaDoEvento[] = [];
  for (const evento of eventos) {
    if (evento.jaTerminou) continue;
    const porTipo = new Map<TipoDeEspera, TeamInclusion[]>();
    for (const i of evento.vagas) {
      const t = tipoDeEsperaDaVaga(i, ctx);
      if (!t) continue;
      const l = porTipo.get(t);
      if (l) l.push(i); else porTipo.set(t, [i]);
    }
    if (porTipo.size === 0) continue;
    const grupos: GrupoDeEspera[] = [];
    for (const tipo of TIPOS_DE_ESPERA) {
      const vagas = porTipo.get(tipo);
      if (!vagas) continue;
      const diasList = vagas.map((i) => diasEsperando(i, tipo, ctx, hoje)).filter((d): d is number => d !== null);
      const diasMaisAntiga = diasList.length ? Math.max(...diasList) : null;
      const atrasoDoPrazo = tipo === "validacao" || tipo === "aprovacao"
        ? diasDeAtraso(prazoDaEtapa(evento.dataEvento ?? evento.ini, tipo, dias), hoje)
        : null;
      const quem = new Map<string, number>();
      for (const i of vagas) {
        const nomes = ctx.quemAge(tipo, i.functionId);
        for (const n of nomes.length ? nomes : [SEM_RESPONSAVEL]) quem.set(n, (quem.get(n) ?? 0) + 1);
      }
      grupos.push({
        tipo, vagas, diasMaisAntiga, atrasoDoPrazo,
        atrasado: (diasMaisAntiga ?? 0) >= DIAS_ESPERA_ATRASADA || (atrasoDoPrazo ?? 0) > 0,
        quemAge: Array.from(quem.entries()).map(([nome, n]) => ({ nome, vagas: n }))
          .sort((a, b) => (a.nome === SEM_RESPONSAVEL ? 1 : 0) - (b.nome === SEM_RESPONSAVEL ? 1 : 0) || b.vagas - a.vagas || a.nome.localeCompare(b.nome, "pt-BR")),
        funcoes: Array.from(new Set(vagas.map((i) => ctx.getFunctionName(i.functionId)))).sort((a, b) => a.localeCompare(b, "pt-BR")),
      });
    }
    out.push({
      evento,
      grupos,
      maiorEspera: Math.max(0, ...grupos.map((g) => g.diasMaisAntiga ?? 0)),
      atrasado: grupos.some((g) => g.atrasado),
      totalVagas: grupos.reduce((s, g) => s + g.vagas.length, 0),
    });
  }
  return out.sort((a, b) =>
    Number(b.atrasado) - Number(a.atrasado) || b.maiorEspera - a.maiorEspera || b.totalVagas - a.totalVagas,
  );
}

export interface CargaDoResponsavel {
  nome: string;
  vagas: number;
  /** Vagas em grupos atrasados. */
  atrasadas: number;
  maiorEspera: number;
  eventos: number;
}

/** Quem está segurando mais vagas — para saber quem cobrar primeiro. */
export function cargaPorResponsavel(esperas: EsperaDoEvento[]): CargaDoResponsavel[] {
  const m = new Map<string, CargaDoResponsavel & { ids: Set<string> }>();
  for (const e of esperas) {
    for (const g of e.grupos) {
      for (const q of g.quemAge) {
        const atual = m.get(q.nome) ?? { nome: q.nome, vagas: 0, atrasadas: 0, maiorEspera: 0, eventos: 0, ids: new Set<string>() };
        atual.vagas += q.vagas;
        if (g.atrasado) atual.atrasadas += q.vagas;
        atual.maiorEspera = Math.max(atual.maiorEspera, g.diasMaisAntiga ?? 0);
        atual.ids.add(e.evento.eventId);
        m.set(q.nome, atual);
      }
    }
  }
  return Array.from(m.values())
    .map(({ ids, ...r }) => ({ ...r, eventos: ids.size }))
    .sort((a, b) => b.atrasadas - a.atrasadas || b.vagas - a.vagas || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ── 3. Eventos lado a lado ─────────────────────────────────────────────────

/**
 * Pessoas de uma vaga: 1, ou as pessoas da empreita por EMPRESA (a vaga
 * cobre N pessoas fornecidas pela empresa).
 */
export function pessoasDaVaga(i: TeamInclusion): number {
  const n = Number(i.empreitaPessoas);
  return i.empreitaEmpresa && Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/**
 * Diárias de UMA pessoa da vaga, na escala (planejado — não o Realizado):
 *  - dias de trabalho: os `workDays` marcados ou, sem eles, o período
 *    início→fim da escala (`diasDeTrabalhoDaVaga`, a mesma regra do Planejado);
 *    vaga antiga sem datas usa a quantidade gravada (`dailyRates`);
 *  - + ½ por dia de 1,5 diária (carga/descarga, `diasMeiaExtra`), só os que
 *    são dias de trabalho da vaga;
 *  - a dobra de turno é só do Realizado (29/10) — não existe na escala.
 * Não aplica a regra casa/CLT (dia útil sem diária): o painel compara o
 * TAMANHO da escala (dias × pessoas), não o custo.
 */
export function diariasDaVaga(i: TeamInclusion): number {
  const dias = diasDeTrabalhoDaVaga(i);
  const base = dias.length > 0 ? dias.length : Math.max(0, Math.floor(Number(i.dailyRates) || 0));
  const meias = dias.length > 0 ? normalizarDiasMeiaExtra(i.diasMeiaExtra, dias).length : 0;
  return base + meias / 2;
}

export type TipoDoColaborador = "casa" | "freela" | "local" | null | undefined;

export interface ContextoDaComparacao {
  temNome: (i: TeamInclusion) => boolean;
  getFunctionName: (functionId: string | null) => string;
  /** casa / freela / local, do cadastro do colaborador. */
  tipoDoColaborador: (collaboratorId: string | null | undefined) => TipoDoColaborador;
}

export interface NumerosDaFuncao { pessoas: number; diarias: number }

export interface ResumoDoEvento {
  eventId: string;
  pessoas: number;
  diarias: number;
  /** null quando não há pessoas. */
  diariasPorPessoa: number | null;
  passagem: number;
  hotel: number;
  /** Precisa de passagem ou de hotel. */
  viajantes: number;
  locais: number;
  casa: number;
  /** Freela, local contratado na cidade e empreita por empresa. */
  freela: number;
  semNome: number;
  /** Ainda na validação/aprovação — a escala pode mudar. */
  emSugestao: number;
  porFuncao: Map<string, NumerosDaFuncao>;
}

/** O resumo de UM evento a partir das vagas vivas dele (sugestões incluídas). */
export function resumirEvento(eventId: string, linhas: TeamInclusion[], ctx: ContextoDaComparacao): ResumoDoEvento {
  const r: ResumoDoEvento = {
    eventId, pessoas: 0, diarias: 0, diariasPorPessoa: null, passagem: 0, hotel: 0, viajantes: 0, locais: 0,
    casa: 0, freela: 0, semNome: 0, emSugestao: 0, porFuncao: new Map(),
  };
  for (const i of vagasVivas(linhas)) {
    if (i.eventId !== eventId) continue;
    const p = pessoasDaVaga(i);
    const d = diariasDaVaga(i) * p;
    r.pessoas += p;
    r.diarias += d;
    if (i.needsTicket) r.passagem += p;
    if (i.needsAccommodation) r.hotel += p;
    if (i.needsTicket || i.needsAccommodation) r.viajantes += p; else r.locais += p;
    if (ehSugestao(i)) r.emSugestao += p;
    if (i.empreitaEmpresa) r.freela += p;
    else if (!ctx.temNome(i)) r.semNome += p;
    else if (ctx.tipoDoColaborador(i.collaboratorId) === "casa") r.casa += p;
    else r.freela += p;
    const f = r.porFuncao.get(i.functionId) ?? { pessoas: 0, diarias: 0 };
    f.pessoas += p;
    f.diarias += d;
    r.porFuncao.set(i.functionId, f);
  }
  r.diariasPorPessoa = r.pessoas > 0 ? r.diarias / r.pessoas : null;
  return r;
}

export interface LinhaDaFuncao {
  functionId: string;
  nome: string;
  /** Um por evento, na ordem da comparação. */
  valores: NumerosDaFuncao[];
  /** Maior − menor número de pessoas entre os eventos. */
  amplitude: number;
  /** A diferença chama atenção: ≥ 3 pessoas E ≥ 30% do maior. */
  diferencaGrande: boolean;
}

export const DIFERENCA_MINIMA_PESSOAS = 3;
export const DIFERENCA_MINIMA_PCT = 0.3;

export function diferencaGrande(pessoas: number[]): boolean {
  if (pessoas.length < 2) return false;
  const max = Math.max(...pessoas);
  const min = Math.min(...pessoas);
  return max - min >= DIFERENCA_MINIMA_PESSOAS && (max - min) / max >= DIFERENCA_MINIMA_PCT;
}

/** As funções dos eventos comparados, as maiores diferenças primeiro. */
export function compararPorFuncao(resumos: ResumoDoEvento[], getFunctionName: (id: string) => string): LinhaDaFuncao[] {
  const ids = new Set<string>();
  for (const r of resumos) r.porFuncao.forEach((_, id) => ids.add(id));
  return Array.from(ids).map((functionId) => {
    const valores = resumos.map((r) => r.porFuncao.get(functionId) ?? { pessoas: 0, diarias: 0 });
    const pessoas = valores.map((v) => v.pessoas);
    return {
      functionId,
      nome: getFunctionName(functionId),
      valores,
      amplitude: Math.max(...pessoas) - Math.min(...pessoas),
      diferencaGrande: diferencaGrande(pessoas),
    };
  }).sort((a, b) => Number(b.diferencaGrande) - Number(a.diferencaGrande) || b.amplitude - a.amplitude || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ── Eventos parecidos ──────────────────────────────────────────────────────

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * O "nome-base" do evento — o que se repete entre as etapas de um circuito:
 * "Viva Esporte - Serra" e "Viva Esporte – Cariacica 2026" → "viva esporte";
 * "Circuito das Estações - Primavera SP" → "circuito das estacoes".
 * Corta no primeiro separador (" - ", " – ", " | ", ":"), tira acento, ano,
 * "etapa N"/"Nª etapa" e números soltos. Sem separador, o nome inteiro limpo.
 */
export function nomeBase(nome: string): string {
  const cortado = nome.split(/\s[-–—|]\s|:\s?|\s\/\s/)[0] ?? nome;
  return semAcento(cortado)
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b\d+\s*(a|ª|o|º)?\s*etapa\b|\betapa\s*\d+\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface EventoParaComparar { id: string; nome: string; data: string | null }

/**
 * Até `max` eventos com o mesmo nome-base do alvo (o alvo primeiro), os de
 * data mais perto da dele antes. Nome-base com menos de 3 letras não agrupa.
 */
export function eventosParecidos(alvoId: string, eventos: EventoParaComparar[], max = 4): string[] {
  const alvo = eventos.find((e) => e.id === alvoId);
  if (!alvo) return [alvoId];
  const base = nomeBase(alvo.nome);
  if (base.length < 3) return [alvoId];
  const t = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).getTime() : Number.NaN);
  const ta = t(alvo.data);
  const outros = eventos
    .filter((e) => e.id !== alvoId && nomeBase(e.nome) === base)
    .sort((a, b) => {
      const da = Math.abs(t(a.data) - ta);
      const db = Math.abs(t(b.data) - ta);
      return (Number.isNaN(da) ? Infinity : da) - (Number.isNaN(db) ? Infinity : db) || a.nome.localeCompare(b.nome, "pt-BR");
    });
  return [alvoId, ...outros.map((e) => e.id)].slice(0, max);
}

export interface GrupoParecido { base: string; rotulo: string; ids: string[] }

/**
 * Circuitos com 2+ eventos (nome-base igual), os maiores primeiro — viram os
 * atalhos "Comparar Viva Esporte (4)". O rótulo é o trecho original do
 * primeiro nome antes do separador.
 */
export function gruposParecidos(eventos: EventoParaComparar[]): GrupoParecido[] {
  const m = new Map<string, EventoParaComparar[]>();
  for (const e of eventos) {
    const base = nomeBase(e.nome);
    if (base.length < 3) continue;
    const l = m.get(base);
    if (l) l.push(e); else m.set(base, [e]);
  }
  const out: GrupoParecido[] = [];
  m.forEach((lista, base) => {
    if (lista.length < 2) return;
    const ordenada = [...lista].sort((a, b) => String(a.data ?? "9999").localeCompare(String(b.data ?? "9999")));
    out.push({ base, rotulo: (lista[0].nome.split(/\s[-–—|]\s|:\s?|\s\/\s/)[0] ?? lista[0].nome).trim(), ids: ordenada.map((e) => e.id) });
  });
  return out.sort((a, b) => b.ids.length - a.ids.length || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

// ── Formatação ─────────────────────────────────────────────────────────────

/** 12 → "12"; 12,5 → "12,5"; uma casa no máximo. */
export function numero(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

export const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** "há 4 dias" / "hoje" / "—". */
export function textoHaDias(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "hoje";
  return `há ${d} ${plural(d, "dia", "dias")}`;
}

/** "3 dias atrasado" / "vence hoje" / "vence em 2 dias". */
export function textoDoAtraso(c: Pick<CelulaDeAtraso, "situacao" | "atraso">): string {
  const a = c.atraso ?? 0;
  if (c.situacao === "atrasado") return `${a} ${plural(a, "dia", "dias")} de atraso`;
  if (c.situacao === "vence_logo") return a === 0 ? "vence hoje" : `vence em ${-a} ${plural(-a, "dia", "dias")}`;
  return "";
}
