/**
 * Abas Passagem / Hospedagem / Comentários e Histórico do modal de detalhes.
 * Extraídas de inclusion-details-dialog.tsx (só apresentação; estado fica no dialog).
 */
import type { ReactNode } from "react";
import { Plane, MessageSquare, History } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { TeamInclusion, Ticket, Accommodation, Comment, TeamInclusionLog } from "@shared/schema";
import {
  formatDate, formatDateWithWeekday, formatSuggestionDate, formatDateTime,
  extractTravelInfoFromObservations, getPhaseLabel,
} from "./scaling-utils";
import type { ScalingMutations } from "./use-scaling-mutations";

const lbl = "text-[10px] uppercase tracking-[0.12em] text-slate-400 font-black mb-1";
const val = "text-[13px] font-semibold text-slate-700";

const LOG_ACTION_LABELS: Record<string, string> = {
  status_changed: "🔄 Status Alterado",
  collaborator_changed: "👤 Colaborador Alterado",
  dates_changed: "📅 Período Alterado",
  travel_dates_changed: "✈️ Datas de Viagem",
  observations_changed: "📝 Observações",
  created: "✨ Criado",
  confirmed: "✅ Confirmado",
  reopened: "🔓 Reaberto",
  approve_production: "✅ Aprovado pela Produção",
  reject_production: "❌ Reprovado pela Produção",
  daily_rates_changed: "📊 Diárias Alteradas",
  daily_value_changed: "💰 Valor da Diária Alterado",
  work_days_changed: "📅 Diárias Editadas",
  city_changed: "📍 Cidade Alterada",
  create: "✨ Criado",
  update: "📝 Atualizado",
  delete: "🗑️ Excluído",
  deleted: "🗑️ Excluído",
  reactivate: "🔓 Reativado",
  // ── Validação / Aprovação de Escala (server/scaling-validation.ts) ──
  // Sem estes rótulos o histórico da Escalação mostrava a chave crua
  // ("suggestion_approved") para todo mundo.
  suggestion_sent: "📤 Escala Sugerida Enviada",
  suggestion_validated: "☑️ Validada pela Área",
  suggestion_approved: "✅ Aprovada pelo Aprovador",
  suggestion_rejected: "❌ Reprovada pelo Aprovador",
  suggestion_returned: "↩️ Devolvida para a Área",
  suggestion_change_requested: "📝 Pedido Aberto pela Área",
  created_from_change_request: "✨ Criada por Pedido de Inclusão",
  change_request_approved: "✅ Pedido Aprovado",
  change_request_reajustar: "🛠️ Pedido Reajustado",
  change_request_negar: "🚫 Pedido Negado",
  suggestion_bypass_approve: "⚡ Aprovada sem Validação da Área",
  suggestion_bypass_reject: "⛔ Reprovada sem Validação da Área",
};

type RenderAttachments = (ids: string[] | null | undefined, label: string) => ReactNode;

// ══ ABA: PASSAGEM ══
export function PassagemTab({ inclusion, ticket: selectedTicket, renderAttachments }: {
  inclusion: TeamInclusion;
  ticket: Ticket | undefined;
  renderAttachments: RenderAttachments;
}) {
  return (
        <TabsContent value="passagem" className="m-0 p-6">
          {!inclusion.needsTicket ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center mb-3">
                <Plane className="w-5 h-5 text-slate-300" />
              </div>
              <div className="text-[13px] font-semibold text-slate-500 mb-1">Sem passagem necessária</div>
              <div className="text-[11px] text-slate-400">Esta escalação não requer passagem aérea, rodoviária ou van.</div>
            </div>
          ) : !selectedTicket ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-dashed border-amber-200 flex items-center justify-center mb-3">
                  <Plane className="w-5 h-5 text-amber-300" />
                </div>
                <div className="text-[13px] font-semibold text-slate-600 mb-1">Nenhuma passagem registrada</div>
                <div className="text-[11px] text-slate-400">Aguardando registro de passagem para esta escalação.</div>
              </div>
              <div className="border border-blue-200 rounded-2xl overflow-hidden">
                <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex items-center gap-2">
                  <Plane className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-[11px] font-black text-blue-600 uppercase tracking-[0.12em]">Datas Sugeridas</span>
                  <span className="text-[10px] text-blue-400 font-normal ml-1">· da inclusão de equipe</span>
                </div>
                <div className="p-4">
                  {(() => {
                    const travelInfo = extractTravelInfoFromObservations(inclusion.observations || undefined, inclusion);
                    const showTime = (t: string) => (t !== "N/A" && t !== "Não definido" ? t : "—");
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-white border border-blue-100 rounded-xl p-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-2">🛫 IDA</div>
                          <div className="space-y-1.5">
                            <div><div className="text-[10px] text-slate-400">Data</div><div className="text-[12px] font-semibold text-slate-700">{formatSuggestionDate(travelInfo.ida)}</div></div>
                            <div><div className="text-[10px] text-slate-400">Horário sugerido</div><div className="text-[12px] font-semibold text-slate-700">{showTime(travelInfo.chegada)}</div></div>
                          </div>
                        </div>
                        <div className="bg-white border border-blue-100 rounded-xl p-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-2">🛬 VOLTA</div>
                          <div className="space-y-1.5">
                            <div><div className="text-[10px] text-slate-400">Data</div><div className="text-[12px] font-semibold text-slate-700">{formatSuggestionDate(travelInfo.retorno)}</div></div>
                            <div><div className="text-[10px] text-slate-400">Horário sugerido</div><div className="text-[12px] font-semibold text-slate-700">{showTime(travelInfo.horario)}</div></div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <TicketDetails ticket={selectedTicket} renderAttachments={renderAttachments} />
          )}
        </TabsContent>
  );
}

// ══ ABA: HOSPEDAGEM ══
export function HospedagemTab({ inclusion, accommodation, renderAttachments }: {
  inclusion: TeamInclusion;
  accommodation: Accommodation | undefined;
  renderAttachments: RenderAttachments;
}) {
  return (
        <TabsContent value="hospedagem" className="m-0 p-6">
          {!inclusion.needsAccommodation ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center mb-3 text-xl">🏨</div>
              <div className="text-[13px] font-semibold text-slate-500 mb-1">Sem hospedagem necessária</div>
              <div className="text-[11px] text-slate-400">Esta escalação não requer reserva de hotel.</div>
            </div>
          ) : !accommodation ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-dashed border-amber-200 flex items-center justify-center mb-3 text-xl">🏨</div>
              <div className="text-[13px] font-semibold text-slate-600 mb-1">Nenhuma hospedagem registrada</div>
              <div className="text-[11px] text-slate-400">Aguardando registro de hospedagem para esta escalação.</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="border-b border-green-100 px-4 py-3 flex items-center gap-3" style={{ background: "linear-gradient(to right, #f0fdf4, #ffffff)" }}>
                  <span className="text-xl">🏨</span>
                  <div>
                    <div className="text-[12px] font-black text-green-700 uppercase tracking-[0.12em]">Hospedagem Reservada</div>
                    <div className="text-[13px] font-bold text-slate-800 mt-0.5">{accommodation.hotelName || "Hotel não informado"}</div>
                  </div>
                  {accommodation.reservationNumber && (
                    <span className="ml-auto text-[11px] font-bold text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded-full">LOC: {accommodation.reservationNumber}</span>
                  )}
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {accommodation.hotelLocation && (
                      <div>
                        <div className={lbl}>Localização</div>
                        <div className={val}>{accommodation.hotelLocation}</div>
                      </div>
                    )}
                    <div>
                      <div className={lbl}>Check-in</div>
                      <div className={val}>
                        {accommodation.checkInDate ? formatDateWithWeekday(accommodation.checkInDate) : "Não informado"}
                        {accommodation.checkInTime && ` às ${accommodation.checkInTime}`}
                      </div>
                    </div>
                    <div>
                      <div className={lbl}>Check-out</div>
                      <div className={val}>
                        {accommodation.checkOutDate ? formatDateWithWeekday(accommodation.checkOutDate) : "Não informado"}
                        {accommodation.checkOutTime && ` às ${accommodation.checkOutTime}`}
                      </div>
                    </div>
                    {accommodation.dailyRate && (
                      <div>
                        <div className={lbl}>Valor da Diária</div>
                        <div className={val}>R$ {(accommodation.dailyRate / 100).toFixed(2)}</div>
                      </div>
                    )}
                  </div>
                  {accommodation.accommodationObservations && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className={lbl}>Observações</div>
                      <div className="text-sm text-slate-700 mt-0.5 whitespace-pre-line">{accommodation.accommodationObservations}</div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div className={lbl + " mb-2"}>📎 Anexos</div>
                {renderAttachments(accommodation.attachmentIds, "Hospedagem")}
              </div>
            </div>
          )}
        </TabsContent>
  );
}

// ══ ABA: COMENTÁRIOS E HISTÓRICO ══
export function ComentariosTab({
  comments, inclusionLogs, getUserName, newComment, setNewComment, showAllLogs, setShowAllLogs,
  addComment, canComment, canSend,
}: {
  comments: Comment[] | undefined;
  inclusionLogs: TeamInclusionLog[] | undefined;
  getUserName: (userId: string) => string;
  newComment: string;
  setNewComment: (v: string) => void;
  showAllLogs: boolean;
  setShowAllLogs: (v: boolean) => void;
  addComment: ScalingMutations["addComment"];
  /** Pode escrever (não é read-only e é responsável pela função) */
  canComment: boolean;
  /** Pode enviar (não é read-only) */
  canSend: boolean;
}) {
  return (
        <TabsContent value="comentarios" className="m-0 p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                <span className="text-[12px] font-black text-slate-600 uppercase tracking-[0.1em]">Comentários</span>
                {comments && comments.length > 0 && (
                  <span className="bg-[#2563EB] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{comments.length}</span>
                )}
              </div>
              {comments && comments.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {comments.map((comment) => (
                    <div key={comment.id} className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[9px] font-black shrink-0">
                            {getUserName(comment.userId).charAt(0).toUpperCase()}
                          </div>
                          <div className="text-[12px] font-bold text-slate-700">{getUserName(comment.userId)}</div>
                        </div>
                        <div className="text-[10px] text-slate-400 shrink-0 ml-2">{formatDateTime(comment.createdAt)}</div>
                      </div>
                      <div className="text-[12px] text-slate-600 leading-relaxed">{comment.content}</div>
                      {comment.phase && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-50">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-500">{getPhaseLabel(comment.phase)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center py-8">
                  <MessageSquare className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                  <div className="text-[12px] text-slate-400">Nenhum comentário registrado.</div>
                </div>
              )}
              <div className="pt-1 space-y-2">
                <Textarea
                  rows={2}
                  placeholder="Escreva um comentário..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl bg-white text-[13px] p-3 resize-none min-h-[70px] focus:ring-2 focus:ring-blue-100 focus:border-[#2563EB] transition-all"
                  data-testid="textarea-comment-inline"
                  disabled={!canComment}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => { if (newComment.trim()) addComment.mutate(newComment.trim(), { onSuccess: () => setNewComment("") }); }}
                    disabled={addComment.isPending || !newComment.trim() || !canSend}
                    style={{ background: "#2563EB" }}
                    className="flex items-center gap-2 text-white rounded-xl px-5 py-2 h-9 text-sm font-bold hover:opacity-90"
                    data-testid="button-add-comment-inline"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    {addComment.isPending ? "Enviando..." : "Enviar"}
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-slate-400" />
                <span className="text-[12px] font-black text-slate-600 uppercase tracking-[0.1em]">Histórico</span>
                {inclusionLogs && inclusionLogs.length > 0 && (
                  <span className="text-[10px] text-slate-400">{inclusionLogs.length} entr.</span>
                )}
              </div>
              {!inclusionLogs || inclusionLogs.length === 0 ? (
                <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center py-8">
                  <History className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                  <div className="text-[12px] text-slate-400">Nenhum histórico encontrado.</div>
                </div>
              ) : (
                <div>
                  <div className="border-l-2 border-slate-100 ml-3 pl-4 space-y-2 max-h-72 overflow-y-auto">
                    {/* cópia antes do sort: .sort() mutaria o array do cache do React Query */}
                    {[...inclusionLogs]
                      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                      .slice(0, showAllLogs ? undefined : 5)
                      .map((log) => (
                        <div key={log.id} className="flex gap-3">
                          <div className="w-2.5 h-2.5 bg-[#2563EB] rounded-full -ml-[1.3rem] mt-2.5 flex-shrink-0 ring-4 ring-white" />
                          <div className="flex-1 min-w-0 bg-white border border-slate-100 rounded-xl px-3 py-2 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-[11px] font-bold text-slate-700">{LOG_ACTION_LABELS[log.action] || log.action}</div>
                              <div className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">{log.createdAt && formatDateTime(log.createdAt)}</div>
                            </div>
                            {log.details && <div className="text-[11px] text-slate-500 mt-0.5">{log.details}</div>}
                            <div className="text-[10px] font-semibold mt-1" style={{ color: "#2563EB" }}>↳ {log.userName}</div>
                          </div>
                        </div>
                      ))}
                  </div>
                  {!showAllLogs && inclusionLogs.length > 5 && (
                    <button onClick={() => setShowAllLogs(true)} className="text-xs font-medium mt-2 ml-7 hover:underline" style={{ color: "#2563EB" }}>
                      Ver todos ({inclusionLogs.length - 5} mais)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
  );
}

// ── Aba Passagem: passagem registrada ───────────────────────────────────────

function TicketDetails({ ticket, renderAttachments }: {
  ticket: Ticket;
  renderAttachments: (ids: string[] | null | undefined, label: string) => ReactNode;
}) {
  const t = ticket as typeof ticket & { returnOriginAirport?: string | null; returnDestinationAirport?: string | null };
  const isVan = t.transportType === "van";
  const isRodo = t.transportType === "rodoviario";
  const isAereo = t.transportType === "aereo";
  const field = (label: string, value: ReactNode, cls = "text-sm font-medium text-slate-700") => (
    <div>
      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={cls}>{value}</div>
    </div>
  );
  const time = (value: string | null | undefined) => (
    <div>
      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Horário</div>
      {value ? (
        <div className="bg-green-50 border-l-4 border-green-400 rounded-lg px-3 py-2"><span className="text-lg font-bold text-green-700">{value}</span></div>
      ) : (
        <div className="bg-slate-50 border-l-4 border-slate-200 rounded-lg px-3 py-2"><span className="text-lg font-bold text-slate-300">--:--</span></div>
      )}
    </div>
  );
  const hasReturn = !!(t.actualReturnDate || t.actualReturnTime || t.returnCityOrigin || t.returnCityDestination);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 flex items-center gap-3" style={{ background: "linear-gradient(to right, #f0f7ff, #ffffff)" }}>
          <span className="text-xl">{isVan ? "🚐" : isRodo ? "🚌" : "✈️"}</span>
          <div>
            <div className="text-[12px] font-black text-[#2563EB] uppercase tracking-[0.12em]">
              {isVan ? "Van" : isRodo ? "Transporte Rodoviário" : "Passagem Aérea"}
            </div>
            {t.purchaseDate && <div className="text-[11px] text-slate-400 mt-0.5">Comprada em {formatDate(t.purchaseDate)}</div>}
          </div>
          {t.purchaseDate && (
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-[10px] font-bold rounded-full border border-green-200">✓ Comprada</span>
          )}
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-6">
          {t.purchaseOrderNumber && (
            <div>
              <div className={lbl}>{isVan ? "Empresa / OC" : "Ordem de Compra"}</div>
              <div className="text-[13px] font-bold text-slate-700 font-mono">{t.purchaseOrderNumber}</div>
            </div>
          )}
          {t.cardLastFourDigits && (
            <div>
              <div className={lbl}>Cartão</div>
              <div className="text-[13px] font-semibold text-slate-700 font-mono">****{t.cardLastFourDigits}</div>
            </div>
          )}
        </div>
      </div>

      {isVan ? (
        t.ticketObservations ? (
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 mb-2">Observações</div>
            <div className="text-sm text-slate-700 whitespace-pre-line">{t.ticketObservations}</div>
          </div>
        ) : null
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.12em] mb-3 flex items-center gap-1.5" style={{ color: "#2563EB" }}>{isRodo ? "🚌" : "🛫"} IDA</div>
            <div className="space-y-2.5">
              {isRodo && t.departureAirport && field("Rodoviária de Origem", t.departureAirport)}
              {t.departureCityOrigin && field("Cidade de Origem", t.departureCityOrigin)}
              {isAereo && t.departureAirport && field("Aeroporto de Origem", t.departureAirport)}
              {isRodo && t.destinationAirport && field("Rodoviária de Destino", t.destinationAirport)}
              {t.departureCityDestination && field("Cidade de Destino", t.departureCityDestination)}
              {isAereo && t.destinationAirport && field("Aeroporto de Destino", t.destinationAirport)}
              {t.actualDepartureDate && field("Data", formatDate(t.actualDepartureDate), "text-sm font-semibold text-[#2563EB]")}
              {time(t.actualDepartureTime)}
            </div>
          </div>
          {hasReturn ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.12em] mb-3 flex items-center gap-1.5" style={{ color: "#2563EB" }}>{isRodo ? "🚌" : "🛬"} VOLTA</div>
              <div className="space-y-2.5">
                {t.returnCityOrigin && field("Cidade de Origem", t.returnCityOrigin)}
                {isAereo && t.returnOriginAirport && field("Aeroporto de Origem", t.returnOriginAirport, "text-sm font-bold text-slate-700 uppercase font-mono")}
                {t.returnCityDestination && field("Cidade de Destino", t.returnCityDestination)}
                {isAereo && t.returnDestinationAirport && field("Aeroporto de Destino", t.returnDestinationAirport, "text-sm font-bold text-slate-700 uppercase font-mono")}
                {t.actualReturnDate && field("Data", formatDate(t.actualReturnDate), "text-sm font-semibold text-[#2563EB]")}
                {time(t.actualReturnTime)}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-4 flex items-center justify-center">
              <div className="text-center">
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400 mb-1">{isRodo ? "🚌" : "🛬"} VOLTA</div>
                <div className="text-xs text-slate-300">Sem informações de volta</div>
              </div>
            </div>
          )}
        </div>
      )}

      {t.ticketObservations && !isVan && (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
          <div className={lbl + " mb-1"}>Observações</div>
          <div className="text-sm text-slate-700 whitespace-pre-line">{t.ticketObservations}</div>
        </div>
      )}

      <div>
        <div className={lbl + " mb-2"}>📎 Anexos</div>
        {renderAttachments(t.attachmentIds, "Passagem")}
      </div>
    </div>
  );
}
