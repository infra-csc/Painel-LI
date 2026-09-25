/**
 * Peças comuns aos três diálogos de pedido (ajuste, exclusão, inclusão) —
 * 25/09, extraídas de change-request-dialogs.tsx: casca do diálogo, passos
 * numerados, foco no erro, campo de motivo, a mutation e o banner do aprovador.
 */
import { useEffect, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, cn } from "@/lib/utils";
import { TRANSPORT_MODE_LABELS, type ProposedChanges, type ProposedField, type TransportMode } from "@shared/scaling-validation-rules";
import { CHANGE_REQUEST_TYPE_LABELS, type LastDecisionInfo } from "@shared/scaling-validation-rules";
import { formatDateBr } from "@/lib/dates";
import { describeLastDecision, invalidateScalingQueries, ymd, type ApiError } from "./types";
import { RequiredMark } from "@/components/forms/required-mark";

// ── helpers ──────────────────────────────────────────────────────────────────

export const orNull = <T,>(v: T | ""): T | null => (v === "" ? null : v);

// ── Casca dos diálogos ───────────────────────────────────────────────────────
// Mesma estrutura do "Reajustar pedido" da Aprovação: cabeçalho fixo, corpo
// rolável e rodapé preso — o motivo do pedido e os botões nunca somem da vista.

export const DIALOG_SHELL = "p-0 gap-0 flex flex-col max-h-[88vh] overflow-hidden rounded-xl";
/**
 * Diálogo LARGO (pedido de ajuste e de inclusão).
 *
 * Regra do dono (26/08): "scroll em modal dificulta muito" — em vez de rolar,
 * o diálogo cresce para o lado e o conteúdo vira duas colunas em telas grandes
 * (o que é da VAGA à esquerda, a VIAGEM à direita). O `max-h`/overflow continua
 * como rede de segurança para telas baixas, não como layout normal.
 */
export const DIALOG_SHELL_WIDE = `${DIALOG_SHELL} max-w-5xl`;
/** Duas colunas a partir de lg: dias/diárias/observações | ida e volta. */
export const DIALOG_TWO_COLS = "grid gap-4 lg:grid-cols-2 lg:items-start";
// shrink-0: sem isto o cabeçalho é comprimido pelo corpo num diálogo alto e
// o título e a descrição se sobrepõem (visto ao vivo em 1568×688).
export const DIALOG_HEADER = "shrink-0 px-6 pt-6 pb-3 border-b border-border pr-12";
export const DIALOG_BODY = "flex-1 overflow-y-auto px-6 py-4 space-y-4";
export const DIALOG_STICKY = "shrink-0 border-t border-border bg-surface-muted/60 px-6 py-3 space-y-2";

// ── Passos numerados e erro com foco (04/09) ─────────────────────────────────
// O mesmo desenho dos diálogos de decisão da Aprovação (decision-dialogs.tsx):
// cada bloco do formulário é um passo numerado, o erro leva o foco ao campo
// que falta (com `aria-invalid` e borda vermelha) e o botão principal diz a
// consequência. Antes o erro aparecia embaixo, no rodapé, e o campo vazio
// ficava fora da vista num diálogo alto.

const passoCls = "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-2xs font-bold text-white";

/** Título de um passo: bolinha numerada + texto (+ asterisco quando obrigatório). */
export function Passo({ n, id, obrigatorio, dica, children }: { n: number; id?: string; obrigatorio?: boolean; dica?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <h3 id={id} className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className={passoCls} aria-hidden="true">{n}</span>
        <span className="sr-only">Passo {n}: </span>
        <span>{children}{obrigatorio &&<RequiredMark />}</span>
      </h3>
      {dica && <p className="pl-8 text-2xs leading-snug text-muted-foreground">{dica}</p>}
    </div>
  );
}

/**
 * Diárias × Viagem (dono, 11/09: "algumas pessoas estão confundindo"). As duas
 * seções pedem datas e a diferença tem que estar escrita no título de cada uma:
 * diária é dia TRABALHADO; viagem é o deslocamento sugerido para Compras.
 */
export const DICA_DIARIAS = (
  <>Os dias em que a pessoa <span className="font-medium text-slate-700">trabalha no evento</span> — cada dia marcado é uma diária. Não é a data da viagem.</>
);
export const DICA_VIAGEM = (
  <>Só a <span className="font-medium text-slate-700">sugestão de deslocamento</span> para Compras: quando a pessoa chega (ida) e quando sai (volta). Não conta diária — pode ser a véspera ou o dia seguinte ao trabalho.</>
);

/** Qual campo do formulário está errado — é o que decide para onde vai o foco. */
export type CampoErro = "function" | "quantity" | "days" | "travel" | "reason" | "diff";
export interface ErroForm { campo: CampoErro; msg: string }

/** Contorno vermelho em volta de um bloco inteiro (seletor de dias, viagem) — o `aria-invalid` de quem não é um único input. */
export const BLOCO_INVALIDO = "rounded-xl ring-2 ring-danger/25 ring-offset-2";

/**
 * Leva o foco (e a rolagem) ao primeiro elemento focável do campo com erro.
 * Por id, não por ref: o seletor de dias e a viagem são blocos com vários
 * controles, e o que interessa é o PRIMEIRO deles.
 */
export function useFocoNoErro(error: ErroForm | null, idPorCampo: Record<CampoErro, string>) {
  useEffect(() => {
    if (!error) return;
    const raiz = document.getElementById(idPorCampo[error.campo]);
    if (!raiz) return;
    const alvo = raiz.matches("input, textarea, select, button, [tabindex]")
      ? raiz
      : raiz.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])");
    (alvo as HTMLElement | null)?.focus();
    (alvo ?? raiz).scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Motivo do pedido — obrigatório nos três diálogos, sempre no rodapé fixo. */
export function ReasonField({ id, value, onChange, disabled, placeholder, label = "Motivo do pedido", passo, invalido, erroId }: {
  id: string; value: string; onChange: (v: string) => void; disabled?: boolean; placeholder: string; label?: string;
  /** Número do passo (o rodapé é o último passo do formulário). */
  passo?: number;
  /** Erro apontando para este campo: `aria-invalid` + borda vermelha. */
  invalido?: boolean;
  /** id do `<p role="alert">` com a mensagem, para o `aria-describedby`. */
  erroId?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={passo ? "flex items-center gap-2 text-sm font-semibold text-foreground" : "text-xs text-slate-600"}>
        {passo && <span className={passoCls} aria-hidden="true">{passo}</span>}
        {passo && <span className="sr-only">Passo {passo}: </span>}
        <span>{label}<RequiredMark /></span>
      </Label>
      <Textarea id={id} rows={2} maxLength={1000} value={value} disabled={disabled} required aria-required="true"
        aria-invalid={invalido || undefined} aria-describedby={invalido && erroId ? erroId : undefined}
        placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className={cn("rounded-lg text-sm bg-card", invalido && "border-danger-strong focus-visible:ring-danger/25")} />
    </div>
  );
}

/** Callback disparado após o pedido ser aceito pelo servidor (id da vaga; null em inclusão). */
export type OnRequestSent = (inclusionId: string | null) => void;

export function useCreateChangeRequest(onDone: () => void, onSent?: OnRequestSent) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      teamInclusionId?: string | null;
      eventId: string;
      functionId: string;
      area?: string | null;
      requestType: "ajuste" | "inclusao" | "exclusao";
      proposedChanges: ProposedChanges;
      reason: string;
    }) => {
      const res = await apiRequest("POST", "/api/scaling-change-requests", {
        ...body,
        proposedChanges: JSON.stringify(body.proposedChanges),
      });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      invalidateScalingQueries(queryClient);
      const label = vars.requestType === "ajuste" ? "Pedido de ajuste enviado" : vars.requestType === "exclusao" ? "Pedido de exclusão enviado" : "Pedido de inclusão enviado";
      toast({ title: label, description: "O aprovador da função vai analisar o pedido." });
      onDone();
      onSent?.(vars.teamInclusionId ?? null);
    },
    onError: (err: ApiError) => {
      toast({ title: "Não foi possível enviar o pedido", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    },
  });
}

export function fmtValue(field: ProposedField, v: unknown): string {
  // No de/para, campo vazio precisa se dizer: um travessão no lugar do "de"
  // some no meio da frase e o aprovador não sabe se havia valor antes.
  if (v === null || v === undefined || v === "") return "não definido";
  if (field === "workDays" && Array.isArray(v)) return v.map((d) => ymd(d as string).split("-").reverse().slice(0, 2).join("/")).join(", ");
  if (field === "needsTicket" || field === "needsAccommodation") return v ? "Sim" : "Não";
  if (field === "transportModeIda" || field === "transportModeVolta") return TRANSPORT_MODE_LABELS[v as TransportMode] ?? String(v);
  if (field === "flightDepartureDate" || field === "flightReturnDate") return ymd(v as string).split("-").reverse().join("/");
  return String(v);
}

/** Comentário do aprovador na última decisão — em destaque no topo do diálogo (a vaga voltou por isso). */
export function ApproverCommentBanner({ info }: { info: LastDecisionInfo | null | undefined }) {
  const d = describeLastDecision(info);
  if (!info || !d) return null;
  const when = info.at ? formatDateBr(info.at) : "";
  const typeLabel = CHANGE_REQUEST_TYPE_LABELS[info.requestType] ?? info.requestType;
  return (
    <div role="note" className="rounded-xl border border-warning/25 bg-warning-soft px-3 py-2.5 space-y-1">
      <p className="text-2xs font-bold uppercase tracking-wide text-warning">{d.title} · pedido de {typeLabel.toLowerCase()}</p>
      <p className="text-sm text-foreground whitespace-pre-wrap">{info.comment?.trim() ? info.comment : <span className="italic text-slate-600">Sem comentário do aprovador.</span>}</p>
      <p className="text-2xs text-slate-600">{info.byName ?? "Aprovador"}{when ? ` · ${when}` : ""}</p>
    </div>
  );
}
