/**
 * Liga um campo à sua mensagem de erro (24/09) nos formulários que usam
 * `useState` (sem react-hook-form): o campo recebe `aria-invalid` e
 * `aria-describedby` apontando para o `<p id=…>` da mensagem, e o leitor de
 * tela anuncia o erro junto com o rótulo.
 *
 *   <Input id="nf-oc" {...campoComErro("nf-oc", erros.oc)} />
 *   <MensagemDeErro id="nf-oc" erro={erros.oc} />
 */
export const idDoErro = (id: string) => `${id}-erro`;

export function campoComErro(id: string, erro?: string | null) {
  return {
    "aria-invalid": erro ? true : undefined,
    "aria-describedby": erro ? idDoErro(id) : undefined,
  } as const;
}

/** Foca o primeiro campo com erro (ordem do objeto = ordem visual do formulário). */
export function focarPrimeiroErro(erros: Record<string, string | undefined>, ids: Record<string, string>) {
  const chave = Object.keys(erros).find((k) => erros[k]);
  if (!chave) return;
  const el = document.getElementById(ids[chave] ?? chave);
  el?.focus();
}
