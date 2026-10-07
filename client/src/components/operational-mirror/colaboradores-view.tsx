/**
 * Visão Pessoas do espelho operacional (25/09 — extraída da página; redesenho 07/10).
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

/** Iniciais para o círculo da pessoa (o mesmo da Escalação e de Passagens). */
function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
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
 *
 * 07/10: em telas largas a pessoa e os quatro fatos ficam numa linha só (como
 * a tabela de Hospedagem); abaixo de 1280 o nome sobe e os fatos descem em
 * duas colunas. O que se edita mostra que se edita (fundo de marca no hover).
 */
export function ColaboradoresView({ rows, openDrawer, canEdit, emptyMessage, pendenciaDe, totalDoEvento }: ColaboradoresViewProps) {
  const edit = (kind: DrawerKind, r: MirrorRow) => canEdit ? () => openDrawer(kind, r) : undefined;
  if (rows.length === 0) return <div className="rounded-xl border border-dashed bg-card py-14 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  const prontas = rows.filter((r) => pendenciaDe(r).abertos.length === 0).length;
  const custoDoConjunto = rows.reduce((s, r) => s + (r.ticket?.value || 0) + hotelTotalCents(r) + (r.baggage.extraCents || 0) + (r.uber.totalCents || 0) + (r.carRental.totalCents || 0), 0);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
      <div className="divide-y divide-border">
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
          <article key={r.teamInclusionId} className="group grid grid-cols-1 gap-x-6 gap-y-2.5 px-4 py-3 transition-colors hover:bg-surface-muted/60 xl:grid-cols-[220px_minmax(0,1fr)_auto] xl:items-center" data-testid={`collab-card-${r.teamInclusionId}`}>
            <header className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-2xs font-semibold text-primary" aria-hidden="true">
                {iniciais(r.collaborator.fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight text-foreground" title={r.collaborator.fullName}>{r.collaborator.fullName}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  <span className="capitalize">{r.function.area || r.function.name || "Sem função"}</span>{meta ? ` · ${meta}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground xl:hidden" title={hotelDerived ? "Inclui hospedagem calculada por diária × noites" : undefined}>{brl(indivTotal)}</p>
              {canEdit && (
                <button type="button" onClick={() => openDrawer(usaPassagem ? "ticket" : "accommodation", r)} aria-label={`Editar ${r.collaborator.fullName}`}
                  className="esp-alvo -mr-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </header>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 lg:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
              <Fato rotulo="Período"><span className="whitespace-nowrap tabular-nums">{fmtDate(r.schedule.startDate)} → {fmtDate(r.schedule.endDate)}</span></Fato>
              <Fato rotulo="Passagem" onClick={usaPassagem ? edit("ticket", r) : undefined}>
                {!usaPassagem ? <span className="text-muted-foreground">não se aplica</span>
                  : !t ? <span className="font-medium text-warning">sem passagem</span>
                  : <>
                      {[t.ticketCompany, t.locator].filter(Boolean).join(" · ") || "—"}
                      {!t.locator && <span className="text-warning"> · sem localizador</span>}
                      {t.value ? <span className="tabular-nums"> · {brl(t.value)}</span> : ""}
                    </>}
              </Fato>
              <Fato rotulo="Hospedagem" onClick={usaHotel ? edit("accommodation", r) : undefined}>
                {!usaHotel ? <span className="text-muted-foreground">não se aplica</span>
                  : !a?.hotelName ? <span className="font-medium text-warning">sem hotel</span>
                  : [a.hotelName, a.roomType ? (ROOM_TYPE_LABEL[a.roomType] ?? a.roomType) : null, a.nightsCount ? `${a.nightsCount} ${a.nightsCount === 1 ? "noite" : "noites"}` : null].filter(Boolean).join(" · ")}
              </Fato>
              <Fato rotulo="Extras" onClick={edit("extras", r)}>
                {extras.length ? extras.join(" · ") : <span className="text-muted-foreground">sem extras</span>}
              </Fato>
              {r.observations && <p className="col-span-2 text-xs text-muted-foreground lg:col-span-4"><span className="font-medium text-slate-600">Obs.:</span> {r.observations}</p>}
            </div>
            <div className="hidden items-center gap-2 xl:flex">
              <p className="min-w-[92px] text-right text-sm font-semibold tabular-nums text-foreground" title={hotelDerived ? "Inclui hospedagem calculada por diária × noites" : undefined}>{brl(indivTotal)}</p>
              {canEdit && (
                <button type="button" onClick={() => openDrawer(usaPassagem ? "ticket" : "accommodation", r)} aria-label={`Editar ${r.collaborator.fullName}`}
                  className="esp-alvo inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </article>
        );
      })}
      </div>
      <div className="flex items-center gap-4 border-t border-border bg-surface-muted px-4 py-2.5 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {rows.length === totalDoEvento ? `${rows.length} ${rows.length === 1 ? "pessoa" : "pessoas"}` : `${rows.length} de ${totalDoEvento} pessoas`} · {prontas} {prontas === 1 ? "pronta" : "prontas"}
        </span>
        <span className="ml-auto font-semibold tabular-nums text-foreground">{brl(custoDoConjunto)}</span>
      </div>
    </div>
  );
}

/** Um fato da linha de Pessoas: rótulo miúdo e valor que pode quebrar. */
function Fato({ rotulo, children, onClick }: { rotulo: string; children: React.ReactNode; onClick?: () => void }) {
  const corpo = (
    <>
      <span className="block text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{rotulo}</span>
      <span className="mt-0.5 block text-xs leading-normal text-foreground">{children}</span>
    </>
  );
  if (!onClick) return <div className="min-w-0">{corpo}</div>;
  return (
    <button type="button" onClick={onClick} title={`Editar ${rotulo.toLowerCase()}`}
      className="-mx-1.5 -my-1 min-w-0 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {corpo}
    </button>
  );
}
