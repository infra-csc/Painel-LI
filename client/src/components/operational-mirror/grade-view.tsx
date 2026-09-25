/**
 * Visão Grade do espelho operacional (25/09 — extraída da página).
 * Cabeçalho por etapa, linhas memoizadas (GradeRow), rodapé de somas e barra de status.
 */
import { useMemo, useRef, useEffect } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { hotelTotalCents, type MirrorRow } from "@shared/operational-mirror-types";
import { BLOCOS_DE_CUSTO, blocoEmUso, blocoPendencia, type GruposConfirmados } from "@shared/mirror-pendencia";
import { GradeRow } from "./grade-row";
import {
  ALL_BLOCKS, PONTO_ETAPA, brl,
  type Block, type OpenDrawer, type PendenciaDe, type SaveCell, type SortKey, type SortState,
} from "./mirror-shared";

export interface GradeViewProps {
  rows: MirrorRow[];
  hiddenBlocks: Set<Block>;
  compact: boolean;
  saveCell: SaveCell;
  openDrawer: OpenDrawer;
  sort: SortState;
  onSort: (key: SortKey) => void;
  editMode: boolean;
  canEdit: boolean;
  emptyMessage: string;
  /** Ids de grupos já confirmados — separam sugestão de dado na grade. */
  confirmados: GruposConfirmados;
  /** A pendência por bloco de cada linha, calculada uma vez na página. */
  pendenciaDe: PendenciaDe;
  /** Leva para a visao que confirma o grupo (celula em "a confirmar"). */
  irParaVisao: (v: "uber" | "quartos") => void;
  /** Total sem filtro — o rodapé diz "N de M pessoas". */
  totalDoEvento: number;
}

export function GradeView({ rows, hiddenBlocks, compact, saveCell, openDrawer, sort, onSort, editMode, canEdit, emptyMessage, confirmados, pendenciaDe, irParaVisao, totalDoEvento }: GradeViewProps) {
  const show = (b: Block) => !hiddenBlocks.has(b);
  // "Bater o olho e entender" (pedido do dono): cada etapa diz quantas pessoas
  // já têm aquilo resolvido. Sem isso, saber o que falta exigia percorrer ~36
  // colunas linha a linha.
  const feito = useMemo(() => {
    const f = { passagem: 0, hospedagem: 0, bagagem: 0, uber: 0, locacao: 0 };
    const base = { passagem: 0, hospedagem: 0, bagagem: 0, uber: 0, locacao: 0 };
    for (const r of rows) {
      const { abertos } = pendenciaDe(r);
      for (const b of BLOCOS_DE_CUSTO) {
        if (!blocoEmUso(b, r)) continue;
        base[b] += 1;
        if (!blocoPendencia(b) || !abertos.includes(b)) f[b] += 1;
      }
    }
    return { feito: f, base };
  }, [rows, pendenciaDe]);
  /** Somas por coluna de dinheiro — o que o rodapé da grade mostra. */
  const soma = useMemo(() => {
    const s = { passagem: 0, hotel: 0, bagagem: 0, uber: 0, locacao: 0 };
    for (const r of rows) {
      s.passagem += r.ticket?.value || 0;
      s.hotel += hotelTotalCents(r);
      s.bagagem += r.baggage.extraCents || 0;
      s.uber += r.uber.totalCents || 0;
      s.locacao += r.carRental.totalCents || 0;
    }
    return s;
  }, [rows]);
  /** Quantas colunas estão à vista — a barra de status diz o tamanho da grade. */
  const colunasVisiveis = useMemo(
    () => 6 + ALL_BLOCKS.reduce((n, b) => n + (hiddenBlocks.has(b.key) ? 0 : b.colunas), 0),
    [hiddenBlocks],
  );
  /**
   * Rola a grade até o começo de um bloco. A conta desconta as duas colunas
   * congeladas (nome e departamento): sem isso o bloco pararia embaixo delas.
   */
  const rolagemRef = useRef<HTMLDivElement | null>(null);
  const irParaBloco = (bloco: Block) => {
    const caixa = rolagemRef.current;
    const alvo = caixa?.querySelector<HTMLElement>(`[data-bloco="${bloco}"]`);
    if (!caixa || !alvo) return;
    const congeladas = caixa.querySelector<HTMLElement>("thead th")?.offsetWidth ?? 330;
    // Salto, sem animação: visto ao vivo, há navegador que ignora rolagem
    // suave — tanto scrollTo({behavior:"smooth"}) quanto scroll-behavior no CSS
    // — e aí o destino simplesmente nunca chegava. Chegar importa mais do que
    // chegar deslizando.
    caixa.scrollLeft = Math.max(0, alvo.offsetLeft - congeladas);
  };

  /**
   * A porta de entrada da grade.
   *
   * Atravessar a grade custava ~540 paradas de Tab (39 colunas × as linhas):
   * ninguém tabula por isso — e quem usa teclado ficava preso. Agora a grade é
   * UMA parada, sempre a primeira célula; dentro dela quem anda são as setas,
   * que já existiam e ninguém via (a barra de status passou a dizer isso).
   */
  const tabelaRef = useRef<HTMLTableElement | null>(null);
  useEffect(() => {
    const tabela = tabelaRef.current;
    if (!tabela) return;
    if (tabela.querySelector('[data-cell-focus][tabindex="0"]')) return;
    const primeira = tabela.querySelector<HTMLElement>("[data-cell-focus]");
    if (primeira) primeira.tabIndex = 0;
  });
  const headPad = compact ? "px-2 py-1" : "px-2 py-1.5";
  const sortIcon = (key: string) => sort?.key === key ? (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />;
  return (
    <>
      {/* "Ir para": 39 colunas não cabem na tela, e rolar às cegas até achar
          "Locação" é o custo diário de quem preenche. Cada botão leva o bloco
          para a esquerda da área visível — sem esconder coluna nenhuma. */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Ir para</span>
        {ALL_BLOCKS.filter((b) => show(b.key)).map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => irParaBloco(b.key)}
            className="inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${b.ponto}`} aria-hidden="true" />
            {b.label}
          </button>
        ))}
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <div>
          <div ref={rolagemRef} className="overflow-auto max-h-[calc(100vh-250px)] min-h-[280px]">
            <table ref={tabelaRef} className="text-xs border-collapse w-full" data-testid="operational-grid">
              <caption className="sr-only">Espelho operacional: colaboradores do evento com função, dias, transporte e hospedagem</caption>
              <thead>
                <tr>
                  <th scope="col" colSpan={2} className="sticky left-0 top-0 z-40 h-8 py-0 leading-none bg-muted px-2 text-left font-semibold border-r border-b border-border">Colaborador</th>
                  <GrupoHead colSpan={4} ponto={PONTO_ETAPA.schedule}>Período</GrupoHead>
                  {show("passagem") && <GrupoHead data-bloco="passagem" colSpan={9} ponto={PONTO_ETAPA.ticket}><Progresso rotulo="Passagem" feito={feito.feito.passagem} total={feito.base.passagem} /></GrupoHead>}
                  {show("hospedagem") && <GrupoHead data-bloco="hospedagem" colSpan={12} ponto={PONTO_ETAPA.hotel}><Progresso rotulo="Hospedagem" feito={feito.feito.hospedagem} total={feito.base.hospedagem} /></GrupoHead>}
                  {show("bagagem") && <GrupoHead data-bloco="bagagem" colSpan={3} ponto={PONTO_ETAPA.baggage}>Bagagem</GrupoHead>}
                  {show("uber") && <GrupoHead data-bloco="uber" colSpan={3} ponto={PONTO_ETAPA.uber}><Progresso rotulo="Uber" feito={feito.feito.uber} total={feito.base.uber} /></GrupoHead>}
                  {show("locacao") && <GrupoHead data-bloco="locacao" colSpan={4} ponto={PONTO_ETAPA.car}>Locação</GrupoHead>}
                  {show("pendencias") && <GrupoHead data-bloco="pendencias" colSpan={2} ponto={PONTO_ETAPA.pend}>Situação</GrupoHead>}
                </tr>
                <tr className="bg-muted/70">
                  <th scope="col" className={`sticky left-0 top-8 z-40 bg-muted ${headPad} text-left font-medium border-r border-b border-border min-w-[210px]`}>
                    <button type="button" onClick={() => onSort("nome")} aria-label="Ordenar por nome" className="flex items-center gap-1 hover:text-foreground">Nome {sortIcon("nome")}</button>
                  </th>
                  <th scope="col" className={`sticky left-[210px] top-8 z-40 bg-muted ${headPad} text-left font-medium border-r border-b border-border min-w-[120px]`}>
                    <button type="button" onClick={() => onSort("departamento")} aria-label="Ordenar por departamento" className="flex items-center gap-1 hover:text-foreground">Departamento {sortIcon("departamento")}</button>
                  </th>
                  {["Início", "Data Ida", "Término", "Data Volta"].map((h) => <ColHead key={h} pad={headPad}>{h}</ColHead>)}
                  {show("passagem") && <>
                    <ColHead pad={headPad}>Valor</ColHead><ColHead pad={headPad}>Aero ida</ColHead><ColHead pad={headPad}>HR Ida</ColHead><ColHead pad={headPad}>HR Volta</ColHead>
                    <ColHead pad={headPad}>Aero volta</ColHead><ColHead pad={headPad}>Localizador</ColHead><ColHead pad={headPad}>Cia</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Conferido</ColHead>
                  </>}
                  {show("hospedagem") && <>
                    <ColHead pad={headPad}>Hotel</ColHead><ColHead pad={headPad}>Reserva</ColHead><ColHead pad={headPad}>Check-in</ColHead><ColHead pad={headPad}>Check-out</ColHead>
                    <ColHead pad={headPad}>Noites</ColHead><ColHead pad={headPad}>Quarto</ColHead><ColHead pad={headPad}>Diária</ColHead><ColHead pad={headPad}>Late C/Out</ColHead>
                    <ColHead pad={headPad}>Total</ColHead><ColHead pad={headPad}>Pagador</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Conferido</ColHead>
                  </>}
                  {show("bagagem") && <><ColHead pad={headPad}>Valor</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Conferido</ColHead></>}
                  {show("uber") && <><ColHead pad={headPad}>Valor</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Conferido</ColHead></>}
                  {show("locacao") && <><ColHead pad={headPad}>Empresa</ColHead><ColHead pad={headPad}>R$</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Conferido</ColHead></>}
                  {show("pendencias") && <><ColHead pad={headPad}>Situação</ColHead><ColHead pad={headPad}>Observações</ColHead></>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <GradeRow key={r.teamInclusionId} r={r} hiddenBlocks={hiddenBlocks} compact={compact} saveCell={saveCell} openDrawer={openDrawer}
                    editMode={editMode} canEdit={canEdit} confirmados={confirmados} pendenciaDe={pendenciaDe} irParaVisao={irParaVisao} />
                ))}
                {rows.length === 0 && <tr><td colSpan={39} className="p-8 text-center text-muted-foreground">{emptyMessage}</td></tr>}
              </tbody>
              {/* Somar a coluna é o que qualquer planilha faz e o que esta
                  grade não fazia: para saber o gasto de passagens era preciso
                  sair da tela. Só colunas de dinheiro somam. */}
              {rows.length > 0 && (
                <tfoot className="sticky bottom-0 z-20">
                  <tr className="bg-muted/95 backdrop-blur-sm">
                    <th scope="col" colSpan={2} className="sticky left-0 z-30 bg-muted px-2 py-1.5 text-left text-2xs font-bold uppercase tracking-wider text-muted-foreground border-r border-t border-border">
                      Total do evento
                    </th>
                    <TotalVazio n={4} />
                    {show("passagem") && <><TotalCol valor={soma.passagem} /><TotalVazio n={8} /></>}
                    {/* Hotel, Reserva, Check-in, Check-out, Diarias, Quarto | R$ Diaria (nao soma: e preco unitario) | Late C/Out | Hotel R$ | Empresa Pgto, OC, Conferencia */}
                    {show("hospedagem") && <><TotalVazio n={8} /><TotalCol valor={soma.hotel} /><TotalVazio n={3} /></>}
                    {show("bagagem") && <><TotalCol valor={soma.bagagem} /><TotalVazio n={2} /></>}
                    {show("uber") && <><TotalCol valor={soma.uber} /><TotalVazio n={2} /></>}
                    {show("locacao") && <><TotalVazio n={1} /><TotalCol valor={soma.locacao} /><TotalVazio n={2} /></>}
                    {show("pendencias") && <TotalVazio n={2} />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
        {/* Fora da área de rolagem: a legenda do âmbar e os atalhos da grade.
            A navegação por setas existe no código desde sempre e era invisível
            — dizer que ela existe é metade do ganho. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-card px-3.5 py-2 text-2xs text-muted-foreground">
          <span className="tabular-nums">
            {rows.length === totalDoEvento ? `${rows.length} ${rows.length === 1 ? "pessoa" : "pessoas"}` : `${rows.length} de ${totalDoEvento} pessoas`} · {colunasVisiveis} colunas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-warning-soft ring-1 ring-inset ring-warning/25" aria-hidden="true" />
            falta preencher
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm ring-1 ring-inset ring-primary/25 bg-brand-soft" aria-hidden="true" />
            a confirmar
          </span>
          {editMode && (
            <span className="ml-auto inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <span><Tecla>Enter</Tecla> edita</span>
              <span><Tecla>Tab</Tecla> avança</span>
              <span><Tecla>↑↓←→</Tecla> navega</span>
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/** Cabeçalho de grupo: fundo neutro, ponto colorido, rótulo legível. */
function GrupoHead({ ponto, children, ...resto }: { ponto: string; children: React.ReactNode } & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" {...resto} className="sticky top-0 z-30 h-8 border-b border-r-2 border-r-slate-300 border-border bg-muted px-2 py-0 text-center align-middle leading-none">
      <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-slate-700">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ponto}`} aria-hidden="true" />
        {children}
      </span>
    </th>
  );
}

/** Célula de total: só as colunas de dinheiro somam. */
function TotalCol({ valor }: { valor: number }) {
  return (
    <td className="border-r border-t border-border px-2 py-1.5 text-right text-2xs font-semibold tabular-nums text-foreground whitespace-nowrap">
      {valor > 0 ? brl(valor) : null}
    </td>
  );
}
/** Colunas que não somam nada — vazias de propósito. */
function TotalVazio({ n }: { n: number }) {
  return <>{Array.from({ length: n }, (_, i) => <td key={i} className="border-r border-t border-border" />)}</>;
}
/** Tecla de atalho na barra de status. */
function Tecla({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-muted px-1 font-mono text-2xs leading-4">{children}</kbd>;
}

/**
 * Rótulo da etapa com quantas pessoas já estão resolvidas nela. Some quando
 * ninguém tem aquilo (bagagem/Uber/locação costumam ser zero num evento
 * local) para não anunciar "0 de 15" em três blocos seguidos.
 */
function Progresso({ rotulo, feito, total }: { rotulo: string; feito: number; total: number }) {
  const completo = total > 0 && feito === total;
  return (
    <span className="inline-flex items-center gap-1.5">
      {rotulo}
      {feito > 0 && (
        <span className={`rounded-full px-1.5 py-px text-2xs font-semibold tabular-nums ${
          completo ? "bg-success/15 text-success " : "bg-background/70"}`}
          title={`${feito} de ${total} ${total === 1 ? "colaborador" : "colaboradores"} com este item preenchido`}>
          {completo ? `${total} ✓` : `${feito}/${total}`}
        </span>
      )}
    </span>
  );
}

function ColHead({ children, pad }: { children: React.ReactNode; pad: string }) {
  return <th scope="col" className={`${pad} text-left font-medium border-r border-b border-border whitespace-nowrap text-muted-foreground sticky top-8 z-30 bg-muted`}>{children}</th>;
}
