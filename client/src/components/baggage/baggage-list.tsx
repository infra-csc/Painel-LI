/**
 * A lista de solicitações.
 *
 * 08/10 (redesenho): volta a ser TABELA — a mesma de Passagens e Hospedagem
 * (`pas-tabela`, cabeçalho grudado abaixo da barra da tela, colunas de
 * largura-guia). Eram cartões altos de 120px com a faixa colorida de 96px:
 * em 1366 cabiam três solicitações por tela, e quem conferia uma fatura de
 * agência rolava a lista inteira para comparar valores. Agora cabem dez, e os
 * números ficam alinhados à direita, um embaixo do outro.
 *
 * A identidade do cartão de embarque ficou: a borda esquerda tem a cor da
 * companhia (a mesma do avião na fila), e o bilhete — LOC em mono, a etiqueta
 * da companhia e a OS — abre a linha. Abaixo de 960px úteis a MESMA árvore de
 * células vira cartão por CSS (`.bag-cartao` no index.css): nada é renderizado
 * de outro jeito, então nenhum dado se perde entre os dois modos.
 *
 * A linha inteira abre a solicitação para editar; excluir fica à direita,
 * discreto e sempre visível.
 *
 * **Nenhum campo saiu**: LOC, CIA, OS, colaborador e CPF, evento, observação,
 * quantidade, valor, as duas datas, agência, editar e excluir — com os mesmos
 * `data-testid`.
 */
import { ChevronDown, ChevronUp, ChevronsUpDown, Luggage, NotebookPen, Pencil, Plus, SearchX, Trash2 } from "lucide-react";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import { toTitleCase } from "@/lib/format";
import { fixEncoding } from "@/lib/utils";
import {
  CIA_STYLE, ciaGroup, fmtDate, formatCpf, formatCurrency, getCpf,
  type BaggageRequestItem, type CiaGroup, type CollaboratorItem,
} from "./baggage-core";
import { NOME_DA_ORDEM, type CampoDeOrdem, type Ordem, type ResumoDoRecorte } from "./baggage-logic";
import { sentidoEmPalavras } from "./baggage-filter-bar";

/** Abaixo disto a tabela não cabe sem espremer coluna e vira cartão — o mesmo limiar das irmãs. */
const LARGURA_MINIMA_DA_TABELA = 960;

/** Borda esquerda da linha: a cor da companhia. */
const BORDA_DA_CIA: Record<CiaGroup, string> = {
  Azul: "border-l-info", Gol: "border-l-warning-strong", TAM: "border-l-danger", Outros: "border-l-slate-400",
};

// 11px/600 com tracking curto — o mesmo cabeçalho de Passagens.
const TH = "px-2.5 py-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-left";
/** Etiqueta da companhia no bilhete (h22 · r6 · 11px) — a forma das pílulas das irmãs. */
const PILULA = "inline-flex items-center h-[22px] px-[7px] rounded-md text-2xs font-semibold whitespace-nowrap";

/** Primeiro clique num campo: texto de A a Z; data e valor do maior para o menor. */
const DESC_AO_ESCOLHER: Record<CampoDeOrdem, boolean> = { boarding: true, value: true, collaborator: false, cia: false };

export default function BaggageList({
  linhas, collabById, getCollabName, getEventName, carregando, erro, onRecarregar,
  temFiltroAtivo, totalSemFiltro, onLimparFiltros, onEditar, onExcluir, podeEditar, resumo, ordem, onOrdem, onNova,
}: {
  linhas: BaggageRequestItem[];
  collabById: Map<string, CollaboratorItem>;
  getCollabName: (id: string) => string;
  getEventName: (id: string) => string;
  carregando: boolean;
  erro: boolean;
  onRecarregar: () => void;
  temFiltroAtivo: boolean;
  /** Quantas solicitações existem ao todo — separa "nada registrado" de "nada encontrado". */
  totalSemFiltro: number;
  onLimparFiltros: () => void;
  onEditar: (r: BaggageRequestItem) => void;
  onExcluir: (r: BaggageRequestItem) => void;
  podeEditar: boolean;
  resumo: ResumoDoRecorte;
  ordem: Ordem;
  /** Ordenar pelo cabeçalho da tabela (no cartão, pelo "Ordenar" da barra). */
  onOrdem?: (o: Ordem) => void;
  /** A saída do vazio "nada registrado ainda". */
  onNova?: () => void;
}) {
  // Medido sobre a largura ÚTIL, não pela janela: o menu lateral compacto
  // muda o espaço da lista sem mudar o tamanho da tela.
  const { ref, largura } = useLarguraUtil<HTMLDivElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA_DA_TABELA;
  const largo = largura !== null && largura >= 1400;

  // Um invólucro só, montado sempre: a medida da largura nasce com a tela e
  // continua valendo quando a lista troca de carregando para a tabela.
  return <div ref={ref}>{conteudo()}</div>;

  function conteudo() {
    if (carregando) {
      // Esqueleto com a geometria real da tabela: o bilhete, o nome, os números.
      return (
        <div className="rounded-xl border border-border bg-card overflow-hidden" aria-hidden="true" data-testid="lista-carregando">
          <div className="h-10 bg-surface-muted border-b border-border" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0">
              <div className="space-y-1.5 w-[120px]"><div className="pas-osso h-3.5 w-20" /><div className="pas-osso h-2.5 w-14" /></div>
              <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-3/5" /><div className="pas-osso h-2.5 w-2/5" /></div>
              <div className="flex-1 space-y-1.5 hidden md:block"><div className="pas-osso h-3.5 w-4/5" /></div>
              <div className="pas-osso h-3.5 w-16 hidden md:block" />
              <div className="pas-osso h-3.5 w-20" />
            </div>
          ))}
        </div>
      );
    }

    if (erro) {
      return (
        <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14" role="alert">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
            <Luggage className="w-5 h-5" />
          </span>
          <h3 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar as solicitações</h3>
          <p className="m-0 mt-1.5 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
            Verifique sua conexão e tente de novo. Nada do que já foi registrado se perdeu.
          </p>
          <button
            type="button"
            onClick={onRecarregar}
            className="mt-5 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="button-retry-baggage"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    if (linhas.length === 0) {
      const nadaRegistrado = totalSemFiltro === 0;
      const Icone = nadaRegistrado ? Luggage : SearchX;
      return (
        <div className="rounded-xl border border-border bg-card">
          <div className="pas-entra px-8 py-12 text-center" data-testid="lista-vazia">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
              <Icone className="w-5 h-5" />
            </span>
            <h3 className="m-0 text-base font-semibold text-foreground">
              {nadaRegistrado ? "Nenhuma solicitação de bagagem ainda" : "Nenhuma solicitação neste recorte"}
            </h3>
            <p className="mx-auto mt-1.5 mb-0 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
              {nadaRegistrado
                ? "Cada bagagem despachada para um evento entra aqui, com o LOC, a companhia e o valor — e já soma nos totais por colaborador e por evento."
                : "Nenhuma solicitação bate com a busca e os filtros de agora. Ajuste ou limpe para ver as demais."}
            </p>
            {nadaRegistrado && onNova && podeEditar && (
              <button
                type="button"
                onClick={onNova}
                className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-primary/30 bg-card text-sm font-medium text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="button-new-baggage-empty"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />Registrar a primeira
              </button>
            )}
            {!nadaRegistrado && temFiltroAtivo && (
              <button
                type="button"
                onClick={onLimparFiltros}
                className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="button-clear-filters-empty"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      );
    }

    /** Cabeçalho que ordena: o mesmo botão das irmãs (alvo de 26px, seta só no ativo). */
    const ordenarPor = (campo: CampoDeOrdem, rotulo: string) => {
      const ativo = ordem.campo === campo;
      if (!onOrdem) return rotulo;
      return (
        <button
          type="button"
          onClick={() => onOrdem(ativo ? { campo, desc: !ordem.desc } : { campo, desc: DESC_AO_ESCOLHER[campo] })}
          className={`group/ordem inline-flex items-center gap-1 h-[26px] rounded-sm uppercase hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${ativo ? "text-primary" : ""}`}
          title={`Ordenar por ${rotulo.toLowerCase()}`}
          data-testid={`header-${campo}`}
        >
          {rotulo}
          {ativo
            ? (ordem.desc ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronUp className="w-3 h-3" aria-hidden="true" />)
            : <ChevronsUpDown className="w-3 h-3 opacity-0 transition-opacity group-hover/ordem:opacity-50" aria-hidden="true" />}
        </button>
      );
    };
    const ariaSort = (campo: CampoDeOrdem) => (ordem.campo === campo ? (ordem.desc ? "descending" : "ascending") : undefined);

    return (
      // `overflow-clip` (e não `hidden`): `hidden` prendia o cabeçalho grudado.
      <div className="bg-card rounded-xl border border-border overflow-clip">
        <div className={modoCartao ? "bag-cartao" : "pas-tabela"} data-testid="baggage-table">
          <table className={`w-full text-left border-collapse ${modoCartao ? "" : "table-fixed"}`}>
            {/* Larguras-guia: colaborador e evento ficam com a sobra; números e
                datas não quebram no meio. */}
            {!modoCartao && (
              <colgroup>
                <col style={{ width: largo ? 176 : 148 }} />
                <col />
                <col />
                <col style={{ width: 64 }} />
                <col style={{ width: largo ? 128 : 112 }} />
                <col style={{ width: largo ? 150 : 128 }} />
                <col style={{ width: largo ? 150 : 112 }} />
                <col style={{ width: 84 }} />
              </colgroup>
            )}
            <caption className="sr-only">Solicitações de bagagem: bilhete, colaborador, evento, bagagens, valor, embarque e agência</caption>
            <thead className="pas-cabecalho">
              <tr>
                <th scope="col" aria-sort={ariaSort("cia")} className={`${TH} pl-4 whitespace-nowrap`}>{ordenarPor("cia", "Bilhete")}</th>
                <th scope="col" aria-sort={ariaSort("collaborator")} className={`${TH} whitespace-nowrap`}>{ordenarPor("collaborator", "Colaborador")}</th>
                <th scope="col" className={TH}>Evento</th>
                <th scope="col" className={`${TH} !text-right`} title="Quantidade de bagagens">Qtd.</th>
                <th scope="col" aria-sort={ariaSort("value")} className={`${TH} !text-right whitespace-nowrap`}>{ordenarPor("value", "Valor")}</th>
                <th scope="col" aria-sort={ariaSort("boarding")} className={`${TH} whitespace-nowrap`}>{ordenarPor("boarding", "Embarque")}</th>
                <th scope="col" className={TH}>Agência</th>
                <th scope="col" className="pl-1 pr-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r, i) => {
                const grupo = ciaGroup(r.cia);
                const c = collabById.get(r.collaboratorId);
                const cpf = c ? getCpf(c) : "";
                const nome = c ? toTitleCase(fixEncoding(c.fullName)) || getCollabName(r.collaboratorId) : getCollabName(r.collaboratorId);
                const evento = getEventName(r.eventId);
                const abrir = podeEditar ? () => onEditar(r) : undefined;
                const celula = `px-2.5 py-2.5 align-top ${podeEditar ? "cursor-pointer" : ""}`;
                return (
                  <tr
                    key={r.id}
                    className={`pas-linha group border-b border-border last:border-0 border-l-[3px] ${BORDA_DA_CIA[grupo]} ${
                      i % 2 === 1 ? "bg-surface-muted/50 hover:bg-brand-soft/40" : "bg-card hover:bg-brand-soft/40"}`}
                    data-testid={`baggage-row-${r.loc}`}
                  >
                    {/* Bilhete: LOC + companhia, e a OS embaixo */}
                    <td data-col="bilhete" className={`${celula} pl-4`} onClick={abrir}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-sm font-semibold tracking-wide text-foreground">{r.loc}</span>
                        <span className={`${PILULA} ${CIA_STYLE[grupo].badge}`} title={grupo === "Outros" ? `Outra companhia: ${r.cia}` : r.cia}>{r.cia}</span>
                      </div>
                      <p className="m-0 mt-0.5 font-mono text-2xs text-muted-foreground truncate" title={`OS ${r.os}`}>
                        <span className="sr-only">OS </span>{r.os}
                      </p>
                    </td>

                    {/* Colaborador + CPF */}
                    <td data-col="colab" className={celula} data-rotulo="Colaborador" onClick={abrir}>
                      <p className="m-0 text-sm font-medium leading-5 text-foreground">{nome}</p>
                      {cpf && <p className="m-0 mt-0.5 font-mono text-2xs text-muted-foreground tabular-nums"><span className="sr-only">CPF </span>{formatCpf(cpf)}</p>}
                    </td>

                    {/* Evento + observação */}
                    <td data-col="evento" className={`${celula} overflow-hidden`} data-rotulo="Evento" onClick={abrir}>
                      <p className="m-0 text-sm leading-5 text-foreground">{evento}</p>
                      {r.notes && (
                        <p className="bag-nota m-0 mt-0.5 flex items-center gap-1 min-w-0 text-2xs leading-4 text-muted-foreground" title={r.notes}>
                          <NotebookPen className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span className="sr-only">Observação:</span>
                          <span className="truncate">{r.notes}</span>
                        </p>
                      )}
                    </td>

                    {/* Quantidade */}
                    <td data-col="qtd" className={`${celula} text-right`} data-rotulo="Bagagens" onClick={abrir}>
                      <span className="text-sm font-medium tabular-nums text-foreground">{r.quantity}</span>
                    </td>

                    {/* Valor */}
                    <td data-col="valor" className={`${celula} text-right whitespace-nowrap`} data-rotulo="Valor" onClick={abrir}>
                      <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(r.valueCents || 0)}</span>
                    </td>

                    {/* Embarque + data da solicitação */}
                    <td data-col="datas" className={`${celula} whitespace-nowrap`} data-rotulo="Embarque" onClick={abrir}>
                      <p className="m-0 text-sm font-medium tabular-nums text-foreground">{fmtDate(r.boardingDate)}</p>
                      <p className="m-0 mt-0.5 text-2xs tabular-nums text-muted-foreground" title="Data da solicitação">
                        pedida em {fmtDate(r.requestDate)}
                      </p>
                    </td>

                    {/* Agência */}
                    <td data-col="agencia" className={`${celula} overflow-hidden`} data-rotulo="Agência" onClick={abrir}>
                      <p className="m-0 text-sm leading-5 text-slate-700 truncate" title={r.agency}>{r.agency}</p>
                    </td>

                    {/* Ações: sempre visíveis, discretas */}
                    <td data-col="acoes" className="pl-1 pr-3 py-2 align-top whitespace-nowrap">
                      {podeEditar && (
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            title="Editar solicitação"
                            aria-label={`Editar solicitação LOC ${r.loc}`}
                            onClick={() => onEditar(r)}
                            className="pas-alvo pas-abrir w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            data-testid={`button-edit-${r.loc}`}
                          >
                            <Pencil className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            title="Excluir solicitação"
                            aria-label={`Excluir solicitação LOC ${r.loc}`}
                            onClick={() => onExcluir(r)}
                            className="pas-alvo pas-abrir w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-danger hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            data-testid={`button-delete-${r.loc}`}
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Rodapé: o que está na tela, como está ordenado e quanto soma. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-h-10 px-4 py-2 bg-surface-muted border-t border-border">
          <p className="m-0 text-xs text-slate-600 tabular-nums" data-testid="rodape-lista">
            Mostrando {linhas.length}{totalSemFiltro !== linhas.length ? ` de ${totalSemFiltro}` : ""}{" "}
            {totalSemFiltro === 1 ? "solicitação" : "solicitações"} · ordenado por {NOME_DA_ORDEM[ordem.campo]}, {sentidoEmPalavras(ordem)}
          </p>
          <p className="m-0 sm:ml-auto text-xs text-slate-600 tabular-nums" aria-live="polite">
            <span className="font-semibold text-foreground">{resumo.bags}</span> {resumo.bags === 1 ? "bagagem" : "bagagens"} ·{" "}
            <span className="font-semibold text-foreground">{formatCurrency(resumo.cents)}</span>
          </p>
        </div>
      </div>
    );
  }
}
