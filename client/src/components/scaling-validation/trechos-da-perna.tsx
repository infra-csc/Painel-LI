/**
 * Só ida / só volta / trecho direto na logística sugerida (09/10).
 *
 * Compras: "Existe por exemplo o caso de Viva Esporte, os projetos de carreta,
 * que desde o início eu sei que a equipe vai direto de um evento pra outro.
 * Hoje não existe na sugestão uma opção de passagem somente de ida."
 *
 * Cada perna ganha um seletor de três opções acima dos campos:
 *  - IDA: "Com ida" · "Vem direto de outro evento" (a ida sai da cidade do
 *    evento escolhido — modal, data e desembarque continuam valendo: é a ida
 *    desta vaga, custo deste evento) · "Sem ida" (já está na cidade);
 *  - VOLTA: "Com volta" · "Segue direto para outro evento" (sem volta própria:
 *    o trecho é a ida da vaga de lá) · "Sem volta".
 * Aqui é EVENTO, não vaga: na Sugestão a vaga do outro evento pode nem existir.
 * Quem confirma o encadeamento das passagens é Compras, ao registrar.
 * O que cada escolha implica nos outros campos é a regra única do shared
 * (`normalizarTrechosDaVaga`); o servidor normaliza de novo ao gravar.
 */
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDayMonthBr } from "@/lib/dates";
import type { TrechosSugeridos } from "@shared/scaling-validation-rules";
import { nomeDoEventoNoCache } from "@/lib/nome-do-evento";

/** Os campos da linha/vaga que o seletor lê e escreve (grade da Sugestão ou rascunho de viagem). */
export interface TrechosDaLinha {
  trechosSugeridos?: TrechosSugeridos | "" | null;
  idaVemDoEventoId?: string | null;
  voltaSegueParaEventoId?: string | null;
}

/** Patch que a escolha gera — campos de viagem vazios ("") quando a perna deixa de existir. */
export interface PatchDeTrechos {
  trechosSugeridos?: TrechosSugeridos | "";
  idaVemDoEventoId?: string;
  voltaSegueParaEventoId?: string;
  transportModeIda?: "";
  flightDepartureDate?: string;
  flightArrivalSuggestedTime?: string;
  flightDepartureSuggestedTime?: string;
  transportModeVolta?: "";
  flightReturnDate?: string;
  flightReturnSuggestedTime?: string;
}

export interface EventoParaTrecho {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  /** Em relação ao evento da vaga: termina antes, começa depois ou se sobrepõe. */
  posicao?: "antes" | "depois" | "durante";
}

export type ModoDaPerna = "normal" | "direto" | "sem";

export function modoDaIda(v: TrechosDaLinha): ModoDaPerna {
  if (v.idaVemDoEventoId) return "direto";
  return v.trechosSugeridos === "so_volta" ? "sem" : "normal";
}
export function modoDaVolta(v: TrechosDaLinha): ModoDaPerna {
  if (v.voltaSegueParaEventoId) return "direto";
  return v.trechosSugeridos === "so_ida" ? "sem" : "normal";
}

/**
 * O patch de uma escolha. "Sem" de um lado desfaz o "sem"/"direto" do outro
 * (uma vaga sem ida E sem volta não é viagem — é a vaga local, "Precisa de
 * passagem" desmarcado).
 */
export function patchDaEscolha(perna: "ida" | "volta", modo: ModoDaPerna, atual: TrechosDaLinha, eventoId?: string): PatchDeTrechos {
  const t = atual.trechosSugeridos || "";
  if (perna === "ida") {
    if (modo === "sem") {
      return { trechosSugeridos: "so_volta", idaVemDoEventoId: "", voltaSegueParaEventoId: "", transportModeIda: "", flightDepartureDate: "", flightArrivalSuggestedTime: "", flightDepartureSuggestedTime: "" };
    }
    return { trechosSugeridos: t === "so_volta" ? "" : t, idaVemDoEventoId: modo === "direto" ? (eventoId ?? atual.idaVemDoEventoId ?? "") : "" };
  }
  if (modo === "normal") return { trechosSugeridos: t === "so_ida" ? "" : t, voltaSegueParaEventoId: "" };
  return {
    trechosSugeridos: "so_ida",
    voltaSegueParaEventoId: modo === "direto" ? (eventoId ?? atual.voltaSegueParaEventoId ?? "") : "",
    transportModeVolta: "", flightReturnDate: "", flightReturnSuggestedTime: "",
  };
}

const ROTULOS: Record<"ida" | "volta", Record<ModoDaPerna, string>> = {
  ida: { normal: "Com ida", direto: "Vem de outro evento", sem: "Sem ida" },
  volta: { normal: "Com volta", direto: "Segue para outro evento", sem: "Sem volta" },
};
const EXPLICA: Record<"ida" | "volta", Record<Exclude<ModoDaPerna, "normal">, string>> = {
  ida: {
    direto: "A ida sai da cidade do evento escolhido — é a passagem desta vaga.",
    sem: "Sem ida: a pessoa já está na cidade ou vai por conta própria.",
  },
  volta: {
    direto: "Sem volta própria: o trecho é a ida da vaga do outro evento (custo de lá).",
    sem: "Sem volta: a pessoa fica na cidade ou volta por conta própria.",
  },
};

const LABEL = "mb-1 block text-2xs font-medium text-muted-foreground";

/** Seletor da perna (+ o evento, quando "direto"). */
export function TrechoDaPerna({ perna, valor, eventos, disabled, idBase, onPatch, contexto, className }: {
  perna: "ida" | "volta";
  valor: TrechosDaLinha;
  /** Outros eventos para escolher (o atual já fora), do mais próximo ao mais longe. */
  eventos: EventoParaTrecho[];
  disabled?: boolean;
  idBase: string;
  onPatch: (p: PatchDeTrechos) => void;
  /** Para o rótulo acessível ("Ida — Montagem"). */
  contexto?: string;
  className?: string;
}) {
  const modo = perna === "ida" ? modoDaIda(valor) : modoDaVolta(valor);
  const eventoId = (perna === "ida" ? valor.idaVemDoEventoId : valor.voltaSegueParaEventoId) || "";
  const preenchido = modo !== "normal";
  // Sugestão inicial: na ida, o evento mais próximo que TERMINA antes; na volta, o que COMEÇA depois.
  const padrao = (eventos.find((e) => e.posicao === (perna === "ida" ? "antes" : "depois")) ?? eventos[0])?.id;
  // O evento já indicado pode estar fora dos mais próximos: entra na lista assim mesmo.
  const opcoes = eventoId && !eventos.some((e) => e.id === eventoId) ? [{ id: eventoId, name: nomeDoEventoNoCache(eventoId) }, ...eventos] : eventos;
  return (
    <div className={cn("space-y-1.5", className)} data-testid={`trecho-${perna}-${idBase}`}>
      <div className={cn("grid gap-2", modo === "direto" ? "grid-cols-1 sm:grid-cols-[minmax(0,210px)_minmax(0,1fr)]" : "grid-cols-1 sm:grid-cols-[minmax(0,210px)]")}>
        <div className="min-w-0">
          <Label htmlFor={`${idBase}-${perna}-modo`} className={LABEL}>Trecho</Label>
          <Select value={modo} disabled={disabled} onValueChange={(v) => onPatch(patchDaEscolha(perna, v as ModoDaPerna, valor, v === "direto" ? (eventoId || padrao) : undefined))}>
            <SelectTrigger id={`${idBase}-${perna}-modo`} aria-label={`Trecho da ${perna}${contexto ? ` — ${contexto}` : ""}`}
              className={cn("h-8 w-full rounded-lg text-xs", preenchido ? "bg-brand-soft/60 border-primary/30" : "bg-card border-border")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["normal", "direto", "sem"] as const).map((m) => (
                <SelectItem key={m} value={m} disabled={m === "direto" && eventos.length === 0}>{ROTULOS[perna][m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {modo === "direto" && (
          <div className="min-w-0">
            <Label htmlFor={`${idBase}-${perna}-evento`} className={LABEL}>{perna === "ida" ? "Vem de" : "Segue para"}</Label>
            <Select value={eventoId} disabled={disabled} onValueChange={(v) => onPatch(patchDaEscolha(perna, "direto", valor, v))}>
              <SelectTrigger id={`${idBase}-${perna}-evento`} aria-label={`${perna === "ida" ? "Evento de onde vem" : "Evento para onde segue"}${contexto ? ` — ${contexto}` : ""}`}
                className="h-8 w-full rounded-lg text-xs bg-brand-soft/60 border-primary/30" data-testid={`trecho-${perna}-evento-${idBase}`}>
                <SelectValue placeholder="Escolha o evento" />
              </SelectTrigger>
              <SelectContent>
                {opcoes.map((e: EventoParaTrecho) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}{e.startDate ? ` · ${formatDayMonthBr(String(e.startDate).slice(0, 10))}` : ""}{e.endDate && e.endDate !== e.startDate ? `–${formatDayMonthBr(String(e.endDate).slice(0, 10))}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {modo !== "normal" && <p className="m-0 text-2xs leading-snug text-slate-600">{EXPLICA[perna][modo]}</p>}
    </div>
  );
}

/**
 * Outros eventos para o seletor: sem o atual, sem excluídos, do mais próximo
 * (pela distância entre os períodos) ao mais longe, até `limite`.
 */
export function eventosParaTrecho<E extends EventoParaTrecho & { status?: string | null }>(
  eventos: readonly E[] | null | undefined,
  atual: { id?: string | null; startDate?: string | null; endDate?: string | null } | null | undefined,
  limite = 40,
): EventoParaTrecho[] {
  const ini = String(atual?.startDate ?? "").slice(0, 10), fim = String(atual?.endDate ?? atual?.startDate ?? "").slice(0, 10);
  const distancia = (e: E) => {
    const ei = String(e.startDate ?? "").slice(0, 10), ef = String(e.endDate ?? e.startDate ?? "").slice(0, 10);
    if (!ini || !ei) return Number.MAX_SAFE_INTEGER;
    const ms = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`));
    if (ef < ini) return ms(ef, ini);
    if (ei > fim) return ms(ei, fim);
    return 0;
  };
  return (eventos ?? [])
    .filter((e) => e.id !== atual?.id && e.status !== "excluido" && e.status !== "excluído")
    .map((e) => ({ e, d: distancia(e) }))
    .sort((a, b) => a.d - b.d || a.e.name.localeCompare(b.e.name, "pt-BR"))
    .slice(0, limite)
    .map(({ e }) => {
      const ei = String(e.startDate ?? "").slice(0, 10), ef = String(e.endDate ?? e.startDate ?? "").slice(0, 10);
      const posicao: EventoParaTrecho["posicao"] = !ini || !ei ? undefined : ef < ini ? "antes" : ei > fim ? "depois" : "durante";
      return { id: e.id, name: e.name, startDate: e.startDate ?? null, endDate: e.endDate ?? null, posicao };
    });
}
