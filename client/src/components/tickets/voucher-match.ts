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
