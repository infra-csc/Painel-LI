/**
 * Resumo · Col 2 (ramo EDITÁVEL) — escolher quem preenche a vaga (25/09 —
 * extraído do dialog): empreita × colaborador, lista de nomes, tipo de
 * atendimento, tipo do percurseiro (desligado), cidade de saída, transferência
 * e os avisos de conflito de agenda.
 */
import { useState } from "react";
import { AlertCircle, ArrowLeftRight, Bike, MapPin, Users } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { ATENDIMENTO_TIPOS } from "@shared/atendimento";
import { PERCURSEIRO_TIPOS, percurseiroDiariaCents } from "@shared/calculation-rules";
import { RequiredMark } from "@/components/forms/required-mark";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import EscolherColaborador from "../escolher-colaborador";
import { SwapStatusCard, RequestSwapButton } from "../swap-request-panel";
import { isEscalated, isEscalationConfirmed, isCityFromSP } from "../scaling-utils";
import { isAtendimentoMissing, isPercurseiroMissing } from "../scaling-validation";
import { EmpreitaCampos } from "./empreita-campos";
import { avisoDeTrocaPendente } from "@/lib/swap-types";
import { SHOW_PERCURSEIRO_TIPO_NA_ESCALACAO, brl, conflitosUnicos, type InclusionDetailsDialogProps } from "./details-shared";
import type { InclusionDialogState } from "./use-inclusion-dialog-state";

/** "AAAA-MM-DD" → "DD/MM/AAAA" sem passar por Date: new Date("2026-10-26") é meia-noite UTC e no fuso de Brasília virava o dia anterior. */
const dataDaVaga = (v: string | Date | null | undefined): string => {
  if (!v) return "";
  const [a, m, d] = (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : "";
};

export function ColaboradorPicker({ inclusion, props, st }: { inclusion: TeamInclusion; props: InclusionDetailsDialogProps; st: InclusionDialogState }) {
  const { modalData, setModalData, data, details, mutations, user } = props;
  const { collaborators, getEventName, getCollaboratorName, getCollaboratorCity, isAdminOrPurchasing, getCollaboratorConflicts } = data;
  const { pendingSwap, latestSwap } = details;
  const { requestLockReason, actionLockReason, isCenoEmpreitaInclusion, isPercursoInclusion, systemSettings, escolhendoColaborador, setEscolhendoColaborador, setTransferirColaboradorId, setShowSwapModal } = st;
  const cityLabel = modalData.collaboratorId ? (modalData.city || getCollaboratorCity(modalData.collaboratorId)) : "";
  /** O campo da cidade só ganha foco quando a pessoa pede "Outra cidade". */
  const [cidadeEmFoco, setCidadeEmFoco] = useState(false);
  return (
    <div className="space-y-2.5">
      {/* Empreita por empresa (dono, 10/09): só cenotécnica. Em vez de
          um nome, a empresa que manda as pessoas. */}
      {isCenoEmpreitaInclusion && (
        <div role="radiogroup" aria-label="Quem preenche a vaga" className="inline-flex rounded-lg border border-border bg-muted p-0.5" data-testid="toggle-empreita">
          {([["colaborador", "Colaborador"], ["empreita", "Empreita (empresa)"]] as const).map(([k, label]) => {
            const on = (k === "empreita") === !!modalData.empreitaModo;
            return (
              <button
                key={k} type="button" role="radio" aria-checked={on} disabled={!!requestLockReason}
                onClick={() => setModalData(prev => ({ ...prev, empreitaModo: k === "empreita" }))}
                data-testid={`toggle-empreita-${k}`}
                className={`esc-alvo rounded-md px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "bg-card text-primary shadow-1" : "text-slate-600 hover:text-foreground"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      {modalData.empreitaModo ? (
        <EmpreitaCampos modalData={modalData} setModalData={setModalData} disabled={!!requestLockReason} />
      ) : (
      <div className={!modalData.collaboratorId && !isEscalated(inclusion) ? "rounded-lg ring-1 ring-warning/40" : ""}>
        {escolhendoColaborador ? (
          <EscolherColaborador
            colaboradores={collaborators}
            inclusion={inclusion}
            getConflitos={getCollaboratorConflicts}
            getEventName={getEventName}
            onEscolher={(value) => {
              // Mesma regra de sempre: a cidade de saída
              // acompanha o colaborador, e quem é de São
              // Paulo já entra com "Sai de SP" marcado.
              const newCity = getCollaboratorCity(value);
              const fromSP = isCityFromSP(newCity);
              setModalData(prev => ({ ...prev, collaboratorId: value, city: fromSP ? "São Paulo - SP" : (newCity || ""), departureFromSP: fromSP }));
              setEscolhendoColaborador(false);
            }}
            onCancelar={modalData.collaboratorId ? () => setEscolhendoColaborador(false) : undefined}
            // 05/10: também com alguém na vaga — quem está aqui sai quando Compras aprovar.
            onPedirTransferencia={!pendingSwap ? (id) => setTransferirColaboradorId(id) : undefined}
            disabled={!!requestLockReason}
            disabledReason={requestLockReason}
          />
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-foreground" data-testid="text-collaborator-escolhido">
                {modalData.collaboratorId ? getCollaboratorName(modalData.collaboratorId) : "Nenhum colaborador escolhido"}
              </span>
              {modalData.collaboratorId && cityLabel && (
                <span className="block truncate text-xs text-muted-foreground">{cityLabel}</span>
              )}
            </span>
            <MotivoDesabilitado motivo={requestLockReason ?? "Escolher outro colaborador para esta vaga"} desabilitado={!!requestLockReason}>
              <button
              type="button"
              onClick={() => setEscolhendoColaborador(true)}
              disabled={!!requestLockReason}
              data-testid="select-collaborator-escalation"
              className="esc-alvo shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {modalData.collaboratorId ? "Trocar" : "Escolher"}
            </button>
            </MotivoDesabilitado>
          </div>
        )}
      </div>
      )}
      {!modalData.empreitaModo && !modalData.collaboratorId && !isEscalated(inclusion) && (
        <p className="text-xs text-warning flex items-center gap-1.5" data-testid="hint-collaborator-required">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />Obrigatório para confirmar a escalação.
        </p>
      )}
      {/* 09/10: salvar outra pessoa nesta vaga cancela o pedido de troca pendente (servidor). */}
      {pendingSwap && (modalData.empreitaModo ? null : (modalData.collaboratorId || null)) !== (inclusion.collaboratorId ?? null) && (
        <p className="text-xs text-warning flex items-start gap-1.5 leading-snug" role="status" data-testid="aviso-troca-pendente">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />{avisoDeTrocaPendente(pendingSwap)}
        </p>
      )}
      {/* Tipo de atendimento — obrigatório quando a função é de atendimento */}
      {data.isAtendimentoInclusion(inclusion) && (() => {
        const missing = isAtendimentoMissing(inclusion, modalData, data);
        return (
          <div className="space-y-1.5">
            <label htmlFor="select-atendimento-tipo" className="text-xs font-medium text-slate-600 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              Tipo de atendimento<RequiredMark />
            </label>
            <select
              id="select-atendimento-tipo"
              value={modalData.atendimentoTipo}
              onChange={(e) => setModalData(prev => ({ ...prev, atendimentoTipo: e.target.value }))}
              data-testid="select-atendimento-tipo"
              disabled={!!requestLockReason}
              title={requestLockReason ?? undefined}
              aria-invalid={missing}
              className={`w-full h-9 px-3 text-sm border rounded-lg bg-card focus:outline-none focus:ring-[3px] ${missing ? "border-danger/40 focus:ring-danger/15" : "border-border focus:border-primary focus:ring-primary/12"}`}
            >
              <option value="">Selecione…</option>
              {ATENDIMENTO_TIPOS.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
            </select>
            {missing && (
              <p className="text-2xs text-danger flex items-center gap-1" data-testid="hint-atendimento-required">
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />Selecione Key Account ou Executivo de Contas.
              </p>
            )}
          </div>
        );
      })()}
      {/* Tipo do percurseiro (Tipo 1 × Tipo 2): por decisão do usuário
          (17/08) é definido NO PLANEJADO, não aqui. Bloco mantido
          desligado (SHOW_PERCURSEIRO_TIPO_NA_ESCALACAO) para religar
          sem reescrever se a regra mudar. */}
      {SHOW_PERCURSEIRO_TIPO_NA_ESCALACAO && isPercursoInclusion && (() => {
        const missing = isPercurseiroMissing(inclusion, modalData, data);
        return (
          <div className="space-y-1.5">
            <label className="text-2xs font-semibold text-slate-600 flex items-center gap-1">
              <Bike className="w-3 h-3" aria-hidden="true" />
              Tipo do percurseiro<RequiredMark />
            </label>
            <div
              role="radiogroup"
              aria-label="Tipo do percurseiro"
              aria-invalid={missing}
              data-testid="select-percurseiro-tipo"
              className={`flex gap-1.5 rounded-xl ${missing ? "ring-1 ring-danger/25 p-0.5" : ""}`}
            >
              {PERCURSEIRO_TIPOS.map((t) => {
                const ativo = modalData.percurseiroTipo === t.value;
                const diaria = percurseiroDiariaCents(t.value, systemSettings);
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    data-testid={`btn-percurseiro-${t.value}`}
                    onClick={() => setModalData(prev => ({ ...prev, percurseiroTipo: t.value }))}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-2xs font-semibold border transition-all ${ativo ? "bg-primary text-primary-foreground border-primary" : "bg-card text-slate-600 border-border hover:border-slate-300"}`}
                  >
                    {t.label}
                    {diaria && (
                      <span className={`block text-2xs font-medium ${ativo ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {brl(diaria.total)}/diária
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {missing && (
              <p className="text-2xs text-danger flex items-center gap-1" data-testid="hint-percurseiro-required">
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />Defina o tipo do percurseiro (Tipo 1 ou Tipo 2).
              </p>
            )}
          </div>
        );
      })()}
      {/* Cidade de saída — controle segmentado (07/10): antes eram dois
          botões cheios de cores diferentes (azul × grafite), e o "ligado" não
          era óbvio. O campo da cidade só ganha foco quando a pessoa escolhe
          "Outra cidade" (o autoFocus pulava para ele ao abrir qualquer vaga). */}
      <div className="space-y-1.5 pt-1">
        <p id="rotulo-sai-de" className="text-xs font-medium text-slate-600 flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          Sai de
        </p>
        <div role="radiogroup" aria-labelledby="rotulo-sai-de" className="grid grid-cols-2 gap-0.5 rounded-lg border border-border bg-muted p-0.5">
          {([[true, "São Paulo - SP"], [false, "Outra cidade"]] as const).map(([sp, rotulo]) => {
            const on = modalData.departureFromSP === sp;
            return (
              <MotivoDesabilitado key={rotulo} motivo={requestLockReason ?? undefined} desabilitado={!!requestLockReason} className="flex">
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    if (!sp) setCidadeEmFoco(true);
                    setModalData(prev => sp ? ({ ...prev, departureFromSP: true, city: "São Paulo - SP" }) : ({ ...prev, departureFromSP: false, city: "" }));
                  }}
                  disabled={!!requestLockReason}
                  className={`esc-alvo w-full rounded-md px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed ${on ? "bg-card text-primary shadow-1" : "text-slate-600 hover:text-foreground"}`}
                >
                  {rotulo}
                </button>
              </MotivoDesabilitado>
            );
          })}
        </div>
        {!modalData.departureFromSP && (
          <input
            type="text"
            value={modalData.city || ""}
            onChange={(e) => setModalData(prev => ({ ...prev, city: e.target.value }))}
            placeholder="Ex: Rio de Janeiro - RJ"
            aria-label="Cidade de onde o colaborador sai"
            disabled={!!requestLockReason}
            autoFocus={cidadeEmFoco}
            className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-card transition-[border-color,box-shadow] focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12 disabled:opacity-60"
          />
        )}
      </div>
      {/* Transferência pedida para esta vaga aberta (14/09): o cartão
          com o pedido aparece aqui, porque a vaga ainda não tem
          colaborador e o cartão de troca só existia no outro ramo. */}
      {!inclusion.collaboratorId && (pendingSwap || latestSwap?.swapKind === "transferencia") && (
        <SwapStatusCard
          pendingSwap={pendingSwap}
          latestSwap={latestSwap}
          currentUserId={user?.id}
          isAdminOrPurchasing={isAdminOrPurchasing}
          getCollaboratorName={getCollaboratorName}
          mutations={mutations}
          blockReason={actionLockReason}
        />
      )}
      {/* Bloqueio de conflito de datas */}
      {modalData.collaboratorId && (() => {
        const conflicts = conflitosUnicos(data, modalData.collaboratorId, inclusion);
        if (!conflicts.length) return null;
        return (
          <div className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5" role="alert" data-testid="aviso-conflito-agenda">
            <AlertCircle className="w-4 h-4 text-danger-strong shrink-0 mt-px" aria-hidden="true" />
            <div className="min-w-0 text-xs text-danger leading-snug space-y-1">
              <p className="font-semibold">Escalação bloqueada — colaborador já escalado:</p>
              {conflicts.map(inc => {
                const startStr = dataDaVaga(inc.scheduleStartDate);
                const endStr = dataDaVaga(inc.scheduleEndDate);
                return (
                  <p key={inc.id}>
                    <span className="font-semibold">{getEventName(inc.eventId)}</span>
                    {startStr && endStr && <span className="text-danger-strong"> · {startStr} a {endStr}</span>}
                  </p>
                );
              })}
              <p className="text-danger/90 mt-0.5">Para trazer esta pessoa, peça a transferência: aprovada por Compras, ela sai da outra vaga e entra nesta.</p>
              {!inclusion.collaboratorId && !pendingSwap && (
                <button
                  type="button"
                  onClick={() => setTransferirColaboradorId(modalData.collaboratorId)}
                  className="esc-alvo mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-card px-2.5 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                  data-testid="button-pedir-transferencia-conflito"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />Pedir transferência
                </button>
              )}
            </div>
          </div>
        );
      })()}
      {/* Duas viagens no mesmo dia (dono, 18/09): aviso, não bloqueio. */}
      {modalData.collaboratorId && (() => {
        const { mesmoDia } = getCollaboratorConflicts(modalData.collaboratorId, inclusion);
        if (!mesmoDia?.length) return null;
        return (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5" data-testid="aviso-mesmo-dia">
            <AlertCircle className="w-4 h-4 text-warning-strong shrink-0 mt-px" aria-hidden="true" />
            <div className="min-w-0 text-xs text-warning leading-snug space-y-1">
              <p className="font-semibold">Atenção: também viaja neste mesmo dia</p>
              {mesmoDia.map(inc => {
                const startStr = dataDaVaga(inc.scheduleStartDate);
                const endStr = dataDaVaga(inc.scheduleEndDate);
                return (
                  <p key={inc.id}>
                    <span className="font-semibold">{getEventName(inc.eventId)}</span>
                    {startStr && endStr && <span className="text-warning"> · {startStr} a {endStr}</span>}
                  </p>
                );
              })}
              <p className="text-warning">Pode escalar normalmente. Confira se os horários das passagens das duas viagens são compatíveis.</p>
            </div>
          </div>
        );
      })()}
      {/* Viagens próximas (09/10 — caso Alonso): a escala não se cruza, a
          viagem sim. A Escalação NÃO bloqueia por viagem: Compras decide a
          rota e pode comprar o trecho direto de um evento para o outro. */}
      {modalData.collaboratorId && (() => {
        const { viagensProximas } = getCollaboratorConflicts(modalData.collaboratorId, inclusion);
        if (!viagensProximas?.length) return null;
        return (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5" data-testid="aviso-viagens-proximas">
            <AlertCircle className="w-4 h-4 text-warning-strong shrink-0 mt-px" aria-hidden="true" />
            <div className="min-w-0 text-xs text-warning leading-snug space-y-1">
              <p className="font-semibold">Viagens próximas — Compras pode comprar trecho direto</p>
              {viagensProximas.map((inc) => (
                <p key={inc.id}>
                  <span className="font-semibold">#{inc.inclusionNumber} · {getEventName(inc.eventId)}</span>
                  <span> · as datas de viagem sugeridas se cruzam com esta vaga</span>
                </p>
              ))}
              <p className="text-warning">Pode escalar. Se a pessoa vai direto de um evento para o outro, indique na logística da vaga — Compras confirma ao registrar a passagem.</p>
            </div>
          </div>
        );
      })()}
      {isEscalationConfirmed(inclusion) && inclusion.collaboratorId && !pendingSwap && (
        <RequestSwapButton onClick={() => setShowSwapModal(true)} blockReason={actionLockReason} />
      )}
    </div>
  );
}
