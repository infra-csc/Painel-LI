/**
 * Modal "Detalhes da prestação na vaga dividida" — 25/09 (modularização);
 * redesenho 08/10.
 *
 * Antes: cabeçalho cheio na cor da marca com avatar colorido, os dois
 * períodos em caixas translúcidas, três seções com cabeçalho tingido e "└"
 * desenhado, o total numa caixa de borda dupla e um "Fechar" azul-escuro.
 *
 * Agora é o extrato do Comparativo dentro de um modal: quem é (nome, Titular
 * ou Divisão, função), os dois períodos lado a lado (vaga original × dias
 * atribuídos), as linhas Planejado (proporcional) · Realizado · Diferença por
 * categoria, o total e quanto da vaga esta pessoa cobriu. Os mesmos números
 * de antes (diárias, refeições, ida/volta, translado, total, cobertura).
 */
import { Calendar, GitFork } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Chip } from "./budget-card";
import { CabecalhoDoExtrato, LinhaDoExtrato } from "./comparison-blocks";
import { dailySubtotalOf, fmt, fmtDate, fmtDateShort, isWknd, type SplitDetailState } from "./comparison-utils";
import { idaEVoltaDaMobilidade } from "@shared/comparativo";

export interface SplitDetailDialogProps {
  splitDetail: SplitDetailState | null;
  onClose: () => void;
  getCollaboratorName: (id?: string | null) => string;
  getFunctionName: (id?: string | null) => string;
}

const diasPorExtenso = (dias: string[]) => {
  const uteis = dias.filter(d => !isWknd(d)).length;
  const fds = dias.filter(d => isWknd(d)).length;
  const partes = [uteis > 0 ? `${uteis} ${uteis === 1 ? "útil" : "úteis"}` : "", fds > 0 ? `${fds} fds` : ""].filter(Boolean);
  return `${dias.length} ${dias.length === 1 ? "dia" : "dias"}${partes.length ? ` · ${partes.join(" + ")}` : ""}`;
};

function Periodo({ icone: Icone, rotulo, datas, detalhe }: { icone: typeof Calendar; rotulo: string; datas: string; detalhe: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-muted/60 px-2.5 sm:px-3 py-2.5">
      <p className="m-0 flex items-center gap-1.5 text-2xs font-medium text-muted-foreground">
        <Icone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />{rotulo}
      </p>
      <p className="m-0 mt-0.5 text-sm font-medium tabular-nums text-foreground">{datas}</p>
      <p className="m-0 text-xs tabular-nums text-muted-foreground">{detalhe}</p>
    </div>
  );
}

export function SplitDetailDialog({ splitDetail, onClose, getCollaboratorName, getFunctionName }: SplitDetailDialogProps) {
  const sd = splitDetail;
  return (
    <Dialog open={!!splitDetail} onOpenChange={onClose}>
      <DialogContent className="max-w-[560px] p-0 gap-0 flex flex-col overflow-hidden" data-testid="dialogo-divisao">
        {sd && (() => {
          const sdName = getCollaboratorName(sd.actual.collaboratorId);
          const sdFn = getFunctionName(sd.actual.functionId);
          const myDays = (sd.actual.workedDays as string[] | null) || [];
          const allDays = sd.allGroupDays;
          const totalGroupDays = allDays.length;
          const myDayCount = myDays.length;
          const pp = sd.propPlanned;
          const fa = sd.actual;

          const mealPlan = pp ? (pp.weekdayLunch + pp.weekdayDinner + pp.weekendLunch + pp.weekendDinner) : 0;
          const mealAct = fa.weekdayLunch + fa.weekdayDinner + fa.weekendLunch + fa.weekendDinner;
          // Derivado do total (não qty×média) para os subtotais fecharem com o TOTAL
          const dailyPlan = pp ? dailySubtotalOf(pp) : 0;
          const dailyAct = dailySubtotalOf(fa);
          const mobPlan = pp ? (pp.mobility + pp.transport) : 0;
          const mobAct = fa.mobility + fa.transport;
          const totalPlan = pp?.totalValue || 0;
          const totalAct = fa.totalValue;
          const cobertura = totalGroupDays > 0 ? Math.round(myDayCount / totalGroupDays * 100) : 0;
          const mostraCobertura = (!sd.isParent && totalGroupDays > 0) || (sd.isParent && totalGroupDays > 0 && myDayCount < totalGroupDays);

          return (
            <>
              {/* ── Quem é ── */}
              <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-border">
                <div className="flex items-center gap-2 flex-wrap pr-6">
                  <DialogTitle className="text-base font-semibold leading-6">{sdName}</DialogTitle>
                  <Chip tom="marca">{sd.isParent ? "Titular" : <><GitFork className="w-3 h-3" aria-hidden="true" />Divisão</>}</Chip>
                </div>
                <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
                  {sdFn} · prestação na vaga dividida
                </DialogDescription>
                {allDays.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Periodo
                      icone={Calendar}
                      rotulo="Vaga original"
                      datas={`${fmtDateShort(allDays[0])} a ${fmtDateShort(allDays[allDays.length - 1])}`}
                      detalhe={diasPorExtenso(allDays)}
                    />
                    {myDays.length > 0 && (
                      <Periodo
                        icone={GitFork}
                        rotulo="Dias atribuídos"
                        datas={myDays.length === 1 ? fmtDate(myDays[0]) : `${fmtDateShort(myDays[0])} a ${fmtDateShort(myDays[myDays.length - 1])}`}
                        detalhe={diasPorExtenso(myDays)}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* ── Extrato ── */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 cmp-extrato cmp-extrato-solto">
                <CabecalhoDoExtrato />
                <div role="group" aria-label="Diárias" className="cmp-bloco">
                  <LinhaDoExtrato nivel="grupo" cor="bg-primary" rotulo="Diárias" planned={dailyPlan} actual={dailyAct} />
                  {(pp || fa.dailyQuantity > 0) && (
                    <LinhaDoExtrato
                      rotulo={`${pp?.dailyQuantity || 0} × ${fmt(pp?.dailyValue || 0)} → ${fa.dailyQuantity} × ${fmt(fa.dailyValue)}`}
                      longo
                      planned={dailyPlan}
                      actual={dailyAct}
                    />
                  )}
                </div>
                <div role="group" aria-label="Alimentação" className="cmp-bloco">
                  <LinhaDoExtrato nivel="grupo" cor="bg-warning-strong" rotulo="Alimentação" planned={mealPlan} actual={mealAct} />
                  {(pp?.weekdayLunch || fa.weekdayLunch) ? <LinhaDoExtrato rotulo="Almoço (dias úteis)" planned={pp?.weekdayLunch || 0} actual={fa.weekdayLunch} /> : null}
                  {(pp?.weekdayDinner || fa.weekdayDinner) ? <LinhaDoExtrato rotulo="Jantar (dias úteis)" planned={pp?.weekdayDinner || 0} actual={fa.weekdayDinner} /> : null}
                  {(pp?.weekendLunch || fa.weekendLunch) ? <LinhaDoExtrato rotulo="Almoço (fim de semana)" planned={pp?.weekendLunch || 0} actual={fa.weekendLunch} /> : null}
                  {(pp?.weekendDinner || fa.weekendDinner) ? <LinhaDoExtrato rotulo="Jantar (fim de semana)" planned={pp?.weekendDinner || 0} actual={fa.weekendDinner} /> : null}
                </div>
                <div role="group" aria-label="Mobilidade" className="cmp-bloco">
                  <LinhaDoExtrato nivel="grupo" cor="bg-slate-400" rotulo="Mobilidade" planned={mobPlan} actual={mobAct} />
                  {(pp?.mobility || fa.mobility) ? (() => {
                    // Ida/volta gravadas como 0 + 0 com mobilidade > 0 contam como
                    // vazias (antes só o nulo caía na metade e a linha saía zerada).
                    const plano = idaEVoltaDaMobilidade(pp?.mobility, pp?.mobilityIda, pp?.mobilityVolta);
                    const real = idaEVoltaDaMobilidade(fa.mobility, fa.mobilityIda, fa.mobilityVolta);
                    return (
                      <>
                        <LinhaDoExtrato rotulo="Ida" planned={plano.ida} actual={real.ida} />
                        <LinhaDoExtrato rotulo="Volta" planned={plano.volta} actual={real.volta} />
                      </>
                    );
                  })() : null}
                  {(pp?.transport || fa.transport) ? <LinhaDoExtrato rotulo="Translado" planned={pp?.transport || 0} actual={fa.transport} /> : null}
                </div>
                <LinhaDoExtrato nivel="total" rotulo="Total" planned={totalPlan} actual={totalAct} />
              </div>

              {/* ── Cobertura e fechar ── */}
              <DialogFooter className="px-4 sm:px-6 py-3.5 border-t border-border bg-surface-muted/40 flex-row items-center gap-3 sm:justify-between">
                {mostraCobertura ? (
                  <div className="min-w-0 flex-1 flex items-center gap-2.5" data-testid="divisao-cobertura">
                    <span
                      role="progressbar"
                      aria-label="Dias da vaga original cobertos"
                      aria-valuemin={0}
                      aria-valuemax={totalGroupDays}
                      aria-valuenow={myDayCount}
                      className="relative w-16 h-1.5 rounded-full bg-border overflow-hidden shrink-0"
                    >
                      <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${cobertura}%` }} />
                    </span>
                    <span className="text-xs text-slate-600">
                      {sd.isParent ? "Titular cobriu" : "Cobriu"} <strong className="tabular-nums text-foreground">{myDayCount}</strong> de <strong className="tabular-nums text-foreground">{totalGroupDays}</strong> dias da vaga
                      <span className="tabular-nums text-muted-foreground"> ({cobertura}%)</span>
                    </span>
                  </div>
                ) : <span />}
                <Button variant="outline" onClick={onClose} className="rounded-lg shrink-0">Fechar</Button>
              </DialogFooter>
            </>
          );
        })()}
        {!sd && <DialogTitle className="sr-only">Detalhes da prestação na vaga dividida</DialogTitle>}
      </DialogContent>
    </Dialog>
  );
}

export default SplitDetailDialog;
