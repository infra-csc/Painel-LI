import { idDoErro } from "@/lib/campo-com-erro";

/**
 * Mensagem de erro inline de um campo (par de `campoComErro`). Renderiza nada
 * quando não há erro; com erro, um `<p role="alert">` com o id que o campo
 * referencia em `aria-describedby`.
 */
export function MensagemDeErro({ id, erro, className = "" }: { id: string; erro?: string | null; className?: string }) {
  if (!erro) return null;
  return (
    <p id={idDoErro(id)} role="alert" className={`mt-1 text-2xs text-danger ${className}`}>
      {erro}
    </p>
  );
}

export default MensagemDeErro;
