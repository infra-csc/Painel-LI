/**
 * Abas Passagem / Hospedagem / Histórico do modal de detalhes.
 * Extraídas de inclusion-details-dialog.tsx (só apresentação; estado fica no dialog).
 *
 * Redesenho de 01/09. Nenhum campo saiu — os três estados de cada aba, o card
 * de datas sugeridas, as observações e os anexos continuam onde estavam. O que
 * mudou:
 *
 * - **Os horários de CHEGADA entraram.** `actualArrivalTime` e
 *   `returnArrivalTime` já existiam no banco e não apareciam em lugar nenhum
 *   desta tela: quem precisava saber a que horas a pessoa pousa tinha de abrir
 *   Passagens. É o dado que decide almoço, jantar e transfer de madrugada.
 * - **Valor, companhia e localizador** idem: estavam gravados e invisíveis.
 * - O horário ganhou o destaque com filete à esquerda, e a cor cravada
 *   (#2563EB, que não é a marca) deu lugar aos tokens.
 * - O histórico tem esqueleto próprio: comentários e logs vêm de outra
 *   consulta, e mostrar "nenhum comentário" enquanto ela ainda está no ar é
 *   afirmar uma coisa que não se sabe.
 */
import type { ReactNode } from "react";
import { Plane, MessageSquare, History, Bed } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { TeamInclusion, Ticket, Accommodation, Comment } from "@shared/schema";
import type { CategoriaDoHistorico, EntradaDoHistorico } from "@shared/inclusion-timeline";
import {
  formatDate, formatDateWithWeekday, formatSuggestionDate, formatDateTime,
  extractTravelInfoFromObservations, getPhaseLabel,
} from "./scaling-utils";
import type { ScalingMutations } from "./use-scaling-mutations";

const lbl = "text-[11px] text-muted-foreground font-medium mb-1";
const val = "text-[13px] font-semibold text-slate-700";

type RenderAttachments = (ids: string[] | null | undefined, label: string) => ReactNode;

/** Estado vazio de aba — a causa sempre escrita junto. */
function AbaVazia({ icone, titulo, texto, tom = "neutro" }: {
  icone: ReactNode; titulo: string; texto: string; tom?: "neutro" | "pendente";
}) {
  const pendente = tom === "pendente";
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className={`w-12 h-12 rounded-xl border border-dashed flex items-center justify-center mb-3 ${
        pendente ? "bg-[#FFFBEB] border-[#FCD34D] text-[#B45309]" : "bg-background border-border text-slate-300"
      }`}>
        {icone}
      </div>
      <div className={`text-[13px] font-semibold mb-1 ${pendente ? "text-slate-700" : "text-slate-500"}`}>{titulo}</div>
      <div className="text-[12px] text-muted-foreground max-w-[420px]">{texto}</div>
    </div>
  );
}

// ══ ABA: PASSAGEM ══
export function PassagemTab({ inclusion, ticket: selectedTicket, renderAttachments }: {
  inclusion: TeamInclusion;
  ticket: Ticket | undefined;
  renderAttachments: RenderAttachments;
}) {
  return (
        <TabsContent value="passagem" className="m-0 p-6">
          {!inclusion.needsTicket ? (
            <AbaVazia
              icone={<Plane className="w-5 h-5" aria-hidden="true" />}
              titulo="Sem passagem necessária"
              texto="Esta escalação não requer passagem aérea, rodoviária ou van."
            />
          ) : !selectedTicket ? (
            <div className="space-y-4">
              <AbaVazia
                tom="pendente"
                icone={<Plane className="w-5 h-5" aria-hidden="true" />}
                titulo="Nenhuma passagem registrada"
                texto="Aguardando registro de passagem para esta escalação."
              />
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="bg-brand-soft border-b border-border px-4 py-2.5 flex items-center gap-2">
                  <Plane className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                  <span className="text-[11px] font-semibold text-primary uppercase tracking-[0.06em]">Datas sugeridas</span>
                  <span className="text-[11px] text-muted-foreground ml-1">· da inclusão de equipe</span>
                </div>
                <div className="p-4">
                  {(() => {
                    const travelInfo = extractTravelInfoFromObservations(inclusion.observations || undefined, inclusion);
                    const showTime = (t: string) => (t !== "N/A" && t !== "Não definido" ? t : "—");
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-card border border-border rounded-lg p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-2">🛫 Ida</div>
                          <div className="space-y-1.5">
                            <div><div className={lbl}>Data</div><div className="text-[12px] font-semibold text-slate-700">{formatSuggestionDate(travelInfo.ida)}</div></div>
                            <div><div className={lbl}>Horário sugerido</div><div className="text-[12px] font-semibold text-slate-700">{showTime(travelInfo.chegada)}</div></div>
                          </div>
                        </div>
                        <div className="bg-card border border-border rounded-lg p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-2">🛬 Volta</div>
                          <div className="space-y-1.5">
                            <div><div className={lbl}>Data</div><div className="text-[12px] font-semibold text-slate-700">{formatSuggestionDate(travelInfo.retorno)}</div></div>
                            <div><div className={lbl}>Horário sugerido</div><div className="text-[12px] font-semibold text-slate-700">{showTime(travelInfo.horario)}</div></div>
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
            <AbaVazia
              icone={<Bed className="w-5 h-5" aria-hidden="true" />}
              titulo="Sem hospedagem necessária"
              texto="Esta escalação não requer reserva de hotel."
            />
          ) : !accommodation ? (
            <AbaVazia
              tom="pendente"
              icone={<Bed className="w-5 h-5" aria-hidden="true" />}
              titulo="Nenhuma hospedagem registrada"
              texto="Aguardando registro de hospedagem para esta escalação."
            />
          ) : (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3 flex items-center gap-3">
                  <Bed className="w-5 h-5 text-[#047857] shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-[#047857] uppercase tracking-[0.06em]">Hospedagem reservada</div>
                    <div className="text-[14px] font-semibold text-slate-900 mt-0.5 truncate">{accommodation.hotelName || "Hotel não informado"}</div>
                  </div>
                  {accommodation.reservationNumber && (
                    <span className="ml-auto shrink-0 text-[11px] font-medium text-muted-foreground font-mono bg-background border border-border px-2.5 py-1 rounded-md">
                      LOC {accommodation.reservationNumber}
                    </span>
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
                    {accommodation.dailyRate ? (
                      <div>
                        <div className={lbl}>Valor da diária</div>
                        <div className={val}>R$ {(accommodation.dailyRate / 100).toFixed(2)}</div>
                      </div>
                    ) : null}
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
                <div className={lbl}>Anexos</div>
                {renderAttachments(accommodation.attachmentIds, "Hospedagem")}
              </div>
            </div>
          )}
        </TabsContent>
  );
}

/** Esqueleto do histórico: a forma do conteúdo, não um "vazio" prematuro. */
function EsqueletoHistorico({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }).map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-lg border border-slate-100 bg-background animate-pulse"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

// ══ Linha do tempo da vaga (14/09) ══

/** Uma cor por categoria — a pílula diz DE ONDE veio o acontecimento. */
const CATEGORIA_META: Record<CategoriaDoHistorico, { rotulo: string; ponto: string; chip: string }> = {
  vaga: { rotulo: "Vaga", ponto: "bg-slate-400", chip: "bg-slate-100 text-slate-600" },
  escala: { rotulo: "Escala", ponto: "bg-blue-500", chip: "bg-blue-50 text-blue-700" },
  aprovacao: { rotulo: "Aprovação", ponto: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
  passagem: { rotulo: "Passagem", ponto: "bg-violet-500", chip: "bg-violet-50 text-violet-700" },
  hospedagem: { rotulo: "Hospedagem", ponto: "bg-sky-500", chip: "bg-sky-50 text-sky-700" },
  troca: { rotulo: "Troca", ponto: "bg-amber-500", chip: "bg-amber-50 text-amber-800" },
  pedido: { rotulo: "Pedido", ponto: "bg-fuchsia-500", chip: "bg-fuchsia-50 text-fuchsia-700" },
  alteracao: { rotulo: "Alteração", ponto: "bg-slate-300", chip: "bg-slate-100 text-slate-600" },
};

const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DIA_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "Hoje", "Ontem" ou "25/09/2026 · quinta". */
function rotuloDoDia(dia: string): string {
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  if (dia === ymdLocal(hoje)) return "Hoje";
  if (dia === ymdLocal(ontem)) return "Ontem";
  const [a, m, d] = dia.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a} · ${DIA_DA_SEMANA[new Date(a, m - 1, d).getDay()]}`;
}

/**
 * O que aconteceu com a vaga, do mais recente para o mais antigo, agrupado por
 * dia. Cada entrada: categoria, o que aconteceu, o detalhe, o comentário (em
 * destaque, separado) e quem fez. Rola dentro da coluna — nada fica escondido
 * atrás de "Ver todos".
 */
/**
 * Quem criou a vaga, por onde e quando (dono, 14/09) — fixo no topo do
 * Histórico. A criação é a entrada mais antiga e ficava no fim da rolagem;
 * quem abre a aba quer essa resposta primeiro.
 */
function CriacaoDaVaga({ historico }: { historico: EntradaDoHistorico[] | undefined }) {
  if (!historico || historico.length === 0) return null;
  const e = historico.find((x) => x.id === "vaga-criada" || (x.categoria === "vaga" && x.titulo.startsWith("Vaga criada")));
  if (!e) {
    return (
      <p className="mb-3 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[12px] text-slate-500" data-testid="historico-criacao">
        A criação desta vaga não ficou registrada.
      </p>
    );
  }
  const quando = new Date(e.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const onde = e.detalhe ? e.detalhe.replace(/^Pela\s+/i, "") : null;
  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600" data-testid="historico-criacao">
      <p>
        <span className="font-semibold text-slate-800">{e.titulo}</span> em{" "}
        <span className="font-medium tabular-nums text-slate-700">{quando}</span>
      </p>
      <p className="mt-0.5 break-words">
        {e.autor ? <>por <span className="font-medium text-slate-700">{e.autor}</span></> : "autor não registrado"}
        {onde ? <> · pela <span className="font-medium text-slate-700">{onde}</span></> : null}
      </p>
    </div>
  );
}
function HistoricoDaVaga({ historico, carregando }: { historico: EntradaDoHistorico[] | undefined; carregando: boolean }) {
  const grupos = (historico ?? []).reduce<{ dia: string; itens: EntradaDoHistorico[] }[]>((acc, e) => {
    const dia = e.diaFixo ?? ymdLocal(new Date(e.at));
    const ultimo = acc[acc.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.itens.push(e);
    else acc.push({ dia, itens: [e] });
    return acc;
  }, []);
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-slate-400" aria-hidden="true" />
        <span className="text-[12px] font-semibold text-slate-600 uppercase tracking-[0.06em]">Histórico</span>
        {historico && historico.length > 0 && (
          <span className="text-[11px] text-muted-foreground">{historico.length} {historico.length === 1 ? "registro" : "registros"}</span>
        )}
      </div>
      {!carregando && <CriacaoDaVaga historico={historico} />}
      {carregando ? (
        <EsqueletoHistorico linhas={4} />
      ) : !historico || historico.length === 0 ? (
        <div className="bg-background rounded-lg border border-dashed border-border text-center py-8">
          <History className="w-6 h-6 text-slate-200 mx-auto mb-2" aria-hidden="true" />
          <div className="text-[12px] text-muted-foreground">Nenhum registro desta vaga.</div>
        </div>
      ) : (
        <ol className="max-h-[480px] overflow-y-auto pr-1 space-y-4" aria-label="Histórico da vaga" data-testid="historico-da-vaga">
          {grupos.map((g) => (
            <li key={g.dia}>
              <p className="sticky top-0 z-10 bg-background/95 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{rotuloDoDia(g.dia)}</p>
              <ol className="mt-1 space-y-1.5 border-l border-slate-200 ml-1.5 pl-3.5">
                {g.itens.map((e) => {
                  const meta = CATEGORIA_META[e.categoria] ?? CATEGORIA_META.alteracao;
                  const hora = e.diaFixo ? null : new Date(e.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <li key={e.id} className="relative rounded-lg border border-slate-100 bg-card px-3 py-2" data-testid={`historico-${e.id}`}>
                      <span className={`absolute -left-[19px] top-3 h-2 w-2 rounded-full ring-2 ring-white ${meta.ponto}`} aria-hidden="true" />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${meta.chip}`}>{meta.rotulo}</span>
                        <span className="text-[12px] font-semibold text-slate-800 break-words">{e.titulo}</span>
                        <span className="ml-auto text-[11px] tabular-nums text-slate-500 whitespace-nowrap">{hora ?? "dia"}</span>
                      </div>
                      {e.detalhe && <p className="mt-0.5 text-[11px] text-slate-600 break-words">{e.detalhe}</p>}
                      {e.linhas.length > 0 && (
                        <ul className="mt-0.5 space-y-0.5 text-[11px] text-slate-600">
                          {e.linhas.map((l) => <li key={l} className="break-words">{l}</li>)}
                        </ul>
                      )}
                      {e.comentario && (
                        <p className="mt-1 rounded-md border-l-2 border-slate-300 bg-slate-50 px-2 py-1 text-[11px] italic text-slate-600 break-words">“{e.comentario}”</p>
                      )}
                      {e.autor && <p className="mt-1 text-[11px] text-slate-500">por <span className="font-medium text-slate-700">{e.autor}</span></p>}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ══ ABA: HISTÓRICO ══
export function ComentariosTab({
  comments, historico, getUserName, newComment, setNewComment,
  addComment, canComment, canSend, carregando = false,
}: {
  comments: Comment[] | undefined;
  /** Linha do tempo completa da vaga (GET /api/team-inclusions/:id/timeline). */
  historico: EntradaDoHistorico[] | undefined;
  getUserName: (userId: string) => string;
  newComment: string;
  setNewComment: (v: string) => void;
  /** Não usados desde 14/09 (a linha do tempo mostra tudo, rolando). */
  showAllLogs?: boolean;
  setShowAllLogs?: (v: boolean) => void;
  addComment: ScalingMutations["addComment"];
  /** Pode escrever (não é read-only e é responsável pela função) */
  canComment: boolean;
  /** Pode enviar (não é read-only) */
  canSend: boolean;
  /**
   * Comentários e logs ainda estão no ar. Dizer "nenhum comentário" enquanto a
   * consulta corre é afirmar uma coisa que ainda não se sabe.
   */
  carregando?: boolean;
}) {
  return (
        <TabsContent value="comentarios" className="m-0 p-6">
          {/* Histórico com mais largura que os comentários (14/09): é onde está a
              linha do tempo inteira da vaga. */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <span className="text-[12px] font-semibold text-slate-600 uppercase tracking-[0.06em]">Comentários</span>
                {comments && comments.length > 0 && (
                  <span className="bg-primary text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">{comments.length}</span>
                )}
              </div>
              {carregando ? (
                <EsqueletoHistorico />
              ) : comments && comments.length > 0 ? (
                <div className="space-y-2 max-h-[232px] overflow-y-auto pr-1">
                  {comments.map((comment) => (
                    <div key={comment.id} className="bg-card border border-border p-3 rounded-lg">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                            {getUserName(comment.userId).charAt(0).toUpperCase()}
                          </div>
                          <div className="text-[12px] font-semibold text-slate-700">{getUserName(comment.userId)}</div>
                        </div>
                        <div className="text-[11px] text-muted-foreground shrink-0 ml-2">{formatDateTime(comment.createdAt)}</div>
                      </div>
                      <div className="text-[12px] text-slate-600 leading-relaxed">{comment.content}</div>
                      {comment.phase && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-50">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted-foreground">{getPhaseLabel(comment.phase)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-background rounded-lg border border-dashed border-border text-center py-8">
                  <MessageSquare className="w-6 h-6 text-slate-200 mx-auto mb-2" aria-hidden="true" />
                  <div className="text-[12px] text-muted-foreground">Nenhum comentário registrado.</div>
                </div>
              )}
              <div className="pt-1 space-y-2">
                <Textarea
                  rows={2}
                  placeholder="Escreva um comentário..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="w-full border border-border rounded-lg bg-card text-[13px] p-3 resize-none min-h-[70px] focus:ring-[3px] focus:ring-primary/12 focus:border-primary transition-all"
                  data-testid="textarea-comment-inline"
                  disabled={!canComment}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => { if (newComment.trim()) addComment.mutate(newComment.trim(), { onSuccess: () => setNewComment("") }); }}
                    disabled={addComment.isPending || !newComment.trim() || !canSend}
                    className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 h-9 text-sm font-medium"
                    data-testid="button-add-comment-inline"
                  >
                    <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    {addComment.isPending ? "Enviando..." : "Enviar"}
                  </Button>
                </div>
              </div>
            </div>

            <HistoricoDaVaga historico={historico} carregando={carregando} />
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
      <div className={lbl}>{label}</div>
      <div className={cls}>{value}</div>
    </div>
  );
  /**
   * Partida e CHEGADA lado a lado. A chegada é o dado que decide almoço,
   * jantar e transfer de madrugada — estava gravada e não aparecia aqui.
   */
  const horarios = (partida: string | null | undefined, chegada: string | null | undefined) => (
    <div className="flex gap-2">
      {[
        { rotulo: "Partida", valor: partida },
        { rotulo: "Chegada", valor: chegada },
      ].map(({ rotulo, valor }) => (
        <div key={rotulo} className="flex-1 min-w-0">
          <div className={lbl}>{rotulo}</div>
          <div
            className={`rounded-lg px-3 py-1.5 border-l-[3px] ${valor ? "bg-[#ECFDF5] border-l-[#10B981]" : "bg-background border-l-slate-200"}`}
          >
            <span className={`text-[17px] font-semibold tabular-nums ${valor ? "text-[#047857]" : "text-slate-300"}`}>
              {valor || "--:--"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
  const hasReturn = !!(t.actualReturnDate || t.actualReturnTime || t.returnCityOrigin || t.returnCityDestination);
  const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 flex items-center gap-3">
          <span className="text-xl" aria-hidden="true">{isVan ? "🚐" : isRodo ? "🚌" : "✈️"}</span>
          <div>
            <div className="text-[11px] font-semibold text-primary uppercase tracking-[0.06em]">
              {isVan ? "Van" : isRodo ? "Transporte rodoviário" : "Passagem aérea"}
            </div>
            {t.purchaseDate && <div className="text-[12px] text-muted-foreground mt-0.5">Comprada em {formatDate(t.purchaseDate)}</div>}
          </div>
          {t.purchaseDate && (
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 bg-[#ECFDF5] text-[#047857] text-[11px] font-semibold rounded-md">✓ Comprada</span>
          )}
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-x-8 gap-y-3">
          {t.purchaseOrderNumber && (
            <div>
              <div className={lbl}>{isVan ? "Empresa / OC" : isRodo ? "Bilhete" : "Ordem de compra"}</div>
              <div className="text-[13px] font-semibold text-slate-700 font-mono">{t.purchaseOrderNumber}</div>
            </div>
          )}
          {/* Localizador, companhia e valor estavam gravados e invisíveis nesta
              tela: quem precisava deles tinha de abrir Passagens. */}
          {t.locator && (
            <div>
              <div className={lbl}>Localizador</div>
              <div className="text-[13px] font-semibold text-slate-700 font-mono uppercase">{t.locator}</div>
            </div>
          )}
          {t.ticketCompany && (
            <div>
              <div className={lbl}>Companhia</div>
              <div className={val}>{t.ticketCompany}</div>
            </div>
          )}
          {typeof t.value === "number" && t.value > 0 && (
            <div>
              <div className={lbl}>Valor</div>
              <div className={val}>{brl(t.value)}</div>
            </div>
          )}
          {t.cardLastFourDigits && (
            <div>
              <div className={lbl}>Cartão</div>
              <div className="text-[13px] font-semibold text-slate-700 font-mono">•••• {t.cardLastFourDigits}</div>
            </div>
          )}
        </div>
      </div>

      {isVan ? (
        t.ticketObservations ? (
          <div className="bg-background border border-border rounded-xl p-4">
            <div className={lbl}>Observações</div>
            <div className="text-sm text-slate-700 whitespace-pre-line">{t.ticketObservations}</div>
          </div>
        ) : null
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-3 flex items-center gap-1.5 text-primary">{isRodo ? "🚌" : "🛫"} Ida</div>
            <div className="space-y-2.5">
              {isRodo && t.departureAirport && field("Rodoviária de origem", t.departureAirport)}
              {t.departureCityOrigin && field("Cidade de origem", t.departureCityOrigin)}
              {isAereo && t.departureAirport && field("Aeroporto de origem", t.departureAirport)}
              {isRodo && t.destinationAirport && field("Rodoviária de destino", t.destinationAirport)}
              {t.departureCityDestination && field("Cidade de destino", t.departureCityDestination)}
              {isAereo && t.destinationAirport && field("Aeroporto de destino", t.destinationAirport)}
              {t.actualDepartureDate && field("Data", formatDate(t.actualDepartureDate), "text-sm font-semibold text-primary")}
              {horarios(t.actualDepartureTime, t.actualArrivalTime)}
            </div>
          </div>
          {hasReturn ? (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-3 flex items-center gap-1.5 text-primary">{isRodo ? "🚌" : "🛬"} Volta</div>
              <div className="space-y-2.5">
                {isRodo && t.returnOriginAirport && field("Rodoviária de origem", t.returnOriginAirport)}
                {t.returnCityOrigin && field("Cidade de origem", t.returnCityOrigin)}
                {isAereo && t.returnOriginAirport && field("Aeroporto de origem", t.returnOriginAirport, "text-sm font-semibold text-slate-700 uppercase font-mono")}
                {isRodo && t.returnDestinationAirport && field("Rodoviária de destino", t.returnDestinationAirport)}
                {t.returnCityDestination && field("Cidade de destino", t.returnCityDestination)}
                {isAereo && t.returnDestinationAirport && field("Aeroporto de destino", t.returnDestinationAirport, "text-sm font-semibold text-slate-700 uppercase font-mono")}
                {t.actualReturnDate && field("Data", formatDate(t.actualReturnDate), "text-sm font-semibold text-primary")}
                {horarios(t.actualReturnTime, t.returnArrivalTime)}
              </div>
            </div>
          ) : (
            <div className="bg-background border border-dashed border-border rounded-xl p-4 flex items-center justify-center">
              <div className="text-center">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1">{isRodo ? "🚌" : "🛬"} Volta</div>
                <div className="text-xs text-slate-400">Sem informações de volta</div>
              </div>
            </div>
          )}
        </div>
      )}

      {t.ticketObservations && !isVan && (
        <div className="bg-background border border-border rounded-xl p-4">
          <div className={lbl}>Observações</div>
          <div className="text-sm text-slate-700 whitespace-pre-line">{t.ticketObservations}</div>
        </div>
      )}

      <div>
        <div className={lbl}>Anexos</div>
        {renderAttachments(t.attachmentIds, "Passagem")}
      </div>
    </div>
  );
}
