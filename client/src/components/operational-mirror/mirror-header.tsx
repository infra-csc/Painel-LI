/**
 * Barra de contexto do espelho (25/09 — extraída da página).
 *
 * Eram três andares (~180px) antes do primeiro dado: o <h1> repetia o
 * breadcrumb, a tagline explicava o que a grade mostra e o nome do evento
 * aparecia duas vezes. Virou UMA faixa, que acompanha a rolagem — quem está
 * no fim de 39 colunas continua vendo de que evento aquilo é e continua
 * alcançando as ações. É o mesmo PageHeader `bar` de Passagens e Bagagem.
 */
import { RefreshCw, FileSpreadsheet, Loader2, MapPin, CalendarDays, Users, Lock, Pencil } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Event } from "@shared/schema";
import type { MirrorResponse } from "@shared/operational-mirror-types";
import { SeletorDeEvento } from "./context-bar";
import { ImportarPlanilha } from "./import";
import { fmtDate } from "./mirror-shared";

export interface MirrorHeaderProps {
  events: Event[] | undefined;
  eventId: string;
  setEventId: (id: string) => void;
  ev: MirrorResponse["event"] | undefined;
  totalPessoas: number;
  canEditMirror: boolean;
  editModeWanted: boolean;
  setEditModeWanted: (v: boolean) => void;
  recalcPending: boolean;
  onRecalc: () => void;
  onExport: () => void;
  onImportado: (gravados: number, falhas: number) => void;
}

export function MirrorHeader({
  events, eventId, setEventId, ev, totalPessoas, canEditMirror, editModeWanted, setEditModeWanted,
  recalcPending, onRecalc, onExport, onImportado,
}: MirrorHeaderProps) {
  return (
    <PageHeader
      variant="bar"
      title="Espelho operacional"
      className="text-sm bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      context={<>
        <SeletorDeEvento
          eventos={(events ?? []).map((e) => ({ id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate }))}
          valor={eventId}
          aoEscolher={setEventId}
          formatarPeriodo={(e) => (e.startDate ? `${fmtDate(e.startDate)}${e.endDate ? ` – ${fmtDate(e.endDate)}` : ""}` : "sem datas")}
        />
        {ev && <span className="hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden="true" />}
        {ev && (
          <>
          {ev.location && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{ev.location}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {fmtDate(ev.startDate)}{ev.endDate ? ` – ${fmtDate(ev.endDate)}` : ""}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {totalPessoas} {totalPessoas === 1 ? "pessoa" : "pessoas"}
          </span>
          {!canEditMirror && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="mirror-readonly-notice"
              title="Somente Admin, Compras e Produção editam o espelho.">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Somente leitura
            </span>
          )}
          </>
        )}
      </>}
      actions={<>
          {canEditMirror && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-flex items-center gap-2 h-[34px] px-3 rounded-lg border bg-card">
                    <Switch id="mirror-edit-mode" checked={editModeWanted} onCheckedChange={setEditModeWanted} data-testid="button-edit-mode" />
                    <Label htmlFor="mirror-edit-mode" className="text-sm cursor-pointer flex items-center gap-1.5">
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edição
                    </Label>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Liga a edição direto nas células da grade</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Abaixo de 1280px as duas ações secundárias saem do
                      cabeçalho: com elas, o nome do evento — que é o
                      "onde estou" — era o primeiro a ser espremido. */}
                  <Button variant="outline" size="sm" className="hidden xl:inline-flex h-[34px]" onClick={onRecalc} disabled={recalcPending} data-testid="button-recalc">
                    {recalcPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />}
                    {recalcPending ? "Recalculando…" : "Refazer sugestões"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refaz as sugestões de quarto e Uber (grupos confirmados são preservados)</TooltipContent>
              </Tooltip>
            </>
          )}
          {/* O par de "Exportar": a equipe preenche a planilha em lote e
              precisava digitar tudo de volta célula a célula. */}
          {canEditMirror && eventId && (
            <span className="hidden xl:inline-flex">
            <ImportarPlanilha eventId={eventId} aoAplicar={onImportado} />
            </span>
          )}
          <Button size="sm" className="h-[34px]" onClick={onExport} data-testid="button-export" title="Exportar planilha">
            <FileSpreadsheet className="h-4 w-4 sm:mr-2" aria-hidden="true" />
            <span className="hidden sm:inline">Exportar</span>
            <span className="hidden xl:inline">&nbsp;planilha</span>
          </Button>
      </>}
    />
  );
}
