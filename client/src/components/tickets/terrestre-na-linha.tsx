// Transporte terrestre na linha de Passagens (16/10).
//
// Na coluna Viagem: "Ida · Van · Transluz · R$ 600,00" por perna (clicar
// edita), e — na vaga sem passagem — o atalho "Vai de carro/van", que já
// vem com o tipo marcado quando a Sugestão diz "van - 7h saindo".
import { memo } from "react";
import { Car, Pencil } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import {
  NOME_DA_PERNA,
  NOME_DO_MODO,
  reaisDoTerrestre,
  sugestaoTerrestreDaVaga,
  type CoberturaTerrestre,
  type ModoTerrestre,
  type TrechoTerrestre,
} from "@shared/transporte-terrestre";
import { ICONE_DO_MODO } from "./campos-do-terrestre";

/** As pernas terrestres da vaga, uma por linha. Com `onEditar`, viram um botão. */
export const LinhasDoTerrestre = memo(function LinhasDoTerrestre({ terrestres, cobertura, inclusionId, onEditar, mostrarFalta }: {
  terrestres: readonly TrechoTerrestre[];
  cobertura: CoberturaTerrestre | undefined;
  inclusionId: string;
  onEditar?: () => void;
  /** Vaga sem passagem: diz qual perna ainda falta comprar. */
  mostrarFalta?: boolean;
}) {
  if (terrestres.length === 0) return null;
  const ordem = [...terrestres].sort((a, b) => (a.trecho === b.trecho ? 0 : a.trecho === "ida" ? -1 : 1));
  // Ida e volta iguais (o caso comum: a mesma van leva e traz) numa entrada
  // só — duas entradas idênticas viravam seis linhas na coluna.
  const iguais = ordem.length === 2 && ordem[0].modo === ordem[1].modo
    && (ordem[0].empresa ?? "") === (ordem[1].empresa ?? "") && ordem[0].valorCentavos === ordem[1].valorCentavos;
  const entradas = iguais
    ? [{ chave: "ambas", titulo: "Ida e volta", t: ordem[0], sufixo: " cada trecho" }]
    : ordem.map((t) => ({ chave: t.trecho, titulo: NOME_DA_PERNA[t.trecho], t, sufixo: "" }));
  const conteudo = (
    <span className="flex flex-col gap-1 min-w-0">
      {entradas.map(({ chave, titulo, t, sufixo }) => {
        const Icone = ICONE_DO_MODO[t.modo] ?? Car;
        return (
          <span key={chave} className="flex flex-col min-w-0">
            <span className="flex items-center gap-1 text-xs leading-4 whitespace-nowrap">
              <Icone className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
              <span className="font-semibold text-slate-700">{titulo} · {NOME_DO_MODO[t.modo]}</span>
            </span>
            <span className="pl-[18px] text-2xs leading-4 text-muted-foreground break-words">
              {t.empresa ? `${t.empresa} · ` : ""}<span className="tabular-nums whitespace-nowrap">{reaisDoTerrestre(t.valorCentavos)}{sufixo}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
  return (
    <div className="flex flex-col gap-1" data-testid={`terrestre-${inclusionId}`}>
      {onEditar ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEditar(); }}
          className="group/terrestre -mx-1 px-1 py-0.5 rounded-md text-left hover:bg-success-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring inline-flex items-start gap-1 max-w-full"
          title="Editar ou desfazer o transporte terrestre"
          aria-label={`Editar o transporte terrestre: ${ordem.map((t) => `${NOME_DA_PERNA[t.trecho]} de ${NOME_DO_MODO[t.modo].toLowerCase()}, ${reaisDoTerrestre(t.valorCentavos)}`).join("; ")}`}
          data-testid={`editar-terrestre-${inclusionId}`}
        >
          {conteudo}
          <Pencil className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground opacity-0 group-hover/terrestre:opacity-100 group-focus-visible/terrestre:opacity-100" aria-hidden="true" />
        </button>
      ) : conteudo}
      {mostrarFalta && cobertura && !cobertura.cobreTudo && cobertura.semTerrestre.length > 0 && (
        <span className="text-2xs italic text-muted-foreground">
          {cobertura.semTerrestre.map((p) => NOME_DA_PERNA[p]).join(" e ")}: passagem não comprada
        </span>
      )}
    </div>
  );
});

/**
 * "Vai de carro/van" — o atalho da vaga sem passagem. Quando a Sugestão já
 * diz o tipo ("van - 7h saindo", "14h carro"), o botão diz qual e abre com ele.
 */
export const AtalhoDoTerrestre = memo(function AtalhoDoTerrestre({ inclusion, onAbrir }: {
  inclusion: TeamInclusion;
  onAbrir: (inclusion: TeamInclusion, modo?: ModoTerrestre) => void;
}) {
  const sugestao = sugestaoTerrestreDaVaga(inclusion);
  const modo = sugestao.ida ?? sugestao.volta;
  const Icone = modo ? ICONE_DO_MODO[modo] : Car;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAbrir(inclusion, modo); }}
      className={`mt-1 inline-flex items-center gap-1 h-7 px-2 rounded-md border text-2xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${modo
        ? "border-success/30 bg-success-soft text-success-strong hover:bg-success-soft/70"
        : "border-border bg-card text-slate-600 hover:bg-surface-muted hover:text-foreground"}`}
      title={modo ? `A Sugestão indica ${NOME_DO_MODO[modo].toLowerCase()} — registrar sem passagem aérea` : "Registrar que vai de carro, van ou ônibus (sem passagem aérea)"}
      data-testid={`atalho-terrestre-${inclusion.id}`}
    >
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
      {modo ? `Vai de ${NOME_DO_MODO[modo].toLowerCase()}` : "Vai de carro/van"}
    </button>
  );
});
