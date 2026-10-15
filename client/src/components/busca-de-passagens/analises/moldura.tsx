/**
 * Moldura comum das abas de análise da Busca (etapa 2, 09/10): a linha de
 * cima (o que a aba responde · período), os estados (carregando no formato
 * real, erro com "Tentar de novo", vazio com saída), o aviso de amostra
 * pequena e o selo de FONTE — todo número diz se veio do que foi PESQUISADO
 * (consultas ao fornecedor) ou do que foi PAGO (passagens registradas).
 *
 * As peças de gráfico são as da aba Análises de Passagens (Painel, Numero,
 * LinhaDeBarra, Segmentado) — a mesma família visual.
 */
import type { ReactNode } from "react";
import { AlertCircle, Info, RotateCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api-error";
import { Segmentado } from "@/components/tickets/analises/partes";
import type { PeriodoDaAnalise } from "../filtros-da-busca";

const PERIODOS: ReadonlyArray<readonly [PeriodoDaAnalise, string]> = [["90", "90 dias"], ["180", "6 meses"], ["365", "12 meses"], ["tudo", "Tudo"]];
export const ROTULO_DO_PERIODO: Record<PeriodoDaAnalise, string> = { "90": "nos últimos 90 dias", "180": "nos últimos 6 meses", "365": "nos últimos 12 meses", tudo: "em todo o histórico" };

/** A linha de cima de cada aba: a pergunta que ela responde e o período. */
export function TopoDaAnalise({ pergunta, periodo, onPeriodo, atualizando, extra }: {
  pergunta: ReactNode;
  periodo?: PeriodoDaAnalise;
  onPeriodo?: (p: PeriodoDaAnalise) => void;
  atualizando?: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-testid="topo-da-analise">
      <p className="m-0 min-w-0 flex-1 basis-[280px] text-sm leading-5 text-slate-600">{pergunta}</p>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {extra}
        {atualizando && <span className="text-2xs text-muted-foreground" role="status">Atualizando…</span>}
        {periodo && onPeriodo && <Segmentado valor={periodo} opcoes={PERIODOS} onChange={onPeriodo} rotulo="Período" testid="periodo-analise" />}
      </div>
    </div>
  );
}

/** "Pesquisado" / "Pago" — de onde vem o número. */
export function Fonte({ tipo, className }: { tipo: "pesquisado" | "pago" | "estimado"; className?: string }) {
  const t = {
    pesquisado: { texto: "Pesquisado", cls: "bg-info-soft text-info-strong", dica: "Menor preço das consultas reais ao fornecedor" },
    pago: { texto: "Pago", cls: "bg-muted text-slate-700", dica: "Valor das passagens registradas" },
    estimado: { texto: "Estimativa", cls: "bg-warning-soft text-warning-strong", dica: "Cálculo a partir do histórico — não é certeza" },
  }[tipo];
  return <span className={cn("inline-flex h-[18px] shrink-0 items-center rounded px-1.5 text-2xs font-semibold uppercase tracking-[0.05em]", t.cls, className)} title={t.dica}>{t.texto}</span>;
}

/** Amostra pequena: o número aparece, mas a tela diz para ler como indício. */
export function AvisoDeAmostra({ children, testid = "amostra-pequena" }: { children: ReactNode; testid?: string }) {
  return (
    <p className="m-0 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs leading-5 text-warning" data-testid={testid}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Esqueleto no formato real: faixa de números + painéis com linhas de barra. */
export function EsqueletoDaAnalise({ paineis = 2, linhas = 5, numeros = 4 }: { paineis?: number; linhas?: number; numeros?: number }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-4" data-testid="analise-busca-carregando">
      <span className="sr-only">Carregando a análise…</span>
      <div aria-hidden="true" className="rounded-xl border border-border bg-card px-4 py-4"><div className="pas-osso h-3.5 w-3/4" /><div className="pas-osso mt-2 h-3.5 w-1/2" /></div>
      {numeros > 0 && (
        <div aria-hidden="true" className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border", numeros === 4 ? "md:grid-cols-4" : "md:grid-cols-3")}>
          {Array.from({ length: numeros }).map((_, i) => (
            <div key={i} className="space-y-2 bg-card px-4 py-3.5"><div className="pas-osso h-3 w-20" /><div className="pas-osso h-6 w-28" /><div className="pas-osso h-2.5 w-24" /></div>
          ))}
        </div>
      )}
      <div aria-hidden="true" className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: paineis }).map((_, p) => (
          <div key={p} className="rounded-xl border border-border bg-card">
            <div className="space-y-1.5 border-b border-border px-4 py-3"><div className="pas-osso h-3.5 w-44" /><div className="pas-osso h-2.5 w-64" /></div>
            <div className="space-y-3 px-4 py-4">
              {Array.from({ length: linhas }).map((_, i) => (
                <div key={i} className="flex items-center gap-3"><div className="pas-osso h-3 w-16" /><div className="pas-osso h-2 flex-1" /><div className="pas-osso h-3 w-14" /></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Erro, vazio e sem resultado: o mesmo cartão central da família, com saída. */
export function EstadoDaAnalise({ icone, titulo, texto, acao, tom, testid }: {
  icone?: ReactNode; titulo: string; texto: ReactNode; acao?: ReactNode; tom?: "erro"; testid: string;
}) {
  return (
    <div
      role={tom === "erro" ? "alert" : undefined}
      className={cn("pas-entra flex flex-col items-center rounded-xl border bg-card px-6 py-14 text-center", tom === "erro" ? "border-danger/25" : "border-border")}
      data-testid={testid}
    >
      <span className={cn("mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full", tom === "erro" ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground")} aria-hidden="true">
        {icone ?? (tom === "erro" ? <AlertCircle className="h-5 w-5" /> : <Search className="h-5 w-5" />)}
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">{titulo}</h2>
      <div className="m-0 mt-1.5 max-w-[480px] text-sm leading-relaxed text-muted-foreground">{texto}</div>
      {acao && <div className="mt-5 flex flex-wrap justify-center gap-2">{acao}</div>}
    </div>
  );
}

export function ErroDaAnalise({ erro, onTentar }: { erro: unknown; onTentar: () => void }) {
  return (
    <EstadoDaAnalise
      testid="analise-busca-erro"
      tom="erro"
      titulo="Não foi possível carregar esta análise"
      texto={apiErrorMessage(erro, "Verifique a conexão e tente de novo.")}
      acao={<Button variant="outline" onClick={onTentar} className="rounded-lg" data-testid="analise-busca-tentar"><RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Tentar de novo</Button>}
    />
  );
}

/** As frases do topo ("Mais barato comprando com…"): a resposta antes do gráfico. */
export function Frases({ itens, testid = "frases-do-topo" }: { itens: Array<{ chave: string; texto: ReactNode; fonte: "pesquisado" | "pago" | "estimado"; tom?: "bom" | "ruim" | null }>; testid?: string }) {
  if (itens.length === 0) return null;
  return (
    <ul className="m-0 grid list-none gap-px overflow-hidden rounded-xl border border-border bg-border p-0 lg:grid-cols-2" data-testid={testid}>
      {itens.map((f, i) => (
        <li key={f.chave} className={cn("flex items-start gap-3 bg-card px-4 py-3.5", itens.length % 2 === 1 && i === itens.length - 1 && "lg:col-span-2")}>
          <Fonte tipo={f.fonte} className="mt-0.5" />
          <p className="m-0 min-w-0 text-[13px] leading-5 text-slate-700">{f.texto}</p>
        </li>
      ))}
    </ul>
  );
}

/** "+34%" / "−12%" com sinal tipográfico e cor de significado (mais caro = vermelho). */
export function Pct({ valor, invertido, className }: { valor: number | null | undefined; invertido?: boolean; className?: string }) {
  if (valor === null || valor === undefined) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const ruim = invertido ? valor < 0 : valor > 0;
  const cor = valor === 0 ? "text-muted-foreground" : ruim ? "text-danger" : "text-success";
  return <span className={cn("font-semibold tabular-nums", cor, className)}>{valor > 0 ? "+" : valor < 0 ? "−" : ""}{Math.abs(valor)}%</span>;
}
