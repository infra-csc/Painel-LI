// Transporte terrestre na linha de Passagens (16/10).
//
// Na coluna Viagem: "Ida e volta · Van" / "Transluz · R$ 150,00" (clicar
// edita), com "parte de R$ 1.200,00 · 8 vagas" quando a vaga divide a van
// com outras (21/10) — e, na vaga sem passagem, o atalho "Vai de carro/van",
// que já vem com o tipo marcado quando a Sugestão diz "van - 7h saindo".
import { memo } from "react";
import { Car, Pencil } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import {
  NOME_DA_PERNA,
  NOME_DO_MODO,
  entradasDaViagem,
  modoSugerido,
  reaisDoTerrestre,
  sugestaoTerrestreDaVaga,
  textoDoGrupo,
  type CoberturaTerrestre,
  type ModoDeRegistro,
  type PernaDaViagem,
  type TrechoTerrestre,
} from "@shared/transporte-terrestre";
import { ICONE_DO_MODO } from "./campos-do-terrestre";

const tituloDasPernas = (pernas: readonly PernaDaViagem[]) => (pernas.length === 2 ? "Ida e volta" : NOME_DA_PERNA[pernas[0]]);

/**
 * As pernas terrestres da vaga. A mesma viagem (mesmo modo, empresa e grupo)
 * é uma entrada só, com o valor da viagem toda. Com `onEditar`, viram botões:
 * uma entrada só abre a vaga inteira; ida e volta de transportes diferentes
 * abrem cada uma a sua perna.
 */
export const LinhasDoTerrestre = memo(function LinhasDoTerrestre({ terrestres, cobertura, inclusionId, onEditar, onRegistrarFalta, mostrarFalta }: {
  terrestres: readonly TrechoTerrestre[];
  cobertura: CoberturaTerrestre | undefined;
  inclusionId: string;
  onEditar?: (pernas?: PernaDaViagem[]) => void;
  /** A perna que falta também pode ser de carro/van (ida de van, volta de carro). */
  onRegistrarFalta?: (pernas: PernaDaViagem[]) => void;
  /** Vaga sem passagem: diz qual perna ainda falta comprar. */
  mostrarFalta?: boolean;
}) {
  if (terrestres.length === 0) return null;
  const entradas = entradasDaViagem(terrestres);
  const varias = entradas.length > 1;
  const falta = mostrarFalta && cobertura && !cobertura.cobreTudo ? cobertura.semTerrestre : [];
  return (
    <div className="flex flex-col gap-1" data-testid={`terrestre-${inclusionId}`}>
      {entradas.map((e) => {
        const t = e.trechos[0];
        const Icone = ICONE_DO_MODO[t.modo] ?? Car;
        const chave = e.pernas.join("-");
        const conteudo = (
          <span className="flex flex-col min-w-0">
            <span className="flex items-center gap-1 text-xs leading-4 whitespace-nowrap">
              <Icone className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
              <span className="font-semibold text-slate-700">{tituloDasPernas(e.pernas)} · {NOME_DO_MODO[t.modo]}</span>
            </span>
            <span className="pl-[18px] text-2xs leading-4 text-muted-foreground break-words">
              {t.empresa ? `${t.empresa} · ` : ""}<span className="tabular-nums whitespace-nowrap">{reaisDoTerrestre(e.totalCentavos)}</span>
            </span>
            {t.grupo && (
              <span className="pl-[18px] text-2xs leading-4 text-muted-foreground tabular-nums break-words" data-testid={`terrestre-grupo-${inclusionId}`}>
                {textoDoGrupo(t.grupo)}
              </span>
            )}
          </span>
        );
        if (!onEditar) return <span key={chave}>{conteudo}</span>;
        return (
          <button
            key={chave}
            type="button"
            onClick={(ev) => { ev.stopPropagation(); onEditar(varias ? e.pernas : undefined); }}
            className="pas-alvo group/terrestre -mx-1 px-1 py-0.5 rounded-md text-left hover:bg-success-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring inline-flex items-start gap-1 max-w-full"
            title="Editar ou desfazer o transporte terrestre"
            aria-label={`Editar o transporte terrestre: ${tituloDasPernas(e.pernas)} de ${NOME_DO_MODO[t.modo].toLowerCase()}${t.empresa ? ` (${t.empresa})` : ""}, ${reaisDoTerrestre(e.totalCentavos)}${t.grupo ? `, ${textoDoGrupo(t.grupo)}` : ""}`}
            data-testid={varias ? `editar-terrestre-${inclusionId}-${chave}` : `editar-terrestre-${inclusionId}`}
          >
            {conteudo}
            <Pencil className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground opacity-0 group-hover/terrestre:opacity-100 group-focus-visible/terrestre:opacity-100" aria-hidden="true" />
          </button>
        );
      })}
      {falta.length > 0 && (
        <span className="text-2xs italic text-muted-foreground">
          {falta.map((p) => NOME_DA_PERNA[p]).join(" e ")}: passagem não comprada
          {onRegistrarFalta && (
            <>
              {" · "}
              <button
                type="button"
                onClick={(ev) => { ev.stopPropagation(); onRegistrarFalta(falta); }}
                className="pas-alvo not-italic font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                data-testid={`terrestre-falta-${inclusionId}`}
              >
                de carro/van?
              </button>
            </>
          )}
        </span>
      )}
    </div>
  );
});

/**
 * "Vai de carro/van" — o atalho da vaga sem passagem. Quando a Sugestão já
 * diz carro ou van ("van - 7h saindo", "14h carro"), o botão diz qual e abre
 * com ele. "9h - onibus" deixa o atalho neutro: ônibus de linha é passagem
 * rodoviária (ver `modoSugerido`).
 */
export const AtalhoDoTerrestre = memo(function AtalhoDoTerrestre({ inclusion, onAbrir }: {
  inclusion: TeamInclusion;
  onAbrir: (inclusion: TeamInclusion, modo?: ModoDeRegistro) => void;
}) {
  const modo = modoSugerido(sugestaoTerrestreDaVaga(inclusion));
  const Icone = modo ? ICONE_DO_MODO[modo] : Car;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAbrir(inclusion, modo); }}
      className={`pas-alvo mt-1 inline-flex items-center gap-1 h-7 px-2 rounded-md border text-2xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${modo
        ? "border-success/30 bg-success-soft text-success-strong hover:bg-success-soft/70"
        : "border-border bg-card text-slate-600 hover:bg-surface-muted hover:text-foreground"}`}
      title={modo ? `A Sugestão indica ${NOME_DO_MODO[modo].toLowerCase()} — registrar sem passagem aérea` : "Registrar que vai de carro ou van (sem passagem aérea)"}
      data-testid={`atalho-terrestre-${inclusion.id}`}
    >
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
      {modo ? `Vai de ${NOME_DO_MODO[modo].toLowerCase()}` : "Vai de carro/van"}
    </button>
  );
});
