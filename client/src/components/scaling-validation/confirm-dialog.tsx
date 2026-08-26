import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  /**
   * Fechamento por Esc (e depois do Cancelar): limpe aqui o estado que abriu o
   * diálogo. Deve ser idempotente — o Cancelar também dispara este caminho.
   */
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** 1–2 parágrafos que explicam a consequência (use <p>). */
  children: React.ReactNode;
  cancelLabel?: string;
  /** Sem rótulo de confirmação o diálogo fica só informativo (raro). */
  confirmLabel?: React.ReactNode;
  /** true = ação destrutiva (botão em bg-destructive). */
  destructive?: boolean;
  /** Desabilita os botões enquanto a mutação roda (o chamador fecha ao terminar). */
  pending?: boolean;
  /** NÃO fecha sozinho — o chamador fecha (permite manter aberto durante a mutação). */
  onConfirm?: () => void;
  /** Ação extra do botão Cancelar (ex.: "Manter período e ignorar" cola assim mesmo). */
  onCancel?: () => void;
  confirmTestId?: string;
}

/**
 * Confirmação única da Sugestão de Escala: título + 1–2 parágrafos + cancelar/
 * confirmar. Cobre enviar, limpar, cancelar envio, remover linha, substituir
 * funções na colagem, dias fora do período e encolher o período — os textos
 * moram em quem chama; aqui só a moldura e o par de botões.
 */
export function ConfirmDialog({
  open, onOpenChange, title, children, cancelLabel, confirmLabel, destructive, pending, onConfirm, onCancel, confirmTestId,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} onClick={onCancel} className="rounded-lg">
            {cancelLabel ?? "Cancelar"}
          </AlertDialogCancel>
          {confirmLabel !== undefined && (
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); onConfirm?.(); }}
              disabled={pending}
              data-testid={confirmTestId}
              className={cn("rounded-lg", destructive ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary-hover")}
            >
              {confirmLabel}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDialog;
