/**
 * Grade de diárias em lote (25/09 — extraída da tabela). Radix Dialog: Esc,
 * foco preso, aria; linhas com dias alterados ficam destacadas.
 *
 * 07/10 (redesenho, régua dos diálogos da tela): cabeçalho com quantas vagas
 * o lote atinge e quantas já mudaram; cada vaga é uma linha com nº, pessoa,
 * função, a contagem de dias e Todos/Nenhum como botões (eram links
 * sublinhados); a vaga alterada ganha o filete da marca e "alterada" escrito —
 * antes só a cor de fundo dizia isso ("linhas em azul…" no rodapé). O rodapé
 * diz o que vai acontecer ("3 vagas serão salvas; o status não muda").
 */
import { LayoutGrid, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { fixEncoding } from "@/lib/utils";
import { toTitleCase } from "@/lib/format";
import { DayButtons } from "./day-buttons";
import { generateDaysInRange, normDay } from "./inclusion-shared";
import { CabecalhoDoDialogo, RodapeDoDialogo, moldura } from "./inclusion-ui";
import type { BulkDays } from "./use-bulk-days";
import type { TeamInclusionData } from "./use-team-inclusion-data";

export function BulkDaysDialog({ bulk, getCollaboratorName, getFunctionName }: {
  bulk: BulkDays;
  getCollaboratorName: TeamInclusionData["getCollaboratorName"];
  getFunctionName: TeamInclusionData["getFunctionName"];
}) {
  const { showBatchDiarias, fechar, targets, batchDiariasSelections, changedIds, toggleBatchDay, setDays, handleSaveBatchDiarias, isPending, descarteLote } = bulk;

  // O mesmo conjunto que o salvar usa para decidir o que vai no PATCH.
  const linhas = targets.map((inc) => {
    const selectedDays = batchDiariasSelections[inc.id] ?? [];
    const allDays = generateDaysInRange(normDay(inc.scheduleStartDate), normDay(inc.scheduleEndDate));
    const changed = changedIds.has(inc.id);
    return { inc, selectedDays, allDays, changed };
  });
  const alteradas = linhas.filter(l => l.changed).length;
  const pedirParaFechar = () => descarteLote.pedirParaFechar(fechar);

  return (
    <>
      <Dialog open={showBatchDiarias} onOpenChange={(v) => { if (!v) pedirParaFechar(); }}>
      {showBatchDiarias && (
        <DialogContent className={moldura("sm:max-w-5xl")} data-testid="modal-diarias-lote">
          <CabecalhoDoDialogo
            icone={LayoutGrid}
            titulo="Edição de diárias em lote"
            descricao={`${targets.length} ${targets.length === 1 ? "vaga" : "vagas"} — marque os dias de cada uma; a quantidade de diárias é calculada pelos dias marcados.`}
            onFechar={pedirParaFechar}
          />

          {/* Rows */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border bg-card">
            {targets.length === 0 && (
              <p className="m-0 px-6 py-10 text-center text-sm text-muted-foreground">
                Nenhuma vaga editável na lista — as de evento encerrado ficam de fora.
              </p>
            )}
            {linhas.map(({ inc, selectedDays, allDays, changed }) => (
              <div
                key={inc.id}
                className={`inc-lote-linha px-5 sm:px-6 py-3.5 ${changed ? 'inc-lote-alterada' : ''}`}
                data-testid={`lote-linha-${inc.id}`}
              >
                {/* Info row */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2.5">
                  <span className="inline-flex items-center h-[22px] px-1.5 rounded-md bg-brand-soft font-mono text-2xs font-semibold text-primary tabular-nums shrink-0">#{inc.inclusionNumber ?? '—'}</span>
                  <span className="text-sm font-semibold text-foreground min-w-0 truncate max-w-[260px]">
                    {inc.collaboratorId
                      ? toTitleCase(fixEncoding(getCollaboratorName(inc.collaboratorId)))
                      : <span className="text-muted-foreground font-normal">Não escalado</span>}
                  </span>
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">{getFunctionName(inc.functionId)}</span>
                  <div className="flex items-center gap-1 ml-auto shrink-0">
                    {changed && <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-primary mr-1">alterada</span>}
                    <span className={`inline-flex items-center h-[22px] px-2 rounded-full text-2xs font-semibold tabular-nums ${changed ? 'bg-primary text-primary-foreground' : 'bg-muted text-slate-600'}`}>
                      {selectedDays.length} {selectedDays.length === 1 ? 'dia' : 'dias'}
                    </span>
                    {allDays.length > 0 && (
                      <>
                        <button type="button" onClick={() => setDays(inc.id, allDays)} className="h-7 px-2 rounded-md text-xs font-medium text-primary hover:bg-brand-soft">Todos</button>
                        <button type="button" onClick={() => setDays(inc.id, [])} className="h-7 px-2 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Nenhum</button>
                      </>
                    )}
                  </div>
                </div>

                {/* Day picker */}
                {allDays.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Dias da inclusão #${inc.inclusionNumber ?? ''}`}>
                    <DayButtons allDays={allDays} isSelected={(d) => selectedDays.includes(d)} onToggle={(d) => toggleBatchDay(inc.id, d)} />
                  </div>
                ) : (
                  <p className="m-0 text-xs text-muted-foreground italic">Sem período definido nesta inclusão</p>
                )}
              </div>
            ))}
          </div>

          <RodapeDoDialogo
            info={alteradas > 0
              ? <><span className="font-semibold text-primary tabular-nums">{alteradas} {alteradas === 1 ? "vaga alterada" : "vagas alteradas"}</span> · o status das escalações não muda.</>
              : "Nenhum dia alterado ainda. O status das escalações não muda."}
          >
            <Button type="button" variant="outline" onClick={pedirParaFechar} className="h-9 rounded-lg px-4 text-sm font-medium">
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveBatchDiarias} disabled={isPending} aria-busy={isPending} className="h-9 rounded-lg px-4 text-sm font-semibold gap-2 hover:bg-primary-hover" data-testid="button-save-batch-diarias">
              {isPending
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <Save className="w-4 h-4" aria-hidden="true" />}
              {isPending ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </RodapeDoDialogo>
        </DialogContent>
      )}
      </Dialog>
      {descarteLote.Dialogo}
    </>
  );
}
