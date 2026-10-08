/**
 * O formulário de solicitação de bagagem, em modal.
 *
 * Ele abria a tela: 10 campos obrigatórios ocupando os primeiros ~500px, com a
 * lista — o conteúdo — começando só depois. Quem entrava para consultar, que é
 * a maioria das visitas, rolava um formulário inteiro. E "Editar" chamava
 * `scrollIntoView` no formulário, arrancando a pessoa do lugar da lista onde
 * ela estava e não devolvendo.
 *
 * 08/10 (redesenho): o mesmo desenho dos registros de Passagens e Hospedagem —
 * cabeçalho com o que é, de quem e a situação; o corpo em seções com título
 * discreto (quem e onde · bilhete · bagagem e datas · observações), rótulos em
 * caixa normal, campos de 40px; rodapé fixo que diz o que falta em palavras.
 * Era uma grade de 4 × 2 em que LOC, CIA, valor e OS se misturavam com as
 * datas, e o topo dos campos dançava quando "Outros" abria o texto livre.
 * A companhia virou um seletor de quatro botões com a cor de cada uma (é a
 * escolha mais repetida do formulário: um clique em vez de abrir uma lista), a
 * quantidade ganhou − / +, o valor o "R$" na frente, e as observações viraram
 * texto de duas linhas. No celular o modal ocupa a tela inteira.
 *
 * **Nenhum campo saiu**: evento, colaborador, LOC, CIA (com o texto livre de
 * "Outros"), valor, OS, quantidade, agência (idem), as duas datas e as
 * observações continuam todos aqui, com os mesmos ids, `aria-invalid` e
 * mensagens de erro.
 */
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import {
  AlertCircle, CalendarDays, Check, Loader2, Luggage, Minus, NotebookPen, Plus, Ticket, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from "@/components/ui/dialog";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { parseBrNumber, fixEncoding } from "@/lib/utils";
import { toTitleCase } from "@/lib/format";
import {
  AGENCIAS_FIXAS, CIAS_FIXAS, CIA_COR, CIA_STYLE, TYPE_LABEL, ciaGroup, contarObrigatorios, emptyForm,
  formatCurrency, fmtDate,
  type BaggageRequestItem, type CiaGroup, type CollaboratorItem, type EventOption,
  type FormErrors, type FormState,
} from "./baggage-core";
import { validate, type AgregadoDoColaborador } from "./baggage-logic";
import { CollaboratorCombobox, EventCombobox } from "./baggage-comboboxes";
import { RequiredMark } from "@/components/forms/required-mark";

/** Rótulo dos campos — o mesmo dos formulários de Passagens e Hospedagem. */
const LBL = "text-xs font-medium text-slate-600 mb-1.5 block";
/** Título de seção — o mesmo dos registros das irmãs. */
const SECAO = "m-0 mb-3 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";
/** Cartão de seção do formulário (o mesmo de Passagens e Hospedagem). */
const CARTAO = "bg-card border border-border rounded-xl p-4";
/** Moldura: 880px no desktop, tela inteira no celular — como o registro de Hospedagem. */
const MOLDURA = "!max-w-[880px] w-[95vw] max-h-[90vh] !flex !flex-col p-0 gap-0 rounded-xl overflow-hidden max-sm:w-full max-sm:!max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0";

const COMPANHIAS: CiaGroup[] = [...CIAS_FIXAS, "Outros"];

function Secao({ icone: Icone, titulo, children, testid }: {
  icone: typeof Users; titulo: string; children: ReactNode; testid?: string;
}) {
  return (
    <section className={CARTAO} aria-label={titulo} data-testid={testid}>
      <h3 className={SECAO}><Icone className="w-3.5 h-3.5" aria-hidden="true" />{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * A companhia em quatro botões (um grupo de rádio de verdade: setas trocam,
 * Tab entra e sai). O ponto tem a cor da companhia — a mesma da fila e da
 * borda da linha na lista.
 */
function SeletorDeCompanhia({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const mover = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const idx = Math.max(0, COMPANHIAS.indexOf(valor as CiaGroup));
    const prox = COMPANHIAS[(idx + passo + COMPANHIAS.length) % COMPANHIAS.length];
    onChange(prox);
    document.getElementById(`bg-cia-${prox.toLowerCase()}`)?.focus();
  };
  return (
    <div
      id="bg-cia"
      role="radiogroup"
      aria-labelledby="bg-cia-rotulo"
      className="grid grid-cols-4 gap-1 h-10 p-1 rounded-lg border border-border bg-surface-muted"
    >
      {COMPANHIAS.map((c) => {
        const on = valor === c;
        return (
          <button
            key={c}
            id={`bg-cia-${c.toLowerCase()}`}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(c)}
            onKeyDown={mover}
            className={`pas-alvo inline-flex items-center justify-center gap-1.5 min-w-0 rounded-md text-xs font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              on ? "bg-card text-foreground shadow-1 ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
            data-testid={`bg-cia-${c.toLowerCase()}`}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CIA_COR[c] }} aria-hidden="true" />
            <span className="truncate">{c}</span>
          </button>
        );
      })}
    </div>
  );
}

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
  const { preenchidos, total } = contarObrigatorios(form);
  const faltam = total - preenchidos;
  const completo = faltam === 0;
  /*
   * A barra conta seis grupos, mas `validate` cobre dez: CIA e agência com
   * "Outros" pedem o texto livre, e a data da solicitação pode ser apagada
   * depois de nascer preenchida. Sem esta conta o rodapé dizia "Tudo
   * preenchido" enquanto o salvar recusava — a barra prometendo o que o botão
   * não entrega.
   */
  const pendenciasReais = Object.keys(validate(form)).length;

  const fieldError = (key: string, id: string) =>
    errors[key] ? <p id={id} className="pas-entra m-0 mt-1 text-2xs text-danger" role="alert">{errors[key]}</p> : null;

  /*
   * "Sujo" é ter qualquer coisa diferente do formulário em branco. Ao editar,
   * o formulário nasce cheio e fechar sem mexer é o caso comum — por isso a
   * confirmação de descarte só existe no registro novo.
   */
  const sujo = !editing && (
    Object.keys(emptyForm) as (keyof FormState)[]
  ).some(k => form[k] !== emptyForm[k]);

  // Diálogo único de descarte (23/09): o mesmo texto de todos os formulários.
  const { pedirParaFechar, Dialogo: DialogoDescarte } = useConfirmarDescarte(sujo, { salvando });
  const tentarFechar = () => pedirParaFechar(() => onOpenChange(false));

  const quantidade = parseInt(form.quantityText, 10);
  const passoDaQuantidade = (delta: number) => setForm(f => {
    const atual = parseInt(f.quantityText, 10);
    const base = Number.isNaN(atual) ? 1 : atual;
    return { ...f, quantityText: String(Math.max(1, base + delta)) };
  });

  const grupoEditado = editing ? ciaGroup(editing.cia) : null;
  const tipoDoColaborador = colaboradorSelecionado
    ? TYPE_LABEL[colaboradorSelecionado.type || ""] || colaboradorSelecionado.type || null
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) tentarFechar(); }}>
        <DialogContent className={MOLDURA} data-testid="dialog-baggage-form">
          {/* CABEÇALHO: o que é, qual bilhete, e quanto falta. */}
          <div className="shrink-0 flex items-start gap-3.5 pl-5 sm:pl-6 pr-14 pt-4 pb-3.5 border-b border-border bg-card">
            <div className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center shrink-0 bg-brand-soft text-primary" aria-hidden="true">
              <Luggage className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <DialogTitle className="m-0 p-0 text-base font-semibold leading-6 text-foreground">
                  {editing ? "Editar solicitação de bagagem" : "Nova solicitação de bagagem"}
                </DialogTitle>
                {editing && grupoEditado && (
                  <span className={`inline-flex items-center h-[22px] px-2 rounded-md text-2xs font-semibold ${CIA_STYLE[grupoEditado].badge}`}>
                    {editing.cia}
                  </span>
                )}
              </div>
              <DialogDescription className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
                {editing ? (
                  <>
                    <span className="font-mono font-semibold text-foreground">LOC {editing.loc}</span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    registrada em {fmtDate(editing.requestDate)}
                    {editing.createdByName && <> por {toTitleCase(fixEncoding(editing.createdByName))}</>}
                  </>
                ) : "Bagagem despachada por colaborador e evento."}
              </DialogDescription>
            </div>
            {/* Progresso dos obrigatórios — valores reais, não decoração. */}
            <div className="hidden sm:flex items-center gap-2 shrink-0 pt-1.5" data-testid="progresso-obrigatorios">
              <div
                className="w-20 h-1.5 rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={preenchidos}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-label="Campos obrigatórios preenchidos"
              >
                <div
                  className={`h-full rounded-full transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none ${completo ? "bg-success" : "bg-primary"}`}
                  style={{ width: `${(preenchidos / total) * 100}%` }}
                />
              </div>
              <span className={`text-2xs tabular-nums whitespace-nowrap ${completo ? "text-success font-medium" : "text-muted-foreground"}`}>
                {completo
                  ? <><Check className="inline w-3 h-3 -mt-px mr-0.5" strokeWidth={3} aria-hidden="true" />Obrigatórios ok</>
                  : <>{preenchidos} de {total} obrigatórios</>}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted/40">
            {/* Região aria-live com o resumo dos erros */}
            <div aria-live="polite" className="sr-only">
              {Object.values(errors).filter(Boolean).join(". ")}
            </div>

            <div className="pas-entra space-y-4 p-4 sm:p-6">
              {/* ── Quem e onde ── */}
              <Secao icone={Users} titulo="Evento e colaborador">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                  <div className="min-w-0">
                    <label htmlFor="bg-event" className={LBL}>Evento<RequiredMark /></label>
                    <EventCombobox
                      id="bg-event"
                      events={eventOptions}
                      value={form.eventId}
                      onChange={eventId => setForm(f => ({ ...f, eventId }))}
                      placeholder="Buscar evento por nome ou cidade…"
                      invalid={!!errors.eventId}
                      describedBy={errors.eventId ? "bg-event-err" : undefined}
                    />
                    {fieldError("eventId", "bg-event-err")}
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="bg-collab" className={LBL}>Colaborador<RequiredMark /></label>
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

                {/* Contexto do colaborador escolhido: quantas bagagens ele já tem, e em quais companhias. */}
                {colaboradorSelecionado && (
                  <div
                    className="pas-entra mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg bg-surface-muted px-3 py-2.5"
                    data-testid="contexto-colaborador"
                  >
                    <p className="m-0 text-xs font-semibold text-foreground">
                      {toTitleCase(fixEncoding(colaboradorSelecionado.fullName))}
                    </p>
                    {tipoDoColaborador && (
                      <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-brand-soft text-2xs font-medium text-primary">
                        {tipoDoColaborador}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {agregadoDoColaborador
                        ? `${agregadoDoColaborador.totalBags} ${agregadoDoColaborador.totalBags === 1 ? "bagagem registrada" : "bagagens registradas"}${
                          agregadoDoColaborador.historyBags > 0 ? ` (${agregadoDoColaborador.historyBags} do histórico)` : ""}`
                        : "Nenhuma bagagem registrada ainda"}
                    </span>
                    {agregadoDoColaborador && (
                      <span className="flex flex-wrap items-center gap-1 sm:ml-auto">
                        {(Object.keys(agregadoDoColaborador.byCia) as CiaGroup[])
                          .filter(g => agregadoDoColaborador.byCia[g] > 0)
                          .map(g => (
                            <span key={g} className={`inline-flex items-center h-5 px-1.5 rounded-md text-2xs font-semibold tabular-nums ${CIA_STYLE[g].badge}`}>
                              {g} {agregadoDoColaborador.byCia[g]}
                            </span>
                          ))}
                      </span>
                    )}
                  </div>
                )}
              </Secao>

              {/* ── Bilhete ── */}
              <Secao icone={Ticket} titulo="Bilhete">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <label htmlFor="bg-loc" className={LBL}>Localizador (LOC)<RequiredMark /></label>
                    <Input
                      id="bg-loc"
                      value={form.loc}
                      onChange={e => setForm(f => ({ ...f, loc: e.target.value.toUpperCase() }))}
                      placeholder="ABC123"
                      autoComplete="off"
                      spellCheck={false}
                      aria-required="true"
                      aria-invalid={!!errors.loc}
                      aria-describedby={errors.loc ? "bg-loc-err" : undefined}
                      className="font-mono uppercase tracking-wider placeholder:tracking-normal"
                    />
                    {fieldError("loc", "bg-loc-err")}
                  </div>

                  <div>
                    <label htmlFor="bg-os" className={LBL}>Ordem de serviço (OS)<RequiredMark /></label>
                    <Input
                      id="bg-os"
                      value={form.os}
                      onChange={e => setForm(f => ({ ...f, os: e.target.value }))}
                      placeholder="Nº da OS"
                      autoComplete="off"
                      aria-required="true"
                      aria-invalid={!!errors.os}
                      aria-describedby={errors.os ? "bg-os-err" : undefined}
                      className="font-mono placeholder:font-sans"
                    />
                    {fieldError("os", "bg-os-err")}
                  </div>

                  <div className="min-w-0">
                    <p id="bg-cia-rotulo" className={`m-0 ${LBL}`}>Companhia aérea<RequiredMark /></p>
                    <SeletorDeCompanhia valor={form.ciaSelect} onChange={(ciaSelect) => setForm(f => ({ ...f, ciaSelect }))} />
                    {form.ciaSelect === "Outros" && (
                      <Input
                        id="bg-cia-other"
                        value={form.ciaOther}
                        onChange={e => setForm(f => ({ ...f, ciaOther: e.target.value }))}
                        placeholder="Nome da companhia (ex.: Latam, Voepass)"
                        aria-label="Nome da companhia aérea"
                        aria-required="true"
                        aria-invalid={!!errors.cia}
                        aria-describedby={errors.cia ? "bg-cia-err" : undefined}
                        className="pas-entra mt-2"
                      />
                    )}
                    {fieldError("cia", "bg-cia-err")}
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="bg-agency" className={LBL}>Agência<RequiredMark /></label>
                    <Select value={form.agencySelect} onValueChange={(agencySelect) => setForm(f => ({ ...f, agencySelect }))}>
                      <SelectTrigger id="bg-agency" data-testid="bg-agency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AGENCIAS_FIXAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                        <SelectItem value="Outros">Outra agência</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.agencySelect === "Outros" && (
                      <Input
                        id="bg-agency-other"
                        value={form.agencyOther}
                        onChange={e => setForm(f => ({ ...f, agencyOther: e.target.value }))}
                        placeholder="Nome da agência"
                        aria-label="Nome da agência"
                        aria-required="true"
                        aria-invalid={!!errors.agency}
                        aria-describedby={errors.agency ? "bg-agency-err" : undefined}
                        className="pas-entra mt-2"
                      />
                    )}
                    {fieldError("agency", "bg-agency-err")}
                  </div>
                </div>

                {/*
                  LOC repetido não é erro — bagagem extra do mesmo bilhete acontece.
                  Mas quem digita um LOC já existente quase sempre está duplicando
                  por engano, e sem o aviso só descobre na conferência.
                */}
                {locDuplicado && (
                  <div className="pas-entra mt-3 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2.5 flex items-start gap-2" role="status" data-testid="aviso-loc-duplicado">
                    <AlertCircle className="w-4 h-4 text-warning-strong shrink-0 mt-px" aria-hidden="true" />
                    <p className="m-0 text-xs text-warning leading-relaxed">
                      <span className="font-mono font-semibold">{locDuplicado.loc}</span> já está registrado para{" "}
                      <strong>{getCollabName(locDuplicado.collaboratorId)}</strong>, embarque {fmtDate(locDuplicado.boardingDate)}.
                      Se for bagagem extra do mesmo bilhete, aumente a quantidade em vez de criar outra.
                    </p>
                  </div>
                )}
              </Secao>

              {/* ── Bagagem e datas ── */}
              <Secao icone={CalendarDays} titulo="Bagagem, valor e datas">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3">
                  <div>
                    <label htmlFor="bg-qty" className={LBL}>Quantidade<RequiredMark /></label>
                    <div className="flex items-stretch h-10 rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                      <button
                        type="button"
                        onClick={() => passoDaQuantidade(-1)}
                        disabled={!Number.isNaN(quantidade) && quantidade <= 1}
                        aria-label="Uma bagagem a menos"
                        className="pas-alvo w-10 shrink-0 inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        <Minus className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <input
                        id="bg-qty"
                        type="number"
                        min={1}
                        step={1}
                        value={form.quantityText}
                        onChange={e => setForm(f => ({ ...f, quantityText: e.target.value }))}
                        aria-required="true"
                        aria-invalid={!!errors.quantity}
                        aria-describedby={errors.quantity ? "bg-qty-err" : undefined}
                        className="bag-numero flex-1 min-w-0 bg-transparent text-center text-sm font-semibold tabular-nums text-foreground outline-none border-x border-input"
                      />
                      <button
                        type="button"
                        onClick={() => passoDaQuantidade(+1)}
                        aria-label="Uma bagagem a mais"
                        className="pas-alvo w-10 shrink-0 inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Plus className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                    {fieldError("quantity", "bg-qty-err")}
                  </div>

                  <div>
                    <label htmlFor="bg-value" className={LBL}>Valor<RequiredMark /></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none" aria-hidden="true">R$</span>
                      <Input
                        id="bg-value"
                        value={form.valueText}
                        onChange={e => setForm(f => ({ ...f, valueText: e.target.value }))}
                        inputMode="decimal"
                        placeholder="0,00"
                        autoComplete="off"
                        aria-required="true"
                        aria-invalid={!!errors.value}
                        aria-describedby={errors.value ? "bg-value-err" : undefined}
                        className="pl-9 tabular-nums"
                      />
                    </div>
                    {!errors.value && form.valueText.trim() && /\d/.test(form.valueText) && (
                      <p className="m-0 mt-1 text-2xs text-muted-foreground tabular-nums" aria-live="polite">
                        = {formatCurrency(Math.round(parseBrNumber(form.valueText) * 100))}
                      </p>
                    )}
                    {fieldError("value", "bg-value-err")}
                  </div>

                  <div>
                    <label htmlFor="bg-request-date" className={LBL}>Data da solicitação<RequiredMark /></label>
                    <Input
                      id="bg-request-date"
                      type="date"
                      value={form.requestDate}
                      onChange={e => setForm(f => ({ ...f, requestDate: e.target.value }))}
                      aria-required="true"
                      aria-invalid={!!errors.requestDate}
                      aria-describedby={errors.requestDate ? "bg-request-date-err" : undefined}
                      className="tabular-nums"
                    />
                    {fieldError("requestDate", "bg-request-date-err")}
                  </div>

                  <div>
                    <label htmlFor="bg-boarding-date" className={LBL}>Data do embarque<RequiredMark /></label>
                    <Input
                      id="bg-boarding-date"
                      type="date"
                      min={form.requestDate || undefined}
                      value={form.boardingDate}
                      onChange={e => setForm(f => ({ ...f, boardingDate: e.target.value }))}
                      aria-required="true"
                      aria-invalid={!!errors.boardingDate}
                      aria-describedby={errors.boardingDate ? "bg-boarding-date-err" : undefined}
                      className="tabular-nums"
                    />
                    {fieldError("boardingDate", "bg-boarding-date-err")}
                  </div>
                </div>
              </Secao>

              {/* ── Observações ── */}
              <Secao icone={NotebookPen} titulo="Observações">
                <label htmlFor="bg-notes" className="sr-only">Observações (opcional)</label>
                <Textarea
                  id="bg-notes"
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Ex.: bagagem extra de equipamento"
                  className="min-h-[64px] resize-y"
                />
                <p className="m-0 mt-1 text-2xs text-muted-foreground">Opcional — aparece na linha da lista, embaixo do evento.</p>
              </Secao>
            </div>
          </div>

          {/*
            O rodapé diz o que falta em palavras. Uma barra sozinha mostra que
            algo está incompleto, mas não o quê — e "nada é salvo até você
            registrar" responde a pergunta que faz a pessoa hesitar em fechar.
          */}
          <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 px-5 sm:px-6 py-3 border-t border-border bg-surface-muted">
            <p
              className={`m-0 mr-auto min-w-0 flex items-center gap-1.5 text-xs ${faltam === 0 && pendenciasReais === 0 ? "text-success" : pendenciasReais > 0 && faltam === 0 ? "text-warning" : "text-muted-foreground"}`}
              data-testid="rodape-obrigatorios"
            >
              {faltam === 0 && pendenciasReais === 0 && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />}
              {faltam === 0 && pendenciasReais > 0 && <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
              <span>
                {faltam > 0
                  ? `Faltam ${faltam} ${faltam === 1 ? "campo obrigatório" : "campos obrigatórios"} — nada é salvo até você ${editing ? "salvar" : "registrar"}.`
                  : pendenciasReais > 0
                    ? "Revise os campos marcados antes de salvar."
                    : "Tudo preenchido."}
              </span>
            </p>
            <div className="flex items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
              <Button variant="outline" className="h-9 rounded-lg px-4 text-sm font-medium" onClick={tentarFechar} data-testid="button-cancel-form">
                Cancelar
              </Button>
              <Button
                onClick={onSubmit}
                disabled={salvando}
                className="h-9 rounded-lg px-4 gap-2 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-semibold"
                data-testid="button-submit-baggage"
              >
                {salvando
                  ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Salvando…</>
                  : <><Check className="w-4 h-4" aria-hidden="true" />{editing ? "Salvar alterações" : "Registrar solicitação"}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {DialogoDescarte}
    </>
  );
}
