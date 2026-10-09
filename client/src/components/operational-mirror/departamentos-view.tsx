/**
 * Visão Departamentos do espelho operacional (25/09 — extraída da página; redesenho 07/10).
 *
 * 07/10: eram cartões soltos com três botões de texto por pessoa ("Passagem",
 * "Hotel", "Extras") — 72 botões numa tela de 24 pessoas. Agora é uma lista
 * agrupada num cartão só: o cabeçalho do departamento resume (pessoas, blocos
 * prontos, custo), e em cada pessoa os próprios valores abrem o bloco
 * correspondente — o número é o botão.
 */
import { useMemo } from "react";
import { ChevronRight, Plane, BedDouble, Luggage } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { hotelTotalCents, isHotelTotalDerived, type MirrorRow, type MirrorTotals, type MirrorSubtotal } from "@shared/operational-mirror-types";
import { BLOCOS_DE_CUSTO, blocoEmUso, blocoPendencia, textoDaSituacao } from "@shared/mirror-pendencia";
import { cn } from "@/lib/utils";
import { brl, fmtDate, type OpenDrawer, type PendenciaDe } from "./mirror-shared";
import type { DrawerKind } from "./drawers";

export interface DepartamentosViewProps {
  pendenciaDe: PendenciaDe;
  verNaGrade: (departamento: string) => void;
  rows: MirrorRow[];
  totals: MirrorTotals;
  collapsed: Set<string>;
  setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>;
  openDrawer: OpenDrawer;
  canEdit: boolean;
  emptyMessage: string;
}

export function DepartamentosView({ rows, totals, collapsed, setCollapsed, openDrawer, canEdit, emptyMessage, pendenciaDe, verNaGrade }: DepartamentosViewProps) {
  const groups = useMemo(() => {
    const m = new Map<string, MirrorRow[]>();
    rows.forEach((r) => { const k = r.function.area || r.function.name || "(sem departamento)"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  // Antes: um .find() linear em byDepartment dentro do map dos grupos (O(n×m)).
  // Map preserva "o primeiro registro vence", igual ao find().
  const deptTotals = useMemo(() => {
    const m = new Map<string, MirrorSubtotal>();
    (totals?.byDepartment || []).forEach((d) => { if (!m.has(d.name)) m.set(d.name, d); });
    return m;
  }, [totals]);
  if (groups.length === 0) return <div className="rounded-xl border border-dashed bg-card py-14 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  const todosAbertos = groups.every(([n]) => !collapsed.has(n));
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
      <div className="flex items-center gap-3 border-b border-border bg-surface-muted px-4 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        <span>Departamento</span>
        <button type="button"
          onClick={() => setCollapsed(todosAbertos ? new Set(groups.map(([n]) => n)) : new Set())}
          className="ml-auto h-6 rounded-md px-2 text-xs font-medium normal-case tracking-normal text-primary transition-colors hover:bg-brand-soft">
          {todosAbertos ? "Recolher todos" : "Abrir todos"}
        </button>
      </div>
      {groups.map(([name, members]) => {
        const dt = deptTotals.get(name);
        const isOpen = !collapsed.has(name);
        const subtotal = dt?.total ?? 0;
        const extrasTotal = members.reduce((s, r) => s + (r.baggage.extraCents || 0) + (r.uber.totalCents || 0) + (r.carRental.totalCents || 0), 0);
        // Progresso em BLOCOS em uso (só os três que pendenciam): "X de Y
        // blocos em uso prontos". A base conta o que cada pessoa usa, não
        // pessoas × 3.
        let blocosEmUso = 0, blocosProntos = 0, aCompletar = 0;
        for (const r of members) {
          const { abertos } = pendenciaDe(r);
          if (abertos.length > 0) aCompletar += 1;
          for (const b of BLOCOS_DE_CUSTO) {
            if (!blocoPendencia(b) || !blocoEmUso(b, r)) continue;
            blocosEmUso += 1;
            if (!abertos.includes(b)) blocosProntos += 1;
          }
        }
        const pct = blocosEmUso ? Math.round((blocosProntos / blocosEmUso) * 100) : 100;
        return (
          <Collapsible key={name} open={isOpen} onOpenChange={(o) => setCollapsed((s) => { const n = new Set(s); if (o) n.delete(name); else n.add(name); return n; })}
            className="border-b border-border last:border-b-0" data-testid={`dept-${name}`}>
            <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5", isOpen && "bg-surface-muted/50")}>
              <CollapsibleTrigger className="esp-alvo -ml-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", isOpen && "rotate-90")} aria-hidden="true" />
                <span className="truncate text-sm font-semibold capitalize text-foreground">{name}</span>
              </CollapsibleTrigger>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {members.length} {members.length === 1 ? "pessoa" : "pessoas"} · {aCompletar ? <span className="font-medium text-warning">{aCompletar} a completar</span> : <span className="text-success">nenhuma pendência</span>}
              </span>
              <div className="hidden min-w-[170px] items-center gap-2 md:flex" title={`${blocosProntos} de ${blocosEmUso} blocos em uso prontos`}>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className={cn("block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none", (blocosProntos < blocosEmUso ? "bg-warning-strong" : "bg-success-strong"))} style={{ width: `${pct}%` }} />
                </span>
                <span className="whitespace-nowrap text-2xs tabular-nums text-muted-foreground">{blocosProntos} de {blocosEmUso} blocos</span>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {dt && <span className="hidden text-xs tabular-nums text-muted-foreground 2xl:inline">Passagem {brl(dt.tickets)} · Hotel {brl(dt.hotel)} · Extras {brl(extrasTotal)}</span>}
                <span className="text-sm font-semibold tabular-nums text-foreground">{brl(subtotal)}</span>
                <button type="button" onClick={() => verNaGrade(name)} data-testid={`dept-ver-${name}`}
                  className="esp-alvo inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Ver na grade
                </button>
              </div>
            </div>
            <CollapsibleContent>
              <ul className="divide-y divide-border/70 border-t border-border/70">
                {members.map((r) => {
                  const n = pendenciaDe(r).abertos.length;
                  const derivado = isHotelTotalDerived(r);
                  return (
                    <li key={r.teamInclusionId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2 pl-11 pr-4 text-sm transition-colors hover:bg-surface-muted/60 lg:grid-cols-[minmax(180px,1.4fr)_170px_repeat(3,minmax(96px,0.6fr))_120px]">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                        <span className="truncate">{r.collaborator.fullName}</span>
                      </span>
                      <span className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground lg:text-left">{fmtDate(r.schedule.startDate)} → {fmtDate(r.schedule.endDate)}</span>
                      <span className="col-span-2 flex flex-wrap items-center gap-x-1 lg:contents">
                        <Valor icone={<Plane className="h-3 w-3 text-primary" aria-hidden="true" />} rotulo="Passagem" valor={brl(r.ticket?.value)}
                          onClick={canEdit ? () => openDrawer("ticket" as DrawerKind, r) : undefined} pessoa={r.collaborator.fullName} />
                        <Valor icone={<BedDouble className="h-3 w-3 text-success-strong" aria-hidden="true" />} rotulo="Hotel" valor={brl(hotelTotalCents(r))}
                          italico={derivado} dica={derivado ? "Valor derivado: diária × diárias" : undefined}
                          onClick={canEdit ? () => openDrawer("accommodation", r) : undefined} pessoa={r.collaborator.fullName} />
                        <Valor icone={<Luggage className="h-3 w-3 text-warning-strong" aria-hidden="true" />} rotulo="Extras" valor={brl((r.baggage.extraCents || 0) + (r.uber.totalCents || 0) + (r.carRental.totalCents || 0))}
                          onClick={canEdit ? () => openDrawer("extras", r) : undefined} pessoa={r.collaborator.fullName} />
                        <span className="ml-auto lg:ml-0 lg:text-right">
                          {n > 0
                            ? <span className="inline-flex h-[22px] items-center rounded-md bg-warning-soft px-[7px] text-2xs font-medium text-warning">{textoDaSituacao(n)}</span>
                            : <span className="inline-flex h-[22px] items-center rounded-md bg-success-soft px-[7px] text-2xs font-medium text-success">{textoDaSituacao(0)}</span>}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
      {/* Rodapé da visão: o mesmo par que fecha Grade e Pessoas — o que está
          na tela e quanto custa. Sem ele, Departamentos era a única visão em
          que o total do recorte não aparecia. */}
      <div className="flex items-center gap-4 border-t border-border bg-surface-muted px-4 py-2.5 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {groups.length} {groups.length === 1 ? "departamento" : "departamentos"} · {rows.length} {rows.length === 1 ? "pessoa" : "pessoas"}
        </span>
        <span className="ml-auto font-semibold tabular-nums text-foreground">
          {brl(groups.reduce((acc, [nome]) => acc + (deptTotals.get(nome)?.total ?? 0), 0))}
        </span>
      </div>
    </div>
  );
}

/** Um valor da pessoa que, para quem edita, abre o bloco no drawer. */
function Valor({ icone, rotulo, valor, onClick, italico, dica, pessoa }: {
  icone: React.ReactNode; rotulo: string; valor: string; onClick?: () => void; italico?: boolean; dica?: string; pessoa: string;
}) {
  const corpo = (
    <>
      {icone}
      <span className="sr-only">{rotulo}: </span>
      <span className={cn("tabular-nums", italico && "italic")}>{valor}</span>
    </>
  );
  if (!onClick) return <span className="inline-flex items-center gap-1.5 px-1.5 text-xs text-foreground" title={dica ?? rotulo}>{corpo}</span>;
  return (
    <button type="button" onClick={onClick} title={dica ? `${dica} — editar` : `Editar ${rotulo.toLowerCase()}`}
      aria-label={`Editar ${rotulo.toLowerCase()} de ${pessoa}: ${valor}`}
      className="inline-flex h-7 items-center gap-1.5 justify-self-start rounded-md px-1.5 text-xs text-foreground transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {corpo}
    </button>
  );
}
