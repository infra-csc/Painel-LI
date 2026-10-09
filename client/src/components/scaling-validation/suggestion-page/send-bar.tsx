/**
 * Barra de envio (sticky) e prévia das vagas da Sugestão de escala (25/09 —
 * extraídas da página).
 *
 * 07/10 (redesenho): a barra diz UMA coisa à esquerda — o que falta para
 * enviar (clicável, leva à linha) ou "Pronto para enviar" — e as duas ações à
 * direita, sempre na mesma linha a partir de `sm` (com o motivo do bloqueio,
 * os botões quebravam para uma segunda linha e o "Enviar" ia para baixo). As
 * contagens foram para o resumo da grade e o "rascunho salvo" para a barra do
 * topo; o número de vagas continua no próprio botão ("Enviar 32 vagas").
 */
import { AlertTriangle, CheckCircle2, ChevronRight, Eye, EyeOff, Info, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { cn, formatDiarias } from "@/lib/utils";
import { formatDayMonthBr } from "@/lib/dates";
import { TRANSPORT_MODE_LABELS } from "@shared/scaling-validation-rules";
import { textoDaIndicacao } from "@shared/janela-de-viagem";
import { nomeDoEventoNoCache } from "@/lib/nome-do-evento";
import { MAX_VAGAS, plural } from "./suggestion-shared";
import type { SuggestionSend } from "./use-suggestion-send";

export interface SendBarProps {
  send: SuggestionSend;
}

export function SendBar({ send }: SendBarProps) {
  const {
    previewOpen, setPreviewOpen, records, previewGroups, summary, overLimit, nearLimit,
    motivoDoBloqueio, pendencias, focusFirstIssue, sentCheckFailed, sendDisabled, sendLabel, openConfirmSend,
  } = send;
  const temPendencia = pendencias.errors.length > 0 || pendencias.warnings.length > 0;
  const MotivoIcon = motivoDoBloqueio?.tom === "info" ? Info : AlertTriangle;
  return (
    <div className="sug-barra-envio sticky bottom-0 z-20 -mx-[var(--page-gutter)] bg-gradient-to-t from-background via-background to-transparent px-[var(--page-gutter)] pb-3 pt-3">
      {previewOpen && records.length > 0 && (
        <div role="region" aria-labelledby="sug-previa" className="sug-sobe mb-2 overflow-hidden rounded-xl border border-border bg-card shadow-2">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-muted px-4 py-2">
            <h2 id="sug-previa" className="flex items-baseline gap-2 text-[13px] font-semibold text-foreground">
              Prévia das vagas que serão criadas
              <span className="text-xs font-normal tabular-nums text-muted-foreground">{plural(records.length, "vaga", "vagas")} · {plural(previewGroups.length, "linha", "linhas")}</span>
            </h2>
            <button type="button" onClick={() => setPreviewOpen(false)} aria-label="Fechar prévia"
              className="sug-alvo rounded-md p-1 text-muted-foreground transition-colors hover:bg-border hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-[min(300px,40vh)] overflow-y-auto">
            {previewGroups.map((group, gi) => (
              <div key={group.key} className={gi > 0 ? "border-t border-border" : ""}>
                <div className="sticky top-0 z-[1] flex items-center justify-between bg-surface-muted/95 px-4 py-1.5 backdrop-blur">
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" aria-hidden="true" />
                    {group.functionName}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{group.records.length} {group.records.length === 1 ? "vaga" : "vagas"}</span>
                </div>
                {group.records.map((rec, i) => {
                  const ida = rec.transportModeIda ? `Ida ${TRANSPORT_MODE_LABELS[rec.transportModeIda]}${rec.flightDepartureDate ? ` ${formatDayMonthBr(rec.flightDepartureDate)}` : ""}${rec.flightArrivalSuggestedTime ? ` ${rec.flightArrivalSuggestedTime}` : ""}` : "";
                  const volta = rec.transportModeVolta ? `Volta ${TRANSPORT_MODE_LABELS[rec.transportModeVolta]}${rec.flightReturnDate ? ` ${formatDayMonthBr(rec.flightReturnDate)}` : ""}${rec.flightReturnSuggestedTime ? ` ${rec.flightReturnSuggestedTime}` : ""}` : "";
                  // Só ida / só volta / trecho direto (09/10) também na prévia.
                  const logistica = [ida, volta, ...textoDaIndicacao(rec, nomeDoEventoNoCache)].filter(Boolean).join(" · ");
                  return (
                    <div key={`${group.key}-${i}`} className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-1.5 pl-8 pr-4 text-xs sm:grid-cols-[auto_auto_minmax(0,1fr)]", i % 2 === 1 ? "bg-surface-muted/40" : "bg-card")}>
                      <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 font-semibold text-slate-700">{formatDiarias(rec.dailyRates)}</span>
                      <span className="break-words font-mono tabular-nums text-slate-600">{rec.workDays.map((d) => formatDayMonthBr(d)).join(", ")}</span>
                      <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground sm:col-span-1">
                        {logistica && <span className="break-words">{logistica}</span>}
                        {rec.needsAccommodation && <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-slate-600">Hotel</span>}
                        {rec.needsTicket && <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-slate-600">Passagem</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card/95 px-3 py-2.5 shadow-2 backdrop-blur sm:flex-nowrap sm:px-4">
        {/*
          O motivo do bloqueio fica AO LADO do botão, não só dentro do rótulo
          dele: quem via "Revise para enviar" não sabia o que revisar sem
          procurar. Clicar leva à primeira linha com problema.
        */}
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          {motivoDoBloqueio ? (
            <button
              type="button"
              onClick={focusFirstIssue}
              disabled={!temPendencia}
              className={cn(
                "sug-alvo inline-flex h-9 max-w-full items-center gap-2 rounded-lg border px-3 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-default",
                motivoDoBloqueio.tom === "erro"
                  ? "border-danger/25 bg-danger-soft text-danger hover:border-danger/40 focus-visible:ring-danger-strong"
                  : motivoDoBloqueio.tom === "aviso"
                    ? "border-warning/25 bg-warning-soft text-warning hover:border-warning/40 focus-visible:ring-warning-strong"
                    : "border-transparent bg-transparent px-0 text-slate-600 focus-visible:ring-slate-400",
              )}
              data-testid="scaling-suggestion-motivo"
            >
              <MotivoIcon className={cn("h-3.5 w-3.5 shrink-0", motivoDoBloqueio.tom === "info" && "text-muted-foreground")} aria-hidden="true" />
              <span className="truncate">{motivoDoBloqueio.texto}</span>
              {temPendencia && motivoDoBloqueio.tom !== "info" && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />}
            </button>
          ) : (
            <p className="flex min-w-0 items-center gap-2 text-xs text-slate-600" data-testid="sug-pronto">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span className="min-w-0 truncate">
                <span className="font-semibold text-foreground">Pronto para enviar</span>
                <span className="hidden sm:inline"> · {summary.pessoasDia} pessoas-dia em {plural(summary.funcoes, "linha", "linhas")}{nearLimit && !overLimit ? ` · perto do limite de ${MAX_VAGAS}` : ""}</span>
              </span>
            </p>
          )}
        </div>
        {/* No celular os botões vão para a linha de baixo, o Enviar com a largura que sobra. */}
        <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
          <MotivoDesabilitado motivo={previewOpen ? "Fechar prévia das vagas" : "Ver prévia das vagas"} desabilitado={records.length === 0}>
            <Button
              type="button" variant="outline" size="sm" className="sug-alvo h-10 shrink-0 rounded-lg px-3 sm:h-9"
              disabled={records.length === 0}
              aria-expanded={previewOpen} aria-controls="sug-previa"
              aria-label={previewOpen ? "Fechar prévia das vagas" : "Ver prévia das vagas"}
              onClick={() => setPreviewOpen((v) => !v)}
            >
              {previewOpen ? <EyeOff className="h-4 w-4 sm:mr-1.5" aria-hidden="true" /> : <Eye className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />}
              <span className="hidden sm:inline">{previewOpen ? "Fechar prévia" : "Ver prévia"}</span>
            </Button>
          </MotivoDesabilitado>
          <MotivoDesabilitado motivo={sentCheckFailed ? "Bloqueado: não foi possível verificar as vagas já enviadas deste evento." : undefined} desabilitado={sendDisabled} className="flex flex-1 sm:inline-flex sm:flex-none">
            <Button
              type="button" onClick={openConfirmSend}
              disabled={sendDisabled}
              className="sug-enviar h-10 w-full flex-1 rounded-lg bg-primary px-4 font-semibold shadow-1 hover:bg-primary-hover sm:h-9 sm:w-auto sm:flex-none"
              data-testid="sug-enviar"
            >
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
              {sendLabel}
            </Button>
          </MotivoDesabilitado>
        </div>
      </div>
    </div>
  );
}
