// Extraído de system-settings.tsx em 25/09 (modularização); redesenho 08/10.
//
// "Empresas pagadoras" (lista + formulário de nova empresa). O diálogo de
// confirmação de exclusão fica em delete-company-dialog.tsx, renderizado pela
// página FORA do <form> — como era antes.
//
// 08/10 — diz que salva NA HORA (não passa pela barra de alterações), lista
// com o CNPJ alinhado, remover sempre visível (só para admin, como o
// servidor), formulário em linha com o botão principal no tom da tela e
// estado vazio com saída.
import type { User, PaymentCompany } from "@shared/schema";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CnpjInput, validateCnpj } from "@/components/ui/cnpj-input";
import { isAdmin } from "@/lib/role-utils";
import { DataTable, type ColunaDaTabela } from "@/components/common/data-table";
import { GrupoDeAjustes } from "./settings-fields";
import { ancoraDaSecao } from "./settings-secoes";
import type { PaymentCompaniesState } from "./use-payment-companies";

const COLUNAS_DE_EMPRESAS: ColunaDaTabela<PaymentCompany>[] = [
  {
    key: "empresa", header: "Empresa", papel: "principal",
    cell: c => (
      <div className="min-w-0">
        <p className="m-0 text-sm font-medium text-foreground truncate">{c.name}</p>
        <p className="m-0 mt-0.5 text-xs tabular-nums text-muted-foreground">CNPJ {c.cnpj}</p>
      </div>
    ),
  },
];

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
  const fechar = () => { setShowAddCompany(false); setNewCompanyName(""); setNewCompanyCnpj(""); };
  const cnpjPreenchido = newCompanyCnpj.replace(/\D/g, "").length === 14;
  const cnpjInvalido = cnpjPreenchido && !validateCnpj(newCompanyCnpj);
  const podeCadastrar = !!newCompanyName.trim() && validateCnpj(newCompanyCnpj) && !createCompanyMutation.isPending;
  const admin = isAdmin(user);

  return (
    <GrupoDeAjustes
      id={ancoraDaSecao("empresas")}
      titulo="Empresas pagadoras"
      descricao="Aparecem como opção nas Notas fiscais. Cadastrar e remover salvam na hora — não passam pela barra de alterações."
      data-testid="cfg-empresas"
      extra={!showAddCompany && paymentCompanies.length > 0 ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowAddCompany(true)} className="pas-alvo h-8 rounded-lg gap-1.5 text-xs font-medium" data-testid="cfg-empresa-adicionar">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />Adicionar empresa
        </Button>
      ) : undefined}
    >
      <div className="px-5 py-4 flex flex-col gap-3 max-sm:px-4">
        {paymentCompanies.length === 0 && !showAddCompany ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-8 text-center" data-testid="cfg-empresas-vazio">
            <p className="m-0 text-sm font-medium text-foreground">Nenhuma empresa pagadora cadastrada</p>
            <p className="m-0 mt-1 text-xs text-muted-foreground">Sem empresa, a nota fiscal fica sem quem paga.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddCompany(true)} className="mt-3 h-8 rounded-lg gap-1.5 text-xs font-medium">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />Adicionar empresa
            </Button>
          </div>
        ) : paymentCompanies.length > 0 ? (
          /* Lista sobre o DataTable com o cabeçalho só para leitores de tela. */
          <div className="overflow-hidden rounded-lg border border-border">
            <DataTable
              columns={COLUNAS_DE_EMPRESAS}
              rows={paymentCompanies}
              getRowId={c => String(c.id)}
              caption="Empresas pagadoras cadastradas"
              hideHeader
              cardMode="never"
              rowClassName={() => "bg-card hover:bg-surface-muted/60 transition-colors"}
              /* O DELETE do servidor exige admin — para os demais papéis
                 o botão nem aparece (antes: clique → 403 silencioso) */
              rowActions={admin ? c => (
                <button
                  type="button"
                  onClick={() => setCompanyToDelete(c)}
                  disabled={deleteCompanyMutation.isPending}
                  className="pas-alvo inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  aria-label={`Remover empresa ${c.name}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              ) : undefined}
              rowActionsLabel="Remover"
            />
          </div>
        ) : null}
        {!admin && paymentCompanies.length > 0 && (
          <p className="m-0 text-2xs text-muted-foreground">Só administradores removem empresas.</p>
        )}

        {/* Formulário em linha */}
        {showAddCompany ? (
          <div className="pas-entra rounded-lg border border-border bg-surface-muted/50 p-4" data-testid="cfg-empresa-form">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="m-0 text-sm font-medium text-foreground">Nova empresa pagadora</p>
              <button type="button" aria-label="Fechar formulário de nova empresa" onClick={fechar} className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            {/* Enter aqui não deve submeter o formulário de tarifas da página */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}>
              <div className="min-w-0">
                <label htmlFor="new-company-name" className="cfg-rotulo">Nome da empresa</label>
                <Input
                  id="new-company-name"
                  value={newCompanyName}
                  onChange={e => setNewCompanyName(e.target.value)}
                  placeholder="Ex.: Produtora Norte Ltda"
                  className="h-10 rounded-lg border-border bg-card text-sm"
                  autoFocus
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="new-company-cnpj" className="cfg-rotulo">CNPJ</label>
                <CnpjInput id="new-company-cnpj" value={newCompanyCnpj} onChange={setNewCompanyCnpj} name="newCompanyCnpj" />
                {cnpjInvalido && <p className="cfg-apoio text-danger" role="alert">CNPJ inválido — confira os dígitos.</p>}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={fechar} className="h-9 rounded-lg text-sm">Cancelar</Button>
              <Button
                type="button"
                size="sm"
                disabled={!podeCadastrar}
                onClick={() => createCompanyMutation.mutate({ name: newCompanyName.trim(), cnpj: newCompanyCnpj })}
                className="h-9 rounded-lg gap-1.5 px-4 text-sm"
                data-testid="cfg-empresa-cadastrar"
              >
                {createCompanyMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  : <Plus className="w-4 h-4" aria-hidden="true" />}
                {createCompanyMutation.isPending ? "Cadastrando…" : "Cadastrar empresa"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </GrupoDeAjustes>
  );
}
