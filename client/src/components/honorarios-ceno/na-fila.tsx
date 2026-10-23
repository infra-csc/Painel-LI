/**
 * Honorários na FILA DE TRABALHO da Escalação (23/10 — dono: "nos honorários,
 * quem lança não sabe quais lançou, tinha que ser mais claro").
 *
 *  - `useHonorariosDaFila`: para quem LANÇA (cenotécnica / admin), a situação
 *    do honorário de cada vaga de cenotécnica do recorte, numa consulta só de
 *    leitura (GET /api/honorarios-ceno/situacao, em lotes de eventos). Para
 *    quem não lança não sai consulta nenhuma e nada aparece;
 *  - `SeloDoHonorario`: o selo discreto da linha — "Falta lançar"
 *    (o ícone de moedas diz que é honorário), "Rascunho · R$ 992", "Enviado ·
 *    R$ 992", "Aprovado · R$ 1.000",
 *    "Devolvido", "Na empreita X". Clicar abre a vaga na aba Honorário.
 *
 * Linguagem do selo (a mesma da gaveta e da aba da vaga):
 *  - o ícone de moedas diz "isto é honorário" — sem ele "Aprovado" se
 *    confundiria com o status da escala ao lado;
 *  - "falta lançar" é tracejado, como o "Escalar alguém": um lugar vazio;
 *  - rascunho neutro, enviado âmbar (está com o aprovador), devolvido na cor
 *    da marca (a bola voltou para você), aprovado verde — as cores do
 *    `EtapaBadge` do módulo;
 *  - forma de chip (cantos de 6px), não de pílula: não compete com a pílula
 *    do status da vaga.
 */
import { useCallback, useMemo } from "react";
import { AlertTriangle, HandCoins } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { ehCenotecnica } from "@shared/cenotecnica";
import { SITUACAO_NA_FILA_LABEL, type HonorarioNaFila, type SituacaoNaFila } from "@shared/honorarios-ceno";
import { cn } from "@/lib/utils";
import { useAcessoHonorarios, useSituacaoDosHonorarios } from "./api";
import { brl, brlCurto, dataBr, haQuanto } from "./pecas";

/**
 * A situação do honorário das vagas do recorte, para quem lança. `linhas` é o
 * recorte de evento/período (não o filtrado): o selo e os contadores do filtro
 * precisam do recorte inteiro.
 */
export function useHonorariosDaFila(linhas: readonly TeamInclusion[], functionById: ReadonlyMap<string, { name: string }>) {
  const acesso = useAcessoHonorarios();
  const ativo = !!acesso.data?.podePedir;
  const eventIds = useMemo(() => {
    if (!ativo) return [];
    const s = new Set<string>();
    for (const i of linhas) {
      if (i.status === "cancelado" || i.deletedAt) continue;
      if (ehCenotecnica(functionById.get(i.functionId)?.name, { incluiSupCeno: true })) s.add(i.eventId);
    }
    return Array.from(s);
  }, [ativo, linhas, functionById]);
  const { porVaga, carregando, erro } = useSituacaoDosHonorarios(eventIds, ativo && eventIds.length > 0);
  const situacaoDe = useCallback((i: TeamInclusion) => porVaga.get(i.id), [porVaga]);
  return { ativo, carregando: ativo && carregando, erro, situacaoDe, porVaga };
}

export type HonorariosDaFila = ReturnType<typeof useHonorariosDaFila>;

/** "você" quando foi a pessoa logada. */
export const quem = (nome: string | null | undefined, id: string | null | undefined, meuId: string | null | undefined) =>
  id && meuId && id === meuId ? "você" : (nome?.trim() || "alguém");

/** Classes por situação — tokens semânticos (CSS vars são cores completas). */
const TOM: Record<Exclude<SituacaoNaFila, "casa">, string> = {
  falta_lancar: "border border-dashed border-primary/45 bg-card text-primary hover:border-solid hover:border-primary hover:bg-brand-soft",
  rascunho: "border border-transparent bg-neutral-soft text-neutral hover:border-neutral/30",
  aguardando: "border border-transparent bg-warning-soft text-warning hover:border-warning/30",
  devolvido: "border border-transparent bg-brand-soft text-primary hover:border-primary/30",
  aprovado: "border border-transparent bg-success-soft text-success hover:border-success/30",
};

/** O texto curto do selo. */
export function textoDoSelo(h: HonorarioNaFila): string {
  if (h.empreita) return `Na empreita ${h.empreita.nome}`;
  const valor = h.valorCents ? brlCurto(h.valorCents) : null;
  switch (h.situacao) {
    case "falta_lancar": return "Falta lançar";
    case "rascunho": return valor ? `Rascunho · ${valor}` : "Rascunho · sem valor";
    case "aguardando": return valor ? `Enviado · ${valor}` : "Enviado";
    case "devolvido": return "Devolvido";
    case "aprovado": return valor ? `Aprovado · ${valor}` : "Aprovado";
    case "casa": return SITUACAO_NA_FILA_LABEL.casa;
  }
}

/** A frase completa (title e leitor de tela): etapa, valor, quem e quando. */
export function descricaoDoSelo(h: HonorarioNaFila, meuId: string | null | undefined): string {
  const partes: string[] = [];
  const valor = h.valorCents ? brl(h.valorCents) : null;
  if (h.empreita) {
    partes.push(`Faz parte da empreita ${h.empreita.nome} (${h.empreita.vagas} ${h.empreita.vagas === 1 ? "vaga" : "vagas"}) — ${SITUACAO_NA_FILA_LABEL[h.situacao].toLowerCase()}${valor ? `, ${valor} da equipe` : ""}`);
  } else if (h.situacao === "falta_lancar") {
    partes.push("Honorário ainda não lançado para esta vaga");
  } else {
    partes.push(`Honorário ${SITUACAO_NA_FILA_LABEL[h.situacao].toLowerCase()}${valor ? ` · ${valor}` : ""}`);
    if (h.situacao === "aprovado" && h.valorPedidoCents != null && h.valorCents != null && h.valorPedidoCents !== h.valorCents) {
      partes.push(`pedido ${brl(h.valorPedidoCents)}, aprovado com ajuste`);
    }
  }
  if (h.criadoPor || h.criadoPorNome) partes.push(`lançado por ${quem(h.criadoPorNome, h.criadoPor, meuId)}${h.createdAt ? ` ${haQuanto(h.createdAt)}` : ""}`);
  if (h.enviadoEm && h.situacao !== "rascunho") partes.push(`enviado por ${quem(h.enviadoPorNome, h.enviadoPor, meuId)} em ${dataBr(h.enviadoEm)}`);
  if ((h.situacao === "aprovado" || h.situacao === "devolvido") && h.decididoPorNome) {
    partes.push(`${h.situacao === "aprovado" ? "aprovado" : "devolvido"} por ${h.decididoPorNome}${h.decididoEm ? ` em ${dataBr(h.decididoEm)}` : ""}`);
  }
  if (h.aviso) partes.push(h.aviso);
  return `${partes.join(" · ")}. Abrir na aba Honorário.`;
}

/**
 * O selo da linha da Fila. Vaga da casa não recebe honorário: sem selo (a
 * linha já diz quem é). O clique não abre a linha por baixo — abre a vaga
 * direto na aba Honorário.
 */
export function SeloDoHonorario({ h, meuId, onAbrir, className }: {
  h: HonorarioNaFila | undefined;
  meuId?: string | null;
  onAbrir?: () => void;
  className?: string;
}) {
  if (!h || h.situacao === "casa") return null;
  const descricao = descricaoDoSelo(h, meuId);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAbrir?.(); }}
      onKeyDown={(e) => e.stopPropagation()}
      title={descricao}
      aria-label={descricao}
      data-testid={`selo-honorario-${h.vagaId}`}
      data-situacao={h.situacao}
      className={cn(
        "esc-alvo group/selo inline-flex h-[22px] max-w-full items-center gap-1 rounded-md px-1.5 text-2xs font-semibold leading-none transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        TOM[h.situacao],
        className,
      )}
    >
      <HandCoins className="h-3 w-3 shrink-0 opacity-80" aria-hidden="true" />
      <span className="min-w-0 truncate tabular-nums">{textoDoSelo(h)}</span>
      {h.aviso && <AlertTriangle className="h-3 w-3 shrink-0 text-warning" aria-hidden="true" />}
    </button>
  );
}
