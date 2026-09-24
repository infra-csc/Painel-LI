/**
 * Marca de campo obrigatório — um padrão só para todos os formulários (23/09).
 *
 * Antes cada modal tinha o seu `<span> *</span>` (vermelho-400, destructive,
 * com ou sem espaço) e o asterisco era lido em voz alta como "asterisco". Aqui
 * o sinal visual fica `aria-hidden` e o leitor de tela recebe "(obrigatório)".
 * Combine com `aria-required` no campo quando o `Input` não vier de um
 * `FormControl` que já o marque.
 */
export function RequiredMark() {
  return (
    <>
      <span className="text-danger font-bold normal-case tracking-normal" aria-hidden="true"> *</span>
      <span className="sr-only"> (obrigatório)</span>
    </>
  );
}

/** Complemento "(opcional)" com o mesmo peso visual em todos os formulários. */
export function OptionalMark() {
  return <span className="text-muted-foreground font-normal normal-case tracking-normal"> (opcional)</span>;
}

export default RequiredMark;
