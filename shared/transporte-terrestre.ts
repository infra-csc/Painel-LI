/**
 * TRANSPORTE TERRESTRE DA VAGA (16/10 — print do dono, "Blue Run - Campinas"):
 * "aqui ter a opção de colocar vai de carro ou van. Van precisa informar o
 * nome da empresa e o valor; carro, só o valor do carro."
 *
 * 21/10 (dono, no painel "Aplicar em lote"): "aqui só carro e van, e na van
 * tem que ter um valor total da van e não só por trecho". Daí:
 *  - só CARRO e VAN se registram. "onibus" continua no domínio porque há
 *    registros de 16 a 21/10 (aparecem, editam e desfazem; ao editar, a pessoa
 *    escolhe carro ou van);
 *  - o valor digitado é da VIAGEM TODA (os trechos marcados), nunca por
 *    trecho. Van no lote: o valor total da van, dividido entre as vagas
 *    marcadas e, dentro de cada vaga, entre os trechos dela. Carro no lote: o
 *    valor de cada vaga (padrão) ou o total dividido;
 *  - o total dividido vira um GRUPO (`grupo_id` em cada linha): a linha da
 *    vaga mostra "parte de R$ 1.200,00 · 8 vagas", e editar/desfazer pode ser
 *    só daquela vaga ou da van inteira.
 *
 * Por baixo continua um registro por vaga e por PERNA (ida / volta), em
 * `transportes_terrestres`. A passagem (`tickets`) continua sendo o bilhete
 * comprado; o terrestre diz que aquela perna NÃO precisa de passagem porque a
 * pessoa vai de carro ou de van — com quanto custa.
 *
 * O valor é só REGISTRADO e mostrado: o Planejado e o Realizado não têm campo
 * de custo de transporte (a passagem aérea também não entra neles) — ligar
 * isto ao custo é decisão do dono.
 *
 * Regra única, sem React nem banco: a rota valida com ela, a tela de Passagens
 * decide "Comprar / resolvida" com ela e a Busca de passagens a usa para não
 * buscar voo de perna terrestre.
 */

/** O que pode estar GRAVADO (inclui o ônibus dos registros de 16 a 21/10). */
export const MODOS_TERRESTRES = ["carro", "van", "onibus"] as const;
export type ModoTerrestre = (typeof MODOS_TERRESTRES)[number];

/** O que se REGISTRA daqui para frente (dono, 21/10: "aqui só carro e van"). */
export const MODOS_DE_REGISTRO = ["carro", "van"] as const;
export type ModoDeRegistro = (typeof MODOS_DE_REGISTRO)[number];

export const PERNAS = ["ida", "volta"] as const;
export type PernaDaViagem = (typeof PERNAS)[number];

export const NOME_DO_MODO: Record<ModoTerrestre, string> = { carro: "Carro", van: "Van", onibus: "Ônibus" };
export const NOME_DA_PERNA: Record<PernaDaViagem, string> = { ida: "Ida", volta: "Volta" };

/** R$ 100 mil por trecho: acima disto é erro de digitação (centavos a mais), não transporte. */
export const VALOR_MAXIMO_CENTAVOS = 10_000_000;
export const EMPRESA_MAX = 120;

export const ehModoTerrestre = (v: unknown): v is ModoTerrestre =>
  typeof v === "string" && (MODOS_TERRESTRES as readonly string[]).includes(v);
export const ehModoDeRegistro = (v: unknown): v is ModoDeRegistro => v === "carro" || v === "van";
export const ehPerna = (v: unknown): v is PernaDaViagem => v === "ida" || v === "volta";

/** Van (e o ônibus antigo) têm empresa; carro, só o valor (dono, 16/10). */
export const modoPedeEmpresa = (m: ModoTerrestre | "" | null | undefined): boolean => m === "van" || m === "onibus";

/** O total dividido entre várias vagas (21/10): o que a linha da vaga mostra do grupo. */
export interface GrupoDoTerrestre {
  id: string;
  /** Soma de todas as linhas do grupo — o valor total da van, como está registrado hoje. */
  totalCentavos: number;
  /** Quantas vagas dividem esse total. */
  vagas: number;
}

/** O que fica gravado por perna. */
export interface TrechoTerrestre {
  trecho: PernaDaViagem;
  modo: ModoTerrestre;
  empresa: string | null;
  valorCentavos: number;
  /** Só quando a vaga divide o total com outras (2 vagas ou mais). */
  grupo?: GrupoDoTerrestre | null;
}

export interface ItemTerrestre extends TrechoTerrestre { teamInclusionId: string }

/** O que o GET devolve em cada linha, além das colunas: o resumo do grupo (null sem grupo). */
export interface ResumoDoGrupo { grupoTotalCentavos: number | null; grupoVagas: number | null }

export type CampoDoTrecho = "trecho" | "modo" | "empresa" | "valorCentavos";

const limparEmpresa = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/**
 * Confere um trecho vindo da rede. Só carro ou van (21/10). Carro descarta a
 * empresa (o formulário nem mostra o campo); van exige. Valor obrigatório,
 * inteiro, > 0.
 */
export function validarTrechoTerrestre(
  entrada: unknown,
): { ok: true; valor: TrechoTerrestre } | { ok: false; erros: Partial<Record<CampoDoTrecho, string>> } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const erros: Partial<Record<CampoDoTrecho, string>> = {};
  if (!ehPerna(e.trecho)) erros.trecho = "Escolha a ida ou a volta.";
  if (!ehModoDeRegistro(e.modo)) erros.modo = "Escolha carro ou van.";
  const empresa = limparEmpresa(e.empresa);
  if (e.modo === "van") {
    if (!empresa) erros.empresa = "Informe o nome da empresa da van.";
    else if (empresa.length > EMPRESA_MAX) erros.empresa = `O nome da empresa passa de ${EMPRESA_MAX} caracteres.`;
  }
  const v = e.valorCentavos;
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) erros.valorCentavos = "Informe o valor (maior que zero).";
  else if (v > VALOR_MAXIMO_CENTAVOS) erros.valorCentavos = "Valor alto demais — confira os centavos.";
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  const modo = e.modo as ModoDeRegistro;
  return {
    ok: true,
    valor: { trecho: e.trecho as PernaDaViagem, modo, empresa: modo === "van" ? empresa : null, valorCentavos: v as number },
  };
}

/** Edição da van inteira (PUT do grupo): o mesmo formato do registro, sem trecho. */
export function validarEdicaoDoGrupo(
  entrada: unknown,
): { ok: true; valor: { modo: ModoDeRegistro; empresa: string | null; totalCentavos: number } } | { ok: false; erros: Partial<Record<"modo" | "empresa" | "totalCentavos", string>> } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const r = validarTrechoTerrestre({ trecho: "ida", modo: e.modo, empresa: e.empresa, valorCentavos: 1 });
  const erros: Partial<Record<"modo" | "empresa" | "totalCentavos", string>> = {};
  if (!r.ok) {
    if (r.erros.modo) erros.modo = r.erros.modo;
    if (r.erros.empresa) erros.empresa = r.erros.empresa;
  }
  const t = e.totalCentavos;
  if (typeof t !== "number" || !Number.isInteger(t) || t <= 0) erros.totalCentavos = "Informe o valor total (maior que zero).";
  if (!r.ok || Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, valor: { modo: r.valor.modo as ModoDeRegistro, empresa: r.valor.empresa, totalCentavos: t as number } };
}

/**
 * Texto do campo de valor → centavos. Aceita "1.200,00", "1200", "300,5",
 * "R$ 1.200" e "1200.50". Vazio ou texto que não é número → null (nunca 0
 * calado: foi assim que um LOC virou passagem de R$ 0,00 em 28/08).
 */
export function centavosDoTexto(texto: unknown): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) ? Math.round(texto * 100) : null;
  if (typeof texto !== "string") return null;
  const s = texto.replace(/R\$\s*/i, "").replace(/\s+/g, "");
  if (!s) return null;
  let normalizado: string;
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s) || /^\d+,\d{1,2}$/.test(s)) normalizado = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(\.\d{1,2})?$/.test(s)) normalizado = s;
  else return null;
  const n = Number(normalizado);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Divide o total em N partes inteiras; os centavos que sobram vão para as primeiras. */
export function dividirCentavos(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

// ── Rateio do total (21/10) ───────────────────────────────────────────────

/** Uma vaga no rateio: quais pernas ela recebe. */
export interface VagaDoRateio { id: string; pernas: readonly PernaDaViagem[] }
export interface ParteDoRateio { teamInclusionId: string; trecho: PernaDaViagem; valorCentavos: number }

/**
 * Ordem do rateio — a mesma no lote e na edição da van inteira: pelo número
 * da vaga (as sem número no fim), depois pelo id. Com isso "quem fica com o
 * centavo a mais" não depende da ordem em que as vagas foram marcadas.
 */
export function ordenarParaRateio<V extends { id: string; inclusionNumber?: number | null }>(vagas: readonly V[]): V[] {
  return [...vagas].sort((a, b) => {
    const na = a.inclusionNumber ?? Number.POSITIVE_INFINITY;
    const nb = b.inclusionNumber ?? Number.POSITIVE_INFINITY;
    if (na !== nb) return na < nb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Reparte `total` entre as vagas (partes iguais; os centavos que sobram vão
 * para as primeiras) e, dentro de cada vaga, entre as pernas dela (a ida
 * primeiro, que fica com o centavo ímpar). A soma das partes é EXATAMENTE o
 * total. Ex.: R$ 1.000,01 em 3 vagas de ida e volta → vagas com 333,34 /
 * 333,34 / 333,33 → trechos 166,67 + 166,67 / 166,67 + 166,67 / 166,67 + 166,66.
 */
export function ratearTotal(total: number, vagas: readonly VagaDoRateio[]): ParteDoRateio[] {
  const porVaga = dividirCentavos(total, vagas.length);
  const out: ParteDoRateio[] = [];
  vagas.forEach((v, i) => {
    const pernas = PERNAS.filter((p) => v.pernas.includes(p));
    const porPerna = dividirCentavos(porVaga[i], pernas.length);
    pernas.forEach((trecho, j) => out.push({ teamInclusionId: v.id, trecho, valorCentavos: porPerna[j] }));
  });
  return out;
}

// ── Que pernas a vaga tem ─────────────────────────────────────────────────

export interface VagaDasPernas {
  trechosSugeridos?: string | null;
  voltaSegueParaEventoId?: string | null;
}

/**
 * As pernas desta vaga — a mesma leitura da Busca de passagens: "só ida" não
 * tem volta, "só volta" não tem ida, e quem segue direto para outro evento
 * não volta por esta vaga.
 */
export function pernasDaVaga(v: VagaDasPernas): PernaDaViagem[] {
  const out: PernaDaViagem[] = [];
  if (v.trechosSugeridos !== "so_volta") out.push("ida");
  if (v.trechosSugeridos !== "so_ida" && !v.voltaSegueParaEventoId) out.push("volta");
  return out;
}

export interface CoberturaTerrestre {
  /** O registro de cada perna (no máximo um por perna). */
  porPerna: Partial<Record<PernaDaViagem, TrechoTerrestre>>;
  /** Todas as pernas da vaga são terrestres: não há passagem a comprar. */
  cobreTudo: boolean;
  /** Pernas da vaga ainda sem terrestre (podem precisar de passagem). */
  semTerrestre: PernaDaViagem[];
  /** Soma das pernas registradas. */
  totalCentavos: number;
}

export function coberturaTerrestre(v: VagaDasPernas, registros: readonly TrechoTerrestre[] | null | undefined): CoberturaTerrestre {
  const porPerna: Partial<Record<PernaDaViagem, TrechoTerrestre>> = {};
  for (const r of registros ?? []) if (ehPerna(r.trecho) && !porPerna[r.trecho]) porPerna[r.trecho] = r;
  const pernas = pernasDaVaga(v);
  const semTerrestre = pernas.filter((p) => !porPerna[p]);
  const totalCentavos = Object.values(porPerna).reduce((s, r) => s + (r?.valorCentavos ?? 0), 0);
  return { porPerna, cobreTudo: Object.keys(porPerna).length > 0 && semTerrestre.length === 0, semTerrestre, totalCentavos };
}

// ── O que a Sugestão já diz ───────────────────────────────────────────────

/**
 * "van - 7h saindo", "14h carro", "carro - 18h", "9h - onibus", "Ônibus 22h".
 * Texto livre de quem planeja; devolve o modo terrestre citado, ou null.
 */
export function modoDoTexto(texto: string | null | undefined): ModoTerrestre | null {
  if (!texto) return null;
  const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/\bvan\b/.test(t)) return "van";
  if (/\bonibus\b|\brodoviari[oa]\b/.test(t)) return "onibus";
  if (/\bcarro\b/.test(t)) return "carro";
  return null;
}

export interface VagaDaSugestao extends VagaDasPernas {
  transportModeIda?: string | null;
  transportModeVolta?: string | null;
  flightDepartureSuggestedTime?: string | null;
  flightArrivalSuggestedTime?: string | null;
  flightReturnSuggestedTime?: string | null;
}

/**
 * Modo terrestre que a vaga JÁ indica, por perna: o campo de transporte da
 * Validação de Escala manda; sem ele, o texto do horário sugerido. Pode vir
 * "onibus" — é o que a Sugestão diz, não o que se registra: quem usa decide
 * (ver `modoSugerido`).
 */
export function sugestaoTerrestreDaVaga(v: VagaDaSugestao): Partial<Record<PernaDaViagem, ModoTerrestre>> {
  const out: Partial<Record<PernaDaViagem, ModoTerrestre>> = {};
  const pernas = pernasDaVaga(v);
  const ida = ehModoTerrestre(v.transportModeIda) ? v.transportModeIda
    : v.transportModeIda && v.transportModeIda !== "" ? null
    : modoDoTexto(v.flightDepartureSuggestedTime) ?? modoDoTexto(v.flightArrivalSuggestedTime);
  const volta = ehModoTerrestre(v.transportModeVolta) ? v.transportModeVolta
    : v.transportModeVolta && v.transportModeVolta !== "" ? null
    : modoDoTexto(v.flightReturnSuggestedTime);
  if (ida && pernas.includes("ida")) out.ida = ida;
  if (volta && pernas.includes("volta")) out.volta = volta;
  return out;
}

/**
 * O modo que o atalho "Vai de …" propõe: carro ou van da Sugestão (a ida
 * primeiro). "9h - onibus" NÃO vira van (21/10): ônibus de linha é passagem
 * rodoviária, comprada no modal da passagem; chutar van marcaria o tipo errado
 * e pediria uma empresa que não existe. Sem carro/van na Sugestão, o atalho
 * fica neutro ("Vai de carro/van") e a pessoa escolhe.
 */
export function modoSugerido(sugestao: Partial<Record<PernaDaViagem, ModoTerrestre>>): ModoDeRegistro | undefined {
  return [sugestao.ida, sugestao.volta].find(ehModoDeRegistro);
}

// ── Busca de passagens ────────────────────────────────────────────────────

/**
 * A vaga como a Busca deve enxergá-la: perna com terrestre registrado vira
 * perna não aérea (o `planejarBusca` já ignora as que não são aéreas).
 */
export function comModoTerrestre<V extends { transportModeIda?: string | null; transportModeVolta?: string | null }>(
  v: V,
  registros: readonly TrechoTerrestre[] | null | undefined,
): V {
  if (!registros || registros.length === 0) return v;
  const ida = registros.find((r) => r.trecho === "ida");
  const volta = registros.find((r) => r.trecho === "volta");
  return {
    ...v,
    transportModeIda: ida ? ida.modo : v.transportModeIda,
    transportModeVolta: volta ? volta.modo : v.transportModeVolta,
  };
}

// ── Texto ─────────────────────────────────────────────────────────────────

export const reaisDoTerrestre = (centavos: number) =>
  `R$ ${(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "Carro · R$ 300,00" · "Van · Viação Cometa · R$ 1.200,00". */
export function textoDoTrecho(t: Pick<TrechoTerrestre, "modo" | "empresa" | "valorCentavos">): string {
  return [NOME_DO_MODO[t.modo] ?? t.modo, t.empresa || null, reaisDoTerrestre(t.valorCentavos)].filter(Boolean).join(" · ");
}

/** "parte de R$ 1.200,00 · 8 vagas" — o grupo do total dividido. */
export const textoDoGrupo = (g: GrupoDoTerrestre) => `parte de ${reaisDoTerrestre(g.totalCentavos)} · ${g.vagas} vagas`;

/** Rótulo curto da situação: "Vai de van", "Vai de carro", "Vai de ônibus" ou "Terrestre" (modos diferentes). */
export function rotuloDaCobertura(c: CoberturaTerrestre): string {
  const modos = Array.from(new Set(Object.values(c.porPerna).map((r) => r!.modo)));
  if (modos.length !== 1) return "Terrestre";
  return `Vai de ${NOME_DO_MODO[modos[0]].toLowerCase()}`;
}

/** "a ida e a volta" · "só a ida" · "só a volta" — o que o valor digitado cobre. */
export function textoDasPernas(f: Pick<FormularioTerrestre, "ida" | "volta">): string {
  if (f.ida && f.volta) return "a ida e a volta";
  if (f.ida) return "só a ida";
  if (f.volta) return "só a volta";
  return "";
}

/**
 * A mesma viagem em várias pernas: mesmo modo, mesma empresa e mesmo grupo
 * (o valor não entra — o total de uma vaga pode ter 1 centavo a mais na ida).
 * É o que a linha da vaga junta numa entrada só ("Ida e volta · Van").
 */
export function entradasDaViagem(registros: readonly TrechoTerrestre[]): Array<{ pernas: PernaDaViagem[]; trechos: TrechoTerrestre[]; totalCentavos: number }> {
  const ordem = [...registros].sort((a, b) => (a.trecho === b.trecho ? 0 : a.trecho === "ida" ? -1 : 1));
  const out: Array<{ chave: string; pernas: PernaDaViagem[]; trechos: TrechoTerrestre[]; totalCentavos: number }> = [];
  for (const t of ordem) {
    const chave = `${t.modo}|${t.empresa ?? ""}|${t.grupo?.id ?? ""}`;
    const e = out.find((x) => x.chave === chave);
    if (e) { e.pernas.push(t.trecho); e.trechos.push(t); e.totalCentavos += t.valorCentavos; }
    else out.push({ chave, pernas: [t.trecho], trechos: [t], totalCentavos: t.valorCentavos });
  }
  return out.map((e) => ({ pernas: e.pernas, trechos: e.trechos, totalCentavos: e.totalCentavos }));
}

// ── Formulário (modal da vaga e lote) ─────────────────────────────────────

export interface FormularioTerrestre {
  ida: boolean;
  volta: boolean;
  modo: ModoDeRegistro | "";
  empresa: string;
  /**
   * Sempre a VIAGEM TODA (os trechos marcados), nunca por trecho (21/10).
   * Van no lote: o valor total da van. Van numa vaga: o valor da van para
   * aquela vaga. Carro: o valor do carro.
   */
  valor: string;
  /**
   * Lote de CARRO: "cada" = o valor é de cada vaga (cada um com seu carro —
   * o padrão); "dividir" = é o total, dividido entre as vagas. A van no lote
   * é sempre o total dividido (ignora este campo).
   */
  divisao: "cada" | "dividir";
}

export const FORMULARIO_TERRESTRE_VAZIO: FormularioTerrestre = {
  ida: true, volta: true, modo: "", empresa: "", valor: "", divisao: "cada",
};

export type CampoDoFormulario = "pernas" | "modo" | "empresa" | "valor";

/** Centavos → "1.200,00" (o que o campo mostra ao editar). */
export const textoDoValor = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * O formulário a partir do que já está gravado na vaga (editar) ou da
 * Sugestão (novo). Sem registro: o modo é o carro/van da Sugestão e só as
 * pernas compatíveis com ele vêm marcadas ("van - 7h" na ida e "carro - 18h"
 * na volta → só a ida, de van; a volta se registra à parte). Com registro: o
 * valor é a soma das pernas (a viagem toda); ônibus antigo volta sem modo —
 * a pessoa escolhe carro ou van para salvar.
 */
export function formularioDosRegistros(
  registros: readonly TrechoTerrestre[],
  pernas: readonly PernaDaViagem[],
  sugestao: Partial<Record<PernaDaViagem, ModoTerrestre>> = {},
): FormularioTerrestre {
  const ida = registros.find((r) => r.trecho === "ida");
  const volta = registros.find((r) => r.trecho === "volta");
  if (!ida && !volta) {
    const modo = modoSugerido(sugestao) ?? "";
    const compativel = (p: PernaDaViagem) => pernas.includes(p) && (!sugestao[p] || sugestao[p] === modo);
    const nenhuma = !compativel("ida") && !compativel("volta");
    return {
      ...FORMULARIO_TERRESTRE_VAZIO,
      // Nada compatível (a Sugestão só diz ônibus): abre com as pernas da vaga — quem abriu escolhe.
      ida: nenhuma ? pernas.includes("ida") : compativel("ida"),
      volta: nenhuma ? pernas.includes("volta") : compativel("volta"),
      modo,
    };
  }
  const base = ida ?? volta!;
  return {
    ida: !!ida, volta: !!volta,
    modo: ehModoDeRegistro(base.modo) ? base.modo : "",
    empresa: base.empresa ?? "",
    valor: textoDoValor((ida?.valorCentavos ?? 0) + (volta?.valorCentavos ?? 0)),
    divisao: "cada",
  };
}

/** O total é dividido entre as vagas? Van no lote, sempre; carro, se a pessoa escolheu. */
export const totalDividido = (f: Pick<FormularioTerrestre, "modo" | "divisao">, nVagas: number): boolean =>
  nVagas > 1 && (f.modo === "van" || f.divisao === "dividir");

export interface PlanoDoValor {
  /** As vagas que recebem, com as pernas que recebem (as marcadas que a vaga tem). */
  receptoras: VagaDoRateio[];
  /** Vagas marcadas que não têm nenhum dos trechos marcados (ficam de fora). */
  foraDoTrecho: string[];
  /** Total dividido entre as vagas (vira grupo). */
  dividir: boolean;
  partes: ParteDoRateio[];
  totalCentavos: number;
  /** Menor e maior valor por vaga (iguais, ou 1 centavo de diferença no total dividido). */
  porVagaMin: number;
  porVagaMax: number;
}

/**
 * O que o valor digitado vira, sem validar o resto (a tela mostra "R$ X por
 * vaga" enquanto a pessoa digita). null quando o valor não é um número > 0.
 * `vagas` já na ordem do rateio (`ordenarParaRateio`), com as pernas de cada uma.
 */
export function planoDoValor(f: FormularioTerrestre, vagas: readonly VagaDoRateio[]): PlanoDoValor | null {
  const centavos = centavosDoTexto(f.valor);
  if (centavos === null || centavos <= 0) return null;
  const receptoras: VagaDoRateio[] = [];
  const foraDoTrecho: string[] = [];
  for (const v of vagas) {
    const pernas = PERNAS.filter((p) => (p === "ida" ? f.ida : f.volta) && v.pernas.includes(p));
    if (pernas.length > 0) receptoras.push({ id: v.id, pernas });
    else foraDoTrecho.push(v.id);
  }
  const dividir = totalDividido(f, receptoras.length);
  const partes = dividir ? ratearTotal(centavos, receptoras) : receptoras.flatMap((v) => ratearTotal(centavos, [v]));
  const porVaga = new Map<string, number>();
  for (const p of partes) porVaga.set(p.teamInclusionId, (porVaga.get(p.teamInclusionId) ?? 0) + p.valorCentavos);
  const valores = Array.from(porVaga.values());
  return {
    receptoras, foraDoTrecho, dividir, partes,
    totalCentavos: partes.reduce((s, p) => s + p.valorCentavos, 0),
    porVagaMin: valores.length ? Math.min(...valores) : 0,
    porVagaMax: valores.length ? Math.max(...valores) : 0,
  };
}

/**
 * Formulário → itens a gravar (um por vaga e perna), ou os erros por campo.
 * Uma vaga só (o diálogo): o valor é a viagem toda da vaga, repartido entre os
 * trechos marcados. Várias (o lote): van = o total da van, dividido entre as
 * vagas e, em cada vaga, entre os trechos dela; carro = o valor de cada vaga
 * ou o total dividido. `agrupar` diz que o total foi dividido (vira grupo).
 */
export function itensDoFormulario(
  f: FormularioTerrestre,
  vagas: readonly VagaDoRateio[],
): { ok: true; itens: ItemTerrestre[]; foraDoTrecho: string[]; agrupar: boolean } | { ok: false; erros: Partial<Record<CampoDoFormulario, string>> } {
  const erros: Partial<Record<CampoDoFormulario, string>> = {};
  if (!f.ida && !f.volta) erros.pernas = "Marque a ida, a volta ou as duas.";
  if (!ehModoDeRegistro(f.modo)) erros.modo = "Escolha carro ou van.";
  const empresa = limparEmpresa(f.empresa);
  if (f.modo === "van") {
    if (!empresa) erros.empresa = "Nome da empresa é obrigatório";
    else if (empresa.length > EMPRESA_MAX) erros.empresa = `Até ${EMPRESA_MAX} caracteres.`;
  }
  const centavos = centavosDoTexto(f.valor);
  if (!f.valor.trim()) erros.valor = f.modo === "carro" ? "Valor do carro é obrigatório" : f.modo === "van" ? "Valor da van é obrigatório" : "Valor é obrigatório";
  else if (centavos === null || centavos <= 0) erros.valor = "Informe um número maior que zero (ex.: 1.200,00)";
  if (Object.keys(erros).length > 0) return { ok: false, erros };

  const plano = planoDoValor(f, vagas)!;
  if (plano.receptoras.length === 0) {
    const outra = f.ida && f.volta ? "" : ` Marque a ${f.ida ? "volta" : "ida"}.`;
    return { ok: false, erros: { pernas: `${vagas.length === 1 ? "A vaga marcada não tem" : "Nenhuma das vagas marcadas tem"} o trecho escolhido.${outra}` } };
  }
  // R$ 0,05 dividido entre 8 vagas deixaria trechos com R$ 0,00.
  if (plano.partes.some((p) => p.valorCentavos <= 0)) {
    return { ok: false, erros: { valor: plano.dividir ? "O total dividido entre as vagas fica abaixo de R$ 0,01 por trecho." : "O valor dividido entre os trechos fica abaixo de R$ 0,01." } };
  }
  if (plano.partes.some((p) => p.valorCentavos > VALOR_MAXIMO_CENTAVOS)) return { ok: false, erros: { valor: "Valor alto demais — confira os centavos." } };
  const modo = f.modo as ModoDeRegistro;
  return {
    ok: true,
    itens: plano.partes.map((p) => ({ ...p, modo, empresa: modo === "van" ? empresa : null })),
    foraDoTrecho: plano.foraDoTrecho,
    agrupar: plano.dividir,
  };
}
