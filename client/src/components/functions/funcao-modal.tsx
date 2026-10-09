/**
 * Nova função / Editar função (07/10, redesenho; antes inline em
 * pages/functions.tsx). Mesmos campos (nome e conta do rateio), mesmo
 * esquema, mesmas rotas (POST /api/functions, PATCH /api/functions/:id) e os
 * mesmos toasts. Na apresentação:
 *  - a régua dos modais de Eventos: ícone, título e uma linha que diz o que
 *    é; corpo em seção; rodapé com Cancelar e a ação nomeada ("Criar função" /
 *    "Salvar alterações", que antes era "Atualizar Função");
 *  - a conta sugere as que já existem (várias funções dividem a mesma conta —
 *    digitar "LI" e "Li" abria duas contas no fechamento);
 *  - nome igual ao de outra função avisa ANTES do servidor recusar;
 *  - fechar com alteração pede confirmação (Esc ou clique fora perdiam o que
 *    foi digitado).
 */
import { useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Info, Landmark, Loader2, PencilLine, Tag, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { campoComErro, idDoErro } from "@/lib/campo-com-erro";
import { MensagemDeErro } from "@/components/forms/mensagem-de-erro";
import { RequiredMark } from "@/components/forms/required-mark";
import type { Function } from "@shared/schema";
import { CABECALHO_DO_DIALOGO, FECHAR_DO_DIALOGO, ICONE_DO_DIALOGO, RODAPE_DO_DIALOGO, ROTULO, nomeDaFuncao } from "./papeis";

// ─── Schema ──────────────────────────────────────────────────────────────────
const functionFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  // Conta contábil do rateio (28/08): é por ela que o Espelho Operacional
  // fecha o custo do evento. Vários departamentos caem na mesma conta —
  // cenotécnica, kit e percurso entram em "LI", por exemplo.
  costCenter: z.string().trim().optional(),
});
type FunctionFormData = z.infer<typeof functionFormSchema>;

/** Campo: o Input padrão do sistema + estado de erro (a régua de Eventos). */
const CAMPO = "h-10 rounded-lg text-sm bg-card aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function FuncaoModal({ open, funcao, todas, responsaveis, onClose }: {
  open: boolean;
  /** `null` = nova função. */
  funcao: Function | null;
  /** O catálogo inteiro — para sugerir contas e avisar nome repetido. */
  todas: Function[];
  /** Quantos responsáveis a função tem (só para o cabeçalho da edição). */
  responsaveis?: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editando = !!funcao;

  const form = useForm<FunctionFormData>({
    resolver: zodResolver(functionFormSchema),
    defaultValues: { name: "", costCenter: "" },
  });

  // Abrir sempre parte dos valores da função (ou em branco): o estado de uma
  // edição anterior não pode vazar para a próxima abertura.
  useEffect(() => {
    if (open) form.reset({ name: funcao?.name ?? "", costCenter: funcao?.costCenter ?? "" });
  }, [open, funcao, form]);

  const fechar = () => { onClose(); form.reset(); };

  const updateFunctionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FunctionFormData }) => (await apiRequest("PATCH", `/api/functions/${id}`, data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/functions"] }); toast({ title: "Função atualizada!" }); fechar(); },
    onError: (err: unknown) => toast({ title: "Erro ao atualizar função", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });
  const createFunctionMutation = useMutation({
    mutationFn: async (data: FunctionFormData) => (await apiRequest("POST", "/api/functions", data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/functions"] }); toast({ title: "Função criada!" }); fechar(); },
    onError: (err: unknown) => toast({ title: "Erro ao salvar função", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const isPending = createFunctionMutation.isPending || updateFunctionMutation.isPending;
  const { pedirParaFechar, Dialogo: DialogoDescarte } = useConfirmarDescarte(form.formState.isDirty, { salvando: isPending });

  const handleSubmit = (data: FunctionFormData) => {
    if (funcao) updateFunctionMutation.mutate({ id: funcao.id, data });
    else createFunctionMutation.mutate(data);
  };

  // Contas que já existem (como foram escritas), para a lista de sugestões.
  const contas = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const f of todas) {
      const c = f.costCenter?.trim();
      if (c && !vistas.has(norm(c))) vistas.set(norm(c), c);
    }
    return Array.from(vistas.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [todas]);

  const nomeDigitado = form.watch("name") ?? "";
  const contaDigitada = form.watch("costCenter") ?? "";
  const repetida = useMemo(() => {
    const n = norm(nomeDigitado);
    if (!n) return null;
    return todas.find(f => f.id !== funcao?.id && norm(f.name) === n) ?? null;
  }, [nomeDigitado, todas, funcao]);
  const funcoesNaConta = useMemo(() => {
    const c = norm(contaDigitada);
    if (!c) return 0;
    return todas.filter(f => f.id !== funcao?.id && norm(f.costCenter ?? "") === c).length;
  }, [contaDigitada, todas, funcao]);

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) pedirParaFechar(fechar); }}>
        <DialogContent data-testid="modal-function"
          className="p-0 gap-0 sm:max-w-[520px] rounded-xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[92vh] max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0">

          <div className={CABECALHO_DO_DIALOGO}>
            <div className={ICONE_DO_DIALOGO}>
              {editando ? <PencilLine className="h-5 w-5" aria-hidden="true" /> : <Tag className="h-5 w-5" aria-hidden="true" />}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold text-foreground leading-6 m-0 p-0">
                {editando ? "Editar função" : "Nova função"}
              </DialogTitle>
              <DialogDescription className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
                {funcao
                  ? <>{nomeDaFuncao(funcao.name)}{typeof responsaveis === "number" && <> · {responsaveis === 0 ? "sem responsável" : `${responsaveis} ${responsaveis === 1 ? "responsável" : "responsáveis"}`}</>}</>
                  : "Aparece na Sugestão, na Escalação e nos custos. Os responsáveis entram depois, na lista."}
              </DialogDescription>
            </div>
            <button type="button" onClick={() => pedirParaFechar(fechar)} aria-label="Fechar" className={FECHAR_DO_DIALOGO}>
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 bg-surface-muted/60">
            <Form {...form}>
              <form id="function-form" onSubmit={form.handleSubmit(handleSubmit)} noValidate
                className="rounded-xl border border-border bg-card p-4 flex flex-col gap-4">
                <FormField control={form.control} name="name" render={({ field, fieldState }) => (
                  <div>
                    <label htmlFor="function-name" className={ROTULO}>
                      Nome da função<RequiredMark />
                    </label>
                    <Input id="function-name" placeholder="Ex.: Atendimento, Palco, Som…" autoComplete="off"
                      data-testid="input-function-name" aria-required="true"
                      {...campoComErro("function-name", fieldState.error?.message)}
                      className={CAMPO} {...field} />
                    <MensagemDeErro id="function-name" erro={fieldState.error?.message} />
                    {!fieldState.error && repetida && (
                      <p className="pas-entra m-0 mt-1 flex items-center gap-1 text-2xs text-warning-strong" role="status" data-testid="aviso-nome-repetido">
                        <Info className="w-3 h-3 shrink-0" aria-hidden="true" />
                        Já existe a função “{nomeDaFuncao(repetida.name)}”. O sistema não aceita dois nomes iguais.
                      </p>
                    )}
                  </div>
                )} />

                <FormField control={form.control} name="costCenter" render={({ field, fieldState }) => (
                  <div>
                    <label htmlFor="function-account" className={cn(ROTULO, "flex items-center gap-1.5")}>
                      <Landmark className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                      Conta (rateio)
                      <span className="font-normal text-muted-foreground">· opcional</span>
                    </label>
                    <Input id="function-account" placeholder="Ex.: LI, Atendimento, Produção…" autoComplete="off"
                      list={contas.length > 0 ? "function-account-sugestoes" : undefined}
                      data-testid="input-function-account"
                      aria-invalid={fieldState.error ? true : undefined}
                      aria-describedby={fieldState.error ? idDoErro("function-account") : "function-account-ajuda"}
                      className={CAMPO} {...field} value={field.value ?? ""} />
                    {contas.length > 0 && (
                      <datalist id="function-account-sugestoes">
                        {contas.map(c => <option key={c} value={c} />)}
                      </datalist>
                    )}
                    <MensagemDeErro id="function-account" erro={fieldState.error?.message} />
                    <p id="function-account-ajuda" className="m-0 mt-1.5 text-2xs leading-4 text-muted-foreground">
                      Em qual conta o custo desta função entra no fechamento do evento.
                      Várias funções podem dividir a mesma conta.
                      {funcoesNaConta > 0 && (
                        <span className="text-slate-600"> Esta conta já reúne {funcoesNaConta} {funcoesNaConta === 1 ? "outra função" : "outras funções"}.</span>
                      )}
                    </p>
                  </div>
                )} />
              </form>
            </Form>
          </div>

          <div className={RODAPE_DO_DIALOGO}>
            <Button type="button" variant="outline" onClick={() => pedirParaFechar(fechar)} className="h-9 rounded-lg px-4 text-sm font-medium" data-testid="button-cancel-function">
              Cancelar
            </Button>
            <Button type="submit" form="function-form" disabled={isPending} aria-busy={isPending} data-testid="button-save-function"
              className="h-9 rounded-lg px-4 text-sm font-semibold gap-2 hover:bg-primary-hover">
              {isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Salvando…</>
                : <><Check className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" /> {editando ? "Salvar alterações" : "Criar função"}</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {DialogoDescarte}
    </>
  );
}

export default FuncaoModal;
