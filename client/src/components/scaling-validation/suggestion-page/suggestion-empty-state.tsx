/**
 * Estados vazios da Sugestão de escala (25/09 — extraídos da página):
 * sem evento escolhido e período inválido. Cada um tem uma saída nomeada.
 */
import { CalendarDays, FolderInput, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { cn } from "@/lib/utils";
import { PERIOD_MARGIN_DAYS } from "@/components/scaling-validation/scaling-grid-utils";
import { HINT } from "./suggestion-shared";

export function SemEvento({ parkedEventName, readOnly, busy, functionsError, onPickEvent, onCopyEvent }: {
  /** Grade de OUTRO evento ainda em memória (o usuário limpou o seletor). */
  parkedEventName: string | null;
  readOnly: boolean;
  busy: boolean;
  functionsError: boolean;
  onPickEvent: () => void;
  onCopyEvent: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-card px-6 py-12 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-primary" aria-hidden="true">
        <CalendarDays className="w-5 h-5" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-700">Escolha o evento para abrir a grade</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        A grade cobre o período do evento (ajustável em até {PERIOD_MARGIN_DAYS} dias para cada lado) e o rascunho fica salvo neste navegador por 7 dias, separado por evento.
      </p>
      {/* Limpou o seletor com a grade montada: ela não sumiu — está guardada no rascunho do evento. */}
      {parkedEventName && (
        <p className="mx-auto mt-2 inline-flex max-w-md items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-1 text-xs font-medium text-primary">
          <Save className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Sua grade de {parkedEventName} continua salva — selecione o evento para voltar a ela.
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button type="button" size="sm" className="rounded-lg bg-primary hover:bg-primary-hover" onClick={onPickEvent}>
          Selecionar evento
        </Button>
        <MotivoDesabilitado motivo={readOnly ? "Modo leitura — só Produção e Admin montam a grade" : undefined} desabilitado={busy || functionsError}>
          <Button
          type="button" variant="outline" size="sm" className="rounded-lg"
          disabled={busy || functionsError}
          onClick={onCopyEvent}
        >
          <FolderInput className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Copiar de um evento anterior
        </Button>
        </MotivoDesabilitado>
      </div>
      {readOnly && (
        <p className={cn(HINT, "mt-3")}>Em modo leitura dá para consultar a tela, mas não montar nem enviar a grade.</p>
      )}
    </div>
  );
}

/** O motivo já está no alerta inline acima (periodError); aqui só a saída. */
export function PeriodoInvalido({ canReset, onEventPeriod }: { canReset: boolean; onEventPeriod: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground">A grade só abre com um período válido.</p>
      {canReset && (
        <Button type="button" variant="outline" size="sm" className="mt-3 rounded-lg" onClick={onEventPeriod}>
          <CalendarDays className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Usar o período do evento
        </Button>
      )}
    </div>
  );
}
