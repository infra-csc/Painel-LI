/**
 * "Usar este voo" → o MESMO modal de registro de passagem de Passagens
 * (TicketModal), aberto aqui, na própria tela da busca (09/10), já preenchido
 * com o voo escolhido. Compras compra no site da companhia, confere, completa
 * o LOC e registra. As regras do registro são as de sempre (obrigatórios,
 * cronologia, viagem que cruza outra — 409 com a saída no formulário).
 *
 * Depois do registro, o preço ENCONTRADO fica ligado à passagem
 * (POST /api/busca-de-passagens/uso) — base do "pago × encontrado".
 */
import { useMemo, useState } from "react";
import { Sparkles, Undo2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toastSucessoDaVaga } from "@/components/common/toast-sucesso";
import { apiErrorStatus } from "@/lib/api-error";
import { formatarMoeda } from "@/lib/format";
import {
  getMissingRequiredFields,
  getInvalidFields,
  validateTicketChronology,
  type TicketFormValues,
} from "@/lib/ticket-form";
import type { TeamInclusion, User } from "@shared/schema";
import TicketModal from "@/components/tickets/ticket-modal";
import { DiscardChangesDialog, ChronologyWarningsDialog } from "@/components/tickets/ticket-dialogs";
import { useTicketUpsert } from "@/components/tickets/use-ticket-upsert";
import { useSinaisDeViagem } from "@/components/tickets/use-sinais-de-viagem";
import type { BloqueioDeViagem } from "@/components/tickets/trecho-direto-campo";
import type { TicketsData } from "@/components/tickets/use-tickets-data";
import type { FieldErrorsState, FormFieldHelpers, TicketFormHandlers } from "@/components/tickets/types";
import { companhiaDaPerna, voosDaPerna } from "@shared/busca-de-passagens";
import { registrarUsoDoVoo } from "./use-busca-de-passagens";
import { vooParaFormulario, type VooEscolhido } from "./voo-para-formulario";


export function RegistroPeloVoo({ data, user, vaga, voo, onFechar, onRegistrado }: {
  data: TicketsData;
  user: User | null;
  vaga: TeamInclusion;
  voo: VooEscolhido;
  onFechar: () => void;
  /** A passagem foi registrada (a tela tira a vaga da seleção). */
  onRegistrado?: (vagaId: string) => void;
}) {
  const { toast } = useToast();
  const sid = vaga.id;
  const inicial = useMemo<TicketFormValues>(() => {
    const local = data.eventById.get(vaga.eventId)?.location ?? "";
    const origem = vaga.city || (vaga.collaboratorId ? data.collaboratorById.get(vaga.collaboratorId)?.city : "") || "";
    return {
      departureCityDestination: local, returnCityOrigin: local,
      departureCityOrigin: origem, returnCityDestination: origem,
      ...vooParaFormulario(voo),
    };
  }, [data.eventById, data.collaboratorById, vaga, voo]);
  const [form, setForm] = useState<TicketFormValues>(inicial);
  const [erros, setErros] = useState<FieldErrorsState>({});
  const [aba, setAba] = useState("dados");
  const [comentarios, setComentarios] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const [avisos, setAvisos] = useState<{ warnings: string[]; onConfirm: () => void } | null>(null);
  const [bloqueio, setBloqueio] = useState<BloqueioDeViagem | null>(null);
  const sinais = useSinaisDeViagem(true);
  const { upsertTicketForInclusion, isSubmitting, silenciarViagemCruzada } = useTicketUpsert({ getTicket: data.getTicket });

  const handlers = useMemo<TicketFormHandlers>(() => ({
    onFieldChange: (_scope, field, value) => {
      setForm((f) => ({ ...f, [field]: value }));
      setErros((e) => {
        if (!e[sid]?.[field]) return e;
        const { [field]: _x, ...resto } = e[sid];
        return { ...e, [sid]: resto };
      });
    },
    onPatch: (_scope, patch) => {
      if ("idaVemDeInclusionId" in patch || "actualDepartureDate" in patch || "actualReturnDate" in patch) setBloqueio(null);
      setForm((f) => ({ ...f, ...patch }));
      setErros((e) => {
        if (!e[sid]) return e;
        const resto = { ...e[sid] };
        for (const k of Object.keys(patch)) delete resto[k];
        return { ...e, [sid]: resto };
      });
    },
  }), [sid]);
  const helpers = useMemo<FormFieldHelpers>(() => ({
    errCls: (scope, field) => (erros[scope]?.[field] ? " border-danger-strong focus-visible:ring-danger/25 bg-danger-soft/40" : ""),
    fieldErrorMsg: (scope, field) => {
      const msg = erros[scope]?.[field];
      return msg ? <p className="text-2xs text-danger-strong mt-1 leading-snug" role="alert">{msg}</p> : null;
    },
  }), [erros]);

  // O voo da busca não conta como "alteração": só o que a pessoa digitou depois.
  const sujo = JSON.stringify(form) !== JSON.stringify(inicial);
  const pedirFechar = () => (sujo ? setDescartar(true) : onFechar());
  const mostrarPrimeiroErro = () => {
    setAba("dados");
    setTimeout(() => document.querySelector('[role="dialog"] [role="alert"]')?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  };

  const registrar = async () => {
    setBloqueio(null);
    silenciarViagemCruzada.current = true;
    try {
      const modo = await upsertTicketForInclusion(vaga, form);
      const ida = voo.itinerario.pernas[0];
      registrarUsoDoVoo({
        teamInclusionId: vaga.id, chave: voo.chave, perna: voo.perna, itinerarioId: voo.itinerario.id,
        companhia: Array.from(new Set(voo.itinerario.pernas.map((p) => companhiaDaPerna(p)))).join(" / "),
        voos: voo.itinerario.pernas.map((p) => voosDaPerna(p)).join(" / ") || voosDaPerna(ida),
        precoCentavos: voo.itinerario.precoCentavos, precoVistoEm: voo.vistoEm,
      }).catch(() => undefined); // o registro da passagem já valeu; o vínculo é para as análises
      toastSucessoDaVaga(modo === "updated" ? "Passagem atualizada" : "Passagem registrada", {
        inclusionNumber: vaga.inclusionNumber ?? null,
        eventName: data.getEventName(vaga.eventId),
        collaboratorName: data.getCollaboratorName(vaga.collaboratorId),
        functionName: data.getFunctionName(vaga.functionId),
      });
      onRegistrado?.(vaga.id);
      onFechar();
    } catch (erro) {
      const corpo = (erro as { body?: { code?: string; message?: string; conflito?: BloqueioDeViagem["conflito"]; errors?: Record<string, string> } } | null)?.body;
      if (apiErrorStatus(erro) === 409 && corpo?.code === "viagem_cruzada") {
        setBloqueio({ message: corpo.message ?? "A viagem cruza outra viagem do colaborador.", conflito: corpo.conflito ?? null });
        setAba("dados");
      } else if (apiErrorStatus(erro) === 400 && corpo?.errors) {
        setErros((e) => ({ ...e, [sid]: { ...e[sid], ...corpo.errors } }));
        mostrarPrimeiroErro();
      }
    } finally {
      silenciarViagemCruzada.current = false;
    }
  };

  const enviar = () => {
    if (isSubmitting) return;
    const faltando = getMissingRequiredFields(form);
    const invalidos = getInvalidFields(form);
    const crono = validateTicketChronology(form, { scheduleStartDate: vaga.scheduleStartDate, scheduleEndDate: vaga.scheduleEndDate });
    const e: Record<string, string> = { ...crono.errors };
    for (const m of faltando) e[m.field] = `${m.label} é obrigatório`;
    for (const i of invalidos) e[i.field] = i.label;
    setErros((x) => ({ ...x, [sid]: e }));
    const lista = (itens: string[]) => <ul className="list-disc pl-4 space-y-0.5">{itens.map((i, k) => <li key={k}>{i}</li>)}</ul>;
    if (faltando.length) { toast({ title: "Campos obrigatórios", description: lista(faltando.map((f) => f.label)), variant: "destructive" }); mostrarPrimeiroErro(); return; }
    if (invalidos.length) { toast({ title: "Confira o preenchimento", description: lista(invalidos.map((f) => f.label)), variant: "destructive" }); mostrarPrimeiroErro(); return; }
    const msgs = Object.values(crono.errors);
    if (msgs.length) { toast({ title: "Datas inconsistentes", description: lista(msgs), variant: "destructive" }); mostrarPrimeiroErro(); return; }
    if (crono.warnings.length) { setAvisos({ warnings: crono.warnings, onConfirm: registrar }); return; }
    void registrar();
  };

  const aviso = (
    <div className="pas-entra flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-primary/25 bg-brand-soft/60 px-4 py-3" data-testid={`aviso-voo-da-busca-${sid}`}>
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-[260px]">
        <p className="m-0 text-sm font-semibold text-foreground">Preenchido com o voo escolhido na busca</p>
        <p className="m-0 mt-0.5 text-xs leading-relaxed text-slate-600">
          {String(form.ticketCompany ?? "")} · {voo.itinerario.pernas.map((p) => voosDaPerna(p)).join(" / ")} · {formatarMoeda(voo.itinerario.precoCentavos)} visto na busca.
          Compre no site da companhia, confira o valor pago e informe o LOC antes de registrar.
        </p>
      </div>
      <button type="button" onClick={() => { setForm({ ...inicial, ...Object.fromEntries(Object.keys(vooParaFormulario(voo)).map((k) => [k, ""])), transportType: "aereo", isOneWay: false, isReturnOnly: false }); }}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-card hover:text-foreground">
        <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />Limpar o voo
      </button>
    </div>
  );

  return (
    <>
      <TicketModal
        open
        inclusion={vaga}
        data={data}
        user={user}
        form={form}
        helpers={helpers}
        handlers={handlers}
        editingTicketId={null}
        activeTab={aba}
        onTabChange={setAba}
        showCommentsModal={comentarios}
        onShowCommentsModal={setComentarios}
        onRequestClose={pedirFechar}
        onStartEdit={() => undefined}
        onCancelEdit={pedirFechar}
        onSubmit={enviar}
        isSubmitting={isSubmitting}
        sinal={sinais.porVaga[sid]}
        bloqueioDeViagem={bloqueio}
        avisoDosDados={aviso}
      />
      <DiscardChangesDialog open={descartar} onCancel={() => setDescartar(false)} onDiscard={() => { setDescartar(false); onFechar(); }} />
      <ChronologyWarningsDialog
        warnings={avisos?.warnings ?? null}
        onCancel={() => setAvisos(null)}
        onConfirm={() => { const fn = avisos?.onConfirm; setAvisos(null); void fn?.(); }}
      />
    </>
  );
}
