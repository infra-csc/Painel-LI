/**
 * VALORES PADRÃO (Configurações) — página de composição (25/09, modularização).
 *
 * Até 24/09 este arquivo tinha ~1.700 linhas: schema zod, formulário, 5
 * consultas, histórico local, empresas pagadoras, tabela por função e todos
 * os cards. Agora:
 *  - dados: `useSettingsForm` (consultas + react-hook-form + salvamento único +
 *    histórico + "Atualizar Planejado"), `usePaymentCompanies` (empresas);
 *  - apresentação: components/settings/** (SaveBar, AppliedValuesSection,
 *    PaymentCompaniesCard, LegacyValuesSection + FunctionValuesTable,
 *    SettingsFooter, DeleteCompanyDialog, SettingsHistory).
 * Nada de comportamento mudou — só o lugar onde cada pedaço vive.
 */
import { Calculator, ShieldAlert } from "lucide-react";
import { Form } from "@/components/ui/form";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { LoadingState } from "@/components/common/loading-state";
import { QueryError } from "@/components/common/query-state";
import { isRhOrAdmin } from "@/lib/role-utils";
import { useSettingsForm } from "@/components/settings/use-settings-form";
import { usePaymentCompanies } from "@/components/settings/use-payment-companies";
import { SaveBar } from "@/components/settings/save-bar";
import { AppliedValuesSection } from "@/components/settings/applied-values-section";
import { PaymentCompaniesCard } from "@/components/settings/payment-companies-card";
import { LegacyValuesSection } from "@/components/settings/legacy-values-section";
import { FunctionValuesTable } from "@/components/settings/function-values-table";
import { SettingsFooter } from "@/components/settings/settings-footer";
import { DeleteCompanyDialog } from "@/components/settings/delete-company-dialog";
import { SettingsHistory } from "@/components/settings/settings-history";

export default function SystemSettingsPage() {
  usePageTitle("Valores padrão");
  const s = useSettingsForm();
  const empresas = usePaymentCompanies();
  const { user, estado, form, fnValues } = s;

  if (!isRhOrAdmin(user)) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-danger-soft flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-danger-strong" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Acesso restrito</h2>
          <p className="text-muted-foreground max-w-xs">Apenas administradores e RH podem acessar os valores padrão do sistema.</p>
        </div>
      </div>
    );
  }

  // Retorno antecipado seguro: não há hooks abaixo daqui (o gate de permissão
  // acima já retornava antes destes cálculos).
  if (estado.isError) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto p-6">
          <QueryError error={estado.error} onRetry={estado.retry} title="Não foi possível carregar os valores padrão" />
        </div>
      </div>
    );
  }
  if (estado.isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto p-6">
          <LoadingState count={8} label="Carregando valores padrão…" />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-surface-muted">
    <div className="max-w-6xl mx-auto p-6 space-y-6">

      {/* ── Barra flutuante: ÚNICO ponto de salvamento da página ── */}
      {s.hasAnyChanges && (
        <SaveBar
          totalUnsaved={s.totalUnsaved}
          saving={s.isSaving}
          onSave={() => s.handleSaveAll()}
          onDiscard={() => { form.reset(); fnValues.resetFunctionValueStates(); }}
        />
      )}

      {/* ── Cabeçalho (padrão pastel das páginas irmãs — flash/regras) ── */}
      <PageHeader
        icon={Calculator}
        title="Valores padrão"
        subtitle="Defina os valores base utilizados no cálculo de novos eventos"
      />

      <Form {...form}>
        <form onSubmit={e => { e.preventDefault(); s.handleSaveAll(); }} className="space-y-6">

          {/* ZONA 1 — VALORES APLICADOS NO CÁLCULO (regras vigentes) */}
          <AppliedValuesSection form={form} />

          {/* Empresas Pagadoras (aplicadas nas Notas Fiscais) */}
          <PaymentCompaniesCard user={user} paymentCompanies={s.paymentCompanies} state={empresas} />

          {/* ZONA 2 — VALORES LEGADOS E OVERRIDES (colapsada por padrão) */}
          <LegacyValuesSection
            form={form}
            legacyOpen={s.legacyOpen}
            setLegacyOpen={s.setLegacyOpen}
            activeTab={s.activeTab}
            setActiveTab={s.setActiveTab}
          >
            <FunctionValuesTable
              allFunctions={s.allFunctions}
              fnCollaboratorTypes={s.fnCollaboratorTypes}
              allFunctionValues={s.allFunctionValues}
              activeTab={s.activeTab}
              functionSearch={fnValues.functionSearch}
              setFunctionSearch={fnValues.setFunctionSearch}
              dirtyFunctionCount={fnValues.dirtyFunctionCount}
              editor={fnValues.editor}
            />
          </LegacyValuesSection>

          {/* ── Rodapé informativo (o salvamento acontece na barra flutuante) ── */}
          <SettingsFooter lastSaved={s.lastSaved} isApplyingPending={s.isApplyingPending} onApplyToPending={s.handleApplyToPending} />
        </form>
      </Form>

      {/* Confirmação de exclusão de empresa pagadora (padrão do app) */}
      <DeleteCompanyDialog
        companyToDelete={empresas.companyToDelete}
        setCompanyToDelete={empresas.setCompanyToDelete}
        onConfirm={id => empresas.deleteCompanyMutation.mutate(id)}
      />

      {/* ── Histórico deste navegador (localStorage — não compartilhado) ── */}
      <SettingsHistory history={s.history} />
    </div>
    </div>
    </TooltipProvider>
  );
}
