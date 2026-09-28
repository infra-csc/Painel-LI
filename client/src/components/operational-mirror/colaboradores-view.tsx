/**
 * Visão Pessoas do espelho operacional (25/09 — extraída da página).
 */
import { ChevronRight } from "lucide-react";
import { hotelTotalCents, isHotelTotalDerived, type MirrorRow } from "@shared/operational-mirror-types";
import { blocoEmUso } from "@shared/mirror-pendencia";
import { ROOM_TYPE_LABEL, type DrawerKind } from "./drawers";
import { brl, fmtDate, genderLabel, type OpenDrawer, type PendenciaDe } from "./mirror-shared";

export interface ColaboradoresViewProps {
  rows: MirrorRow[];
  openDrawer: OpenDrawer;
  canEdit: boolean;
  emptyMessage: string;
  pendenciaDe: PendenciaDe;
  /** Total sem filtro — o rodapé diz "N de M pessoas". */
  totalDoEvento: number;
}

/**
 * Pessoas (02/09): uma linha por pessoa com quatro fatos — Período, Passagem,
 * Hospedagem, Extras.
 *
 * SEM selo de estado, sem régua de blocos e sem contagem: decisão do cliente.
 * A lista informa; o alerta vive na faixa âmbar, no placar e na Grade. Eram
 * cartões em duas colunas, cada um com altura própria — comparar duas pessoas
 * exigia procurar o mesmo dado em alturas diferentes. O grid de quatro fatos
 * não tem padding nem divisória por item: é o que alinha as linhas entre si.
 */
export function ColaboradoresView({ rows, openDrawer, canEdit, emptyMessage, pendenciaDe, totalDoEvento }: ColaboradoresViewProps) {
  const edit = (kind: DrawerKind, r: MirrorRow) => canEdit ? () => openDrawer(kind, r) : undefined;
  if (rows.length === 0) return <div className="rounded-lg border border-dashed bg-muted/20 py-14 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  const prontas = rows.filter((r) => pendenciaDe(r).abertos.length === 0).length;
  const custoDoConjunto = rows.reduce((s, r) => s + (r.ticket?.value || 0) + hotelTotalCents(r) + (r.baggage.extraCents || 0) + (r.uber.totalCents || 0) + (r.carRental.totalCents || 0), 0);
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="divide-y">
      {rows.map((r) => {
        const t = r.ticket; const a = r.accommodation;
        const hotelTotal = hotelTotalCents(r);
        const hotelDerived = isHotelTotalDerived(r);
        const indivTotal = (t?.value || 0) + hotelTotal + (r.baggage.extraCents || 0) + (r.uber.totalCents || 0) + (r.carRental.totalCents || 0);
        const usaPassagem = blocoEmUso("passagem", r);
        const usaHotel = blocoEmUso("hospedagem", r);
        // Extras zerados não entram: três rótulos com R$ 0,00 ocupavam o mesmo
        // espaço dos que têm dado.
        const extras = [
          r.baggage.extraCents > 0 && `bagagem ${brl(r.baggage.extraCents)}`,
          r.uber.totalCents > 0 && `uber ${brl(r.uber.totalCents)}`,
          r.carRental.totalCents > 0 && `carro ${brl(r.carRental.totalCents)}`,
        ].filter(Boolean) as string[];
        const meta = [
          r.collaborator.gender && r.collaborator.gender !== "unknown" ? genderLabel[r.collaborator.gender] : null,
          r.collaborator.state,
        ].filter(Boolean).join(" · ");
        return (
          <article key={r.teamInclusionId} className="px-4 py-3.5" data-testid={`collab-card-${r.teamInclusionId}`}>
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight truncate" title={r.collaborator.fullName}>{r.collaborator.fullName}</p>
                <p className="text-xs mt-0.5 truncate text-muted-foreground">
                  <span className="capitalize">{r.function.area || r.function.name || "Sem função"}</span>{meta ? ` · ${meta}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <p className="font-mono text-sm font-bold tabular-nums" title={hotelDerived ? "Inclui hospedagem calculada por diária × noites" : undefined}>{brl(indivTotal)}</p>
                {canEdit && (
                  <button type="button" onClick={() => openDrawer(usaPassagem ? "ticket" : "accommodation", r)} aria-label={`Editar ${r.collaborator.fullName}`}
                    className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </header>
            <div className="mt-2.5 grid grid-cols-2 xl:grid-cols-4" style={{ gap: "12px 26px" }}>
              <Fato rotulo="Período">{fmtDate(r.schedule.startDate)} → {fmtDate(r.schedule.endDate)}</Fato>
              <Fato rotulo="Passagem" onClick={usaPassagem ? edit("ticket", r) : undefined}>
                {!usaPassagem ? <span className="text-muted-foreground/70">não se aplica</span>
                  : !t ? <span className="text-warning">sem passagem</span>
                  : <>
                      {[t.ticketCompany, t.locator].filter(Boolean).join(" · ") || "—"}
                      {!t.locator && <span className="text-warning"> · sem localizador</span>}
                      {t.value ? ` · ${brl(t.value)}` : ""}
                    </>}
              </Fato>
              <Fato rotulo="Hospedagem" onClick={usaHotel ? edit("accommodation", r) : undefined}>
                {!usaHotel ? <span className="text-muted-foreground/70">não se aplica</span>
                  : !a?.hotelName ? <span className="text-warning">sem hotel</span>
                  : [a.hotelName, a.roomType ? (ROOM_TYPE_LABEL[a.roomType] ?? a.roomType) : null, a.nightsCount ? `${a.nightsCount} ${a.nightsCount === 1 ? "noite" : "noites"}` : null].filter(Boolean).join(" · ")}
              </Fato>
              <Fato rotulo="Extras" onClick={edit("extras", r)}>
                {extras.length ? extras.join(" · ") : <span className="text-muted-foreground/70">sem extras</span>}
              </Fato>
            </div>
            {r.observations && <p className="mt-2 text-xs text-muted-foreground">{r.observations}</p>}
          </article>
        );
      })}
      </div>
      <div className="flex items-center gap-4 border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {rows.length === totalDoEvento ? `${rows.length} ${rows.length === 1 ? "pessoa" : "pessoas"}` : `${rows.length} de ${totalDoEvento} pessoas`} · {prontas} {prontas === 1 ? "pronta" : "prontas"}
        </span>
        <span className="ml-auto font-mono tabular-nums text-foreground">{brl(custoDoConjunto)}</span>
      </div>
    </div>
  );
}

/** Um fato da linha de Pessoas: rótulo miúdo e valor que pode quebrar. */
function Fato({ rotulo, children, onClick }: { rotulo: string; children: React.ReactNode; onClick?: () => void }) {
  const corpo = (
    <>
      <span className="block text-2xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground/80">{rotulo}</span>
      <span className="block text-xs font-medium leading-normal">{children}</span>
    </>
  );
  if (!onClick) return <div className="min-w-0">{corpo}</div>;
  return (
    <button type="button" onClick={onClick} className="-mx-1 min-w-0 rounded px-1 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {corpo}
    </button>
  );
}
