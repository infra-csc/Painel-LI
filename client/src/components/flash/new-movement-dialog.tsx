// Extraído de flash-account.tsx em 25/09 (modularização): diálogo "Novo
// lançamento" / "Editar lançamento" da Conta corrente Flash, incluindo o
// atalho de crédito inicial da admissão (endpoint transacional). O estado do
// formulário é todo local ao diálogo — a página só abre/fecha e recebe
// `onCreated` para invalidar e selecionar o colaborador.
import { useEffect, useMemo, useState } from "react";
import type { InsertFlashMovement } from "@shared/schema";
import { Sparkles, Wallet, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { parseBrNumber } from "@/lib/utils";
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
import { todayISO, type Collaborator, type EventItem, type FlashMovement } from "./flash-types";

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
}

export function NewMovementDialog({ open, onClose, collaborators, events, defaultCollaboratorId, editing, hasAccount, onCreated }: NewMovementDialogProps) {
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

  // Ao abrir: pré-preenche com o lançamento em edição (preservando a data) ou
  // apenas sincroniza o colaborador pré-selecionado. useEffect no lugar do
  // antigo setState durante o render.
  useEffect(() => {
    if (!open) return;
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
      if (initialCredit) {
        // Endpoint transacional: os dois créditos (R$ 350 + R$ 150) nunca
        // ficam pela metade se algo falhar no meio
        await apiRequest("POST", "/api/flash-movements/initial-credit", { collaboratorId, movementDate }).then(r => r.json());
        toast({ title: "Crédito inicial lançado", description: "R$ 350,00 de alimentação e R$ 150,00 de mobilidade." });
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
        toast({ title: editing ? "Lançamento atualizado" : "Lançamento registrado" });
      }
      onCreated(collaboratorId);
      reset();
      onClose();
    } catch (e) {
      toast({ title: "Não foi possível registrar o lançamento", description: apiErrorMessage(e, "Tente novamente."), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const lbl = "text-2xs font-bold text-muted-foreground uppercase tracking-widest block mb-1.5";
  const fechar = () => { reset(); onClose(); };

  return (
    <>
    <Dialog open={open} onOpenChange={v => { if (!v) pedirParaFechar(fechar); }}>
      <DialogContent className="max-w-md rounded-xl p-0 gap-0 border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <DialogTitle className="text-sm font-bold text-foreground">{editing ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
            <DialogDescription className="text-2xs text-muted-foreground mt-0.5">
              {editing ? "A alteração é aplicada ao próprio lançamento e fica registrada na auditoria" : "Conta corrente Flash"}
            </DialogDescription>
          </div>
          <button aria-label="Fechar" onClick={() => pedirParaFechar(fechar)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-slate-600 hover:bg-muted transition-colors">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label htmlFor="fm-collaborator" className={lbl}>Colaborador</label>
            <Input value={collabSearch} onChange={e => setCollabSearch(e.target.value)} placeholder="Digite para buscar…" aria-label="Buscar colaborador" className="h-8 text-xs rounded-lg border-border mb-1.5" />
            <select
              id="fm-collaborator"
              value={collaboratorId}
              aria-required="true"
              {...campoComErro("fm-collaborator", erros.collaborator)}
              onChange={e => { setCollaboratorId(e.target.value); if (erros.collaborator) setErros(p => ({ ...p, collaborator: undefined })); }}
              className="w-full h-9 text-xs rounded-lg border border-border px-2 bg-card text-slate-700 focus:outline-none focus:border-primary"
            >
              <option value="">Selecione…</option>
              {optionCollabs.map(c => (
                <option key={c.id} value={c.id}>{toTitleCase(c.fullName)}</option>
              ))}
            </select>
            <MensagemDeErro id="fm-collaborator" erro={erros.collaborator} />
          </div>

          {!editing && collaboratorId && !hasAccount(collaboratorId) && (
            <button
              disabled={saving}
              onClick={() => save(true)}
              className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-brand-soft border border-primary/25 hover:bg-brand-soft transition-colors text-left disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
              <span className="text-xs text-primary">
                <span className="font-bold">Lançar crédito inicial da admissão</span><br />
                <span className="text-primary">R$ 350,00 alimentação + R$ 150,00 mobilidade</span>
              </span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fm-category" className={lbl}>Categoria</label>
              <select id="fm-category" value={category} onChange={e => setCategory(e.target.value === "mobilidade" ? "mobilidade" : "alimentacao")} className="w-full h-9 text-xs rounded-lg border border-border px-2 bg-card text-slate-700 focus:outline-none focus:border-primary">
                <option value="alimentacao">Alimentação</option>
                <option value="mobilidade">Mobilidade</option>
              </select>
            </div>
            <div>
              <label htmlFor="fm-type" className={lbl}>Tipo</label>
              <select id="fm-type" value={type} onChange={e => setType(e.target.value === "debito" ? "debito" : "credito")} className="w-full h-9 text-xs rounded-lg border border-border px-2 bg-card text-slate-700 focus:outline-none focus:border-primary">
                <option value="credito">Crédito (reembolso/recarga)</option>
                <option value="debito">Débito (consumo/ajuste)</option>
              </select>
            </div>
            <div>
              <label htmlFor="fm-amount" className={lbl}>Valor (R$)</label>
              <Input id="fm-amount" value={amount} aria-required="true" {...campoComErro("fm-amount", erros.amount)} onChange={e => { setAmount(e.target.value); if (erros.amount) setErros(p => ({ ...p, amount: undefined })); }} inputMode="decimal" placeholder="0,00" className="h-9 text-xs rounded-lg border-border font-mono" />
              <MensagemDeErro id="fm-amount" erro={erros.amount} />
            </div>
            <div>
              <label htmlFor="fm-date" className={lbl}>Data</label>
              <Input id="fm-date" type="date" value={movementDate} aria-required="true" {...campoComErro("fm-date", erros.date)} onChange={e => { setMovementDate(e.target.value); if (erros.date) setErros(p => ({ ...p, date: undefined })); }} className="h-9 text-xs rounded-lg border-border" />
              <MensagemDeErro id="fm-date" erro={erros.date} />
            </div>
          </div>

          <div>
            <label htmlFor="fm-event" className={lbl}>Evento (opcional)</label>
            <select id="fm-event" value={eventId} onChange={e => setEventId(e.target.value)} className="w-full h-9 text-xs rounded-lg border border-border px-2 bg-card text-slate-700 focus:outline-none focus:border-primary">
              <option value="">Sem evento vinculado</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fm-description" className={lbl}>Descrição (opcional)</label>
            <Input id="fm-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: Reembolso alimentação — Night Run" className="h-9 text-xs rounded-lg border-border" />
          </div>
        </div>

        <div className="flex gap-2 justify-end px-5 py-4 border-t border-border bg-surface-muted/50">
          <button onClick={() => pedirParaFechar(fechar)} className="h-9 px-4 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-surface-muted transition-colors">
            Cancelar
          </button>
          <Button disabled={saving} onClick={() => save(false)} className="h-9 px-4 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold">
            {saving ? "Salvando…" : editing ? "Salvar alterações" : "Registrar lançamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    {DialogoDescarte}
    </>
  );
}

export default NewMovementDialog;
