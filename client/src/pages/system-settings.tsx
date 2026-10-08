/**
 * VALORES PADRÃO (Configurações) — página de composição (25/09,
 * modularização); redesenho 08/10.
 *
 * Dados (inalterados): `useSettingsForm` (consultas + react-hook-form +
 * salvamento único + histórico + "Atualizar planejado"), `usePaymentCompanies`
 * (empresas). Apresentação: components/settings/**.
 *
 * 08/10 — a casca das irmãs do Financeiro (Planejado, Realizado, Notas
 * fiscais, Flash): barra de contexto de 56px grudada (título com a regra no ⓘ,
 * a situação por extenso e "Atualizar Planejado"), conteúdo até 1560px com o
 * painel do que ESTÁ VALENDO, índice dos grupos na largura larga e os grupos em
 * linhas ("o que é · onde vale" à esquerda, campos à direita). Cada campo
 * alterado mostra o valor de antes e desfaz sozinho; a barra escura de
 * alterações sobe do rodapé com a contagem, a lista "antes → depois", o efeito
 * de salvar e o atalho para o campo com erro. Estados: esqueleto no formato
 * real, erro com "Tentar novamente", sem acesso com saída.
 */
import { useEffect } from "react";
import { Info } from "lucide-react";
import { Form } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { isRhOrAdmin } from "@/lib/role-utils";
import { useSettingsForm } from "@/components/settings/use-settings-form";
import { usePaymentCompanies } from "@/components/settings/use-payment-companies";
import { SaveBar, type MudancaPendente } from "@/components/settings/save-bar";
import { AppliedValuesSection } from "@/components/settings/applied-values-section";
import { PaymentCompaniesCard } from "@/components/settings/payment-companies-card";
import { LegacyValuesSection } from "@/components/settings/legacy-values-section";
import { FunctionValuesTable } from "@/components/settings/function-values-table";
import { AtualizarPlanejado, SettingsFooter } from "@/components/settings/settings-footer";
import { DeleteCompanyDialog } from "@/components/settings/delete-company-dialog";
import { SettingsHistory } from "@/components/settings/settings-history";
import { ResumoDosValores } from "@/components/settings/settings-resumo";
import { IndiceDaPagina } from "@/components/settings/settings-indice";
import { EsqueletoDosValores, ErroDosValores, SemAcessoAosValores } from "@/components/settings/settings-estados";
import { LEGACY_ZONE_FIELDS, type FormValues } from "@/components/settings/settings-schema";
import { ancoraDaSecao, rotuloDoCampo, SECOES, valorParaLer, type SecaoId } from "@/components/settings/settings-secoes";
import { formatDateTime } from "@/components/settings/settings-utils";

const reduzMovimento = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function SystemSettingsPage() {
  usePageTitle("Valores padrão");
  const s = useSettingsForm();
  const empresas = usePaymentCompanies();
  const { user, estado, form, fnValues } = s;
  const permitido = isRhOrAdmin(user);
  const carregado = permitido && !estado.isLoading && !estado.isError;

  // ── O que está alterado, por seção (só leitura do estado do formulário) ──
  const dirtyKeys = Object.keys(form.formState.dirtyFields) as (keyof FormValues)[];
  const alteradasPorSecao = Object.fromEntries(SECOES.map(sec => [
    sec.id,
    sec.campos.filter(k => dirtyKeys.includes(k)).length + (sec.id === "legado" ? fnValues.dirtyFunctionCount : 0),
  ])) as Record<SecaoId, number>;
  const salvos = (form.formState.defaultValues ?? {}) as Partial<FormValues>;
  const erros = Object.keys(form.formState.errors);

  const mudancas = (): MudancaPendente[] => {
    const atuais = form.getValues();
    const campos = SECOES.flatMap(sec => sec.campos).filter(k => dirtyKeys.includes(k)).map(k => ({
      rotulo: rotuloDoCampo(k), antes: valorParaLer(k, salvos[k]), depois: valorParaLer(k, atuais[k]),
    }));
    const funcoes = fnValues.buildFunctionHistoryEntries().map(e => ({
      rotulo: e.field.replace(/^Diária por função — /, "Por função · "), antes: e.oldValue, depois: e.newValue,
    }));
    return [...campos, ...funcoes];
  };

  const irPara = (id: SecaoId) => {
    document.getElementById(ancoraDaSecao(id))?.scrollIntoView({ block: "start", behavior: reduzMovimento() ? "auto" : "smooth" });
  };

  // Leva ao primeiro campo com erro (abre a zona legada quando ele está lá).
  const irParaErro = () => {
    const primeiro = erros[0];
    if (!primeiro) return;
    const legado = LEGACY_ZONE_FIELDS.has(primeiro);
    if (legado) {
      s.setLegacyOpen(true);
      s.setActiveTab(primeiro.endsWith("_freela") ? "freela" : "casa");
    }
    setTimeout(() => {
      const el = document.getElementById(primeiro);
      el?.scrollIntoView({ behavior: reduzMovimento() ? "auto" : "smooth", block: "center" });
      (el as HTMLElement | null)?.focus({ preventScroll: true });
    }, legado ? 160 : 0);
  };
  // Ao tentar salvar com erro fora da zona legada, o campo vem até a vista
  // (a zona legada o hook já abre sozinho).
  const submitCount = form.formState.submitCount;
  useEffect(() => {
    const primeiro = Object.keys(form.formState.errors)[0];
    if (submitCount > 0 && primeiro && !LEGACY_ZONE_FIELDS.has(primeiro)) {
      const el = document.getElementById(primeiro);
      el?.scrollIntoView({ behavior: reduzMovimento() ? "auto" : "smooth", block: "center" });
      (el as HTMLElement | null)?.focus({ preventScroll: true });
    }
    // Só a cada tentativa de salvar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitCount]);

  const regra = (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="O que são os valores padrão"
          className="pas-alvo inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="w-4 h-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[340px] text-xs font-normal leading-relaxed">
        As tarifas que o sistema usa para calcular o orçamento das vagas: diárias, deflação, alimentação, percurseiro, mobilidade e empreita. Mudar um valor aqui muda o Planejado de quem ainda não foi enviado ao Realizado e o dos eventos novos.
      </TooltipContent>
    </Tooltip>
  );

  const subtitulo = !carregado
    ? <>base do cálculo do orçamento de todos os eventos</>
    : s.totalUnsaved > 0
      ? <><span className="font-medium text-warning">{s.totalUnsaved} {s.totalUnsaved === 1 ? "alteração não salva" : "alterações não salvas"}</span> · base do cálculo de todos os eventos</>
      : s.lastSaved
        ? <>base do cálculo de todos os eventos · salvo neste navegador em {formatDateTime(s.lastSaved.timestamp)}</>
        : <>base do cálculo do orçamento de todos os eventos</>;

  const barra = (
    <PageHeader
      variant="bar"
      title={<span className="inline-flex items-center gap-1">Valores padrão{regra}</span>}
      className="mx-0 mt-0 gap-x-3 max-sm:static"
      subtitle={subtitulo}
      actions={carregado ? (
        <AtualizarPlanejado isApplyingPending={s.isApplyingPending} onApplyToPending={s.handleApplyToPending} temAlteracao={s.hasAnyChanges} disabled={s.isSaving} />
      ) : undefined}
    />
  );

  let conteudo;
  if (!permitido) {
    conteudo = <SemAcessoAosValores />;
  } else if (estado.isError) {
    conteudo = <ErroDosValores onRetry={estado.retry} />;
  } else if (estado.isLoading) {
    conteudo = <EsqueletoDosValores />;
  } else {
    conteudo = (
      <div className="cfg-pagina"><div className="cfg-pagina-grade">
        <aside className="cfg-pagina-indice">
          <IndiceDaPagina alteradasPorSecao={alteradasPorSecao} onIrPara={irPara} />
        </aside>
        <div className="cfg-pagina-corpo min-w-0">
          <ResumoDosValores
            salvos={salvos}
            alteradasPorSecao={alteradasPorSecao}
            totalNaoSalvas={s.totalUnsaved}
            lastSaved={s.lastSaved}
            onIrPara={irPara}
          />

          <Form {...form}>
            <form onSubmit={e => { e.preventDefault(); s.handleSaveAll(); }} className="flex flex-col gap-4" noValidate>
              <p className="cfg-zona">Entram no cálculo</p>
              {/* ZONA 1 — VALORES APLICADOS NO CÁLCULO (regras vigentes) */}
              <AppliedValuesSection form={form} alteradasPorSecao={alteradasPorSecao} />

              <p className="cfg-zona">Cadastros e reserva</p>
              {/* Empresas pagadoras (aplicadas nas Notas Fiscais) */}
              <PaymentCompaniesCard user={user} paymentCompanies={s.paymentCompanies} state={empresas} />

              {/* ZONA 2 — VALORES LEGADOS E OVERRIDES (colapsada por padrão) */}
              <LegacyValuesSection
                form={form}
                legacyOpen={s.legacyOpen}
                setLegacyOpen={s.setLegacyOpen}
                activeTab={s.activeTab}
                setActiveTab={s.setActiveTab}
                alteradas={alteradasPorSecao.legado}
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

              {/* ── Histórico deste navegador (localStorage — não compartilhado) ── */}
              <SettingsHistory history={s.history} />

              <SettingsFooter />

              {/* ── Barra de alterações: ÚNICO ponto de salvamento da página ── */}
              {s.hasAnyChanges && (
                <SaveBar
                  totalUnsaved={s.totalUnsaved}
                  saving={s.isSaving}
                  onSave={() => s.handleSaveAll()}
                  onDiscard={() => { form.reset(); fnValues.resetFunctionValueStates(); }}
                  mudancas={mudancas}
                  erros={erros.length}
                  onIrParaErro={irParaErro}
                />
              )}
            </form>
          </Form>
        </div>
      </div></div>
    );
  }

  return (
    <TooltipProvider>
      {/* Margens pela variável do layout: a barra sangra até as bordas da
          página e o conteúdo fica em até 1560px — a casca do Financeiro. */}
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        {barra}
        <div className="px-[var(--page-gutter)] pt-5 pb-6">
          <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
        </div>
      </div>

      {/* Confirmação de exclusão de empresa pagadora (padrão do app) — fecha
          com a resposta do servidor. */}
      <DeleteCompanyDialog
        companyToDelete={empresas.companyToDelete}
        setCompanyToDelete={empresas.setCompanyToDelete}
        onConfirm={id => empresas.deleteCompanyMutation.mutate(id, { onSettled: () => empresas.setCompanyToDelete(null) })}
        removendo={empresas.deleteCompanyMutation.isPending}
      />
    </TooltipProvider>
  );
}
