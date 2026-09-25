/**
 * Aba Resumo do modal de Hospedagem (25/09 — extraída de accommodation-modal.tsx):
 * evento/função, colaborador (com troca pendente) e período/hotel.
 */
import { Hotel, MapPin } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { fixEncoding } from "@/lib/utils";
import type { TeamInclusion, Event, Function, Collaborator, Accommodation } from "@shared/schema";
import type { NormalizedSwap } from "./types";
import { formatDate } from "./utils";
import SwapReviewPanel from "./swap-review-panel";
import { Field, LBL } from "./accommodation-modal-shared";

export function AccommodationResumoTab({ inclusion, accommodation, event, func, collaborator, collaboratorById, swaps, isPurchasingRole }: {
  inclusion: TeamInclusion;
  accommodation: Accommodation | undefined;
  event: Event | undefined;
  func: Function | undefined;
  collaborator: Collaborator | undefined;
  collaboratorById: Map<string, Collaborator>;
  swaps: NormalizedSwap[] | undefined;
  isPurchasingRole: boolean;
}) {
  return (
    <TabsContent value="resumo" className="m-0 p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Col 1: Evento + Função */}
        <div className="bg-surface-muted rounded-xl border border-border p-4 space-y-3">
          <div>
            <div className={LBL}>Evento</div>
            <div className="text-sm font-semibold text-primary leading-snug">{event?.name || "—"}</div>
          </div>
          <Field label="ID" mono>#{inclusion.inclusionNumber || "N/A"}</Field>
          <Field label="Função">{func?.name || "—"}</Field>
          <div>
            <div className={LBL}>Hospedagem</div>
            {accommodation ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-success-soft text-success text-2xs font-bold rounded-lg border border-success/25"><Hotel className="w-2.5 h-2.5" aria-hidden="true" />Registrada</span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-warning-soft text-warning text-2xs font-bold rounded-lg border border-warning/25"><Hotel className="w-2.5 h-2.5" aria-hidden="true" />Pendente</span>
            )}
          </div>
        </div>

        {/* Col 2: Colaborador */}
        <div className="bg-surface-muted rounded-xl border border-border p-4 space-y-3">
          <Field label="Colaborador">{collaborator ? fixEncoding(collaborator.fullName) : "—"}</Field>
          {collaborator && (<>
            {/* Documento e nascimento só chegam para admin/Compras/RH (projeção
                do GET /api/collaborators, 23/09): sem o dado, a linha some. */}
            {collaborator.officialDocument && (
              <Field label="Documento" mono>{collaborator.documentType ? `${collaborator.documentType.toUpperCase()}: ` : ""}{collaborator.officialDocument}</Field>
            )}
            {collaborator.birthDate && <Field label="Data de Nascimento">{formatDate(collaborator.birthDate)}</Field>}
            <Field label="Cidade do colaborador">{collaborator.city || "—"}</Field>
            <Field label="Tipo">{collaborator.type || "—"}</Field>
          </>)}
          {inclusion.city && (
            <div className="mt-1 rounded-xl bg-brand-soft border border-primary/25 px-3 py-2 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
              <div>
                <div className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Sai de</div>
                <div className="text-sm font-bold text-primary">{inclusion.city}</div>
              </div>
            </div>
          )}
          <SwapReviewPanel inclusion={inclusion} swaps={swaps} collaboratorById={collaboratorById} canReview={isPurchasingRole} />
        </div>

        {/* Col 3: Período + Hotel (se registrado) */}
        <div className="space-y-3">
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-brand-soft border-b border-border px-4 py-2.5">
              <span className="text-2xs font-black text-primary uppercase tracking-[0.12em]">Período de Trabalho</span>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <Field label="Início">{inclusion.scheduleStartDate ? formatDate(inclusion.scheduleStartDate) : "—"}</Field>
              <Field label="Término">{inclusion.scheduleEndDate ? formatDate(inclusion.scheduleEndDate) : "—"}</Field>
            </div>
          </div>

          {accommodation && (
            <div className="border border-success/25 rounded-xl overflow-hidden">
              <div className="bg-success-soft border-b border-success/25 px-4 py-2.5 flex items-center gap-2">
                <Hotel className="w-3.5 h-3.5 text-success" aria-hidden="true" />
                <span className="text-2xs font-black text-success uppercase tracking-[0.12em]">Hotel</span>
              </div>
              <div className="p-4 space-y-2">
                <Field label="Nome">{accommodation.hotelName || "—"}</Field>
                <Field label="Localização">{accommodation.hotelLocation || "—"}</Field>
                {accommodation.reservationNumber && <Field label="Reserva" mono>{accommodation.reservationNumber}</Field>}
                {(accommodation.checkInDate || accommodation.checkOutDate) && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <Field label="Check-in">{accommodation.checkInDate ? formatDate(accommodation.checkInDate) : "—"}{accommodation.checkInTime ? ` · ${accommodation.checkInTime}` : ""}</Field>
                    <Field label="Check-out">{accommodation.checkOutDate ? formatDate(accommodation.checkOutDate) : "—"}{accommodation.checkOutTime ? ` · ${accommodation.checkOutTime}` : ""}</Field>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </TabsContent>
  );
}
