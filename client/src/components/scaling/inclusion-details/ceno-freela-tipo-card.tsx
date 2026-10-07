/**
 * Modalidade de EMPREITA do cenotécnico (Freela Viagem / SP / Local A / Local B).
 * Regra do usuário (19/08): TODA vaga de cenotécnica ganha este flag na
 * Escalação e o valor é FECHADO pelo nº de dias (não é diária × dias). Grava na
 * hora, pela rota dedicada — e NÃO bloqueia escalar/confirmar sem o tipo.
 * (25/09 — extraído de inclusion-details-dialog.tsx)
 */
import { AlertCircle, Hammer } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { CENO_FREELA_TIPOS, CENO_FREELA_TIPO_LABELS, cenoEmpreitaTotalCents, type CenoFreelaTipo } from "@shared/cenotecnica-empreita";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import type { ScalingMutations } from "../use-scaling-mutations";
import { Secao, brl, cenoDiasTrabalhados } from "./details-shared";

export function CenoFreelaTipoCard({ inclusion, systemSettings, canEdit, isCasa, mutation, disabledReason }: {
  inclusion: TeamInclusion;
  systemSettings: Record<string, number> | undefined;
  canEdit: boolean;
  isCasa: boolean;
  mutation: ScalingMutations["setCenoFreelaTipo"];
  /** Motivo do bloqueio (evento encerrado) — vira o tooltip dos botões. */
  disabledReason?: string | null;
}) {
  const atual = (inclusion.cenoFreelaTipo ?? null) as CenoFreelaTipo | null;
  const dias = cenoDiasTrabalhados(inclusion);
  const saving = mutation.isPending;
  const algumExtrapolado = CENO_FREELA_TIPOS.some(t => cenoEmpreitaTotalCents(t, dias, systemSettings)?.extrapolado);
  return (
    <Secao
      titulo="Tipo de freela (cenotécnica)"
      icone={<Hammer className={atual ? "text-muted-foreground" : "text-warning-strong"} aria-hidden="true" />}
      tom={atual ? "neutro" : "atencao"}
      acessorio={!atual && (
        <span className="px-2 py-0.5 rounded-full bg-warning-soft text-warning text-2xs font-semibold ring-1 ring-warning/30" data-testid="badge-ceno-freela-definir">
          definir o tipo
        </span>
      )}
      testId="card-ceno-freela-tipo"
      corpo="p-4 space-y-2.5"
    >
          <div
            role="radiogroup"
            aria-label="Tipo de freela do cenotécnico"
            data-testid="select-ceno-freela-tipo"
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          >
            {CENO_FREELA_TIPOS.map((t) => {
              const ativo = atual === t;
              const valor = cenoEmpreitaTotalCents(t, dias, systemSettings);
              return (
                <MotivoDesabilitado key={t} motivo={canEdit ? undefined : (disabledReason || "Apenas o responsável pela função pode definir o tipo de freela.")} desabilitado={!canEdit || saving}>
                  <button
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  disabled={!canEdit || saving}
                  data-testid={`btn-ceno-freela-${t}`}
                  onClick={() => { if (!ativo) mutation.mutate({ id: inclusion.id, cenoFreelaTipo: t }); }}
                  className={`w-full px-2 py-2 rounded-lg text-xs font-semibold border text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed ${ativo ? "bg-primary text-primary-foreground border-primary shadow-1" : "bg-card text-slate-700 border-border hover:border-primary/40 hover:bg-brand-soft"}`}
                >
                  {CENO_FREELA_TIPO_LABELS[t]}
                  <span className={`block text-2xs font-bold tabular-nums mt-0.5 ${ativo ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {valor ? brl(valor.totalCents) : "—"}
                  </span>
                  {valor?.extrapolado && (
                    <span className={`block text-2xs font-medium ${ativo ? "text-primary-foreground/80" : "text-warning"}`}>extrapolado</span>
                  )}
                </button>
                </MotivoDesabilitado>
              );
            })}
          </div>
          <p className="text-2xs text-muted-foreground leading-snug">
            {dias > 0
              ? <>Valor <b>fechado</b> por {dias} {dias === 1 ? "dia" : "dias"} de trabalho — não é diária × dias e não sofre deflação por período.</>
              : <>Sem dias de trabalho na vaga: defina o período ou as diárias para ver o valor fechado.</>}
            {algumExtrapolado && dias > 0 && (
              <> A tabela cobre de 2 a 6 dias; fora disso o valor é <b>extrapolado</b> pelo incremento da modalidade — confira com o Financeiro.</>
            )}
          </p>
          {isCasa && (
            <p className="text-2xs text-muted-foreground leading-snug flex items-start gap-1.5" data-testid="hint-ceno-casa">
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
              Cenotécnico de casa (CLT) não usa a tabela de empreita — o tipo fica gravado, mas o Planejado não aplica o valor fechado.
            </p>
          )}
    </Secao>
  );
}
