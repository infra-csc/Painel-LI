// Aviso das vagas que o "Marcar como emitida" PULOU por irem de carro/van
// (22/10, vaga #4724). O toast some sozinho; este aviso fica na tela até a
// pessoa registrar o terrestre ou fechar — com o motivo de cada vaga e o
// atalho que abre o "Vai de carro/van" só para elas.
import { Car, Info, X } from "lucide-react";
import { puladasParaRegistrar, type VagaPulada } from "./mensagem-da-emissao";

interface PuladosDaEmissaoProps {
  pulados: readonly VagaPulada[];
  /** "#4724 Marina Souza" — vaga fora do recorte atual volta null e aparece só com o motivo. */
  nomeDaVaga: (inclusionId: string) => string | null;
  /** Abre o "Vai de carro/van" para estas vagas (sem permissão: ausente). */
  onRegistrar?: (pulados: VagaPulada[]) => void;
  onFechar: () => void;
}

/** Quantos nomes aparecem antes do "e mais N". */
const MAX_NOMES = 6;

export function PuladosDaEmissao({ pulados, nomeDaVaga, onRegistrar, onFechar }: PuladosDaEmissaoProps) {
  if (pulados.length === 0) return null;
  const paraRegistrar = puladasParaRegistrar(pulados);
  const visiveis = pulados.slice(0, MAX_NOMES);
  const resto = pulados.length - visiveis.length;
  const n = pulados.length;
  return (
    <div
      className="pas-entra flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-warning-strong/30 bg-warning-soft/60 px-4 py-3"
      role="status"
      data-testid="pulados-da-emissao"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-semibold text-foreground">
          {n === 1 ? "1 vaga não foi marcada como emitida" : `${n} vagas não foram marcadas como emitidas`}
          <span className="font-normal text-slate-600"> — nenhuma passagem foi criada {n === 1 ? "nela" : "nelas"}.</span>
        </p>
        <ul className="m-0 mt-1.5 list-none space-y-0.5 p-0">
          {visiveis.map((p) => (
            <li key={p.id} className="text-xs leading-5 text-slate-700" data-testid={`pulado-${p.id}`}>
              {nomeDaVaga(p.id) && <span className="font-semibold text-foreground">{nomeDaVaga(p.id)}</span>}
              {nomeDaVaga(p.id) && <span aria-hidden="true"> · </span>}
              <span>{p.motivo}</span>
            </li>
          ))}
          {resto > 0 && <li className="text-xs leading-5 text-muted-foreground">e mais {resto}</li>}
        </ul>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onRegistrar && paraRegistrar.length > 0 && (
          <button
            type="button"
            onClick={() => onRegistrar(paraRegistrar)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/40 bg-card px-3 text-xs font-semibold text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="pulados-registrar-terrestre"
          >
            <Car className="h-3.5 w-3.5" aria-hidden="true" />
            {paraRegistrar.length === 1 ? "Vai de carro/van" : `Vai de carro/van (${paraRegistrar.length})`}
          </button>
        )}
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar o aviso das vagas puladas"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="pulados-fechar"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
