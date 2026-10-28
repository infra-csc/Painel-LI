/**
 * O prazo de uma etapa do honorário (28/10, Fase 3) — um jeito só de mostrar
 * nas telas internas (Painel de honorários, Presença no evento, Conferência
 * DP): atrasado em vermelho, vence hoje em âmbar, no prazo discreto. A regra
 * é a de shared/prazos-honorarios.ts; aqui só a aparência.
 */
import { AlarmClock, CalendarClock, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { diaEMesCurto, textoDoPrazo, type PrazoDaEtapa } from "@shared/prazos-honorarios";

type PrazoNaTela = Pick<PrazoDaEtapa, "situacao" | "dias" | "venceEm"> & Partial<Pick<PrazoDaEtapa, "rotulo" | "rotuloDeQuem">>;

export const CLASSE_DO_PRAZO: Record<PrazoDaEtapa["situacao"], string> = {
  atrasado: "text-danger",
  vence_hoje: "text-warning",
  no_prazo: "text-muted-foreground",
};

/** Dica completa: "Check-out final · Produção · vence 31/10 (atrasado 2 dias)". */
export function dicaDoPrazo(p: PrazoNaTela): string {
  const quem = [p.rotulo, p.rotuloDeQuem].filter(Boolean).join(" · ");
  const situacao = p.situacao === "no_prazo" ? "" : ` (${textoDoPrazo(p).toLowerCase()})`;
  return `${quem ? `${quem} · ` : ""}vence ${diaEMesCurto(p.venceEm)}${situacao}`;
}

/**
 * Texto com o nome da etapa: "Check-out final até 31/10", "Check-out final
 * vence hoje", "Check-out final atrasado 2 dias". Sem nome: o texto curto.
 */
export function textoDoPrazoCom(p: PrazoNaTela, nome?: string): string {
  if (!nome) return textoDoPrazo(p);
  if (p.situacao === "no_prazo") return `${nome} até ${diaEMesCurto(p.venceEm)}`;
  if (p.situacao === "vence_hoje") return `${nome} vence hoje`;
  return `${nome} atrasado ${p.dias} ${p.dias === 1 ? "dia" : "dias"}`;
}

/** Selo compacto em linha: ícone + "Atrasado 2 dias" / "Vence hoje" / "Vence 31/10" (ou com o nome da etapa). */
export function SeloDoPrazo({ p, nome, className, testid }: { p: PrazoNaTela; nome?: string; className?: string; testid?: string }) {
  const Icone = p.situacao === "atrasado" ? TriangleAlert : p.situacao === "vence_hoje" ? AlarmClock : CalendarClock;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs leading-4", CLASSE_DO_PRAZO[p.situacao], p.situacao !== "no_prazo" && "font-medium", className)}
      title={dicaDoPrazo(p)} data-situacao={p.situacao} data-testid={testid}>
      <Icone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{textoDoPrazoCom(p, nome)}</span>
    </span>
  );
}
