/**
 * Barra de envio (sticky) e prévia das vagas da Sugestão de escala (25/09 —
 * extraídas da página).
 */
import { AlertTriangle, Eye, Save, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { cn, formatDiarias } from "@/lib/utils";
import { formatDayMonthBr } from "@/lib/dates";
import { TRANSPORT_MODE_LABELS } from "@shared/scaling-validation-rules";
import { HINT, MAX_VAGAS, SECTION_TITLE, plural } from "./suggestion-shared";
import type { SuggestionSend } from "./use-suggestion-send";

export interface SendBarProps {
  send: SuggestionSend;
  draftSavedAt: string | null;
}

export function SendBar({ send, draftSavedAt }: SendBarProps) {
  const {
    previewOpen, setPreviewOpen, records, previewGroups, summary, vagasLabel, overLimit, nearLimit,
    motivoDoBloqueio, pendencias, focusFirstIssue, sentCheckFailed, sendDisabled, sendLabel, openConfirmSend,
  } = send;
  return (
    <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-3 pt-2 bg-gradient-to-t from-background via-background to-transparent">
      {previewOpen && records.length > 0 && (
        <div role="region" aria-labelledby="sug-previa" className="mb-2 overflow-hidden rounded-xl border border-border bg-card shadow-2">
          <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-2">
            <h2 id="sug-previa" className={SECTION_TITLE}>Prévia das vagas que serão criadas</h2>
            <button type="button" onClick={() => setPreviewOpen(false)} aria-label="Fechar prévia"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-border hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {previewGroups.map((group, gi) => (
              <div key={group.key} className={gi > 0 ? "border-t border-border" : ""}>
                <div className="flex items-center justify-between px-4 py-1.5 bg-surface-muted/70">
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" aria-hidden="true" />
                    {group.functionName}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{group.records.length} {group.records.length === 1 ? "vaga" : "vagas"}</span>
                </div>
                {group.records.map((rec, i) => {
                  const ida = rec.transportModeIda ? `Ida ${TRANSPORT_MODE_LABELS[rec.transportModeIda]}${rec.flightDepartureDate ? ` ${formatDayMonthBr(rec.flightDepartureDate)}` : ""}${rec.flightArrivalSuggestedTime ? ` ${rec.flightArrivalSuggestedTime}` : ""}` : "";
                  const volta = rec.transportModeVolta ? `Volta ${TRANSPORT_MODE_LABELS[rec.transportModeVolta]}${rec.flightReturnDate ? ` ${formatDayMonthBr(rec.flightReturnDate)}` : ""}${rec.flightReturnSuggestedTime ? ` ${rec.flightReturnSuggestedTime}` : ""}` : "";
                  const logistica = [ida, volta].filter(Boolean).join(" · ");
                  return (
                    <div key={`${group.key}-${i}`} className={cn("grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 pl-8 pr-4 py-1.5 text-xs", i % 2 === 1 ? "bg-surface-muted/40" : "bg-card")}>
                      <span className="text-slate-700 font-semibold bg-muted rounded-full px-2 py-0.5 whitespace-nowrap">{formatDiarias(rec.dailyRates)}</span>
                      <span className="text-slate-600 font-mono tabular-nums break-words">{rec.workDays.map((d) => formatDayMonthBr(d)).join(", ")}</span>
                      <span className="col-span-2 sm:col-span-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground min-w-0">
                        {logistica && <span className="break-words">{logistica}</span>}
                        {rec.needsAccommodation && <span className="text-xs font-semibold uppercase text-slate-600 bg-muted rounded px-1.5 py-0.5">Hotel</span>}
                        {rec.needsTicket && <span className="text-xs font-semibold uppercase text-slate-600 bg-muted rounded px-1.5 py-0.5">Passagem</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Abaixo de `sm` a barra compacta: some a 2ª linha, a prévia vira
          só ícone, o motivo do bloqueio ganha linha própria e o Enviar
          ocupa a largura toda — antes os três botões quebravam em
          escadinha e o Enviar ia parar fora da tela. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-border bg-card/95 backdrop-blur px-4 py-3 shadow-2">
        <div className="min-w-0">
          <p className="text-sm text-slate-700">
            {/* Vermelho a partir de VAGAS_WARN: aviso de que o teto de envio está perto. */}
            <span className={cn("font-semibold tabular-nums", overLimit ? "text-danger" : nearLimit ? "text-danger" : "text-foreground")}>{vagasLabel}</span>
            {nearLimit && !overLimit && <span className="text-danger"> (limite {MAX_VAGAS})</span>}
            {records.length > 0 && <span className="text-muted-foreground"> · {summary.pessoasDia} pessoas-dia em {plural(summary.funcoes, "linha", "linhas")}</span>}
          </p>
          <p className={cn(HINT, "hidden sm:flex items-center gap-1.5 mt-0.5")}>
            {draftSavedAt
              ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success-strong" aria-hidden="true" />
              : <Save className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            <span>
              {draftSavedAt ? <>Rascunho salvo <span className="tabular-nums">{draftSavedAt}</span> · </> : "Rascunho salvo "}
              neste navegador, por evento — 7 dias.
            </span>
          </p>
        </div>
        {/*
          O motivo do bloqueio fica AO LADO do botão, não só dentro
          do rótulo dele: quem via "Revise para enviar" não sabia o
          que revisar sem procurar. Clicar leva à primeira linha.
        */}
        {motivoDoBloqueio && (
          <button
            type="button"
            onClick={focusFirstIssue}
            disabled={!pendencias.errors.length && !pendencias.warnings.length}
            className={cn(
              "order-2 inline-flex h-9 w-full items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-default sm:order-none sm:w-auto sm:max-w-[280px]",
              motivoDoBloqueio.tom === "erro"
                ? "border-danger/25 bg-danger-soft text-danger hover:bg-danger-soft focus-visible:ring-danger-strong"
                : motivoDoBloqueio.tom === "aviso"
                  ? "border-warning/25 bg-warning-soft text-warning hover:bg-warning-soft focus-visible:ring-warning-strong"
                  : "border-border bg-surface-muted text-slate-600 focus-visible:ring-slate-400",
            )}
            data-testid="scaling-suggestion-motivo"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{motivoDoBloqueio.texto}</span>
          </button>
        )}
        {/* No celular: motivo (order-2) acima, botões (order-3) por último, largura toda. */}
        <div className="order-3 flex w-full items-center gap-2 sm:order-none sm:w-auto">
          <MotivoDesabilitado motivo={previewOpen ? "Fechar prévia das vagas" : "Ver prévia das vagas"} desabilitado={records.length === 0}>
            <Button
            type="button" variant="outline" size="sm" className="rounded-lg h-9 shrink-0 px-2.5 sm:px-3"
            disabled={records.length === 0}
            aria-expanded={previewOpen} aria-controls="sug-previa"
            aria-label={previewOpen ? "Fechar prévia das vagas" : "Ver prévia das vagas"}
            onClick={() => setPreviewOpen((v) => !v)}
          >
            <Eye className="w-3.5 h-3.5 sm:mr-1.5" aria-hidden="true" />
            <span className="hidden sm:inline">{previewOpen ? "Fechar prévia" : "Ver prévia das vagas"}</span>
          </Button>
          </MotivoDesabilitado>
          <MotivoDesabilitado motivo={sentCheckFailed ? "Bloqueado: não foi possível verificar as vagas já enviadas deste evento." : undefined} desabilitado={sendDisabled}>
            <Button
            type="button" onClick={openConfirmSend}
            disabled={sendDisabled}
            className="rounded-xl bg-primary hover:bg-primary-hover w-full sm:w-auto"
          >
            <Send className="w-4 h-4 mr-2" aria-hidden="true" />
            {sendLabel}
          </Button>
          </MotivoDesabilitado>
        </div>
      </div>
    </div>
  );
}
