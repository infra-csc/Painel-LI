/**
 * Peças de apresentação dos diálogos da Inclusão de equipe (07/10).
 *
 * A mesma régua do modal de Eventos (7c5076d3) e de Hospedagem: cabeçalho com
 * o ícone no quadrado da marca, título e o "de quem é"; corpo em seções com
 * borda sobre o fundo cinza claro; rodapé fixo com Cancelar e a ação. No
 * celular o diálogo ocupa a tela inteira. Só apresentação — nenhuma regra.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** Moldura: largura por diálogo, tela cheia no celular, cabeçalho/rodapé fixos. */
export const moldura = (largura: string) =>
  `p-0 gap-0 ${largura} rounded-xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[92vh] max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0`;
/** Rótulo do campo — o mesmo de Eventos/Passagens/Hospedagem. */
export const LABEL = "block mb-1.5 text-xs font-medium text-slate-600";
/** Campo nativo (select/date/text) com a altura e o foco do Input do sistema. */
export const CAMPO = "w-full h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] hover:border-slate-300 focus:border-primary focus:ring-[3px] focus:ring-primary/12 aria-[invalid=true]:border-danger";
/** Seção do corpo: cartão com borda e um título curto com ícone. */
export const SECAO = "rounded-xl border border-border bg-card p-4";

export function TituloDaSecao({ icone: Icone, children, extra, id }: { icone: LucideIcon; children: ReactNode; extra?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-3">
      <h3 id={id} className="m-0 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        <Icone className="w-3.5 h-3.5" aria-hidden="true" />{children}
      </h3>
      {extra}
    </div>
  );
}

/** Cabeçalho do diálogo. `descricao` vira o `aria-describedby`; `contexto` fica fora dele. */
export function CabecalhoDoDialogo({ icone: Icone, titulo, descricao, contexto, onFechar }: {
  icone: LucideIcon;
  titulo: ReactNode;
  descricao?: ReactNode;
  contexto?: ReactNode;
  onFechar: () => void;
}) {
  return (
    <div className="relative flex items-start gap-3.5 shrink-0 px-5 sm:px-6 pt-4 pb-3.5 pr-14 border-b border-border bg-card">
      <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-brand-soft text-primary shrink-0">
        <Icone className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <DialogTitle className="m-0 p-0 text-base font-semibold leading-6 text-foreground">{titulo}</DialogTitle>
        {descricao !== undefined ? (
          <DialogDescription className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">{descricao}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{titulo}</DialogDescription>
        )}
        {contexto}
      </div>
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar"
        className="pas-alvo absolute right-3 top-3 flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Rodapé fixo: à esquerda o que é informação, à direita Cancelar + ação. */
export function RodapeDoDialogo({ children, info }: { children: ReactNode; info?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0 px-5 sm:px-6 py-3 border-t border-border bg-surface-muted">
      {info && <div className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">{info}</div>}
      <div className="flex items-center gap-2 ml-auto">{children}</div>
    </div>
  );
}

/** Corpo rolável sobre o fundo cinza claro. */
export function CorpoDoDialogo({ children }: { children: ReactNode }) {
  return <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 bg-surface-muted/60">{children}</div>;
}
