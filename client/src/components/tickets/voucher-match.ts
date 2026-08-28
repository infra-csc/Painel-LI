/**
 * Casar o passageiro lido no voucher com a vaga que vai receber a passagem
 * (28/08). Fica fora do componente para poder ser testado sozinho: gravar
 * passagem na vaga errada é caro de desfazer, então a regra aqui é
 * deliberadamente conservadora — na dúvida, não escolhe ninguém e a tela pede
 * que o operador aponte a vaga.
 */

/** Compara nomes ignorando acento, caixa e espaços repetidos. */
export const chaveNome = (n: string): string =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Primeiro + último nome — o voucher às vezes encurta os nomes do meio. */
const pontas = (s: string): string => {
  const p = chaveNome(s).split(" ").filter(Boolean);
  return p.length >= 2 ? `${p[0]} ${p[p.length - 1]}` : p[0] ?? "";
};

/** "da", "de", "dos"… não ajudam a identificar ninguém. */
const PREPOSICOES = new Set(["da", "de", "do", "das", "dos", "e"]);

export const tokensNome = (s: string): string[] =>
  chaveNome(s).split(" ").filter((t) => t && !PREPOSICOES.has(t));

/**
 * Quanto dois nomes se parecem, de 0 a 1 (proporção de nomes em comum).
 * Serve para ORDENAR a lista de vagas — não para escolher sozinho: quem casa
 * automaticamente continua sendo `casarVaga`, que é bem mais rigoroso.
 */
export function pontuarSemelhanca(pessoa: string, nome: string): number {
  const a = tokensNome(pessoa);
  const b = new Set(tokensNome(nome));
  if (a.length === 0 || b.size === 0) return 0;
  const comuns = a.filter((t) => b.has(t)).length;
  return comuns / Math.max(a.length, b.size);
}

export interface VagaOrdenada<T extends { nome: string }> { vaga: T; score: number }

/** Vagas ordenadas da mais parecida para a menos parecida com o passageiro. */
export function ordenarPorSemelhanca<T extends { nome: string }>(
  pessoa: string | undefined,
  vagas: T[],
): VagaOrdenada<T>[] {
  if (!pessoa) return vagas.map((vaga) => ({ vaga, score: 0 }));
  return vagas
    .map((vaga) => ({ vaga, score: pontuarSemelhanca(pessoa, vaga.nome) }))
    .sort((x, y) => y.score - x.score);
}

export function casarVaga(
  pessoa: string | undefined,
  vagas: { id: string; nome: string }[],
): string | null {
  if (!pessoa) return null;
  const alvo = chaveNome(pessoa);

  const exatas = vagas.filter((v) => chaveNome(v.nome) === alvo);
  if (exatas.length === 1) return exatas[0].id;
  if (exatas.length > 1) return null; // homônimos: quem decide é o operador

  const alvoPontas = pontas(pessoa);
  const parciais = vagas.filter((v) => pontas(v.nome) === alvoPontas);
  return parciais.length === 1 ? parciais[0].id : null;
}
