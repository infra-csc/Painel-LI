/**
 * O formulário de solicitação de bagagem, agora em modal.
 *
 * Ele abria a tela: 10 campos obrigatórios ocupando os primeiros ~500px, com a
 * lista — o conteúdo — começando só depois. Quem entrava para consultar, que é
 * a maioria das visitas, rolava um formulário inteiro. E "Editar" chamava
 * `scrollIntoView` no formulário, arrancando a pessoa do lugar da lista onde
 * ela estava e não devolvendo.
 *
 * **Nenhum campo saiu**: evento, colaborador, LOC, CIA (com o texto livre de
 * "Outros"), valor, OS, quantidade, agência (idem), as duas datas e as
 * observações continuam todos aqui, com os mesmos ids, `aria-invalid` e
 * mensagens de erro.
 */
import { useState } from "react";
import { AlertCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { parseBrNumber, fixEncoding } from "@/lib/utils";
import {
  AGENCIAS_FIXAS, CIAS_FIXAS, CIA_STYLE, TYPE_LABEL, contarObrigatorios, emptyForm,
  formatCurrency, formatCpf, fmtDate, getCpf, toTitleCase,
  type BaggageRequestItem, type CiaGroup, type CollaboratorItem, type EventOption,
  type FormErrors, type FormState,
} from "./baggage-core";
import { validate, type AgregadoDoColaborador } from "./baggage-logic";
import { CollaboratorCombobox, EventCombobox } from "./baggage-comboboxes";

const LBL = "text-[10px] font-bold text-[#64748B] uppercase tracking-widest block mb-1.5";
const INPUT = "h-9 text-xs rounded-lg border-gray-200";
const SELECT = "w-full h-9 text-xs rounded-lg border border-gray-200 px-2 bg-white text-slate-700 focus:outline-none focus:border-blue-400";

export default function BaggageFormModal({
  open, onOpenChange, form, setForm, errors, editing, eventOptions, colaboradoresAtivos,
  colaboradorSelecionado, agregadoDoColaborador, locDuplicado, getCollabName, salvando, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: FormState;
  setForm: (f: (prev: FormState) => FormState) => void;
  errors: FormErrors;
  /** A solicitação em edição, ou null quando é registro novo. */
  editing: BaggageRequestItem | null;
  eventOptions: EventOption[];
  colaboradoresAtivos: CollaboratorItem[];
  colaboradorSelecionado: CollaboratorItem | undefined;
  agregadoDoColaborador: AgregadoDoColaborador | undefined;
  /** Outra solicitação com o mesmo LOC, se houver. */
  locDuplicado: BaggageRequestItem | null;
  getCollabName: (id: string) => string;
  salvando: boolean;
  onSubmit: () => void;
}) {
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const { preenchidos, total } = contarObrigatorios(form);
  const faltam = total - preenchidos;
  /*
   * A barra conta seis grupos, mas `validate` cobre dez: CIA e agência com
   * "Outros" pedem o texto livre, e a data da solicitação pode ser apagada
   * depois de nascer preenchida. Sem esta conta o rodapé dizia "Tudo
   * preenchido" enquanto o salvar recusava — a barra prometendo o que o botão
   * não entrega.
   */
  const pendenciasReais = Object.keys(validate(form)).length;

  const fieldError = (key: string, id: string) =>
    errors[key] ? <p id={id} className="text-[10px] text-[#B91C1C] mt-1" role="alert">{errors[key]}</p> : null;

  /*
   * "Sujo" é ter qualquer coisa diferente do formulário em branco. Ao editar,
   * o formulário nasce cheio e fechar sem mexer é o caso comum — por isso a
   * confirmação de descarte só existe no registro novo.
   */
  const sujo = !editing && (
    Object.keys(emptyForm) as (keyof FormState)[]
  ).some(k => form[k] !== emptyForm[k]);

  const tentarFechar = () => {
    if (sujo) { setConfirmarDescarte(true); return; }
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) tentarFechar(); }}>
        <DialogContent className="max-w-[880px] w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0 rounded-2xl overflow-hidden" data-testid="dialog-baggage-form">
          <DialogHeader className="shrink-0 px-6 pt-5 pb-3">
            <DialogTitle className="text-[17px] font-bold text-slate-900">
              {editing ? "Editar solicitação de bagagem" : "Nova solicitação de bagagem"}
            </DialogTitle>
            <DialogDescription className="text-[12px] text-[#64748B]">
              {editing
                ? `LOC ${editing.loc} · registrada em ${fmtDate(editing.requestDate)}`
                : "Bagagem despachada por colaborador e evento."}
            </DialogDescription>
          </DialogHeader>

          {/* Progresso dos obrigatórios — valores reais, não decoração. */}
          <div className="shrink-0 px-6 pb-3 flex items-center gap-3" data-testid="progresso-obrigatorios">
            <div
              className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"
              role="progressbar"
              aria-valuenow={preenchidos}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label="Campos obrigatórios preenchidos"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-200 ${preenchidos === total ? "bg-[#059669]" : "bg-primary"}`}
                style={{ width: `${(preenchidos / total) * 100}%` }}
              />
            </div>
            <span className="text-[12px] text-[#64748B] tabular-nums whitespace-nowrap">
              {preenchidos} de {total} campos obrigatórios
            </span>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-4">
            {/* Região aria-live com o resumo dos erros */}
            <div aria-live="polite" className="sr-only">
              {Object.values(errors).filter(Boolean).join(". ")}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="bg-event" className={LBL}>Evento *</label>
                <EventCombobox
                  id="bg-event"
                  events={eventOptions}
                  value={form.eventId}
                  onChange={eventId => setForm(f => ({ ...f, eventId }))}
                  placeholder="Buscar evento por nome ou cidade..."
                  invalid={!!errors.eventId}
                  describedBy={errors.eventId ? "bg-event-err" : undefined}
                />
                {fieldError("eventId", "bg-event-err")}
              </div>

              <div>
                <label htmlFor="bg-collab" className={LBL}>Colaborador *</label>
                <CollaboratorCombobox
                  id="bg-collab"
                  collaborators={colaboradoresAtivos}
                  value={form.collaboratorId}
                  onChange={collaboratorId => setForm(f => ({ ...f, collaboratorId }))}
                  invalid={!!errors.collaboratorId}
                  describedBy={errors.collaboratorId ? "bg-collab-err" : undefined}
                />
                {fieldError("collaboratorId", "bg-collab-err")}
              </div>
            </div>

            {/* Painel de contexto do colaborador selecionado */}
            {colaboradorSelecionado && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 border border-gray-100 px-3.5 py-2.5" data-testid="contexto-colaborador">
                <p className="text-xs font-semibold text-slate-700">
                  {toTitleCase(fixEncoding(colaboradorSelecionado.fullName))}
                </p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 uppercase tracking-wide">
                  {TYPE_LABEL[colaboradorSelecionado.type || ""] || colaboradorSelecionado.type || "—"}
                </span>
                <span className="text-[11px] text-[#64748B]">
                  {agregadoDoColaborador
                    ? `${agregadoDoColaborador.totalBags} ${agregadoDoColaborador.totalBags === 1 ? "bagagem registrada" : "bagagens registradas"} no sistema`
                    : "Nenhuma bagagem registrada no sistema"}
                </span>
                {agregadoDoColaborador && (
                  <span className="flex items-center gap-1.5">
                    {(Object.keys(agregadoDoColaborador.byCia) as CiaGroup[])
                      .filter(g => agregadoDoColaborador.byCia[g] > 0)
                      .map(g => (
                        <span key={g} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CIA_STYLE[g].badge}`}>
                          {g}: {agregadoDoColaborador.byCia[g]}
                        </span>
                      ))}
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <div>
                <label htmlFor="bg-loc" className={LBL}>LOC *</label>
                <Input
                  id="bg-loc"
                  value={form.loc}
                  onChange={e => setForm(f => ({ ...f, loc: e.target.value.toUpperCase() }))}
                  placeholder="ABC123"
                  aria-invalid={!!errors.loc}
                  aria-describedby={errors.loc ? "bg-loc-err" : undefined}
                  className={`${INPUT} font-mono uppercase`}
                />
                {fieldError("loc", "bg-loc-err")}
              </div>

              <div>
                <label htmlFor="bg-cia" className={LBL}>CIA *</label>
                <select
                  id="bg-cia"
                  value={form.ciaSelect}
                  onChange={e => setForm(f => ({ ...f, ciaSelect: e.target.value }))}
                  className={SELECT}
                >
                  {CIAS_FIXAS.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="Outros">Outros</option>
                </select>
                {form.ciaSelect === "Outros" && (
                  <Input
                    id="bg-cia-other"
                    value={form.ciaOther}
                    onChange={e => setForm(f => ({ ...f, ciaOther: e.target.value }))}
                    placeholder="Nome da companhia"
                    aria-label="Nome da companhia aérea"
                    aria-invalid={!!errors.cia}
                    aria-describedby={errors.cia ? "bg-cia-err" : undefined}
                    className={`${INPUT} mt-1.5`}
                  />
                )}
                {fieldError("cia", "bg-cia-err")}
              </div>

              <div>
                <label htmlFor="bg-value" className={LBL}>Valor (R$) *</label>
                <Input
                  id="bg-value"
                  value={form.valueText}
                  onChange={e => setForm(f => ({ ...f, valueText: e.target.value }))}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-invalid={!!errors.value}
                  aria-describedby={errors.value ? "bg-value-err" : undefined}
                  className={`${INPUT} font-mono`}
                />
                {!errors.value && form.valueText.trim() && /\d/.test(form.valueText) && (
                  <p className="text-[10px] text-[#64748B] mt-1 font-mono" aria-live="polite">
                    = {formatCurrency(Math.round(parseBrNumber(form.valueText) * 100))}
                  </p>
                )}
                {fieldError("value", "bg-value-err")}
              </div>

              <div>
                <label htmlFor="bg-os" className={LBL}>OS *</label>
                <Input
                  id="bg-os"
                  value={form.os}
                  onChange={e => setForm(f => ({ ...f, os: e.target.value }))}
                  placeholder="Nº da OS"
                  aria-invalid={!!errors.os}
                  aria-describedby={errors.os ? "bg-os-err" : undefined}
                  className={INPUT}
                />
                {fieldError("os", "bg-os-err")}
              </div>

              <div>
                <label htmlFor="bg-qty" className={LBL}>Quantidade *</label>
                <Input
                  id="bg-qty"
                  type="number"
                  min={1}
                  step={1}
                  value={form.quantityText}
                  onChange={e => setForm(f => ({ ...f, quantityText: e.target.value }))}
                  aria-invalid={!!errors.quantity}
                  aria-describedby={errors.quantity ? "bg-qty-err" : undefined}
                  className={INPUT}
                />
                {fieldError("quantity", "bg-qty-err")}
              </div>

              <div>
                <label htmlFor="bg-agency" className={LBL}>Agência *</label>
                <select
                  id="bg-agency"
                  value={form.agencySelect}
                  onChange={e => setForm(f => ({ ...f, agencySelect: e.target.value }))}
                  className={SELECT}
                >
                  {AGENCIAS_FIXAS.map(a => <option key={a} value={a}>{a}</option>)}
                  <option value="Outros">Outros</option>
                </select>
                {form.agencySelect === "Outros" && (
                  <Input
                    id="bg-agency-other"
                    value={form.agencyOther}
                    onChange={e => setForm(f => ({ ...f, agencyOther: e.target.value }))}
                    placeholder="Nome da agência"
                    aria-label="Nome da agência"
                    aria-invalid={!!errors.agency}
                    aria-describedby={errors.agency ? "bg-agency-err" : undefined}
                    className={`${INPUT} mt-1.5`}
                  />
                )}
                {fieldError("agency", "bg-agency-err")}
              </div>

              <div>
                <label htmlFor="bg-request-date" className={LBL}>Data da solicitação *</label>
                <Input
                  id="bg-request-date"
                  type="date"
                  value={form.requestDate}
                  onChange={e => setForm(f => ({ ...f, requestDate: e.target.value }))}
                  aria-invalid={!!errors.requestDate}
                  aria-describedby={errors.requestDate ? "bg-request-date-err" : undefined}
                  className={INPUT}
                />
                {fieldError("requestDate", "bg-request-date-err")}
              </div>

              <div>
                <label htmlFor="bg-boarding-date" className={LBL}>Data do embarque *</label>
                <Input
                  id="bg-boarding-date"
                  type="date"
                  min={form.requestDate || undefined}
                  value={form.boardingDate}
                  onChange={e => setForm(f => ({ ...f, boardingDate: e.target.value }))}
                  aria-invalid={!!errors.boardingDate}
                  aria-describedby={errors.boardingDate ? "bg-boarding-date-err" : undefined}
                  className={INPUT}
                />
                {fieldError("boardingDate", "bg-boarding-date-err")}
              </div>
            </div>

            {/*
              LOC repetido não é erro — bagagem extra do mesmo bilhete acontece.
              Mas quem digita um LOC já existente quase sempre está duplicando
              por engano, e sem o aviso só descobre na conferência.
            */}
            {locDuplicado && (
              <div className="mt-4 rounded-xl bg-[#FEF3C7] px-3.5 py-2.5 flex items-start gap-2" role="status" data-testid="aviso-loc-duplicado">
                <AlertCircle className="w-4 h-4 text-[#92400E] shrink-0 mt-px" aria-hidden="true" />
                <p className="text-[12px] text-[#92400E] leading-snug">
                  <span className="font-mono font-semibold">{locDuplicado.loc}</span> já está registrado para{" "}
                  <strong>{getCollabName(locDuplicado.collaboratorId)}</strong>, embarque {fmtDate(locDuplicado.boardingDate)}.
                  Se for bagagem extra do mesmo bilhete, aumente a quantidade em vez de criar outra.
                </p>
              </div>
            )}

            <div className="mt-4">
              <label htmlFor="bg-notes" className={LBL}>Observações (opcional)</label>
              <Input
                id="bg-notes"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Ex.: bagagem extra de equipamento"
                className={INPUT}
              />
            </div>
          </div>

          {/*
            O rodapé diz o que falta em palavras. Uma barra sozinha mostra que
            algo está incompleto, mas não o quê — e "nada é salvo até você
            registrar" responde a pergunta que faz a pessoa hesitar em fechar.
          */}
          <div className="shrink-0 px-6 py-3 border-t border-border bg-[#F8FAFC] flex items-center gap-3 flex-wrap">
            <p className="text-[12px] text-[#64748B]" data-testid="rodape-obrigatorios">
              {faltam > 0
                ? `Faltam ${faltam} ${faltam === 1 ? "campo obrigatório" : "campos obrigatórios"} — nada é salvo até você ${editing ? "salvar" : "registrar"}.`
                : pendenciasReais > 0
                  ? "Revise os campos marcados antes de salvar."
                  : "Tudo preenchido."}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" className="h-10 rounded-lg" onClick={tentarFechar} data-testid="button-cancel-form">
                Cancelar
              </Button>
              <Button
                onClick={onSubmit}
                disabled={salvando}
                className="h-10 px-4 rounded-lg bg-primary hover:bg-primary-hover text-white text-[13px] font-semibold"
                data-testid="button-submit-baggage"
              >
                <Save className="w-4 h-4 mr-1.5" aria-hidden="true" />
                {salvando ? "Salvando..." : editing ? "Salvar alterações" : "Registrar solicitação"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarDescarte} onOpenChange={setConfirmarDescarte}>
        <AlertDialogContent className="max-w-[420px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você preencheu campos que ainda não foram registrados. Fechar agora perde o que foi digitado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-keep-editing">Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmarDescarte(false); onOpenChange(false); }}
              className="bg-[#B91C1C] hover:bg-[#991B1B]"
              data-testid="button-discard-form"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
