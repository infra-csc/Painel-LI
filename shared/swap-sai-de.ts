/**
 * "Sai de" na troca de colaborador (dono, 14/09): quando a Escalação pede a
 * troca de um colaborador já confirmado, o pedido tem que dizer de onde o
 * NOVO colaborador sai — e, aprovada a troca, a vaga passa a sair dessa
 * cidade. Antes a aprovação trocava só o nome: a vaga continuava com a cidade
 * do colaborador antigo, e a passagem saía da origem errada.
 */

/** O mesmo texto que o modal da Escalação grava quando "Sai de SP" está marcado. */
export const SAI_DE_SP = "São Paulo - SP";

/** A cidade que vai para a vaga: SP marcado, ou o texto digitado. */
export function cidadeDeSaida(saiDeSP: boolean, cidade: string | null | undefined): string {
  return saiDeSP ? SAI_DE_SP : String(cidade ?? "").trim();
}

/** Mensagem de erro (pt-BR) ou null quando a cidade de saída serve. */
export function validarSaiDe(cidade: string | null | undefined): string | null {
  const c = String(cidade ?? "").trim();
  if (c.length < 2) return "Informe de onde o novo colaborador sai.";
  if (c.length > 120) return "Cidade de saída muito longa (até 120 caracteres).";
  return null;
}

/**
 * "Sai de" OPCIONAL (09/10 — dono: "na Sugestão ter a opção de colocar de onde
 * sai o colaborador"). Na Sugestão de escala e nos pedidos de inclusão/ajuste
 * a logística muitas vezes já sabe de onde a equipe sai (equipe local do Rio,
 * equipe que vem de BH); quando não sabe, fica em branco e a Escalação completa
 * por pessoa. Vazio vale; preenchido, a MESMA régua do "Sai de" obrigatório.
 */
export function validarSaiDeOpcional(cidade: string | null | undefined): string | null {
  const c = String(cidade ?? "").trim();
  if (!c) return null;
  if (c.length < 2) return "Cidade de saída muito curta — escreva o nome (ex.: Rio de Janeiro - RJ).";
  return validarSaiDe(c);
}
