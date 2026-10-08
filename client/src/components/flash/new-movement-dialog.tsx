// Extraído de flash-account.tsx em 25/09 (modularização); redesenho 08/10.
//
// Diálogo "Novo lançamento" / "Editar lançamento" da Conta corrente Flash,
// incluindo o atalho de crédito inicial da admissão (endpoint transacional).
// O estado do formulário é todo local ao diálogo — a página só abre/fecha e
// recebe `onCreated` para invalidar e selecionar o colaborador.
//
// 08/10: em seções (colaborador · lançamento · detalhes) com rodapé fixo;
// sentido e categoria viraram escolhas lado a lado (eram selects); o saldo
// atual da pessoa aparece ao escolhê-la e o "depois" acompanha o valor
// digitado — só exibição, o servidor é quem grava. Requisições, payloads,
// validações e o descarte são os mesmos.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { InsertFlashMovement } from "@shared/schema";
import { ArrowDownLeft, ArrowUpRight, Loader2, Search, Wallet, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, parseBrNumber } from "@/lib/utils";
import { toTitleCase } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { lerEventoGuardado } from "@/lib/evento-em-foco";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { campoComErro } from "@/lib/campo-com-erro";
import { MensagemDeErro } from "@/components/forms/mensagem-de-erro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  ROTULO_CATEGORIA, TARGET_FOOD_CENTS, TARGET_MOBILITY_CENTS, fmtDate, formatCurrency, todayISO,
  type Balance, type Collaborator, type EventItem, type FlashMovement,
} from "./flash-types";

export interface NewMovementDialogProps {
  open: boolean;
  onClose: () => void;
  collaborators: Collaborator[];
  events: EventItem[];
  defaultCollaboratorId: string;
  /** Lançamento em edição (salvo via PATCH — atualização in-place, auditada no servidor). */
  editing: FlashMovement | null;
  hasAccount: (id: string) => boolean;
  onCreated: (collabId: string) => void;
  /** Saldo atual de cada pessoa (só exibição: "saldo atual" e "depois"). */
  saldoDe?: (id: string) => Balance | undefined;
}

/** Escolha de um entre dois, lado a lado — um radiogroup de verdade (setas trocam). */
function Escolha<T extends string>({ id, rotulo, valor, onChange, opcoes }: {
  id: string;
  rotulo: string;
  valor: T;
  onChange: (v: T) => void;
  opcoes: { valor: T; titulo: string; dica?: string; icone?: React.ReactNode }[];
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const j = (i + passo + opcoes.length) % opcoes.length;
    onChange(opcoes[j].valor);
    refs.current[j]?.focus();
  };
  return (
    <div>
      <p id={`${id}-rotulo`} className="fla-rotulo">{rotulo}</p>
      <div id={id} role="radiogroup" aria-labelledby={`${id}-rotulo`} className="grid grid-cols-2 gap-2">
        {opcoes.map((o, i) => {
          const on = valor === o.valor;
          return (
            <button
              key={o.valor}
              ref={el => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.valor)}
              onKeyDown={e => aoTeclar(e, i)}
              className={cn(
                "fla-escolha flex items-start gap-2 min-w-0 px-3 py-2 rounded-lg border text-left transition-[border-color,background-color,box-shadow] duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-brand-soft shadow-[inset_0_0_0_1px_var(--primary)]" : "border-border bg-card hover:border-slate-300 hover:bg-surface-muted",
              )}
              data-testid={`${id}-${o.valor}`}
            >
              {o.icone}
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium leading-5", on ? "text-primary" : "text-foreground")}>{o.titulo}</span>
                {o.dica && <span className="block text-xs leading-4 text-muted-foreground">{o.dica}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NewMovementDialog({ open, onClose, collaborators, events, defaultCollaboratorId, editing, hasAccount, onCreated, saldoDe }: NewMovementDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [collaboratorId, setCollaboratorId] = useState(defaultCollaboratorId || "");
  const [collabSearch, setCollabSearch] = useState("");
  const [category, setCategory] = useState<"alimentacao" | "mobilidade">("alimentacao");
  const [type, setType] = useState<"credito" | "debito">("credito");
  const [amount, setAmount] = useState("");
  const [movementDate, setMovementDate] = useState(todayISO());
  const [erros, setErros] = useState<{ collaborator?: string; date?: string; amount?: string }>({});
  const [eventId, setEventId] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  /** Qual dos dois botões está salvando (o spinner aparece só nele). */
  const [salvandoInicial, setSalvandoInicial] = useState(false);

  // Ao abrir: pré-preenche com o lançamento em edição (preservando a data) ou
  // apenas sincroniza o colaborador pré-selecionado. useEffect no lugar do
  // antigo setState durante o render.
  useEffect(() => {
    if (!open) return;
    setErros({});
    if (editing) {
      setCollaboratorId(editing.collaboratorId);
      setCategory(editing.category === "mobilidade" ? "mobilidade" : "alimentacao");
      setType(editing.type === "debito" ? "debito" : "credito");
      setAmount(((editing.amountCents || 0) / 100).toFixed(2).replace(".", ","));
      setMovementDate(String(editing.movementDate || "").split("T")[0] || todayISO());
      setEventId(editing.eventId || "");
      setDescription(editing.description || "");
    } else {
      setCollaboratorId(defaultCollaboratorId || "");
      // Evento em foco (23/09): lançamento novo já nasce vinculado ao evento que
      // a pessoa estava trabalhando no Financeiro — só leitura, sem mexer na URL.
      const emFoco = lerEventoGuardado(user?.id);
      setEventId(emFoco && events.some(ev => ev.id === emFoco) ? emFoco : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  // "Descartar alterações?" (23/09): Esc e clique fora fechavam e zeravam o
  // formulário sem perguntar. Em edição, "sujo" é diferir do lançamento gravado.
  const sujo = editing
    ? (
      collaboratorId !== editing.collaboratorId
      || category !== (editing.category === "mobilidade" ? "mobilidade" : "alimentacao")
      || type !== (editing.type === "debito" ? "debito" : "credito")
      || amount !== ((editing.amountCents || 0) / 100).toFixed(2).replace(".", ",")
      || movementDate !== (String(editing.movementDate || "").split("T")[0] || todayISO())
      || eventId !== (editing.eventId || "")
      || description !== (editing.description || "")
    )
    : (amount.trim() !== "" || description.trim() !== "" || collaboratorId !== (defaultCollaboratorId || ""));
  const { pedirParaFechar, Dialogo: DialogoDescarte } = useConfirmarDescarte(sujo, { salvando: saving });

  const filteredCollabs = useMemo(() => {
    const q = collabSearch.trim().toLowerCase();
    return collaborators
      .filter(c => c.active !== false)
      .filter(c => !q || (c.fullName || "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [collaborators, collabSearch]);

  // O colaborador selecionado pode não estar nas options (inativo ou fora do
  // slice de 50) — sem esta injeção o select exibiria "Selecione…" mesmo com
  // um lançamento em edição já vinculado a alguém.
  const optionCollabs = useMemo(() => {
    if (collaboratorId && !filteredCollabs.some(c => c.id === collaboratorId)) {
      const current = collaborators.find(c => c.id === collaboratorId);
      if (current) return [current, ...filteredCollabs];
    }
    return filteredCollabs;
  }, [filteredCollabs, collaborators, collaboratorId]);

  const reset = () => {
    setCategory("alimentacao"); setType("credito"); setAmount("");
    setMovementDate(todayISO()); setEventId(""); setDescription(""); setCollabSearch("");
  };

  const post = (body: Partial<InsertFlashMovement>) => apiRequest("POST", "/api/flash-movements", body).then(r => r.json());

  const save = async (initialCredit: boolean) => {
    if (!collaboratorId) { setErros({ collaborator: "Selecione o colaborador." }); document.getElementById("fm-collaborator")?.focus(); return; }
    if (!movementDate) { setErros({ date: "Informe a data do lançamento." }); document.getElementById("fm-date")?.focus(); return; }
    setErros({});
    try {
      setSaving(true);
      setSalvandoInicial(initialCredit);
      if (initialCredit) {
        // Endpoint transacional: os dois créditos (R$ 350 + R$ 150) nunca
        // ficam pela metade se algo falhar no meio
        await apiRequest("POST", "/api/flash-movements/initial-credit", { collaboratorId, movementDate }).then(r => r.json());
        toast({ variant: "success", title: "Crédito inicial lançado", description: "R$ 350,00 de alimentação e R$ 150,00 de mobilidade." });
      } else {
        const cents = Math.round(parseBrNumber(amount) * 100);
        if (!cents || cents <= 0) { setErros({ amount: "Informe um valor maior que zero." }); document.getElementById("fm-amount")?.focus(); setSaving(false); return; }
        const body = {
          collaboratorId, category, type, amountCents: cents, movementDate,
          eventId: eventId || null, description: description.trim() || null,
        };
        if (editing) {
          // Atualização in-place via PATCH: o original só muda se a edição
          // for aceita pelo servidor (nada de excluir + recriar).
          await apiRequest("PATCH", `/api/flash-movements/${editing.id}`, body).then(r => r.json());
        } else {
          await post(body);
        }
        toast({ variant: "success", title: editing ? "Lançamento atualizado" : "Lançamento registrado" });
      }
      onCreated(collaboratorId);
      reset();
      onClose();
    } catch (e) {
      toast({ title: "Não foi possível registrar o lançamento", description: apiErrorMessage(e, "Tente novamente."), variant: "destructive" });
    } finally {
      setSaving(false);
      setSalvandoInicial(false);
    }
  };

  const fechar = () => { reset(); onClose(); };

  // ── Só exibição: o saldo da pessoa e como ele fica com este lançamento ──
  const saldo = collaboratorId ? saldoDe?.(collaboratorId) : undefined;
  const contaNova = !editing && !!collaboratorId && !hasAccount(collaboratorId);
  const centsDigitados = Math.round(parseBrNumber(amount) * 100);
  const previa = useMemo(() => {
    if (!collaboratorId || !saldoDe || !(centsDigitados > 0)) return null;
    const atual = (category === "alimentacao" ? saldo?.food : saldo?.mobility) ?? 0;
    // Na edição o próprio lançamento já está no saldo: tira ele antes de somar o novo.
    let base = atual;
    if (editing && editing.collaboratorId === collaboratorId && editing.category === category) {
      base -= (editing.type === "credito" ? 1 : -1) * (editing.amountCents || 0);
    }
    const depois = base + (type === "credito" ? centsDigitados : -centsDigitados);
    // Edição sem mudança de valor/sentido/categoria: "R$ X → R$ X" não diz nada.
    if (depois === atual) return null;
    return { atual, depois };
  }, [collaboratorId, saldoDe, centsDigitados, category, saldo, editing, type]);

  const campo = "w-full h-9 text-sm rounded-lg border border-border px-2.5 bg-card text-foreground transition-[border-color,box-shadow] duration-150 hover:border-slate-300 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12 disabled:opacity-60";

  return (
    <>
    <Dialog open={open} onOpenChange={v => { if (!v) pedirParaFechar(fechar); }}>
      <DialogContent className="fla-dialogo !max-w-[520px] w-[95vw] max-h-[90vh] !flex !flex-col p-0 gap-0 overflow-hidden rounded-xl shadow-3 max-sm:w-full max-sm:!max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0 [&>button:last-child]:hidden">
        <div className="flex items-start gap-3 px-5 pt-4 pb-3.5 border-b border-border">
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold leading-6 text-foreground">{editing ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {editing
                ? `A alteração é aplicada ao próprio lançamento de ${fmtDate(editing.movementDate)} e fica registrada na auditoria.`
                : "Entra no extrato do colaborador e atualiza o saldo da categoria."}
            </DialogDescription>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => pedirParaFechar(fechar)}
            className="pas-alvo -mr-1.5 w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
        <fieldset disabled={saving} className="min-w-0 m-0 p-0 border-0">
          {/* ── Colaborador ── */}
          <div className="px-5 pt-4 pb-4 space-y-2">
            <label htmlFor="fm-collaborator" className="fla-rotulo">Colaborador</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                type="search"
                value={collabSearch}
                onChange={e => setCollabSearch(e.target.value)}
                placeholder="Filtrar a lista pelo nome…"
                aria-label="Buscar colaborador"
                className="pas-busca h-9 pl-[33px] text-sm rounded-lg border-border bg-card hover:border-slate-300 focus-visible:ring-offset-0 focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary"
              />
            </div>
            <select
              id="fm-collaborator"
              value={collaboratorId}
              aria-required="true"
              {...campoComErro("fm-collaborator", erros.collaborator)}
              onChange={e => { setCollaboratorId(e.target.value); if (erros.collaborator) setErros(p => ({ ...p, collaborator: undefined })); }}
              className={cn(campo, erros.collaborator && "border-danger focus:border-danger focus:ring-danger/15")}
            >
              <option value="">{filteredCollabs.length === 0 && collabSearch ? `Ninguém com “${collabSearch}”` : "Selecione…"}</option>
              {optionCollabs.map(c => (
                <option key={c.id} value={c.id}>{toTitleCase(c.fullName)}</option>
              ))}
            </select>
            <MensagemDeErro id="fm-collaborator" erro={erros.collaborator} />
            {collaboratorId && saldoDe && (
              <p className="m-0 text-xs text-muted-foreground tabular-nums" data-testid="flash-dialogo-saldo-atual">
                {saldo
                  ? <>Saldo atual: <span className="font-medium text-foreground">{formatCurrency(saldo.food)}</span> alimentação · <span className="font-medium text-foreground">{formatCurrency(saldo.mobility)}</span> mobilidade</>
                  : "Conta sem saldo ainda."}
              </p>
            )}

            {contaNova && (
              <div className="fla-abre mt-1 flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-lg border border-primary/25 bg-brand-soft px-3.5 py-3" data-testid="flash-credito-inicial">
                <Wallet className="w-4 h-4 shrink-0 text-primary self-start mt-0.5" aria-hidden="true" />
                <div className="flex-1 min-w-[200px]">
                  <p className="m-0 text-sm font-semibold text-primary">Conta nova: lance o crédito inicial da admissão</p>
                  <p className="m-0 mt-0.5 text-xs leading-5 text-primary/90 tabular-nums">
                    {formatCurrency(TARGET_FOOD_CENTS)} alimentação + {formatCurrency(TARGET_MOBILITY_CENTS)} mobilidade, de uma vez, com a data {movementDate ? fmtDate(movementDate) : "informada abaixo"}.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => save(true)}
                  className="max-sm:w-full h-8 px-3 rounded-lg text-xs font-semibold gap-1.5 border-primary/40 text-primary bg-card hover:bg-card hover:border-primary"
                  data-testid="flash-lancar-credito-inicial"
                >
                  {salvandoInicial && <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                  {salvandoInicial ? "Lançando…" : "Lançar crédito inicial"}
                </Button>
              </div>
            )}
          </div>

          {/* ── Lançamento ── */}
          <div className="px-5 pt-4 pb-4 space-y-4 border-t border-border">
            {contaNova && <p className="m-0 -mt-1 text-xs font-medium text-muted-foreground">Ou registre um lançamento avulso:</p>}
            <Escolha
              id="fm-type"
              rotulo="Tipo"
              valor={type}
              onChange={setType}
              opcoes={[
                { valor: "credito", titulo: "Crédito", dica: "reembolso ou recarga", icone: <ArrowDownLeft className="w-4 h-4 mt-0.5 shrink-0 text-success-strong" aria-hidden="true" /> },
                { valor: "debito", titulo: "Débito", dica: "consumo ou ajuste", icone: <ArrowUpRight className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" /> },
              ]}
            />
            <Escolha
              id="fm-category"
              rotulo="Categoria"
              valor={category}
              onChange={setCategory}
              opcoes={[
                { valor: "alimentacao", titulo: "Alimentação", icone: <span className="fla-ponto mt-[7px] bg-success-strong" aria-hidden="true" /> },
                { valor: "mobilidade", titulo: "Mobilidade", icone: <span className="fla-ponto mt-[7px] bg-primary" aria-hidden="true" /> },
              ]}
            />
            <div className="grid grid-cols-2 gap-3 items-start">
              <div>
                <label htmlFor="fm-amount" className="fla-rotulo">Valor</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none" aria-hidden="true">R$</span>
                  <Input
                    id="fm-amount"
                    value={amount}
                    aria-required="true"
                    {...campoComErro("fm-amount", erros.amount)}
                    onChange={e => { setAmount(e.target.value); if (erros.amount) setErros(p => ({ ...p, amount: undefined })); }}
                    inputMode="decimal"
                    placeholder="0,00"
                    className={cn("h-9 pl-9 text-sm text-right font-medium tabular-nums rounded-lg border-border bg-card hover:border-slate-300 focus-visible:ring-offset-0 focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary", erros.amount && "border-danger focus-visible:border-danger focus-visible:ring-danger/15")}
                  />
                </div>
                <MensagemDeErro id="fm-amount" erro={erros.amount} />
              </div>
              <div>
                <label htmlFor="fm-date" className="fla-rotulo">Data</label>
                <Input
                  id="fm-date"
                  type="date"
                  value={movementDate}
                  aria-required="true"
                  {...campoComErro("fm-date", erros.date)}
                  onChange={e => { setMovementDate(e.target.value); if (erros.date) setErros(p => ({ ...p, date: undefined })); }}
                  className={cn("h-9 text-sm tabular-nums rounded-lg border-border bg-card hover:border-slate-300 focus-visible:ring-offset-0 focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary", erros.date && "border-danger focus-visible:border-danger focus-visible:ring-danger/15")}
                />
                <MensagemDeErro id="fm-date" erro={erros.date} />
              </div>
            </div>
            {previa && (
              <p className="pas-entra m-0 -mt-1.5 text-xs text-muted-foreground tabular-nums" aria-live="polite" data-testid="flash-dialogo-previa">
                Saldo de {ROTULO_CATEGORIA[category].toLowerCase()}: {formatCurrency(previa.atual)} <span aria-hidden="true">→</span><span className="sr-only">passa para</span>{" "}
                <span className={cn("font-semibold", previa.depois < 0 ? "text-danger" : "text-foreground")}>{formatCurrency(previa.depois)}</span>
                {previa.depois < 0 && <span className="text-danger"> (fica negativo)</span>}
              </p>
            )}
          </div>

          {/* ── Detalhes ── */}
          <div className="px-5 pt-4 pb-5 space-y-4 border-t border-border">
            <div>
              <label htmlFor="fm-event" className="fla-rotulo">Evento <span className="fla-opcional">opcional</span></label>
              <select id="fm-event" value={eventId} onChange={e => setEventId(e.target.value)} className={campo}>
                <option value="">Sem evento vinculado</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fm-description" className="fla-rotulo">Descrição <span className="fla-opcional">opcional</span></label>
              <Input id="fm-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: Reembolso alimentação — Night Run" className="h-9 text-sm rounded-lg border-border bg-card hover:border-slate-300 focus-visible:ring-offset-0 focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary" />
            </div>
          </div>
        </fieldset>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-card">
          {sujo && !saving && <span className="mr-auto text-xs text-muted-foreground">Alterações não salvas</span>}
          <Button type="button" variant="outline" disabled={saving} onClick={() => pedirParaFechar(fechar)} className="pas-alvo h-9 px-4 rounded-lg text-sm font-medium">
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => save(false)}
            className="pas-alvo h-9 px-4 rounded-lg gap-2 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-semibold"
            data-testid="flash-salvar-lancamento"
          >
            {saving && !salvandoInicial && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {saving && !salvandoInicial ? "Salvando…" : editing ? "Salvar alterações" : "Registrar lançamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    {DialogoDescarte}
    </>
  );
}

export default NewMovementDialog;
