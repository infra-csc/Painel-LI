/**
 * Por qual canal cada reserva de hotel foi feita e como foi paga (04/11, dono:
 * "preciso saber quais fornecedores estou utilizando e as formas de pagamento").
 *
 * A reserva é o QUARTO do evento: no mesmo hotel e evento, parte pode sair direto
 * com o hotel e parte por agência. A forma de pagamento depende do fornecedor:
 * agência é sempre faturado; Airbnb e Hoteis.com, cartão; direto com o hotel,
 * PIX ou faturado (a pessoa escolhe). Regra só aqui: tela, servidor e PDF leem daqui.
 */
export const FORNECEDORES_DE_HOTEL = [
  { id: "flytour", rotulo: "Flytour", tipo: "agencia" },
  { id: "lca", rotulo: "LCA", tipo: "agencia" },
  { id: "onfly", rotulo: "Onfly", tipo: "agencia" },
  { id: "hoteis_com", rotulo: "Hoteis.com", tipo: "site" },
  { id: "airbnb", rotulo: "Airbnb", tipo: "site" },
  { id: "direto", rotulo: "Direto com o hotel", tipo: "direto" },
] as const;

export type FornecedorDeHotel = (typeof FORNECEDORES_DE_HOTEL)[number]["id"];
export type FormaDePagamentoDeHotel = "cartao" | "pix" | "faturado";

const ROTULO_DA_FORMA: Record<FormaDePagamentoDeHotel, string> = { cartao: "Cartão de crédito", pix: "PIX", faturado: "Faturado" };

const dadosDo = (f: string | null | undefined) => FORNECEDORES_DE_HOTEL.find((x) => x.id === f);
export const ehFornecedorDeHotel = (f: unknown): f is FornecedorDeHotel => typeof f === "string" && !!dadosDo(f);
export const rotuloDoFornecedor = (f: string | null | undefined): string | null => dadosDo(f)?.rotulo ?? null;
export const rotuloDaForma = (f: string | null | undefined): string | null => ROTULO_DA_FORMA[f as FormaDePagamentoDeHotel] ?? null;

/** Formas aceitas pelo fornecedor. Com uma só, ela vale sozinha; ninguém precisa escolher. */
export function formasDoFornecedor(f: FornecedorDeHotel): FormaDePagamentoDeHotel[] {
  const tipo = dadosDo(f)?.tipo;
  if (tipo === "agencia") return ["faturado"];
  if (tipo === "site") return ["cartao"];
  return ["pix", "faturado"];
}

export type CanalDaReserva = { fornecedor: FornecedorDeHotel | null; formaPagamento: FormaDePagamentoDeHotel | null };

/**
 * O que gravar a partir do que chegou. Forma fixa entra sozinha; forma que o
 * fornecedor não aceita é recusada; sem fornecedor, os dois ficam vazios.
 */
export function canalDaReserva(fornecedor: unknown, formaPagamento: unknown): { ok: true; canal: CanalDaReserva } | { ok: false; message: string } {
  if (fornecedor === null || fornecedor === undefined || fornecedor === "") {
    if (formaPagamento) return { ok: false, message: "Escolha o fornecedor antes da forma de pagamento." };
    return { ok: true, canal: { fornecedor: null, formaPagamento: null } };
  }
  if (!ehFornecedorDeHotel(fornecedor)) return { ok: false, message: "Fornecedor desconhecido." };
  const formas = formasDoFornecedor(fornecedor);
  if (formas.length === 1) return { ok: true, canal: { fornecedor, formaPagamento: formas[0] } };
  if (formaPagamento === null || formaPagamento === undefined || formaPagamento === "") return { ok: true, canal: { fornecedor, formaPagamento: null } };
  if (!formas.includes(formaPagamento as FormaDePagamentoDeHotel)) return { ok: false, message: `${rotuloDoFornecedor(fornecedor)} não aceita essa forma de pagamento.` };
  return { ok: true, canal: { fornecedor, formaPagamento: formaPagamento as FormaDePagamentoDeHotel } };
}

/** "Flytour · Faturado"; direto sem forma escolhida avisa; sem fornecedor, diz isso. */
export function textoDoCanal(fornecedor: string | null | undefined, formaPagamento: string | null | undefined): string {
  const nome = rotuloDoFornecedor(fornecedor);
  if (!nome) return "Sem fornecedor";
  return `${nome} · ${rotuloDaForma(formaPagamento) ?? "pagamento a definir"}`;
}

export interface QuartoDoResumoDeFornecedores {
  fornecedor?: string | null;
  formaPagamento?: string | null;
  hospedes: number;
  valorCentavos?: number | null;
}

export interface LinhaDoResumoDeFornecedores {
  /** Identifica a linha (é o que o filtro da tela guarda). */
  chave: string;
  fornecedor: FornecedorDeHotel | null;
  formaPagamento: FormaDePagamentoDeHotel | null;
  quartos: number;
  hospedes: number;
  /** Soma dos quartos com valor; `null` quando nenhum tem. */
  valorCentavos: number | null;
}

export const chaveDoCanal = (fornecedor: string | null | undefined, formaPagamento: string | null | undefined): string =>
  ehFornecedorDeHotel(fornecedor) ? `${fornecedor}|${rotuloDaForma(formaPagamento) ? formaPagamento : ""}` : "sem";

/** Quartos, pessoas e valor por fornecedor e forma, na ordem da lista; "sem fornecedor" por último. */
export function resumoDosFornecedores(quartos: readonly QuartoDoResumoDeFornecedores[]): LinhaDoResumoDeFornecedores[] {
  const porChave = new Map<string, LinhaDoResumoDeFornecedores>();
  for (const q of quartos) {
    const chave = chaveDoCanal(q.fornecedor, q.formaPagamento);
    const f = ehFornecedorDeHotel(q.fornecedor) ? q.fornecedor : null;
    const atual = porChave.get(chave) ?? {
      chave, fornecedor: f, formaPagamento: f && rotuloDaForma(q.formaPagamento) ? (q.formaPagamento as FormaDePagamentoDeHotel) : null, quartos: 0, hospedes: 0, valorCentavos: null,
    };
    atual.quartos += 1;
    atual.hospedes += q.hospedes;
    if (typeof q.valorCentavos === "number") atual.valorCentavos = (atual.valorCentavos ?? 0) + q.valorCentavos;
    porChave.set(chave, atual);
  }
  const ordem = (l: LinhaDoResumoDeFornecedores) => (l.fornecedor ? FORNECEDORES_DE_HOTEL.findIndex((x) => x.id === l.fornecedor) : FORNECEDORES_DE_HOTEL.length);
  return Array.from(porChave.values()).sort((a, b) => ordem(a) - ordem(b) || String(a.formaPagamento).localeCompare(String(b.formaPagamento)));
}
