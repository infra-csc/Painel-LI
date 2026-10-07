/**
 * Visão Grade do espelho operacional (25/09 — extraída da página; redesenho 07/10).
 * Cabeçalho por etapa, linhas memoizadas (GradeRow), rodapé de somas e barra de status.
 *
 * 07/10: um cartão só — faixa "Ir para" + legenda no alto, a grade, a barra de
 * status embaixo. Cabeçalho no fundo de tabela do app (`surface-muted`), com o
 * filete da etapa subindo do corpo até o cabeçalho; a altura acompanha a tela,
 * em vez de um número cravado que deixava duas barras de rolagem.
 */
import { useMemo, useRef, useEffect } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { hotelTotalCents, type MirrorRow } from "@shared/operational-mirror-types";
import { BLOCOS_DE_CUSTO, blocoEmUso, blocoPendencia, type GruposConfirmados } from "@shared/mirror-pendencia";
import { GradeRow } from "./grade-row";
import {
  ALL_BLOCKS, BARRA, PONTO_ETAPA, brl,
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
  const botaoDeOrdem = (ativo: boolean) => `inline-flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ativo ? "text-primary" : ""}`;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
      {/* "Ir para": 39 colunas não cabem na tela, e rolar às cegas até achar
          "Locação" é o custo diário de quem preenche. Cada botão leva o bloco
          para a esquerda da área visível — sem esconder coluna nenhuma. A
          legenda das cores mora na mesma faixa: é lida antes da grade. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-1.5">
        <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Ir para</span>
        <div className="flex flex-wrap items-center gap-0.5">
          {ALL_BLOCKS.filter((b) => show(b.key)).map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => irParaBloco(b.key)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${b.ponto}`} aria-hidden="true" />
              {b.label}
            </button>
          ))}
        </div>
        <span className="ml-auto inline-flex items-center gap-3 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-warning-soft ring-1 ring-inset ring-warning/30" aria-hidden="true" />
            falta preencher
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand-soft ring-1 ring-inset ring-primary/30" aria-hidden="true" />
            a confirmar
          </span>
        </span>
      </div>
      <div ref={rolagemRef} className="esp-grade-rolagem min-h-[280px] overflow-auto">
        <table ref={tabelaRef} className="esp-grade w-full border-separate border-spacing-0 text-xs" data-testid="operational-grid">
          <caption className="sr-only">Espelho operacional: colaboradores do evento com função, dias, transporte e hospedagem</caption>
          <thead>
            <tr>
              <th scope="col" colSpan={2} className="sticky left-0 top-0 z-40 h-8 border-b border-r border-border bg-surface-muted px-2.5 py-0 text-left align-middle">
                <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-slate-700">Colaborador</span>
              </th>
              <GrupoHead colSpan={4} ponto={PONTO_ETAPA.schedule} barra={BARRA.schedule}>Período</GrupoHead>
              {show("passagem") && <GrupoHead data-bloco="passagem" colSpan={9} ponto={PONTO_ETAPA.ticket} barra={BARRA.ticket}><Progresso rotulo="Passagem" feito={feito.feito.passagem} total={feito.base.passagem} /></GrupoHead>}
              {show("hospedagem") && <GrupoHead data-bloco="hospedagem" colSpan={12} ponto={PONTO_ETAPA.hotel} barra={BARRA.hotel}><Progresso rotulo="Hospedagem" feito={feito.feito.hospedagem} total={feito.base.hospedagem} /></GrupoHead>}
              {show("bagagem") && <GrupoHead data-bloco="bagagem" colSpan={3} ponto={PONTO_ETAPA.baggage} barra={BARRA.baggage}>Bagagem</GrupoHead>}
              {show("uber") && <GrupoHead data-bloco="uber" colSpan={3} ponto={PONTO_ETAPA.uber} barra={BARRA.uber}><Progresso rotulo="Uber" feito={feito.feito.uber} total={feito.base.uber} /></GrupoHead>}
              {show("locacao") && <GrupoHead data-bloco="locacao" colSpan={4} ponto={PONTO_ETAPA.car} barra={BARRA.car}>Locação</GrupoHead>}
              {show("pendencias") && <GrupoHead data-bloco="pendencias" colSpan={2} ponto={PONTO_ETAPA.pend} barra={BARRA.pend}>Situação</GrupoHead>}
            </tr>
            <tr>
              <th scope="col" className={`sticky left-0 top-8 z-40 min-w-[210px] border-b border-border bg-surface-muted ${headPad} text-left font-medium text-muted-foreground`}>
                <button type="button" onClick={() => onSort("nome")} aria-label="Ordenar por nome" className={botaoDeOrdem(sort?.key === "nome")}>Nome {sortIcon("nome")}</button>
              </th>
              <th scope="col" className={`esp-congelada sticky left-[210px] top-8 z-40 min-w-[120px] border-b border-r border-border bg-surface-muted ${headPad} text-left font-medium text-muted-foreground`}>
                <button type="button" onClick={() => onSort("departamento")} aria-label="Ordenar por departamento" className={botaoDeOrdem(sort?.key === "departamento")}>Departamento {sortIcon("departamento")}</button>
              </th>
              {["Início", "Data Ida", "Término", "Data Volta"].map((h, i) => <ColHead key={h} pad={headPad} barra={i === 0 ? BARRA.schedule : undefined}>{h}</ColHead>)}
              {show("passagem") && <>
                <ColHead pad={headPad} barra={BARRA.ticket} alinhar="direita">Valor</ColHead><ColHead pad={headPad}>Aero ida</ColHead><ColHead pad={headPad} alinhar="centro">HR Ida</ColHead><ColHead pad={headPad} alinhar="centro">HR Volta</ColHead>
                <ColHead pad={headPad}>Aero volta</ColHead><ColHead pad={headPad}>Localizador</ColHead><ColHead pad={headPad}>Cia</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad} alinhar="centro">Conferido</ColHead>
              </>}
              {show("hospedagem") && <>
                <ColHead pad={headPad} barra={BARRA.hotel}>Hotel</ColHead><ColHead pad={headPad}>Reserva</ColHead><ColHead pad={headPad} alinhar="centro">Check-in</ColHead><ColHead pad={headPad} alinhar="centro">Check-out</ColHead>
                <ColHead pad={headPad} alinhar="centro">Noites</ColHead><ColHead pad={headPad}>Quarto</ColHead><ColHead pad={headPad} alinhar="direita">Diária</ColHead><ColHead pad={headPad} alinhar="centro">Late C/Out</ColHead>
                <ColHead pad={headPad} alinhar="direita">Total</ColHead><ColHead pad={headPad}>Pagador</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad} alinhar="centro">Conferido</ColHead>
              </>}
              {show("bagagem") && <><ColHead pad={headPad} barra={BARRA.baggage} alinhar="direita">Valor</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad} alinhar="centro">Conferido</ColHead></>}
              {show("uber") && <><ColHead pad={headPad} barra={BARRA.uber} alinhar="direita">Valor</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad} alinhar="centro">Conferido</ColHead></>}
              {show("locacao") && <><ColHead pad={headPad} barra={BARRA.car}>Empresa</ColHead><ColHead pad={headPad} alinhar="direita">R$</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad} alinhar="centro">Conferido</ColHead></>}
              {show("pendencias") && <><ColHead pad={headPad} barra={BARRA.pend} alinhar="centro">Situação</ColHead><ColHead pad={headPad}>Observações</ColHead></>}
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
              <tr>
                <th scope="row" colSpan={2} className="sticky left-0 z-30 border-r border-t border-border bg-surface-muted px-2.5 py-2 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-slate-700">
                  Total {rows.length === totalDoEvento ? "do evento" : "do recorte"}
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
      {/* Fora da área de rolagem: o tamanho da grade e os atalhos.
          A navegação por setas existe no código desde sempre e era invisível
          — dizer que ela existe é metade do ganho. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-muted px-3 py-2 text-2xs text-muted-foreground">
        <span className="tabular-nums">
          {rows.length === totalDoEvento ? `${rows.length} ${rows.length === 1 ? "pessoa" : "pessoas"}` : `${rows.length} de ${totalDoEvento} pessoas`} · {colunasVisiveis} colunas
        </span>
        {!editMode && canEdit && <span className="text-slate-600">Edição desligada — a grade está só para leitura</span>}
        {editMode && (
          <span className="ml-auto inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span><Tecla>Enter</Tecla> edita</span>
            <span><Tecla>Tab</Tecla> avança</span>
            <span><Tecla>Esc</Tecla> desiste</span>
            <span><Tecla>↑↓←→</Tecla> navega</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** Cabeçalho de grupo: fundo de tabela, ponto colorido, rótulo legível e o filete da etapa. */
function GrupoHead({ ponto, barra, children, ...resto }: { ponto: string; barra?: string; children: React.ReactNode } & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="colgroup" {...resto} className={`sticky top-0 z-30 h-8 border-b border-border bg-surface-muted px-2.5 py-0 text-left align-middle leading-none ${barra ? `border-l-2 ${barra}` : ""}`}>
      <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-slate-700">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ponto}`} aria-hidden="true" />
        {children}
      </span>
    </th>
  );
}

/** Célula de total: só as colunas de dinheiro somam. */
function TotalCol({ valor }: { valor: number }) {
  return (
    <td className="whitespace-nowrap border-t border-border bg-surface-muted px-2 py-2 text-right text-xs font-semibold tabular-nums text-foreground">
      {valor > 0 ? brl(valor) : null}
    </td>
  );
}
/** Colunas que não somam nada — vazias de propósito. */
function TotalVazio({ n }: { n: number }) {
  return <>{Array.from({ length: n }, (_, i) => <td key={i} className="border-t border-border bg-surface-muted" />)}</>;
}
/** Tecla de atalho na barra de status. */
function Tecla({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-card px-1 font-mono text-2xs leading-4 text-slate-600">{children}</kbd>;
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
        <span className={`rounded px-1 py-px text-2xs font-semibold normal-case tracking-normal tabular-nums ${
          completo ? "bg-success-soft text-success" : "bg-card text-slate-600 ring-1 ring-inset ring-border"}`}
          title={`${feito} de ${total} ${total === 1 ? "colaborador" : "colaboradores"} com este item preenchido`}>
          {completo ? `${total} ✓` : `${feito}/${total}`}
        </span>
      )}
    </span>
  );
}

function ColHead({ children, pad, barra, alinhar = "esquerda" }: { children: React.ReactNode; pad: string; barra?: string; alinhar?: "esquerda" | "direita" | "centro" }) {
  const lado = alinhar === "direita" ? "text-right" : alinhar === "centro" ? "text-center" : "text-left";
  return (
    <th scope="col" className={`sticky top-8 z-30 whitespace-nowrap border-b border-border bg-surface-muted font-medium text-muted-foreground ${pad} ${lado} ${barra ? `border-l-2 ${barra}` : ""}`}>
      {children}
    </th>
  );
}
