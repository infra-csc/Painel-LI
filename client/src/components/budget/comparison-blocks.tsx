/**
 * Linhas do extrato comparativo — 25/09 (modularização); redesenho 08/10.
 *
 * Antes: `CategoryBlock` (cabeçalho colorido de 32px por categoria, quatro
 * colunas iguais, subtotal numa faixa tingida) e, no modal de divisão,
 * `SubRow`/`SectionBlock` (outra grade, com "└" desenhado à mão).
 *
 * Agora é UMA linha só, a do extrato: rótulo · planejado · realizado ·
 * diferença, números à direita e em colunas fixas. Na lista, as colunas são
 * as MESMAS da linha da prestação (o valor de cada item cai embaixo do
 * Planejado/Realizado/Diferença do cabeçalho); no modal, a grade é a dela.
 *
 * Correção de apresentação (08/10): o subtotal da categoria somava TODAS as
 * linhas em reais — inclusive o "Valor unitário" da diária, que é preço, não
 * parcela. O cabeçalho "Diárias" mostrava R$ 750,00 para R$ 600,00 de
 * diárias. Agora a linha marca `soma: false` e o subtotal fecha com o total.
 */
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "./comparison-utils";

/** "+R$ 150,00" / "−R$ 80,00" / "—" — ou "+1" para quantidades. */
export function Diferenca({ planned, actual, quantidade, forte, className }: {
  planned: number; actual: number; quantidade?: boolean; forte?: boolean; className?: string;
}) {
  const d = actual - planned;
  if (d === 0) return <span className={cn("text-muted-foreground", className)} aria-label="sem diferença">—</span>;
  return (
    <span className={cn("tabular-nums", forte ? "font-semibold" : "font-medium", d > 0 ? "text-danger" : "text-success", className)}>
      {d > 0 ? "+" : "−"}{quantidade ? Math.abs(d) : fmt(Math.abs(d))}
    </span>
  );
}

export interface LinhaDoExtratoProps {
  rotulo: ReactNode;
  planned: number;
  actual: number;
  /** Quantidade (diárias): sem "R$". */
  quantidade?: boolean;
  /** `grupo` = cabeçalho da categoria (subtotal); `item` = parcela; `total` = fecho. */
  nivel?: "grupo" | "item" | "total";
  /** Cor do ponto da categoria (só `grupo`). */
  cor?: string;
  /** Etiqueta depois do rótulo (ex.: "Divergência"). */
  extra?: ReactNode;
  /** Ação na última coluna (só na lista). */
  acao?: ReactNode;
  /** Planejado ausente: mostra "—" em vez de R$ 0,00. */
  semPlanejado?: boolean;
  /** Rótulo longo (nome, conta): no estreito, o rótulo ganha a linha toda e os valores descem. */
  longo?: boolean;
}

/** Uma linha do extrato: rótulo · planejado · realizado · diferença. */
export function LinhaDoExtrato({ rotulo, planned, actual, quantidade, nivel = "item", cor, extra, acao, semPlanejado, longo }: LinhaDoExtratoProps) {
  const val = (v: number) => (quantidade ? String(v) : fmt(v));
  const zerada = nivel === "item" && planned === 0 && actual === 0;
  return (
    <div className={cn("cmp-item", `cmp-item-${nivel}`, zerada && "cmp-item-zerada", longo && "cmp-item-longo")}>
      <div className="cmp-item-rotulo min-w-0 flex items-center gap-1.5">
        {nivel === "grupo" && <span aria-hidden="true" className={cn("w-1.5 h-1.5 rounded-full shrink-0", cor)} />}
        <span className="min-w-0 truncate">{rotulo}</span>
        {extra}
      </div>
      <span className="cmp-item-valor cmp-item-plan">
        <span className="sr-only">Planejado: </span>{semPlanejado ? "—" : val(planned)}
      </span>
      <span className="cmp-item-valor cmp-item-real">
        <span className="sr-only">Realizado: </span>{val(actual)}
      </span>
      <span className="cmp-item-valor cmp-item-dif">
        <span className="sr-only">Diferença: </span>
        <Diferenca planned={semPlanejado ? actual : planned} actual={actual} quantidade={quantidade} forte={nivel !== "item"} />
      </span>
      {acao && <span className="cmp-item-acao">{acao}</span>}
    </div>
  );
}

export interface LinhaDoBloco {
  rotulo: string;
  planned: number;
  actual: number;
  quantidade?: boolean;
  /** `false`: não entra no subtotal (ex.: valor unitário). */
  soma?: boolean;
}

/** Categoria do extrato: cabeçalho com o subtotal e as parcelas embaixo. */
export function BlocoDoExtrato({ titulo, cor, linhas, subtotal }: {
  titulo: string; cor: string; linhas: LinhaDoBloco[];
  /** Subtotal dado de fora (diárias: derivado do total gravado, não da soma das linhas). */
  subtotal?: { planned: number; actual: number };
}) {
  const somadas = linhas.filter(l => !l.quantidade && l.soma !== false);
  const plan = subtotal ? subtotal.planned : somadas.reduce((s, l) => s + l.planned, 0);
  const real = subtotal ? subtotal.actual : somadas.reduce((s, l) => s + l.actual, 0);
  const diverge = plan !== real || linhas.some(l => l.planned !== l.actual);
  return (
    <div role="group" aria-label={titulo} className="cmp-bloco">
      <LinhaDoExtrato
        nivel="grupo"
        cor={cor}
        rotulo={titulo}
        planned={plan}
        actual={real}
        extra={diverge ? (
          <span className="pla-chip shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded-md border border-warning/25 bg-warning-soft text-2xs font-medium text-warning whitespace-nowrap" title="Alguma parcela desta categoria difere do planejado">
            <AlertTriangle className="w-3 h-3" aria-hidden="true" /><span className="cmp-chip-texto">Divergência</span>
          </span>
        ) : undefined}
      />
      {linhas.map(l => (
        <LinhaDoExtrato key={l.rotulo} rotulo={l.rotulo} planned={l.planned} actual={l.actual} quantidade={l.quantidade} />
      ))}
    </div>
  );
}

/** Cabeçalho das colunas do extrato (modal de divisão e lista estreita). */
export function CabecalhoDoExtrato({ rotulo = "Item" }: { rotulo?: string }) {
  return (
    <div className="cmp-item cmp-item-cabecalho" aria-hidden="true">
      <span className="cmp-item-rotulo">{rotulo}</span>
      <span className="cmp-item-valor cmp-item-plan">Planejado</span>
      <span className="cmp-item-valor cmp-item-real">Realizado</span>
      <span className="cmp-item-valor cmp-item-dif">Diferença</span>
    </div>
  );
}
