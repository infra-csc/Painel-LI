/**
 * "Na arena agora (N)" (27/10): quem fez a entrada HOJE e ainda não saiu —
 * a pergunta que o produtor faz de hora em hora. Cada nome leva à pessoa na
 * lista. Fora dos dias do evento a faixa diz isso, em vez de "ninguém".
 */
import { Radio } from "lucide-react";
import { toTitleCase } from "@/lib/format";
import { dataHoraBr } from "./presenca-utils";
import type { NaArena } from "./tipos";

export function FaixaNaArena({ pessoas, emAndamento, atualizadoEm, onIr }: {
  pessoas: NaArena[];
  /** Hoje está entre os dias do evento? */
  emAndamento: boolean;
  atualizadoEm: number;
  onIr: (actualId: string) => void;
}) {
  const n = pessoas.length;
  return (
    <section aria-labelledby="prs-arena-titulo" className="prs-arena" data-testid="prs-na-arena">
      <div className="prs-arena-cabeca">
        <span className={n > 0 ? "prs-arena-ponto prs-arena-ponto-vivo" : "prs-arena-ponto"} aria-hidden="true" />
        <h2 id="prs-arena-titulo" className="m-0 text-sm font-semibold text-foreground">
          Na arena agora <span className="tabular-nums text-muted-foreground font-medium">({n})</span>
        </h2>
        <span className="ml-auto inline-flex items-center gap-1 text-2xs text-muted-foreground" title="A lista se atualiza sozinha a cada minuto">
          <Radio className="w-3 h-3" aria-hidden="true" />atualizado {dataHoraBr(new Date(atualizadoEm).toISOString()).slice(-5)}
        </span>
      </div>
      {n === 0 ? (
        <p className="m-0 px-4 pb-3 text-xs text-muted-foreground">
          {emAndamento ? "Ninguém com entrada aberta agora: quem entrou hoje já saiu, ou ainda não chegou." : "Hoje não é dia de evento para esta equipe."}
        </p>
      ) : (
        <ul className="prs-arena-lista" aria-label="Pessoas na arena agora">
          {pessoas.map((a) => (
            <li key={a.actualId} className="min-w-0 max-w-full">
              <button type="button" onClick={() => onIr(a.actualId)} className="prs-arena-pessoa" title={`Ir para ${a.colaborador ?? "a pessoa"} na lista`}>
                <span className="min-w-0 truncate font-medium text-foreground">{a.colaborador ? toTitleCase(a.colaborador) : "—"}</span>
                <span className="min-w-0 max-w-[40%] truncate text-muted-foreground">{a.funcao ?? ""}</span>
                {a.desde && <span className="shrink-0 tabular-nums text-success">desde {a.desde}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
