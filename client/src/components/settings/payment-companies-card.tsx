// Extraído de system-settings.tsx em 25/09 (modularização): card "Empresas
// Pagadoras" (lista + formulário expansível de nova empresa). O diálogo de
// confirmação de exclusão fica em delete-company-dialog.tsx, renderizado pela
// página FORA do <form> — como era antes.
import type { User, PaymentCompany } from "@shared/schema";
import { Building2, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CnpjInput, validateCnpj } from "@/components/ui/cnpj-input";
import { isAdmin } from "@/lib/role-utils";
import type { PaymentCompaniesState } from "./use-payment-companies";

export interface PaymentCompaniesCardProps {
  user: User | null;
  paymentCompanies: PaymentCompany[];
  state: PaymentCompaniesState;
}

export function PaymentCompaniesCard({ user, paymentCompanies, state }: PaymentCompaniesCardProps) {
  const {
    showAddCompany, setShowAddCompany,
    newCompanyName, setNewCompanyName,
    newCompanyCnpj, setNewCompanyCnpj,
    setCompanyToDelete,
    createCompanyMutation, deleteCompanyMutation,
  } = state;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
      <div className="flex items-center justify-between gap-2.5 border-b border-border bg-surface-muted px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Building2 className="w-4 h-4 text-success" aria-hidden="true" />
          <span className="text-sm font-semibold text-slate-700">Empresas Pagadoras</span>
          <span className="text-xs text-muted-foreground font-normal">(usadas nas Notas Fiscais)</span>
        </div>
        {!showAddCompany && (
          <button
            type="button"
            onClick={() => setShowAddCompany(true)}
            className="flex items-center gap-1.5 rounded-lg border border-success/25 bg-success-soft px-3 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success-soft hover:text-success"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Adicionar empresa
          </button>
        )}
      </div>
      <div className="space-y-4 bg-card p-5">
        {paymentCompanies.length === 0 && !showAddCompany ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Nenhuma empresa cadastrada.</p>
        ) : paymentCompanies.length > 0 ? (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {paymentCompanies.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-card px-4 py-3 transition-colors hover:bg-surface-muted">
                <div>
                  <p className="text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{c.cnpj}</p>
                </div>
                {/* O DELETE do servidor exige admin — para os demais papéis
                    o botão nem aparece (antes: clique → 403 silencioso) */}
                {isAdmin(user) && (
                  <button
                    type="button"
                    onClick={() => setCompanyToDelete(c)}
                    disabled={deleteCompanyMutation.isPending}
                    className="rounded-lg p-1.5 text-danger-strong transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remover empresa ${c.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {/* Formulário expansível */}
        {showAddCompany ? (
          <div className="space-y-3 rounded-xl border border-dashed border-success/25 bg-success-soft/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-success">Nova empresa</p>
              <button type="button" aria-label="Fechar formulário de nova empresa" onClick={() => { setShowAddCompany(false); setNewCompanyName(""); setNewCompanyCnpj(""); }} className="text-muted-foreground hover:text-slate-600">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            {/* Enter aqui não deve submeter o formulário de tarifas da página */}
            <div className="grid grid-cols-2 gap-3" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}>
              <div>
                <label htmlFor="new-company-name" className="mb-1 block text-xs font-medium text-slate-600">Nome da empresa</label>
                <Input
                  id="new-company-name"
                  value={newCompanyName}
                  onChange={e => setNewCompanyName(e.target.value)}
                  placeholder="Ex.: Produtora Norte Ltda"
                  className="h-9 rounded-lg border-border text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="new-company-cnpj" className="mb-1 block text-xs font-medium text-slate-600">CNPJ</label>
                <CnpjInput id="new-company-cnpj" value={newCompanyCnpj} onChange={setNewCompanyCnpj} name="newCompanyCnpj" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                size="sm"
                disabled={!newCompanyName.trim() || !validateCnpj(newCompanyCnpj) || createCompanyMutation.isPending}
                onClick={() => createCompanyMutation.mutate({ name: newCompanyName.trim(), cnpj: newCompanyCnpj })}
                className="h-8 bg-success px-4 text-xs text-white hover:bg-success/90"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                Cadastrar empresa
              </Button>
              <button type="button" onClick={() => { setShowAddCompany(false); setNewCompanyName(""); setNewCompanyCnpj(""); }} className="text-xs text-muted-foreground hover:text-slate-600">
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
