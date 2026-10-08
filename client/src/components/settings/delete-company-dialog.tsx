// Extraído de system-settings.tsx em 25/09 (modularização); redesenho 08/10.
//
// Confirmação de exclusão de empresa pagadora (padrão do app). Separado do
// card para que a página continue montando o AlertDialog fora do <form>.
//
// 08/10 — a empresa aparece num quadro (nome + CNPJ), o efeito é dito por
// extenso e o diálogo só fecha com a resposta do servidor (antes fechava no
// clique e uma falha aparecia solta, sem contexto) — como no Flash.
import type { PaymentCompany } from "@shared/schema";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface DeleteCompanyDialogProps {
  companyToDelete: PaymentCompany | null;
  setCompanyToDelete: (c: PaymentCompany | null) => void;
  onConfirm: (id: number) => void;
  /** Remoção em andamento: o diálogo fica aberto até o servidor responder. */
  removendo?: boolean;
}

export function DeleteCompanyDialog({ companyToDelete, setCompanyToDelete, onConfirm, removendo = false }: DeleteCompanyDialogProps) {
  return (
    <AlertDialog open={!!companyToDelete} onOpenChange={open => { if (!open && !removendo) setCompanyToDelete(null); }}>
      <AlertDialogContent className="rounded-xl max-w-[440px]" data-testid="cfg-empresa-excluir">
        <AlertDialogHeader>
          <AlertDialogTitle>Remover empresa pagadora?</AlertDialogTitle>
          <AlertDialogDescription>
            Ela deixa de aparecer como opção nas Notas fiscais. As notas já lançadas não mudam.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {companyToDelete && (
          <div className="rounded-lg border border-border bg-surface-muted/60 px-3.5 py-3">
            <p className="m-0 text-sm font-medium text-foreground">{companyToDelete.name}</p>
            <p className="m-0 mt-0.5 text-xs tabular-nums text-muted-foreground">CNPJ {companyToDelete.cnpj}</p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-lg" disabled={removendo}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-lg gap-1.5 bg-danger hover:bg-danger/90"
            disabled={removendo}
            onClick={e => { e.preventDefault(); if (companyToDelete) onConfirm(companyToDelete.id); }}
            data-testid="cfg-empresa-excluir-confirmar"
          >
            {removendo
              ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <Trash2 className="w-4 h-4" aria-hidden="true" />}
            {removendo ? "Removendo…" : "Remover empresa"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
