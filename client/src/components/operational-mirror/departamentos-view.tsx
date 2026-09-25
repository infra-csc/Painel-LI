/**
 * Visão Departamentos do espelho operacional (25/09 — extraída da página).
 */
import { useMemo } from "react";
import { ChevronDown, ChevronRight, Building2, Plane, BedDouble, Luggage, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { hotelTotalCents, isHotelTotalDerived, type MirrorRow, type MirrorTotals, type MirrorSubtotal } from "@shared/operational-mirror-types";
import { BLOCOS_DE_CUSTO, blocoEmUso, blocoPendencia, textoDaSituacao } from "@shared/mirror-pendencia";
import { cn } from "@/lib/utils";
import { brl, fmtDate, type OpenDrawer, type PendenciaDe } from "./mirror-shared";

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
  if (groups.length === 0) return <div className="rounded-lg border border-dashed bg-muted/20 py-14 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  return (
    <div className="space-y-3">
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
          <Card key={name} data-testid={`dept-${name}`}>
            <Collapsible open={isOpen} onOpenChange={(o) => setCollapsed((s) => { const n = new Set(s); if (o) n.delete(name); else n.add(name); return n; })}>
              <div className="flex items-center gap-3 px-4 py-3">
                <CollapsibleTrigger className="flex items-center gap-2 min-w-0 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  <Building2 className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                  <span className="text-sm font-bold capitalize truncate">{name}</span>
                </CollapsibleTrigger>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {members.length} {members.length === 1 ? "pessoa" : "pessoas"} · {aCompletar ? `${aCompletar} a completar` : "nenhuma pendência"}
                </span>
                <div className="hidden md:flex items-center gap-2 min-w-[180px]" title={`${blocosProntos} de ${blocosEmUso} blocos em uso prontos`}>
                  <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span className={cn("block h-full rounded-full transition-[width] duration-300", (blocosProntos < blocosEmUso ? "bg-warning-strong" : "bg-success-strong"))} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-2xs tabular-nums text-muted-foreground whitespace-nowrap">{blocosProntos} de {blocosEmUso} blocos</span>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  {dt && <span className="hidden lg:inline text-xs text-muted-foreground">Passagem {brl(dt.tickets)} · Hotel {brl(dt.hotel)} · Extras {brl(extrasTotal)}</span>}
                  <span className="font-mono text-base font-bold tabular-nums">{brl(subtotal)}</span>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => verNaGrade(name)} data-testid={`dept-ver-${name}`}>
                    Ver na grade
                  </Button>
                </div>
              </div>
              <CollapsibleContent>
                <Separator />
                <div className="divide-y">
                  {members.map((r) => (
                    <div key={r.teamInclusionId} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 text-sm hover:bg-muted/20">
                      <div className="font-medium min-w-[180px] flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-2xs font-bold">{r.collaborator.fullName.slice(0, 2).toUpperCase()}</span>
                        {r.collaborator.fullName}
                      </div>
                      <span className="text-xs text-muted-foreground">{fmtDate(r.schedule.startDate)} → {fmtDate(r.schedule.endDate)}</span>
                      <span className="flex items-center gap-1 text-xs"><Plane className="h-3 w-3 text-primary" aria-hidden="true" /> {brl(r.ticket?.value)}</span>
                      <span className={`flex items-center gap-1 text-xs ${isHotelTotalDerived(r) ? "italic" : ""}`} title={isHotelTotalDerived(r) ? "Valor derivado: diária × diárias" : undefined}>
                        <BedDouble className="h-3 w-3 text-success-strong" aria-hidden="true" /> {brl(hotelTotalCents(r))}
                      </span>
                      <span className="flex items-center gap-1 text-xs"><Luggage className="h-3 w-3 text-warning-strong" aria-hidden="true" /> {brl((r.baggage.extraCents || 0) + (r.uber.totalCents || 0) + (r.carRental.totalCents || 0))}</span>
                      {(() => { const n = pendenciaDe(r).abertos.length; return n > 0
                        ? <span className="ml-auto inline-flex h-[22px] items-center rounded-md px-[7px] text-2xs font-medium bg-warning-soft text-warning">{textoDaSituacao(n)}</span>
                        : null; })()}
                      {canEdit && <>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openDrawer("ticket", r)}><Pencil className="h-3 w-3 mr-1" aria-hidden="true" /> Passagem</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openDrawer("accommodation", r)}><Pencil className="h-3 w-3 mr-1" aria-hidden="true" /> Hotel</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openDrawer("extras", r)}><Pencil className="h-3 w-3 mr-1" aria-hidden="true" /> Extras</Button>
                      </>}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
      {/* Rodapé da visão: o mesmo par que fecha Grade e Pessoas — o que está
          na tela e quanto custa. Sem ele, Departamentos era a única visão em
          que o total do recorte não aparecia. */}
      <div className="flex items-center gap-4 rounded-lg border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {groups.length} {groups.length === 1 ? "departamento" : "departamentos"} · {rows.length} {rows.length === 1 ? "pessoa" : "pessoas"}
        </span>
        <span className="ml-auto font-mono tabular-nums text-foreground">
          {brl(groups.reduce((acc, [nome]) => acc + (deptTotals.get(nome)?.total ?? 0), 0))}
        </span>
      </div>
    </div>
  );
}
