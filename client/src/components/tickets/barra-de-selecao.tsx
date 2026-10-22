// Barra de seleção de Passagens (07/10): acompanha a rolagem no rodapé da
// lista com as ações para as vagas marcadas. "Emitida" em lote é o aviso de
// "o bilhete saiu" para várias pessoas de uma vez — não preenche nada.
//
// 22/10 (#4705, #4706, #4707, #4711, #4724 — "eu cliquei para ir de van,
// quando fechou mudou para aéreo"): com o painel no modo Carro/van aberto, o
// botão azul desta barra era o "Marcar como emitida" — quem preencheu a van
// clicava nele achando que confirmava, e o carimbo criava passagens aéreas em
// branco. Nesse modo o carimbo some daqui e o botão principal é o "Registrar"
// do carro/van, o mesmo do painel: só um caminho, e é o certo.
import { Car, Layers, PlaneTakeoff, Stamp, X } from "lucide-react";

interface BarraDeSelecaoProps {
  nSel: number;
  onLimpar: () => void;
  /** Só admin e Compras carimbam a emissão. */
  podeEmitir: boolean;
  onMarcarEmitidas: () => void;
  emitindo: boolean;
  canEdit: boolean;
  /** "Vai de carro/van (N)": abre o painel no modo Carro/van. */
  onTerrestre: () => void;
  /** "Preencher dados em lote": só com o painel fechado. */
  onPreencherLote?: () => void;
  onBuscarPrecos?: () => void;
  /** O painel está aberto no modo Carro/van. */
  loteTerrestreAberto: boolean;
  /** O "Registrar em N vagas" do painel de carro/van. */
  onRegistrarTerrestre: () => void;
}

const SECUNDARIO = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-background/25 text-xs font-semibold text-background hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60";
const PRINCIPAL = "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60";

export function BarraDeSelecao({
  nSel, onLimpar, podeEmitir, onMarcarEmitidas, emitindo, canEdit, onTerrestre, onPreencherLote, onBuscarPrecos,
  loteTerrestreAberto, onRegistrarTerrestre,
}: BarraDeSelecaoProps) {
  if (nSel <= 0) return null;
  const terrestre = loteTerrestreAberto && canEdit;
  return (
    <div className="sticky bottom-3 z-20 pas-sobe" data-testid="barra-selecao">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-foreground text-background shadow-3 pl-4 pr-2 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <p className="m-0 text-sm font-semibold tabular-nums" aria-live="polite">
              {nSel} {nSel === 1 ? "passagem selecionada" : "passagens selecionadas"}
            </p>
            <button
              type="button"
              onClick={onLimpar}
              className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-xs font-medium text-background/75 hover:bg-background/10 hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
              data-testid="limpar-selecao"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar seleção
            </button>
          </div>
          {terrestre ? (
            <p className="m-0 hidden lg:block text-2xs leading-4 text-background/65 truncate" data-testid="barra-dica-terrestre">
              Preencha carro ou van no painel e registre — sem passagem a comprar.
            </p>
          ) : podeEmitir && (
            <p className="m-0 hidden lg:block text-2xs leading-4 text-background/65 truncate">
              Marcar como emitida registra que o bilhete saiu. Os dados da passagem continuam podendo ser preenchidos depois.
            </p>
          )}
        </div>
        {/* min-w-0 (21/10): com shrink-0 os botões não quebravam linha e a barra alargava a página no celular. */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {onBuscarPrecos && !terrestre && (
            <button
              type="button"
              onClick={onBuscarPrecos}
              title="Abre a Busca de passagens com estas escalações selecionadas — antes de gastar, ela mostra quantas consultas usa"
              className={SECUNDARIO}
              data-testid="buscar-precos-selecao"
            >
              <PlaneTakeoff className="w-4 h-4" aria-hidden="true" />Buscar preços
            </button>
          )}
          {canEdit && !terrestre && (
            <button
              type="button"
              onClick={onTerrestre}
              title="Carro (só o valor) ou van (empresa e valor total da van) para as vagas marcadas — sem passagem a comprar"
              className={SECUNDARIO}
              data-testid="terrestre-selecao"
            >
              <Car className="w-4 h-4" aria-hidden="true" />Vai de carro/van ({nSel})
            </button>
          )}
          {canEdit && onPreencherLote && (
            <button type="button" onClick={onPreencherLote} className={SECUNDARIO} data-testid="preencher-lote-selecao">
              <Layers className="w-4 h-4" aria-hidden="true" />Preencher dados em lote
            </button>
          )}
          {terrestre ? (
            <button type="button" onClick={onRegistrarTerrestre} className={PRINCIPAL} data-testid="registrar-terrestre-selecao">
              <Car className="w-4 h-4" aria-hidden="true" />
              {`Registrar carro/van em ${nSel} ${nSel === 1 ? "vaga" : "vagas"}`}
            </button>
          ) : podeEmitir && (
            <button
              type="button"
              onClick={onMarcarEmitidas}
              disabled={emitindo}
              title="Registra que o bilhete saiu. Os dados da passagem continuam podendo ser preenchidos depois."
              className={PRINCIPAL}
              data-testid="marcar-emitidas-lote"
            >
              <Stamp className="w-4 h-4" aria-hidden="true" />
              {emitindo ? "Marcando…" : `Marcar como emitida (${nSel})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
