/**
 * Proteção contra descarte de formulário (23/09, code review — Fase 3).
 *
 * Por quê: vários modais com formulário (colaborador, evento, usuário, divisão
 * de vaga, edição do Planejado, NF, Flash) fechavam no Esc ou no clique fora e
 * chamavam `form.reset()` sem perguntar — a pessoa perdia o que digitou. Os que
 * já perguntavam (Passagens, Bagagem) tinham cada um o seu diálogo com texto
 * diferente. Este hook centraliza a decisão e o texto.
 *
 * Uso:
 *   const { pedirParaFechar, Dialogo } = useConfirmarDescarte(form.formState.isDirty);
 *   <Dialog open={open} onOpenChange={v => { if (!v) pedirParaFechar(fechar); }}>…</Dialog>
 *   {Dialogo}
 *
 * `pedirParaFechar(aoFechar)`: se não há alteração, fecha na hora; se há, abre
 * "Descartar alterações?" e só chama `aoFechar` no "Descartar".
 */
import { useCallback, useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { decidirFechamento, TEXTOS_DO_DESCARTE } from "@/lib/confirmar-descarte";

export { decidirFechamento, TEXTOS_DO_DESCARTE, type DecisaoDeFechamento } from "@/lib/confirmar-descarte";

export interface OpcoesDoDescarte {
  /** Enquanto salva, fechar é ignorado (padrão: `false`). */
  salvando?: boolean;
  /** Texto alternativo para a descrição (mantenha curto). */
  descricao?: string;
}

export function useConfirmarDescarte(sujo: boolean, opcoes?: OpcoesDoDescarte) {
  const [aberto, setAberto] = useState(false);
  const aoFecharRef = useRef<(() => void) | null>(null);
  const salvando = opcoes?.salvando ?? false;

  const pedirParaFechar = useCallback((aoFechar: () => void) => {
    const decisao = decidirFechamento(sujo, salvando);
    if (decisao === "ignorar") return;
    if (decisao === "fechar") { aoFechar(); return; }
    aoFecharRef.current = aoFechar;
    setAberto(true);
  }, [sujo, salvando]);

  const descartar = useCallback(() => {
    setAberto(false);
    const fn = aoFecharRef.current;
    aoFecharRef.current = null;
    fn?.();
  }, []);

  const Dialogo = (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogContent className="max-w-[420px] rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{TEXTOS_DO_DESCARTE.titulo}</AlertDialogTitle>
          <AlertDialogDescription>{opcoes?.descricao ?? TEXTOS_DO_DESCARTE.descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-keep-editing">{TEXTOS_DO_DESCARTE.continuar}</AlertDialogCancel>
          <AlertDialogAction
            onClick={descartar}
            className="bg-danger hover:bg-danger/90 text-white"
            data-testid="button-discard-form"
          >
            {TEXTOS_DO_DESCARTE.descartar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { pedirParaFechar, Dialogo, confirmando: aberto } as const;
}

export default useConfirmarDescarte;
