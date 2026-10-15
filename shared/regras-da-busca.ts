/**
 * REGRAS DA BUSCA DE PASSAGENS — etapa 2 (09/10). Puras e testadas: os
 * ajustes do admin (system_settings), quem despacha mala, o preço típico de
 * uma rota, o teto por trecho, o alerta de grupo e o aviso do acompanhamento.
 *
 * Quem decide QUANTO se gasta continua em shared/busca-de-passagens.ts; as
 * agregações das abas de análise moram em shared/analise-da-busca.ts e a
 * previsão em shared/previsao-da-busca.ts — todas usam o que está aqui.
 */
import type { PernaDaRota } from "./busca-de-passagens";
import { hasRoleIn, type CanonicalRole } from "./roles";

// ── Quem vê o quê (REGRA ÚNICA — tela e servidor leem daqui) ───────────────

/** Buscar preços e os extras da busca (acompanhar, alertas, alternativas…). */
export const PAPEIS_DA_BUSCA: readonly CanonicalRole[] = ["admin", "purchasing"];
/**
 * Abas de análise, previsão e Consumo: só admin (dono, 09/10 — mesma decisão
 * da aba Análises de Passagens). Para liberar a Compras, é mexer AQUI: as
 * rotas de leitura e as abas da tela seguem esta lista.
 */
export const PAPEIS_DAS_ANALISES: readonly CanonicalRole[] = ["admin"];
export const veAnalisesDaBusca = (role: string | null | undefined) => hasRoleIn(role, PAPEIS_DAS_ANALISES);

// ── Ajustes do admin (system_settings) ─────────────────────────────────────

export const CHAVES_DOS_AJUSTES = {
  /** % acima do preço típico da rota que exige justificativa ao registrar a passagem. */
  tetoPorTrechoPct: "busca_passagens_teto_trecho_pct",
  /** Quantas escalações podem ser acompanhadas ao mesmo tempo. */
  limiteDeAcompanhamentos: "busca_passagens_acompanhar_limite",
  /** Queda (%) que vira aviso no sino. */
  quedaParaAvisoPct: "busca_passagens_acompanhar_queda_pct",
  /** Hora do dia (São Paulo) em que o acompanhamento roda. */
  horaDoAcompanhamento: "busca_passagens_acompanhar_hora",
  /** Valor estimado de UMA mala despachada por perna (centavos). */
  valorDaMalaCentavos: "busca_passagens_valor_mala",
  /** Funções que despacham mala (JSON com os ids). Ausente = cenotécnica. */
  funcoesComMala: "busca_passagens_funcoes_com_mala",
} as const;

export interface AjustesDaBusca {
  tetoPorTrechoPct: number;
  limiteDeAcompanhamentos: number;
  quedaParaAvisoPct: number;
  horaDoAcompanhamento: number;
  valorDaMalaCentavos: number;
  /** null = ninguém configurou: vale a regra padrão (funções de cenotécnica). */
  funcoesComMala: string[] | null;
}

export const AJUSTES_PADRAO: AjustesDaBusca = {
  tetoPorTrechoPct: 30,
  limiteDeAcompanhamentos: 20,
  quedaParaAvisoPct: 10,
  horaDoAcompanhamento: 7,
  valorDaMalaCentavos: 15_000,
  funcoesComMala: null,
};

/** Limites aceitos por campo (a tela e a rota validam pelo mesmo lugar). */
export const LIMITES_DOS_AJUSTES: Record<Exclude<keyof AjustesDaBusca, "funcoesComMala">, { min: number; max: number }> = {
  tetoPorTrechoPct: { min: 5, max: 300 },
  limiteDeAcompanhamentos: { min: 0, max: 200 },
  quedaParaAvisoPct: { min: 1, max: 90 },
  horaDoAcompanhamento: { min: 0, max: 23 },
  valorDaMalaCentavos: { min: 0, max: 200_000 },
};

const inteiroNoLimite = (bruto: unknown, campo: keyof typeof LIMITES_DOS_AJUSTES): number | null => {
  const texto = typeof bruto === "number" ? null : String(bruto ?? "").trim();
  if (texto === "") return null;
  const n = typeof bruto === "number" ? bruto : Number(texto);
  if (!Number.isInteger(n)) return null;
  const { min, max } = LIMITES_DOS_AJUSTES[campo];
  return n >= min && n <= max ? n : null;
};

/** Linhas de system_settings (chave → valor em texto) → ajustes com padrão no que faltar ou vier quebrado. */
export function lerAjustesDaBusca(valores: Record<string, string | null | undefined>): AjustesDaBusca {
  const out: AjustesDaBusca = { ...AJUSTES_PADRAO };
  for (const campo of Object.keys(LIMITES_DOS_AJUSTES) as (keyof typeof LIMITES_DOS_AJUSTES)[]) {
    const v = inteiroNoLimite(valores[CHAVES_DOS_AJUSTES[campo]], campo);
    if (v !== null) out[campo] = v;
  }
  const bruto = valores[CHAVES_DOS_AJUSTES.funcoesComMala];
  if (typeof bruto === "string" && bruto.trim()) {
    try {
      const lista: unknown = JSON.parse(bruto);
      if (Array.isArray(lista)) out.funcoesComMala = lista.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64).slice(0, 200);
    } catch { /* quebrado: fica a regra padrão */ }
  }
  return out;
}

/** Valida um pedido de alteração (PUT): só os campos conhecidos, dentro do limite. */
export function validarAjustes(corpo: unknown): { ok: Partial<AjustesDaBusca>; erros: Record<string, string> } {
  const ok: Partial<AjustesDaBusca> = {};
  const erros: Record<string, string> = {};
  if (!corpo || typeof corpo !== "object") return { ok, erros: { corpo: "Nada para salvar." } };
  const c = corpo as Record<string, unknown>;
  for (const campo of Object.keys(LIMITES_DOS_AJUSTES) as (keyof typeof LIMITES_DOS_AJUSTES)[]) {
    if (c[campo] === undefined) continue;
    const v = inteiroNoLimite(c[campo], campo);
    const { min, max } = LIMITES_DOS_AJUSTES[campo];
    if (v === null) erros[campo] = `Use um número inteiro entre ${min.toLocaleString("pt-BR")} e ${max.toLocaleString("pt-BR")}.`;
    else ok[campo] = v;
  }
  if (c.funcoesComMala !== undefined) {
    if (c.funcoesComMala === null) ok.funcoesComMala = null;
    else if (Array.isArray(c.funcoesComMala) && c.funcoesComMala.every((x) => typeof x === "string" && x.length > 0 && x.length <= 64)) {
      ok.funcoesComMala = Array.from(new Set(c.funcoesComMala as string[])).slice(0, 200);
    } else erros.funcoesComMala = "Lista de funções inválida.";
  }
  return { ok, erros };
}

// ── Mala por função ────────────────────────────────────────────────────────

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Regra padrão (sem lista do admin): quem é de cenotécnica despacha ferramenta/material. */
export const ehFuncaoQueDespachaPorPadrao = (nome: string | null | undefined) => /cenotecn/.test(semAcento(String(nome ?? "")));

/**
 * Ids das funções que despacham mala: a lista do admin, ou — sem lista — as de
 * cenotécnica. A busca soma a mala no custo total de quem despacha.
 */
export function funcoesQueDespacham(funcoes: ReadonlyArray<{ id: string; name?: string | null }>, configurado: readonly string[] | null): Set<string> {
  if (configurado) return new Set(configurado);
  return new Set(funcoes.filter((f) => ehFuncaoQueDespachaPorPadrao(f.name)).map((f) => f.id));
}

// ── Rota, mediana e preço típico ───────────────────────────────────────────

/** Ida e volta é outra tarifa: "rt|GRU>JPA" × "ow|GRU>JPA" (uma perna, ida ou volta). */
export const tipoDaRota = (perna: PernaDaRota | string): "rt" | "ow" => (perna === "ida_e_volta" ? "rt" : "ow");
export const chaveDaRota = (perna: PernaDaRota | string, origem: string, destino: string) =>
  `${tipoDaRota(perna)}|${origem.toUpperCase()}>${destino.toUpperCase()}`;
/** "GRU ⇄ JPA" (ida e volta) / "GRU → JPA" (uma perna). */
export function nomeDaRota(chave: string): string {
  const [tipo, trecho] = chave.split("|");
  const [o, d] = (trecho ?? "").split(">");
  return `${o ?? "?"} ${tipo === "rt" ? "⇄" : "→"} ${d ?? "?"}`;
}

export function mediana(valores: readonly number[]): number | null {
  const v = valores.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

/** Abaixo disto uma rota não tem "preço típico" — não se julga preço nenhum por ela. */
export const MIN_AMOSTRA_DO_TIPICO = 3;

export interface PrecoTipico { mediana: number; amostra: number }

/** Mediana dos menores preços vistos (centavos) — robusta a uma consulta fora da curva. */
export function precoTipico(precos: readonly (number | null | undefined)[], minimo = MIN_AMOSTRA_DO_TIPICO): PrecoTipico | null {
  const v = precos.filter((p): p is number => typeof p === "number" && p > 0);
  if (v.length < minimo) return null;
  return { mediana: mediana(v)!, amostra: v.length };
}

// ── Faixas de antecedência (briefing do dono, 09/10) ───────────────────────

export type ChaveDaAntecedencia = "0-6" | "7-14" | "15-30" | "31-60" | "61+";
export const FAIXAS_DE_ANTECEDENCIA: ReadonlyArray<{ chave: ChaveDaAntecedencia; rotulo: string; curto: string; min: number; max: number }> = [
  { chave: "0-6", rotulo: "Menos de 7 dias", curto: "< 7 dias", min: 0, max: 6 },
  { chave: "7-14", rotulo: "7 a 14 dias", curto: "7–14 dias", min: 7, max: 14 },
  { chave: "15-30", rotulo: "15 a 30 dias", curto: "15–30 dias", min: 15, max: 30 },
  { chave: "31-60", rotulo: "31 a 60 dias", curto: "31–60 dias", min: 31, max: 60 },
  { chave: "61+", rotulo: "Mais de 60 dias", curto: "60+ dias", min: 61, max: Infinity },
];

/** Faixa de um número de dias (negativo = já passou → null). */
export function faixaDaAntecedencia(dias: number | null | undefined): ChaveDaAntecedencia | null {
  if (typeof dias !== "number" || !Number.isFinite(dias) || dias < 0) return null;
  return FAIXAS_DE_ANTECEDENCIA.find((f) => dias >= f.min && dias <= f.max)!.chave;
}

// ── Teto por trecho ────────────────────────────────────────────────────────

export interface AvaliacaoDoTeto {
  acima: boolean;
  tipico: number;
  limite: number;
  /** Quanto o valor passa do típico, em % inteiro. */
  pctAcimaDoTipico: number;
  amostra: number;
  pctPermitido: number;
}

/**
 * Valor de passagem contra o típico da rota (09/10): acima de `pct`% exige
 * justificativa. Sem típico (rota com pouca amostra) → null: nada a julgar.
 */
export function avaliarTetoDoTrecho(valorCentavos: number | null | undefined, tipico: PrecoTipico | null, pct: number): AvaliacaoDoTeto | null {
  if (!tipico || typeof valorCentavos !== "number" || valorCentavos <= 0) return null;
  const limite = Math.round(tipico.mediana * (1 + pct / 100));
  return {
    acima: valorCentavos > limite,
    tipico: tipico.mediana,
    limite,
    pctAcimaDoTipico: Math.round(((valorCentavos - tipico.mediana) / tipico.mediana) * 100),
    amostra: tipico.amostra,
    pctPermitido: pct,
  };
}

/** Justificativa aceita: texto de gente, não "ok". */
export const MIN_CARACTERES_DA_JUSTIFICATIVA = 10;
export const justificativaValida = (t: unknown) => typeof t === "string" && t.trim().length >= MIN_CARACTERES_DA_JUSTIFICATIVA && t.trim().length <= 500;

/** A rota de uma passagem registrada (aeroportos de 3 letras), para comparar com o típico. */
export function rotaDaPassagem(t: {
  actualDepartureDate?: string | Date | null;
  actualReturnDate?: string | Date | null;
  departureAirport?: string | null;
  destinationAirport?: string | null;
  returnOriginAirport?: string | null;
  returnDestinationAirport?: string | null;
}): { perna: PernaDaRota; origem: string; destino: string } | null {
  const iata = (v: string | null | undefined) => (v && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : null);
  const temIda = !!t.actualDepartureDate && !!iata(t.departureAirport) && !!iata(t.destinationAirport);
  const temVolta = !!t.actualReturnDate;
  if (temIda) return { perna: temVolta ? "ida_e_volta" : "ida", origem: iata(t.departureAirport)!, destino: iata(t.destinationAirport)! };
  if (temVolta && iata(t.returnOriginAirport) && iata(t.returnDestinationAirport)) {
    return { perna: "volta", origem: iata(t.returnOriginAirport)!, destino: iata(t.returnDestinationAirport)! };
  }
  return null;
}

// ── Alerta de grupo ────────────────────────────────────────────────────────

/** A partir de quantas pessoas no mesmo voo vale pedir tarifa de grupo. */
export const MIN_PESSOAS_DO_GRUPO = 10;

export interface PernaParaGrupo {
  vagaId: string;
  numero: number | null;
  nome: string;
  origem: string;
  destino: string;
  /** "AAAA-MM-DD" do voo. */
  data: string;
}

export interface AlertaDeGrupo {
  chave: string;
  origem: string;
  destino: string;
  data: string;
  vagas: PernaParaGrupo[];
}

/**
 * 10+ pessoas que voam o MESMO trecho no MESMO dia (ida ou volta, de
 * escalações diferentes) → "pedir tarifa de grupo à companhia". Cada vaga
 * conta uma vez por trecho.
 */
export function alertasDeGrupo(pernas: readonly PernaParaGrupo[], minimo = MIN_PESSOAS_DO_GRUPO): AlertaDeGrupo[] {
  const grupos = new Map<string, AlertaDeGrupo>();
  for (const p of pernas) {
    const chave = `${p.origem}>${p.destino}|${p.data}`;
    const g = grupos.get(chave) ?? { chave, origem: p.origem, destino: p.destino, data: p.data, vagas: [] };
    if (!g.vagas.some((v) => v.vagaId === p.vagaId)) g.vagas.push(p);
    grupos.set(chave, g);
  }
  return Array.from(grupos.values())
    .filter((g) => g.vagas.length >= minimo)
    .sort((a, b) => b.vagas.length - a.vagas.length || a.data.localeCompare(b.data))
    .map((g) => ({ ...g, vagas: g.vagas.slice().sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0)) }));
}

// ── Aviso do acompanhamento de preço ───────────────────────────────────────

export type TendenciaDoPreco = "subir" | "baixar" | "estavel" | "sem_dado";
export type TipoDeAvisoDePreco = "caiu" | "subir";

export interface DecisaoDoAcompanhamento {
  aviso: TipoDeAvisoDePreco | null;
  texto: string | null;
  /** Preço que vira a nova referência do "caiu X%" (só muda quando avisa a queda). */
  referencia: number | null;
}

const reais = (c: number) => `R$ ${Math.round(c / 100).toLocaleString("pt-BR")}`;

/**
 * Checagem diária de uma escalação acompanhada: avisa quando o preço CAIU
 * `quedaPct`% ou mais desde a referência (o primeiro preço visto ou o do
 * último aviso de queda) ou quando a tendência VIROU "subir". A queda tem
 * prioridade — é a notícia que muda a decisão de compra.
 */
export function decidirAvisoDoAcompanhamento(e: {
  referencia: number | null;
  novoPreco: number | null;
  tendenciaAnterior: TendenciaDoPreco | null;
  novaTendencia: TendenciaDoPreco | null;
  quedaPct: number;
}): DecisaoDoAcompanhamento {
  if (e.novoPreco !== null && e.novoPreco > 0) {
    if (e.referencia === null || e.referencia <= 0) return { aviso: null, texto: null, referencia: e.novoPreco };
    const queda = (e.referencia - e.novoPreco) / e.referencia;
    if (queda * 100 >= e.quedaPct) {
      return { aviso: "caiu", texto: `Caiu ${Math.round(queda * 100)}% (${reais(e.referencia)} → ${reais(e.novoPreco)})`, referencia: e.novoPreco };
    }
  }
  if (e.novaTendencia === "subir" && e.tendenciaAnterior !== "subir") {
    return { aviso: "subir", texto: "A tendência virou “subir” — compre logo", referencia: e.referencia };
  }
  return { aviso: null, texto: null, referencia: e.referencia };
}
