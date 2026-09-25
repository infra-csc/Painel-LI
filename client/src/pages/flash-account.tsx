/**
 * CONTA CORRENTE FLASH — página de composição (25/09, modularização).
 *
 * Até 24/09 este arquivo tinha ~830 linhas com o diálogo de lançamento e a
 * tabela do extrato inline. Agora:
 *  - dados: `useFlashData` (consultas, saldos, extrato acumulado, CSV, exclusão);
 *  - apresentação: components/flash/** (SummaryCard, AdmittedWithoutCreditPanel,
 *    AccountsList, MovementsTable, NewMovementDialog, DeleteMovementDialog).
 * Nada de comportamento mudou — só o lugar onde cada pedaço vive.
 */
import { useState } from "react";
import { AlertTriangle, Bus, Download, Plus, Sparkles, UtensilsCrossed, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { isRhOrAdmin } from "@/lib/role-utils";
import { toTitleCase } from "@/lib/format";
import { campo, useUrlState } from "@/lib/use-url-state";
import { useFlashData } from "@/components/flash/use-flash-data";
import { AccountsList, AdmittedWithoutCreditPanel, DeleteMovementDialog, SummaryCard } from "@/components/flash/flash-cards";
import { MovementsTable } from "@/components/flash/movements-table";
import { NewMovementDialog } from "@/components/flash/new-movement-dialog";
import { TARGET_FOOD_CENTS, TARGET_MOBILITY_CENTS, formatCurrency, type FlashMovement, type SourceFilter } from "@/components/flash/flash-types";

export default function FlashAccountPage() {
  usePageTitle("Conta corrente Flash");
  const { user } = useAuth();
  const canManage = isRhOrAdmin(user);

  // Busca, colaborador aberto e filtro de origem na URL (23/09): voltar para a
  // tela reabre o mesmo extrato; o link copiado também.
  const [urlState, setUrlState] = useUrlState({
    q: campo.texto(""),
    colaborador: campo.texto(""),
    origem: campo.opcao<SourceFilter>("todos"),
  });
  const search = urlState.q;
  const setSearch = (v: string) => setUrlState({ q: v });
  const selectedCollabId = urlState.colaborador;
  const setSelectedCollabId = (v: string) => setUrlState({ colaborador: v });
  const sourceFilter = urlState.origem;
  const setSourceFilter = (v: SourceFilter) => setUrlState({ origem: v });
  const [showForm, setShowForm] = useState(false);
  const [formCollabId, setFormCollabId] = useState<string>("");
  const [movementToEdit, setMovementToEdit] = useState<FlashMovement | null>(null);
  const [movementToDelete, setMovementToDelete] = useState<FlashMovement | null>(null);
  const [showNoInitialCredit, setShowNoInitialCredit] = useState(false);

  const d = useFlashData({ search, selectedCollabId, sourceFilter });
  const { estado, isLoading, collaborators, events, movements, getCollabName, totals, extrato, extratoVisible, hasAutomatic, selectedBalance } = d;

  return (
    <div className="min-h-screen bg-surface-muted p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Cabeçalho (23/09): subtítulo encurtado para ≤ 90 caracteres e CTA no
            token da marca, como nas demais telas. */}
        <PageHeader
          icon={Wallet}
          title="Conta corrente Flash"
          subtitle={<>Saldo Flash por colaborador — alvo {formatCurrency(TARGET_FOOD_CENTS)} alimentação · {formatCurrency(TARGET_MOBILITY_CENTS)} mobilidade</>}
          actions={canManage && (
            <Button onClick={() => { setMovementToEdit(null); setFormCollabId(""); setShowForm(true); }} className="rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold h-9 px-4 shadow-1">
              <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Novo lançamento
            </Button>
          )}
        />

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Contas ativas" value={String(totals.accounts)} icon={Wallet} color="text-primary" bg="bg-brand-soft" />
          <SummaryCard label="Saldo alimentação" value={formatCurrency(totals.food)} icon={UtensilsCrossed} color="text-success" bg="bg-success-soft" />
          <SummaryCard label="Saldo mobilidade" value={formatCurrency(totals.mobility)} icon={Bus} color="text-primary" bg="bg-brand-soft" />
          <SummaryCard label="Abaixo do alvo" value={String(totals.below)} icon={AlertTriangle} color="text-warning" bg="bg-warning-soft" />
        </div>

        {/* Admitidos sem crédito inicial — fecha o fluxo "crédito na admissão" */}
        {canManage && !isLoading && d.admittedWithoutInitialCredit.length > 0 && (
          <AdmittedWithoutCreditPanel
            collaborators={d.admittedWithoutInitialCredit}
            open={showNoInitialCredit}
            onToggle={() => setShowNoInitialCredit(v => !v)}
            onLancarCredito={id => { setFormCollabId(id); setMovementToEdit(null); setShowForm(true); }}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Lista de contas */}
          <AccountsList
            search={search}
            setSearch={setSearch}
            estado={estado}
            isLoading={isLoading}
            accountRows={d.accountRows}
            movementsCount={movements.length}
            selectedCollabId={selectedCollabId}
            onSelect={setSelectedCollabId}
          />

          {/* Extrato */}
          <div className="lg:col-span-3 bg-card rounded-xl border border-border overflow-hidden">
            {!selectedCollabId ? (
              <div className="p-16 text-center">
                <Wallet className="w-10 h-10 text-slate-200 mx-auto mb-3" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Selecione um colaborador para ver o extrato</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{toTitleCase(getCollabName(selectedCollabId))}</p>
                    <p className="text-2xs text-muted-foreground mt-0.5">
                      Saldo: <span className="font-mono font-semibold text-success">{formatCurrency(selectedBalance?.food || 0)}</span> alimentação
                      <span className="mx-1 text-muted-foreground">·</span>
                      <span className="font-mono font-semibold text-primary">{formatCurrency(selectedBalance?.mobility || 0)}</span> mobilidade
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={d.exportCsv} title="Exportar extrato em CSV" className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-600 border border-border rounded-lg hover:bg-surface-muted transition-colors">
                      <Download className="w-3.5 h-3.5" aria-hidden="true" /> CSV
                    </button>
                    <button
                      onClick={() => setSelectedCollabId("")}
                      aria-label="Fechar extrato"
                      title="Fechar extrato"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-slate-600 hover:bg-muted transition-colors"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {/* Legenda/filtro discreto por origem: manual × automático
                    (crédito da aprovação do comparativo) */}
                {extrato.length > 0 && (
                  <div className="flex items-center gap-2 px-5 py-2 border-b border-border text-2xs">
                    <span className="text-muted-foreground font-bold uppercase tracking-wider">Origem</span>
                    {(["todos", "manual", "automatico"] as SourceFilter[]).map(f => (
                      <button
                        key={f}
                        onClick={() => setSourceFilter(f)}
                        aria-pressed={sourceFilter === f}
                        className={`px-2 py-0.5 rounded-full border transition-colors ${
                          sourceFilter === f
                            ? "bg-slate-800 border-slate-800 text-white"
                            : "border-border text-muted-foreground hover:bg-surface-muted"
                        }`}
                      >
                        {f === "todos" ? "Todos" : f === "manual" ? "Manual" : "Automático"}
                      </button>
                    ))}
                    {hasAutomatic && (
                      <span className="ml-auto text-muted-foreground flex items-center gap-1" title="Gerado na aprovação do comparativo do evento — acompanha o Realizado; estorno em Comparativo → Fechamento do comparativo → Reabrir comparativo">
                        <Sparkles className="w-3 h-3 text-primary/70" aria-hidden="true" /> Automático = crédito do comparativo (somente leitura)
                      </span>
                    )}
                  </div>
                )}
                <div className="max-h-[470px] overflow-y-auto overflow-x-auto">
                  {extrato.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-10">Nenhum lançamento para este colaborador.</p>
                  ) : extratoVisible.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-10">Nenhum lançamento {sourceFilter === "automatico" ? "automático" : "manual"} para este colaborador.</p>
                  ) : (
                    <MovementsTable
                      extratoVisible={extratoVisible}
                      canManage={canManage}
                      getEventName={d.getEventName}
                      onEdit={m => { setMovementToEdit(m); setFormCollabId(""); setShowForm(true); }}
                      onDelete={setMovementToDelete}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Confirmação de exclusão (padrão do app — sem window.confirm) */}
        <DeleteMovementDialog
          movement={movementToDelete}
          onClose={() => setMovementToDelete(null)}
          onConfirm={id => d.deleteMutation.mutate(id)}
        />

        {canManage && (
          <NewMovementDialog
            open={showForm}
            onClose={() => { setShowForm(false); setMovementToEdit(null); setFormCollabId(""); }}
            collaborators={collaborators}
            events={events}
            defaultCollaboratorId={formCollabId || selectedCollabId}
            editing={movementToEdit}
            hasAccount={(id: string) => d.collabsWithMovements.has(id)}
            onCreated={(collabId: string) => {
              d.invalidateMovements();
              setSelectedCollabId(collabId);
            }}
          />
        )}
      </div>
    </div>
  );
}
