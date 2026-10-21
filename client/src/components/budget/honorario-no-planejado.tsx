/**
 * Honorário da cenotécnica no PLANEJADO (21/10) — os textos e avisos que o
 * card, a memória de cálculo, a planilha e o modal mostram. A regra (o
 * aprovado é a mão de obra; a empreita é rateada; o ajuste manual vence) está
 * em shared/honorarios-ceno.ts e shared/budget-engine.ts — aqui só se lê o
 * resultado do motor (`budget.honorario`, `honorarioAprovado`, `honorarioDifere`).
 */
import { AlertTriangle, BadgeCheck, Undo2 } from "lucide-react";
import type { BudgetActual } from "@shared/schema";
import { HONORARIO_STATUS_LABEL, type HonorarioNaVaga } from "@shared/honorarios-ceno";
import { formatCurrency, type BudgetOverrides, type CalculatedBudget } from "./types";

/** "21/10/2026" no fuso de São Paulo (a decisão é um timestamp). */
export function dataDaAprovacao(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** "por Marcos Vieira em 21/10/2026" (o que houver). */
function porEEm(h: HonorarioNaVaga): string {
  const data = dataDaAprovacao(h.aprovadoEm);
  return [h.aprovadoPor ? `por ${h.aprovadoPor}` : "", data ? `em ${data}` : ""].filter(Boolean).join(" ");
}

/** "parte da empreita Equipe Sul (R$ 1.000,00 ÷ 3)". */
export function textoDaParteDaEmpreita(h: HonorarioNaVaga): string {
  if (!h.empreita) return "";
  return `parte da empreita ${h.nome} (${formatCurrency(h.empreita.totalCents)} ÷ ${h.empreita.vagas})`;
}

/**
 * A ORIGEM da mão de obra, numa linha: "Honorário aprovado por Marcos Vieira
 * em 21/10/2026" ou "parte da empreita Equipe Sul (R$ 1.000,00 ÷ 3) ·
 * aprovada por Marcos Vieira em 21/10/2026".
 */
export function fonteDoHonorario(h: HonorarioNaVaga): string {
  const quem = porEEm(h);
  if (h.empreita) return `${textoDaParteDaEmpreita(h)}${quem ? ` · aprovada ${quem}` : ""}`;
  const ajuste = h.status === "aprovado_ajuste" ? " c/ ajuste" : "";
  return `Honorário aprovado${ajuste}${quem ? ` ${quem}` : ""}`;
}

/** Selo do pedido ainda sem aprovação: "honorário aguardando aprovação · R$ 2.000,00". */
export function textoDoHonorarioPendente(h: HonorarioNaVaga): string {
  const etapa = h.status === "aguardando" ? "aguardando aprovação"
    : h.status === "rascunho" ? "em rascunho"
    : h.status === "devolvido" ? "devolvido para negociar"
    : HONORARIO_STATUS_LABEL[h.status].toLowerCase();
  return `honorário ${etapa} · ${formatCurrency(h.valorCents)}`;
}

/** Explicação longa do selo pendente (tooltip). */
export function dicaDoHonorarioPendente(h: HonorarioNaVaga): string {
  const parte = h.empreita ? ` É a ${textoDaParteDaEmpreita(h)}.` : "";
  return `Pedido de honorário ainda sem aprovação: o Planejado segue com o valor de hoje até o aprovador decidir.${parte}`;
}

/** "difere do honorário aprovado (R$ 1.000,00)". */
export const textoDaDiferenca = (h: HonorarioNaVaga) => `difere do honorário aprovado (${formatCurrency(h.valorCents)})`;

/**
 * O honorário foi aprovado DEPOIS que a vaga foi enviada ao Realizado (21/10):
 * o envio copia os valores daquele momento, e o Realizado não se reescreve
 * sozinho — a tela só avisa para revisar.
 */
export function aprovadoDepoisDoEnvio(b: CalculatedBudget, actual: BudgetActual | undefined): boolean {
  if (!actual || !b.honorario || b.honorario.situacao !== "aprovado" || !b.honorario.aprovadoEm) return false;
  const aprovado = Date.parse(b.honorario.aprovadoEm);
  const enviado = actual.createdAt ? new Date(actual.createdAt).getTime() : NaN;
  return Number.isFinite(aprovado) && Number.isFinite(enviado) && aprovado > enviado;
}

/** Mão de obra que foi ao Realizado (diárias × valor gravado). */
export const maoDeObraEnviada = (a: BudgetActual) => (a.dailyQuantity ?? 0) * (a.dailyValue ?? 0);

/** "Usar o honorário aprovado": tira SÓ o ajuste da diária (mão de obra); o resto do ajuste fica. */
export function usarHonorarioAprovado(prev: BudgetOverrides, id: string): BudgetOverrides {
  const ovr = prev[id];
  if (!ovr) return prev;
  const { valorDiaria: _v, valorDiariaUtil: _u, valorDiariaFds: _f, ...resto } = ovr;
  const n = { ...prev };
  if (Object.keys(resto).some(k => k !== "inclusionId")) n[id] = resto;
  else delete n[id];
  return n;
}

/**
 * Avisos do honorário no card (e no modal): o ajuste manual que difere do
 * aprovado, com "Usar o honorário aprovado", e o aprovado depois do envio.
 */
export function AvisosDoHonorario({ budget, actual, isSent, podeEditar, onUsarHonorario, className }: {
  budget: CalculatedBudget;
  actual: BudgetActual | undefined;
  isSent: boolean;
  podeEditar: boolean;
  onUsarHonorario?: (id: string) => void;
  className?: string;
}) {
  const h = budget.honorario;
  if (!h || h.situacao !== "aprovado") return null;
  const difere = budget.honorarioDifere && !isSent;
  const depoisDoEnvio = isSent && aprovadoDepoisDoEnvio(budget, actual);
  if (!difere && !depoisDoEnvio) return null;
  return (
    <div className={className} data-testid="planejado-honorario-aviso">
      {difere && (
        <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warning/25 bg-warning-soft px-2.5 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-warning" aria-hidden="true" />
          {/* Base de 14rem: no celular o botão desce para a linha de baixo em vez de espremer o texto. */}
          <p className="m-0 min-w-0 flex-[1_1_14rem] text-2xs leading-4 text-warning">
            <span className="font-semibold">Ajuste manual</span> {textoDaDiferenca(h)}
          </p>
          {podeEditar && onUsarHonorario && (
            <button
              type="button"
              onClick={() => onUsarHonorario(budget.inclusion.id)}
              className="pas-alvo inline-flex items-center gap-1 h-7 px-2 rounded-md text-2xs font-semibold text-warning hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="planejado-usar-honorario"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />Usar o honorário aprovado
            </button>
          )}
        </div>
      )}
      {depoisDoEnvio && actual && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-2.5 py-1.5" data-testid="planejado-honorario-depois-do-envio">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0 text-warning" aria-hidden="true" />
          <p className="m-0 min-w-0 flex-1 text-2xs leading-4 text-warning">
            <span className="font-semibold">Honorário aprovado depois do envio — revise.</span>{" "}
            O Realizado foi criado com {formatCurrency(maoDeObraEnviada(actual))} de mão de obra; o aprovado é {formatCurrency(h.valorCents)}. Nada foi reaberto.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Selo do honorário (card e planilha): aprovado, com a origem no título, ou o
 * pedido ainda sem aprovação, discreto. Null sem pedido.
 */
export function SeloDoHonorario({ budget, compacto }: { budget: CalculatedBudget; compacto?: boolean }) {
  const h = budget.honorario;
  if (!h) return null;
  const base = "inline-flex items-center gap-1 rounded-md border text-2xs font-medium whitespace-nowrap";
  const tam = compacto ? "h-[18px] px-1.5" : "h-5 px-1.5";
  if (h.situacao === "aprovado") {
    return (
      <span title={fonteDoHonorario(h)} className={`${base} ${tam} bg-success-soft text-success border-transparent`} data-testid="planejado-honorario-aprovado">
        <BadgeCheck className="w-3 h-3" aria-hidden="true" />
        {h.empreita ? "Empreita aprovada" : "Honorário aprovado"}
      </span>
    );
  }
  return (
    <span title={dicaDoHonorarioPendente(h)} className={`${base} ${tam} bg-muted text-slate-600 border-transparent tabular-nums`} data-testid="planejado-honorario-pendente">
      {textoDoHonorarioPendente(h)}
    </span>
  );
}
