/**
 * Resumo · Col 2 (ramo EDITÁVEL) — escolher quem preenche a vaga (25/09 —
 * extraído do dialog): empreita × colaborador, lista de nomes, tipo de
 * atendimento, tipo do percurseiro (desligado), cidade de saída, transferência
 * e os avisos de conflito de agenda.
 */
import { AlertCircle, Bike, MapPin, Users } from "lucide-react";
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
import { SHOW_PERCURSEIRO_TIPO_NA_ESCALACAO, brl, conflitosUnicos, type InclusionDetailsDialogProps } from "./details-shared";
import type { InclusionDialogState } from "./use-inclusion-dialog-state";

export function ColaboradorPicker({ inclusion, props, st }: { inclusion: TeamInclusion; props: InclusionDetailsDialogProps; st: InclusionDialogState }) {
  const { modalData, setModalData, data, details, mutations, user } = props;
  const { collaborators, getEventName, getCollaboratorName, getCollaboratorCity, isAdminOrPurchasing, getCollaboratorConflicts } = data;
  const { pendingSwap, latestSwap } = details;
  const { requestLockReason, actionLockReason, isCenoEmpreitaInclusion, isPercursoInclusion, systemSettings, escolhendoColaborador, setEscolhendoColaborador, setTransferirColaboradorId, setShowSwapModal } = st;
  const cityLabel = modalData.collaboratorId ? (modalData.city || getCollaboratorCity(modalData.collaboratorId)) : "";
  return (
    <div className="space-y-2">
      {/* Empreita por empresa (dono, 10/09): só cenotécnica. Em vez de
          um nome, a empresa que manda as pessoas. */}
      {isCenoEmpreitaInclusion && (
        <div role="radiogroup" aria-label="Quem preenche a vaga" className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5" data-testid="toggle-empreita">
          {([["colaborador", "Colaborador"], ["empreita", "Empreita (empresa)"]] as const).map(([k, label]) => {
            const on = (k === "empreita") === !!modalData.empreitaModo;
            return (
              <button
                key={k} type="button" role="radio" aria-checked={on} disabled={!!requestLockReason}
                onClick={() => setModalData(prev => ({ ...prev, empreitaModo: k === "empreita" }))}
                data-testid={`toggle-empreita-${k}`}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "bg-card text-primary shadow-1" : "text-slate-600 hover:bg-card/60"}`}
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
      <div className={!modalData.collaboratorId && !isEscalated(inclusion) ? "rounded-lg ring-1 ring-warning/25" : ""}>
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
            onPedirTransferencia={!inclusion.collaboratorId && !pendingSwap ? (id) => setTransferirColaboradorId(id) : undefined}
            disabled={!!requestLockReason}
            disabledReason={requestLockReason}
          />
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-700" data-testid="text-collaborator-escolhido">
                {modalData.collaboratorId ? getCollaboratorName(modalData.collaboratorId) : "Nenhum colaborador escolhido"}
              </span>
              {modalData.collaboratorId && cityLabel && (
                <span className="block truncate text-2xs text-muted-foreground">{cityLabel}</span>
              )}
            </span>
            <MotivoDesabilitado motivo={requestLockReason ?? "Escolher outro colaborador para esta vaga"} desabilitado={!!requestLockReason}>
              <button
              type="button"
              onClick={() => setEscolhendoColaborador(true)}
              disabled={!!requestLockReason}
              data-testid="select-collaborator-escalation"
              className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-primary hover:border-primary hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {modalData.collaboratorId ? "Trocar" : "Escolher"}
            </button>
            </MotivoDesabilitado>
          </div>
        )}
      </div>
      )}
      {!modalData.empreitaModo && !modalData.collaboratorId && !isEscalated(inclusion) && (
        <p className="text-2xs text-warning flex items-center gap-1" data-testid="hint-collaborator-required">
          <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />Obrigatório para confirmar a escalação.
        </p>
      )}
      {/* Tipo de atendimento — obrigatório quando a função é de atendimento */}
      {data.isAtendimentoInclusion(inclusion) && (() => {
        const missing = isAtendimentoMissing(inclusion, modalData, data);
        return (
          <div className="space-y-1.5">
            <label htmlFor="select-atendimento-tipo" className="text-2xs font-semibold text-slate-600 flex items-center gap-1">
              <Users className="w-3 h-3" aria-hidden="true" />
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
              className={`w-full px-3 py-2 text-sm border rounded-xl bg-card focus:outline-none focus:ring-2 focus:border-transparent ${missing ? "border-danger/25 focus:ring-danger/25" : "border-border focus:ring-ring"}`}
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
      {/* Cidade de saída */}
      <div className="space-y-1.5">
        <label className="text-2xs font-semibold text-slate-600 flex items-center gap-1">
          <MapPin className="w-3 h-3" aria-hidden="true" />
          Sai de
        </label>
        <div className="flex gap-1.5">
          <MotivoDesabilitado motivo={requestLockReason ?? undefined} desabilitado={!!requestLockReason}>
            <button
            type="button"
            onClick={() => setModalData(prev => ({ ...prev, departureFromSP: true, city: "São Paulo - SP" }))}
            disabled={!!requestLockReason}
            className={`flex-1 px-2 py-1.5 rounded-lg text-2xs font-semibold border transition-all ${modalData.departureFromSP ? "bg-primary text-primary-foreground border-primary" : "bg-card text-slate-600 border-border hover:border-slate-300"}`}
          >
            São Paulo - SP
          </button>
          </MotivoDesabilitado>
          <MotivoDesabilitado motivo={requestLockReason ?? undefined} desabilitado={!!requestLockReason}>
            <button
            type="button"
            onClick={() => setModalData(prev => ({ ...prev, departureFromSP: false, city: "" }))}
            disabled={!!requestLockReason}
            className={`flex-1 px-2 py-1.5 rounded-lg text-2xs font-semibold border transition-all ${!modalData.departureFromSP ? "bg-slate-700 text-white border-slate-700" : "bg-card text-slate-600 border-border hover:border-slate-300"}`}
          >
            Outra cidade
          </button>
          </MotivoDesabilitado>
        </div>
        {!modalData.departureFromSP && (
          <input
            type="text"
            value={modalData.city || ""}
            onChange={(e) => setModalData(prev => ({ ...prev, city: e.target.value }))}
            placeholder="Ex: Rio de Janeiro - RJ"
            disabled={!!requestLockReason}
            autoFocus
            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
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
          <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 text-danger-strong shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-2xs text-danger leading-snug space-y-1">
              <p className="font-bold">Escalação bloqueada — colaborador já escalado:</p>
              {conflicts.map(inc => {
                const startStr = inc.scheduleStartDate ? new Date(inc.scheduleStartDate).toLocaleDateString("pt-BR") : "";
                const endStr = inc.scheduleEndDate ? new Date(inc.scheduleEndDate).toLocaleDateString("pt-BR") : "";
                return (
                  <p key={inc.id}>
                    <span className="font-semibold">{getEventName(inc.eventId)}</span>
                    {startStr && endStr && <span className="text-danger-strong"> · {startStr} a {endStr}</span>}
                  </p>
                );
              })}
              <p className="text-danger-strong mt-0.5">Para trazer esta pessoa, peça a transferência: aprovada por Compras, ela sai da outra vaga e entra nesta.</p>
              {!inclusion.collaboratorId && !pendingSwap && (
                <button
                  type="button"
                  onClick={() => setTransferirColaboradorId(modalData.collaboratorId)}
                  className="mt-1 inline-flex items-center rounded-md border border-danger/25 bg-card px-2 py-1 text-2xs font-semibold text-danger hover:bg-danger-soft"
                  data-testid="button-pedir-transferencia-conflito"
                >
                  Pedir transferência
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
          <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2.5" data-testid="aviso-mesmo-dia">
            <AlertCircle className="w-3.5 h-3.5 text-warning-strong shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-2xs text-warning leading-snug space-y-1">
              <p className="font-bold">Atenção: também viaja neste mesmo dia</p>
              {mesmoDia.map(inc => {
                const startStr = inc.scheduleStartDate ? new Date(inc.scheduleStartDate).toLocaleDateString("pt-BR") : "";
                const endStr = inc.scheduleEndDate ? new Date(inc.scheduleEndDate).toLocaleDateString("pt-BR") : "";
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
      {isEscalationConfirmed(inclusion) && inclusion.collaboratorId && !pendingSwap && (
        <RequestSwapButton onClick={() => setShowSwapModal(true)} blockReason={actionLockReason} />
      )}
    </div>
  );
}
