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
 * - O histórico tem esqueleto próprio: comentários e logs vêm de outra
 *   consulta, e mostrar "nenhum comentário" enquanto ela ainda está no ar é
 *   afirmar uma coisa que não se sabe.
 *
 * 07/10 — cada trecho virou um "bilhete": partida → chegada lado a lado, com o
 * terminal (aeroporto/rodoviária) e a cidade embaixo de cada horário — o que
 * antes era uma coluna de oito pares rótulo/valor empilhados. Os emojis
 * (🛫 🛬 🚌 🚐 ✈️ ✓ 🏨) viraram ícones do sistema. O valor da diária do hotel saía
 * "R$ 400.00" (ponto); agora sai em reais.
 */
import type { ReactNode } from "react";
import {
  BedDouble, Bus, CalendarDays, CheckCircle2, CreditCard, History, MapPin, MessageSquare,
  Paperclip, Plane, PlaneLanding, PlaneTakeoff, Send, StickyNote, Truck,
} from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { PassagensDeHistorico } from "@/components/tickets/passagens-de-historico";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { TeamInclusion, Ticket, Accommodation, Comment } from "@shared/schema";
import type { CategoriaDoHistorico, EntradaDoHistorico } from "@shared/inclusion-timeline";
import {
  formatDate, formatDateWithWeekday, formatSuggestionDate, formatDateTime,
  extractTravelInfoFromObservations, getPhaseLabel,
} from "./scaling-utils";
import type { ScalingMutations } from "./use-scaling-mutations";
import { formatarMoeda } from "@/lib/format";
import { Secao } from "./inclusion-details/details-shared";

type RenderAttachments = (ids: string[] | null | undefined, label: string) => ReactNode;

/** Estado vazio de aba — a causa sempre escrita junto. */
function AbaVazia({ icone, titulo, texto, tom = "neutro" }: {
  icone: ReactNode; titulo: string; texto: string; tom?: "neutro" | "pendente";
}) {
  const pendente = tom === "pendente";
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-3 ${
        pendente ? "bg-warning-soft text-warning-strong" : "bg-muted text-muted-foreground"
      }`}>
        {icone}
      </div>
      <div className="text-sm font-semibold mb-1 text-foreground">{titulo}</div>
      <div className="text-sm text-muted-foreground max-w-[420px]">{texto}</div>
    </div>
  );
}

/** Um dado curto do cabeçalho da passagem/hospedagem (rótulo em cima, valor embaixo). */
function Dado({ rotulo, children, mono = false }: { rotulo: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-muted-foreground">{rotulo}</dt>
      <dd className={`mt-0.5 truncate text-sm font-semibold text-foreground ${mono ? "font-mono uppercase" : ""}`}>{children}</dd>
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
        <TabsContent value="passagem" className="esc-entra m-0 p-3 sm:p-5 space-y-4">
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
              <Secao
                titulo="Datas sugeridas"
                icone={<CalendarDays aria-hidden="true" />}
                acessorio={<span className="text-2xs text-muted-foreground">da inclusão de equipe</span>}
              >
                {(() => {
                  const travelInfo = extractTravelInfoFromObservations(inclusion.observations || undefined, inclusion);
                  const showTime = (t: string) => (t !== "N/A" && t !== "Não definido" ? t : "—");
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { rotulo: "Ida", Icone: PlaneTakeoff, data: travelInfo.ida, hora: travelInfo.chegada },
                        { rotulo: "Volta", Icone: PlaneLanding, data: travelInfo.retorno, hora: travelInfo.horario },
                      ].map(({ rotulo, Icone, data, hora }) => (
                        <div key={rotulo} className="rounded-lg border border-border bg-surface-muted px-3 py-2.5">
                          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            <Icone className="h-3.5 w-3.5" aria-hidden="true" />{rotulo}
                          </p>
                          <dl className="mt-2 grid grid-cols-2 gap-3">
                            <Dado rotulo="Data">{formatSuggestionDate(data)}</Dado>
                            <Dado rotulo="Horário sugerido">{showTime(hora)}</Dado>
                          </dl>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </Secao>
            </div>
          ) : (
            <TicketDetails ticket={selectedTicket} renderAttachments={renderAttachments} />
          )}
          {/* Passagens de quem saiu numa troca aprovada + total da vaga (01/10). */}
          <PassagensDeHistorico teamInclusionId={inclusion.id} passagemAtualCentavos={selectedTicket?.value ?? null} />
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
        <TabsContent value="hospedagem" className="esc-entra m-0 p-3 sm:p-5">
          {!inclusion.needsAccommodation ? (
            <AbaVazia
              icone={<BedDouble className="w-5 h-5" aria-hidden="true" />}
              titulo="Sem hospedagem necessária"
              texto="Esta escalação não requer reserva de hotel."
            />
          ) : !accommodation ? (
            <AbaVazia
              tom="pendente"
              icone={<BedDouble className="w-5 h-5" aria-hidden="true" />}
              titulo="Nenhuma hospedagem registrada"
              texto="Aguardando registro de hospedagem para esta escalação."
            />
          ) : (
            <div className="space-y-4">
              <Secao
                titulo={
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Hospedagem reservada
                    </span>
                    <span className="mt-0.5 truncate text-[15px] font-semibold text-foreground">{accommodation.hotelName || "Hotel não informado"}</span>
                  </span>
                }
                icone={<BedDouble className="text-success" aria-hidden="true" />}
                acessorio={accommodation.reservationNumber && (
                  <span className="shrink-0 rounded-md border border-border bg-surface-muted px-2 py-1 font-mono text-2xs font-semibold text-slate-600">
                    LOC {accommodation.reservationNumber}
                  </span>
                )}
              >
                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0">
                    <dt className="text-2xs text-muted-foreground">Check-in</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-foreground">
                      {accommodation.checkInDate ? formatDateWithWeekday(accommodation.checkInDate) : "Não informado"}
                      {accommodation.checkInTime && <span className="font-normal text-slate-600"> às {accommodation.checkInTime}</span>}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-2xs text-muted-foreground">Check-out</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-foreground">
                      {accommodation.checkOutDate ? formatDateWithWeekday(accommodation.checkOutDate) : "Não informado"}
                      {accommodation.checkOutTime && <span className="font-normal text-slate-600"> às {accommodation.checkOutTime}</span>}
                    </dd>
                  </div>
                  {accommodation.hotelLocation && (
                    <div className="min-w-0">
                      <dt className="text-2xs text-muted-foreground">Localização</dt>
                      <dd className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 break-words">{accommodation.hotelLocation}</span>
                      </dd>
                    </div>
                  )}
                  {accommodation.dailyRate ? (
                    <Dado rotulo="Valor da diária">{formatarMoeda(accommodation.dailyRate)}</Dado>
                  ) : null}
                </dl>
                {accommodation.accommodationObservations && (
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="flex items-center gap-1.5 text-2xs text-muted-foreground"><StickyNote className="h-3.5 w-3.5" aria-hidden="true" />Observações</p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-line">{accommodation.accommodationObservations}</p>
                  </div>
                )}
              </Secao>
              <Secao titulo="Anexos" icone={<Paperclip aria-hidden="true" />} corpo="p-3">
                {renderAttachments(accommodation.attachmentIds, "Hospedagem")}
              </Secao>
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
        <div key={i} className="rounded-lg border border-border bg-card px-3 py-2.5 space-y-2">
          <div className="esc-osso h-3" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
          <div className="esc-osso h-2.5 w-1/3" />
        </div>
      ))}
    </div>
  );
}

// ══ Linha do tempo da vaga (14/09) ══

/** Uma cor por categoria — a pílula diz DE ONDE veio o acontecimento. */
const CATEGORIA_META: Record<CategoriaDoHistorico, { rotulo: string; ponto: string; chip: string }> = {
  vaga: { rotulo: "Vaga", ponto: "bg-slate-400", chip: "bg-muted text-slate-600" },
  escala: { rotulo: "Escala", ponto: "bg-primary", chip: "bg-brand-soft text-primary" },
  aprovacao: { rotulo: "Aprovação", ponto: "bg-success-strong", chip: "bg-success-soft text-success" },
  passagem: { rotulo: "Passagem", ponto: "bg-primary", chip: "bg-brand-soft text-primary" },
  hospedagem: { rotulo: "Hospedagem", ponto: "bg-info-strong", chip: "bg-info-soft text-info" },
  troca: { rotulo: "Troca", ponto: "bg-warning-strong", chip: "bg-warning-soft text-warning" },
  pedido: { rotulo: "Pedido", ponto: "bg-primary", chip: "bg-brand-soft text-primary" },
  alteracao: { rotulo: "Alteração", ponto: "bg-slate-300", chip: "bg-muted text-slate-600" },
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
 * Quem criou a vaga, por onde e quando (dono, 14/09) — fixo no topo do
 * Histórico. A criação é a entrada mais antiga e ficava no fim da rolagem;
 * quem abre a aba quer essa resposta primeiro.
 */
function CriacaoDaVaga({ historico }: { historico: EntradaDoHistorico[] | undefined }) {
  if (!historico || historico.length === 0) return null;
  const e = historico.find((x) => x.id === "vaga-criada" || (x.categoria === "vaga" && x.titulo.startsWith("Vaga criada")));
  if (!e) {
    return (
      <p className="mb-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground" data-testid="historico-criacao">
        A criação desta vaga não ficou registrada.
      </p>
    );
  }
  const quando = new Date(e.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const onde = e.detalhe ? e.detalhe.replace(/^Pela\s+/i, "") : null;
  return (
    <div className="mb-3 rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-slate-600" data-testid="historico-criacao">
      <p>
        <span className="font-semibold text-foreground">{e.titulo}</span> em{" "}
        <span className="font-medium tabular-nums text-slate-700">{quando}</span>
      </p>
      <p className="mt-0.5 break-words">
        {e.autor ? <>por <span className="font-medium text-slate-700">{e.autor}</span></> : "autor não registrado"}
        {onde ? <> · pela <span className="font-medium text-slate-700">{onde}</span></> : null}
      </p>
    </div>
  );
}

/**
 * O que aconteceu com a vaga, do mais recente para o mais antigo, agrupado por
 * dia. Cada entrada: categoria, o que aconteceu, o detalhe, o comentário (em
 * destaque, separado) e quem fez. Rola dentro da coluna — nada fica escondido
 * atrás de "Ver todos".
 */
function HistoricoDaVaga({ historico, carregando }: { historico: EntradaDoHistorico[] | undefined; carregando: boolean }) {
  const grupos = (historico ?? []).reduce<{ dia: string; itens: EntradaDoHistorico[] }[]>((acc, e) => {
    const dia = e.diaFixo ?? ymdLocal(new Date(e.at));
    const ultimo = acc[acc.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.itens.push(e);
    else acc.push({ dia, itens: [e] });
    return acc;
  }, []);
  return (
    <Secao
      titulo="Histórico"
      icone={<History aria-hidden="true" />}
      acessorio={historico && historico.length > 0 && (
        <span className="text-2xs tabular-nums text-muted-foreground">{historico.length} {historico.length === 1 ? "registro" : "registros"}</span>
      )}
    >
      {!carregando && <CriacaoDaVaga historico={historico} />}
      {carregando ? (
        <EsqueletoHistorico linhas={4} />
      ) : !historico || historico.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-8 text-center">
          <History className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div className="text-sm text-muted-foreground">Nenhum registro desta vaga.</div>
        </div>
      ) : (
        <ol className="max-h-[440px] overflow-y-auto pr-1 space-y-4" aria-label="Histórico da vaga" data-testid="historico-da-vaga">
          {grupos.map((g) => (
            <li key={g.dia}>
              <p className="sticky top-0 z-10 bg-card/95 py-1 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{rotuloDoDia(g.dia)}</p>
              <ol className="mt-1 space-y-1.5 border-l border-border ml-1.5 pl-3.5">
                {g.itens.map((e) => {
                  const meta = CATEGORIA_META[e.categoria] ?? CATEGORIA_META.alteracao;
                  const hora = e.diaFixo ? null : new Date(e.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <li key={e.id} className="relative rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-surface-muted" data-testid={`historico-${e.id}`}>
                      <span className={`absolute -left-[19px] top-3 h-2 w-2 rounded-full ring-2 ring-card ${meta.ponto}`} aria-hidden="true" />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={`rounded px-1.5 py-px text-2xs font-semibold uppercase tracking-wide ${meta.chip}`}>{meta.rotulo}</span>
                        <span className="text-xs font-semibold text-foreground break-words">{e.titulo}</span>
                        <span className="ml-auto text-2xs tabular-nums text-muted-foreground whitespace-nowrap">{hora ?? "dia"}</span>
                      </div>
                      {/* `whitespace-pre-line`: o log de validação traz a observação da área numa linha própria ("Observação: …"). */}
                      {e.detalhe && <p className="mt-0.5 text-xs text-slate-600 whitespace-pre-line break-words">{e.detalhe}</p>}
                      {e.linhas.length > 0 && (
                        <ul className="mt-0.5 space-y-0.5 text-xs text-slate-600">
                          {e.linhas.map((l) => <li key={l} className="break-words">{l}</li>)}
                        </ul>
                      )}
                      {e.comentario && (
                        <p className="mt-1 rounded-md border-l-2 border-slate-300 bg-surface-muted px-2 py-1 text-xs italic text-slate-600 break-words">“{e.comentario}”</p>
                      )}
                      {e.autor && <p className="mt-1 text-2xs text-muted-foreground">por <span className="font-medium text-slate-700">{e.autor}</span></p>}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </Secao>
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
  const enviar = () => { if (newComment.trim()) addComment.mutate(newComment.trim(), { onSuccess: () => setNewComment("") }); };
  const podeEnviar = !addComment.isPending && !!newComment.trim() && canSend;
  return (
        <TabsContent value="comentarios" className="esc-entra m-0 p-3 sm:p-5">
          {/* Histórico com mais largura que os comentários (14/09): é onde está a
              linha do tempo inteira da vaga. */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-4">
            <Secao
              titulo="Comentários"
              icone={<MessageSquare aria-hidden="true" />}
              acessorio={comments && comments.length > 0 && (
                <span className="rounded-full bg-brand-soft px-1.5 py-px text-2xs font-semibold tabular-nums text-primary">{comments.length}</span>
              )}
              corpo="p-4 space-y-3"
            >
              {carregando ? (
                <EsqueletoHistorico />
              ) : comments && comments.length > 0 ? (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {comments.map((comment) => (
                    <div key={comment.id} className="rounded-lg border border-border bg-surface-muted p-3">
                      <div className="flex justify-between items-center gap-2 mb-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-brand-soft text-primary flex items-center justify-center text-2xs font-bold shrink-0" aria-hidden="true">
                            {getUserName(comment.userId).charAt(0).toUpperCase()}
                          </div>
                          <div className="truncate text-xs font-semibold text-foreground">{getUserName(comment.userId)}</div>
                        </div>
                        <div className="text-2xs text-muted-foreground tabular-nums shrink-0">{formatDateTime(comment.createdAt)}</div>
                      </div>
                      <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line break-words">{comment.content}</div>
                      {comment.phase && (
                        <div className="mt-2">
                          <span className="bg-card border border-border px-1.5 py-0.5 rounded text-2xs font-medium text-muted-foreground">{getPhaseLabel(comment.phase)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border py-6 text-center">
                  <MessageSquare className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <div className="text-sm text-muted-foreground">Nenhum comentário registrado.</div>
                </div>
              )}
              <div className="space-y-2">
                <Textarea
                  rows={2}
                  placeholder={canComment ? "Escreva um comentário…" : "Só quem responde pela função comenta aqui."}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  // Ctrl/⌘ + Enter envia (07/10) — o Enter sozinho continua quebrando linha.
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && podeEnviar) { e.preventDefault(); enviar(); } }}
                  className="w-full border border-border rounded-lg bg-card text-sm p-3 resize-none min-h-[72px] focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:ring-offset-0 focus-visible:border-primary transition-[border-color,box-shadow]"
                  data-testid="textarea-comment-inline"
                  aria-label="Novo comentário"
                  disabled={!canComment}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="hidden text-2xs text-muted-foreground sm:inline">{canComment ? "Ctrl + Enter envia" : ""}</span>
                  <Button
                    onClick={enviar}
                    disabled={!podeEnviar}
                    className="ml-auto flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg px-4 h-9 text-sm font-semibold"
                    data-testid="button-add-comment-inline"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    {addComment.isPending ? "Enviando…" : "Enviar"}
                  </Button>
                </div>
              </div>
            </Secao>

            <HistoricoDaVaga historico={historico} carregando={carregando} />
          </div>
        </TabsContent>
  );
}

// ── Aba Passagem: passagem registrada ───────────────────────────────────────

/** Um lado do trecho: horário grande, terminal (aeroporto/rodoviária) e cidade. */
function Ponta({ papel, hora, terminal, rotuloTerminal, cidade, rotuloCidade, alinhar = "esquerda", codigo = false }: {
  papel: "Partida" | "Chegada";
  hora: string | null | undefined;
  terminal?: string | null;
  rotuloTerminal?: string;
  cidade?: string | null;
  rotuloCidade: string;
  alinhar?: "esquerda" | "direita";
  /** Aeroporto: código em mono/caixa alta. Rodoviária: nome por extenso. */
  codigo?: boolean;
}) {
  const dir = alinhar === "direita" ? "text-right items-end" : "items-start";
  return (
    <div className={`flex min-w-0 flex-col ${dir}`}>
      <span className="text-2xs text-muted-foreground">{papel}</span>
      <span className={`text-2xl font-semibold leading-8 tabular-nums tracking-[-0.02em] ${hora ? "text-foreground" : "text-muted-foreground/60"}`}>
        {hora || "--:--"}
      </span>
      {terminal && (
        <span className={`max-w-full break-words text-sm font-semibold text-slate-700 ${codigo ? "font-mono uppercase" : ""}`} title={rotuloTerminal}>
          <span className="sr-only">{rotuloTerminal}: </span>{terminal}
        </span>
      )}
      {cidade && (
        <span className="max-w-full break-words text-xs text-muted-foreground" title={rotuloCidade}>
          <span className="sr-only">{rotuloCidade}: </span>{cidade}
        </span>
      )}
    </div>
  );
}

function Trecho({ rotulo, Icone, IconeMeio, data, partida, chegada }: {
  rotulo: "Ida" | "Volta";
  Icone: typeof Plane;
  IconeMeio: typeof Plane;
  data: string | null;
  partida: Parameters<typeof Ponta>[0];
  chegada: Parameters<typeof Ponta>[0];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-primary">
          <Icone className="h-3.5 w-3.5" aria-hidden="true" />{rotulo}
        </p>
        {data && <p className="text-sm font-semibold tabular-nums text-primary"><span className="sr-only">Data: </span>{data}</p>}
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
        <Ponta {...partida} />
        <div className="flex h-8 items-center gap-1 pt-4 text-muted-foreground" aria-hidden="true">
          <span className="h-px w-5 bg-border sm:w-8" />
          <IconeMeio className="h-4 w-4" />
          <span className="h-px w-5 bg-border sm:w-8" />
        </div>
        <Ponta {...chegada} alinhar="direita" />
      </div>
    </div>
  );
}

function TicketDetails({ ticket, renderAttachments }: {
  ticket: Ticket;
  renderAttachments: (ids: string[] | null | undefined, label: string) => ReactNode;
}) {
  const t = ticket as typeof ticket & { returnOriginAirport?: string | null; returnDestinationAirport?: string | null };
  const isVan = t.transportType === "van";
  const isRodo = t.transportType === "rodoviario";
  const isAereo = t.transportType === "aereo";
  const hasReturn = !!(t.actualReturnDate || t.actualReturnTime || t.returnCityOrigin || t.returnCityDestination);
  const brl = formatarMoeda;
  const IconeTipo = isVan ? Truck : isRodo ? Bus : Plane;
  // O terminal só aparece quando é do tipo certo — a mesma regra de antes:
  // rodoviária no ônibus, aeroporto no avião.
  const terminal = (valor: string | null | undefined) => (isRodo || isAereo ? valor : null);

  return (
    <div className="space-y-4">
      <Secao
        titulo={
          <span className="flex min-w-0 flex-col">
            <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-primary">
              {isVan ? "Van" : isRodo ? "Transporte rodoviário" : "Passagem aérea"}
            </span>
            {t.purchaseDate && <span className="mt-0.5 text-xs font-normal text-muted-foreground">Comprada em {formatDate(t.purchaseDate)}</span>}
          </span>
        }
        icone={<IconeTipo className="text-primary" aria-hidden="true" />}
        acessorio={t.purchaseDate && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-2xs font-semibold text-success">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />Comprada
          </span>
        )}
      >
        {(t.purchaseOrderNumber || t.locator || t.ticketCompany || (typeof t.value === "number" && t.value > 0) || t.cardLastFourDigits) ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            {t.purchaseOrderNumber && <Dado rotulo={isVan ? "Empresa / OC" : isRodo ? "Bilhete" : "Ordem de compra"} mono>{t.purchaseOrderNumber}</Dado>}
            {/* Localizador, companhia e valor estavam gravados e invisíveis nesta
                tela: quem precisava deles tinha de abrir Passagens. */}
            {t.locator && <Dado rotulo="Localizador" mono>{t.locator}</Dado>}
            {t.ticketCompany && <Dado rotulo="Companhia">{t.ticketCompany}</Dado>}
            {typeof t.value === "number" && t.value > 0 && <Dado rotulo="Valor">{brl(t.value)}</Dado>}
            {t.cardLastFourDigits && (
              <Dado rotulo="Cartão">
                <span className="inline-flex items-center gap-1.5 font-mono"><CreditCard className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />•••• {t.cardLastFourDigits}</span>
              </Dado>
            )}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Sem dados de compra registrados.</p>
        )}
      </Secao>

      {isVan ? (
        t.ticketObservations ? (
          <Secao titulo="Observações" icone={<StickyNote aria-hidden="true" />}>
            <p className="text-sm text-slate-700 whitespace-pre-line">{t.ticketObservations}</p>
          </Secao>
        ) : null
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Trecho
            rotulo="Ida"
            Icone={isRodo ? Bus : PlaneTakeoff}
            IconeMeio={isRodo ? Bus : Plane}
            data={t.actualDepartureDate ? formatDate(t.actualDepartureDate) : null}
            partida={{
              papel: "Partida", hora: t.actualDepartureTime,
              terminal: terminal(t.departureAirport), rotuloTerminal: isRodo ? "Rodoviária de origem" : "Aeroporto de origem",
              cidade: t.departureCityOrigin, rotuloCidade: "Cidade de origem", codigo: isAereo,
            }}
            chegada={{
              papel: "Chegada", hora: t.actualArrivalTime,
              terminal: terminal(t.destinationAirport), rotuloTerminal: isRodo ? "Rodoviária de destino" : "Aeroporto de destino",
              cidade: t.departureCityDestination, rotuloCidade: "Cidade de destino", codigo: isAereo,
            }}
          />
          {hasReturn ? (
            <Trecho
              rotulo="Volta"
              Icone={isRodo ? Bus : PlaneLanding}
              IconeMeio={isRodo ? Bus : Plane}
              data={t.actualReturnDate ? formatDate(t.actualReturnDate) : null}
              partida={{
                papel: "Partida", hora: t.actualReturnTime,
                terminal: terminal(t.returnOriginAirport), rotuloTerminal: isRodo ? "Rodoviária de origem" : "Aeroporto de origem",
                cidade: t.returnCityOrigin, rotuloCidade: "Cidade de origem", codigo: isAereo,
              }}
              chegada={{
                papel: "Chegada", hora: t.returnArrivalTime,
                terminal: terminal(t.returnDestinationAirport), rotuloTerminal: isRodo ? "Rodoviária de destino" : "Aeroporto de destino",
                cidade: t.returnCityDestination, rotuloCidade: "Cidade de destino", codigo: isAereo,
              }}
            />
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-card p-4">
              <div className="text-center">
                <p className="flex items-center justify-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {isRodo ? <Bus className="h-3.5 w-3.5" aria-hidden="true" /> : <PlaneLanding className="h-3.5 w-3.5" aria-hidden="true" />}Volta
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Sem informações de volta</p>
              </div>
            </div>
          )}
        </div>
      )}

      {t.ticketObservations && !isVan && (
        <Secao titulo="Observações" icone={<StickyNote aria-hidden="true" />}>
          <p className="text-sm text-slate-700 whitespace-pre-line">{t.ticketObservations}</p>
        </Secao>
      )}

      <Secao titulo="Anexos" icone={<Paperclip aria-hidden="true" />} corpo="p-3">
        {renderAttachments(t.attachmentIds, "Passagem")}
      </Secao>
    </div>
  );
}

