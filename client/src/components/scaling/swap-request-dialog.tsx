/**
 * Formulário de solicitação de troca + confirmação pós-envio (25/09 — extraído
 * de swap-request-panel.tsx). Troca simples × permuta com o colaborador de
 * outra vaga (14/09), com o "Sai de" de cada um.
 */
import { useEffect, useState } from "react";
import { ArrowLeftRight, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ExplicacaoDaTroca } from "./swap-explicacao";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import EscolherColaborador from "./escolher-colaborador";
import type { TeamInclusion, Collaborator } from "@shared/schema";
import { parseDay } from "./scaling-utils";
import { cidadeDeSaida, validarSaiDe } from "@shared/swap-sai-de";
import { EscolherVagaDaPermuta, candidatasDaPermuta, periodoCurto } from "./swap-permuta";
import type { ScalingMutations } from "./use-scaling-mutations";
import { RequiredMark } from "@/components/forms/required-mark";
import { CampoSaiDe, saiDeInicial } from "./campo-sai-de";
import { getStatusBadge } from "./scaling-table-cells";


export interface SwapRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inclusion: TeamInclusion;
  collaborators: Collaborator[] | undefined;
  getCollaboratorName: (id?: string | null) => string;
  getEventName: (id: string | null) => string;
  getFunctionName: (id: string | null) => string;
  getCollaboratorConflicts: (collaboratorId: string, ref: TeamInclusion | null | undefined) => { sameEvent: TeamInclusion[]; dateOverlap: TeamInclusion[] };
  createSwapRequest: ScalingMutations["createSwapRequest"];
  /** Todas as vagas — candidatas da permuta (14/09). */
  inclusions?: TeamInclusion[] | undefined;
  /**
   * Quem já está escalado no mesmo período (05/10): em vez de só travar,
   * oferece trazer a pessoa para cá SEM mexer em quem está aqui ir para a
   * vaga dela — a vaga de onde ela sai fica aberta.
   */
  onPedirTransferencia?: (collaboratorId: string) => void;
}

export function SwapRequestDialog({
  open, onOpenChange, inclusion, collaborators, getCollaboratorName, getEventName, getFunctionName,
  getCollaboratorConflicts, createSwapRequest, inclusions, onPedirTransferencia,
}: SwapRequestDialogProps) {
  const [newCollaboratorId, setNewCollaboratorId] = useState("");
  const [reason, setReason] = useState("");
  /** De onde o novo colaborador sai (14/09) — preenchido pela cidade dele ao escolher. */
  const [saiDe, setSaiDe] = useState(() => saiDeInicial(null));
  /** Troca simples × permuta com o colaborador de outra vaga (14/09). */
  const [modo, setModo] = useState<"substituicao" | "permuta">("substituicao");
  const [vagaPermutaId, setVagaPermutaId] = useState("");
  /** De onde o colaborador ATUAL sai para a outra vaga (só na permuta). */
  const [saiDeOutro, setSaiDeOutro] = useState(() => saiDeInicial(null));
  const [success, setSuccess] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Ao abrir, começa limpo (o botão "Solicitar troca" zerava os campos)
  useEffect(() => {
    if (open) { setNewCollaboratorId(""); setReason(""); setSaiDe(saiDeInicial(null)); setModo("substituicao"); setVagaPermutaId(""); setSaiDeOutro(saiDeInicial(null)); setSubmitAttempted(false); setSuccess(false); }
  }, [open]);

  const resetAndClose = () => {
    setSuccess(false);
    setNewCollaboratorId("");
    setReason("");
    setSaiDe(saiDeInicial(null));
    setModo("substituicao");
    setVagaPermutaId("");
    setSaiDeOutro(saiDeInicial(null));
    setSubmitAttempted(false);
    onOpenChange(false);
  };

  const currentCollabName = getCollaboratorName(inclusion.collaboratorId || undefined);
  const newCollabName = newCollaboratorId ? getCollaboratorName(newCollaboratorId) : null;
  const isSameCollab = !!(newCollaboratorId && newCollaboratorId === inclusion.collaboratorId);
  const reasonTooShort = reason.trim().length > 0 && reason.trim().length < 10;
  const reasonEmpty = submitAttempted && !reason.trim();
  const collabEmpty = submitAttempted && !newCollaboratorId;
  const cidadeSaida = cidadeDeSaida(saiDe.saiDeSP, saiDe.cidade);
  const erroSaiDe = validarSaiDe(cidadeSaida);
  const permuta = modo === "permuta";
  const candidatasPermuta = permuta ? candidatasDaPermuta(inclusion, inclusions ?? []) : [];
  const vagaPermuta = permuta ? (inclusions ?? []).find((i) => i.id === vagaPermutaId) ?? null : null;
  const cidadeSaidaOutro = cidadeDeSaida(saiDeOutro.saiDeSP, saiDeOutro.cidade);
  const erroSaiDeOutro = permuta ? validarSaiDe(cidadeSaidaOutro) : null;
  const canSubmit = !!newCollaboratorId && !isSameCollab && reason.trim().length >= 10 && !erroSaiDe && !erroSaiDeOutro
    && (!permuta || !!vagaPermuta) && !createSwapRequest.isPending;

  const startDay = parseDay(inclusion.scheduleStartDate);
  const endDay = parseDay(inclusion.scheduleEndDate);
  const startDate = startDay ? format(startDay, "dd/MM/yyyy", { locale: ptBR }) : null;
  const endDate = endDay ? format(endDay, "dd/MM/yyyy", { locale: ptBR }) : null;
  const periodo = startDate && endDate ? `${startDate} a ${endDate}` : startDate || endDate || "—";

  const conflicts = newCollaboratorId ? getCollaboratorConflicts(newCollaboratorId, inclusion) : null;
  const hasConflict = !!conflicts && (conflicts.sameEvent.length > 0 || conflicts.dateOverlap.length > 0);

  return (
    <>
      {/* Formulário */}
      <Dialog open={open && !success} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
        {/* Altura limitada (dono, 16/09: "o modal está cortando"): cabeçalho e
            botões fixos, só o miolo rola — em tela baixa o "Enviar para
            aprovação" sumia para fora da janela. */}
        {/* 07/10: o cabeçalho é o do sistema (título, frase e a vaga numa faixa
            de dados) — saiu o quadrado azul com sombra e o fundo azul; a
            situação usa a pílula do app (aparecia "escalado" cru). O rodapé
            alinha à direita: Cancelar em contorno, Enviar como principal. */}
        <DialogContent aria-describedby={undefined} className="max-w-[780px] w-[calc(100vw-1rem)] sm:w-[95vw] max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] flex flex-col p-0 gap-0 rounded-xl overflow-hidden">
          <div className="shrink-0 px-5 sm:px-6 pt-5 pb-4 border-b border-border bg-card">
            <DialogTitle className="pr-8 text-base font-semibold text-foreground leading-tight">Solicitar troca de colaborador</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">A troca só será efetivada após aprovação do time de Compras.</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
              <div className="min-w-0">
                <dt className="text-2xs text-muted-foreground">Evento</dt>
                <dd className="truncate text-sm font-semibold text-foreground" title={getEventName(inclusion.eventId)}>{getEventName(inclusion.eventId)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-2xs text-muted-foreground">Função</dt>
                <dd className="truncate text-sm font-semibold text-foreground" title={getFunctionName(inclusion.functionId)}>{getFunctionName(inclusion.functionId)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-2xs text-muted-foreground">Período</dt>
                <dd className="text-sm font-medium tabular-nums text-slate-700 sm:whitespace-nowrap">{periodo}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-2xs text-muted-foreground">Situação</dt>
                <dd className="mt-0.5">{getStatusBadge(inclusion, "sm")}</dd>
              </div>
            </dl>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto bg-background px-5 sm:px-6 py-4 space-y-4">
            {/* Troca simples × permuta (dono, 14/09): dois colaboradores já
                escalados no mesmo período não conseguiam trocar de vaga — cada
                vaga acusava conflito com a outra. */}
            <div role="radiogroup" aria-label="Tipo de troca" className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="tipo-de-troca">
              {([
                ["substituicao", "Colocar outro colaborador", "Quem entra ainda não está escalado no mesmo período."],
                ["permuta", "Trocar com alguém de outra vaga", "Os dois já estão escalados e trocam de lugar — ex.: mesmo fim de semana, eventos diferentes."],
              ] as const).map(([k, titulo, desc]) => {
                const on = modo === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setModo(k);
                      setNewCollaboratorId("");
                      setVagaPermutaId("");
                      setSaiDe(saiDeInicial(null));
                      setSaiDeOutro(saiDeInicial(null));
                      setSubmitAttempted(false);
                    }}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${on ? "border-primary bg-card ring-1 ring-primary shadow-1" : "border-border bg-card hover:border-slate-300"}`}
                    data-testid={`tipo-de-troca-${k}`}
                  >
                    <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-primary" : "border-slate-300"}`}>
                      {on && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold ${on ? "text-primary" : "text-foreground"}`}>{titulo}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-border bg-card px-4 py-3" data-testid="troca-atual-novo">
              <div className="min-w-0">
                <div className="text-2xs text-muted-foreground">Colaborador atual</div>
                <div className="text-sm font-semibold text-foreground leading-snug break-words">{currentCollabName}</div>
              </div>
              <ArrowRight className={`h-4 w-4 shrink-0 transition-colors ${newCollabName ? "text-primary" : "text-muted-foreground/50"}`} aria-hidden="true" />
              <div className="min-w-0 text-right">
                <div className="text-2xs text-muted-foreground">Novo colaborador</div>
                {newCollabName
                  ? <div className="esc-entra text-sm font-semibold text-primary leading-snug break-words">{newCollabName}</div>
                  : <div className="text-sm text-muted-foreground">Ainda não selecionado</div>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {permuta ? (
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 block">Vaga do outro colaborador</label>
                {vagaPermuta ? (
                  <div className="rounded-lg border border-primary/30 bg-brand-soft px-3 py-2" data-testid="vaga-permuta-escolhida">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground break-words">{getCollaboratorName(vagaPermuta.collaboratorId)}</div>
                        <div className="text-2xs text-slate-600 break-words">
                          #{vagaPermuta.inclusionNumber} · {getEventName(vagaPermuta.eventId)} · {getFunctionName(vagaPermuta.functionId)} · {periodoCurto(vagaPermuta)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setVagaPermutaId(""); setNewCollaboratorId(""); setSaiDe(saiDeInicial(null)); setSaiDeOutro(saiDeInicial(null)); }}
                        className="shrink-0 text-2xs font-semibold text-primary hover:underline"
                        data-testid="button-trocar-vaga-permuta"
                      >
                        Trocar
                      </button>
                    </div>
                  </div>
                ) : (
                  <EscolherVagaDaPermuta
                    candidatas={candidatasPermuta}
                    getCollaboratorName={getCollaboratorName}
                    getEventName={getEventName}
                    getFunctionName={getFunctionName}
                    onEscolher={(v) => {
                      setVagaPermutaId(v.id);
                      setNewCollaboratorId(v.collaboratorId ?? "");
                      // Cada um vem com a cidade de saída que já tem: quem chega,
                      // a do cadastro; quem sai para a outra vaga, a desta vaga.
                      setSaiDe(saiDeInicial((collaborators || []).find((c) => c.id === v.collaboratorId)?.city));
                      setSaiDeOutro(saiDeInicial(inclusion.city || (collaborators || []).find((c) => c.id === inclusion.collaboratorId)?.city));
                      setSubmitAttempted(false);
                    }}
                  />
                )}
                {submitAttempted && !vagaPermuta && <p className="text-2xs text-danger-strong mt-1">Escolha a vaga do outro colaborador.</p>}
                <p className="mt-1.5 text-2xs leading-snug text-muted-foreground">
                  Aprovada a troca, os dois trocam de lugar ao mesmo tempo — sem conflito de datas, porque ninguém fica em dois lugares.
                </p>
              </div>
              ) : (
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 block">Novo colaborador</label>
                {/* O conflito de agenda aparece NA LISTA, não depois de
                    escolher: descobrir que a pessoa não pode só ao selecioná-la
                    é fazer o trabalho duas vezes. */}
                <EscolherColaborador
                  colaboradores={(collaborators || []).filter(c => c.id !== inclusion.collaboratorId)}
                  inclusion={inclusion}
                  getConflitos={getCollaboratorConflicts}
                  getEventName={getEventName}
                  onPedirTransferencia={onPedirTransferencia ? (id) => { resetAndClose(); onPedirTransferencia(id); } : undefined}
                  onEscolher={(v) => {
                    setNewCollaboratorId(v);
                    // Mesma regra do modal: a cidade de saída acompanha o
                    // colaborador escolhido (quem é de SP já vem com SP marcado).
                    setSaiDe(saiDeInicial((collaborators || []).find((c) => c.id === v)?.city));
                    setSubmitAttempted(false);
                  }}
                />
                {collabEmpty && <p className="text-2xs text-danger-strong mt-1">Selecione um novo colaborador.</p>}
                {isSameCollab && <p className="text-2xs text-danger-strong mt-1">Precisa ser diferente do atual.</p>}
                {hasConflict && conflicts && (
                  <div className="flex items-start gap-1.5 rounded-lg border border-warning/25 bg-warning-soft px-2.5 py-1.5 mt-1">
                    <AlertCircle className="w-3 h-3 text-warning-strong shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-2xs text-warning leading-snug">
                      <span className="font-semibold">Já escalado</span>
                      {conflicts.sameEvent.length > 0 && <span> neste evento</span>}
                      {conflicts.sameEvent.length > 0 && conflicts.dateOverlap.length > 0 && <span> e</span>}
                      {conflicts.dateOverlap.length > 0 && <span> em datas sobrepostas</span>}
                      .
                    </p>
                  </div>
                )}
              </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="swap-reason" className="text-xs font-medium text-slate-600">Motivo da troca<RequiredMark /></label>
                  <span className={`text-2xs tabular-nums ${reason.trim().length >= 10 ? "text-success" : "text-muted-foreground"}`}>{reason.trim().length}/10</span>
                </div>
                <Textarea
                  id="swap-reason"
                  value={reason}
                  onChange={(e) => { setReason(e.target.value); setSubmitAttempted(false); }}
                  placeholder="Informe o motivo da troca. Ex: colaborador indisponível, ajuste operacional ou substituição solicitada."
                  className="resize-none text-sm rounded-lg bg-card focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:ring-offset-0 focus-visible:border-primary"
                  rows={3}
                  aria-invalid={reasonEmpty || reasonTooShort || undefined}
                  style={{ minHeight: 88 }}
                />
                {(reasonEmpty || reasonTooShort)
                  ? <p className="text-2xs text-danger-strong mt-1">{reasonEmpty ? "Informe um motivo." : "Mínimo de 10 caracteres."}</p>
                  : <p className="text-2xs text-muted-foreground mt-1">Mínimo de 10 caracteres.</p>}
                {/* "Sai de" (dono, 14/09): sempre visível; travado até escolher.
                    Na permuta são DOIS — um para quem chega, outro para quem vai. */}
                <div className="mt-4 space-y-3">
                  <CampoSaiDe
                    id="swap-sai-de-pedido"
                    rotulo={permuta && vagaPermuta ? `${getCollaboratorName(vagaPermuta.collaboratorId)} sai de (vem para esta vaga)` : "Novo colaborador sai de"}
                    dicaTravado={permuta ? "Escolha a vaga do outro colaborador — a cidade de cada um entra aqui e dá para corrigir." : "Escolha o novo colaborador — a cidade dele entra aqui e dá para corrigir."}
                    saiDeSP={saiDe.saiDeSP}
                    cidade={saiDe.cidade}
                    onChange={(sp, cidade) => { setSaiDe({ saiDeSP: sp, cidade }); setSubmitAttempted(false); }}
                    forcarErro={submitAttempted}
                    travado={!newCollaboratorId}
                  />
                  {permuta && (
                    <CampoSaiDe
                      id="swap-sai-de-outro"
                      rotulo={`${currentCollabName} sai de (vai para a outra vaga)`}
                      dicaTravado="Escolha a vaga do outro colaborador."
                      saiDeSP={saiDeOutro.saiDeSP}
                      cidade={saiDeOutro.cidade}
                      onChange={(sp, cidade) => { setSaiDeOutro({ saiDeSP: sp, cidade }); setSubmitAttempted(false); }}
                      forcarErro={submitAttempted}
                      travado={!vagaPermuta}
                    />
                  )}
                </div>
              </div>
            </div>
            {/* Antes de enviar (16/09): o mesmo quadro que Compras vai ler. */}
            {newCollaboratorId && (
              <ExplicacaoDaTroca
                titulo="Se for aprovada"
                troca={{
                  swapKind: permuta ? "permuta" : "substituicao",
                  inclusionNumber: inclusion.inclusionNumber ?? null,
                  eventName: getEventName(inclusion.eventId),
                  pairedInclusionNumber: vagaPermuta?.inclusionNumber ?? null,
                  pairedEventName: vagaPermuta ? getEventName(vagaPermuta.eventId) : null,
                  pairedFunctionName: vagaPermuta ? getFunctionName(vagaPermuta.functionId) : null,
                  currentCollaboratorName: currentCollabName,
                  newCollaboratorName: newCollabName,
                  newCity: cidadeSaida || null,
                  pairedNewCity: permuta ? cidadeSaidaOutro || null : null,
                }}
              />
            )}
          </div>

          <div className="shrink-0 px-5 sm:px-6 py-3 flex flex-col-reverse gap-2 border-t border-border bg-card sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="rounded-lg h-9 px-4 text-sm font-medium"
              onClick={() => { setSubmitAttempted(false); onOpenChange(false); }}
              disabled={createSwapRequest.isPending}
            >
              Cancelar
            </Button>
            <Button
              className="h-9 px-5 gap-1.5 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground shadow-1 transition-colors"
              disabled={!canSubmit}
              onClick={() => {
                setSubmitAttempted(true);
                if (!canSubmit) return;
                createSwapRequest.mutate(
                  {
                    teamInclusionId: inclusion.id, newCollaboratorId, reason: reason.trim(), newCity: cidadeSaida,
                    ...(permuta && vagaPermuta ? { kind: "permuta" as const, pairedInclusionId: vagaPermuta.id, pairedNewCity: cidadeSaidaOutro } : {}),
                  },
                  { onSuccess: () => setSuccess(true) },
                );
              }}
            >
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              {createSwapRequest.isPending ? "Enviando…" : "Enviar para aprovação"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação pós-envio */}
      <Dialog open={success} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
        <DialogContent aria-describedby={undefined} className="max-w-[460px] p-0 gap-0 rounded-xl overflow-hidden">
          <div className="px-6 py-7 sm:px-8">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="esc-entra w-12 h-12 rounded-full bg-success-soft flex items-center justify-center mb-3">
                <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground mb-1">Solicitação enviada para aprovação</DialogTitle>
              <p className="text-xs text-muted-foreground leading-relaxed">A troca foi enviada para análise do time de Compras.</p>
            </div>
            <div className="bg-surface-muted rounded-xl border border-border p-4 mb-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-2xs uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">Escala</div>
                  <div className="text-xs font-semibold text-foreground leading-tight truncate">{getEventName(inclusion.eventId)}</div>
                  <div className="text-2xs text-muted-foreground leading-tight">Função: {getFunctionName(inclusion.functionId)}</div>
                </div>
                <span className="text-2xs font-medium bg-warning-soft text-warning border border-warning/25 rounded-full px-2.5 py-1 shrink-0 leading-tight">Aguardando aprovação</span>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <div className="flex-1 min-w-0">
                  <div className="text-2xs uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">Colaborador atual</div>
                  <div className="text-xs font-semibold text-slate-700 leading-snug">{currentCollabName}</div>
                </div>
                <div className="w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center shrink-0">
                  <ArrowLeftRight className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <div className="text-2xs uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">Colaborador solicitado</div>
                  <div className="text-xs font-semibold text-primary leading-snug">{newCollabName || "—"}</div>
                  {cidadeSaida && <div className="text-2xs text-muted-foreground leading-snug">Sai de {cidadeSaida}</div>}
                </div>
              </div>
            </div>
            <div className="bg-brand-soft border border-primary/25 rounded-xl px-3.5 py-2.5 mb-5">
              <p className="text-2xs text-primary leading-relaxed">
                <span className="font-semibold">A escala continuará com o colaborador atual</span> até que a troca seja aprovada pelo time de Compras.
                {permuta && vagaPermuta && <> Na troca entre vagas, {currentCollabName} vai para a vaga #{vagaPermuta.inclusionNumber} ({getEventName(vagaPermuta.eventId)}), saindo de {cidadeSaidaOutro}.</>}
              </p>
            </div>
            <Button className="w-full bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg h-10 font-semibold text-sm" onClick={resetAndClose}>
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
