/**
 * Aba Resumo do modal de Hospedagem (25/09 — extraída de accommodation-modal.tsx):
 * a vaga, o colaborador (com troca), o período de trabalho e o hotel.
 *
 * 07/10 (redesenho): o mesmo desenho do Resumo de Passagens — três cartões
 * cinza com rótulos em caixa alta pesada viraram duas seções de leitura
 * (Vaga · Colaborador) em lista de definição, com o hotel ao lado como um
 * "cartão de estadia" (hotel, reserva, check-in → check-out e as diárias).
 * Sem reserva, o lado do hotel diz o que falta e leva direto aos Dados.
 * A troca de colaborador, quando há, ocupa a largura toda embaixo.
 *
 * Os mesmos campos de antes: evento, ID, função, situação da hospedagem,
 * colaborador, documento, nascimento, cidade, tipo, "sai de", início e término
 * do trabalho, hotel, localização, reserva, check-in e check-out com hora.
 */
import { BedDouble, CheckCheck, LogIn, LogOut, MapPin, PencilLine, XCircle } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { fixEncoding } from "@/lib/utils";
import type { TeamInclusion, Event, Function, Collaborator, Accommodation } from "@shared/schema";
import type { NormalizedSwap } from "./types";
import { formatDate, toDateInput } from "./utils";
import { contarDiarias } from "./accommodations-queue";
import SwapReviewPanel from "./swap-review-panel";
import { Field, SECAO } from "./accommodation-modal-shared";

const diarias = (n: number) => `${n} ${n === 1 ? "diária" : "diárias"}`;

export function AccommodationResumoTab({ inclusion, accommodation, event, func, collaborator, collaboratorById, swaps, isPurchasingRole, onIrParaDados }: {
  inclusion: TeamInclusion;
  accommodation: Accommodation | undefined;
  event: Event | undefined;
  func: Function | undefined;
  collaborator: Collaborator | undefined;
  collaboratorById: Map<string, Collaborator>;
  swaps: NormalizedSwap[] | undefined;
  isPurchasingRole: boolean;
  /** Leva à aba Dados — só quando a pessoa pode registrar. */
  onIrParaDados?: () => void;
}) {
  const escalaInicio = toDateInput(inclusion.scheduleStartDate);
  const escalaFim = toDateInput(inclusion.scheduleEndDate);
  const diariasDaEscala = contarDiarias(escalaInicio, escalaFim);
  const diariasReservadas = accommodation ? contarDiarias(accommodation.checkInDate, accommodation.checkOutDate) : 0;
  // A situação da troca, em uma linha, junto do colaborador (o painel com as
  // ações fica embaixo, na largura toda).
  const swap = swaps?.find((s) => s.status === "pendente") || swaps?.find((s) => ["aprovado", "rejeitado"].includes(s.status));

  return (
    <TabsContent value="resumo" className="m-0 p-4 sm:p-6 pas-entra">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] gap-5">
        <div className="space-y-5 min-w-0">
          {/* Vaga */}
          <section aria-labelledby={`hos-resumo-vaga-${inclusion.id}`}>
            <h3 id={`hos-resumo-vaga-${inclusion.id}`} className={SECAO}>Vaga</h3>
            <dl className="m-0 grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3.5 rounded-xl border border-border bg-card p-4">
              <Field label="Evento" className="col-span-2 sm:col-span-3">
                <span className="text-primary font-semibold">{event?.name || "—"}</span>
              </Field>
              <Field label="ID"><span className="font-mono font-semibold">#{inclusion.inclusionNumber || "N/A"}</span></Field>
              <Field label="Função">{func?.name || "—"}</Field>
              <Field label="Hospedagem">
                {accommodation ? (
                  <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-md bg-success-soft text-success text-2xs font-medium">
                    <BedDouble className="w-3 h-3" aria-hidden="true" />Registrada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-md bg-warning-soft text-warning text-2xs font-medium">
                    <BedDouble className="w-3 h-3" aria-hidden="true" />Pendente
                  </span>
                )}
              </Field>
              <Field label="Início do trabalho">{inclusion.scheduleStartDate ? formatDate(inclusion.scheduleStartDate) : "—"}</Field>
              <Field label="Término do trabalho">{inclusion.scheduleEndDate ? formatDate(inclusion.scheduleEndDate) : "—"}</Field>
              {inclusion.city && (
                <Field label="Sai de">
                  <span className="inline-flex items-center gap-1 text-primary font-semibold">
                    <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />{inclusion.city}
                  </span>
                </Field>
              )}
            </dl>
          </section>

          {/* Colaborador */}
          <section aria-labelledby={`hos-resumo-colab-${inclusion.id}`}>
            <h3 id={`hos-resumo-colab-${inclusion.id}`} className={SECAO}>Colaborador</h3>
            <dl className="m-0 grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3.5 rounded-xl border border-border bg-card p-4">
              <Field label="Colaborador" className="col-span-2 sm:col-span-3">{collaborator ? fixEncoding(collaborator.fullName) : "—"}</Field>
              {collaborator && (<>
                {/* Documento e nascimento só chegam para admin/Compras/RH (projeção
                    do GET /api/collaborators, 23/09): sem o dado, a linha some. */}
                {collaborator.officialDocument && (
                  <Field label="Documento" mono>{collaborator.documentType ? `${collaborator.documentType.toUpperCase()}: ` : ""}{collaborator.officialDocument}</Field>
                )}
                {collaborator.birthDate && <Field label="Data de nascimento">{formatDate(collaborator.birthDate)}</Field>}
                <Field label="Tipo">{collaborator.type || "—"}</Field>
                <Field label="Cidade do colaborador">{collaborator.city || "—"}</Field>
              </>)}
              {swap?.status === "pendente" && (
                <div className="col-span-2 sm:col-span-3" title="Há uma solicitação de troca de colaborador aguardando análise de Compras.">
                  <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-warning-soft text-2xs text-warning">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning-strong shrink-0" aria-hidden="true" />
                    Troca solicitada · <span className="font-semibold">Aguardando análise</span>
                  </span>
                </div>
              )}
              {swap?.status === "aprovado" && (
                <div className="col-span-2 sm:col-span-3">
                  <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-success-soft text-2xs text-success">
                    <CheckCheck className="w-3 h-3 shrink-0" aria-hidden="true" />Troca aprovada por Compras
                  </span>
                </div>
              )}
              {swap?.status === "rejeitado" && (
                <div className="col-span-2 sm:col-span-3">
                  <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-danger-soft text-2xs text-danger">
                    <XCircle className="w-3 h-3 shrink-0" aria-hidden="true" />Troca rejeitada por Compras
                  </span>
                </div>
              )}
            </dl>
          </section>
        </div>

        {/* Hotel: o "cartão de estadia" — ou o que falta registrar */}
        <section aria-labelledby={`hos-resumo-hotel-${inclusion.id}`} className="min-w-0 order-first lg:order-none">
          <h3 id={`hos-resumo-hotel-${inclusion.id}`} className={SECAO}>Hotel</h3>
          {accommodation ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid="resumo-hotel">
              <div className="flex items-start gap-3 px-4 py-3.5 border-b border-border">
                <span className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg bg-brand-soft text-primary" aria-hidden="true">
                  <BedDouble className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-semibold leading-5 text-foreground break-words">{accommodation.hotelName || "—"}</p>
                  <p className="m-0 mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="sr-only">Localização:</span>
                    <span className="min-w-0 break-words">{accommodation.hotelLocation || "—"}</span>
                  </p>
                </div>
              </div>
              {(accommodation.checkInDate || accommodation.checkOutDate) && (
                <dl className="m-0 grid grid-cols-2 divide-x divide-border">
                  <div className="px-4 py-3 min-w-0">
                    <dt className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-[0.06em] text-success"><LogIn className="w-3 h-3" aria-hidden="true" />Check-in</dt>
                    <dd className="m-0 mt-1 text-base font-semibold leading-6 text-foreground tabular-nums">{accommodation.checkInDate ? formatDate(accommodation.checkInDate) : "—"}</dd>
                    {accommodation.checkInTime && <dd className="m-0 text-xs text-muted-foreground tabular-nums">a partir das {accommodation.checkInTime}</dd>}
                  </div>
                  <div className="px-4 py-3 min-w-0">
                    <dt className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-[0.06em] text-success-strong"><LogOut className="w-3 h-3" aria-hidden="true" />Check-out</dt>
                    <dd className="m-0 mt-1 text-base font-semibold leading-6 text-foreground tabular-nums">{accommodation.checkOutDate ? formatDate(accommodation.checkOutDate) : "—"}</dd>
                    {accommodation.checkOutTime && <dd className="m-0 text-xs text-muted-foreground tabular-nums">até as {accommodation.checkOutTime}</dd>}
                  </div>
                </dl>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 bg-surface-muted border-t border-border text-xs text-slate-600">
                {diariasReservadas > 0 && <span className="font-medium tabular-nums">{diarias(diariasReservadas)}</span>}
                {accommodation.reservationNumber && (
                  <span>Reserva <span className="font-mono font-semibold text-foreground">{accommodation.reservationNumber}</span></span>
                )}
                {!accommodation.reservationNumber && diariasReservadas === 0 && <span className="text-muted-foreground">Sem número de reserva</span>}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center rounded-xl border border-dashed border-border bg-card px-5 py-7" data-testid="resumo-hotel-vazio">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-warning-soft text-warning-strong mb-2.5" aria-hidden="true">
                <BedDouble className="w-5 h-5" />
              </span>
              <p className="m-0 text-sm font-semibold text-foreground">Hotel a definir</p>
              <p className="m-0 mt-1 max-w-[280px] text-xs leading-relaxed text-muted-foreground">
                {escalaInicio && escalaFim
                  ? `A escala vai de ${formatDate(escalaInicio).slice(0, 5)} a ${formatDate(escalaFim)} — ${diarias(diariasDaEscala)} para cobrir.`
                  : "Ainda não há hotel registrado para esta vaga."}
              </p>
              {onIrParaDados && (
                <button
                  type="button"
                  onClick={onIrParaDados}
                  className="mt-3.5 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-soft text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PencilLine className="w-3.5 h-3.5" aria-hidden="true" />Preencher os dados
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <SwapReviewPanel inclusion={inclusion} swaps={swaps} collaboratorById={collaboratorById} canReview={isPurchasingRole} />
    </TabsContent>
  );
}
