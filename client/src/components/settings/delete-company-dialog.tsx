// Extraído de system-settings.tsx em 25/09 (modularização): confirmação de
// exclusão de empresa pagadora (padrão do app). Separado do card para que a
// página continue montando o AlertDialog fora do <form> de tarifas.
import type { PaymentCompany } from "@shared/schema";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface DeleteCompanyDialogProps {
  companyToDelete: PaymentCompany | null;
  setCompanyToDelete: (c: PaymentCompany | null) => void;
  onConfirm: (id: number) => void;
}

export function DeleteCompanyDialog({ companyToDelete, setCompanyToDelete, onConfirm }: DeleteCompanyDialogProps) {
  return (
    <AlertDialog open={!!companyToDelete} onOpenChange={open => { if (!open) setCompanyToDelete(null); }}>
      <AlertDialogContent className="rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Remover empresa pagadora?</AlertDialogTitle>
          <AlertDialogDescription>
            {companyToDelete && (
              <>
                A empresa <span className="font-semibold">{companyToDelete.name}</span> (CNPJ {companyToDelete.cnpj}) deixará de aparecer como opção nas Notas Fiscais.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-lg">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-lg bg-danger hover:bg-danger/90"
            onClick={() => { if (companyToDelete) onConfirm(companyToDelete.id); setCompanyToDelete(null); }}
          >
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
