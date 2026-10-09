/**
 * Modal de evento — criar, editar e ver (Eventos e Inclusão de equipe).
 *
 * 07/10 (redesenho), na moldura dos registros da Logística (Passagens e
 * Hospedagem): cabeçalho branco com o ícone em marca, título e — na edição —
 * "#nº · status · quando acontece"; o corpo em seções com título (Evento,
 * Período, Situação, Empresa pagadora, Observações) no lugar de uma pilha de
 * campos azulados com rótulos em caixa alta; rodapé cinza com Cancelar e a
 * ação principal, e o atalho do Espelho operacional à esquerda (era um botão
 * azul do tamanho de um campo, no meio do formulário). No celular, tela cheia.
 *
 *  - Período: o ícone de calendário duplicado sobre o seletor nativo saiu, e a
 *    seção diz quantos dias o evento dura.
 *  - Situação: as opções à vista (Planejado / Concluído / Excluído) e a regra
 *    dita — "Em andamento" é automático pelas datas.
 *  - Erros: campo com borda de erro, mensagem ligada por `aria-describedby`.
 *  - Quem não altera eventos (RH) vê o evento em modo leitura: campos
 *    travados, selo "Somente leitura" e só "Fechar" — antes eram campos
 *    editáveis com um "Salvar" apagado. "Gerenciar" empresas continua para
 *    quem pode (é outra ação, com outra permissão).
 *  - Empresas salvas: remover pede confirmação na própria linha, e o botão
 *    de remover fica à vista (só aparecia no hover — no toque, nunca).
 *
 * Nada de regra mudou: o mesmo esquema, as mesmas permissões, as mesmas
 * mutações e o mesmo "Descartar alterações?".
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { hasRole } from "@/lib/role-utils";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Event, PaymentCompany } from "@shared/schema";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  X, Check, Trash2, Plus, Loader2, Table2, Landmark, CalendarCog, CalendarPlus, CalendarDays,
  CalendarRange, Flag, Lock, StickyNote, Info,
} from "lucide-react";
import { CnpjInput, validateCnpj } from "@/components/ui/cnpj-input";
import { apiErrorMessage } from "@/lib/api-error";
import { useLocation } from "wouter";
import { ToastAction } from "@/components/ui/toast";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { guardarEventoEmFoco, hrefComEvento } from "@/lib/evento-em-foco";
import { RequiredMark } from "@/components/forms/required-mark";
import { MensagemDeErro } from "@/components/forms/mensagem-de-erro";
import { campoComErro } from "@/lib/campo-com-erro";
import { getEventStatus } from "@/lib/event-status";
import { EventStatusBadge, duracaoEmDias, quandoAcontece } from "@/components/events/events-shared";

const STATUS_DO_FORMULARIO = ["planejado", "concluído", "excluído"] as const;
type StatusDoFormulario = (typeof STATUS_DO_FORMULARIO)[number];
/** Status gravado (texto livre) → opção do select; legado/desconhecido cai em "planejado". */
function statusDoFormulario(status: string | null | undefined): StatusDoFormulario {
  return (STATUS_DO_FORMULARIO as readonly string[]).includes(status ?? "") ? (status as StatusDoFormulario) : "planejado";
}

const eventSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  location: z.string().min(1, "Local obrigatório"),
  startDate: z.string().min(1, "Data início obrigatória"),
  endDate: z.string().min(1, "Data fim obrigatória"),
  status: z.enum(STATUS_DO_FORMULARIO).optional(),
  observations: z.string().optional(),
  paymentCompanyName: z.string().optional(),
  paymentCompanyCnpj: z.string().optional().refine(v => {
    if (!v || v.replace(/\D/g, "").length === 0) return true;
    return validateCnpj(v);
  }, { message: "CNPJ inválido." }),
}).superRefine((d, ctx) => {
  // Datas chegam como "YYYY-MM-DD": a comparação lexicográfica já é cronológica
  // e não sofre com o deslocamento de fuso de new Date("YYYY-MM-DD").
  if (d.startDate && d.endDate && d.endDate < d.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "A data fim não pode ser anterior à data início." });
  }
});
type EventFormData = z.infer<typeof eventSchema>;

interface EventModalProps {
  open: boolean;
  onClose: () => void;
  event?: Event | null;
}

/** Moldura: 640px no desktop, tela cheia no celular (a mesma régua da Hospedagem). */
const MOLDURA = "p-0 gap-0 sm:max-w-[640px] rounded-xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[92vh] max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0";
/** Campo: o Input padrão do sistema (borda, fundo do card) + estado de erro. */
const IC = "h-10 rounded-lg text-sm bg-card aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30 disabled:opacity-100 disabled:bg-surface-muted disabled:text-slate-600";
/** Rótulo do campo — o mesmo de Passagens/Hospedagem (11px caixa normal saiu do caixa-alta de 10px). */
const LABEL = "block mb-1.5 text-xs font-medium text-slate-600";
/** Seção do corpo: cartão com borda e um título curto com ícone. */
const SECAO = "rounded-xl border border-border bg-card p-4";
const TITULO_SECAO = "m-0 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";
// Um padrão só de obrigatório em todos os formulários (23/09).
const REQ = <RequiredMark />;

function TituloDaSecao({ icone: Icone, children, extra }: { icone: typeof CalendarDays; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-3">
      <h3 className={TITULO_SECAO}><Icone className="w-3.5 h-3.5" aria-hidden="true" />{children}</h3>
      {extra}
    </div>
  );
}

export default function EventModal({ open, onClose, event }: EventModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEditing = !!event;
  // "Excluído" no status: só administrador (18/09) — ou para manter o que já está.
  const { user } = useAuth();
  // Espelha o servidor (eventos.ts): POST/PATCH só CADASTRO_ROLES; a empresa
  // pagadora só o financeiro/admin altera (PATCH devolve 403 para os demais).
  const podeEditarEvento = hasRole(user, "admin", "purchasing", "production");
  const podeAlterarPagadora = hasRole(user, "admin", "financial");
  const podeExcluir = ["admin", "administrator", "administrador"].includes(String(user?.role ?? "")) || event?.status === "excluído";
  /** Modo leitura: quem não altera eventos vê os campos travados e só "Fechar". */
  const leitura = !podeEditarEvento;
  const [, navegar] = useLocation();

  const [obsLen,       setObsLen]       = useState(0);
  const [showSugg,     setShowSugg]     = useState(false);
  const [showManage,   setShowManage]   = useState(false);
  const [manName,      setManName]      = useState("");
  const [manCnpj,      setManCnpj]      = useState("");
  /** Empresa salva com a remoção pedida (a linha pergunta antes de remover). */
  const [removendo,    setRemovendo]    = useState<number | null>(null);
  const nameRef  = useRef<HTMLInputElement | null>(null);
  const suggRef  = useRef<HTMLDivElement>(null);

  const { data: companies = [] } = useQuery<PaymentCompany[]>({ queryKey: ["/api/payment-companies"] });

  const addCompany = useMutation({
    mutationFn: (d: { name: string; cnpj: string }) => apiRequest("POST", "/api/payment-companies", d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/payment-companies"] }),
    onError: (err: unknown) => toast({ title: "Erro ao salvar empresa", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });
  const delCompany = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/payment-companies/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/payment-companies"] }); toast({ title: "Empresa removida." }); },
    onError: (err: unknown) => toast({ title: "Erro ao remover empresa", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    mode: "onBlur",
    defaultValues: { name: "", location: "", startDate: "", endDate: "", status: "planejado", observations: "", paymentCompanyName: "TATICA MARKETING ESPORTIVO LTDA", paymentCompanyCnpj: "06.103.531/0001-96" },
  });

  const cName = form.watch("paymentCompanyName") ?? "";
  const cCnpj = form.watch("paymentCompanyCnpj") ?? "";
  const isSaved = companies.some(c => c.name.trim().toLowerCase() === cName.trim().toLowerCase());
  const isNew   = cName.trim() !== "" && !isSaved && validateCnpj(cCnpj);
  const filtered = cName.trim() ? companies.filter(c => c.name.toLowerCase().includes(cName.toLowerCase())) : companies;
  const inicio = form.watch("startDate");
  const fim = form.watch("endDate");
  const dias = inicio && fim ? duracaoEmDias(inicio, fim) : null;

  useEffect(() => {
    if (event) {
      const obs = event.observations || "";
      form.reset({
        name: event.name, location: event.location,
        startDate: event.startDate, endDate: event.endDate,
        status: statusDoFormulario(event.status),
        observations: obs,
        paymentCompanyName: event.paymentCompanyName || "",
        paymentCompanyCnpj: event.paymentCompanyCnpj || "",
      });
      setObsLen(obs.length);
    } else {
      form.reset({ name: "", location: "", startDate: "", endDate: "", status: "planejado", observations: "", paymentCompanyName: "TATICA MARKETING ESPORTIVO LTDA", paymentCompanyCnpj: "06.103.531/0001-96" });
      setObsLen(0);
    }
    // `open` na lista: garante que reabrir o modal para o MESMO evento recarregue
    // os valores salvos em vez de manter uma edição abandonada.
  }, [event, open, form]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!nameRef.current?.contains(e.target as Node) && !suggRef.current?.contains(e.target as Node))
        setShowSugg(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const saveEvent = useMutation({
    mutationFn: async (data: EventFormData) => {
      if (isEditing && event) return (await apiRequest("PUT", `/api/events/${event.id}`, data)).json();
      return (await apiRequest("POST", "/api/events", data)).json();
    },
    onSuccess: async (criado: { id?: string } | undefined, data) => {
      const cn = data.paymentCompanyName?.trim();
      const cc = data.paymentCompanyCnpj ?? "";
      if (cn && validateCnpj(cc)) {
        const exists = companies.some(c => c.cnpj.replace(/\D/g, "") === cc.replace(/\D/g, ""));
        if (!exists) try { await addCompany.mutateAsync({ name: cn, cnpj: cc }); } catch {}
      }
      // Próximo passo (23/09): evento novo quase sempre segue para a Sugestão de
      // Escala. O toast oferece o atalho e já deixa o evento em foco.
      const novoId = !isEditing ? criado?.id : undefined;
      if (novoId) {
        guardarEventoEmFoco(user?.id, novoId);
        toast({
          title: "Evento criado.",
          description: "Quer montar a escala agora?",
          action: (
            <ToastAction altText="Montar escala deste evento" onClick={() => navegar(hrefComEvento("/scaling-suggestion", novoId, "eventId"))}>
              Montar escala
            </ToastAction>
          ),
        });
      } else {
        toast({ title: isEditing ? "Evento atualizado." : "Evento criado." });
      }
      form.reset();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/events"] }),
        qc.invalidateQueries({ queryKey: ["/api/events?includeDeleted=true"] }),
      ]);
      onClose();
    },
    onError: (e: unknown) => toast({ title: "Erro ao salvar evento", description: apiErrorMessage(e, "Tente novamente."), variant: "destructive" }),
  });

  // "Descartar alterações?" (23/09): Esc e clique fora chamavam `form.reset()`
  // sem perguntar. `isDirty` compara com os valores carregados no `reset` do open.
  const { pedirParaFechar, Dialogo: DialogoDescarte } = useConfirmarDescarte(form.formState.isDirty, { salvando: saveEvent.isPending });
  const handleClose = () => pedirParaFechar(() => { form.reset(); setObsLen(0); setShowSugg(false); setShowManage(false); onClose(); });
  const onSubmit = (d: EventFormData) => saveEvent.mutate(d);
  // Sem isto, um erro de validação em campo sem mensagem (ex.: status legado)
  // fazia o botão "Salvar" não responder, sem nenhum aviso ao usuário.
  const onInvalid = () => toast({ title: "Verifique os campos destacados.", description: "Há informações obrigatórias ou inválidas no formulário.", variant: "destructive" });
  const pickCompany = (c: PaymentCompany) => { form.setValue("paymentCompanyName", c.name, { shouldDirty: true }); form.setValue("paymentCompanyCnpj", c.cnpj, { shouldDirty: true }); setShowSugg(false); };

  const canAddCompany = !!manName.trim() && validateCnpj(manCnpj) && !addCompany.isPending;
  /** A empresa pagadora só se altera com as duas permissões (o evento e a pagadora). */
  const pagadoraTravada = !podeAlterarPagadora || leitura;

  // Cabeçalho da edição: "#nº · status · quando acontece".
  const dsAtual = event ? getEventStatus(event) : null;
  const quando = event ? quandoAcontece(event) : null;
  const titulo = leitura && isEditing ? "Evento" : isEditing ? "Editar evento" : "Novo evento";

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
        <DialogContent className={MOLDURA} data-testid="modal-event">

          {/* ── Cabeçalho: o que é e qual evento ── */}
          <div className="flex items-start gap-3.5 shrink-0 px-5 sm:px-6 pt-4 pb-3.5 pr-14 border-b border-border bg-card relative">
            <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-brand-soft text-primary shrink-0">
              {isEditing
                ? <CalendarCog className="h-5 w-5" aria-hidden="true" />
                : <CalendarPlus className="h-5 w-5" aria-hidden="true" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <DialogTitle className="text-base font-semibold text-foreground leading-6 m-0 p-0">{titulo}</DialogTitle>
                {leitura && (
                  <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md bg-muted text-muted-foreground text-2xs font-medium">
                    <Lock className="w-3 h-3" aria-hidden="true" />Somente leitura
                  </span>
                )}
              </div>
              <DialogDescription asChild>
                {event ? (
                  <div className="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground leading-5">
                    <span className="font-mono font-semibold text-primary">#{event.eventNumber}</span>
                    {dsAtual && <EventStatusBadge ds={dsAtual} />}
                    {quando && <span>{quando}</span>}
                  </div>
                ) : (
                  <p className="m-0 mt-0.5 text-xs text-muted-foreground leading-5">O básico do evento. A escala, as passagens e a hospedagem vêm depois.</p>
                )}
              </DialogDescription>
            </div>
            <button type="button" onClick={handleClose} aria-label="Fechar"
              className="pas-alvo absolute right-3 top-3 flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* ── Corpo ── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 bg-surface-muted/60">
            {leitura && (
              <p className="m-0 mb-3 flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-xs leading-5 text-slate-600" data-testid="aviso-somente-leitura">
                <Info className="w-3.5 h-3.5 mt-[3px] shrink-0 text-muted-foreground" aria-hidden="true" />
                Só administradores, Compras e Logística Interna alteram eventos.
              </p>
            )}
            <Form {...form}>
              <form id="event-form" onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate>
                <div className="flex flex-col gap-3">

                  {/* Evento: nome + local */}
                  <section className={SECAO} aria-labelledby="evt-sec-evento">
                    <TituloDaSecao icone={Flag}><span id="evt-sec-evento">Evento</span></TituloDaSecao>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                      <FormField control={form.control} name="name" render={({ field, fieldState }) => (
                        <div>
                          <label htmlFor="event-name" className={LABEL}>Nome do evento{!leitura && REQ}</label>
                          <Input id="event-name" placeholder="Ex.: Maratona do Rio 2026" data-testid="input-event-name" className={IC} disabled={leitura}
                            aria-required="true" {...campoComErro("event-name", fieldState.error?.message)} {...field} />
                          <MensagemDeErro id="event-name" erro={fieldState.error?.message} />
                        </div>
                      )} />
                      <FormField control={form.control} name="location" render={({ field, fieldState }) => (
                        <div>
                          <label htmlFor="event-location" className={LABEL}>Local{!leitura && REQ}</label>
                          <Input id="event-location" placeholder="Ex.: Aterro do Flamengo, Rio de Janeiro - RJ" data-testid="input-event-location" className={IC} disabled={leitura}
                            aria-required="true" {...campoComErro("event-location", fieldState.error?.message)} {...field} />
                          <MensagemDeErro id="event-location" erro={fieldState.error?.message} />
                        </div>
                      )} />
                    </div>
                  </section>

                  {/* Período: início + fim, e quantos dias */}
                  <section className={SECAO} aria-labelledby="evt-sec-periodo">
                    <TituloDaSecao icone={CalendarRange} extra={dias ? (
                      <span className="pas-entra text-xs text-muted-foreground tabular-nums" data-testid="duracao-evento">
                        {dias === 1 ? "1 dia de evento" : `${dias} dias de evento`}
                      </span>
                    ) : undefined}>
                      <span id="evt-sec-periodo">Período</span>
                    </TituloDaSecao>
                    <div className="grid grid-cols-2 gap-x-3 sm:gap-x-4 gap-y-3">
                      <FormField control={form.control} name="startDate" render={({ field, fieldState }) => (
                        <div className="min-w-0">
                          <label htmlFor="event-start-date" className={LABEL}>Início{!leitura && REQ}</label>
                          <Input id="event-start-date" type="date" data-testid="input-event-start-date" className={cn(IC, "tabular-nums")} disabled={leitura}
                            aria-required="true" {...campoComErro("event-start-date", fieldState.error?.message)} {...field} />
                          <MensagemDeErro id="event-start-date" erro={fieldState.error?.message} />
                        </div>
                      )} />
                      <FormField control={form.control} name="endDate" render={({ field, fieldState }) => (
                        <div className="min-w-0">
                          <label htmlFor="event-end-date" className={LABEL}>Fim{!leitura && REQ}</label>
                          <Input id="event-end-date" type="date" min={inicio || undefined} data-testid="input-event-end-date" className={cn(IC, "tabular-nums")} disabled={leitura}
                            aria-required="true" {...campoComErro("event-end-date", fieldState.error?.message)} {...field} />
                          <MensagemDeErro id="event-end-date" erro={fieldState.error?.message} />
                        </div>
                      )} />
                    </div>
                  </section>

                  {/* Situação (só edição): as opções à vista e a regra dita */}
                  {isEditing && (
                    <FormField control={form.control} name="status" render={({ field, fieldState }) => (
                      <section className={SECAO} aria-labelledby="evt-sec-situacao">
                        <TituloDaSecao icone={CalendarDays}><span id="evt-sec-situacao">Situação</span></TituloDaSecao>
                        <div role="radiogroup" aria-labelledby="evt-sec-situacao" data-testid="select-event-status"
                          className="inline-flex flex-wrap gap-1 p-1 rounded-lg border border-border bg-surface-muted">
                          {(["planejado", "concluído", ...(podeExcluir ? ["excluído"] as const : [])] as StatusDoFormulario[]).map(v => {
                            const marcado = field.value === v;
                            return (
                              <button
                                key={v} type="button" role="radio" aria-checked={marcado} disabled={leitura}
                                onClick={() => field.onChange(v)}
                                className={cn(
                                  "pas-alvo h-8 px-3 rounded-md text-sm transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                                  marcado
                                    ? cn("bg-card font-medium shadow-1", v === "excluído" ? "text-danger" : v === "concluído" ? "text-success" : "text-primary")
                                    : "text-slate-600 hover:text-foreground enabled:hover:bg-card/60",
                                )}
                                data-testid={`select-event-status-opcao-${v}`}
                              >
                                {v === "planejado" ? "Planejado" : v === "concluído" ? "Concluído" : "Excluído"}
                              </button>
                            );
                          })}
                        </div>
                        <p className="m-0 mt-2 text-xs leading-5 text-muted-foreground">
                          “Em andamento” é automático: vale do início ao fim do evento.
                        </p>
                        <MensagemDeErro id="event-status" erro={fieldState.error?.message} />
                      </section>
                    )} />
                  )}

                  {/* ── Empresa pagadora ── */}
                  <section className={SECAO} aria-labelledby="evt-sec-pagadora">
                    <TituloDaSecao icone={Landmark} extra={podeAlterarPagadora ? (
                      <button type="button" onClick={() => setShowManage(true)}
                        className="pas-alvo inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium text-primary hover:bg-brand-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        Gerenciar{companies.length > 0 ? ` (${companies.length})` : ""}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
                        <Lock className="w-3 h-3" aria-hidden="true" />Só o financeiro altera a empresa pagadora.
                      </span>
                    )}>
                      <span id="evt-sec-pagadora">Empresa pagadora</span>
                      {isSaved && <span className="ml-1 normal-case tracking-normal text-2xs font-medium text-success bg-success-soft px-1.5 py-px rounded">Salva</span>}
                      {isNew   && <span className="ml-1 normal-case tracking-normal text-2xs font-medium text-primary bg-brand-soft px-1.5 py-px rounded">Nova</span>}
                      {!isSaved && !isNew && <span className="ml-1 normal-case tracking-normal font-normal text-muted-foreground">· opcional</span>}
                    </TituloDaSecao>

                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-x-3 gap-y-3">
                      <FormField control={form.control} name="paymentCompanyName" render={({ field, fieldState }) => (
                        <div>
                          <label htmlFor="event-company-name" className={LABEL}>Nome da empresa</label>
                          <div className="relative">
                            <input id="event-company-name" placeholder="Digite para buscar…" autoComplete="off"
                              role="combobox" aria-expanded={showSugg && filtered.length > 0} aria-autocomplete="list"
                              aria-controls="event-company-sugestoes"
                              className={cn("flex h-10 w-full rounded-lg border border-input px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", IC)}
                              {...campoComErro("event-company-name", fieldState.error?.message)}
                              {...field}
                              disabled={pagadoraTravada}
                              ref={(el) => { field.ref(el); nameRef.current = el; }}
                              onFocus={() => setShowSugg(true)}
                              onChange={e => { field.onChange(e); setShowSugg(true); }} />
                            {showSugg && filtered.length > 0 && !pagadoraTravada && (
                              <div ref={suggRef} id="event-company-sugestoes" className="pas-entra absolute z-[60] top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-2 overflow-hidden">
                                <p className="m-0 px-3 pt-2 pb-1 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Empresas salvas</p>
                                <div className="max-h-[208px] overflow-y-auto p-1">
                                  {filtered.map(c => (
                                    <button key={c.id} type="button" onMouseDown={e => { e.preventDefault(); pickCompany(c); }}
                                      className="w-full text-left px-2.5 py-2 rounded-md hover:bg-muted transition-colors">
                                      <p className="text-sm font-medium text-foreground m-0 truncate">{c.name}</p>
                                      <p className="text-2xs text-muted-foreground m-0 font-mono">{c.cnpj}</p>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <MensagemDeErro id="event-company-name" erro={fieldState.error?.message} />
                        </div>
                      )} />

                      <FormField control={form.control} name="paymentCompanyCnpj" render={({ field, fieldState }) => (
                        <div>
                          <label htmlFor="event-company-cnpj" className={LABEL}>CNPJ</label>
                          <CnpjInput id="event-company-cnpj" value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name}
                            disabled={pagadoraTravada}
                            {...campoComErro("event-company-cnpj", fieldState.error?.message)}
                            className={cn(IC, "border-input")} />
                          <MensagemDeErro id="event-company-cnpj" erro={fieldState.error?.message} />
                        </div>
                      )} />
                    </div>
                  </section>

                  {/* ── Observações ── */}
                  <FormField control={form.control} name="observations" render={({ field, fieldState }) => (
                    <section className={SECAO} aria-labelledby="evt-sec-obs">
                      <TituloDaSecao icone={StickyNote} extra={
                        <span className={cn("text-2xs tabular-nums", obsLen > 450 ? "text-warning font-medium" : "text-muted-foreground")} aria-live="polite">{obsLen}/500</span>
                      }>
                        <label id="evt-sec-obs" htmlFor="event-observations" className="cursor-default">Observações</label>
                        <span className="normal-case tracking-normal font-normal text-muted-foreground">· opcional</span>
                      </TituloDaSecao>
                      <Textarea id="event-observations" rows={3} maxLength={500} placeholder="Notas adicionais, requisitos específicos…"
                        data-testid="textarea-event-observations" disabled={leitura}
                        className="text-sm resize-none rounded-lg bg-card px-3 py-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:opacity-100 disabled:bg-surface-muted disabled:text-slate-600"
                        {...field} onChange={e => { field.onChange(e); setObsLen(e.target.value.length); }} />
                      <MensagemDeErro id="event-observations" erro={fieldState.error?.message} />
                    </section>
                  )} />

                </div>
              </form>
            </Form>
          </div>

          {/* ── Rodapé ── */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0 px-5 sm:px-6 py-3 border-t border-border bg-surface-muted">
            {/* Espelho Operacional (só edição): atalho para outra tela, não um campo. */}
            {isEditing && event && (
              <a
                href={`/operational-mirror?eventId=${event.id}`}
                data-testid="link-operational-mirror"
                className="pas-alvo mr-auto inline-flex items-center gap-1.5 h-9 px-2 -ml-2 rounded-lg text-sm font-medium text-primary no-underline hover:bg-brand-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Table2 className="w-4 h-4" aria-hidden="true" />
                Abrir espelho operacional
              </a>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={handleClose} data-testid="button-cancel-event" className="h-9 rounded-lg px-4 text-sm font-medium">
                {leitura ? "Fechar" : "Cancelar"}
              </Button>
              {!leitura && (
                <Button type="submit" form="event-form" disabled={saveEvent.isPending} aria-busy={saveEvent.isPending} data-testid="button-save-event"
                  className="h-9 rounded-lg px-4 text-sm font-semibold gap-2 bg-primary hover:bg-primary-hover text-primary-foreground">
                  {saveEvent.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Salvando…</>
                    : <><Check className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" /> {isEditing ? "Salvar alterações" : "Criar evento"}</>
                  }
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Gerenciar empresas ── */}
      <Dialog open={showManage} onOpenChange={v => { setShowManage(v); if (!v) { setManName(""); setManCnpj(""); setRemovendo(null); } }}>
        <DialogContent className="p-0 gap-0 sm:max-w-[440px] rounded-xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[80vh]">

          <div className="flex items-start gap-3 shrink-0 px-5 pt-4 pb-3.5 pr-14 border-b border-border relative">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-brand-soft text-primary shrink-0">
              <Landmark className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-semibold text-foreground leading-6 m-0">Empresas salvas</DialogTitle>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-muted text-2xs font-semibold tabular-nums text-muted-foreground">{companies.length}</span>
              </div>
              <DialogDescription className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
                Aparecem como sugestão no campo da empresa pagadora.
              </DialogDescription>
            </div>
            <button type="button" onClick={() => setShowManage(false)} aria-label="Fechar empresas salvas"
              className="pas-alvo absolute right-3 top-3 flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="w-4 h-4" aria-hidden="true" /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {companies.length === 0 ? (
              <div className="flex flex-col items-center text-center py-8 text-muted-foreground">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted mb-2.5" aria-hidden="true"><Landmark className="h-5 w-5" /></span>
                <p className="text-sm font-medium text-foreground m-0">Nenhuma empresa salva</p>
                <p className="text-xs m-0 mt-0.5">Cadastre abaixo ou salve um evento com uma empresa nova.</p>
              </div>
            ) : (
              <ul className="m-0 p-0 list-none flex flex-col">
                {companies.map(c => (
                  <li key={c.id} className={cn("flex items-center gap-2 min-h-[52px] px-2.5 py-2 rounded-lg transition-colors", removendo === c.id ? "bg-danger-soft" : "hover:bg-muted/60")}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground m-0 truncate">{c.name}</p>
                      <p className="text-2xs text-muted-foreground m-0 font-mono">{c.cnpj}</p>
                    </div>
                    {removendo === c.id ? (
                      <div className="pas-entra flex items-center gap-1 shrink-0">
                        <span className="text-xs text-danger font-medium mr-1">Remover?</span>
                        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-md px-2.5 text-xs" onClick={() => setRemovendo(null)}>Não</Button>
                        <Button type="button" size="sm" disabled={delCompany.isPending}
                          className="h-8 rounded-md px-2.5 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => delCompany.mutate(c.id, { onSettled: () => setRemovendo(null) })}>
                          {delCompany.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : "Remover"}
                        </Button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setRemovendo(c.id)} disabled={delCompany.isPending}
                        aria-label={`Remover empresa ${c.name}`}
                        className="pas-alvo flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground shrink-0 hover:bg-danger-soft hover:text-danger-strong transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 px-5 py-3.5 border-t border-border bg-surface-muted">
            <p className="m-0 mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Adicionar empresa</p>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_188px] gap-2 mb-2.5">
              <div>
                <label htmlFor="manage-company-name" className={LABEL}>Nome</label>
                <Input id="manage-company-name" value={manName} onChange={e => setManName(e.target.value)} placeholder="Nome da empresa"
                  className="h-9 text-sm rounded-lg bg-card" />
              </div>
              <div>
                <label htmlFor="manage-company-cnpj" className={LABEL}>CNPJ</label>
                <CnpjInput id="manage-company-cnpj" value={manCnpj} onChange={setManCnpj} name="manCnpj" className="h-9 text-sm border-input rounded-lg bg-card" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-2xs text-muted-foreground">
                {manCnpj && !validateCnpj(manCnpj) ? <span className="text-danger">CNPJ incompleto ou inválido.</span> : "Nome e CNPJ válido para cadastrar."}
              </span>
              <Button type="button" onClick={async () => {
                if (!canAddCompany) return;
                const exists = companies.some(c => c.cnpj.replace(/\D/g, "") === manCnpj.replace(/\D/g, ""));
                if (exists) { toast({ title: "CNPJ já cadastrado.", variant: "destructive" }); return; }
                // Sem o try/catch a falha virava unhandled rejection (o toast de erro
                // vem do onError da mutação) e o "Empresa cadastrada." nunca aparecia.
                try {
                  await addCompany.mutateAsync({ name: manName.trim(), cnpj: manCnpj });
                  setManName(""); setManCnpj("");
                  toast({ title: "Empresa cadastrada." });
                } catch { /* onError da mutação já notifica */ }
              }} disabled={!canAddCompany}
                className="h-9 shrink-0 rounded-lg px-3.5 text-sm font-semibold gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground">
                {addCompany.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />} Cadastrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {DialogoDescarte}
    </>
  );
}
