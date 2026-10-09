// Extraído de system-settings.tsx em 25/09 (modularização): orquestrador de
// dados da tela Valores padrão — as 5 consultas, o react-hook-form, o
// salvamento único (tarifas + diárias por função + aplicar ao Planejado),
// o histórico local e a ação "Atualizar planejado". A página só compõe o
// que este hook devolve; nenhum cartão fala com a API diretamente.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Function as FunctionType, FunctionValue, PaymentCompany } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { apiRequest, fetchJson } from "@/lib/queryClient";
import { isRhOrAdmin } from "@/lib/role-utils";
import { useQueriesState } from "@/components/common/query-state";
import {
  FORM_DEFAULT_VALUES, LEGACY_ZONE_FIELDS,
  formSchema, settingsToFormValues, type FormValues,
} from "./settings-schema";
import { HISTORY_KEY, LAST_SAVED_KEY } from "./settings-utils";
import { camposEditadosDepoisDoEnvio, corpoDasTarifas, historicoDasTarifas, type FuncaoNoLote } from "./settings-salvamento";
import { useSettingsHistory } from "./use-settings-history";
import { useFunctionValues, type SettingsTab } from "./use-function-values";

/**
 * Troca a base do formulário (o "salvo") sem perder edição: `base` vira o
 * valor salvo de cada campo e os campos de `preservar` voltam com o valor que
 * tinham, ainda contando como alterados se diferirem da nova base.
 */
export function rebasearFormulario(form: UseFormReturn<FormValues>, base: FormValues, preservar: (keyof FormValues)[]) {
  const atuais = form.getValues();
  form.reset(base);
  for (const k of preservar) {
    if (atuais[k] !== base[k]) form.setValue(k, atuais[k], { shouldDirty: true });
  }
}

export function useSettingsForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Zona legada controlada: aberta programaticamente quando um erro de
  // validação está num campo escondido dentro dela (ver handleSaveAll).
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('casa');
  const { history, setHistory, lastSaved, setLastSaved } = useSettingsHistory();

  // Sem permissão, nada é baixado — o gate de render sozinho ainda deixava
  // as 5 queries rodarem e entregarem os dados ao navegador
  const allowed = isRhOrAdmin(user);

  // Sem `queryFn` caseiro (23/09): o padrão do queryClient checa `res.ok`,
  // trata 401 e HTML de servidor desatualizado — os de antes gravavam o corpo
  // do erro no cache e o formulário aparecia preenchido com lixo.
  const qSettings = useQuery<Record<string, number>>({ queryKey: ["/api/system-settings"], enabled: allowed });
  const qFunctions = useQuery<FunctionType[]>({ queryKey: ["/api/functions"], enabled: allowed });
  const qFnCollaboratorTypes = useQuery<Record<string, string[]>>({ queryKey: ["/api/function-collaborator-types"], staleTime: 0, enabled: allowed });
  const qFunctionValues = useQuery<FunctionValue[]>({ queryKey: ["/api/function-values"], enabled: allowed });
  const qPaymentCompanies = useQuery<PaymentCompany[]>({ queryKey: ["/api/payment-companies"], enabled: allowed });
  const settings = qSettings.data;
  const allFunctions = useMemo(() => qFunctions.data ?? [], [qFunctions.data]);
  const fnCollaboratorTypes = qFnCollaboratorTypes.data ?? {};
  const allFunctionValues = useMemo(() => qFunctionValues.data ?? [], [qFunctionValues.data]);
  const paymentCompanies = qPaymentCompanies.data ?? [];
  // Erro/carregando das 5 consultas (23/09): o formulário só aparece com os
  // dados na mão — antes nascia vazio e era preenchido depois.
  const estado = useQueriesState([qSettings, qFunctions, qFnCollaboratorTypes, qFunctionValues, qPaymentCompanies]);

  const fnValues = useFunctionValues({ allFunctions, allFunctionValues, activeTab, user });
  const { dirtyFunctionCount, prepararEnvio, envioFalhou, buildFunctionHistoryEntries } = fnValues;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: FORM_DEFAULT_VALUES,
  });

  // Carga e recargas dos settings. Campo ainda alterado (inclusive o editado
  // enquanto o salvamento corria) sobrevive à recarga — antes o reset jogava
  // fora o que a pessoa digitou durante o envio.
  useEffect(() => {
    if (!settings) return;
    const sujos = Object.keys(form.formState.dirtyFields) as (keyof FormValues)[];
    rebasearFormulario(form, settingsToFormValues(settings), sujos);
  }, [settings, form]);

  const dirtyFormFields = Object.keys(form.formState.dirtyFields).length;
  const totalUnsaved = dirtyFormFields + dirtyFunctionCount;
  const hasAnyChanges = totalUnsaved > 0;

  // UM salvamento = UMA transação no servidor (tarifas + diárias por função):
  // ou entra tudo, ou nada — antes era um PUT e N PATCH/POST em paralelo, e uma
  // falha no meio deixava parte gravada, fora do histórico.
  const saveMutation = useMutation({
    mutationFn: async (lote: { settings: Record<string, number>; funcoes: FuncaoNoLote[] }) =>
      apiRequest("PUT", "/api/system-settings/lote", lote),
    // Sem onError aqui: o único toast de falha do fluxo é o do catch de
    // handleSaveAll (que exibe a mensagem do servidor) — antes eram dois.
  });

  // GET /api/function-values sai com Cache-Control max-age=60 (catálogo): a
  // recarga comum devolvia a cópia do NAVEGADOR, de antes do salvamento, e a
  // tabela continuava "alterada". Depois de salvar, busca sem essa cópia.
  const recarregarValoresPorFuncao = async () => {
    try {
      const frescos = await fetchJson<FunctionValue[]>(`/api/function-values?salvo=${Date.now()}`);
      queryClient.setQueryData(["/api/function-values"], frescos);
    } catch {
      await queryClient.invalidateQueries({ queryKey: ["/api/function-values"] });
    }
  };

  // ÚNICO fluxo de salvamento da página (barra flutuante): valida, salva as
  // tarifas + valores por função e aplica os padrões aos planejamentos
  // pendentes, com um único toast ao final.
  const handleSaveAll = form.handleSubmit(
    async (values) => {
      // Um carimbo só por salvamento: tarifas e funções no MESMO grupo do histórico.
      const carimbo = { timestamp: new Date().toISOString(), user: user?.name || "Admin" };
      // Histórico montado ANTES de gravar (os "antes" são os valores carregados).
      const entradas = [
        ...(settings ? historicoDasTarifas(settings, values, carimbo) : []),
        ...buildFunctionHistoryEntries(carimbo),
      ];
      const funcoes = prepararEnvio();
      try {
        try {
          await saveMutation.mutateAsync({ settings: corpoDasTarifas(values), funcoes });
        } catch (e) {
          envioFalhou();
          throw e;
        }
        // O que foi enviado vira a nova base; o editado durante o envio continua alterado.
        rebasearFormulario(form, values, camposEditadosDepoisDoEnvio(values, form.getValues()));
        if (entradas.length > 0) {
          setHistory(prev => {
            const updated = [...entradas, ...prev].slice(0, 40);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
            return updated;
          });
        }
        setLastSaved(carimbo);
        localStorage.setItem(LAST_SAVED_KEY, JSON.stringify(carimbo));
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] }),
          funcoes.length > 0 ? recarregarValoresPorFuncao() : null,
        ]);
        // Apply new defaults to all pending (not-yet-sent) budget_planned records
        let updatedCount = 0;
        let applyFailed = false;
        try {
          const applyRes = await apiRequest("POST", "/api/budget-planned/apply-defaults/pendentes", {});
          const applyData = await applyRes.json();
          updatedCount = applyData.updated ?? 0;
          if (updatedCount > 0) {
            queryClient.invalidateQueries({ queryKey: ["/api/budget-planned"] });
          }
        } catch {
          // Falha não pode ser engolida: os valores foram salvos, mas o
          // Planejado pendente ficou desatualizado — avisar com o caminho manual.
          applyFailed = true;
        }
        if (applyFailed) {
          toast({
            title: "Valores salvos, mas não foi possível atualizar os planejamentos pendentes",
            description: "Use o botão \"Atualizar Planejado\" para aplicá-los aos orçamentos pendentes.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Valores padrão salvos",
            description: updatedCount > 0
              ? `${updatedCount} planejamento${updatedCount > 1 ? 's' : ''} pendente${updatedCount > 1 ? 's' : ''} atualizado${updatedCount > 1 ? 's' : ''} com os novos valores.`
              : "Os novos valores serão aplicados em orçamentos de novos eventos.",
          });
        }
      } catch (e) {
        // O lote é uma transação: se falhou, nenhum valor foi gravado e as
        // alterações continuam na tela para tentar de novo.
        toast({
          title: "Erro ao salvar — nenhum valor foi gravado",
          description: apiErrorMessage(e, "Não foi possível salvar as alterações. Tente novamente."),
          variant: "destructive",
        });
      }
    },
    (errors) => {
      toast({ title: "Corrija os valores destacados antes de salvar", variant: "destructive" });
      // Se o primeiro campo inválido estiver na zona legada (colapsada), abre a
      // seção e leva o foco até ele — senão o erro fica invisível.
      const firstErrorField = Object.keys(errors)[0];
      if (firstErrorField && LEGACY_ZONE_FIELDS.has(firstErrorField)) {
        setLegacyOpen(true);
        // Os campos legados só montam na aba correspondente (Casa/Freela)
        setActiveTab(firstErrorField.endsWith("_freela") ? "freela" : "casa");
        // Espera o CollapsibleContent montar antes de rolar/focar
        setTimeout(() => {
          const el = document.getElementById(firstErrorField);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            (el as HTMLElement).focus({ preventScroll: true });
          }
        }, 150);
      }
    },
  );

  // Ação secundária (não salva nada): reaplica os valores padrão JÁ SALVOS a
  // todos os orçamentos planejados ainda não enviados.
  const [isApplyingPending, setIsApplyingPending] = useState(false);
  const handleApplyToPending = async () => {
    setIsApplyingPending(true);
    try {
      const res = await apiRequest("POST", "/api/budget-planned/apply-defaults/pendentes", {});
      const data = await res.json();
      const count = data.updated ?? 0;
      if (count > 0) queryClient.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      toast({
        title: count > 0
          ? `${count} planejamento${count !== 1 ? 's' : ''} atualizado${count !== 1 ? 's' : ''}`
          : "Nenhum orçamento pendente encontrado",
        description: count > 0 ? "Valores padrão aplicados aos orçamentos pendentes." : undefined,
      });
    } catch (err) {
      toast({ title: "Não foi possível atualizar o Planejado", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    } finally {
      setIsApplyingPending(false);
    }
  };

  return {
    user,
    estado,
    form,
    // Dados das consultas
    allFunctions,
    fnCollaboratorTypes,
    allFunctionValues,
    paymentCompanies,
    // Zona legada
    legacyOpen, setLegacyOpen,
    activeTab, setActiveTab,
    fnValues,
    // Salvamento
    totalUnsaved,
    hasAnyChanges,
    // Uma mutação só: tarifas + diárias por função no mesmo lote
    isSaving: saveMutation.isPending,
    handleSaveAll,
    // Histórico local
    history,
    lastSaved,
    // Atualizar Planejado
    isApplyingPending,
    handleApplyToPending,
  };
}

export type SettingsFormState = ReturnType<typeof useSettingsForm>;
