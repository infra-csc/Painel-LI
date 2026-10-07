/**
 * Barra da tela do espelho (25/09 — extraída da página; redesenho 07/10).
 *
 * Eram três andares (~125px) — título, evento com local/datas/pessoas e uma
 * fileira de quatro botões — e a grade começava abaixo da dobra em 1366×768.
 * Agora é a MESMA barra de 56px de Passagens, Hospedagem e Escalação: título,
 * o evento (que é o "onde estou" e o próprio seletor), as datas e o local
 * quando há largura, e as ações da tela à direita. "Edição" saiu daqui e foi
 * para a barra da grade, que é a única coisa que ela liga e desliga.
 *
 * Abaixo de 1280px "Refazer sugestões" e "Importar" eram escondidos — quem
 * estava num tablet simplesmente não os alcançava. Agora entram num menu "Mais".
 */
import { useState } from "react";
import { RefreshCw, Download, Upload, Loader2, Lock, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  recalcPending: boolean;
  onRecalc: () => void;
  onExport: () => void;
  onImportado: (gravados: number, falhas: number) => void;
}

/** O botão de ação da barra — o mesmo "Exportar" da Escalação. */
export const BOTAO_DA_BARRA =
  "esp-alvo inline-flex shrink-0 items-center gap-1.5 h-[34px] px-3 rounded-lg border border-border bg-card text-sm font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

/** "09/10 – 11/10/2026": o ano aparece uma vez quando as duas datas o dividem. */
function periodoCurto(ini: string | null | undefined, fim: string | null | undefined): string {
  const a = fmtDate(ini);
  if (!fim) return a;
  const b = fmtDate(fim);
  if (a.length === 10 && b.length === 10 && a.slice(6) === b.slice(6)) return `${a.slice(0, 5)} – ${b}`;
  return `${a} – ${b}`;
}

export function MirrorHeader({
  events, eventId, setEventId, ev, totalPessoas, canEditMirror,
  recalcPending, onRecalc, onExport, onImportado,
}: MirrorHeaderProps) {
  const [importando, setImportando] = useState(false);
  const recalcular = (
    <>
      {recalcPending
        ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        : <RefreshCw className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      {recalcPending ? "Recalculando…" : "Refazer sugestões"}
    </>
  );
  return (
    <PageHeader
      variant="bar"
      title="Espelho operacional"
      // No celular a barra tem três andares: grudada, comia um quarto da tela.
      className="mx-0 mt-0 gap-x-3 max-sm:static"
      context={<>
        <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-border sm:block" />
        <SeletorDeEvento
          eventos={(events ?? []).map((e) => ({ id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate }))}
          valor={eventId}
          aoEscolher={setEventId}
          formatarPeriodo={(e) => (e.startDate ? periodoCurto(e.startDate, e.endDate) : "sem datas")}
          // Datas, pessoas e local na 2ª linha do próprio seletor: cabem em
          // 1366 sem empurrar as ações para uma segunda fileira.
          detalhe={ev ? [periodoCurto(ev.startDate, ev.endDate), `${totalPessoas} ${totalPessoas === 1 ? "pessoa" : "pessoas"}`, ev.location].filter(Boolean).join(" · ") : undefined}
        />
        {ev && !canEditMirror && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface-muted px-2 text-2xs font-medium text-muted-foreground"
                data-testid="mirror-readonly-notice">
                <Lock className="h-3 w-3" aria-hidden="true" /> Somente leitura
              </span>
            </TooltipTrigger>
            <TooltipContent>Somente Admin, Compras e Produção editam o espelho.</TooltipContent>
          </Tooltip>
        )}
      </>}
      actions={<>
        {canEditMirror && eventId && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className={`${BOTAO_DA_BARRA} hidden xl:inline-flex`} onClick={onRecalc} disabled={recalcPending} data-testid="button-recalc">
                  {recalcular}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px]">Recalcula quartos e carros a partir dos voos. Grupos confirmados são preservados.</TooltipContent>
            </Tooltip>
            {/* O par de "Exportar": a equipe preenche a planilha em lote e
                precisava digitar tudo de volta célula a célula. */}
            <ImportarPlanilha eventId={eventId} aoAplicar={onImportado} aberto={importando} aoMudarAberto={setImportando}
              classeDoBotao={`${BOTAO_DA_BARRA} hidden xl:inline-flex`} />
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={`${BOTAO_DA_BARRA} px-2 xl:hidden`} aria-label="Mais ações" data-testid="button-mais-acoes">
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Refazer sugestões · Importar planilha</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onSelect={onRecalc} disabled={recalcPending} className="gap-2.5 py-2">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{recalcPending ? "Recalculando…" : "Refazer sugestões"}</span>
                    <span className="text-2xs text-muted-foreground">Quartos e carros, a partir dos voos</span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setImportando(true)} className="gap-2.5 py-2">
                  <Upload className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">Importar planilha</span>
                    <span className="text-2xs text-muted-foreground">A que sai em Exportar, preenchida</span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className={BOTAO_DA_BARRA} onClick={onExport} disabled={!eventId} data-testid="button-export" aria-label="Exportar planilha">
              <Download className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Baixa a grade inteira em Excel</TooltipContent>
        </Tooltip>
      </>}
    />
  );
}
