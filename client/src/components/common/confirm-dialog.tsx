/**
 * CONFIRMAÇÃO ÚNICA do Painel-LI (23/09) — sobre o AlertDialog do Radix.
 *
 * Substitui três moldes que conviviam: `common/confirm-modal` (Dialog comum,
 * "Voltar" em CAIXA ALTA e hex #2563EB), `scaling/confirm-dialog` (botões de
 * largura total, rounded-xl, 460px) e `scaling-validation/confirm-dialog`.
 * Um diálogo só, com o mesmo comportamento em toda tela:
 *
 *  - Esc e clique fora CANCELAM (a menos que uma mutação esteja rodando);
 *  - ordem fixa Cancelar → Confirmar;
 *  - `tone="danger"` = ação destrutiva: botão em `destructive` e foco inicial
 *    no Cancelar (Enter por reflexo não apaga nada); no tom padrão o foco vai
 *    para o Confirmar;
 *  - `pending` desabilita os dois botões e mostra spinner no Confirmar;
 *  - NÃO fecha sozinho ao confirmar — quem chama fecha ao terminar a mutação.
 */
import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type ConfirmTone = "default" | "danger";

export interface ConfirmDialogProps {
  open: boolean;
  /** Fechamento por Esc, clique fora ou Cancelar. Deve ser idempotente. */
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Uma ou duas frases sobre a consequência. Para vários parágrafos use `children`. */
  description?: ReactNode;
  /** Conteúdo entre a descrição e os botões (parágrafos, campo de motivo…). */
  children?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  tone?: ConfirmTone;
  /** Mutação em andamento: botões desabilitados + spinner no Confirmar. */
  pending?: boolean;
  /** Ex.: motivo obrigatório ainda vazio. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  /** Ação extra do Cancelar (o fechamento já é feito via onOpenChange). */
  onCancel?: () => void;
  /** Bloco de resumo (linhas "Evento · Colaborador…") em caixa neutra. */
  detalhes?: ReactNode;
  /** Ícone lucide ao lado do título, colorido pelo tom. */
  icon?: ComponentType<{ className?: string }>;
  testId?: string;
  confirmTestId?: string;
  /** Largura máxima (classe Tailwind). Padrão do AlertDialog: max-w-lg. */
  className?: string;
  /** Diálogo só informativo: sem botão de confirmar (o Cancelar fecha). Raro. */
  semConfirmar?: boolean;
}

export function ConfirmDialog({
  open, onOpenChange, title, description, children, confirmLabel, cancelLabel = "Cancelar",
  tone = "default", pending = false, confirmDisabled = false, onConfirm, onCancel, detalhes,
  icon: Icon, testId, confirmTestId, className, semConfirmar = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const danger = tone === "danger";

  const fechar = () => {
    if (pending) return;
    onCancel?.();
    onOpenChange(false);
  };

  // O AlertDialog do Radix bloqueia o clique fora por desenho (e nem expõe
  // `onPointerDownOutside`). Aqui o clique fora cancela, como o Esc — a pessoa
  // não fica presa num "tem certeza?". Conteúdo em portal (select, popover)
  // aberto por cima do diálogo não conta como "fora".
  useEffect(() => {
    if (!open) return;
    const aoClicar = (e: PointerEvent) => {
      const alvo = e.target as Node | null;
      const conteudo = contentRef.current;
      if (!conteudo || !alvo || conteudo.contains(alvo)) return;
      if (alvo instanceof Element && alvo.closest("[data-radix-popper-content-wrapper]")) return;
      fechar();
    };
    document.addEventListener("pointerdown", aoClicar, true);
    return () => document.removeEventListener("pointerdown", aoClicar, true);
    // `fechar` muda a cada render; o efeito só precisa reagir a abrir/fechar e a `pending`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pending]);

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) fechar(); else onOpenChange(true); }}>
      <AlertDialogContent
        ref={contentRef}
        className={cn("rounded-xl", className)}
        data-testid={testId}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (danger || semConfirmar ? cancelRef : confirmRef).current?.focus();
        }}
      >
        <AlertDialogHeader className="text-left">
          <div className={cn("flex items-start gap-3", !Icon && "block")}>
            {Icon && (
              <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", danger ? "bg-danger-soft text-danger" : "bg-brand-soft text-primary")}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
              <AlertDialogTitle className="text-base font-bold leading-tight text-foreground">{title}</AlertDialogTitle>
              {description !== undefined && (
                <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">{description}</AlertDialogDescription>
              )}
              {children && (
                // Sem `description`, o Radix exige um Description ou
                // aria-describedby: os parágrafos viram a descrição.
                description === undefined
                  ? <AlertDialogDescription asChild><div className="space-y-2 text-sm text-muted-foreground">{children}</div></AlertDialogDescription>
                  : <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
              )}
            </div>
          </div>
        </AlertDialogHeader>
        {detalhes && (
          <div className="rounded-lg border border-border bg-surface-muted p-3 text-xs text-foreground">{detalhes}</div>
        )}
        <AlertDialogFooter className="gap-2 sm:gap-2">
          {/* Sem onClick próprio: o Radix chama onOpenChange(false) → `fechar` → onCancel uma vez só. */}
          <AlertDialogCancel ref={cancelRef} disabled={pending} className="mt-0 rounded-lg">
            {cancelLabel}
          </AlertDialogCancel>
          {!semConfirmar && <AlertDialogAction
            ref={confirmRef}
            onClick={(e) => { e.preventDefault(); if (!pending && !confirmDisabled) onConfirm(); }}
            disabled={pending || confirmDisabled}
            aria-busy={pending || undefined}
            data-testid={confirmTestId}
            className={cn(
              "rounded-lg gap-2",
              danger
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary-hover",
            )}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </AlertDialogAction>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDialog;
