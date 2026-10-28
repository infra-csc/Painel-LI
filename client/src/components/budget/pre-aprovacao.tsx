/**
 * Pré-aprovação do DP no Planejado — Módulo de Honorários, Fase 0 (26/10).
 *
 * Ata de 22/10: "nenhum registro é liberado para a Produção sem a
 * pré-aprovação do DP". Liberar para a Produção, no app, é o "Enviar ao
 * Realizado" (cria a prestação que o responsável da função preenche). Agora:
 *   calcular → PRÉ-APROVAR (DP, com quem e quando) → enviar ao Realizado.
 * A regra pura (estado de cada vaga, o que conta como mudança de valor) é a
 * de shared/pre-aprovacao.ts — a mesma do servidor, que recusa o envio sem a
 * pré-aprovação (409) e devolve a linha a pendente quando o valor muda.
 *
 * Aqui: o que é gravado (`valoresParaGravar`, o MESMO do envio — por isso o
 * envio logo depois não "muda" o valor pré-aprovado), o selo da linha, o
 * diálogo de pré-aprovar (linha, seleção ou o evento inteiro, com a prévia do
 * total), o de desfazer e o interruptor "não exibir valores" do evento.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, EyeOff, History, Loader2, PencilLine, RotateCcw, Undo2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import type { BudgetPlanned, Event } from "@shared/schema";
import type { SituacaoDaPreAprovacao } from "@shared/pre-aprovacao";
import { dataDeCorteLegivel } from "@shared/legado-honorarios";
import { useDataDeCorte } from "@/components/honorarios/use-honorarios";
import { Chip } from "./budget-card";
import { formatCurrency, type CalculatedBudget } from "./types";
import { linhaDoPlanejado } from "@shared/budget-engine";

/** Linha do Planejado como o GET devolve (26/10: com o nome de quem pré-aprovou). */
export type PlanejadoDaTela = BudgetPlanned & { approvedByName?: string | null };

/**
 * Valores gravados no Planejado para a vaga — os MESMOS na pré-aprovação e no
 * envio ao Realizado. Dias = os que recebem diária (casa: só fds); a diária
 * gravada é a média ponderada do subtotal (o schema não guarda a de fds).
 */
export function valoresParaGravar(b: CalculatedBudget) {
  // 28/10 (revisão R4/R8): a MESMA linha do servidor (shared/budget-engine →
  // linhaDoPlanejado) — só os dias de 1,5 com valor e diária 0 sem dia de diária.
  return {
    collaboratorType: b.collaborator?.type || "freela",
    ...linhaDoPlanejado(b),
  };
}

/** "26/10/2026 às 14:32" */
export function quandoLegivel(d: Date | string | null | undefined): string {
  if (!d) return "";
  const data = new Date(d);
  if (Number.isNaN(data.getTime())) return "";
  return `${data.toLocaleDateString("pt-BR")} às ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "Pré-aprovado pelo DP — Maria Souza, 26/10/2026 às 14:32" */
export function quemPreAprovou(p: PlanejadoDaTela | undefined): string {
  if (!p?.approvedAt) return "Pré-aprovado pelo DP";
  return `Pré-aprovado pelo DP — ${p.approvedByName || "DP"}, ${quandoLegivel(p.approvedAt)}`;
}

/** Selo da pré-aprovação no cartão e na planilha (enviado e ausente têm os seus). */
export function SeloDaPreAprovacao({ situacao, planejado, compacto }: {
  situacao: SituacaoDaPreAprovacao;
  planejado: PlanejadoDaTela | undefined;
  compacto?: boolean;
}) {
  if (situacao === "pre_aprovado") {
    return (
      <Chip tom="ok" title={quemPreAprovou(planejado)}>
        <BadgeCheck className="w-3 h-3" aria-hidden="true" />{compacto ? "Pré-aprov." : "Pré-aprovado"}
      </Chip>
    );
  }
  if (situacao === "desatualizado") {
    return (
      <Chip tom="alerta" title={`${quemPreAprovou(planejado)} — mas o valor mudou depois (recálculo, ajuste manual ou honorário). Pré-aprove de novo para liberar.`}>
        <RotateCcw className="w-3 h-3" aria-hidden="true" />Valor mudou
      </Chip>
    );
  }
  if (situacao === "pendente") {
    return (
      <Chip tom="neutro" title="Falta a pré-aprovação do DP — sem ela a vaga não vai para o Realizado">
        <Clock className="w-3 h-3" aria-hidden="true" />{compacto ? "Pré-aprovar" : "A pré-aprovar"}
      </Chip>
    );
  }
  if (situacao === "legado") return <SeloDoFluxoAntigo />;
  return null;
}

/** Dica do selo "Fluxo antigo" (27/10), com a data de corte em vigor. */
export function dicaDoFluxoAntigo(dataDeCorte: string): string {
  return `Evento legado (terminou antes de ${dataDeCorteLegivel(dataDeCorte)}): vai ao Realizado sem pré-aprovação`;
}

/** Evento legado (27/10): selo discreto e neutro — a vaga vai ao Realizado pelo fluxo antigo. */
export function SeloDoFluxoAntigo({ className }: { className?: string }) {
  const { dataDeCorte } = useDataDeCorte();
  return (
    <Chip tom="neutro" title={dicaDoFluxoAntigo(dataDeCorte)} className={className}>
      <History className="w-3 h-3" aria-hidden="true" />Fluxo antigo
    </Chip>
  );
}

// ── Diálogo: pré-aprovar (linha, seleção ou evento) ─────────────────────────
export interface PedidoDePreAprovacao {
  /** As vagas que serão pré-aprovadas (já sem enviadas, ausentes e já pré-aprovadas). */
  alvos: CalculatedBudget[];
  origem: "linha" | "selecao" | "evento";
  /** O que fica de fora e por quê (só para dizer na prévia). */
  deFora: { enviados: number; ausentes: number; jaPreAprovados: number };
  /** "Recorte atual: função Montagem" — quando o lote do evento respeita filtros. */
  recorte?: string;
}

const LINHA = "flex items-center justify-between gap-3 px-4 py-2";

export function PreAprovarDialog({ pedido, onClose, onConfirm, pending, nomeDaVaga, getFunctionName, situacaoDe }: {
  pedido: PedidoDePreAprovacao | null;
  onClose: () => void;
  onConfirm: (alvos: CalculatedBudget[]) => void;
  pending: boolean;
  nomeDaVaga: (b: CalculatedBudget) => string;
  getFunctionName: (id?: string | null) => string;
  situacaoDe: (b: CalculatedBudget) => SituacaoDaPreAprovacao;
}) {
  const alvos = pedido?.alvos ?? [];
  const total = alvos.reduce((s, b) => s + b.totalFinal, 0);
  const um = alvos.length === 1 ? alvos[0] : null;
  const fora = pedido?.deFora;
  const textoFora = fora ? [
    fora.jaPreAprovados ? `${fora.jaPreAprovados} já ${fora.jaPreAprovados === 1 ? "pré-aprovado" : "pré-aprovados"}` : null,
    fora.enviados ? `${fora.enviados} já no Realizado` : null,
    fora.ausentes ? `${fora.ausentes} não ${fora.ausentes === 1 ? "participou" : "participaram"}` : null,
  ].filter(Boolean).join(" · ") : "";
  return (
    <AlertDialog open={!!pedido} onOpenChange={(v) => { if (!pending && !v) onClose(); }}>
      <AlertDialogContent className="max-w-[480px] w-[95vw] p-0 gap-0 rounded-xl overflow-hidden" data-testid="dialogo-pre-aprovar">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-success-soft text-success shrink-0" aria-hidden="true">
            <BadgeCheck className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0 pt-0.5">
            <AlertDialogTitle className="m-0 text-base font-semibold leading-6 text-foreground">
              {um ? "Pré-aprovar este valor?" : `Pré-aprovar ${alvos.length} ${alvos.length === 1 ? "colaborador" : "colaboradores"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
              {um
                ? `${nomeDaVaga(um)} · ${getFunctionName(um.inclusion.functionId)}`
                : pedido?.origem === "evento" ? (pedido.recorte ? `Evento inteiro, no recorte atual (${pedido.recorte})` : "Todos os que faltam neste evento") : "Os selecionados que ainda pedem a pré-aprovação"}
            </AlertDialogDescription>
          </div>
        </div>

        {/* Prévia: quem e quanto — para conferir antes de assinar. */}
        <div className="mx-5 rounded-xl overflow-hidden border border-border">
          {um ? (
            <div className="divide-y divide-border">
              <div className={LINHA}><span className="text-xs text-slate-600">Diárias</span><span className="text-xs font-medium tabular-nums text-foreground">{formatCurrency(um.subtotalDiarias)}</span></div>
              <div className={LINHA}><span className="text-xs text-slate-600">Alimentação</span><span className="text-xs font-medium tabular-nums text-foreground">{formatCurrency(um.almocoSemana + um.jantarSemana + um.almocoFds + um.jantarFds)}</span></div>
              <div className={LINHA}><span className="text-xs text-slate-600">Mobilidade</span><span className="text-xs font-medium tabular-nums text-foreground">{formatCurrency(um.mobilidade)}</span></div>
            </div>
          ) : (
            <ul className="m-0 p-0 list-none max-h-[232px] overflow-y-auto divide-y divide-border" aria-label="Quem será pré-aprovado">
              {alvos.map((b) => (
                <li key={b.inclusion.id} className={LINHA}>
                  <span className="min-w-0 flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground truncate">{nomeDaVaga(b)}</span>
                    <span className="text-2xs text-muted-foreground truncate">{getFunctionName(b.inclusion.functionId)}</span>
                    {b.hasOverride && <PencilLine className="w-3 h-3 shrink-0 text-warning" aria-label="com ajuste manual" />}
                    {situacaoDe(b) === "desatualizado" && <RotateCcw className="w-3 h-3 shrink-0 text-warning" aria-label="valor mudou desde a pré-aprovação" />}
                  </span>
                  <span className="text-xs tabular-nums text-slate-700 shrink-0">{formatCurrency(b.totalFinal)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border bg-success-soft/60">
            <span className="text-xs font-medium text-slate-700">
              Total pré-aprovado{!um && <span className="text-muted-foreground font-normal"> · {alvos.length} {alvos.length === 1 ? "pessoa" : "pessoas"}</span>}
            </span>
            <span className="text-base font-semibold tabular-nums text-success" data-testid="pre-aprovar-total">{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="px-5 pt-3 pb-4 space-y-1.5 text-xs leading-5 text-muted-foreground">
          {textoFora && <p className="m-0" data-testid="pre-aprovar-de-fora">Ficam de fora: {textoFora}.</p>}
          <p className="m-0">
            Fica registrado quem pré-aprovou e quando. Só o que tem a pré-aprovação do DP vai ao Realizado (é liberado para a Produção).{" "}
            <span className="text-foreground">Se o valor mudar depois — recálculo, ajuste manual ou honorário aprovado —, a linha volta a pedir a pré-aprovação.</span>
          </p>
        </div>

        <AlertDialogFooter className="px-5 py-3 border-t border-border bg-surface-muted gap-2 sm:space-x-0">
          <AlertDialogCancel disabled={pending} className="mt-0 h-9 rounded-lg text-sm">Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || alvos.length === 0}
            onClick={(e) => { e.preventDefault(); onConfirm(alvos); }}
            className="h-9 rounded-lg text-sm font-semibold gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground"
            data-testid="pre-aprovar-confirmar"
          >
            {pending
              ? <><Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Pré-aprovando…</>
              : <><BadgeCheck className="w-4 h-4" aria-hidden="true" />Pré-aprovar {formatCurrency(total)}</>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Diálogo: desfazer a pré-aprovação ───────────────────────────────────────
export function DesfazerPreAprovacaoDialog({ alvo, onClose, onConfirm, pending }: {
  alvo: { planejado: PlanejadoDaTela; nome: string; funcao: string; valor: number } | null;
  onClose: () => void;
  onConfirm: (plannedId: string) => void;
  pending: boolean;
}) {
  return (
    <AlertDialog open={!!alvo} onOpenChange={(v) => { if (!pending && !v) onClose(); }}>
      <AlertDialogContent className="max-w-[420px] w-[95vw] p-0 gap-0 rounded-xl overflow-hidden" data-testid="dialogo-desfazer-pre-aprovacao">
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-warning-soft text-warning shrink-0" aria-hidden="true">
            <Undo2 className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0 pt-0.5">
            <AlertDialogTitle className="m-0 text-base font-semibold leading-6 text-foreground">Desfazer a pré-aprovação?</AlertDialogTitle>
            <AlertDialogDescription className="m-0 mt-1 text-xs leading-5 text-muted-foreground">
              {alvo && <><span className="font-medium text-foreground">{alvo.nome}</span> · {alvo.funcao} · {formatCurrency(alvo.valor)}</>}
              <br />
              {alvo && quemPreAprovou(alvo.planejado)}. A linha volta a pedir a pré-aprovação do DP e não pode ir ao Realizado até lá. Fica registrado na auditoria.
            </AlertDialogDescription>
          </div>
        </div>
        <AlertDialogFooter className="px-5 py-3 border-t border-border bg-surface-muted gap-2 sm:space-x-0">
          <AlertDialogCancel disabled={pending} className="mt-0 h-9 rounded-lg text-sm">Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || !alvo}
            onClick={(e) => { e.preventDefault(); if (alvo) onConfirm(alvo.planejado.id); }}
            className="h-9 rounded-lg text-sm font-semibold gap-1.5 bg-warning-strong hover:bg-warning-strong/90 text-white"
            data-testid="desfazer-pre-aprovacao-confirmar"
          >
            {pending ? <><Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Desfazendo…</> : <><Undo2 className="w-4 h-4" aria-hidden="true" />Desfazer</>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── "Não exibir valores" ao colaborador, por evento ─────────────────────────
/**
 * Interruptor do evento (padrão ligado, até a OC — decisão do dono, 26/10).
 * Só o DP muda (PATCH /api/events/:id/ocultar-valores); quem não pode, lê.
 * Nesta fase fica registrado; passa a valer no portal do colaborador (Fase 1).
 */
export function OcultarValoresDoEvento({ evento, podeMudar }: { evento: Event; podeMudar: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const ligado = evento.ocultarValoresColaborador !== false;
  const m = useMutation({
    mutationFn: async (ocultar: boolean) => (await apiRequest("PATCH", `/api/events/${evento.id}/ocultar-valores`, { ocultar })).json() as Promise<Event>,
    onSuccess: (salvo) => {
      // Atualiza na hora todas as listas de eventos em cache e confirma com o servidor.
      qc.setQueriesData<Event[]>({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/events") }, (old) =>
        Array.isArray(old) ? old.map((e) => (e.id === salvo.id ? { ...e, ocultarValoresColaborador: salvo.ocultarValoresColaborador } : e)) : old);
      // GET /api/events tem cache HTTP de 60 s (cacheDeCatalogo): refazer a
      // consulta traria a lista velha e o interruptor "voltaria". Ela fica com o
      // valor gravado acima; as outras listas de eventos, sem cache, recarregam.
      qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/events") && q.queryKey[0] !== "/api/events" });
      toast({
        variant: "success",
        title: salvo.ocultarValoresColaborador ? "Valores ocultos ao colaborador" : "Valores visíveis ao colaborador",
        description: salvo.ocultarValoresColaborador ? "Ele não verá os valores deste evento até a OC." : "Ele verá os valores deste evento antes da OC.",
      });
    },
    onError: (err) => toast({ variant: "destructive", title: "Não foi possível salvar", description: apiErrorMessage(err, "Tente de novo.") }),
  });
  const valor = m.isPending && m.variables !== undefined ? m.variables : ligado;
  const id = `ocultar-valores-${evento.id}`;
  return (
    <div className={cn("flex items-start sm:items-center gap-3 min-w-0")} data-testid="ocultar-valores">
      <span className={cn("inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0", valor ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground")} aria-hidden="true">
        <EyeOff className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={cn("block text-sm font-medium leading-5 text-foreground", podeMudar && "cursor-pointer")}>
          Não exibir valores ao colaborador
        </label>
        <p className="m-0 text-xs leading-4 text-muted-foreground">
          {valor ? "O colaborador não verá os valores até a OC." : "O colaborador verá os valores deste evento antes da OC."}
          <span className="max-sm:hidden"> Passa a valer com o acesso do colaborador (Fase 1).</span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
        {m.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none text-muted-foreground" aria-hidden="true" />}
        <Switch
          id={id}
          checked={valor}
          disabled={!podeMudar || m.isPending}
          onCheckedChange={(v) => m.mutate(v)}
          aria-describedby={`${id}-dica`}
          data-testid="ocultar-valores-chave"
        />
        <span id={`${id}-dica`} className="sr-only">{podeMudar ? "Só o DP muda" : "Só o DP pode mudar — você vê a escolha atual"}</span>
      </div>
    </div>
  );
}
