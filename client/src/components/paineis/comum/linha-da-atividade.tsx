/**
 * Painéis (30/10) — uma linha do feed (Atividade recente e o bloco "Últimas
 * inclusões" da Visão geral). A linha inteira é o link para a tela onde o
 * item se resolve (`destinoDoItem`).
 */
import { Link } from "wouter";
import { ArrowLeftRight, BedDouble, ChevronRight, PencilLine, Plane, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { User } from "@shared/schema";
import type { EtapaDoQuadro } from "@/components/scaling/scaling-analytics-data";
import { ROTULO_DA_ETAPA } from "@shared/prazos-da-escala";
import { cn } from "@/lib/utils";
import { destinoDoItem, type ItemDaAtividade, type TipoDaAtividade } from "./atividade-tipos";
import { quandoFoi } from "./paineis-dados";

export const ICONE_DO_TIPO: Record<TipoDaAtividade, { icone: LucideIcon; classe: string; rotulo: string }> = {
  inclusao: { icone: UserPlus, classe: "bg-success-soft text-success", rotulo: "Inclusão" },
  mudanca: { icone: PencilLine, classe: "bg-brand-soft text-primary", rotulo: "Mudança" },
  passagem: { icone: Plane, classe: "bg-info-soft text-info", rotulo: "Passagem" },
  hotel: { icone: BedDouble, classe: "bg-info-soft text-info", rotulo: "Hotel" },
  pedido: { icone: ArrowLeftRight, classe: "bg-warning-soft text-warning", rotulo: "Pedido" },
};

/** "#4821 · Produtor · ANA SOUZA" (uma vaga) ou "#4821, #4822 +3" (lote). */
export function descricaoDasVagas(item: ItemDaAtividade): string {
  if (item.vagas.length === 0) return item.funcoes.join(", ");
  if (item.quantidade === 1) {
    const v = item.vagas[0];
    // O nome já está no título ("Colaborador incluído: ANA") — não repete.
    const nomeNoTitulo = !!v.colaborador && item.titulo.includes(v.colaborador);
    return [v.numero ? `#${v.numero}` : null, v.funcao, nomeNoTitulo ? null : v.colaborador, v.excluida ? "vaga excluída" : null]
      .filter(Boolean).join(" · ");
  }
  const nums = item.vagas.map((v) => (v.numero ? `#${v.numero}` : null)).filter(Boolean) as string[];
  const mostra = nums.slice(0, 4);
  const resto = item.quantidade - mostra.length;
  return `${mostra.join(", ")}${resto > 0 ? ` +${resto}` : ""}`;
}

export function LinhaDaAtividade({ item, user, novo, etapaAtrasada, compacta = false, agora }: {
  item: ItemDaAtividade;
  user: User | null;
  novo: boolean;
  etapaAtrasada: EtapaDoQuadro | null;
  compacta?: boolean;
  agora: number;
}) {
  const destino = destinoDoItem(item, user);
  const { icone: Icone, classe, rotulo } = ICONE_DO_TIPO[item.tipo];
  const vagas = descricaoDasVagas(item);
  return (
    <li className="list-none">
      <Link
        href={destino.href}
        className={cn(
          "group flex w-full items-start gap-3 border-b border-border px-4 text-left no-underline last:border-b-0 hover:bg-surface-muted focus-visible:bg-brand-soft focus-visible:outline-none",
          compacta ? "py-2.5" : "py-3",
          novo && "bg-brand-soft/40",
        )}
        aria-label={`${item.titulo}${item.eventName ? ` · ${item.eventName}` : ""} — abrir em ${destino.tela}`}
        data-testid={`atividade-${item.id}`}
      >
        <span aria-hidden="true" className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", classe)}>
          <Icone className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("min-w-0 break-words text-sm text-foreground", item.destaque ? "font-semibold" : "font-medium")}>{item.titulo}</span>
            <span className="sr-only">({rotulo})</span>
            {novo && (
              <span className="rounded-full bg-primary px-1.5 py-px text-2xs font-semibold text-primary-foreground" data-testid="selo-novo">novo</span>
            )}
            {etapaAtrasada && (
              <span className="whitespace-nowrap rounded-full bg-danger-soft px-1.5 py-px text-2xs font-semibold text-danger" data-testid="selo-atrasada">
                atrasada · {ROTULO_DA_ETAPA[etapaAtrasada]}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-600" title={[item.eventName, vagas].filter(Boolean).join(" · ")}>
            {item.eventName && <span className="font-medium text-slate-700">{item.eventName}</span>}
            {item.eventName && vagas && " · "}
            {vagas}
          </span>
          {!compacta && item.detalhe && <span className="mt-0.5 block break-words text-xs text-muted-foreground">{item.detalhe}</span>}
          {!compacta && item.linhas.length > 0 && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {item.linhas.map((l) => <span key={l} className="block break-words">{l}</span>)}
            </span>
          )}
          {!compacta && item.comentario && (
            <span className="mt-1 block break-words border-l-2 border-border pl-2 text-xs italic text-slate-600">“{item.comentario}”</span>
          )}
          {!compacta && (
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
              {item.autor && <span>por {item.autor}</span>}
              {item.precisaPassagem && (
                <span className="inline-flex items-center gap-1"><Plane className="h-3 w-3" aria-hidden="true" />precisa de passagem</span>
              )}
              {item.precisaHotel && (
                <span className="inline-flex items-center gap-1"><BedDouble className="h-3 w-3" aria-hidden="true" />precisa de hotel</span>
              )}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 pl-1 text-right">
          <time dateTime={item.at} className="whitespace-nowrap text-2xs tabular-nums text-muted-foreground" title={new Date(item.at).toLocaleString("pt-BR")}>
            {quandoFoi(item.at, new Date(agora))}
          </time>
          <span className="hidden items-center gap-0.5 whitespace-nowrap text-2xs font-medium text-primary sm:inline-flex">
            {destino.tela}
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </span>
      </Link>
    </li>
  );
}
