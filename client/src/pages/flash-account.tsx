/**
 * CONTA CORRENTE FLASH — página de composição (25/09, modularização);
 * redesenho 08/10.
 *
 * Dados (inalterados): `useFlashData` (consultas, saldos, extrato acumulado,
 * CSV, exclusão). Apresentação: components/flash/**.
 *
 * 08/10 — a casca das irmãs do Financeiro (Planejado, Realizado, Notas
 * fiscais): barra de contexto de 56px grudada (título com a regra no ⓘ, o alvo
 * por extenso e "Novo lançamento"), conteúdo até 1560px com o painel de resumo
 * (no lugar dos quatro cartões; "Abaixo do alvo" recorta a lista), o aviso dos
 * admitidos sem crédito inicial e o par contas × extrato. O extrato é lido
 * como o de um banco: os dois saldos com o alvo, entrada e saída em colunas,
 * meses separados e o total no pé. No celular e no tablet a lista e o extrato
 * se revezam ("Contas" volta). Estados: esqueleto no formato real, erro com
 * "Tentar novamente", conta vazia com saída, sem resultado com "Limpar
 * filtros", lançamento novo/alterado acendendo no extrato.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Info, Plus, RotateCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { isRhOrAdmin } from "@/lib/role-utils";
import { cn } from "@/lib/utils";
import { campo, useUrlState } from "@/lib/use-url-state";
import { useFlashData } from "@/components/flash/use-flash-data";
import { AccountsList, AdmittedWithoutCreditPanel, DeleteMovementDialog, ResumoDoFlash, type SituacaoDaConta } from "@/components/flash/flash-cards";
import { ExtratoDaConta } from "@/components/flash/extrato-da-conta";
import { NewMovementDialog } from "@/components/flash/new-movement-dialog";
import { TARGET_FOOD_CENTS, TARGET_MOBILITY_CENTS, formatCurrency, type FlashMovement, type SourceFilter } from "@/components/flash/flash-types";

/** Esqueleto no formato real: painel de resumo, lista de contas e extrato. */
function EsqueletoDoFlash() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando a conta corrente Flash" className="flex flex-col gap-4" data-testid="flash-carregando">
      <span className="sr-only">Carregando a conta corrente Flash…</span>
      <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={cn("px-4 pt-3.5 pb-3 space-y-2", i > 0 && "lg:border-l border-border", i >= 2 && "max-lg:border-t", i % 2 === 1 && "max-lg:border-l")}>
              <div className="pas-osso h-3 w-24" /><div className="pas-osso h-5 w-28" /><div className="pas-osso h-2.5 w-20" />
            </div>
          ))}
        </div>
        <div className="h-10 border-t border-border bg-surface-muted/60" />
      </div>
      <div aria-hidden="true" className="fla-mestre">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-3 space-y-2.5 border-b border-border"><div className="pas-osso h-[34px] w-full rounded-lg" /><div className="pas-osso h-8 w-full rounded-lg" /></div>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex gap-3 px-4 py-3 border-b border-border last:border-0">
              <div className="pas-osso w-8 h-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2"><div className="pas-osso h-3.5 w-40" /><div className="grid grid-cols-2 gap-4"><div className="pas-osso h-3 w-full" /><div className="pas-osso h-3 w-full" /></div></div>
            </div>
          ))}
        </div>
        <div className="max-lg:hidden rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex gap-3 px-5 py-4 border-b border-border"><div className="pas-osso w-9 h-9 rounded-full" /><div className="space-y-2"><div className="pas-osso h-4 w-48" /><div className="pas-osso h-3 w-32" /></div></div>
          <div className="grid grid-cols-2 border-b border-border">
            {[0, 1].map(i => <div key={i} className="px-5 py-4 space-y-2"><div className="pas-osso h-3 w-28" /><div className="pas-osso h-6 w-32" /><div className="pas-osso h-1 w-48" /></div>)}
          </div>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0">
              <div className="pas-osso h-4 w-12" /><div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-56" /><div className="pas-osso h-3 w-32" /></div><div className="pas-osso h-4 w-20" /><div className="pas-osso h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FlashAccountPage() {
  usePageTitle("Conta corrente Flash");
  const { user } = useAuth();
  const canManage = isRhOrAdmin(user);

  // Busca, colaborador aberto, filtro de origem e recorte pelo alvo na URL
  // (23/09; recorte 08/10): voltar para a tela reabre o mesmo extrato; o link
  // copiado também.
  const [urlState, setUrlState] = useUrlState({
    q: campo.texto(""),
    colaborador: campo.texto(""),
    origem: campo.opcao<SourceFilter>("todos"),
    situacao: campo.opcao<SituacaoDaConta>("todas"),
  });
  const search = urlState.q;
  const setSearch = (v: string) => setUrlState({ q: v });
  const selectedCollabId = urlState.colaborador;
  const setSelectedCollabId = (v: string) => setUrlState({ colaborador: v });
  const sourceFilter = urlState.origem;
  const setSourceFilter = (v: SourceFilter) => setUrlState({ origem: v });
  const situacao = urlState.situacao;
  const setSituacao = (v: SituacaoDaConta) => setUrlState({ situacao: v });
  const [showForm, setShowForm] = useState(false);
  const [formCollabId, setFormCollabId] = useState<string>("");
  const [movementToEdit, setMovementToEdit] = useState<FlashMovement | null>(null);
  const [movementToDelete, setMovementToDelete] = useState<FlashMovement | null>(null);
  const [showNoInitialCredit, setShowNoInitialCredit] = useState(false);

  const d = useFlashData({ search, selectedCollabId, sourceFilter });
  const { estado, isLoading, collaborators, events, movements, getCollabName, totals, extrato, extratoVisible, hasAutomatic, selectedBalance } = d;

  // Recorte da lista pela situação do alvo (só exibição; a busca vem do hook).
  const contagem = useMemo(() => {
    const abaixo = d.accountRows.filter(r => r.belowTarget).length;
    return { todas: d.accountRows.length, abaixo, "no-alvo": d.accountRows.length - abaixo } satisfies Record<SituacaoDaConta, number>;
  }, [d.accountRows]);
  const linhas = useMemo(() => (
    situacao === "abaixo" ? d.accountRows.filter(r => r.belowTarget)
      : situacao === "no-alvo" ? d.accountRows.filter(r => !r.belowTarget)
        : d.accountRows
  ), [d.accountRows, situacao]);

  // ── Lançamento novo/alterado acende no extrato (e entra na tela) ──
  const idsAntes = useRef<Set<string> | null>(null);
  const [destaques, setDestaques] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const antes = idsAntes.current;
    if (!antes) return;
    const novos = movements.filter(m => !antes.has(m.id)).map(m => m.id);
    if (novos.length === 0) return;
    idsAntes.current = null;
    setDestaques(new Set(novos));
  }, [movements]);
  useEffect(() => {
    if (destaques.size === 0) return;
    const primeiro = Array.from(destaques)[0];
    requestAnimationFrame(() => {
      document.querySelector(`[data-testid="flash-lancamento-${primeiro}"]`)?.scrollIntoView({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    const t = setTimeout(() => setDestaques(new Set()), 2600);
    return () => clearTimeout(t);
  }, [destaques]);

  // No celular/tablet a lista e o extrato se revezam: abrir uma conta leva ao topo do extrato.
  const abrirConta = (id: string) => {
    setSelectedCollabId(id);
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 1023.98px)").matches) window.scrollTo({ top: 0 });
  };
  const novoLancamento = (collabId = "") => { setMovementToEdit(null); setFormCollabId(collabId); setShowForm(true); };

  const regra = (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Como funciona a conta corrente Flash"
            className="pas-alvo inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="w-4 h-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[340px] text-xs font-normal leading-relaxed">
          Cada colaborador deve ter sempre {formatCurrency(TARGET_FOOD_CENTS)} de alimentação e {formatCurrency(TARGET_MOBILITY_CENTS)} de mobilidade no Flash Benefícios. A conta abre com o crédito inicial da admissão; a aprovação do comparativo de cada evento repõe automaticamente o que foi gasto (esses créditos são somente leitura).
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const carregado = !isLoading && !estado.isError;
  const barra = (
    <PageHeader
      variant="bar"
      title={<span className="inline-flex items-center gap-1">Conta corrente Flash{regra}</span>}
      className="mx-0 mt-0 gap-x-3 max-sm:static"
      subtitle={
        carregado && totals.accounts > 0
          ? <>{totals.accounts} {totals.accounts === 1 ? "conta" : "contas"} · alvo {formatCurrency(TARGET_FOOD_CENTS)} alimentação e {formatCurrency(TARGET_MOBILITY_CENTS)} mobilidade</>
          : <>saldo por colaborador · alvo {formatCurrency(TARGET_FOOD_CENTS)} alimentação e {formatCurrency(TARGET_MOBILITY_CENTS)} mobilidade</>
      }
      actions={canManage ? (
        <Button
          type="button"
          onClick={() => novoLancamento("")}
          // Sem colaboradores e saldos carregados o diálogo abriria vazio.
          disabled={!carregado}
          className="pas-alvo shrink-0 h-[34px] rounded-lg px-3 text-sm font-medium gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground max-sm:w-full"
          data-testid="flash-novo-lancamento"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />Novo lançamento
        </Button>
      ) : undefined}
    />
  );

  const aberto = !!selectedCollabId;
  const avisoAdmitidos = canManage && carregado && d.admittedWithoutInitialCredit.length > 0 ? (
    <AdmittedWithoutCreditPanel
      collaborators={d.admittedWithoutInitialCredit}
      open={showNoInitialCredit}
      onToggle={() => setShowNoInitialCredit(v => !v)}
      onLancarCredito={id => novoLancamento(id)}
    />
  ) : null;

  let conteudo: ReactNode;
  if (estado.isError) {
    conteudo = (
      <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14" data-testid="flash-erro">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
          <AlertCircle className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar a conta corrente Flash</h2>
        <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
          Os lançamentos, os colaboradores ou os eventos não chegaram — sem eles os saldos sairiam errados. Verifique sua conexão e tente de novo.
        </p>
        <Button variant="outline" className="mt-5 rounded-lg" onClick={estado.retry} data-testid="flash-tentar-novamente">
          <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente
        </Button>
      </div>
    );
  } else if (isLoading) {
    conteudo = <EsqueletoDoFlash />;
  } else if (movements.length === 0) {
    conteudo = (
      <>
        {avisoAdmitidos}
        <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-16" data-testid="flash-vazio">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-primary mb-3.5" aria-hidden="true">
            <Wallet className="w-5 h-5" />
          </span>
          <h2 className="m-0 text-base font-semibold text-foreground">Nenhuma conta aberta ainda</h2>
          <p className="m-0 mt-1.5 max-w-[480px] text-sm leading-relaxed text-muted-foreground">
            A conta de cada colaborador abre com o crédito inicial da admissão — {formatCurrency(TARGET_FOOD_CENTS)} de alimentação e {formatCurrency(TARGET_MOBILITY_CENTS)} de mobilidade. Depois, a aprovação do comparativo de cada evento repõe o que foi gasto.
          </p>
          {canManage && (
            <Button type="button" variant="outline" className="mt-5 rounded-lg gap-1.5" onClick={() => novoLancamento("")}>
              <Plus className="w-4 h-4" aria-hidden="true" />Novo lançamento
            </Button>
          )}
        </div>
      </>
    );
  } else {
    conteudo = (
      <>
        {/* No celular/tablet, com um extrato aberto, o topo dá lugar a ele. */}
        <div className={cn("flex flex-col gap-4", aberto && "max-lg:hidden")}>
          <ResumoDoFlash totals={totals} abaixoAtivo={situacao === "abaixo"} onVerAbaixo={() => setSituacao(situacao === "abaixo" ? "todas" : "abaixo")} />
          {avisoAdmitidos}
        </div>
        <div className="fla-mestre">
          <AccountsList
            search={search}
            setSearch={setSearch}
            movementsCount={movements.length}
            selectedCollabId={selectedCollabId}
            onSelect={abrirConta}
            situacao={situacao}
            onSituacao={setSituacao}
            contagem={contagem}
            linhas={linhas}
            totalDeContas={totals.accounts}
            className={cn("fla-contas-fixa", aberto && "max-lg:hidden")}
          />
          {aberto ? (
            <ExtratoDaConta
              key={selectedCollabId}
              nome={getCollabName(selectedCollabId)}
              saldo={selectedBalance}
              extrato={extrato}
              extratoVisible={extratoVisible}
              sourceFilter={sourceFilter}
              setSourceFilter={setSourceFilter}
              hasAutomatic={hasAutomatic}
              canManage={canManage}
              getEventName={d.getEventName}
              onEdit={m => { setMovementToEdit(m); setFormCollabId(""); setShowForm(true); }}
              onDelete={setMovementToDelete}
              onExportCsv={d.exportCsv}
              onClose={() => setSelectedCollabId("")}
              onNovo={() => novoLancamento(selectedCollabId)}
              destaques={destaques}
              className="pas-entra"
            />
          ) : (
            <div className="max-lg:hidden flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-border px-6 py-16 min-h-[320px]" data-testid="flash-sem-conta-aberta">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
                <Wallet className="w-5 h-5" />
              </span>
              <p className="m-0 text-sm font-semibold text-foreground">Escolha uma conta para ver o extrato</p>
              <p className="m-0 mt-1 max-w-[340px] text-xs leading-5 text-muted-foreground">
                Os lançamentos aparecem em ordem de data, com entradas, saídas e o saldo de cada categoria depois de cada um.
              </p>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Margens pela variável do layout: a barra sangra até as bordas da
          página e o conteúdo fica em até 1560px — a casca do Financeiro. */}
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        {barra}
        <div className="px-[var(--page-gutter)] pt-5 pb-6">
          <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
        </div>
      </div>

      {/* Confirmação de exclusão (padrão do app — sem window.confirm) */}
      <DeleteMovementDialog
        movement={movementToDelete}
        onClose={() => setMovementToDelete(null)}
        onConfirm={id => d.deleteMutation.mutate(id, { onSettled: () => setMovementToDelete(null) })}
        excluindo={d.deleteMutation.isPending}
        saldoAtual={movementToDelete
          ? (movementToDelete.category === "alimentacao" ? d.selectedBalance?.food : d.selectedBalance?.mobility)
          : undefined}
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
          saldoDe={d.saldoDe}
          onCreated={(collabId: string) => {
            if (movementToEdit) setDestaques(new Set([movementToEdit.id]));
            else idsAntes.current = new Set(movements.map(m => m.id));
            d.invalidateMovements();
            setSelectedCollabId(collabId);
          }}
        />
      )}
    </>
  );
}
