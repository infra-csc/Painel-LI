/**
 * Fornecedor de preços de passagem — adaptador TROCÁVEL (09/10).
 *
 * O resto do app só conhece esta interface e os tipos normalizados de
 * shared/busca-de-passagens.ts: trocar o Ignav por outro (SerpApi, Duffel…)
 * é escrever outra implementação. Regras para qualquer implementação:
 *  - nenhum dado pessoal sai daqui: só aeroportos, datas, filtros e 1 adulto;
 *  - a chave da API nunca é logada, nem a resposta inteira (só status/código);
 *  - erro do fornecedor vira `ErroDoFornecedor` com um código que a tela sabe
 *    explicar (limite do fornecedor, chave inválida, pedido recusado…).
 */
import type { ConsultaDePassagens, ResultadoDaConsulta } from "@shared/busca-de-passagens";

export interface LinkDeCompra {
  /** "LATAM", "Decolar"… */
  nome: string;
  url: string;
  /** "airline" quando é o site da própria companhia. */
  tipo: string | null;
  /** Link do voo exato (true) ou de uma página de resultados (false). */
  vooExato: boolean;
  precoCentavos: number | null;
}

export type CodigoDoErro =
  | "limite_do_fornecedor"   // 402/429: plano sem crédito ou limite de gasto do fornecedor
  | "chave_invalida"         // 401/403
  | "pedido_recusado"        // 400: o fornecedor não aceitou o pedido
  | "indisponivel"           // 424/503/timeout/rede
  | "nao_encontrado"         // 404 de itinerário (link)
  | "falha";

export class ErroDoFornecedor extends Error {
  constructor(public codigo: CodigoDoErro, mensagem: string, public detalhe?: string) {
    super(mensagem);
    this.name = "ErroDoFornecedor";
  }
}

export interface FornecedorDePassagens {
  /** "ignav" | "simulado" — gravado no cache e no consumo. */
  readonly nome: string;
  /** Preços simulados (demo/testes): a tela avisa. */
  readonly simulado: boolean;
  buscar(consulta: ConsultaDePassagens): Promise<ResultadoDaConsulta>;
  linksDeCompra(itinerarioId: string): Promise<LinkDeCompra[]>;
}

/** Só http(s): o link vem de fora e vai parar num `window.open`. */
export function urlSegura(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
