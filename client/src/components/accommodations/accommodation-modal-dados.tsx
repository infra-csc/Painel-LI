/**
 * Aba "Dados da Hospedagem" do modal (25/09 — extraída de accommodation-modal.tsx):
 * avisos de trava, voucher, dados do hotel, check-in/check-out, dados do
 * Espelho (leitura), observações e anexos em modo leitura.
 */
import { FileText, AlertCircle, Lock, ArrowDown, ArrowUp } from "lucide-react";
import AttachmentUpload from "@/components/ui/attachment-upload";
import type { useVoucherFill } from "@/components/tickets/use-voucher-fill";
import { TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ROOM_TYPE_LABEL } from "@/components/operational-mirror/drawers";
import type { TeamInclusion, Accommodation } from "@shared/schema";
import type { AccommodationDraft } from "./types";
import { brl, formatDate, isCheckOutAfterCheckIn } from "./utils";
import { PastEventBanner } from "@/lib/event-lock";
import { RequiredMark } from "@/components/forms/required-mark";
import { MensagemDeErro } from "@/components/forms/mensagem-de-erro";
import { campoComErro } from "@/lib/campo-com-erro";
import { Field, FIELD_LBL } from "./accommodation-modal-shared";

export type CampoObrigatorio = "hotelName" | "hotelLocation" | "checkInDate" | "checkOutDate";
export type ErrosDaHospedagem = Partial<Record<CampoObrigatorio, string>>;

export interface AccommodationDadosTabProps {
  inclusion: TeamInclusion;
  accommodation: Accommodation | undefined;
  draft: AccommodationDraft;
  set: <K extends keyof AccommodationDraft>(field: K, value: AccommodationDraft[K]) => void;
  erros: ErrosDaHospedagem;
  setErros: React.Dispatch<React.SetStateAction<ErrosDaHospedagem>>;
  roMode: boolean;
  eventLocked?: boolean;
  eventLockMessage?: string | null;
  lockedForRole: boolean;
  isPostPurchase: boolean;
  isPurchasingRole: boolean;
  voucher: ReturnType<typeof useVoucherFill>;
  periodoDaEscalaPorExtenso: string | null;
  usarPeriodoDaEscala: () => void;
  chegaTarde: boolean;
  escalaInicio: string;
  diariasDoRascunho: number;
}

const ROTULO_DATA = "text-2xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 block";

export function AccommodationDadosTab({
  inclusion, accommodation, draft, set, erros, setErros, roMode, eventLocked, eventLockMessage, lockedForRole, isPostPurchase, isPurchasingRole,
  voucher, periodoDaEscalaPorExtenso, usarPeriodoDaEscala, chegaTarde, escalaInicio, diariasDoRascunho,
}: AccommodationDadosTabProps) {
  const limpar = (campo: CampoObrigatorio) => { if (erros[campo]) setErros(p => ({ ...p, [campo]: undefined })); };
  return (
    <TabsContent value="dados" className="m-0 p-6">
      <div className="space-y-4">
        <PastEventBanner show={!!eventLocked} message={eventLockMessage} />
        {lockedForRole && (
          <div className="bg-warning-soft border border-warning/25 rounded-xl px-4 py-2.5 flex items-center gap-2" data-testid="notice-locked-for-role">
            <Lock className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
            <span className="text-warning font-semibold text-sm">Hospedagem registrada — somente Compras altera hospedagem registrada.</span>
          </div>
        )}
        {isPostPurchase && isPurchasingRole && (
          <div className="bg-brand-soft border border-primary/25 rounded-xl px-4 py-2.5">
            <span className="text-primary font-semibold text-sm">Hospedagem registrada — alterações ficam no histórico da inclusão.</span>
          </div>
        )}

        {/*
          O voucher vem primeiro porque é o caminho mais curto: ele
          preenche hotel, período e valores de uma vez. Estava no fim da
          aba, depois de todos os campos que ele mesmo preencheria.
        */}
        {!roMode && (
          <div className="rounded-xl border border-primary/25 bg-brand-soft p-4" data-testid="card-voucher">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Comece pelo voucher em PDF</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Ele fica guardado como comprovante e preenche hotel, período e valores.
                  Serve também para o relatório de reservas do hotel — nele buscamos a reserva desta pessoa.
                </p>
                <div className="mt-2.5">
                  <AttachmentUpload
                    attachmentIds={draft.attachmentIds}
                    onAttachmentsChange={(ids) => set("attachmentIds", ids)}
                    onFileSelected={voucher.lerArquivo}
                  />
                </div>
              </div>
              {voucher.lendo && <span className="text-2xs font-semibold text-primary shrink-0">Lendo o voucher…</span>}
            </div>
          </div>
        )}

        {/* Dados do Hotel */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-2xs font-black uppercase tracking-[0.12em] text-muted-foreground mb-3">Dados do Hotel</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            <div>
              <Label htmlFor={`hotelName-${inclusion.id}`} className={FIELD_LBL}>Nome do Hotel<RequiredMark /></Label>
              <Input id={`hotelName-${inclusion.id}`} placeholder="Ex: Hotel Copacabana Palace" value={draft.hotelName} aria-required="true"
                {...campoComErro(`hotelName-${inclusion.id}`, erros.hotelName)}
                onChange={(e) => { set("hotelName", e.target.value); limpar("hotelName"); }} data-testid="input-hotel-name" disabled={roMode} />
              <MensagemDeErro id={`hotelName-${inclusion.id}`} erro={erros.hotelName} />
            </div>
            <div>
              <Label htmlFor={`hotelLocation-${inclusion.id}`} className={FIELD_LBL}>Localização<RequiredMark /></Label>
              <Input id={`hotelLocation-${inclusion.id}`} placeholder="Ex: Copacabana, Rio de Janeiro" value={draft.hotelLocation} aria-required="true"
                {...campoComErro(`hotelLocation-${inclusion.id}`, erros.hotelLocation)}
                onChange={(e) => { set("hotelLocation", e.target.value); limpar("hotelLocation"); }} data-testid="input-hotel-location" disabled={roMode} />
              <MensagemDeErro id={`hotelLocation-${inclusion.id}`} erro={erros.hotelLocation} />
            </div>
          </div>
          <div>
            <Label htmlFor={`reservationNumber-${inclusion.id}`} className={FIELD_LBL}>Número da Reserva</Label>
            <Input id={`reservationNumber-${inclusion.id}`} placeholder="Ex: RES-123456" value={draft.reservationNumber}
              onChange={(e) => set("reservationNumber", e.target.value)} className="max-w-[280px]" disabled={roMode} />
          </div>
        </div>

        {/* Check-in / Check-out */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="text-2xs font-black uppercase tracking-[0.12em] text-muted-foreground">Check-in / Check-out</div>
            {periodoDaEscalaPorExtenso && (
              <div className="flex items-center gap-2.5">
                {/* O período dito por extenso: "de 11/09 a 15/09/2026" é o
                    que o operador precisa conferir, e ele estava só
                    implícito nos campos já preenchidos. */}
                <span className="text-xs text-muted-foreground" data-testid="periodo-da-escala">
                  Escala: {periodoDaEscalaPorExtenso}
                </span>
                {!roMode && (
                  <button
                    type="button"
                    onClick={usarPeriodoDaEscala}
                    className="h-[26px] px-2.5 rounded-lg border border-border bg-card text-xs font-medium text-slate-700 hover:bg-muted transition-colors"
                    data-testid="button-usar-periodo-escala"
                  >
                    Usar o período da escala
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-success/25 bg-success-soft/40 p-3">
              <div className="text-2xs font-bold text-success uppercase tracking-[0.06em] mb-2 flex items-center gap-1"><ArrowDown className="w-3 h-3" aria-hidden="true" /> Check-in<RequiredMark /></div>
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <div>
                  <Label htmlFor={`checkInDate-${inclusion.id}`} className={ROTULO_DATA}>Data</Label>
                  <Input id={`checkInDate-${inclusion.id}`} type="date" value={draft.checkInDate} aria-required="true"
                    {...campoComErro(`checkInDate-${inclusion.id}`, erros.checkInDate)}
                    onChange={(e) => { set("checkInDate", e.target.value); limpar("checkInDate"); }} data-testid="input-checkin-date" disabled={roMode} />
                  <MensagemDeErro id={`checkInDate-${inclusion.id}`} erro={erros.checkInDate} />
                </div>
                <div>
                  <Label htmlFor={`checkInTime-${inclusion.id}`} className={ROTULO_DATA}>Hora</Label>
                  <Input id={`checkInTime-${inclusion.id}`} type="time" value={draft.checkInTime}
                    onChange={(e) => set("checkInTime", e.target.value)} data-testid="input-checkin-time" disabled={roMode} />
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-warning/25 bg-warning-soft/40 p-3">
              <div className="text-2xs font-bold text-warning uppercase tracking-[0.06em] mb-2 flex items-center gap-1"><ArrowUp className="w-3 h-3" aria-hidden="true" /> Check-out<RequiredMark /></div>
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <div>
                  <Label htmlFor={`checkOutDate-${inclusion.id}`} className={ROTULO_DATA}>Data</Label>
                  <Input id={`checkOutDate-${inclusion.id}`} type="date" min={draft.checkInDate || undefined} value={draft.checkOutDate} aria-required="true"
                    {...campoComErro(`checkOutDate-${inclusion.id}`, erros.checkOutDate)}
                    onChange={(e) => { set("checkOutDate", e.target.value); limpar("checkOutDate"); }} data-testid="input-checkout-date" disabled={roMode} />
                  <MensagemDeErro id={`checkOutDate-${inclusion.id}`} erro={erros.checkOutDate} />
                </div>
                <div>
                  <Label htmlFor={`checkOutTime-${inclusion.id}`} className={ROTULO_DATA}>Hora</Label>
                  <Input id={`checkOutTime-${inclusion.id}`} type="time" value={draft.checkOutTime}
                    onChange={(e) => set("checkOutTime", e.target.value)} data-testid="input-checkout-time" disabled={roMode} />
                </div>
              </div>
            </div>
          </div>
          {!isCheckOutAfterCheckIn(draft) && (
            <p className="mt-2 text-xs text-danger flex items-center gap-1.5" role="alert">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> O check-out deve ser igual ou posterior ao check-in.
            </p>
          )}
          {chegaTarde && (
            <p className="mt-2 text-xs text-warning bg-warning-soft rounded-xl px-3 py-2" role="alert" data-testid="aviso-chegada-tardia">
              O check-in é depois do início da escala ({formatDate(escalaInicio)}) — a pessoa fica sem hotel na primeira noite.
            </p>
          )}
          {diariasDoRascunho > 0 && (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="impacto-no-planejado">
              {diariasDoRascunho} {diariasDoRascunho === 1 ? "diária" : "diárias"} neste período.
              O valor da diária e o total são preenchidos no Espelho Operacional.
            </p>
          )}
        </div>

        {/* Dados do Espelho Operacional — só leitura: quem preenche é a Logística. */}
        {accommodation && (
          <div className="bg-surface-muted border border-border rounded-xl p-4" data-testid="mirror-readonly-block">
            <div className="flex items-center justify-between mb-3">
              <div className="text-2xs font-black uppercase tracking-[0.12em] text-muted-foreground">Dados do Espelho Operacional</div>
              <span className="text-2xs text-muted-foreground inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden="true" /> Somente leitura — editado no Espelho</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Field label="Tipo de quarto">{accommodation.roomType ? (ROOM_TYPE_LABEL[accommodation.roomType] ?? accommodation.roomType) : "—"}</Field>
              <Field label="Diárias">{accommodation.nightsCount ?? "—"}</Field>
              <Field label="Valor da diária">{brl(accommodation.dailyRate)}</Field>
              <Field label="Total">{brl(accommodation.totalCents)}</Field>
              <Field label="OC do hotel" mono>{accommodation.hotelOc || "—"}</Field>
            </div>
          </div>
        )}

        {/* Observações */}
        <div className="bg-card border border-border rounded-xl p-4">
          <Label htmlFor={`accommodationObservations-${inclusion.id}`} className={FIELD_LBL}>Observações</Label>
          <Textarea id={`accommodationObservations-${inclusion.id}`} placeholder="Informações adicionais sobre a hospedagem…" value={draft.accommodationObservations}
            onChange={(e) => set("accommodationObservations", e.target.value)} className="h-24 resize-none" data-testid="textarea-observations" disabled={roMode} />
        </div>

        {/*
          Em leitura o card do voucher não aparece, mas os anexos ainda
          precisam ser vistos — é onde está o comprovante da reserva.
        */}
        {roMode && (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-surface-muted border-b border-border px-4 py-2.5 flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-2xs font-black text-muted-foreground uppercase tracking-[0.12em]">Anexos</span>
            </div>
            <div className="p-4">
              <AttachmentUpload attachmentIds={draft.attachmentIds} onAttachmentsChange={(ids) => set("attachmentIds", ids)} disabled />
            </div>
          </div>
        )}
      </div>
    </TabsContent>
  );
}
