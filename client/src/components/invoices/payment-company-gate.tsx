// Extraído de invoices.tsx em 25/09 (modularização): tela-bloqueio "Confirme
// a empresa pagadora" que o RH/admin vê quando o evento ainda não tem CNPJ.
// O estado do formulário fica em `usePaymentCompanyForm`, chamado pela
// PÁGINA (não aqui): assim ele sobrevive quando o bloqueio some e volta ao
// trocar de evento — exatamente como antes da extração.
import { useState } from "react";
import { Building2 } from "lucide-react";
import type { PaymentCompany } from "@shared/schema";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function usePaymentCompanyForm() {
  // Company confirmation state (for the CNPJ blocking screen)
  // Vazio de propósito: o usuário deve escolher ativamente a empresa pagadora.
  const [confirmCompanyId, setConfirmCompanyId] = useState<string>("");
  const [confirmCustomName, setConfirmCustomName] = useState("");
  const [confirmCustomCnpj, setConfirmCustomCnpj] = useState("");
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  return {
    confirmCompanyId, setConfirmCompanyId,
    confirmCustomName, setConfirmCustomName,
    confirmCustomCnpj, setConfirmCustomCnpj,
    companyDialogOpen, setCompanyDialogOpen,
  };
}

export type PaymentCompanyForm = ReturnType<typeof usePaymentCompanyForm>;

export interface PaymentCompanyGateProps {
  paymentCompanies: PaymentCompany[];
  form: PaymentCompanyForm;
  mutation: {
    mutate: (v: { name: string; cnpj: string }) => void;
    isPending: boolean;
  };
}

// Definir a empresa pagadora é ação do RH/admin — só eles veem o formulário
export function PaymentCompanyGate({ paymentCompanies, form, mutation: setEventCompanyMutation }: PaymentCompanyGateProps) {
  const {
    confirmCompanyId, setConfirmCompanyId,
    confirmCustomName, setConfirmCustomName,
    confirmCustomCnpj, setConfirmCustomCnpj,
    companyDialogOpen, setCompanyDialogOpen,
  } = form;
  const pcs = paymentCompanies;
  const selectedPc = pcs.find(c => String(c.id) === confirmCompanyId);
  const isManual = confirmCompanyId === "__manual__" || pcs.length === 0;
  const canConfirm = isManual
    ? confirmCustomName.trim() && confirmCustomCnpj.trim()
    : !!selectedPc;
  const chosenName = isManual ? confirmCustomName.trim() : (selectedPc?.name || "");
  const chosenCnpj = isManual ? confirmCustomCnpj.trim() : (selectedPc?.cnpj || "");
  const handleConfirm = () => {
    if (!chosenName || !chosenCnpj) return;
    setCompanyDialogOpen(false);
    setEventCompanyMutation.mutate({ name: chosenName, cnpj: chosenCnpj });
  };
  return (
    <div className="bg-card rounded-xl border border-warning/25 p-8 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-warning-soft flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-warning-strong" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Confirme a empresa pagadora</p>
          <p className="text-xs text-muted-foreground mt-0.5">Necessária para emissão das notas fiscais</p>
        </div>
      </div>

      {/* Company selector */}
      <div className="space-y-3">
        {pcs.length > 0 && (
          <div>
            <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Empresa cadastrada
            </label>
            <select
              value={confirmCompanyId}
              onChange={e => setConfirmCompanyId(e.target.value)}
              className="w-full h-9 rounded-lg border border-border px-3 text-sm text-slate-700 bg-card focus:outline-none focus:ring-2 focus:ring-warning/50 focus:border-warning-strong"
            >
              <option value="" disabled>Selecione a empresa pagadora…</option>
              {pcs.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.cnpj}
                </option>
              ))}
              <option value="__manual__">Inserir manualmente…</option>
            </select>
          </div>
        )}

        {/* Manual entry (when no companies registered or "manual" selected) */}
        {(isManual || pcs.length === 0) && (
          <div className="space-y-2 pt-1">
            <div>
              <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                Nome da empresa
              </label>
              <input
                type="text"
                value={confirmCustomName}
                onChange={e => setConfirmCustomName(e.target.value)}
                placeholder="Ex.: Produtora XYZ Ltda"
                className="w-full h-9 rounded-lg border border-border px-3 text-sm text-slate-700 bg-card focus:outline-none focus:ring-2 focus:ring-warning/50 focus:border-warning-strong"
              />
            </div>
            <div>
              <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                CNPJ
              </label>
              <input
                type="text"
                value={confirmCustomCnpj}
                onChange={e => setConfirmCustomCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="w-full h-9 rounded-lg border border-border px-3 text-sm text-slate-700 bg-card focus:outline-none focus:ring-2 focus:ring-warning/50 focus:border-warning-strong"
              />
            </div>
          </div>
        )}

        {/* Preview when company selected from list */}
        {!isManual && selectedPc && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning-soft border border-warning/25">
            <Building2 className="w-3.5 h-3.5 text-warning-strong shrink-0" aria-hidden="true" />
            <span className="text-xs text-warning font-medium">{selectedPc.name}</span>
            <span className="text-xs text-warning-strong ml-auto">{selectedPc.cnpj}</span>
          </div>
        )}

        <button
          disabled={!canConfirm || setEventCompanyMutation.isPending}
          onClick={() => setCompanyDialogOpen(true)}
          className="w-full h-10 rounded-xl bg-warning-strong hover:bg-warning/90 disabled:opacity-40 text-white text-sm font-semibold transition-colors mt-1"
        >
          {setEventCompanyMutation.isPending ? 'Salvando…' : 'Confirmar e Continuar'}
        </button>

        <AlertDialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar empresa pagadora</AlertDialogTitle>
              <AlertDialogDescription>
                Definir {chosenName || "esta empresa"}{chosenCnpj ? ` (CNPJ ${chosenCnpj})` : ""} como
                pagadora deste evento? Essa escolha vale para todas as NFs.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm}>Definir empresa</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
