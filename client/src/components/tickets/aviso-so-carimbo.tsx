// Passagem que é SÓ o carimbo de emissão (22/10, vaga #4724 — "finalizei como
// VAN"). "Marcar como emitida" numa vaga sem passagem cria uma linha sem
// nenhum dado; aberta, ela parecia uma passagem aérea comprada (Modalidade
// Aérea, LOC vazio, valor 0). O aviso diz o que ela é e dá as saídas: foi de
// carro/van, ou foi engano (desfazer). Se o bilhete saiu mesmo, o rodapé do
// modal tem "Preencher dados".
import { Car, Loader2, Stamp, Undo2 } from "lucide-react";

export const TEXTO_SO_CARIMBO = "Esta passagem foi só marcada como emitida — nenhum dado foi preenchido";
/** Rótulo curto da linha e do resumo. */
export const ROTULO_SO_CARIMBO = "Marcada como emitida · sem dados";

interface AvisoSoCarimboProps {
  sid: string;
  /** "Vai de carro/van em vez de avião?" — troca o modal pelo do terrestre. */
  onTerrestre?: () => void;
  /** "Desfazer emissão" — apaga a linha vazia e a vaga volta para Comprar. */
  onDesfazer?: () => void;
  desfazendo?: boolean;
  className?: string;
}

const BOTAO = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed";

export function AvisoSoCarimbo({ sid, onTerrestre, onDesfazer, desfazendo, className = "" }: AvisoSoCarimboProps) {
  return (
    <div
      className={`flex flex-wrap items-start gap-x-3 gap-y-2.5 border-b border-warning-strong/25 bg-warning-soft/70 px-5 sm:px-6 py-3 ${className}`}
      role="status"
      data-testid={`aviso-so-carimbo-${sid}`}
    >
      <Stamp className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-[260px]">
        <p className="m-0 text-sm font-semibold leading-5 text-foreground">{TEXTO_SO_CARIMBO}</p>
        <p className="m-0 mt-0.5 text-xs leading-5 text-slate-600">
          Não há modalidade, LOC nem valor. Se a pessoa vai de carro ou van, registre o transporte terrestre; se foi engano, desfaça a emissão.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onTerrestre && (
          <button type="button" onClick={onTerrestre} className={`${BOTAO} border border-primary/40 bg-card text-primary hover:bg-brand-soft`} data-testid={`so-carimbo-terrestre-${sid}`}>
            <Car className="h-3.5 w-3.5" aria-hidden="true" />Vai de carro/van em vez de avião?
          </button>
        )}
        {onDesfazer && (
          <button type="button" onClick={onDesfazer} disabled={desfazendo} className={`${BOTAO} border border-border bg-card text-foreground hover:bg-muted`} data-testid={`so-carimbo-desfazer-${sid}`}>
            {desfazendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {desfazendo ? "Desfazendo…" : "Desfazer emissão"}
          </button>
        )}
      </div>
    </div>
  );
}
