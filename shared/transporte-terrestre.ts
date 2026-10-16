/**
 * TRANSPORTE TERRESTRE DA VAGA (16/10 — print do dono, "Blue Run - Campinas"):
 * "aqui ter a opção de colocar vai de carro ou van. Van precisa informar o
 * nome da empresa e o valor; carro, só o valor do carro."
 *
 * Um registro por vaga e por PERNA (ida / volta), em `transportes_terrestres`.
 * A passagem (`tickets`) continua sendo o bilhete comprado; o terrestre diz
 * que aquela perna NÃO precisa de passagem porque a pessoa vai de carro, de
 * van ou de ônibus fretado — com quanto custa. Ônibus entra como a van
 * (empresa + valor): o domínio de modo da vaga (`transportModeIda/Volta`) já
 * tem "onibus".
 *
 * O valor é só REGISTRADO e mostrado: o Planejado e o Realizado não têm campo
 * de custo de transporte (a passagem aérea também não entra neles) — ligar
 * isto ao custo é decisão do dono.
 *
 * Regra única, sem React nem banco: a rota valida com ela, a tela de Passagens
 * decide "Comprar / resolvida" com ela e a Busca de passagens a usa para não
 * buscar voo de perna terrestre.
 */

export const MODOS_TERRESTRES = ["carro", "van", "onibus"] as const;
export type ModoTerrestre = (typeof MODOS_TERRESTRES)[number];

export const PERNAS = ["ida", "volta"] as const;
export type PernaDaViagem = (typeof PERNAS)[number];

export const NOME_DO_MODO: Record<ModoTerrestre, string> = { carro: "Carro", van: "Van", onibus: "Ônibus" };
export const NOME_DA_PERNA: Record<PernaDaViagem, string> = { ida: "Ida", volta: "Volta" };

/** R$ 100 mil: acima disto é erro de digitação (centavos a mais), não transporte. */
export const VALOR_MAXIMO_CENTAVOS = 10_000_000;
export const EMPRESA_MAX = 120;

export const ehModoTerrestre = (v: unknown): v is ModoTerrestre =>
  typeof v === "string" && (MODOS_TERRESTRES as readonly string[]).includes(v);
export const ehPerna = (v: unknown): v is PernaDaViagem => v === "ida" || v === "volta";

/** Van e ônibus têm empresa; carro, só o valor (dono, 16/10). */
export const modoPedeEmpresa = (m: ModoTerrestre | "" | null | undefined): boolean => m === "van" || m === "onibus";

/** O que fica gravado por perna. */
export interface TrechoTerrestre {
  trecho: PernaDaViagem;
  modo: ModoTerrestre;
  empresa: string | null;
  valorCentavos: number;
}

export interface ItemTerrestre extends TrechoTerrestre { teamInclusionId: string }

export type CampoDoTrecho = "trecho" | "modo" | "empresa" | "valorCentavos";

/**
 * Confere um trecho vindo da rede. Carro descarta a empresa (o formulário nem
 * mostra o campo); van e ônibus exigem. Valor obrigatório, inteiro, > 0.
 */
export function validarTrechoTerrestre(
  entrada: unknown,
): { ok: true; valor: TrechoTerrestre } | { ok: false; erros: Partial<Record<CampoDoTrecho, string>> } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const erros: Partial<Record<CampoDoTrecho, string>> = {};
  if (!ehPerna(e.trecho)) erros.trecho = "Escolha a ida ou a volta.";
  if (!ehModoTerrestre(e.modo)) erros.modo = "Escolha carro, van ou ônibus.";
  const empresa = typeof e.empresa === "string" ? e.empresa.replace(/\s+/g, " ").trim() : "";
  if (ehModoTerrestre(e.modo) && modoPedeEmpresa(e.modo)) {
    if (!empresa) erros.empresa = `Informe o nome da empresa da ${e.modo === "van" ? "van" : "viagem de ônibus"}.`;
    else if (empresa.length > EMPRESA_MAX) erros.empresa = `O nome da empresa passa de ${EMPRESA_MAX} caracteres.`;
  }
  const v = e.valorCentavos;
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) erros.valorCentavos = "Informe o valor (maior que zero).";
  else if (v > VALOR_MAXIMO_CENTAVOS) erros.valorCentavos = "Valor alto demais — confira os centavos.";
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  const modo = e.modo as ModoTerrestre;
  return {
    ok: true,
    valor: { trecho: e.trecho as PernaDaViagem, modo, empresa: modoPedeEmpresa(modo) ? empresa : null, valorCentavos: v as number },
  };
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
 * Validação de Escala manda; sem ele, o texto do horário sugerido.
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

/** Rótulo curto da situação: "Vai de van", "Vai de carro", "Vai de ônibus" ou "Terrestre" (modos diferentes). */
export function rotuloDaCobertura(c: CoberturaTerrestre): string {
  const modos = Array.from(new Set(Object.values(c.porPerna).map((r) => r!.modo)));
  if (modos.length !== 1) return "Terrestre";
  return `Vai de ${NOME_DO_MODO[modos[0]].toLowerCase()}`;
}

// ── Formulário (modal da vaga e lote) ─────────────────────────────────────

export interface FormularioTerrestre {
  ida: boolean;
  volta: boolean;
  modo: ModoTerrestre | "";
  empresa: string;
  valor: string;
  /** Volta com o mesmo modo, empresa e valor da ida (padrão). */
  voltaIgual: boolean;
  modoVolta: ModoTerrestre | "";
  empresaVolta: string;
  valorVolta: string;
  /** Lote: "cada" = o valor digitado vale para cada vaga; "dividir" = é o total, dividido entre as vagas. */
  divisao: "cada" | "dividir";
}

export const FORMULARIO_TERRESTRE_VAZIO: FormularioTerrestre = {
  ida: true, volta: true, modo: "", empresa: "", valor: "",
  voltaIgual: true, modoVolta: "", empresaVolta: "", valorVolta: "", divisao: "cada",
};

export type CampoDoFormulario = "pernas" | "modo" | "empresa" | "valor" | "modoVolta" | "empresaVolta" | "valorVolta";

/** Centavos → "1.200,00" (o que o campo mostra ao editar). */
export const textoDoValor = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** O formulário a partir do que já está gravado na vaga (editar). */
export function formularioDosRegistros(
  registros: readonly TrechoTerrestre[],
  pernas: readonly PernaDaViagem[],
  sugestao: Partial<Record<PernaDaViagem, ModoTerrestre>> = {},
): FormularioTerrestre {
  const ida = registros.find((r) => r.trecho === "ida");
  const volta = registros.find((r) => r.trecho === "volta");
  if (!ida && !volta) {
    const modo = sugestao.ida ?? sugestao.volta ?? "";
    const modoVolta = sugestao.volta ?? modo;
    return {
      ...FORMULARIO_TERRESTRE_VAZIO,
      ida: pernas.includes("ida"), volta: pernas.includes("volta"),
      modo, modoVolta, voltaIgual: !sugestao.ida || !sugestao.volta || sugestao.ida === sugestao.volta,
    };
  }
  const base = ida ?? volta!;
  const igual = !!ida && !!volta && ida.modo === volta.modo && (ida.empresa ?? "") === (volta.empresa ?? "") && ida.valorCentavos === volta.valorCentavos;
  return {
    ida: !!ida, volta: !!volta,
    modo: base.modo, empresa: base.empresa ?? "", valor: textoDoValor(base.valorCentavos),
    voltaIgual: igual || !ida || !volta,
    modoVolta: volta?.modo ?? base.modo, empresaVolta: volta?.empresa ?? "", valorVolta: volta ? textoDoValor(volta.valorCentavos) : "",
    divisao: "cada",
  };
}

/**
 * Formulário → itens a gravar (um por vaga e perna), ou os erros por campo.
 * `vagaIds` com mais de uma vaga é o lote: com "dividir", o valor digitado é
 * o TOTAL da perna, repartido entre as vagas (a van de R$ 1.200 que leva 8).
 * Quando ida e volta são iguais (`voltaIgual`), a volta copia a ida — o valor
 * é sempre POR PERNA (a tela diz isso e mostra o total).
 */
export function itensDoFormulario(
  f: FormularioTerrestre,
  vagaIds: readonly string[],
): { ok: true; itens: ItemTerrestre[] } | { ok: false; erros: Partial<Record<CampoDoFormulario, string>> } {
  const erros: Partial<Record<CampoDoFormulario, string>> = {};
  if (!f.ida && !f.volta) erros.pernas = "Marque a ida, a volta ou as duas.";
  const lerPerna = (modo: ModoTerrestre | "", empresa: string, valor: string, campos: { modo: CampoDoFormulario; empresa: CampoDoFormulario; valor: CampoDoFormulario }) => {
    if (!modo) erros[campos.modo] = "Escolha carro, van ou ônibus.";
    const emp = empresa.replace(/\s+/g, " ").trim();
    if (modo && modoPedeEmpresa(modo)) {
      if (!emp) erros[campos.empresa] = "Nome da empresa é obrigatório";
      else if (emp.length > EMPRESA_MAX) erros[campos.empresa] = `Até ${EMPRESA_MAX} caracteres.`;
    }
    const centavos = centavosDoTexto(valor);
    if (!valor.trim()) erros[campos.valor] = modo === "carro" ? "Valor do carro é obrigatório" : "Valor é obrigatório";
    else if (centavos === null || centavos <= 0) erros[campos.valor] = "Informe um número maior que zero (ex.: 1.200,00)";
    else if (centavos > VALOR_MAXIMO_CENTAVOS * Math.max(1, f.divisao === "dividir" ? vagaIds.length : 1)) erros[campos.valor] = "Valor alto demais — confira os centavos.";
    return { modo, empresa: modo && modoPedeEmpresa(modo) ? emp : null, centavos: centavos ?? 0 };
  };
  // O bloco principal é a ida — ou a volta, quando só ela está marcada.
  const ida = lerPerna(f.modo, f.empresa, f.valor, { modo: "modo", empresa: "empresa", valor: "valor" });
  const volta = f.voltaIgual || !f.ida
    ? ida
    : lerPerna(f.modoVolta, f.empresaVolta, f.valorVolta, { modo: "modoVolta", empresa: "empresaVolta", valor: "valorVolta" });
  if (Object.keys(erros).length > 0) return { ok: false, erros };

  const n = vagaIds.length;
  const partes = (centavos: number) => (f.divisao === "dividir" && n > 1 ? dividirCentavos(centavos, n) : Array.from({ length: n }, () => centavos));
  const itens: ItemTerrestre[] = [];
  const porPerna: Array<[PernaDaViagem, typeof ida]> = [];
  if (f.ida) porPerna.push(["ida", ida]);
  if (f.volta) porPerna.push(["volta", volta]);
  for (const [trecho, p] of porPerna) {
    const valores = partes(p.centavos);
    vagaIds.forEach((teamInclusionId, i) => {
      itens.push({ teamInclusionId, trecho, modo: p.modo as ModoTerrestre, empresa: p.empresa, valorCentavos: valores[i] });
    });
  }
  // Dividir R$ 0,05 entre 8 vagas deixaria vagas com R$ 0,00.
  if (itens.some((i) => i.valorCentavos <= 0)) return { ok: false, erros: { valor: "O total dividido entre as vagas fica abaixo de R$ 0,01." } };
  return { ok: true, itens };
}
