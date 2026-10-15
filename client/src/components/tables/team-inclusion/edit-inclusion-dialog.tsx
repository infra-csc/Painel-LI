/**
 * Modal de edição de uma inclusão (25/09 — extraído da tabela). Radix Dialog
 * (Esc, foco preso, aria) com proteção de descarte; formulário não controlado.
 *
 * 07/10 (redesenho, régua do modal de Eventos): cabeçalho que diz QUAL vaga
 * (nº, evento, colaborador e a situação); corpo em três seções — Vaga,
 * Período e dias, Logística — no lugar das duas colunas soltas com o cartão
 * azul "✈️ Sugestões de Viagem"; "Precisa de passagem/hospedagem" viram
 * interruptores (eram selects Sim/Não); rodapé fixo com o resumo dos dias.
 * Os campos, os nomes no FormData e o PATCH são exatamente os de antes.
 */
import { CalendarRange, Loader2, Pencil, Plane, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Event, Function, TeamInclusion } from "@shared/schema";
import { TrechoDaPerna, eventosParaTrecho, type PatchDeTrechos, type TrechosDaLinha } from "@/components/scaling-validation/trechos-da-perna";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { StatusPorChaveBadge } from "@/components/common/status-badge";
import { RequiredMark } from "@/components/forms/required-mark";
import { toTitleCase } from "@/lib/format";
import { DayButtons } from "./day-buttons";
import { formatDate, generateDaysInRange, getDisplayStatus } from "./inclusion-shared";
import { CAMPO, CabecalhoDoDialogo, CorpoDoDialogo, LABEL, RodapeDoDialogo, SECAO, TituloDaSecao, moldura } from "./inclusion-ui";
import type { EditInclusion } from "./use-edit-inclusion";

const ROTULO_MINI = "block mb-1 text-2xs font-medium text-muted-foreground";

/**
 * Só ida / só volta / "vem direto de / segue direto para" outro evento (09/10).
 * O formulário é não controlado: o estado mora aqui e vai no FormData pelos
 * campos ocultos; o servidor normaliza o resto (ex.: "segue direto" apaga a
 * volta sugerida) com a mesma regra da Sugestão.
 */
function TrechosDaVagaCampos({ inclusion, onMudou }: {
  inclusion: Pick<TeamInclusion, "id" | "eventId" | "scheduleStartDate" | "scheduleEndDate" | "trechosSugeridos" | "idaVemDoEventoId" | "voltaSegueParaEventoId">;
  onMudou: () => void;
}) {
  const [v, setV] = useState<TrechosDaLinha>(() => ({
    trechosSugeridos: inclusion.trechosSugeridos === "so_ida" || inclusion.trechosSugeridos === "so_volta" ? inclusion.trechosSugeridos : "",
    idaVemDoEventoId: inclusion.idaVemDoEventoId ?? "",
    voltaSegueParaEventoId: inclusion.voltaSegueParaEventoId ?? "",
  }));
  const { data: eventos } = useQuery<Event[]>({ queryKey: ["/api/events"], staleTime: 300_000 });
  const lista = useMemo(
    () => eventosParaTrecho(eventos, { id: inclusion.eventId, startDate: inclusion.scheduleStartDate, endDate: inclusion.scheduleEndDate }),
    [eventos, inclusion.eventId, inclusion.scheduleStartDate, inclusion.scheduleEndDate],
  );
  const aplicar = (p: PatchDeTrechos) => {
    setV((prev) => ({
      trechosSugeridos: p.trechosSugeridos !== undefined ? p.trechosSugeridos : prev.trechosSugeridos,
      idaVemDoEventoId: p.idaVemDoEventoId !== undefined ? p.idaVemDoEventoId : prev.idaVemDoEventoId,
      voltaSegueParaEventoId: p.voltaSegueParaEventoId !== undefined ? p.voltaSegueParaEventoId : prev.voltaSegueParaEventoId,
    }));
    onMudou();
  };
  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="edit-trechos">
      <TrechoDaPerna perna="ida" valor={v} eventos={lista} idBase={`edit-${inclusion.id}`} onPatch={aplicar} className="rounded-lg border border-border bg-card p-3" />
      <TrechoDaPerna perna="volta" valor={v} eventos={lista} idBase={`edit-${inclusion.id}`} onPatch={aplicar} className="rounded-lg border border-border bg-card p-3" />
      <input type="hidden" name="trechosSugeridos" value={v.trechosSugeridos ?? ""} />
      <input type="hidden" name="idaVemDoEventoId" value={v.idaVemDoEventoId ?? ""} />
      <input type="hidden" name="voltaSegueParaEventoId" value={v.voltaSegueParaEventoId ?? ""} />
    </div>
  );
}

/** Interruptor com rótulo e explicação — o valor vai no FormData como "true" (ou some, = false). */
function Interruptor({ id, name, rotulo, ajuda, defaultChecked, onMudou }: {
  id: string; name: string; rotulo: string; ajuda: string; defaultChecked: boolean; onMudou: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-foreground">{rotulo}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{ajuda}</span>
      </label>
      <Switch id={id} name={name} value="true" defaultChecked={defaultChecked} onCheckedChange={onMudou} className="mt-0.5" />
    </div>
  );
}

export function EditInclusionDialog({ edit, functions, getEventName, getCollaboratorName }: {
  edit: EditInclusion;
  functions: Function[] | undefined;
  getEventName?: (eventId: string) => string;
  getCollaboratorName?: (collaboratorId?: string) => string;
}) {
  const {
    showEditModal, editingInclusion, editStartDate, editEndDate, editSelectedDays, setEditDirty,
    fecharEdicao, changeStartDate, changeEndDate, selectAllDays, selectNoDays, toggleDay, submit, isPending, descarteEdicao,
  } = edit;
  const allDays = editStartDate && editEndDate ? generateDaysInRange(editStartDate, editEndDate) : [];
  const marcados = allDays.filter(d => editSelectedDays.has(d));
  const selectedCount = marcados.length;
  const periodoInvalido = !!(editStartDate && editEndDate && editEndDate < editStartDate);
  const fechar = () => descarteEdicao.pedirParaFechar(fecharEdicao);
  const evento = editingInclusion && getEventName ? getEventName(editingInclusion.eventId) : null;
  const pessoa = editingInclusion?.collaboratorId && getCollaboratorName ? toTitleCase(getCollaboratorName(editingInclusion.collaboratorId) || "") : null;

  return (
    <>
      <Dialog open={showEditModal && !!editingInclusion} onOpenChange={(v) => { if (!v) fechar(); }}>
        {editingInclusion && (
        <DialogContent
          className={moldura("sm:max-w-[680px]")}
          data-testid="modal-edit-inclusion"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (document.getElementById("edit-function-id") as HTMLSelectElement | null)?.focus();
          }}
        >
          <CabecalhoDoDialogo
            icone={Pencil}
            titulo="Editar inclusão"
            descricao={`Inclusão #${editingInclusion.inclusionNumber}`}
            onFechar={fechar}
            contexto={(evento || pessoa) ? (
              <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground leading-5">
                {evento && <span className="truncate max-w-full">{evento}</span>}
                {evento && <span aria-hidden="true">·</span>}
                <span className={pessoa ? "text-slate-700 font-medium" : ""}>{pessoa ?? "Sem colaborador"}</span>
              </p>
            ) : undefined}
          />

          <CorpoDoDialogo>
            <form
              id="edit-inclusion-form"
              onChange={() => setEditDirty(true)}
              onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}
              className="flex flex-col gap-3"
            >
              {/* Vaga: função + situação (somente leitura) */}
              <section className={SECAO} aria-labelledby="inc-ed-vaga">
                <TituloDaSecao icone={Tag} id="inc-ed-vaga">Vaga</TituloDaSecao>
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3">
                  <div>
                    <label htmlFor="edit-function-id" className={LABEL}>Função<RequiredMark /></label>
                    <select id="edit-function-id" name="functionId" defaultValue={editingInclusion.functionId} className={CAMPO} required>
                      {functions?.map((func) => (
                        <option key={func.id} value={func.id}>{func.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    {/* Somente leitura (23/09): o status é decidido pelo fluxo
                        (escalação, gestor, compras) — o select antigo não tinha
                        planejado/aprovado/escalacao e gravava "incluido". */}
                    <span className={LABEL}>Situação</span>
                    <div className="flex items-center h-10" data-testid="edit-status-readonly">
                      <StatusPorChaveBadge status={getDisplayStatus(editingInclusion)} size="md" />
                    </div>
                  </div>
                </div>
              </section>

              {/* Período e dias trabalhados */}
              <section className={SECAO} aria-labelledby="inc-ed-periodo">
                <TituloDaSecao
                  icone={CalendarRange}
                  id="inc-ed-periodo"
                  extra={allDays.length > 0 ? (
                    <span className="text-xs font-semibold tabular-nums text-primary" aria-live="polite">
                      {selectedCount} {selectedCount === 1 ? "diária" : "diárias"}
                    </span>
                  ) : undefined}
                >
                  Período e dias
                </TituloDaSecao>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-start-date" className={LABEL}>Data de início<RequiredMark /></label>
                    <input id="edit-start-date" type="date" value={editStartDate} onChange={(e) => changeStartDate(e.target.value)} className={CAMPO} required />
                  </div>
                  <div>
                    <label htmlFor="edit-end-date" className={LABEL}>Data de fim<RequiredMark /></label>
                    <input
                      id="edit-end-date" type="date" value={editEndDate} onChange={(e) => changeEndDate(e.target.value)} className={CAMPO} required
                      aria-invalid={periodoInvalido || undefined} aria-describedby={periodoInvalido ? "edit-end-date-erro" : undefined}
                    />
                  </div>
                </div>
                {periodoInvalido && (
                  <p id="edit-end-date-erro" role="alert" className="m-0 mt-2 text-xs font-medium text-danger">
                    A data de fim não pode ser anterior à data de início.
                  </p>
                )}

                {/* Seletor de dias individuais */}
                {allDays.length > 0 && (
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-medium text-slate-600" id="edit-dias-rotulo">Dias trabalhados</span>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => selectAllDays(allDays)}
                          className="h-7 px-2 rounded-md text-xs font-medium text-primary hover:bg-brand-soft">Todos</button>
                        <button type="button" onClick={selectNoDays}
                          className="h-7 px-2 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Nenhum</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="edit-dias-rotulo">
                      <DayButtons allDays={allDays} isSelected={(d) => editSelectedDays.has(d)} onToggle={toggleDay} ariaPressed />
                    </div>
                    <p className="m-0 mt-2 text-xs text-muted-foreground">
                      O período salvo vai do primeiro ao último dia marcado; a quantidade de diárias é a de dias marcados.
                    </p>
                  </div>
                )}
              </section>

              {/* Logística: precisa de passagem/hospedagem + sugestão de voo */}
              <section className={SECAO} aria-labelledby="inc-ed-logistica">
                <TituloDaSecao icone={Plane} id="inc-ed-logistica">Logística</TituloDaSecao>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Interruptor id="edit-needs-ticket" name="needsTicket" rotulo="Precisa de passagem" ajuda="Entra na fila de Passagens."
                    defaultChecked={!!editingInclusion.needsTicket} onMudou={() => setEditDirty(true)} />
                  <Interruptor id="edit-needs-accommodation" name="needsAccommodation" rotulo="Precisa de hospedagem" ajuda="Entra na fila de Hospedagem."
                    defaultChecked={!!editingInclusion.needsAccommodation} onMudou={() => setEditDirty(true)} />
                </div>

                <div className="mt-4">
                  <p className="m-0 text-xs font-medium text-slate-600">Sugestão de voo</p>
                  <p className="m-0 mt-0.5 mb-2 text-xs text-muted-foreground">Aparece como sugestão na tela de Escalação. Vale escrever “sábado”, “9h”, “final da tarde”.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <fieldset className="m-0 min-w-0 rounded-lg border border-border bg-surface-muted/60 p-3">
                      <legend className="px-1 text-2xs font-semibold uppercase tracking-[0.06em] text-primary">Ida</legend>
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                        <div>
                          <label htmlFor="edit-ida" className={ROTULO_MINI}>Dia</label>
                          <input id="edit-ida" type="date" name="ida" defaultValue={editingInclusion.flightDepartureDate || ''} className={`${CAMPO} h-9 px-2`} />
                        </div>
                        <div>
                          <label htmlFor="edit-chegada" className={ROTULO_MINI}>Horário</label>
                          <input id="edit-chegada" type="text" name="chegada" defaultValue={editingInclusion.flightArrivalSuggestedTime || ''} placeholder="Ex: 9h, manhã" className={`${CAMPO} h-9 px-2 placeholder:text-muted-foreground`} />
                        </div>
                      </div>
                    </fieldset>
                    <fieldset className="m-0 min-w-0 rounded-lg border border-border bg-surface-muted/60 p-3">
                      <legend className="px-1 text-2xs font-semibold uppercase tracking-[0.06em] text-slate-600">Retorno</legend>
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                        <div>
                          <label htmlFor="edit-retorno" className={ROTULO_MINI}>Dia</label>
                          <input id="edit-retorno" type="date" name="retorno" defaultValue={editingInclusion.flightReturnDate || ''} className={`${CAMPO} h-9 px-2`} />
                        </div>
                        <div>
                          <label htmlFor="edit-horario-retorno" className={ROTULO_MINI}>Horário</label>
                          <input id="edit-horario-retorno" type="text" name="horarioRetorno" defaultValue={editingInclusion.flightReturnSuggestedTime || ''} placeholder="Ex: 18h, final da tarde" className={`${CAMPO} h-9 px-2 placeholder:text-muted-foreground`} />
                        </div>
                      </div>
                    </fieldset>
                  </div>
                  {/* Só ida / só volta / trecho direto (09/10). */}
                  <TrechosDaVagaCampos inclusion={editingInclusion} onMudou={() => setEditDirty(true)} />
                </div>
              </section>
            </form>
          </CorpoDoDialogo>

          <RodapeDoDialogo
            info={allDays.length > 0 && selectedCount > 0 ? (
              <span className="tabular-nums">
                {selectedCount} {selectedCount === 1 ? "diária" : "diárias"} · {formatDate(marcados[0])} – {formatDate(marcados[marcados.length - 1])}
              </span>
            ) : allDays.length > 0 ? <span className="text-warning font-medium">Nenhum dia marcado</span> : undefined}
          >
            <Button type="button" variant="outline" onClick={fechar} className="h-9 rounded-lg px-4 text-sm font-medium">
              Cancelar
            </Button>
            <Button type="submit" form="edit-inclusion-form" disabled={isPending} aria-busy={isPending} className="h-9 rounded-lg px-4 text-sm font-semibold gap-2 hover:bg-primary-hover" data-testid="button-save-inclusion">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isPending ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </RodapeDoDialogo>
        </DialogContent>
        )}
      </Dialog>
      {descarteEdicao.Dialogo}
    </>
  );
}
