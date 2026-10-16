/**
 * ANÁLISES DA BUSCA DE PASSAGENS (etapa 2, 09/10) — só admin.
 *
 * Pedidos do dono: "quando está mais barato, mais caro", "várias abas de
 * análises, bem completas" e a previsão por escalação (shared/previsao-da-
 * busca.ts). Cálculo PURO — o servidor lê o banco e chama; os testes cobrem.
 *
 * Duas fontes, sempre ditas na tela:
 *  - PESQUISADO: o histórico de consultas reais ao fornecedor
 *    (busca_passagens_consultas/opcoes) — o menor preço de cada consulta;
 *  - PAGO: as passagens registradas (tickets) e os "Usar este voo"
 *    (busca_passagens_usos) — o valor que a empresa pagou.
 *
 * Comparar rotas diferentes engana (GRU→POA é mais barato que GRU→MAO em
 * qualquer antecedência). Por isso as comparações de momento usam o ÍNDICE:
 * cada preço dividido pelo típico (mediana) da própria rota. "12% abaixo do
 * típico" quer dizer: nessa faixa, as rotas saíram 12% abaixo do que costumam
 * custar. Rota com menos de MIN_PARA_INDICE preços não entra no índice (fica
 * só na média em reais). Grupo com menos de MIN_POR_GRUPO preços aparece, mas
 * não é marcado como mais caro/mais barato — e a tela avisa amostra pequena.
 */
import { chaveDaCompanhia, diaDaSemana, diasEntre, lugarDaRota, nomeDaCompanhia, type Destaque } from "./analise-de-passagens";
import { NOME_DA_CIA, lerChave, minutoDoDia, type PernaDaRota } from "./busca-de-passagens";
import {
  FAIXAS_DE_ANTECEDENCIA,
  chaveDaRota,
  faixaDaAntecedencia,
  mediana,
  nomeDaRota,
  precoTipico,
} from "./regras-da-busca";

// ── Entradas (o servidor monta a partir do banco) ──────────────────────────

/** Uma consulta real do histórico. */
export interface ConsultaDoHistorico {
  id: string;
  /** ISO de quando o app consultou. */
  consultadoEm: string;
  /** Dia da consulta em São Paulo ("AAAA-MM-DD"). */
  dia: string;
  /** Não carregado pelas análises (ver eventoIds/vagaIds). */
  usuarioId?: string | null;
  perna: PernaDaRota;
  origem: string;
  destino: string;
  dataIda: string;
  dataVolta: string | null;
  /** Datas ±1 dia ou aeroporto alternativo: não é a data/rota sugerida da vaga. */
  deslocada: boolean;
  antecedenciaDias: number | null;
  menorPrecoCentavos: number | null;
  menorPorCia: Record<string, number> | null;
  /**
   * Quem consultou e para quais eventos/vagas: nenhuma análise usa, e o servidor
   * NÃO os carrega (16/10) — uma busca de 80 vagas grava 80 ids por consulta e
   * isso multiplicava o tráfego do banco.
   */
  eventoIds?: string[];
  vagaIds?: string[];
}

/** Uma das 10 opções mais baratas guardadas de uma consulta. */
export interface OpcaoDoHistoricoNaAnalise {
  consultaId: string;
  companhia: string;
  idaPartida: string | null;
  voltaPartida: string | null;
  precoCentavos: number;
}

/** Uma passagem registrada (atual ou do histórico de troca). */
export interface PassagemDaBusca {
  ticketId: string;
  eventId: string;
  eventName: string;
  eventStart: string | null;
  valor: number | null;
  bagagem: number | null;
  dataCompra: string | null;
  dataIda: string | null;
  dataVolta: string | null;
  /** "HH:MM" da saída da volta (custo oculto: volta após 18h). */
  horaDaVolta: string | null;
  companhia: string | null;
  /** Aeroporto (preferido) ou cidade. */
  origem: string | null;
  destino: string | null;
  /** Tem as duas pernas. */
  idaEVolta: boolean;
  trechoDireto: boolean;
  registradoPorId: string | null;
  registradoPorNome: string | null;
}

/** "Usar este voo" que virou passagem. */
export interface UsoDaBusca {
  id: string;
  /** Dia do registro em São Paulo. */
  dia: string;
  usuarioId: string | null;
  usuarioNome: string | null;
  ticketId: string | null;
  /** Valor pago registrado na passagem (centavos); null sem passagem/valor. */
  valorPago: number | null;
  companhia: string | null;
  eventId: string | null;
  eventName: string | null;
  chave: string;
  precoEncontrado: number;
}

// ── Peças comuns ───────────────────────────────────────────────────────────

/** Rota com menos preços que isto fica fora do índice (só na média em reais). */
export const MIN_PARA_INDICE = 3;
/** Grupo (faixa, dia, horário) com menos preços que isto não é marcado como extremo. */
export const MIN_POR_GRUPO = 3;
/** Abaixo disto a aba avisa "amostra pequena — leia como indício". */
export const AMOSTRA_PEQUENA = 20;

export interface GrupoDePreco {
  chave: string;
  rotulo: string;
  curto: string;
  /** Preços no grupo. */
  n: number;
  /** Média em reais (centavos); null sem preço. */
  media: number | null;
  /** Média do índice (preço ÷ típico da rota); null sem rota comparável. */
  indice: number | null;
  /** (índice − 1) em % inteiro: +34 = 34% acima do típico. */
  pct: number | null;
  comparavel: boolean;
  destaque: Destaque;
}

const DIAS = [["Domingo", "Dom"], ["Segunda", "Seg"], ["Terça", "Ter"], ["Quarta", "Qua"], ["Quinta", "Qui"], ["Sexta", "Sex"], ["Sábado", "Sáb"]] as const;
const ORDEM_DOS_DIAS = [1, 2, 3, 4, 5, 6, 0];
export const PERIODOS_DO_DIA = [
  { chave: "madrugada", rotulo: "Madrugada (0h–6h)", curto: "Madrugada", de: 0, ate: 359 },
  { chave: "manha", rotulo: "Manhã (6h–12h)", curto: "Manhã", de: 360, ate: 719 },
  { chave: "tarde", rotulo: "Tarde (12h–18h)", curto: "Tarde", de: 720, ate: 1079 },
  { chave: "noite", rotulo: "Noite (18h–24h)", curto: "Noite", de: 1080, ate: 1439 },
] as const;
export const periodoDoMinuto = (min: number | null) => (min === null ? null : PERIODOS_DO_DIA.find((p) => min >= p.de && min <= p.ate)?.chave ?? null);

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1] ?? "?"}/${mes.slice(2, 4)}`;
const reais = (c: number) => `R$ ${Math.round(c / 100).toLocaleString("pt-BR")}`;
const pctTexto = (p: number) => `${Math.abs(p)}% ${p < 0 ? "abaixo" : "acima"}`;
const media = (v: readonly number[]) => (v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null);

interface ItemDoGrupo { grupo: string | null; preco: number | null; indice: number | null }

/**
 * O que `agruparPrecos` precisa de cada grupo: quantos preços (> 0), a soma
 * deles e a soma/quantidade dos índices desses mesmos preços. Somar à parte
 * deixa o servidor agregar no SQL o que é grande demais para trazer linha a
 * linha (as opções de cada consulta — 16/10).
 */
export interface SomaDoGrupo { n: number; somaPrecos: number; nIndices: number; somaIndices: number }

export function somarPorGrupo(itens: readonly ItemDoGrupo[]): Map<string, SomaDoGrupo> {
  const somas = new Map<string, SomaDoGrupo>();
  for (const i of itens) {
    if (i.grupo === null || typeof i.preco !== "number" || !(i.preco > 0)) continue;
    let s = somas.get(i.grupo);
    if (!s) { s = { n: 0, somaPrecos: 0, nIndices: 0, somaIndices: 0 }; somas.set(i.grupo, s); }
    s.n += 1;
    s.somaPrecos += i.preco;
    if (typeof i.indice === "number") { s.nIndices += 1; s.somaIndices += i.indice; }
  }
  return somas;
}

type GruposFixos = ReadonlyArray<{ chave: string; rotulo: string; curto: string }>;

/**
 * Agrupa preços em grupos fixos (faixas, dias, períodos) e marca o mais caro e
 * o mais barato entre os comparáveis — pelo ÍNDICE quando há, senão pela média.
 */
export function agruparPrecos(itens: readonly ItemDoGrupo[], grupos: GruposFixos, minimo = MIN_POR_GRUPO): GrupoDePreco[] {
  return agruparSomas(somarPorGrupo(itens), grupos, minimo);
}

/** O mesmo que `agruparPrecos`, a partir das somas de cada grupo. */
export function agruparSomas(somas: ReadonlyMap<string, SomaDoGrupo>, grupos: GruposFixos, minimo = MIN_POR_GRUPO): GrupoDePreco[] {
  const saida = grupos.map((g) => {
    const s = somas.get(g.chave);
    const n = s?.n ?? 0;
    const indice = s && s.nIndices > 0 ? s.somaIndices / s.nIndices : null;
    return {
      chave: g.chave, rotulo: g.rotulo, curto: g.curto, n, media: s && n > 0 ? Math.round(s.somaPrecos / n) : null,
      indice: indice === null ? null : Math.round(indice * 1000) / 1000,
      pct: indice === null ? null : Math.round((indice - 1) * 100),
      comparavel: n >= minimo,
      destaque: null as Destaque,
    };
  });
  const comparaveis = saida.filter((g) => g.comparavel);
  const usarIndice = comparaveis.length >= 2 && comparaveis.every((g) => g.indice !== null);
  const valor = (g: GrupoDePreco) => (usarIndice ? g.indice : g.media);
  const comValor = comparaveis.filter((g) => valor(g) !== null);
  if (comValor.length >= 2) {
    const max = Math.max(...comValor.map((g) => valor(g) as number));
    const min = Math.min(...comValor.map((g) => valor(g) as number));
    if (max !== min) for (const g of comValor) g.destaque = valor(g) === max ? "caro" : valor(g) === min ? "barato" : null;
  }
  return saida;
}

/** Índice de cada consulta: menor preço ÷ mediana da rota (rotas com amostra). */
export function indicesDasConsultas(consultas: readonly ConsultaDoHistorico[]): Map<string, number> {
  const porRota = new Map<string, number[]>();
  for (const c of consultas) {
    if (!c.menorPrecoCentavos || c.menorPrecoCentavos <= 0) continue;
    acrescentar(porRota, chaveDaRota(c.perna, c.origem, c.destino), c.menorPrecoCentavos);
  }
  // O típico de cada rota UMA vez (antes: uma ordenação da rota inteira por consulta — O(n² log n)).
  const tipicos = new Map(Array.from(porRota.entries(), ([k, precos]) => [k, precoTipico(precos, MIN_PARA_INDICE)]));
  const out = new Map<string, number>();
  for (const c of consultas) {
    if (!c.menorPrecoCentavos || c.menorPrecoCentavos <= 0) continue;
    const t = tipicos.get(chaveDaRota(c.perna, c.origem, c.destino));
    if (t) out.set(c.id, c.menorPrecoCentavos / t.mediana);
  }
  return out;
}

/** Acrescenta à lista da chave (sem copiar a lista a cada item, como `[...lista, x]` fazia). */
export function acrescentar<T>(mapa: Map<string, T[]>, chave: string, item: T): void {
  const lista = mapa.get(chave);
  if (lista) lista.push(item);
  else mapa.set(chave, [item]);
}

/** `f(chave)` calculado uma vez por chave. */
function porChave<T>(f: (chave: string) => T): (chave: string) => T {
  const memo = new Map<string, T>();
  return (chave) => {
    if (!memo.has(chave)) memo.set(chave, f(chave));
    return memo.get(chave) as T;
  };
}

/** Rota "pagou" de uma passagem: lugares normalizados + ida e volta × uma perna. */
export function rotaPagaDe(p: Pick<PassagemDaBusca, "origem" | "destino" | "idaEVolta">): { chave: string; nome: string } | null {
  const o = lugarDaRota(p.origem), d = lugarDaRota(p.destino);
  if (!o || !d) return null;
  return { chave: `${p.idaEVolta ? "rt" : "ow"}|${o.chave}>${d.chave}`, nome: `${o.nome} ${p.idaEVolta ? "⇄" : "→"} ${d.nome}` };
}

const temValor = (p: { valor: number | null }) => typeof p.valor === "number" && p.valor > 0;

/**
 * Índice de cada passagem paga: valor ÷ típico da rota. O típico é o da
 * BUSCA (mediana dos menores preços consultados) quando a rota tem amostra —
 * a mesma régua das outras abas —; senão, a mediana do próprio pago na rota.
 */
export function indicesDasPassagens(passagens: readonly PassagemDaBusca[], consultas: readonly ConsultaDoHistorico[] = []): Map<string, number> {
  const pesquisado = new Map<string, number[]>();
  for (const c of consultas) {
    if (!c.menorPrecoCentavos || c.menorPrecoCentavos <= 0) continue;
    acrescentar(pesquisado, chaveDaRota(c.perna, c.origem, c.destino), c.menorPrecoCentavos);
  }
  const porRota = new Map<string, number[]>();
  const rotas = passagens.map((p) => (temValor(p) ? rotaPagaDe(p) : null));
  passagens.forEach((p, i) => { const r = rotas[i]; if (r) acrescentar(porRota, r.chave, p.valor as number); });
  const tipico = porChave((k) => precoTipico(pesquisado.get(k) ?? [], MIN_PARA_INDICE) ?? precoTipico(porRota.get(k) ?? [], MIN_PARA_INDICE));
  const out = new Map<string, number>();
  passagens.forEach((p, i) => {
    const r = rotas[i];
    if (!r) return;
    const t = tipico(r.chave);
    if (t) out.set(p.ticketId, (p.valor as number) / t.mediana);
  });
  return out;
}

const GRUPOS_DE_ANTECEDENCIA = FAIXAS_DE_ANTECEDENCIA.map((f) => ({ chave: f.chave as string, rotulo: f.rotulo, curto: f.curto }));
const GRUPOS_DE_DIA = ORDEM_DOS_DIAS.map((d) => ({ chave: String(d), rotulo: DIAS[d][0], curto: DIAS[d][1] }));
const GRUPOS_DE_PERIODO = PERIODOS_DO_DIA.map((p) => ({ chave: p.chave as string, rotulo: p.rotulo, curto: p.curto }));

/** Curva de antecedência do PESQUISADO (todas as rotas, ou só uma). */
export function curvaDeAntecedencia(consultas: readonly ConsultaDoHistorico[], indices: ReadonlyMap<string, number>, rota?: string): GrupoDePreco[] {
  const lista = rota ? consultas.filter((c) => chaveDaRota(c.perna, c.origem, c.destino) === rota) : consultas;
  return agruparPrecos(lista.map((c) => ({ grupo: faixaDaAntecedencia(c.antecedenciaDias), preco: c.menorPrecoCentavos, indice: indices.get(c.id) ?? null })), GRUPOS_DE_ANTECEDENCIA);
}

/** Curva de antecedência do PAGO (dias entre a compra e a ida). */
export function curvaDoPago(passagens: readonly PassagemDaBusca[], indices: ReadonlyMap<string, number>): GrupoDePreco[] {
  return agruparPrecos(passagens.map((p) => {
    const ant = p.dataCompra && p.dataIda ? diasEntre(p.dataCompra.slice(0, 10), p.dataIda.slice(0, 10)) : null;
    return { grupo: faixaDaAntecedencia(ant), preco: p.valor, indice: indices.get(p.ticketId) ?? null };
  }), GRUPOS_DE_ANTECEDENCIA);
}

// ── Frases do topo ─────────────────────────────────────────────────────────

export interface FraseDoMomento {
  tema: "antecedencia" | "dia" | "horario";
  fonte: "pesquisado" | "pago";
  texto: string;
  barato: GrupoDePreco;
  caro: GrupoDePreco;
  /** Quanto o mais caro custa a mais que o mais barato, em %. */
  diferencaPct: number;
}

const COMO = {
  antecedencia: (g: GrupoDePreco) => `comprando com ${g.rotulo.toLowerCase()}`,
  dia: (g: GrupoDePreco) => (g.chave === "0" || g.chave === "6" ? `voando no ${g.rotulo.toLowerCase()}` : `voando na ${g.rotulo.toLowerCase()}`),
  horario: (g: GrupoDePreco) => `com voo de ${g.curto.toLowerCase()}`,
} as const;

/**
 * "Mais barato comprando com 31 a 60 dias: 12% abaixo do típico da rota (média
 * R$ 812). Mais caro comprando com menos de 7 dias: 34% acima (média R$ 1.240)."
 * Só com dois grupos comparáveis e marcados; senão, nada (estado honesto).
 */
export function fraseDoMomento(grupos: readonly GrupoDePreco[], tema: FraseDoMomento["tema"], fonte: FraseDoMomento["fonte"]): FraseDoMomento | null {
  const barato = grupos.find((g) => g.destaque === "barato");
  const caro = grupos.find((g) => g.destaque === "caro");
  if (!barato || !caro) return null;
  const porIndice = barato.indice !== null && caro.indice !== null;
  const diferencaPct = porIndice
    ? Math.round(((caro.indice as number) / (barato.indice as number) - 1) * 100)
    : barato.media && caro.media ? Math.round((caro.media / barato.media - 1) * 100) : 0;
  const ref = tema === "horario" ? "dos outros voos da mesma busca" : "do típico da rota";
  const lado = (g: GrupoDePreco, primeiro: boolean) => porIndice && g.pct !== null
    ? `${pctTexto(g.pct)}${primeiro ? ` ${ref}` : ""} (média ${reais(g.media ?? 0)})`
    : `média ${reais(g.media ?? 0)}`;
  const texto = `Mais barato ${COMO[tema](barato)}: ${lado(barato, true)}. Mais caro ${COMO[tema](caro)}: ${lado(caro, false)}${porIndice ? "" : ` — ${diferencaPct}% a mais`}.`;
  return { tema, fonte, texto, barato, caro, diferencaPct };
}

// ── Aba "Melhor momento" ───────────────────────────────────────────────────

export interface QuemCompra {
  usuarioId: string | null;
  nome: string;
  passagens: number;
  /** Com data da compra e da ida (base da antecedência). */
  comAntecedencia: number;
  antecedenciaMedia: number | null;
  /** Compradas com menos de 7 dias, em %. */
  pctEmCimaDaHora: number | null;
  /**
   * Quanto a mais, ESTIMADO, contra comprar na faixa mais barata da curva do
   * pago (valor × (1 − índice da faixa barata ÷ índice da faixa da compra)).
   * null sem curva comparável.
   */
  custoExtraEstimado: number | null;
}

export interface MelhorMomento {
  base: { consultas: number; comIndice: number; rotas: number; opcoes: number; passagens: number; passagensComIndice: number };
  pesquisado: { antecedencia: GrupoDePreco[]; diaDaSemana: GrupoDePreco[]; horario: GrupoDePreco[] };
  pago: { antecedencia: GrupoDePreco[]; diaDaSemana: GrupoDePreco[] };
  frases: FraseDoMomento[];
  quemCompra: QuemCompra[];
  /** Faixa mais barata do pago (referência do custo extra). */
  faixaDeReferencia: GrupoDePreco | null;
  minimo: number;
}

/** Consulta com menos opções que isto fica fora da análise de horário. */
export const MIN_OPCOES_DO_HORARIO = 3;

/**
 * Horário já somado: quantas opções entraram (`itens`) e a soma de cada
 * período do dia. O servidor calcula isto no SQL (historico.ts ·
 * carregarHorarioDasOpcoes) — as opções passam de dezenas de milhares.
 */
export interface HorarioDasOpcoes { itens: number; somas: ReadonlyMap<string, SomaDoGrupo> }

/**
 * Horário: cada opção contra as outras da MESMA consulta (mesma rota, data e
 * momento) — preço ÷ mediana das opções da consulta, por período da partida.
 */
export function horarioDasOpcoes(opcoes: readonly OpcaoDoHistoricoNaAnalise[]): HorarioDasOpcoes {
  const porConsulta = new Map<string, OpcaoDoHistoricoNaAnalise[]>();
  for (const o of opcoes) acrescentar(porConsulta, o.consultaId, o);
  const itens: ItemDoGrupo[] = [];
  for (const lista of Array.from(porConsulta.values())) {
    if (lista.length < MIN_OPCOES_DO_HORARIO) continue;
    const m = mediana(lista.map((o) => o.precoCentavos));
    if (!m) continue;
    for (const o of lista) {
      const partida = o.idaPartida ?? o.voltaPartida;
      itens.push({ grupo: periodoDoMinuto(partida ? minutoDoDia(partida) : null), preco: o.precoCentavos, indice: o.precoCentavos / m });
    }
  }
  return { itens: itens.length, somas: somarPorGrupo(itens) };
}

/** "Quando está mais barato, mais caro" — pesquisado e pago, com frases diretas. */
export function melhorMomento(entrada: {
  consultas: readonly ConsultaDoHistorico[];
  /** As opções, linha a linha — ou o `horario` já somado (o servidor soma no SQL). */
  opcoes?: readonly OpcaoDoHistoricoNaAnalise[];
  horario?: HorarioDasOpcoes;
  passagens: readonly PassagemDaBusca[];
}): MelhorMomento {
  const consultas = entrada.consultas;
  const indices = indicesDasConsultas(consultas);
  const antecedencia = curvaDeAntecedencia(consultas, indices);
  const diaDaSemanaPesquisado = agruparPrecos(consultas.map((c) => ({
    grupo: String(diaDaSemana(c.dataIda)), preco: c.menorPrecoCentavos, indice: indices.get(c.id) ?? null,
  })), GRUPOS_DE_DIA);

  const somasDoHorario = entrada.horario ?? horarioDasOpcoes(entrada.opcoes ?? []);
  const horario = agruparSomas(somasDoHorario.somas, GRUPOS_DE_PERIODO);

  // Pago: dias entre compra e ida; dia da semana da ida.
  const passagens = entrada.passagens.filter(temValor);
  const indicesPago = indicesDasPassagens(passagens, consultas);
  const antecedenciaPaga = curvaDoPago(passagens, indicesPago);
  const diaDaSemanaPago = agruparPrecos(passagens.map((p) => ({
    grupo: p.dataIda ? String(diaDaSemana(p.dataIda.slice(0, 10))) : null, preco: p.valor, indice: indicesPago.get(p.ticketId) ?? null,
  })), GRUPOS_DE_DIA);

  const frases = [
    fraseDoMomento(antecedencia, "antecedencia", "pesquisado"),
    fraseDoMomento(antecedenciaPaga, "antecedencia", "pago"),
    fraseDoMomento(diaDaSemanaPesquisado, "dia", "pesquisado"),
    fraseDoMomento(diaDaSemanaPago, "dia", "pago"),
    fraseDoMomento(horario, "horario", "pesquisado"),
  ].filter((f): f is FraseDoMomento => !!f);

  // Quem compra cedo/tarde: antecedência média e o custo extra estimado.
  const comparaveisPagos = antecedenciaPaga.filter((g) => g.comparavel && g.indice !== null);
  const ref = comparaveisPagos.length >= 2 ? comparaveisPagos.slice().sort((a, b) => (a.indice as number) - (b.indice as number))[0] : null;
  const indiceDaFaixa = new Map(comparaveisPagos.map((g) => [g.chave, g.indice as number]));
  const pessoas = new Map<string, { id: string | null; nome: string; n: number; dias: number[]; emCima: number; extra: number; comExtra: number }>();
  for (const p of passagens) {
    const k = p.registradoPorId ?? "";
    const g = pessoas.get(k) ?? { id: p.registradoPorId, nome: p.registradoPorNome || "Sem registro de quem comprou", n: 0, dias: [], emCima: 0, extra: 0, comExtra: 0 };
    g.n += 1;
    const ant = p.dataCompra && p.dataIda ? diasEntre(p.dataCompra.slice(0, 10), p.dataIda.slice(0, 10)) : null;
    if (ant !== null && ant >= 0) {
      g.dias.push(ant);
      if (ant < 7) g.emCima += 1;
      const faixa = faixaDaAntecedencia(ant);
      const idx = faixa ? indiceDaFaixa.get(faixa) : undefined;
      if (ref && idx !== undefined) {
        g.comExtra += 1;
        if (idx > (ref.indice as number)) g.extra += Math.round((p.valor as number) * (1 - (ref.indice as number) / idx));
      }
    }
    pessoas.set(k, g);
  }
  const quemCompra: QuemCompra[] = Array.from(pessoas.values()).map((g) => ({
    usuarioId: g.id, nome: g.nome, passagens: g.n, comAntecedencia: g.dias.length,
    antecedenciaMedia: g.dias.length ? Math.round(g.dias.reduce((s, x) => s + x, 0) / g.dias.length) : null,
    pctEmCimaDaHora: g.dias.length ? Math.round((g.emCima / g.dias.length) * 100) : null,
    custoExtraEstimado: ref && g.comExtra > 0 ? g.extra : null,
  })).sort((a, b) => (b.custoExtraEstimado ?? -1) - (a.custoExtraEstimado ?? -1) || (a.antecedenciaMedia ?? 999) - (b.antecedenciaMedia ?? 999) || a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    base: {
      consultas: consultas.filter((c) => (c.menorPrecoCentavos ?? 0) > 0).length,
      comIndice: indices.size,
      rotas: new Set(consultas.map((c) => chaveDaRota(c.perna, c.origem, c.destino))).size,
      opcoes: somasDoHorario.itens,
      passagens: passagens.length,
      passagensComIndice: indicesPago.size,
    },
    pesquisado: { antecedencia, diaDaSemana: diaDaSemanaPesquisado, horario },
    pago: { antecedencia: antecedenciaPaga, diaDaSemana: diaDaSemanaPago },
    frases,
    quemCompra,
    faixaDeReferencia: ref,
    minimo: MIN_POR_GRUPO,
  };
}

// ── Aba "Preço por rota" ───────────────────────────────────────────────────

export interface CiaDaRota { codigo: string; nome: string; n: number; media: number; menor: number; vezesMaisBarata: number }

export interface RotaDaAnalise {
  chave: string;
  nome: string;
  tipo: "rt" | "ow";
  origem: string;
  destino: string;
  consultas: number;
  datasDeVoo: number;
  menor: { preco: number; dia: string; dataVoo: string } | null;
  mediana: number | null;
  ultimo: { preco: number; dia: string; dataVoo: string } | null;
  /** (maior − menor) ÷ menor, em %. */
  variacaoPct: number | null;
  /** Média dos 3 últimos dias consultados contra os 3 primeiros, em %; null com menos de 4 dias. */
  tendenciaPct: number | null;
  /** Menor preço por dia de consulta (para o gráfico). */
  serie: Array<{ dia: string; menor: number }>;
  cias: CiaDaRota[];
  ciaMaisBarata: string | null;
  ciaMaisCara: string | null;
  amostraPequena: boolean;
}

export interface Participacao { chave: string; nome: string; passagens: number; gasto: number; pctGasto: number; pctPassagens: number }

export interface PrecoPorRota {
  rotas: RotaDaAnalise[];
  /** Rotas mais usadas no PAGO (passagens registradas). */
  rotasMaisUsadas: Participacao[];
  /** Participação de cada companhia no gasto (base para acordo corporativo). */
  companhias: Participacao[];
  /** Companhia que mais vezes teve o menor preço nas consultas. */
  maisBaratasNasBuscas: Array<{ codigo: string; nome: string; vezes: number; pct: number }>;
  base: { consultas: number; passagens: number; gasto: number };
}

const nomeDaCia = (c: string) => NOME_DA_CIA[c] ?? c;
const gastoDe = (p: PassagemDaBusca) => (p.valor as number) + (p.bagagem && p.bagagem > 0 ? p.bagagem : 0);

export function precoPorRota(entrada: { consultas: readonly ConsultaDoHistorico[]; passagens: readonly PassagemDaBusca[] }): PrecoPorRota {
  const grupos = new Map<string, ConsultaDoHistorico[]>();
  for (const c of entrada.consultas) {
    if (!c.menorPrecoCentavos || c.menorPrecoCentavos <= 0) continue;
    acrescentar(grupos, chaveDaRota(c.perna, c.origem, c.destino), c);
  }
  const vezesMaisBarata = new Map<string, number>();
  const rotas: RotaDaAnalise[] = Array.from(grupos.entries()).map(([chave, lista]) => {
    const ord = lista.slice().sort((a, b) => a.consultadoEm.localeCompare(b.consultadoEm));
    const precos = ord.map((c) => c.menorPrecoCentavos as number);
    const menorC = ord.reduce((m, c) => ((c.menorPrecoCentavos as number) < (m.menorPrecoCentavos as number) ? c : m), ord[0]);
    const ultimoC = ord[ord.length - 1];
    const porDia = new Map<string, number>();
    for (const c of ord) porDia.set(c.dia, Math.min(porDia.get(c.dia) ?? Infinity, c.menorPrecoCentavos as number));
    const serie = Array.from(porDia.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([dia, menor]) => ({ dia, menor }));
    const tendenciaPct = serie.length >= 4
      ? Math.round(((media(serie.slice(-3).map((s) => s.menor)) as number) / (media(serie.slice(0, 3).map((s) => s.menor)) as number) - 1) * 100)
      : null;
    // Companhias: média e menor do menor-por-cia; quantas vezes cada uma foi a mais barata.
    const porCia = new Map<string, { n: number; soma: number; menor: number; vezes: number }>();
    for (const c of ord) {
      const cias = Object.entries(c.menorPorCia ?? {}).filter(([, v]) => typeof v === "number" && v > 0);
      if (cias.length === 0) continue;
      const min = Math.min(...cias.map(([, v]) => v));
      for (const [cia, v] of cias) {
        const g = porCia.get(cia) ?? { n: 0, soma: 0, menor: Infinity, vezes: 0 };
        g.n += 1; g.soma += v; g.menor = Math.min(g.menor, v);
        if (v === min) { g.vezes += 1; vezesMaisBarata.set(cia, (vezesMaisBarata.get(cia) ?? 0) + 1); }
        porCia.set(cia, g);
      }
    }
    const cias: CiaDaRota[] = Array.from(porCia.entries())
      .map(([codigo, g]) => ({ codigo, nome: nomeDaCia(codigo), n: g.n, media: Math.round(g.soma / g.n), menor: g.menor, vezesMaisBarata: g.vezes }))
      .sort((a, b) => a.media - b.media);
    const comparaveis = cias.filter((c) => c.n >= 2);
    const [tipo, trecho] = chave.split("|");
    const [origem, destino] = trecho.split(">");
    return {
      chave, nome: nomeDaRota(chave), tipo: tipo as "rt" | "ow", origem, destino,
      consultas: lista.length,
      datasDeVoo: new Set(lista.map((c) => `${c.dataIda}|${c.dataVolta ?? ""}`)).size,
      menor: { preco: menorC.menorPrecoCentavos as number, dia: menorC.dia, dataVoo: menorC.dataIda },
      mediana: mediana(precos),
      ultimo: { preco: ultimoC.menorPrecoCentavos as number, dia: ultimoC.dia, dataVoo: ultimoC.dataIda },
      variacaoPct: precos.length >= 2 ? Math.round((Math.max(...precos) / Math.min(...precos) - 1) * 100) : null,
      tendenciaPct,
      serie,
      cias,
      ciaMaisBarata: comparaveis.length >= 2 ? comparaveis[0].codigo : null,
      ciaMaisCara: comparaveis.length >= 2 ? comparaveis[comparaveis.length - 1].codigo : null,
      amostraPequena: lista.length < MIN_PARA_INDICE * 2,
    };
  }).sort((a, b) => b.consultas - a.consultas || a.nome.localeCompare(b.nome, "pt-BR"));

  // Mais usadas no pago.
  const pagas = entrada.passagens.filter(temValor);
  const gasto = pagas.reduce((s, p) => s + gastoDe(p), 0);
  const participacao = (chaveENome: (p: PassagemDaBusca) => { chave: string; nome: string } | null): Participacao[] => {
    const m = new Map<string, Participacao>();
    for (const p of pagas) {
      const cn = chaveENome(p);
      if (!cn) continue;
      const g = m.get(cn.chave) ?? { chave: cn.chave, nome: cn.nome, passagens: 0, gasto: 0, pctGasto: 0, pctPassagens: 0 };
      g.passagens += 1;
      g.gasto += gastoDe(p);
      m.set(cn.chave, g);
    }
    return Array.from(m.values())
      .map((g) => ({ ...g, pctGasto: gasto > 0 ? Math.round((g.gasto / gasto) * 1000) / 10 : 0, pctPassagens: pagas.length ? Math.round((g.passagens / pagas.length) * 1000) / 10 : 0 }))
      .sort((a, b) => b.passagens - a.passagens || b.gasto - a.gasto);
  };
  const totalVezes = Array.from(vezesMaisBarata.values()).reduce((s, x) => s + x, 0);
  return {
    rotas,
    rotasMaisUsadas: participacao(rotaPagaDe).slice(0, 10),
    companhias: participacao((p) => {
      const k = chaveDaCompanhia(p.companhia);
      return { chave: k, nome: nomeDaCompanhia(k, p.companhia) };
    }).sort((a, b) => b.gasto - a.gasto),
    maisBaratasNasBuscas: Array.from(vezesMaisBarata.entries())
      .map(([codigo, vezes]) => ({ codigo, nome: nomeDaCia(codigo), vezes, pct: totalVezes ? Math.round((vezes / totalVezes) * 100) : 0 }))
      .sort((a, b) => b.vezes - a.vezes),
    base: { consultas: entrada.consultas.length, passagens: pagas.length, gasto },
  };
}

// ── Aba "Pago × encontrado" (+ economia gerada pela busca) ────────────────

export interface LinhaPagoXEncontrado {
  id: string;
  dia: string;
  usuarioNome: string;
  eventId: string | null;
  eventName: string | null;
  companhia: string | null;
  rota: string;
  dataVoo: string | null;
  /** Preço do voo escolhido no "Usar este voo". */
  precoEncontrado: number;
  /** Menor preço visto na MESMA rota e data (todas as consultas). */
  menorEncontrado: number;
  /** Típico da rota (mediana); null com pouca amostra. */
  tipico: number | null;
  valorPago: number | null;
  /** pago − menor encontrado (positivo = pagou acima). */
  diferenca: number | null;
  diferencaPct: number | null;
  /** típico − pago (positivo = economizou contra o que a rota costuma custar). */
  economia: number | null;
}

export interface SomaPagoXEncontrado {
  n: number;
  pago: number;
  menor: number;
  diferenca: number;
  acimaDoMenor: number;
  economia: number;
  comTipico: number;
}

export interface GrupoPagoXEncontrado extends SomaPagoXEncontrado { chave: string; nome: string; diferencaPct: number | null }

export interface PagoXEncontrado {
  linhas: LinhaPagoXEncontrado[];
  usos: number;
  semValorPago: number;
  totais: SomaPagoXEncontrado;
  mesAtual: SomaPagoXEncontrado & { mes: string };
  porMes: Array<SomaPagoXEncontrado & { mes: string; rotulo: string; economiaAcumulada: number }>;
  porEvento: GrupoPagoXEncontrado[];
  porCompanhia: GrupoPagoXEncontrado[];
  porQuem: GrupoPagoXEncontrado[];
}

const somaVazia = (): SomaPagoXEncontrado => ({ n: 0, pago: 0, menor: 0, diferenca: 0, acimaDoMenor: 0, economia: 0, comTipico: 0 });
function somarLinha(s: SomaPagoXEncontrado, l: LinhaPagoXEncontrado): void {
  if (l.valorPago === null || l.diferenca === null) return;
  s.n += 1;
  s.pago += l.valorPago;
  s.menor += l.menorEncontrado;
  s.diferenca += l.diferenca;
  if (l.diferenca > 0) s.acimaDoMenor += 1;
  if (l.economia !== null) { s.economia += l.economia; s.comTipico += 1; }
}

/**
 * Para cada "Usar este voo" que virou passagem: o valor PAGO contra o MENOR
 * preço encontrado na mesma rota e data (todas as consultas, de qualquer
 * pessoa) e contra o típico da rota. Economia gerada pela busca = típico −
 * pago, somada (positivo = a busca fez pagar menos do que a rota costuma).
 */
export function pagoXEncontrado(entrada: { usos: readonly UsoDaBusca[]; consultas: readonly ConsultaDoHistorico[]; hoje: string }): PagoXEncontrado {
  const menorPorRotaData = new Map<string, number>();
  const precosPorRota = new Map<string, number[]>();
  for (const c of entrada.consultas) {
    if (!c.menorPrecoCentavos || c.menorPrecoCentavos <= 0) continue;
    const kd = `${chaveDaRota(c.perna, c.origem, c.destino)}|${c.dataIda}|${c.dataVolta ?? ""}`;
    menorPorRotaData.set(kd, Math.min(menorPorRotaData.get(kd) ?? Infinity, c.menorPrecoCentavos));
    acrescentar(precosPorRota, chaveDaRota(c.perna, c.origem, c.destino), c.menorPrecoCentavos);
  }
  const tipicoDaRota = porChave((kr) => precoTipico(precosPorRota.get(kr) ?? [])?.mediana ?? null);
  const linhas: LinhaPagoXEncontrado[] = [];
  let semValorPago = 0;
  for (const u of entrada.usos) {
    const r = lerChave(u.chave);
    const kr = r ? chaveDaRota(r.perna, r.origem, r.destino) : null;
    const kd = r && kr ? `${kr}|${r.dataIda}|${r.dataVolta ?? ""}` : null;
    const menor = Math.min(u.precoEncontrado, kd ? menorPorRotaData.get(kd) ?? Infinity : Infinity);
    const tipico = kr ? tipicoDaRota(kr) : null;
    const pago = typeof u.valorPago === "number" && u.valorPago > 0 ? u.valorPago : null;
    if (pago === null) semValorPago += 1;
    linhas.push({
      id: u.id, dia: u.dia, usuarioNome: u.usuarioNome || "Usuário removido", eventId: u.eventId, eventName: u.eventName,
      companhia: u.companhia, rota: kr ? nomeDaRota(kr) : "Rota não identificada", dataVoo: r?.dataIda ?? null,
      precoEncontrado: u.precoEncontrado, menorEncontrado: menor, tipico, valorPago: pago,
      diferenca: pago === null ? null : pago - menor,
      diferencaPct: pago === null || menor <= 0 ? null : Math.round(((pago - menor) / menor) * 100),
      economia: pago === null || tipico === null ? null : tipico - pago,
    });
  }
  linhas.sort((a, b) => b.dia.localeCompare(a.dia));

  const totais = somaVazia();
  for (const l of linhas) somarLinha(totais, l);
  const mes = entrada.hoje.slice(0, 7);
  const mesAtual = { ...somaVazia(), mes };
  for (const l of linhas.filter((x) => x.dia.slice(0, 7) === mes)) somarLinha(mesAtual, l);

  const meses = new Map<string, SomaPagoXEncontrado>();
  for (const l of linhas) {
    const m = l.dia.slice(0, 7);
    const s = meses.get(m) ?? somaVazia();
    somarLinha(s, l);
    meses.set(m, s);
  }
  let acumulada = 0;
  const porMes = Array.from(meses.entries()).filter(([, s]) => s.n > 0).sort((a, b) => a[0].localeCompare(b[0])).map(([m, s]) => {
    acumulada += s.economia;
    return { ...s, mes: m, rotulo: rotuloDoMes(m), economiaAcumulada: acumulada };
  });

  const agrupar = (chaveENome: (l: LinhaPagoXEncontrado) => { chave: string; nome: string }): GrupoPagoXEncontrado[] => {
    const m = new Map<string, GrupoPagoXEncontrado>();
    for (const l of linhas) {
      const cn = chaveENome(l);
      const g = m.get(cn.chave) ?? { ...somaVazia(), chave: cn.chave, nome: cn.nome, diferencaPct: null };
      somarLinha(g, l);
      m.set(cn.chave, g);
    }
    return Array.from(m.values())
      .filter((g) => g.n > 0)
      .map((g) => ({ ...g, diferencaPct: g.menor > 0 ? Math.round((g.diferenca / g.menor) * 100) : null }))
      .sort((a, b) => b.diferenca - a.diferenca || b.n - a.n);
  };
  return {
    linhas: linhas.slice(0, 300),
    usos: linhas.length,
    semValorPago,
    totais,
    mesAtual,
    porMes,
    porEvento: agrupar((l) => ({ chave: l.eventId ?? "", nome: l.eventName ?? "Sem evento" })),
    porCompanhia: agrupar((l) => {
      const k = chaveDaCompanhia(l.companhia);
      return { chave: k, nome: nomeDaCompanhia(k, l.companhia) };
    }),
    porQuem: agrupar((l) => ({ chave: l.usuarioNome, nome: l.usuarioNome })),
  };
}

// ── Custos ocultos ─────────────────────────────────────────────────────────

export interface CustosOcultos {
  voltasNoturnas: {
    /** Passagens com a volta a partir das 18h. */
    passagens: number;
    /** Diárias extras estimadas (centavos). */
    custo: number;
    /** Passagens contadas sem diária conhecida do evento (usou a média geral ou ficou fora). */
    semDiaria: number;
    porEvento: Array<{ eventId: string; nome: string; passagens: number; custo: number; diaria: number | null }>;
  };
  pingaPinga: {
    /** Passagens que são trecho direto entre eventos. */
    trechos: number;
    pagoNosTrechos: number;
    /** Duas passagens de uma perna típicas (volta para casa + ida ao próximo evento). */
    estimadoSeparado: number | null;
    economia: number | null;
    /** Mediana do pago numa perna (base da estimativa) e quantas passagens a sustentam. */
    pernaTipica: number | null;
    amostra: number;
  };
}

/** Hora a partir da qual a volta custa uma diária a mais (regra do Espelho). */
const HORA_NOTURNA = "18:00";

/**
 * O que não aparece no preço da passagem: (1) a diária de hotel a mais de
 * quem volta a partir das 18h; (2) quanto o pinga-pinga (trecho direto entre
 * eventos) economizou contra voltar para casa e sair de novo.
 */
export function custosOcultos(entrada: {
  passagens: readonly PassagemDaBusca[];
  /** Diária média de hotel por evento (centavos). */
  diariaPorEvento: Readonly<Record<string, number>>;
}): CustosOcultos {
  const diarias = Object.values(entrada.diariaPorEvento).filter((x) => x > 0);
  const diariaGeral = diarias.length ? Math.round(diarias.reduce((s, x) => s + x, 0) / diarias.length) : null;
  const noturnas = entrada.passagens.filter((p) => !!p.horaDaVolta && p.horaDaVolta.slice(0, 5) >= HORA_NOTURNA && !!p.dataVolta);
  const porEvento = new Map<string, { eventId: string; nome: string; passagens: number; custo: number; diaria: number | null }>();
  let custo = 0, semDiaria = 0;
  for (const p of noturnas) {
    const d = entrada.diariaPorEvento[p.eventId] ?? null;
    const valor = d ?? diariaGeral;
    if (d === null) semDiaria += 1;
    const g = porEvento.get(p.eventId) ?? { eventId: p.eventId, nome: p.eventName, passagens: 0, custo: 0, diaria: d };
    g.passagens += 1;
    if (valor) { g.custo += valor; custo += valor; }
    porEvento.set(p.eventId, g);
  }
  const umaPerna = entrada.passagens.filter((p) => temValor(p) && !p.idaEVolta && !p.trechoDireto).map((p) => p.valor as number);
  const tipica = precoTipico(umaPerna);
  const trechos = entrada.passagens.filter((p) => p.trechoDireto && temValor(p));
  const pagoNosTrechos = trechos.reduce((s, p) => s + (p.valor as number), 0);
  const estimadoSeparado = tipica && trechos.length ? tipica.mediana * 2 * trechos.length : null;
  return {
    voltasNoturnas: {
      passagens: noturnas.length, custo, semDiaria,
      porEvento: Array.from(porEvento.values()).sort((a, b) => b.custo - a.custo || b.passagens - a.passagens),
    },
    pingaPinga: {
      trechos: trechos.length, pagoNosTrechos, estimadoSeparado,
      economia: estimadoSeparado === null ? null : estimadoSeparado - pagoNosTrechos,
      pernaTipica: tipica?.mediana ?? null, amostra: tipica?.amostra ?? umaPerna.length,
    },
  };
}
