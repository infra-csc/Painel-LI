/**
 * Onde o gasto se concentra: rotas da ida, companhias e transporte, com o
 * total de bagagem embaixo (fora do preço médio, que é só da passagem).
 */
import type { AnaliseDePassagens, GrupoNomeado } from "@shared/analise-de-passagens";
import { moeda, plural } from "./formato";
import { Painel, Segmentado } from "./partes";
import type { GrupoDeRotas } from "./url-da-analise";

type Visao = GrupoDeRotas;
const LIMITE = 6;

export function RotasECompanhias({ r, visao, onVisao }: {
  r: Pick<AnaliseDePassagens, "porRota" | "porCompanhia" | "porTransporte" | "bagagem">;
  visao: Visao;
  onVisao: (v: Visao) => void;
}) {
  const grupos: GrupoNomeado[] = visao === "rotas" ? r.porRota : visao === "companhias" ? r.porCompanhia : r.porTransporte;
  const visiveis = grupos.slice(0, LIMITE);
  const resto = grupos.slice(LIMITE);
  const restoGasto = resto.reduce((s, g) => s + g.gasto, 0);
  const primeiro = grupos[0];
  const nomeDaColuna = visao === "rotas" ? "Rota da ida" : visao === "companhias" ? "Companhia" : "Transporte";

  return (
    <Painel
      testid="analise-rotas"
      titulo="Rotas e companhias"
      pergunta="Onde está o gasto: rota da ida, companhia e tipo de transporte"
      acao={
        <Segmentado
          rotulo="Agrupar por"
          valor={visao}
          onChange={onVisao}
          opcoes={[["rotas", "Rotas"], ["companhias", "Companhias"], ["transporte", "Transporte"]] as const}
          testid="rotas-visao"
        />
      }
      resposta={primeiro ? (
        <p className="m-0">
          <strong className="font-semibold text-foreground">{primeiro.nome}</strong>{" "}
          {visao === "rotas" ? "é a rota que mais pesa" : visao === "companhias" ? "é a companhia com mais gasto" : "concentra o gasto"}:{" "}
          <span className="tabular-nums">{moeda(primeiro.gasto)}</span> em {plural(primeiro.passagens, "passagem", "passagens")}.
        </p>
      ) : (
        <p className="m-0 text-muted-foreground">
          {visao === "rotas" ? "Nenhuma passagem com origem e destino da ida preenchidos." : "Nada para agrupar neste recorte."}
        </p>
      )}
      rodape={
        <>
          Bagagem: <span className="font-medium tabular-nums text-slate-700">{moeda(r.bagagem.total)}</span> em {plural(r.bagagem.passagens, "passagem", "passagens")} — somada ao gasto, fora do preço médio.
          {visao === "rotas" && " A rota usa o aeroporto quando preenchido; sem ele, a cidade."}
        </>
      }
    >
      {visiveis.length > 0 && (
        <table className="w-full border-collapse text-[13px]" data-testid={`tabela-${visao}`}>
          <thead>
            <tr className="text-left text-2xs font-medium text-muted-foreground">
              <th scope="col" className="pb-1.5 pr-3 font-medium">{nomeDaColuna}</th>
              <th scope="col" className="hidden pb-1.5 pr-3 text-right font-medium sm:table-cell">Passagens</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Preço médio</th>
              <th scope="col" className="pb-1.5 text-right font-medium">Gasto</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((g) => (
              <tr key={g.chave || "vazio"} className="border-t border-border">
                <td className="max-w-0 py-2 pr-3">
                  {/* Código de aeroporto com espaço de letra, como no cartão de embarque. */}
                  <span className={`block truncate font-medium text-foreground ${/^[A-Z]{3} → [A-Z]{3}$/.test(g.nome) ? "tracking-[0.04em]" : ""}`} title={g.nome}>
                    {g.nome}
                  </span>
                  {/* No celular a quantidade desce para baixo do nome (a coluna some). */}
                  <span className="block text-2xs tabular-nums text-muted-foreground sm:hidden">{plural(g.passagens, "passagem", "passagens")}</span>
                </td>
                <td className="hidden whitespace-nowrap py-2 pr-3 text-right tabular-nums text-slate-600 sm:table-cell">{g.passagens.toLocaleString("pt-BR")}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-foreground">{moeda(g.media)}</td>
                <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums text-foreground">{moeda(g.gasto)}</td>
              </tr>
            ))}
            {resto.length > 0 && (
              <tr className="border-t border-border text-muted-foreground">
                <td className="py-2 pr-3" colSpan={2}>
                  + {plural(resto.length, visao === "rotas" ? "rota" : visao === "companhias" ? "companhia" : "tipo", visao === "rotas" ? "rotas" : visao === "companhias" ? "companhias" : "tipos")} com menos gasto
                </td>
                <td aria-hidden="true" className="hidden sm:table-cell" />
                <td className="whitespace-nowrap py-2 text-right tabular-nums">{moeda(restoGasto)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Painel>
  );
}
