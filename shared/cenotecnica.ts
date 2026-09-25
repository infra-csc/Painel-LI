/**
 * Cenotécnica — UMA definição só (25/09).
 *
 * Até aqui existiam duas listas de termos para decidir se uma função é de
 * cenotécnica, e elas já divergiam: `isCenotecnicaFunction` (alimentação)
 * casava "ceno" solto e EXCLUÍA "Sup Ceno"; `isCenotecnicaFunctionName`
 * (fluxo do gestor) casava "cenotécnica" e "sup ceno" mas NÃO "ceno" solto.
 * Uma função chamada "Ceno Local" ia para a alimentação de cenotécnica e
 * pulava a aprovação do gestor — sem ninguém ter decidido isso.
 *
 * Agora as duas leem a MESMA lista de termos (TERMOS_CENOTECNICA) e diferem
 * só no que fazer com o supervisor ("Sup Ceno"), via `incluiSupCeno`:
 *
 *   - fluxo do gestor (shared/scaling-rules.ts): `incluiSupCeno: true` — o
 *     supervisor também passa pela aprovação da Produção;
 *   - alimentação e diárias (shared/alimentacao.ts): `incluiSupCeno: false` —
 *     regra atual do dono: "Sup Ceno = produtor" (produção/ativação/kit/sup
 *     ceno), recebe diária normal e refeição de "demais", não a de cenotécnica.
 *
 * Virar isso configuração (Valores Padrão / system_settings) é decisão do
 * dono; até lá a regra mora aqui, num lugar só, e os dois wrappers antigos
 * continuam existindo para os call sites não mudarem.
 */

/** Termos que identificam uma função de cenotécnica (comparação sem caixa e sem acento). */
export const TERMOS_CENOTECNICA = ["cenotecnica", "ceno"] as const;

/** Termos que identificam o SUPERVISOR de cenotécnica ("Sup Ceno", "Supervisor de Cenotécnica"). */
export const TERMOS_SUPERVISOR = ["sup"] as const;

export interface OpcoesCenotecnica {
  /**
   * true  → "Sup Ceno" conta como cenotécnica (fluxo do gestor);
   * false → "Sup Ceno" fica de fora (alimentação: supervisor = produtor).
   */
  incluiSupCeno: boolean;
}

/** Minúsculas e sem acentos, para "Cenotécnica" e "cenotecnica" casarem o mesmo termo. */
export function normalizarNomeDeFuncao(nome: string | null | undefined): string {
  return (nome ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** O nome é de supervisor de cenotécnica ("sup" + termo de cenotécnica)? */
export function ehSupervisorDeCenotecnica(nome: string | null | undefined): boolean {
  const n = normalizarNomeDeFuncao(nome);
  if (!n) return false;
  const temCeno = TERMOS_CENOTECNICA.some((t) => n.includes(t));
  const temSup = TERMOS_SUPERVISOR.some((t) => n.includes(t));
  return temCeno && temSup;
}

/**
 * A função é de cenotécnica? Fonte única — os dois pontos do sistema que
 * precisam da resposta passam pela mesma lista de termos e só escolhem o que
 * fazer com o supervisor.
 */
export function ehCenotecnica(nome: string | null | undefined, opcoes: OpcoesCenotecnica): boolean {
  const n = normalizarNomeDeFuncao(nome);
  if (!n) return false;
  const temTermo = TERMOS_CENOTECNICA.some((t) => n.includes(t));
  if (!temTermo) return false;
  if (!opcoes.incluiSupCeno && ehSupervisorDeCenotecnica(n)) return false;
  return true;
}
