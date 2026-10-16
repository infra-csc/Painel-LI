/**
 * PREVISÃO POR ESCALAÇÃO — "vai subir / vai baixar" (dono, 09/10) — e o
 * ORÇAMENTO do que falta comprar. Puro e testado; só admin vê (mesma regra
 * das abas de análise).
 *
 * É ESTIMATIVA, nunca certeza: cada linha diz de onde veio a conclusão e com
 * quanta amostra. Três sinais, somados com pesos:
 *  (a) ANTECEDÊNCIA — quantos dias faltam × a curva da rota (ou a geral,
 *      quando a rota tem pouca amostra): se a próxima faixa (esperar mais)
 *      costuma ser mais cara, tende a subir;
 *  (b) PREÇO ATUAL × TÍPICO — a última consulta da mesma rota/data contra o
 *      típico da rota naquela antecedência: bem acima costuma cair; bem
 *      abaixo é bom momento (tende a subir daqui);
 *  (c) EVOLUÇÃO — as consultas da mesma rota/data ao longo dos dias.
 * Sem nenhum sinal → "Sem dado suficiente" (estado honesto).
 */
import { chaveDaRota, faixaDaAntecedencia, FAIXAS_DE_ANTECEDENCIA, precoTipico, tipoDaRota, type ChaveDaAntecedencia, type TendenciaDoPreco } from "./regras-da-busca";
import { acrescentar, curvaDeAntecedencia, indicesDasConsultas, type ConsultaDoHistorico, type GrupoDePreco, type PassagemDaBusca } from "./analise-da-busca";
import { diasEntre } from "./analise-de-passagens";
import type { PernaDaRota } from "./busca-de-passagens";

/** Rota com pelo menos isto de consultas usa a PRÓPRIA curva; abaixo, a geral. */
export const MIN_CONSULTAS_DA_CURVA_DA_ROTA = 8;
/** A curva geral só vale com isto de consultas comparáveis. */
export const MIN_CONSULTAS_DA_CURVA_GERAL = 15;
/** Diferença mínima entre faixas para virar sinal (ruído abaixo disto). */
export const LIMIAR_DA_CURVA = 0.08;
/** Preço atual acima/abaixo do típico que vira sinal. */
export const LIMIAR_ACIMA_DO_TIPICO = 0.15;
export const LIMIAR_ABAIXO_DO_TIPICO = 0.1;
/** Variação entre consultas da mesma rota/data que vira sinal. */
export const LIMIAR_DA_EVOLUCAO = 0.05;
/** Consulta mais velha que isto não é "preço atual". */
export const DIAS_DO_PRECO_ATUAL = 10;

export interface RotaDaVaga {
  perna: PernaDaRota;
  origem: string;
  destino: string;
  dataIda: string;
  dataVolta: string | null;
  chave: string;
}

/** Escalação pendente (precisa de passagem e ainda não tem). */
export interface VagaParaPrevisao {
  vagaId: string;
  numero: number | null;
  colaborador: string;
  funcao: string;
  eventId: string;
  eventName: string;
  eventStart: string | null;
  /** As rotas que a busca consultaria (vazio = falta dado para saber a rota). */
  rotas: RotaDaVaga[];
  /** O que falta para saber a rota (quando `rotas` vem vazio). */
  falta: string | null;
}

export type AcaoSugerida = "comprar_agora" | "pode_esperar" | "acompanhar" | "sem_dado";
export type Confianca = "boa" | "media" | "baixa";

export interface SinalDaPrevisao { lado: "subir" | "baixar"; peso: number; texto: string }

export interface PrevisaoDaVaga extends Omit<VagaParaPrevisao, "rotas"> {
  rota: RotaDaVaga | null;
  diasParaVoo: number | null;
  tendencia: TendenciaDoPreco;
  acao: AcaoSugerida;
  /** "Compre agora — tende a subir". */
  titulo: string;
  sinais: SinalDaPrevisao[];
  confianca: Confianca | null;
  /** "14 consultas desta rota" / "curva geral (62 consultas)". */
  amostraTexto: string;
  precoAtual: { preco: number; dia: string } | null;
  precoTipico: number | null;
  /** Ordem da lista: menor = mais urgente. */
  urgencia: number;
}

export interface ResumoDaPrevisao { total: number; subir: number; baixar: number; estavel: number; semDado: number; subirEmBreve: number }

const pct = (x: number) => Math.round(x * 100);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "faltam 9 dias" / "falta 1 dia" / "o voo é hoje". */
export const faltam = (dias: number) => (dias <= 0 ? "o voo é hoje" : dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`);
const ordemDaFaixa = (k: ChaveDaAntecedencia) => FAIXAS_DE_ANTECEDENCIA.findIndex((f) => f.chave === k);

/** A rota "principal" da vaga para a previsão: ida e volta, ou a ida, ou a volta. */
export const rotaPrincipal = (rotas: readonly RotaDaVaga[]) =>
  rotas.find((r) => r.perna === "ida_e_volta") ?? rotas.find((r) => r.perna === "ida") ?? rotas[0] ?? null;

export interface ContextoDaPrevisao {
  consultas: readonly ConsultaDoHistorico[];
  hoje: string;
}

/** Pré-calcula índices e curvas (uma vez por lista). */
export function prepararPrevisao(ctx: ContextoDaPrevisao) {
  const indices = indicesDasConsultas(ctx.consultas);
  const curvaGeral = curvaDeAntecedencia(ctx.consultas, indices);
  const geralValida = curvaGeral.filter((g) => g.comparavel && g.indice !== null).length >= 3
    && curvaGeral.reduce((s, g) => s + (g.indice !== null ? g.n : 0), 0) >= MIN_CONSULTAS_DA_CURVA_GERAL;
  const porRota = new Map<string, ConsultaDoHistorico[]>();
  for (const c of ctx.consultas) {
    if (!c.menorPrecoCentavos || c.menorPrecoCentavos <= 0) continue;
    acrescentar(porRota, chaveDaRota(c.perna, c.origem, c.destino), c);
  }
  const curvas = new Map<string, GrupoDePreco[]>();
  const curvaDaRota = (k: string) => {
    if (!curvas.has(k)) curvas.set(k, curvaDeAntecedencia(porRota.get(k) ?? [], indices));
    return curvas.get(k)!;
  };
  // Típico da rota inteira, uma vez por rota (antes: reordenado a cada escalação).
  const tipicos = new Map<string, ReturnType<typeof precoTipico>>();
  const tipicoDaRotaInteira = (k: string) => {
    if (!tipicos.has(k)) tipicos.set(k, precoTipico((porRota.get(k) ?? []).map((c) => c.menorPrecoCentavos)));
    return tipicos.get(k) ?? null;
  };
  return { indices, curvaGeral: geralValida ? curvaGeral : null, porRota, curvaDaRota, tipicoDaRotaInteira, hoje: ctx.hoje };
}

type Preparado = ReturnType<typeof prepararPrevisao>;

/** Previsão de UMA escalação. */
export function preverVaga(v: VagaParaPrevisao, p: Preparado): PrevisaoDaVaga {
  const { rotas: _rotas, ...resto } = v;
  const rota = rotaPrincipal(v.rotas);
  const base = { ...resto, rota, sinais: [] as SinalDaPrevisao[], precoAtual: null, precoTipico: null };
  if (!rota) {
    return { ...base, diasParaVoo: null, tendencia: "sem_dado", acao: "sem_dado", titulo: "Sem dado suficiente", confianca: null, amostraTexto: v.falta ?? "Rota ainda desconhecida", urgencia: 900 };
  }
  const dias = diasEntre(p.hoje, rota.dataIda);
  const kRota = chaveDaRota(rota.perna, rota.origem, rota.destino);
  const daRota = p.porRota.get(kRota) ?? [];
  const sinais: SinalDaPrevisao[] = [];

  // (a) Curva de antecedência: a da rota, se tiver amostra; senão a geral.
  const curvaRota = daRota.length >= MIN_CONSULTAS_DA_CURVA_DA_ROTA ? p.curvaDaRota(kRota) : null;
  const curvaRotaValida = curvaRota && curvaRota.filter((g) => g.n >= 2 && g.indice !== null).length >= 2 ? curvaRota : null;
  const curva = curvaRotaValida ?? p.curvaGeral;
  const fonte = curvaRotaValida ? "nesta rota" : "no geral";
  const faixa = faixaDaAntecedencia(dias);
  const idx = (k: ChaveDaAntecedencia | null) => (k ? curva?.find((g) => g.chave === k && g.indice !== null && g.n >= 2)?.indice ?? null : null);
  if (curva && faixa) {
    const atual = idx(faixa);
    const proxima = ordemDaFaixa(faixa) > 0 ? FAIXAS_DE_ANTECEDENCIA[ordemDaFaixa(faixa) - 1] : null;
    const idxProx = proxima ? idx(proxima.chave) : null;
    if (atual !== null && idxProx !== null && proxima) {
      const mudanca = idxProx / atual - 1;
      if (mudanca >= LIMIAR_DA_CURVA) {
        sinais.push({ lado: "subir", peso: 2, texto: `${faltam(dias)}; ${fonte} o preço sobe ~${pct(mudanca)}% com ${proxima.rotulo.toLowerCase()}` });
      } else if (mudanca <= -LIMIAR_DA_CURVA) {
        sinais.push({ lado: "baixar", peso: 1, texto: `${faltam(dias)}; ${fonte} o preço costuma ficar ~${pct(-mudanca)}% menor com ${proxima.rotulo.toLowerCase()}` });
      }
    } else if (!proxima && atual !== null) {
      const outras = curva.filter((g) => g.chave !== faixa && g.indice !== null && g.n >= 2).map((g) => g.indice as number);
      if (outras.length && atual >= Math.max(...outras)) {
        sinais.push({ lado: "subir", peso: 1, texto: `${faltam(dias)}; ${fonte}, perto do voo é quando o preço fica mais alto` });
      }
    }
  }

  // (b) Preço atual × típico (na antecedência de agora, quando a curva diz).
  const daData = daRota
    .filter((c) => c.dataIda === rota.dataIda && (c.dataVolta ?? null) === (rota.dataVolta ?? null) && !c.deslocada)
    .sort((a, b) => a.consultadoEm.localeCompare(b.consultadoEm));
  const ultima = daData[daData.length - 1];
  const precoAtual = ultima && diasEntre(ultima.dia, p.hoje) <= DIAS_DO_PRECO_ATUAL ? { preco: ultima.menorPrecoCentavos as number, dia: ultima.dia } : null;
  const naData = new Set(daData);
  const tipicoDaRota = (naData.size > 0 ? precoTipico(daRota.filter((c) => !naData.has(c)).map((c) => c.menorPrecoCentavos)) : null) ?? p.tipicoDaRotaInteira(kRota);
  const ajusteDaFaixa = curva && faixa ? idx(faixa) : null;
  const precoTipicoAgora = tipicoDaRota ? Math.round(tipicoDaRota.mediana * (ajusteDaFaixa ?? 1)) : null;
  if (precoAtual && precoTipicoAgora) {
    const razao = precoAtual.preco / precoTipicoAgora - 1;
    if (razao >= LIMIAR_ACIMA_DO_TIPICO) sinais.push({ lado: "baixar", peso: 1.5, texto: `preço atual ${pct(razao)}% acima do típico — costuma cair` });
    else if (razao <= -LIMIAR_ABAIXO_DO_TIPICO) sinais.push({ lado: "subir", peso: 1.5, texto: `preço atual ${pct(-razao)}% abaixo do típico — bom momento` });
  }

  // (c) Evolução das consultas da mesma rota/data.
  const diasDistintos = Array.from(new Map(daData.map((c) => [c.dia, c])).values());
  if (diasDistintos.length >= 2) {
    const primeira = diasDistintos[0], ult = diasDistintos[diasDistintos.length - 1];
    const variacao = (ult.menorPrecoCentavos as number) / (primeira.menorPrecoCentavos as number) - 1;
    if (variacao >= LIMIAR_DA_EVOLUCAO) sinais.push({ lado: "subir", peso: 1, texto: `subiu ${pct(variacao)}% desde ${ddmm(primeira.dia)}` });
    else if (variacao <= -LIMIAR_DA_EVOLUCAO) sinais.push({ lado: "baixar", peso: 1, texto: `caiu ${pct(-variacao)}% desde ${ddmm(primeira.dia)}` });
  }

  const placar = sinais.reduce((s, x) => s + (x.lado === "subir" ? x.peso : -x.peso), 0);
  const tendencia: TendenciaDoPreco = sinais.length === 0 ? "sem_dado" : placar >= 1 ? "subir" : placar <= -1 ? "baixar" : "estavel";
  let acao: AcaoSugerida, titulo: string;
  if (tendencia === "subir") { acao = "comprar_agora"; titulo = "Compre agora — tende a subir"; }
  else if (tendencia === "baixar" && dias > 10) { acao = "pode_esperar"; titulo = "Pode esperar — tende a baixar"; }
  else if (tendencia === "baixar") { acao = "acompanhar"; titulo = `Tende a baixar, mas ${faltam(dias)} — acompanhe de perto`; }
  else if (tendencia === "estavel") { acao = "acompanhar"; titulo = "Sem pressa clara — sinais se anulam"; }
  else { acao = "sem_dado"; titulo = daRota.length > 0 ? "Sem sinal claro — o histórico não aponta direção" : "Sem dado suficiente"; }

  // Confiança: quanto dado sustenta a conclusão. Nunca "certeza".
  const concordam = sinais.filter((s) => (placar >= 0 ? s.lado === "subir" : s.lado === "baixar")).length;
  const confianca: Confianca | null = sinais.length === 0 ? null
    : curvaRotaValida && daRota.length >= 12 && concordam >= 2 ? "boa"
    : (curvaRotaValida || daRota.length >= 6 || (p.curvaGeral && sinais.length >= 2)) ? "media" : "baixa";
  const amostraTexto = daRota.length > 0
    ? `${daRota.length} ${daRota.length === 1 ? "consulta" : "consultas"} desta rota${curvaRotaValida ? "" : p.curvaGeral ? " · curva geral" : ""}`
    : p.curvaGeral ? "rota nunca consultada · curva geral" : "rota nunca consultada";
  const urgencia = tendencia === "subir" ? Math.max(0, dias) : tendencia === "estavel" ? 300 + dias : tendencia === "baixar" ? (dias > 10 ? 600 + dias : 200 + dias) : 800 + Math.max(0, dias);
  return { ...base, diasParaVoo: dias, tendencia, acao, titulo, sinais, confianca, amostraTexto, precoAtual, precoTipico: precoTipicoAgora, urgencia };
}

/** Todas as escalações pendentes, as mais urgentes primeiro (vai subir + faltam poucos dias). */
export function preverEscalacoes(vagas: readonly VagaParaPrevisao[], ctx: ContextoDaPrevisao): { linhas: PrevisaoDaVaga[]; resumo: ResumoDaPrevisao } {
  const p = prepararPrevisao(ctx);
  const linhas = vagas.map((v) => preverVaga(v, p)).sort((a, b) => a.urgencia - b.urgencia || (a.numero ?? 0) - (b.numero ?? 0));
  const resumo: ResumoDaPrevisao = {
    total: linhas.length,
    subir: linhas.filter((l) => l.tendencia === "subir").length,
    baixar: linhas.filter((l) => l.tendencia === "baixar").length,
    estavel: linhas.filter((l) => l.tendencia === "estavel").length,
    semDado: linhas.filter((l) => l.tendencia === "sem_dado").length,
    subirEmBreve: linhas.filter((l) => l.tendencia === "subir" && (l.diasParaVoo ?? 99) <= 14).length,
  };
  return { linhas, resumo };
}

// ── Orçamento: quanto falta gastar por evento ──────────────────────────────

export type FonteDaEstimativa = "ultima_consulta" | "tipico_da_rota" | "media_paga";

export interface OrcamentoDoEvento {
  eventId: string;
  nome: string;
  inicio: string | null;
  /** Já gasto: passagens registradas (valor + bagagem), atuais e de troca. */
  gasto: number;
  passagens: number;
  pendentes: number;
  /** Estimativa do que falta (centavos). */
  estimado: number;
  comEstimativa: number;
  semEstimativa: number;
  total: number;
  fontes: Record<FonteDaEstimativa, number>;
}

export interface Orcamento {
  eventos: OrcamentoDoEvento[];
  totais: { gasto: number; estimado: number; pendentes: number; semEstimativa: number };
  /** Médias pagas usadas quando a rota não tem consulta (centavos). */
  mediaPaga: { idaEVolta: number | null; umaPerna: number | null };
}

/**
 * Estimativa do que falta por vaga: a última consulta da mesma rota/data (até
 * 14 dias), senão o típico da rota, senão a média paga (ida e volta ou uma
 * perna). Cada número diz de onde veio; sem nenhuma base, a vaga fica "sem
 * estimativa" — nunca chutada.
 */
export function orcamentoPorEvento(entrada: {
  pendentes: readonly VagaParaPrevisao[];
  passagens: readonly PassagemDaBusca[];
  consultas: readonly ConsultaDoHistorico[];
  hoje: string;
}): Orcamento {
  const porRota = new Map<string, ConsultaDoHistorico[]>();
  for (const c of entrada.consultas) {
    if (!c.menorPrecoCentavos || c.menorPrecoCentavos <= 0) continue;
    acrescentar(porRota, chaveDaRota(c.perna, c.origem, c.destino), c);
  }
  const pagas = entrada.passagens.filter((p) => typeof p.valor === "number" && p.valor > 0);
  const mediaDe = (l: number[]) => (l.length >= 3 ? Math.round(l.reduce((s, x) => s + x, 0) / l.length) : null);
  const mediaPaga = {
    idaEVolta: mediaDe(pagas.filter((p) => p.idaEVolta && !p.trechoDireto).map((p) => p.valor as number)),
    umaPerna: mediaDe(pagas.filter((p) => !p.idaEVolta).map((p) => p.valor as number)),
  };
  const tipicos = new Map<string, ReturnType<typeof precoTipico>>();
  const estimarRota = (r: RotaDaVaga): { valor: number; fonte: FonteDaEstimativa } | null => {
    const k = chaveDaRota(r.perna, r.origem, r.destino);
    const lista = porRota.get(k) ?? [];
    const daData = lista.filter((c) => c.dataIda === r.dataIda && (c.dataVolta ?? null) === (r.dataVolta ?? null) && !c.deslocada)
      .sort((a, b) => b.consultadoEm.localeCompare(a.consultadoEm))[0];
    if (daData && diasEntre(daData.dia, entrada.hoje) <= 14) return { valor: daData.menorPrecoCentavos as number, fonte: "ultima_consulta" };
    if (!tipicos.has(k)) tipicos.set(k, precoTipico(lista.map((c) => c.menorPrecoCentavos)));
    const t = tipicos.get(k) ?? null;
    if (t) return { valor: t.mediana, fonte: "tipico_da_rota" };
    const m = tipoDaRota(r.perna) === "rt" ? mediaPaga.idaEVolta : mediaPaga.umaPerna;
    return m ? { valor: m, fonte: "media_paga" } : null;
  };

  const eventos = new Map<string, OrcamentoDoEvento>();
  const evento = (id: string, nome: string, inicio: string | null) => {
    const e = eventos.get(id) ?? { eventId: id, nome, inicio, gasto: 0, passagens: 0, pendentes: 0, estimado: 0, comEstimativa: 0, semEstimativa: 0, total: 0, fontes: { ultima_consulta: 0, tipico_da_rota: 0, media_paga: 0 } };
    eventos.set(id, e);
    return e;
  };
  for (const v of entrada.pendentes) {
    const e = evento(v.eventId, v.eventName, v.eventStart);
    e.pendentes += 1;
    const estimativas = v.rotas.map(estimarRota);
    if (v.rotas.length === 0 || estimativas.some((x) => x === null)) { e.semEstimativa += 1; continue; }
    e.comEstimativa += 1;
    for (const x of estimativas) { e.estimado += x!.valor; e.fontes[x!.fonte] += 1; }
  }
  // Gasto só dos eventos que ainda têm algo a comprar ou que começam a partir de hoje.
  for (const p of entrada.passagens) {
    const ativo = eventos.has(p.eventId) || (p.eventStart ?? "") >= entrada.hoje;
    if (!ativo) continue;
    const e = evento(p.eventId, p.eventName, p.eventStart);
    e.passagens += 1;
    e.gasto += (p.valor && p.valor > 0 ? p.valor : 0) + (p.bagagem && p.bagagem > 0 ? p.bagagem : 0);
  }
  const lista = Array.from(eventos.values())
    .map((e) => ({ ...e, total: e.gasto + e.estimado }))
    .sort((a, b) => (a.inicio ?? "9999").localeCompare(b.inicio ?? "9999") || a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    eventos: lista,
    totais: {
      gasto: lista.reduce((s, e) => s + e.gasto, 0),
      estimado: lista.reduce((s, e) => s + e.estimado, 0),
      pendentes: lista.reduce((s, e) => s + e.pendentes, 0),
      semEstimativa: lista.reduce((s, e) => s + e.semEstimativa, 0),
    },
    mediaPaga,
  };
}
