/**
 * Os dois relatórios: por colaborador e por evento.
 *
 * 08/10 (redesenho): cara de DOCUMENTO, não de painel. Cada relatório abre com
 * título e uma frase do que soma e em que ordem; a tabela tem números
 * alinhados à direita em colunas próprias e fecha com a linha de total; as
 * notas de rodapé dizem de onde vêm os números.
 *
 * Por colaborador, as quatro companhias eram pílulas "Azul: 0 − +" coladas
 * numa coluna só — 33 linhas × 4 pílulas × 2 botões, e o zero tinha o mesmo
 * peso do três. Agora são quatro colunas de número (o zero vira um traço
 * claro, e o que existe salta), o histórico tem coluna própria e o − / + só
 * aparece em "Ajustar histórico": quem veio ler lê um documento; quem veio
 * corrigir liga o modo e vê os botões em todas as linhas, sempre à vista.
 *
 * Por evento, a contagem de solicitações (que só ia para o CSV) entrou na
 * tabela, o período e o local do evento aparecem embaixo do nome, e a
 * participação de cada evento no valor total vem em número e numa barra fina.
 *
 * No estreito (< 900px úteis) cada linha vira cartão por CSS (`.bag-doc-cartao`
 * no index.css), sobre a MESMA árvore de células — nenhum dado se perde.
 *
 * **Nada saiu**: busca, CSV (na barra da tela), candidatos a entrar no
 * histórico, ajuste + / − por companhia, selo do histórico, erro do histórico
 * com "Tentar novamente", vazio, carregando e "ver solicitações" no clique da
 * linha continuam aqui.
 */
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarDays, ChevronRight, Minus, Plus, SlidersHorizontal, Users } from "lucide-react";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import { BuscaDaLista } from "@/components/common/barra-de-filtros";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { toTitleCase } from "@/lib/format";
import { fixEncoding } from "@/lib/utils";
import {
  CIA_COR, CIA_ORDEM, formatCpf, formatCurrency, getCpf,
  type CiaGroup, type CollaboratorItem,
} from "./baggage-core";
import type { AgregadoDoColaborador } from "./baggage-logic";

/** Abaixo disto as colunas não cabem e cada linha vira cartão. */
const LARGURA_MINIMA = 900;

const TH = "px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";
const NUM = "px-3 py-2.5 text-right tabular-nums whitespace-nowrap";

/** Cabeçalho do documento: título, o que ele soma e as ferramentas à direita. */
function CabecalhoDoDocumento({ id, titulo, descricao, children }: {
  id: string; titulo: string; descricao: ReactNode; children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end gap-x-4 gap-y-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-4 border-b border-border">
      <div className="min-w-0 flex-[1_1_320px]">
        <h2 id={id} className="m-0 text-base font-semibold leading-6 text-foreground">{titulo}</h2>
        <p className="m-0 mt-0.5 max-w-[640px] text-sm leading-relaxed text-muted-foreground">{descricao}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">{children}</div>}
    </header>
  );
}

function Esqueleto() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 px-5 py-3.5 border-b border-border last:border-0">
          <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-48" /><div className="pas-osso h-2.5 w-28" /></div>
          <div className="pas-osso h-3.5 w-10 hidden md:block" />
          <div className="pas-osso h-3.5 w-10 hidden md:block" />
          <div className="pas-osso h-3.5 w-10 hidden md:block" />
          <div className="pas-osso h-3.5 w-20" />
        </div>
      ))}
    </div>
  );
}

function Vazio({ icone: Icone, titulo, texto }: { icone: typeof Users; titulo: string; texto: string }) {
  return (
    <div className="pas-entra px-8 py-12 text-center" data-testid="relatorio-vazio">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
        <Icone className="w-5 h-5" />
      </span>
      <h3 className="m-0 text-base font-semibold text-foreground">{titulo}</h3>
      <p className="mx-auto mt-1.5 mb-0 max-w-[440px] text-sm leading-relaxed text-muted-foreground">{texto}</p>
    </div>
  );
}

/** Zero vira traço claro: num documento de números, o que existe tem de saltar. */
function Numero({ n, forte }: { n: number; forte?: boolean }) {
  if (n === 0) return <span className="text-muted-foreground/60" aria-label="0">–</span>;
  return <span className={forte ? "font-semibold text-foreground" : "text-foreground"}>{n}</span>;
}

/** Linha que leva às solicitações: clique, Enter ou espaço. */
function propsDaLinha(rotulo: string, abrir: () => void) {
  return {
    tabIndex: 0,
    role: "button" as const,
    "aria-label": rotulo,
    onClick: abrir,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
    },
  };
}

const LINHA = "pas-linha group cursor-pointer border-b border-border last:border-0 hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:bg-brand-soft/60 focus-visible:shadow-[inset_3px_0_0_var(--primary)]";

/** O "›" da linha: diz que ela abre algo, discreto até o mouse chegar. */
function Abrir() {
  return (
    <span className="pas-abrir inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground group-hover:text-primary" aria-hidden="true">
      <ChevronRight className="w-4 h-4" />
    </span>
  );
}

// ── Por colaborador ──────────────────────────────────────────────────────────

export interface LinhaDeColaborador extends AgregadoDoColaborador {
  collaboratorId: string;
  name: string;
  cpf: string;
}

export function BaggageByCollaborator({
  linhas, busca, onBusca, candidatos, onAdicionarAoHistorico, onAjustarHistorico, ajustando,
  carregando, erroDeHistorico, onRecarregarHistorico, temHistorico, semRegistros, onVerSolicitacoes,
}: {
  linhas: LinhaDeColaborador[];
  busca: string;
  onBusca: (v: string) => void;
  /** Colaboradores ativos que batem com a busca mas ainda não têm bagagem. */
  candidatos: CollaboratorItem[];
  onAdicionarAoHistorico: (collaboratorId: string) => void;
  onAjustarHistorico: (collaboratorId: string, cia: CiaGroup, atual: number, delta: number) => void;
  ajustando: boolean;
  carregando: boolean;
  erroDeHistorico: boolean;
  onRecarregarHistorico: () => void;
  temHistorico: boolean;
  semRegistros: boolean;
  onVerSolicitacoes: (collaboratorId: string) => void;
  /** Exportar — mora na barra da tela (um CSV só por visão). Mantido por compatibilidade. */
  onCsv?: () => void;
}) {
  const { ref, largura } = useLarguraUtil<HTMLElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA;
  /** Modo de correção do histórico: mostra o − / + em todas as companhias. */
  const [ajustar, setAjustar] = useState(false);

  const totais = useMemo(() => {
    const porCia: Record<CiaGroup, number> = { Azul: 0, Gol: 0, TAM: 0, Outros: 0 };
    let bags = 0, hist = 0, cents = 0;
    for (const r of linhas) {
      for (const g of CIA_ORDEM) porCia[g] += r.byCia[g];
      bags += r.totalBags; hist += r.historyBags; cents += r.totalCents;
    }
    return { porCia, bags, hist, cents };
  }, [linhas]);

  return (
    // A medida mora no artigo (montado sempre): a tabela nasce depois do carregando.
    <article ref={ref} className="bg-card rounded-xl border border-border overflow-clip" aria-labelledby="relatorio-colab-titulo" data-testid="relatorio-por-colaborador">
      <CabecalhoDoDocumento
        id="relatorio-colab-titulo"
        titulo="Bagagens por colaborador"
        descricao="Solicitações do sistema somadas ao histórico da planilha antiga — quem tem mais bagagens primeiro. Clique numa linha para ver as solicitações da pessoa."
      >
        <BuscaDaLista
          valor={busca}
          onChange={onBusca}
          placeholder="Nome ou CPF"
          rotulo="Buscar colaborador por nome ou CPF"
          testid="input-search-collab-tab"
        />
        <button
          type="button"
          aria-pressed={ajustar}
          onClick={() => setAjustar(v => !v)}
          className={`pas-alvo inline-flex shrink-0 items-center gap-1.5 h-[34px] px-3 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            ajustar ? "border-primary/40 bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:bg-muted"}`}
          title="Mostra o − / + de cada companhia para corrigir a parte do histórico"
          data-testid="button-ajustar-historico"
        >
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          {ajustar ? "Concluir ajuste" : "Ajustar histórico"}
        </button>
      </CabecalhoDoDocumento>

      {erroDeHistorico && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-2.5 bg-warning-soft border-b border-warning/25" role="alert">
          <AlertTriangle className="w-4 h-4 shrink-0 text-warning-strong" aria-hidden="true" />
          <span className="flex-1 min-w-[220px] text-xs text-warning">
            Não foi possível carregar o histórico importado da planilha antiga — as contagens abaixo mostram só os registros do sistema.
          </span>
          <button
            type="button"
            onClick={onRecarregarHistorico}
            className="shrink-0 h-7 px-2.5 rounded-md text-xs font-semibold text-warning hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Ajuste ligado: a instrução fica à vista enquanto o modo durar. */}
      {ajustar && (
        <p className="pas-entra m-0 px-5 py-2.5 border-b border-border bg-brand-soft/50 text-xs text-primary" role="status">
          Os botões − / + mudam só a parte do <strong>histórico</strong> de cada companhia (sem evento nem valor).
          Solicitações do sistema se editam na aba Solicitações.
        </p>
      )}

      {/* Quem bate com a busca mas ainda não tem bagagem: dá para incluir daqui. */}
      {busca.trim().length >= 3 && candidatos.length > 0 && (
        <div className="pas-entra px-5 py-3 border-b border-border bg-surface-muted/60">
          <p className="m-0 mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Sem bagagem registrada — adicionar ao histórico
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidatos.map(c => (
              <MotivoDesabilitado
                key={c.id}
                motivo="Adiciona 1 bagagem em Outros — depois ajuste por companhia com “Ajustar histórico”"
                desabilitado={ajustando}
              >
                <button
                  type="button"
                  disabled={ajustando}
                  onClick={() => onAdicionarAoHistorico(c.id)}
                  className="pas-alvo inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Adiciona 1 bagagem em Outros — depois ajuste por companhia com “Ajustar histórico”"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  {toTitleCase(fixEncoding(c.fullName))}
                  {getCpf(c) && <span className="font-mono font-normal text-muted-foreground">{formatCpf(getCpf(c))}</span>}
                </button>
              </MotivoDesabilitado>
            ))}
          </div>
        </div>
      )}

      {carregando ? <Esqueleto /> : linhas.length === 0 ? (
        <Vazio
          icone={Users}
          titulo={busca.trim() && !semRegistros ? "Ninguém com esse nome ou CPF" : "Nenhuma bagagem por colaborador ainda"}
          texto={erroDeHistorico
            ? "O histórico não pôde ser carregado (veja o aviso acima) e ainda não há solicitações registradas."
            : busca.trim() && !semRegistros
              ? "Ninguém com bagagem bate com a busca. Com 3 letras ou mais, quem ainda não tem bagagem aparece acima para entrar no histórico."
              : "Os totais por colaborador — solicitações do sistema e o histórico importado — aparecem aqui assim que houver a primeira."}
        />
      ) : (
        <div className={modoCartao ? "bag-doc-cartao" : "pas-tabela"}>
          <table className={`w-full text-sm border-collapse ${modoCartao ? "" : "table-fixed"}`}>
            {!modoCartao && (
              <colgroup>
                <col />
                {CIA_ORDEM.map(g => <col key={g} style={{ width: ajustar ? 108 : 76 }} />)}
                <col style={{ width: 96 }} />
                <col style={{ width: 104 }} />
                <col style={{ width: 132 }} />
                <col style={{ width: 44 }} />
              </colgroup>
            )}
            <caption className="sr-only">Bagagens por colaborador e por companhia aérea, com o histórico importado e o valor total</caption>
            <thead className="pas-cabecalho">
              <tr>
                <th scope="col" className={`${TH} pl-5 text-left`}>Colaborador</th>
                {CIA_ORDEM.map(g => (
                  <th key={g} scope="col" className={`${TH} text-right`}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CIA_COR[g] }} aria-hidden="true" />{g}
                    </span>
                  </th>
                ))}
                <th scope="col" className={`${TH} text-right`}>Bagagens</th>
                <th scope="col" className={`${TH} text-right`} title="Bagagens importadas da planilha antiga (sem evento nem valor)">Histórico</th>
                <th scope="col" className={`${TH} text-right`}>Valor total</th>
                <th scope="col"><span className="sr-only">Ver solicitações</span></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(row => (
                <tr
                  key={row.collaboratorId}
                  {...propsDaLinha(`Ver solicitações de ${toTitleCase(row.name)}`, () => onVerSolicitacoes(row.collaboratorId))}
                  className={LINHA}
                  data-testid={`collab-row-${row.collaboratorId}`}
                >
                  <td data-col="nome" className="pl-5 pr-3 py-2.5 align-top">
                    {/* O nome pela regra única de @/lib/format ("Maria da Silva"); o CSV segue como sempre foi. */}
                    <p className="m-0 font-medium leading-5 text-foreground">{toTitleCase(row.name)}</p>
                    <p className="m-0 mt-0.5 font-mono text-2xs text-muted-foreground tabular-nums">
                      <span className="sr-only">CPF </span>{row.cpf ? formatCpf(row.cpf) : "CPF não informado"}
                    </p>
                  </td>
                  {CIA_ORDEM.map(g => {
                    const total = row.byCia[g];
                    const hist = row.histByCia[g];
                    return (
                      <td
                        key={g}
                        data-col="cia"
                        data-rotulo={g}
                        className={`${NUM} align-top`}
                        // A contagem soma registros do sistema e histórico. Os botões
                        // ajustam SÓ a parte histórica — registro do sistema tem
                        // evento e valor, e se edita na aba Solicitações.
                        onClick={ajustar ? e => e.stopPropagation() : undefined}
                        onKeyDown={ajustar ? e => e.stopPropagation() : undefined}
                      >
                        {ajustar ? (
                          <span className="inline-flex items-center justify-end gap-0.5">
                            <MotivoDesabilitado
                              motivo={hist <= 0 ? "Sem histórico nesta companhia para remover (registros do sistema se editam na aba Solicitações)" : "Remover 1 do histórico"}
                              desabilitado={ajustando || hist <= 0}
                            >
                              <button
                                type="button"
                                disabled={ajustando || hist <= 0}
                                onClick={() => onAjustarHistorico(row.collaboratorId, g, hist, -1)}
                                aria-label={`Remover 1 bagagem ${g} do histórico de ${toTitleCase(row.name)}`}
                                className="pas-alvo w-7 h-7 inline-flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </MotivoDesabilitado>
                            <span className="w-7 text-center"><Numero n={total} forte /></span>
                            <MotivoDesabilitado motivo="Adicionar 1 ao histórico" desabilitado={ajustando}>
                              <button
                                type="button"
                                disabled={ajustando}
                                onClick={() => onAjustarHistorico(row.collaboratorId, g, hist, +1)}
                                aria-label={`Adicionar 1 bagagem ${g} ao histórico de ${toTitleCase(row.name)}`}
                                className="pas-alvo w-7 h-7 inline-flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-30"
                              >
                                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </MotivoDesabilitado>
                          </span>
                        ) : <Numero n={total} />}
                      </td>
                    );
                  })}
                  <td data-col="num" data-rotulo="Bagagens" className={`${NUM} align-top`}>
                    <span className="font-semibold text-foreground">{row.totalBags}</span>
                  </td>
                  <td data-col="num" data-rotulo="Histórico" className={`${NUM} align-top`}>
                    {row.historyBags > 0 ? (
                      <span
                        className="inline-flex items-center h-5 px-1.5 rounded-md bg-muted text-2xs font-semibold text-slate-600"
                        title={`${row.historyBags} ${row.historyBags === 1 ? "bagagem" : "bagagens"} do histórico importado da planilha antiga (sem evento/valor)`}
                      >
                        {row.historyBags} hist.
                      </span>
                    ) : <Numero n={0} />}
                  </td>
                  <td data-col="num" data-rotulo="Valor total" className={`${NUM} align-top font-semibold text-foreground`}>
                    {formatCurrency(row.totalCents)}
                  </td>
                  <td data-col="abrir" className="pr-3 py-2 align-top text-right"><Abrir /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bag-total border-t-2 border-border bg-surface-muted">
                <th scope="row" data-col="nome" className="pl-5 pr-3 py-2.5 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                  Total · {linhas.length} {linhas.length === 1 ? "colaborador" : "colaboradores"}
                </th>
                {CIA_ORDEM.map(g => (
                  <td key={g} data-col="cia" data-rotulo={g} className={`${NUM} font-semibold`}><Numero n={totais.porCia[g]} forte /></td>
                ))}
                <td data-col="num" data-rotulo="Bagagens" className={`${NUM} font-bold text-foreground`}>{totais.bags}</td>
                <td data-col="num" data-rotulo="Histórico" className={`${NUM} font-semibold text-slate-600`}>{totais.hist || <Numero n={0} />}</td>
                <td data-col="num" data-rotulo="Valor total" className={`${NUM} font-bold text-foreground`}>{formatCurrency(totais.cents)}</td>
                <td data-col="abrir" aria-hidden="true" />
              </tr>
            </tfoot>
          </table>
          {temHistorico && (
            <p className="m-0 px-5 py-3 border-t border-border text-2xs leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-slate-600">Histórico</strong> (selo “hist.”): contagens importadas da planilha antiga,
              somadas às companhias e ao total de bagagens. Não têm evento nem valor — por isso não entram no Valor total.
              Corrija uma contagem em “Ajustar histórico”; solicitações do sistema se editam na aba Solicitações.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

// ── Por evento ───────────────────────────────────────────────────────────────

export interface LinhaDeEvento {
  eventId: string;
  name: string;
  bags: number;
  cents: number;
  records: number;
  /** "12/12/26 – 13/12/26" — contexto embaixo do nome (só apresentação). */
  periodo?: string;
  /** Cidade/local do evento. */
  local?: string;
}

export function BaggageByEvent({
  linhas, busca, onBusca, totais, carregando, semRegistros, onVerSolicitacoes,
}: {
  linhas: LinhaDeEvento[];
  busca: string;
  onBusca: (v: string) => void;
  totais: { bags: number; cents: number };
  carregando: boolean;
  semRegistros: boolean;
  onVerSolicitacoes: (eventId: string) => void;
  /** Exportar — mora na barra da tela (um CSV só por visão). Mantido por compatibilidade. */
  onCsv?: () => void;
}) {
  const { ref, largura } = useLarguraUtil<HTMLElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA;
  const solicitacoes = useMemo(() => linhas.reduce((s, r) => s + r.records, 0), [linhas]);
  const participacao = (cents: number) => (totais.cents > 0 ? (cents / totais.cents) * 100 : 0);

  return (
    // A medida mora no artigo (montado sempre): a tabela nasce depois do carregando.
    <article ref={ref} className="bg-card rounded-xl border border-border overflow-clip" aria-labelledby="relatorio-evento-titulo" data-testid="relatorio-por-evento">
      <CabecalhoDoDocumento
        id="relatorio-evento-titulo"
        titulo="Bagagens por evento"
        descricao="Solicitações, bagagens e valor de cada evento — do maior valor para o menor. Clique numa linha para ver as solicitações do evento."
      >
        <BuscaDaLista
          valor={busca}
          onChange={onBusca}
          placeholder="Nome do evento"
          rotulo="Buscar evento"
          testid="input-search-event-tab"
        />
      </CabecalhoDoDocumento>

      {carregando ? <Esqueleto /> : linhas.length === 0 ? (
        <Vazio
          icone={CalendarDays}
          titulo={semRegistros ? "Nenhuma bagagem por evento ainda" : "Nenhum evento com esse nome"}
          texto={semRegistros
            ? "Os totais por evento aparecem aqui assim que a primeira solicitação for registrada."
            : "Nenhum evento com bagagem bate com a busca. Ajuste o nome ou limpe a busca."}
        />
      ) : (
        <div className={modoCartao ? "bag-doc-cartao bag-doc-evento" : "pas-tabela"}>
          <table className={`w-full text-sm border-collapse ${modoCartao ? "" : "table-fixed"}`}>
            {!modoCartao && (
              <colgroup>
                <col />
                <col style={{ width: 112 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 176 }} />
                <col style={{ width: 44 }} />
              </colgroup>
            )}
            <caption className="sr-only">Bagagens por evento: solicitações, bagagens, valor total, valor médio por bagagem e participação no valor</caption>
            <thead className="pas-cabecalho">
              <tr>
                <th scope="col" className={`${TH} pl-5 text-left`}>Evento</th>
                <th scope="col" className={`${TH} text-right`}>Solicitações</th>
                <th scope="col" className={`${TH} text-right`}>Bagagens</th>
                <th scope="col" className={`${TH} text-right`}>Valor total</th>
                <th scope="col" className={`${TH} text-right`} title="Valor total dividido pelo número de bagagens">Valor médio</th>
                <th scope="col" className={`${TH} text-left`}>Participação</th>
                <th scope="col"><span className="sr-only">Ver solicitações</span></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(row => {
                const pct = participacao(row.cents);
                const contexto = [row.periodo, row.local].filter(Boolean).join(" · ");
                return (
                  <tr
                    key={row.eventId}
                    {...propsDaLinha(`Ver solicitações do evento ${row.name}`, () => onVerSolicitacoes(row.eventId))}
                    className={LINHA}
                    data-testid={`event-row-${row.eventId}`}
                  >
                    <td data-col="nome" className="pl-5 pr-3 py-2.5 align-top">
                      <p className="m-0 font-medium leading-5 text-foreground">{row.name}</p>
                      {contexto && <p className="m-0 mt-0.5 text-2xs text-muted-foreground truncate" title={contexto}>{contexto}</p>}
                    </td>
                    <td data-col="num" data-rotulo="Solicitações" className={`${NUM} align-top text-slate-600`}>{row.records}</td>
                    <td data-col="num" data-rotulo="Bagagens" className={`${NUM} align-top font-semibold text-foreground`}>{row.bags}</td>
                    <td data-col="num" data-rotulo="Valor total" className={`${NUM} align-top font-semibold text-foreground`}>{formatCurrency(row.cents)}</td>
                    <td data-col="num" data-rotulo="Valor médio" className={`${NUM} align-top text-slate-600`}>
                      {row.bags > 0 ? formatCurrency(Math.round(row.cents / row.bags)) : "—"}
                    </td>
                    <td data-col="pct" data-rotulo="Participação no valor" className="px-3 py-2.5 align-top">
                      <span className="flex items-center gap-2 h-5">
                        <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                          <span className="block h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="w-11 text-right text-xs tabular-nums text-slate-600">
                          {totais.cents > 0 ? `${pct.toLocaleString("pt-BR", { maximumFractionDigits: pct < 10 ? 1 : 0 })}%` : "—"}
                        </span>
                      </span>
                    </td>
                    <td data-col="abrir" className="pr-3 py-2 align-top text-right"><Abrir /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bag-total border-t-2 border-border bg-surface-muted">
                <th scope="row" data-col="nome" className="pl-5 pr-3 py-2.5 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                  Total geral · {linhas.length} {linhas.length === 1 ? "evento" : "eventos"}
                </th>
                <td data-col="num" data-rotulo="Solicitações" className={`${NUM} font-semibold text-slate-600`}>{solicitacoes}</td>
                <td data-col="num" data-rotulo="Bagagens" className={`${NUM} font-bold text-foreground`}>{totais.bags}</td>
                <td data-col="num" data-rotulo="Valor total" className={`${NUM} font-bold text-foreground`}>{formatCurrency(totais.cents)}</td>
                <td data-col="num" data-rotulo="Valor médio" className={`${NUM} font-semibold text-slate-600`}>
                  {totais.bags > 0 ? formatCurrency(Math.round(totais.cents / totais.bags)) : "—"}
                </td>
                <td data-col="pct" aria-hidden="true" />
                <td data-col="abrir" aria-hidden="true" />
              </tr>
            </tfoot>
          </table>
          <p className="m-0 px-5 py-3 border-t border-border text-2xs leading-relaxed text-muted-foreground">
            <strong className="font-semibold text-slate-600">Valor médio</strong>: valor total dividido pelo número de bagagens.{" "}
            <strong className="font-semibold text-slate-600">Participação</strong>: quanto o evento pesa no valor total da lista acima.
            O histórico importado da planilha antiga não tem evento e não entra aqui.
          </p>
        </div>
      )}
    </article>
  );
}
