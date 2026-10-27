/**
 * Dias com 1,5 diária (28/10, pedido do DP — regra em shared/meia-diaria.ts).
 *
 * A mesma fileira de dias nos três lugares que marcam o "1,5" — a vaga
 * (Inclusão e Escalação), o ajuste do Planejado e os dias trabalhados do
 * Realizado: cada dia é um botão de alternar (aria-pressed); marcado fica na
 * cor de informação com "1,5×", para não se confundir com o âmbar do fim de
 * semana. O valor do ½ (quando a tela sabe) vai no título e no resumo.
 */
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import { MEIA_DIARIA_ROTULO } from "@shared/meia-diaria";

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "ter 02/09" a partir de "2026-09-02" (meio-dia: sem pular dia no fuso). */
export function rotuloDoDia(iso: string): { semana: string; data: string } {
  const d = new Date(`${iso}T12:00:00`);
  return { semana: SEMANA[d.getDay()] ?? "", data: `${iso.slice(8, 10)}/${iso.slice(5, 7)}` };
}

export interface DiaDaFileira {
  dia: string;
  /** Valor do ½ deste dia, se a tela souber (centavos). */
  valorCents?: number;
  /** Dia que não pode ser marcado (ex.: sem diária neste dia) — com o porquê. */
  bloqueio?: string;
}

export function FileiraDeMeiaDiaria({ dias, marcados, onAlternar, desabilitado, rotuloId, testId }: {
  dias: readonly DiaDaFileira[];
  marcados: ReadonlySet<string>;
  onAlternar: (dia: string) => void;
  desabilitado?: boolean;
  /** id do texto que nomeia o grupo (aria-labelledby). */
  rotuloId?: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={rotuloId} data-testid={testId}>
      {dias.map(({ dia, valorCents, bloqueio }) => {
        const marcado = marcados.has(dia);
        const { semana, data } = rotuloDoDia(dia);
        const travado = desabilitado || (!!bloqueio && !marcado);
        const valor = valorCents && valorCents > 0 ? ` (+${formatarMoeda(valorCents)})` : "";
        return (
          <button
            key={dia}
            type="button"
            aria-pressed={marcado}
            disabled={travado}
            onClick={() => onAlternar(dia)}
            title={bloqueio && !marcado ? bloqueio : marcado ? `${MEIA_DIARIA_ROTULO}${valor} — clique para tirar` : `Marcar ${semana} ${data} com ${MEIA_DIARIA_ROTULO}${valor}`}
            aria-label={`${semana} ${data}${marcado ? `, ${MEIA_DIARIA_ROTULO}` : ""}`}
            className={cn(
              "pas-alvo inline-flex items-center gap-1 h-7 px-2 rounded-md border text-2xs font-medium tabular-nums transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed",
              marcado
                ? "bg-info-soft text-info border-info/40"
                : "bg-card text-slate-600 border-border border-dashed hover:border-info/50 hover:text-foreground",
            )}
          >
            <span className="text-muted-foreground">{semana}</span>
            <span>{data}</span>
            {marcado && <span className="ml-0.5 rounded px-1 bg-info text-white text-[11px] leading-4 font-semibold">1,5×</span>}
          </button>
        );
      })}
    </div>
  );
}
