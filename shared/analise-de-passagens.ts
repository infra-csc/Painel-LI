/**
 * ANÁLISES DE PASSAGENS (07/10) — só admin.
 *
 * Perguntas do dono que a aba responde de cara: "que dia fica mais caro, mais
 * barato" e "qual evento gastamos mais, e menos". Junto: quanto custa comprar
 * em cima da hora, onde o gasto se concentra (rota, companhia, transporte,
 * bagagem) e quanto ficou em trocas e remarcações.
 *
 * Cálculo PURO (servidor chama; testes cobrem). Regras:
 *  - Entram as passagens ATUAIS e as do HISTÓRICO de troca (`archivedAt`): o
 *    custo da passagem de quem saiu continua no evento (dono, 01/10).
 *  - Datas são texto "AAAA-MM-DD" — o dia da semana sai do calendário, sem
 *    fuso e sem horário (produção ainda tem coluna `timestamp` sem fuso).
 *  - `value` é a passagem INTEIRA (ida e volta juntas). A análise por dia
 *    compara PASSAGENS pelo dia da ida (ou da volta), não cada trecho.
 *  - Valor nulo ou zero = "sem valor": não entra em média nenhuma e aparece
 *    contado à parte. Nada some calado.
 *  - Gasto = passagem + bagagem. Preço médio = só a passagem (a bagagem tem
 *    linha própria), para o dia/antecedência não variar por causa de mala.
 *  - Dia da semana só é marcado como "mais caro"/"mais barato" com pelo menos
 *    MIN_PASSAGENS_POR_DIA passagens com valor — um dia com uma passagem só
 *    não vira conclusão. O mesmo piso vale para a antecedência.
 */

/** Uma passagem já ligada à vaga e ao evento — o que o servidor lê do banco. */
export interface PassagemParaAnalise {
  ticketId: string;
  teamInclusionId: string;
  eventId: string;
  eventName: string;
  /** Início do evento, "AAAA-MM-DD" (o período filtra por ele). */
  eventStartDate: string | null;
  /** Quem viajou (atual) ou de quem era (histórico). */
  pessoaId: string | null;
  /** Passagem do histórico de troca (archivedAt preenchido). */
  arquivada: boolean;
  /** Centavos. */
  valor: number | null;
  /** Centavos. */
  bagagem: number | null;
  dataCompra: string | null;
  dataIda: string | null;
  dataVolta: string | null;
  companhia: string | null;
  transporte: string | null;
  /** Aeroporto (preferido) ou cidade de origem da ida. */
  origem: string | null;
  /** Aeroporto (preferido) ou cidade de destino da ida. */
  destino: string | null;
}

/** Aviso de alteração que mexeu em passagem (remarcação). */
export interface AvisoParaAnalise {
  eventId: string;
  resolvido: boolean;
}

export interface FiltrosDaAnalise {
  /** "AAAA-MM-DD" — início do evento a partir de. Vazio = sem ponta. */
  de?: string | null;
  /** "AAAA-MM-DD" — início do evento até. Vazio = sem ponta. */
  ate?: string | null;
  eventId?: string | null;
  /** Chave normalizada da companhia (ver `chaveDaCompanhia`). "" = sem companhia. */
  companhia?: string | null;
  /** aereo | rodoviario | van | "" (não informado). */
  transporte?: string | null;
}

/** Números de um grupo qualquer (dia, mês, rota, companhia...). */
export interface Agregado {
  /** Passagens no grupo (com ou sem valor). */
  passagens: number;
  /** Passagens com valor — a base da média. */
  comValor: number;
  /** Soma das passagens, centavos. */
  totalPassagem: number;
  /** Soma da bagagem, centavos. */
  totalBagagem: number;
  /** Passagem + bagagem, centavos. */
  gasto: number;
  /** Preço médio da passagem (sem bagagem), centavos; null sem valor. */
  media: number | null;
}

export type Destaque = "caro" | "barato" | null;

export interface DiaDaSemana extends Agregado {
  /** 0 = domingo … 6 = sábado (getUTCDay). */
  dia: number;
  rotulo: string;
  curto: string;
  destaque: Destaque;
  /** Tem passagens suficientes para ser comparado. */
  comparavel: boolean;
}

export interface MesDaAnalise extends Agregado {
  /** "AAAA-MM". */
  mes: string;
  rotulo: string;
}

export interface EventoDaAnalise extends Agregado {
  eventId: string;
  nome: string;
  inicio: string | null;
  /** Pessoas distintas com passagem ATUAL (quem viajou). */
  pessoas: number;
  /** Gasto ÷ pessoas, centavos; null sem pessoa. */
  porPessoa: number | null;
  /** Passagens do histórico de troca neste evento. */
  trocas: number;
}

export interface FaixaDeAntecedencia extends Agregado {
  chave: "0-6" | "7-14" | "15-29" | "30-59" | "60+";
  rotulo: string;
  comparavel: boolean;
  destaque: Destaque;
}

export interface GrupoNomeado extends Agregado {
  chave: string;
  nome: string;
}

export interface Opcao {
  id: string;
  nome: string;
  n: number;
}

export interface AnaliseDePassagens {
  filtros: { de: string | null; ate: string | null; eventId: string | null; companhia: string | null; transporte: string | null };
  totais: Agregado & {
    eventos: number;
    semValor: number;
    semDataCompra: number;
    semDataIda: number;
    /** Compra depois da ida — data digitada errada; fica fora da antecedência. */
    compraDepoisDaIda: number;
  };
  minimoPorDia: number;
  diasDaIda: DiaDaSemana[];
  diasDaVolta: DiaDaSemana[];
  porMes: MesDaAnalise[];
  porEvento: EventoDaAnalise[];
  antecedencia: {
    faixas: FaixaDeAntecedencia[];
    /** Passagens com data da compra e da ida (base do percentual). */
    base: number;
    menosDe14: number;
    /** 0–100, inteiro; null sem base. */
    pctMenosDe14: number | null;
  };
  porRota: GrupoNomeado[];
  porCompanhia: GrupoNomeado[];
  porTransporte: GrupoNomeado[];
  bagagem: { passagens: number; total: number };
  trocas: { passagens: number; gasto: number };
  remarcacoes: { total: number; pendentes: number; resolvidos: number };
  opcoes: { eventos: Opcao[]; companhias: Opcao[]; transportes: Opcao[] };
}

/** Abaixo disto o dia (ou a faixa) aparece, mas não é marcado como extremo. */
export const MIN_PASSAGENS_POR_DIA = 3;

const DIAS = [
  ["Domingo", "Dom"], ["Segunda", "Seg"], ["Terça", "Ter"], ["Quarta", "Qua"],
  ["Quinta", "Qui"], ["Sexta", "Sex"], ["Sábado", "Sáb"],
] as const;
/** Segunda primeiro: a semana de trabalho da operação. */
const ORDEM_DOS_DIAS = [1, 2, 3, 4, 5, 6, 0];

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const ROTULO_TRANSPORTE: Record<string, string> = {
  aereo: "Aéreo",
  rodoviario: "Rodoviário",
  van: "Van",
  "": "Não informado",
};

const FAIXAS: { chave: FaixaDeAntecedencia["chave"]; rotulo: string; min: number; max: number }[] = [
  { chave: "0-6", rotulo: "Menos de 7 dias", min: 0, max: 6 },
  { chave: "7-14", rotulo: "7 a 14 dias", min: 7, max: 14 },
  { chave: "15-29", rotulo: "15 a 29 dias", min: 15, max: 29 },
  { chave: "30-59", rotulo: "30 a 59 dias", min: 30, max: 59 },
  { chave: "60+", rotulo: "60 dias ou mais", min: 60, max: Infinity },
];

// ── Normalização ────────────────────────────────────────────────────────────

/** Sem acento, sem caixa, espaços colapsados. */
export function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** "AAAA-MM-DD" válido (aceita "AAAA-MM-DDT..." e corta). */
export function diaISO(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (!m) return null;
  const [, a, me, d] = m;
  const t = Date.UTC(Number(a), Number(me) - 1, Number(d));
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== Number(a) || dt.getUTCMonth() !== Number(me) - 1 || dt.getUTCDate() !== Number(d)) return null;
  return `${a}-${me}-${d}`;
}

/** Dia da semana do calendário (0 = domingo), sem fuso. */
export function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Dias corridos de `de` até `ate` (pode ser negativo). */
export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** Soma (ou subtrai) meses a uma data "AAAA-MM-DD", segurando o fim do mês. */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/** Soma dias a "AAAA-MM-DD". */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Período padrão da aba: últimos 3 meses e tudo o que vem depois. */
export function periodoPadrao(hoje: string): { de: string; ate: null } {
  return { de: somarMeses(hoje, -3), ate: null };
}

/**
 * Companhia → chave única. "LATAM", "latam ", "Latam Airlines" e "TAM" são a
 * mesma; "Gol Linhas Aéreas" é GOL; "Azul Linhas Aéreas" é AZUL. O resto vira
 * a própria grafia sem acento e em maiúsculas. Vazio → "".
 */
export function chaveDaCompanhia(nome: string | null | undefined): string {
  const t = semAcento(String(nome ?? "")).toUpperCase();
  if (!t) return "";
  if (/\bLATAM\b/.test(t) || t === "TAM" || t.startsWith("TAM ")) return "LATAM";
  if (/^GOL\b/.test(t)) return "GOL";
  if (/^AZUL\b/.test(t)) return "AZUL";
  return t;
}

const NOME_DA_COMPANHIA: Record<string, string> = { LATAM: "LATAM", GOL: "GOL", AZUL: "Azul", "": "Sem companhia" };

/** Nome para exibir de uma chave de companhia. */
export function nomeDaCompanhia(chave: string, original?: string | null): string {
  if (chave in NOME_DA_COMPANHIA) return NOME_DA_COMPANHIA[chave];
  const o = String(original ?? "").trim().replace(/\s+/g, " ");
  return o || chave;
}

/**
 * Lugar de uma rota: código de aeroporto ("gru" → "GRU") ou cidade. Um local
 * de evento com endereço ("Farol da Barra, Salvador - BA") fica só com a
 * cidade do fim. Devolve a chave (comparação) e o nome (exibição).
 */
export function lugarDaRota(texto: string | null | undefined): { chave: string; nome: string } | null {
  const bruto = String(texto ?? "").trim().replace(/\s+/g, " ");
  if (!bruto) return null;
  if (/^[A-Za-z]{3}$/.test(bruto)) return { chave: bruto.toUpperCase(), nome: bruto.toUpperCase() };
  const partes = bruto.split(",").map((p) => p.trim()).filter(Boolean);
  const cidade = partes[partes.length - 1] ?? bruto;
  // "São Paulo - SP", "São Paulo/SP" e "sao paulo sp" são o mesmo lugar.
  const chave = semAcento(cidade).replace(/[-/]+/g, " ").replace(/\s+/g, " ").trim();
  if (!chave) return null;
  return { chave, nome: cidade };
}

// ── Agregação ───────────────────────────────────────────────────────────────

const temValor = (p: PassagemParaAnalise) => typeof p.valor === "number" && p.valor > 0;

function agregadoVazio(): Agregado {
  return { passagens: 0, comValor: 0, totalPassagem: 0, totalBagagem: 0, gasto: 0, media: null };
}

function somar(a: Agregado, p: PassagemParaAnalise): void {
  a.passagens += 1;
  if (temValor(p)) {
    a.comValor += 1;
    a.totalPassagem += p.valor as number;
  }
  const bag = typeof p.bagagem === "number" && p.bagagem > 0 ? p.bagagem : 0;
  a.totalBagagem += bag;
  a.gasto = a.totalPassagem + a.totalBagagem;
}

function fechar<T extends Agregado>(a: T): T {
  a.media = a.comValor > 0 ? Math.round(a.totalPassagem / a.comValor) : null;
  return a;
}

function agregar(lista: PassagemParaAnalise[]): Agregado {
  const a = agregadoVazio();
  for (const p of lista) somar(a, p);
  return fechar(a);
}

/** Marca o mais caro e o mais barato entre os comparáveis (≥ 2 comparáveis e médias diferentes). */
function marcarExtremos<T extends Agregado & { comparavel: boolean; destaque: Destaque }>(itens: T[]): void {
  const comparaveis = itens.filter((i) => i.comparavel && i.media !== null);
  if (comparaveis.length < 2) return;
  const max = Math.max(...comparaveis.map((i) => i.media as number));
  const min = Math.min(...comparaveis.map((i) => i.media as number));
  if (max === min) return;
  for (const i of comparaveis) {
    if (i.media === max) i.destaque = "caro";
    else if (i.media === min) i.destaque = "barato";
  }
}

function porDiaDaSemana(lista: PassagemParaAnalise[], data: (p: PassagemParaAnalise) => string | null, minimo: number): DiaDaSemana[] {
  const grupos = new Map<number, Agregado>();
  for (const p of lista) {
    const d = diaISO(data(p));
    if (!d) continue;
    const dia = diaDaSemana(d);
    const g = grupos.get(dia) ?? agregadoVazio();
    somar(g, p);
    grupos.set(dia, g);
  }
  const dias = ORDEM_DOS_DIAS.map((dia) => {
    const g = fechar(grupos.get(dia) ?? agregadoVazio());
    return { ...g, dia, rotulo: DIAS[dia][0], curto: DIAS[dia][1], comparavel: g.comValor >= minimo, destaque: null as Destaque };
  });
  marcarExtremos(dias);
  return dias;
}

function agruparNomeado(
  lista: PassagemParaAnalise[],
  chaveENome: (p: PassagemParaAnalise) => { chave: string; nome: string } | null,
): GrupoNomeado[] {
  const grupos = new Map<string, { ag: Agregado; nomes: Map<string, number> }>();
  for (const p of lista) {
    const cn = chaveENome(p);
    if (!cn) continue;
    const g = grupos.get(cn.chave) ?? { ag: agregadoVazio(), nomes: new Map<string, number>() };
    somar(g.ag, p);
    g.nomes.set(cn.nome, (g.nomes.get(cn.nome) ?? 0) + 1);
    grupos.set(cn.chave, g);
  }
  return Array.from(grupos.entries())
    .map(([chave, g]) => {
      // A grafia mais usada vira o nome — "Salvador - BA" ganha de "salvador".
      const nome = Array.from(g.nomes.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      return { ...fechar(g.ag), chave, nome };
    })
    .sort((a, b) => b.gasto - a.gasto || b.passagens - a.passagens || a.nome.localeCompare(b.nome, "pt-BR"));
}

const rotaDe = (p: PassagemParaAnalise) => {
  const o = lugarDaRota(p.origem);
  const d = lugarDaRota(p.destino);
  if (!o || !d) return null;
  return { chave: `${o.chave}→${d.chave}`, nome: `${o.nome} → ${d.nome}` };
};

/** "Aéreo", "aereo " e "AEREO" são o mesmo transporte; vazio = não informado. */
const transporteDe = (p: PassagemParaAnalise) => semAcento(String(p.transporte ?? ""));

// ── Entrada principal ───────────────────────────────────────────────────────

export function analisarPassagens(
  todas: PassagemParaAnalise[],
  avisos: AvisoParaAnalise[],
  filtros: FiltrosDaAnalise = {},
  minimoPorDia: number = MIN_PASSAGENS_POR_DIA,
): AnaliseDePassagens {
  const de = diaISO(filtros.de);
  const ate = diaISO(filtros.ate);
  const eventId = filtros.eventId && filtros.eventId !== "all" ? filtros.eventId : null;
  const companhia = typeof filtros.companhia === "string" && filtros.companhia !== "all" ? filtros.companhia : null;
  const transporte = typeof filtros.transporte === "string" && filtros.transporte !== "all" ? filtros.transporte : null;

  // 1) Período (pelo início do evento). Evento sem data fica fora de um período com ponta.
  const noPeriodo = todas.filter((p) => {
    if (!de && !ate) return true;
    const ini = diaISO(p.eventStartDate);
    if (!ini) return false;
    return (!de || ini >= de) && (!ate || ini <= ate);
  });

  // 2) Opções dos filtros: tudo do período, com quantas passagens cada uma deixa.
  const contar = (chave: (p: PassagemParaAnalise) => string, nome: (k: string, p: PassagemParaAnalise) => string) => {
    const m = new Map<string, Opcao>();
    for (const p of noPeriodo) {
      const k = chave(p);
      const o = m.get(k) ?? { id: k, nome: nome(k, p), n: 0 };
      o.n += 1;
      m.set(k, o);
    }
    return Array.from(m.values());
  };
  const opcoes = {
    eventos: contar((p) => p.eventId, (_k, p) => p.eventName).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    companhias: contar((p) => chaveDaCompanhia(p.companhia), (k, p) => nomeDaCompanhia(k, p.companhia))
      .sort((a, b) => (a.id === "" ? 1 : b.id === "" ? -1 : b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"))),
    transportes: contar(transporteDe, (k) => ROTULO_TRANSPORTE[k] ?? k)
      .sort((a, b) => (a.id === "" ? 1 : b.id === "" ? -1 : b.n - a.n)),
  };

  // 3) Recorte de evento, companhia e transporte.
  const lista = noPeriodo.filter((p) =>
    (!eventId || p.eventId === eventId)
    && (companhia === null || chaveDaCompanhia(p.companhia) === companhia)
    && (transporte === null || transporteDe(p) === transporte));

  // Totais e o que fica de fora das médias.
  const base = agregar(lista);
  let semDataCompra = 0, semDataIda = 0, compraDepoisDaIda = 0;
  for (const p of lista) {
    if (!diaISO(p.dataCompra)) semDataCompra += 1;
    if (!diaISO(p.dataIda)) semDataIda += 1;
  }

  // Por mês da ida.
  const meses = new Map<string, Agregado>();
  for (const p of lista) {
    const d = diaISO(p.dataIda);
    if (!d) continue;
    const k = d.slice(0, 7);
    const g = meses.get(k) ?? agregadoVazio();
    somar(g, p);
    meses.set(k, g);
  }
  const porMes = Array.from(meses.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, g]) => ({ ...fechar(g), mes, rotulo: `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}` }));

  // Por evento.
  const eventos = new Map<string, { ag: Agregado; nome: string; inicio: string | null; pessoas: Set<string>; trocas: number }>();
  for (const p of lista) {
    const e = eventos.get(p.eventId) ?? { ag: agregadoVazio(), nome: p.eventName, inicio: diaISO(p.eventStartDate), pessoas: new Set<string>(), trocas: 0 };
    somar(e.ag, p);
    if (p.arquivada) e.trocas += 1;
    // Pessoa = quem viajou: só a passagem atual conta (a de troca é custo, não gente).
    else e.pessoas.add(p.pessoaId ?? `vaga:${p.teamInclusionId}`);
    eventos.set(p.eventId, e);
  }
  const porEvento: EventoDaAnalise[] = Array.from(eventos.entries())
    .map(([id, e]) => {
      const ag = fechar(e.ag);
      const pessoas = e.pessoas.size;
      return { ...ag, eventId: id, nome: e.nome, inicio: e.inicio, pessoas, porPessoa: pessoas > 0 ? Math.round(ag.gasto / pessoas) : null, trocas: e.trocas };
    })
    .sort((a, b) => b.gasto - a.gasto || a.nome.localeCompare(b.nome, "pt-BR"));

  // Antecedência: dias entre a compra e a ida.
  const faixas: FaixaDeAntecedencia[] = FAIXAS.map((f) => ({ ...agregadoVazio(), chave: f.chave, rotulo: f.rotulo, comparavel: false, destaque: null }));
  let baseAnt = 0, menosDe14 = 0;
  for (const p of lista) {
    const c = diaISO(p.dataCompra);
    const i = diaISO(p.dataIda);
    if (!c || !i) continue;
    const dias = diasEntre(c, i);
    if (dias < 0) { compraDepoisDaIda += 1; continue; }
    baseAnt += 1;
    if (dias < 14) menosDe14 += 1;
    const idx = FAIXAS.findIndex((f) => dias >= f.min && dias <= f.max);
    somar(faixas[idx], p);
  }
  for (const f of faixas) { fechar(f); f.comparavel = f.comValor >= minimoPorDia; }
  marcarExtremos(faixas);

  // Bagagem, trocas e remarcações.
  let bagPassagens = 0, bagTotal = 0;
  for (const p of lista) {
    if (typeof p.bagagem === "number" && p.bagagem > 0) { bagPassagens += 1; bagTotal += p.bagagem; }
  }
  const trocas = agregar(lista.filter((p) => p.arquivada));
  const avisosNoRecorte = avisos.filter((a) => !eventId || a.eventId === eventId);
  // Aviso é da vaga, não da passagem: companhia/transporte não o recortam.
  const pendentes = avisosNoRecorte.filter((a) => !a.resolvido).length;

  return {
    filtros: { de, ate, eventId, companhia, transporte },
    totais: { ...base, eventos: eventos.size, semValor: base.passagens - base.comValor, semDataCompra, semDataIda, compraDepoisDaIda },
    minimoPorDia,
    diasDaIda: porDiaDaSemana(lista, (p) => p.dataIda, minimoPorDia),
    diasDaVolta: porDiaDaSemana(lista, (p) => p.dataVolta, minimoPorDia),
    porMes,
    porEvento,
    antecedencia: {
      faixas,
      base: baseAnt,
      menosDe14,
      pctMenosDe14: baseAnt > 0 ? Math.round((menosDe14 / baseAnt) * 100) : null,
    },
    porRota: agruparNomeado(lista, rotaDe),
    porCompanhia: agruparNomeado(lista, (p) => {
      const chave = chaveDaCompanhia(p.companhia);
      return { chave, nome: nomeDaCompanhia(chave, p.companhia) };
    }),
    porTransporte: agruparNomeado(lista, (p) => {
      const chave = transporteDe(p);
      return { chave, nome: ROTULO_TRANSPORTE[chave] ?? chave };
    }),
    bagagem: { passagens: bagPassagens, total: bagTotal },
    trocas: { passagens: trocas.passagens, gasto: trocas.gasto },
    remarcacoes: { total: avisosNoRecorte.length, pendentes, resolvidos: avisosNoRecorte.length - pendentes },
    opcoes,
  };
}
