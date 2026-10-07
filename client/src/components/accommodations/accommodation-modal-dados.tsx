/**
 * Aba "Dados da hospedagem" do modal (25/09 — extraída de accommodation-modal.tsx):
 * avisos de trava, voucher, dados do hotel, check-in/check-out, dados do
 * Espelho (leitura), observações e anexos em modo leitura.
 *
 * 07/10 (redesenho): o mesmo desenho do formulário de Passagens — o voucher
 * num cartão com faixa de marca, seções com título discreto e ícone, rótulos
 * em caixa normal, campos de 36px. Check-in e check-out deixaram de ser duas
 * caixas tingidas (verde e amarela, como se uma fosse alerta): a cor ficou no
 * ícone e no título, como a IDA/VOLTA da passagem.
 *
 * Os mesmos campos, ids, `data-testid` e regras de antes.
 */
import { FileText, AlertCircle, Lock, LogIn, LogOut, Loader2, BedDouble, CalendarRange, NotebookPen, Paperclip, Info } from "lucide-react";
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
import { Field, FIELD_LBL, SECAO } from "./accommodation-modal-shared";

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

/** Cartão de seção do formulário (o mesmo de Passagens). */
const CARTAO = "bg-card border border-border rounded-xl p-4";

export function AccommodationDadosTab({
  inclusion, accommodation, draft, set, erros, setErros, roMode, eventLocked, eventLockMessage, lockedForRole, isPostPurchase, isPurchasingRole,
  voucher, periodoDaEscalaPorExtenso, usarPeriodoDaEscala, chegaTarde, escalaInicio, diariasDoRascunho,
}: AccommodationDadosTabProps) {
  const limpar = (campo: CampoObrigatorio) => { if (erros[campo]) setErros(p => ({ ...p, [campo]: undefined })); };
  const id = (campo: string) => `${campo}-${inclusion.id}`;
  return (
    <TabsContent value="dados" className="m-0 p-4 sm:p-6 pas-entra">
      <div className="space-y-4">
        <PastEventBanner show={!!eventLocked} message={eventLockMessage} />
        {lockedForRole && (
          <p className="m-0 flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning" data-testid="notice-locked-for-role">
            <Lock className="w-3.5 h-3.5 shrink-0 text-warning-strong" aria-hidden="true" />
            Hospedagem registrada — somente Compras altera hospedagem registrada.
          </p>
        )}
        {isPostPurchase && isPurchasingRole && (
          <p className="m-0 flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-primary">
            <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            Hospedagem registrada — alterações ficam no histórico da inclusão.
          </p>
        )}

        {/*
          O voucher vem primeiro porque é o caminho mais curto: ele preenche
          hotel, período e valores de uma vez.
        */}
        {!roMode && (
          <div className="border border-primary/25 bg-card rounded-xl overflow-hidden" data-testid="card-voucher">
            <div className="bg-brand-soft/60 border-b border-primary/20 px-4 py-2.5 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
              <span className="text-xs font-semibold text-foreground">Voucher e anexos</span>
              {voucher.lendo && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-2xs font-medium text-primary" role="status">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Lendo o voucher…
                </span>
              )}
            </div>
            <div className="p-4">
              <p className="m-0 mb-3 text-xs leading-relaxed text-slate-600">
                Comece pelo <strong>voucher em PDF</strong>: ele fica guardado como comprovante
                <strong> e preenche hotel, período e valores</strong>. Serve também para o relatório de reservas
                do hotel — nele buscamos a reserva desta pessoa.
              </p>
              <AttachmentUpload
                attachmentIds={draft.attachmentIds}
                onAttachmentsChange={(ids) => set("attachmentIds", ids)}
                onFileSelected={voucher.lerArquivo}
              />
            </div>
          </div>
        )}

        {/* Hotel */}
        <div className={CARTAO}>
          <h3 className={`${SECAO} flex items-center gap-1.5`}><BedDouble className="w-3.5 h-3.5" aria-hidden="true" />Hotel</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <Label htmlFor={id("hotelName")} className={FIELD_LBL}>Nome do hotel<RequiredMark /></Label>
              <Input id={id("hotelName")} placeholder="Ex.: Hotel Copacabana Palace" value={draft.hotelName} aria-required="true" autoComplete="off"
                {...campoComErro(id("hotelName"), erros.hotelName)}
                onChange={(e) => { set("hotelName", e.target.value); limpar("hotelName"); }} data-testid="input-hotel-name" disabled={roMode} />
              <MensagemDeErro id={id("hotelName")} erro={erros.hotelName} />
            </div>
            <div>
              <Label htmlFor={id("hotelLocation")} className={FIELD_LBL}>Localização<RequiredMark /></Label>
              <Input id={id("hotelLocation")} placeholder="Ex.: Copacabana, Rio de Janeiro" value={draft.hotelLocation} aria-required="true" autoComplete="off"
                {...campoComErro(id("hotelLocation"), erros.hotelLocation)}
                onChange={(e) => { set("hotelLocation", e.target.value); limpar("hotelLocation"); }} data-testid="input-hotel-location" disabled={roMode} />
              <MensagemDeErro id={id("hotelLocation")} erro={erros.hotelLocation} />
            </div>
            <div>
              <Label htmlFor={id("reservationNumber")} className={FIELD_LBL}>Número da reserva</Label>
              <Input id={id("reservationNumber")} placeholder="Ex.: RES-123456" value={draft.reservationNumber} autoComplete="off"
                onChange={(e) => set("reservationNumber", e.target.value)} className="font-mono placeholder:font-sans" disabled={roMode} />
            </div>
          </div>
        </div>

        {/* Estadia: check-in / check-out */}
        <div className={CARTAO}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
            <h3 className={`${SECAO} !mb-0 flex items-center gap-1.5`}><CalendarRange className="w-3.5 h-3.5" aria-hidden="true" />Check-in e check-out</h3>
            {periodoDaEscalaPorExtenso && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                {/* O período dito por extenso: é o que o operador precisa conferir. */}
                <span className="text-xs text-muted-foreground" data-testid="periodo-da-escala">
                  Escala: {periodoDaEscalaPorExtenso}
                </span>
                {!roMode && (
                  <button
                    type="button"
                    onClick={usarPeriodoDaEscala}
                    className="pas-alvo inline-flex items-center h-7 px-2.5 rounded-md text-xs font-medium text-primary hover:bg-brand-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="button-usar-periodo-escala"
                  >
                    Usar o período da escala
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <fieldset className="m-0 p-0 border-0 min-w-0">
              <legend className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-success">
                <LogIn className="w-3.5 h-3.5" aria-hidden="true" />Check-in<RequiredMark />
              </legend>
              <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2">
                <div className="min-w-0">
                  <Label htmlFor={id("checkInDate")} className={FIELD_LBL}>Data</Label>
                  <Input id={id("checkInDate")} type="date" value={draft.checkInDate} aria-required="true"
                    {...campoComErro(id("checkInDate"), erros.checkInDate)}
                    onChange={(e) => { set("checkInDate", e.target.value); limpar("checkInDate"); }} data-testid="input-checkin-date" disabled={roMode} />
                  <MensagemDeErro id={id("checkInDate")} erro={erros.checkInDate} />
                </div>
                <div>
                  <Label htmlFor={id("checkInTime")} className={FIELD_LBL}>Hora</Label>
                  <Input id={id("checkInTime")} type="time" value={draft.checkInTime}
                    onChange={(e) => set("checkInTime", e.target.value)} data-testid="input-checkin-time" disabled={roMode} />
                </div>
              </div>
            </fieldset>
            <fieldset className="m-0 p-0 border-0 min-w-0">
              <legend className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-success-strong">
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />Check-out<RequiredMark />
              </legend>
              <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2">
                <div className="min-w-0">
                  <Label htmlFor={id("checkOutDate")} className={FIELD_LBL}>Data</Label>
                  <Input id={id("checkOutDate")} type="date" min={draft.checkInDate || undefined} value={draft.checkOutDate} aria-required="true"
                    {...campoComErro(id("checkOutDate"), erros.checkOutDate)}
                    onChange={(e) => { set("checkOutDate", e.target.value); limpar("checkOutDate"); }} data-testid="input-checkout-date" disabled={roMode} />
                  <MensagemDeErro id={id("checkOutDate")} erro={erros.checkOutDate} />
                </div>
                <div>
                  <Label htmlFor={id("checkOutTime")} className={FIELD_LBL}>Hora</Label>
                  <Input id={id("checkOutTime")} type="time" value={draft.checkOutTime}
                    onChange={(e) => set("checkOutTime", e.target.value)} data-testid="input-checkout-time" disabled={roMode} />
                </div>
              </div>
            </fieldset>
          </div>
          {(!isCheckOutAfterCheckIn(draft) || chegaTarde || diariasDoRascunho > 0) && (
            <div className="mt-3 space-y-2">
              {!isCheckOutAfterCheckIn(draft) && (
                <p className="m-0 text-xs text-danger-strong flex items-center gap-1.5" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> O check-out deve ser igual ou posterior ao check-in.
                </p>
              )}
              {chegaTarde && (
                <p className="pas-entra m-0 flex items-start gap-2 text-xs text-warning bg-warning-soft rounded-lg px-3 py-2" role="alert" data-testid="aviso-chegada-tardia">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-warning-strong" aria-hidden="true" />
                  O check-in é depois do início da escala ({formatDate(escalaInicio)}) — a pessoa fica sem hotel na primeira noite.
                </p>
              )}
              {diariasDoRascunho > 0 && (
                <p className="m-0 text-xs text-muted-foreground" data-testid="impacto-no-planejado" aria-live="polite">
                  <span className="font-semibold text-slate-700 tabular-nums">{diariasDoRascunho} {diariasDoRascunho === 1 ? "diária" : "diárias"}</span> neste período.
                  {" "}O valor da diária e o total são preenchidos no Espelho Operacional.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Dados do espelho operacional — só leitura: quem preenche é a Logística. */}
        {accommodation && (
          <div className="rounded-xl border border-border bg-surface-muted p-4" data-testid="mirror-readonly-block">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className={`${SECAO} !mb-0`}>Dados do espelho operacional</h3>
              <span className="text-2xs text-muted-foreground inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden="true" /> Somente leitura — editado no Espelho</span>
            </div>
            <dl className="m-0 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-3">
              <Field label="Tipo de quarto">{accommodation.roomType ? (ROOM_TYPE_LABEL[accommodation.roomType] ?? accommodation.roomType) : "—"}</Field>
              <Field label="Diárias">{accommodation.nightsCount ?? "—"}</Field>
              <Field label="Valor da diária">{brl(accommodation.dailyRate)}</Field>
              <Field label="Total">{brl(accommodation.totalCents)}</Field>
              <Field label="OC do hotel" mono>{accommodation.hotelOc || "—"}</Field>
            </dl>
          </div>
        )}

        {/* Observações */}
        <div className={CARTAO}>
          <Label htmlFor={id("accommodationObservations")} className={`${SECAO} flex items-center gap-1.5`}>
            <NotebookPen className="w-3.5 h-3.5" aria-hidden="true" />Observações
          </Label>
          <Textarea id={id("accommodationObservations")} placeholder="Informações adicionais sobre a hospedagem…" value={draft.accommodationObservations}
            onChange={(e) => set("accommodationObservations", e.target.value)} className="h-24 resize-none" data-testid="textarea-observations" disabled={roMode} />
        </div>

        {/*
          Em leitura o card do voucher não aparece, mas os anexos ainda
          precisam ser vistos — é onde está o comprovante da reserva.
        */}
        {roMode && (
          <div className={CARTAO}>
            <h3 className={`${SECAO} flex items-center gap-1.5`}><Paperclip className="w-3.5 h-3.5" aria-hidden="true" />Anexos</h3>
            <AttachmentUpload attachmentIds={draft.attachmentIds} onAttachmentsChange={(ids) => set("attachmentIds", ids)} disabled />
          </div>
        )}
      </div>
    </TabsContent>
  );
}
