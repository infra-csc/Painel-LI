/**
 * Modal "Detalhes da prestação do colaborador na vaga dividida" — 25/09
 * (modularização). Extraído de budget-comparison.tsx: cabeçalho com período da
 * vaga original × dias atribuídos, seções (Diárias/Alimentação/Mobilidade) e
 * total, mais a cobertura em % no rodapé.
 */
import { Calendar, Car, GitFork, Utensils, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SectionBlock, SubRow } from "./comparison-blocks";
import { avatarColor, dailySubtotalOf, fmt, fmtDate, fmtDateShort, initials, isWknd, type SplitDetailState } from "./comparison-utils";

export interface SplitDetailDialogProps {
  splitDetail: SplitDetailState | null;
  onClose: () => void;
  getCollaboratorName: (id?: string | null) => string;
  getFunctionName: (id?: string | null) => string;
}

export function SplitDetailDialog({ splitDetail, onClose, getCollaboratorName, getFunctionName }: SplitDetailDialogProps) {
  return (
    <Dialog open={!!splitDetail} onOpenChange={onClose}>
      <DialogContent className="max-w-xl rounded-xl p-0 overflow-hidden gap-0">
        <DialogTitle className="sr-only">Detalhes da prestação do colaborador na vaga dividida</DialogTitle>
        {splitDetail && (() => {
          const sd = splitDetail;
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
          const totalDiff = totalAct - totalPlan;

          let subRowIdx = 0;

          return (
            <>
              {/* ── Modal header — dark purple gradient ── */}
              <div className="bg-primary px-6 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black shadow-2 ring-2 ring-white/20 ${avatarColor(sdName)}`}>
                      {initials(sdName)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-base font-black text-white">{sdName}</span>
                        <span className={`text-2xs font-bold px-2 py-0.5 rounded-full ${sd.isParent
                          ? "bg-primary/30 text-primary-foreground/80 ring-1 ring-primary/40"
                          : "bg-primary/30 text-primary-foreground/80 ring-1 ring-primary/40"}`}>
                          {sd.isParent ? "Titular" : "Divisão"}
                        </span>
                      </div>
                      <p className="text-2xs text-primary-foreground/80">{sdFn}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Fechar detalhes"
                    onClick={onClose}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-card/10 hover:bg-card/20 text-white/70 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                {/* Period info — two blocks side by side */}
                {allDays.length > 0 && (() => {
                  const origWkdays = allDays.filter(d => !isWknd(d)).length;
                  const origWknds  = allDays.filter(d =>  isWknd(d)).length;
                  const myWkdays   = myDays.filter(d => !isWknd(d)).length;
                  const myWknds    = myDays.filter(d =>  isWknd(d)).length;
                  const wkdayStr = (n: number) => n > 0 ? `${n} útil${n !== 1 ? "is" : ""}` : "";
                  const wkndStr  = (n: number) => n > 0 ? `${n} f${n !== 1 ? "ds" : "ds"}` : "";
                  const joinParts = (...parts: string[]) => parts.filter(Boolean).join(" + ");
                  return (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="bg-card/10 rounded-xl px-3 py-2.5 flex items-start gap-2">
                        <Calendar className="w-3.5 h-3.5 text-primary-foreground/80 mt-0.5 flex-shrink-0" aria-hidden="true" />
                        <div>
                          <p className="text-2xs uppercase font-bold tracking-wider text-primary-foreground/80 mb-0.5">Vaga original</p>
                          <p className="text-2xs text-white font-medium leading-snug">
                            {fmtDateShort(allDays[0])} a {fmtDateShort(allDays[allDays.length - 1])}
                          </p>
                          <p className="text-2xs text-primary-foreground/80">
                            {totalGroupDays} dia{totalGroupDays !== 1 ? "s" : ""}
                            {" · "}{joinParts(wkdayStr(origWkdays), wkndStr(origWknds))}
                          </p>
                        </div>
                      </div>
                      {myDays.length > 0 && (
                        <div className="bg-card/10 rounded-xl px-3 py-2.5 flex items-start gap-2">
                          <GitFork className="w-3.5 h-3.5 text-primary-foreground/80 mt-0.5 flex-shrink-0" aria-hidden="true" />
                          <div>
                            <p className="text-2xs uppercase font-bold tracking-wider text-primary-foreground/80 mb-0.5">Dias atribuídos</p>
                            <p className="text-2xs text-white font-medium leading-snug">
                              {myDays.length === 1
                                ? fmtDate(myDays[0])
                                : `${fmtDateShort(myDays[0])} a ${fmtDateShort(myDays[myDays.length - 1])}`}
                            </p>
                            <p className="text-2xs text-primary-foreground/80">
                              {myDayCount} dia{myDayCount !== 1 ? "s" : ""}
                              {" · "}{joinParts(wkdayStr(myWkdays), wkndStr(myWknds))}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* ── Table body ── */}
              <div className="px-5 py-4 space-y-3 bg-card max-h-[50vh] overflow-y-auto">
                <div className="grid grid-cols-4 gap-4 px-4 pb-2 border-b-2 border-border">
                  <span className="text-2xs uppercase text-muted-foreground font-bold tracking-wider">Item</span>
                  <span className="text-2xs uppercase text-primary font-bold tracking-wider text-right">Planejado</span>
                  <span className="text-2xs uppercase text-primary font-bold tracking-wider text-right">Realizado</span>
                  <span className="text-2xs uppercase text-muted-foreground font-bold tracking-wider text-right">Diferença</span>
                </div>

                {/* Diárias */}
                <SectionBlock
                  title="Diárias"
                  icon={Calendar}
                  headerBg="bg-brand-soft/80"
                  iconColor="text-primary"
                  titleColor="text-primary"
                  subtotalPlan={dailyPlan}
                  subtotalAct={dailyAct}
                >
                  {(pp || fa.dailyQuantity > 0) && (
                    <SubRow
                      rowIndex={subRowIdx++}
                      label={`${pp?.dailyQuantity || 0} diária(s) × ${fmt(pp?.dailyValue || 0)}/dia → ${fa.dailyQuantity} × ${fmt(fa.dailyValue)}`}
                      planned={dailyPlan}
                      actual={dailyAct}
                    />
                  )}
                </SectionBlock>

                {/* Alimentação */}
                <SectionBlock
                  title="Alimentação"
                  icon={Utensils}
                  headerBg="bg-warning-soft/80"
                  iconColor="text-warning"
                  titleColor="text-warning"
                  subtotalPlan={mealPlan}
                  subtotalAct={mealAct}
                >
                  {(pp?.weekdayLunch || fa.weekdayLunch) ? <SubRow rowIndex={subRowIdx++} label="Almoço (dias úteis)" planned={pp?.weekdayLunch || 0} actual={fa.weekdayLunch} /> : null}
                  {(pp?.weekdayDinner || fa.weekdayDinner) ? <SubRow rowIndex={subRowIdx++} label="Jantar (dias úteis)" planned={pp?.weekdayDinner || 0} actual={fa.weekdayDinner} /> : null}
                  {(pp?.weekendLunch || fa.weekendLunch) ? <SubRow rowIndex={subRowIdx++} label="Almoço (fins de sem.)" planned={pp?.weekendLunch || 0} actual={fa.weekendLunch} /> : null}
                  {(pp?.weekendDinner || fa.weekendDinner) ? <SubRow rowIndex={subRowIdx++} label="Jantar (fins de sem.)" planned={pp?.weekendDinner || 0} actual={fa.weekendDinner} /> : null}
                </SectionBlock>

                {/* Mobilidade */}
                <SectionBlock
                  title="Mobilidade"
                  icon={Car}
                  headerBg="bg-brand-soft/80"
                  iconColor="text-primary"
                  titleColor="text-primary"
                  subtotalPlan={mobPlan}
                  subtotalAct={mobAct}
                >
                  {(pp?.mobility || fa.mobility) ? (() => {
                    const pIda   = pp?.mobilityIda   ?? Math.ceil((pp?.mobility  || 0) / 2);
                    const pVolta = pp?.mobilityVolta ?? Math.floor((pp?.mobility || 0) / 2);
                    const aIda   = fa.mobilityIda    ?? Math.ceil(fa.mobility  / 2);
                    const aVolta = fa.mobilityVolta  ?? Math.floor(fa.mobility / 2);
                    return (
                      <>
                        <SubRow rowIndex={subRowIdx++} label="Ida" planned={pIda} actual={aIda} />
                        <SubRow rowIndex={subRowIdx++} label="Volta" planned={pVolta} actual={aVolta} />
                      </>
                    );
                  })() : null}
                  {(pp?.transport || fa.transport) ? <SubRow rowIndex={subRowIdx++} label="Translado" planned={pp?.transport || 0} actual={fa.transport} /> : null}
                </SectionBlock>

                {/* Total row */}
                <div className={`grid grid-cols-4 gap-4 px-4 py-3.5 rounded-xl border-2 font-semibold ${
                  totalDiff > 0 ? "bg-danger-soft border-danger/25"
                  : totalDiff < 0 ? "bg-success-soft border-success/25"
                  : "bg-surface-muted border-border"
                }`}>
                  <span className="text-xs font-black uppercase tracking-wide text-slate-700">TOTAL</span>
                  <span className="text-right tabular-nums text-primary text-sm font-black">{fmt(totalPlan)}</span>
                  <span className="text-right tabular-nums text-primary text-sm font-black">{fmt(totalAct)}</span>
                  <div className="text-right">
                    {totalDiff === 0
                      ? <span className="text-muted-foreground tabular-nums text-sm font-black">—</span>
                      : <span className={`tabular-nums text-sm font-black ${totalDiff > 0 ? "text-danger" : "text-success"}`}>
                          {totalDiff > 0 ? "+" : "−"}{fmt(Math.abs(totalDiff))}
                        </span>
                    }
                  </div>
                </div>
              </div>

              {/* ── Footer ── */}
              <div className="px-5 pb-5 pt-3 bg-card space-y-3 border-t border-border">
                {((!sd.isParent && totalGroupDays > 0) || (sd.isParent && totalGroupDays > 0 && myDayCount < totalGroupDays)) && (
                  <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border ${sd.isParent
                    ? "bg-brand-soft border-primary/25" : "bg-brand-soft border-primary/25"}`}>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${sd.isParent ? "bg-brand-soft" : "bg-brand-soft"}`}>
                      <GitFork className={`w-3 h-3 ${sd.isParent ? "text-primary" : "text-primary"}`} aria-hidden="true" />
                    </div>
                    <span className={`text-2xs font-medium ${sd.isParent ? "text-primary" : "text-primary"}`}>
                      {sd.isParent ? "Titular cobriu" : "Este colaborador cobriu"} <strong>{myDayCount}</strong> de <strong>{totalGroupDays}</strong> dias da vaga original
                      {totalGroupDays > 0 && <span className={`ml-1.5 font-bold text-2xs px-1.5 py-0.5 rounded-full ${sd.isParent ? "bg-brand-soft text-primary" : "bg-brand-soft text-primary"}`}>
                        {Math.round(myDayCount / totalGroupDays * 100)}%
                      </span>}
                    </span>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    onClick={onClose}
                    className="h-9 px-6 text-sm rounded-xl text-white bg-primary-hover"
                  >
                    Fechar
                  </Button>
                </div>
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}

export default SplitDetailDialog;
