/**
 * "O que já foi lançado e o que falta" (23/10 — dono: "nos honorários, quem
 * lança não sabe quais lançou, tinha que ser mais claro"). As peças que a
 * gaveta "Honorários do evento" usa por cima da lista:
 *
 *  - `ResumoDoLancamento`: a frase do topo — "7 de 12 lançadas (5 enviadas,
 *    2 em rascunho) · 5 faltam lançar · 1 devolvida" — com a barra de etapas
 *    embaixo. Cada número que pede ação é um atalho para a aba dele;
 *  - `AbasDoPedido`: Todas · Faltam lançar · Rascunhos · Enviados · Decididos,
 *    com a contagem, e "Lançados por mim";
 *  - `AutoriaDoPedido`: quem lançou, enviou ou decidiu, e quando ("Lançado
 *    por você · há 2 h").
 *
 * Só leitura do que o pedido já tem (status, criadoPor, enviadoPor…): nada
 * aqui muda regra, estado ou valor.
 */
import type { ReactNode } from "react";
import { UserRound } from "lucide-react";
import { situacaoDoStatus, type ContagemDoLancamento, type SituacaoNaFila } from "@shared/honorarios-ceno";
import { StatusBadge } from "@/components/common/status-badge";
import { cn } from "@/lib/utils";
import type { Honorario } from "./api";
import { haQuanto } from "./pecas";
import { quem } from "./na-fila";

/** "22/10" — o ano do pedido é o do evento; na linha, só dia e mês. */
const diaMes = (iso: string | null | undefined) => {
  const t = iso ? new Date(iso) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "";
};

// ── Abas ────────────────────────────────────────────────────────────────────

export type AbaDoPedido = "todas" | "falta" | "rascunho" | "enviados" | "decididos";

/** Em que aba cada etapa mora. Devolvido é "decidido" (o aprovador decidiu), mas pede ação — a linha avisa. */
export function abaDaSituacao(s: SituacaoNaFila): Exclude<AbaDoPedido, "todas"> {
  if (s === "falta_lancar") return "falta";
  if (s === "rascunho") return "rascunho";
  if (s === "aguardando") return "enviados";
  return "decididos";
}

/** A situação de uma linha da gaveta (vaga sem pedido = falta lançar). */
export const situacaoDaLinha = (h: { status: string } | null | undefined): SituacaoNaFila => situacaoDoStatus(h?.status);

export const ABAS_DO_PEDIDO: { key: AbaDoPedido; rotulo: string; vazio: { titulo: string; texto: string } }[] = [
  { key: "todas", rotulo: "Todas", vazio: { titulo: "Nada aqui", texto: "Este evento ainda não tem vaga nem empreita da cenotécnica." } },
  { key: "falta", rotulo: "Faltam lançar", vazio: { titulo: "Nada falta lançar", texto: "Todas as vagas deste evento já têm valor — em rascunho, enviado ou decidido." } },
  { key: "rascunho", rotulo: "Rascunhos", vazio: { titulo: "Nenhum rascunho parado", texto: "Tudo o que foi lançado já foi para o aprovador." } },
  { key: "enviados", rotulo: "Enviados", vazio: { titulo: "Nada aguardando o aprovador", texto: "Quando você enviar, o pedido fica aqui até ele decidir." } },
  { key: "decididos", rotulo: "Decididos", vazio: { titulo: "Nenhum pedido decidido ainda", texto: "O que o aprovador aprovar ou devolver para negociar aparece aqui." } },
];

export function contagemPorAba(c: ContagemDoLancamento): Record<AbaDoPedido, number> {
  return { todas: c.total, falta: c.faltaLancar, rascunho: c.rascunho, enviados: c.aguardando, decididos: c.aprovado + c.devolvido };
}

/**
 * Segmentos com a contagem. O ponto âmbar marca a aba que tem trabalho de
 * quem lança (falta lançar, rascunho) e o da marca, os devolvidos nos
 * decididos — a mesma leitura do marcador da Escalação ("espera você").
 */
export function AbasDoPedido({ aba, onAba, n, devolvidos, soMeus, onSoMeus, nMeus }: {
  aba: AbaDoPedido;
  onAba: (a: AbaDoPedido) => void;
  n: Record<AbaDoPedido, number>;
  devolvidos: number;
  soMeus: boolean;
  onSoMeus: (v: boolean) => void;
  nMeus: number;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="esc-rolagem-x -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="radiogroup" aria-label="Mostrar na lista" className="inline-flex h-9 items-center rounded-lg border border-border bg-card p-0.5 shadow-1" data-testid="hon-abas">
          {ABAS_DO_PEDIDO.map(({ key, rotulo }) => {
            const on = aba === key;
            const ponto = (key === "falta" || key === "rascunho") && n[key] > 0 ? "bg-warning-strong" : key === "decididos" && devolvidos > 0 ? "bg-primary" : null;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onAba(key)}
                data-testid={`hon-aba-${key}`}
                className={cn(
                  "val-alvo inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-brand-soft text-primary" : "text-slate-600 hover:bg-muted hover:text-foreground",
                )}
              >
                {ponto && <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ponto)} />}
                {rotulo}
                <span className={cn("min-w-[1.25rem] rounded-full px-1 text-center text-2xs font-semibold tabular-nums", on ? "bg-card text-primary" : "bg-surface-muted text-muted-foreground")}>
                  {n[key]}
                </span>
                {key === "decididos" && devolvidos > 0 && <span className="sr-only">({devolvidos} {devolvidos === 1 ? "devolvido" : "devolvidos"} para negociar)</span>}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={soMeus}
        onClick={() => onSoMeus(!soMeus)}
        data-testid="hon-so-meus"
        title="Só os pedidos que você lançou ou enviou"
        className={cn(
          "val-alvo inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-lg border pl-2.5 pr-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto",
          soMeus ? "border-primary/40 bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:bg-muted",
        )}
      >
        <span className={cn("relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors", soMeus ? "bg-primary" : "bg-slate-300")} aria-hidden="true">
          <span className="absolute left-0.5 h-3.5 w-3.5 rounded-full bg-card shadow-1 transition-transform duration-150" style={{ transform: `translateX(${soMeus ? "14px" : "0"})` }} />
        </span>
        Lançados por mim
        <span className="text-2xs tabular-nums text-muted-foreground">{nMeus}</span>
      </button>
    </div>
  );
}

// ── Resumo do topo ──────────────────────────────────────────────────────────

const pl = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** Número que leva à aba dele (só quando pede ação e há o que ver). */
function Atalho({ n, children, onClick, tom, testId }: { n: number; children: ReactNode; onClick?: () => void; tom?: "acao" | "marca"; testId?: string }) {
  const cls = cn("font-semibold tabular-nums", tom === "acao" ? "text-warning" : tom === "marca" ? "text-primary" : "text-foreground");
  if (!onClick || n === 0) return <span className={cls}>{children}</span>;
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className={cn(cls, "val-alvo rounded underline decoration-dotted decoration-1 underline-offset-[3px] hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {children}
    </button>
  );
}

/**
 * "7 de 12 lançadas (5 enviadas, 2 em rascunho) · 5 faltam lançar · 1
 * devolvida" + a barra das etapas. A barra lê da esquerda para a direita como
 * o caminho do pedido: aprovado, com o aprovador, devolvido, rascunho — e o
 * trilho vazio é o que falta lançar.
 */
export function ResumoDoLancamento({ c, onAba, className }: { c: ContagemDoLancamento; onAba: (a: AbaDoPedido) => void; className?: string }) {
  if (c.total === 0) return null;
  const partes = [
    c.enviadas ? `${c.enviadas} ${pl(c.enviadas, "enviada", "enviadas")}` : null,
    c.rascunho ? `${c.rascunho} em rascunho` : null,
  ].filter(Boolean);
  const nadaPendente = c.faltaLancar === 0 && c.rascunho === 0 && c.devolvido === 0;
  const pct = (n: number) => `${(n / c.total) * 100}%`;
  const segmentos = [
    { n: c.aprovado, cls: "bg-success-strong", rotulo: `${c.aprovado} ${pl(c.aprovado, "aprovada", "aprovadas")}` },
    { n: c.aguardando, cls: "bg-warning-strong", rotulo: `${c.aguardando} com o aprovador` },
    { n: c.devolvido, cls: "bg-primary", rotulo: `${c.devolvido} ${pl(c.devolvido, "devolvida", "devolvidas")}` },
    { n: c.rascunho, cls: "bg-slate-400", rotulo: `${c.rascunho} em rascunho` },
  ].filter((s) => s.n > 0);
  const descricao = `${c.lancadas} de ${c.total} lançadas${segmentos.length ? `: ${segmentos.map((s) => s.rotulo).join(", ")}` : ""}${c.faltaLancar ? `; ${c.faltaLancar} ${pl(c.faltaLancar, "falta", "faltam")} lançar` : ""}.`;
  return (
    <div className={cn("space-y-2", className)} data-testid="hon-resumo">
      <p className="text-sm leading-6 text-slate-700">
        <span className="font-semibold tabular-nums text-foreground">{c.lancadas} de {c.total}</span> {pl(c.lancadas, "lançada", "lançadas")}
        {partes.length > 0 && (
          <span className="text-muted-foreground"> (
            {c.enviadas > 0 && <Atalho n={c.enviadas} onClick={() => onAba(c.aguardando ? "enviados" : "decididos")}>{c.enviadas} {pl(c.enviadas, "enviada", "enviadas")}</Atalho>}
            {c.enviadas > 0 && c.rascunho > 0 && ", "}
            {c.rascunho > 0 && <Atalho n={c.rascunho} tom="acao" onClick={() => onAba("rascunho")} testId="hon-resumo-rascunho">{c.rascunho} em rascunho</Atalho>}
            )</span>
        )}
        {c.faltaLancar > 0 && (
          <>
            <span aria-hidden="true" className="px-1.5 text-muted-foreground/60">·</span>
            <Atalho n={c.faltaLancar} tom="acao" onClick={() => onAba("falta")} testId="hon-resumo-falta">
              {c.faltaLancar} {pl(c.faltaLancar, "falta", "faltam")} lançar
            </Atalho>
          </>
        )}
        {c.devolvido > 0 && (
          <>
            <span aria-hidden="true" className="px-1.5 text-muted-foreground/60">·</span>
            <Atalho n={c.devolvido} tom="marca" onClick={() => onAba("decididos")} testId="hon-resumo-devolvido">
              {c.devolvido} {pl(c.devolvido, "devolvida", "devolvidas")}
            </Atalho>
          </>
        )}
        {nadaPendente && (
          <>
            <span aria-hidden="true" className="px-1.5 text-muted-foreground/60">·</span>
            <span className="font-medium text-success">nada pendente com você</span>
          </>
        )}
      </p>
      <span role="img" aria-label={descricao} className="flex h-1.5 w-full max-w-[560px] overflow-hidden rounded-full bg-surface-muted ring-1 ring-inset ring-border" data-testid="hon-resumo-barra">
        {segmentos.map((s) => (
          <span key={s.cls} className={cn("h-full transition-[width] duration-500 ease-out first:rounded-l-full last:rounded-r-full motion-reduce:transition-none", s.cls)} style={{ width: pct(s.n) }} />
        ))}
      </span>
    </div>
  );
}

// ── Quem lançou ─────────────────────────────────────────────────────────────

/**
 * Quem lançou, enviou ou decidiu — a linha que responde "fui eu?". Duas
 * linhas no máximo: a etapa de agora e, embaixo, quem pôs o pedido no mundo.
 */
export function AutoriaDoPedido({ h, meuId, className }: { h: Honorario; meuId: string | null | undefined; className?: string }) {
  const lancou = quem(h.criadoPorNome, h.criadoPor, meuId);
  const enviou = quem(h.enviadoPorNome, h.enviadoPor, meuId);
  const linhas: string[] = [];
  if (h.status === "rascunho") {
    linhas.push(`${lancou === "você" ? "Você lançou" : `Lançado por ${lancou}`} · ${haQuanto(h.createdAt)}`);
    // "salvo há…" só quando a última gravação é DEPOIS do lançamento e cai noutro "há".
    if (h.updatedAt && Date.parse(h.updatedAt) > Date.parse(h.createdAt) && haQuanto(h.updatedAt) !== haQuanto(h.createdAt)) linhas.push(`salvo ${haQuanto(h.updatedAt)}`);
  } else if (h.status === "aguardando") {
    linhas.push(`${enviou === "você" ? "Você enviou" : `Enviado por ${enviou}`} · ${haQuanto(h.enviadoEm)}`);
    if (h.criadoPor !== h.enviadoPor) linhas.push(`lançado por ${lancou}`);
  } else if (h.status === "devolvido" || h.status === "aprovado" || h.status === "aprovado_ajuste") {
    const verbo = h.status === "devolvido" ? "Devolvido" : "Aprovado";
    linhas.push(`${verbo} por ${h.decididoPorNome ?? "aprovador"}${h.decididoEm ? ` · ${h.status === "devolvido" ? haQuanto(h.decididoEm) : diaMes(h.decididoEm)}` : ""}`);
    if (h.enviadoEm) linhas.push(`enviado por ${enviou} em ${diaMes(h.enviadoEm)}`);
  }
  if (linhas.length === 0) return null;
  return (
    <span className={cn("block text-2xs leading-4 text-muted-foreground", className)} data-testid="hon-autoria">
      {linhas.map((l, i) => (
        <span key={i} className={cn("block", i === 0 ? "text-slate-600" : undefined)}>
          {/você/i.test(l) && <UserRound className="mr-0.5 inline h-3 w-3 -translate-y-px text-primary" aria-hidden="true" />}{l}
        </span>
      ))}
    </span>
  );
}

/** "Falta lançar" — tracejado, como o "Escalar alguém" da Escalação: um lugar vazio. */
export function BadgeFaltaLancar({ texto = "Falta lançar" }: { texto?: string }) {
  return (
    <StatusBadge tone="primary" className="border border-dashed border-primary/45 bg-transparent" data-testid="hon-falta-lancar">
      {texto}
    </StatusBadge>
  );
}
