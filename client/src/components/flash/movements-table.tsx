// Extraído de flash-account.tsx em 25/09 (modularização); redesenho 08/10.
//
// O extrato lido como o de um banco: lançamentos em ordem de data, agrupados
// por mês, com ENTRADA e SAÍDA em colunas separadas (a forma diz o sentido —
// além do sinal e da cor), o saldo da categoria depois de cada lançamento e o
// total do período no pé. Cada linha continua memoizada: a lista pode ter
// centenas de lançamentos e só a linha editada precisa repintar.
//
// Abaixo de ~600px de largura útil (medido pelo painel, não pela janela) a
// linha vira cartão — data à esquerda, descrição e valor na mesma linha, a
// categoria e o saldo embaixo — sem re-renderizar nada (só CSS: `fla-` no
// index.css).
import { Fragment, memo, useMemo } from "react";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { isAutomaticFlashMovement } from "@shared/flash-rules";
import { cn } from "@/lib/utils";
import {
  ROTULO_CATEGORIA, automaticBadgeLabel, dataDoExtrato, fmtDate, formatCurrency, mesDe, rotuloDoMes,
  type ExtratoLinha,
} from "./flash-types";

export interface MovementRowProps {
  m: ExtratoLinha;
  eventName: string;
  canManage: boolean;
  onEdit: (m: ExtratoLinha) => void;
  onDelete: (m: ExtratoLinha) => void;
  /** Acabou de ser criado/alterado: acende e volta. */
  destaque?: boolean;
}

/** Título do lançamento: a descrição; sem ela, o sentido e a categoria. */
function tituloDoLancamento(m: ExtratoLinha): string {
  if (m.description?.trim()) return m.description.trim();
  const cat = (ROTULO_CATEGORIA[m.category] ?? m.category).toLowerCase();
  return m.type === "credito" ? `Crédito em ${cat}` : `Débito em ${cat}`;
}

// ─── Linha memoizada ────────────────────────────────────────────────────────

export const MovementRow = memo(function MovementRow({ m, eventName, canManage, onEdit, onDelete, destaque }: MovementRowProps) {
  const automatico = isAutomaticFlashMovement(m);
  const credito = m.signed >= 0;
  const { dia, semana } = dataDoExtrato(m.movementDate);
  const iso = String(m.movementDate || "").split("T")[0];
  const categoria = ROTULO_CATEGORIA[m.category] ?? m.category;
  const saldo = m.category === "alimentacao" ? m.runningFood : m.runningMobility;
  const titulo = tituloDoLancamento(m);
  // O evento já citado na descrição (ex.: "Reposição — Maratona X") não se repete embaixo.
  const evento = eventName && !titulo.includes(eventName) ? eventName : "";
  const valor = `${credito ? "+" : "−"}${formatCurrency(Math.abs(m.signed))}`;

  return (
    <tr
      className={cn("fla-linha", destaque && "fla-acesa")}
      data-tipo={credito ? "entrada" : "saida"}
      data-testid={`flash-lancamento-${m.id}`}
    >
      <td data-col="data" className="fla-td">
        <time dateTime={iso} title={fmtDate(m.movementDate)} className="block text-sm font-medium tabular-nums text-foreground leading-5">{dia}</time>
        <span className="block text-2xs leading-4 text-muted-foreground">{semana}</span>
      </td>
      <td data-col="lanc" className="fla-td min-w-0">
        <p className="m-0 text-sm leading-5 text-foreground fla-titulo" title={titulo}>{titulo}</p>
        <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4 text-muted-foreground">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className={cn("fla-ponto", m.category === "alimentacao" ? "bg-success-strong" : "bg-primary")} aria-hidden="true" />
            {categoria}
          </span>
          {evento && <><span aria-hidden="true">·</span><span className="min-w-0 truncate max-w-[280px]" title={evento}>{evento}</span></>}
          {automatico && (
            <span
              className="inline-flex items-center gap-1 h-[18px] px-1.5 rounded bg-brand-soft text-2xs font-semibold text-primary whitespace-nowrap"
              title={m.sourceType === "oc"
                ? "Crédito automático legado, gerado pela OC da nota fiscal (regra até 18/08) — somente leitura"
                : "Crédito automático gerado na aprovação do comparativo do evento — somente leitura"}
            >
              {automaticBadgeLabel(m)}
            </span>
          )}
        </p>
      </td>
      {/* Entrada e saída em colunas separadas: a posição diz o sentido. */}
      <td data-col="entrada" className="fla-td text-right">
        {credito && <span className="text-sm font-semibold tabular-nums whitespace-nowrap text-success" aria-label={`Entrada de ${formatCurrency(m.signed)}`}>{valor}</span>}
      </td>
      <td data-col="saida" className="fla-td text-right">
        {!credito && <span className="text-sm font-medium tabular-nums whitespace-nowrap text-foreground" aria-label={`Saída de ${formatCurrency(Math.abs(m.signed))}`}>{valor}</span>}
      </td>
      <td data-col="saldo" className="fla-td text-right">
        <span className={cn("block text-sm tabular-nums whitespace-nowrap", saldo < 0 ? "text-danger font-medium" : "text-slate-600")}>{formatCurrency(saldo)}</span>
        <span className="fla-saldo-cat block text-2xs leading-4 text-muted-foreground whitespace-nowrap">{categoria.toLowerCase()}</span>
      </td>
      {canManage && (
        <td data-col="acoes" className="fla-td text-right whitespace-nowrap">
          {automatico ? (
            // Só o cadeado: a legenda acima da tabela e a etiqueta "Automático" já dizem o porquê.
            <span
              className="fla-leitura inline-flex items-center justify-center w-8 h-8 text-muted-foreground"
              title="Lançamento automático: somente leitura. Acompanha o Realizado; estorno em Comparativo → Fechamento do comparativo → Reabrir comparativo"
            >
              <Lock className="w-3.5 h-3.5" aria-hidden="true" /><span className="sr-only">somente leitura</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5">
              <button
                type="button"
                title="Editar lançamento"
                aria-label="Editar lançamento"
                onClick={() => onEdit(m)}
                className="pas-alvo inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Excluir lançamento"
                aria-label="Excluir lançamento"
                onClick={() => onDelete(m)}
                className="pas-alvo inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-danger-strong hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
        </td>
      )}
    </tr>
  );
});

// ─── Tabela ─────────────────────────────────────────────────────────────────

export interface MovementsTableProps {
  extratoVisible: ExtratoLinha[];
  canManage: boolean;
  getEventName: (id?: string | null) => string;
  onEdit: (m: ExtratoLinha) => void;
  onDelete: (m: ExtratoLinha) => void;
  /** Lançamentos que acabaram de entrar ou mudar (acendem uma vez). */
  destaques?: ReadonlySet<string>;
  /** O filtro de origem está ligado (o pé diz "dos lançamentos mostrados"). */
  filtrado?: boolean;
}

export function MovementsTable({ extratoVisible, canManage, getEventName, onEdit, onDelete, destaques, filtrado = false }: MovementsTableProps) {
  // Grupos por mês, na ordem do extrato (a mais antiga primeiro — a ordem em que o saldo acumula).
  const meses = useMemo(() => {
    const grupos: { chave: string; linhas: ExtratoLinha[] }[] = [];
    for (const m of extratoVisible) {
      const chave = mesDe(m.movementDate);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.chave === chave) ultimo.linhas.push(m);
      else grupos.push({ chave, linhas: [m] });
    }
    return grupos;
  }, [extratoVisible]);

  const { entradas, saidas } = useMemo(() => {
    let e = 0, s = 0;
    for (const m of extratoVisible) { if (m.signed >= 0) e += m.signed; else s += -m.signed; }
    return { entradas: e, saidas: s };
  }, [extratoVisible]);

  const nCols = canManage ? 6 : 5;

  return (
    <table className={cn("fla-tabela w-full border-separate border-spacing-0", !canManage && "fla-sem-acoes")} data-testid="flash-extrato-tabela">
      <caption className="sr-only">Extrato de lançamentos</caption>
      {/* Larguras fixas (index.css): o lançamento fica com o que sobrar. */}
      <colgroup>
        <col data-col="data" />
        <col data-col="lanc" />
        <col data-col="entrada" />
        <col data-col="saida" />
        <col data-col="saldo" />
        {canManage && <col data-col="acoes" />}
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className="fla-th text-left">Data</th>
          <th scope="col" className="fla-th text-left">Lançamento</th>
          <th scope="col" className="fla-th text-right">Entrada</th>
          <th scope="col" className="fla-th text-right">Saída</th>
          <th scope="col" className="fla-th text-right" title="Saldo da categoria do lançamento depois dele">Saldo</th>
          {canManage && <th scope="col" className="fla-th text-right"><span className="sr-only">Ações</span></th>}
        </tr>
      </thead>
      <tbody>
        {meses.map(g => (
          <Fragment key={g.chave}>
            <tr className="fla-mes">
              <th scope="colgroup" colSpan={nCols} className="text-left">
                {rotuloDoMes(g.chave)}
                <span className="font-normal normal-case tracking-normal text-muted-foreground"> · {g.linhas.length} {g.linhas.length === 1 ? "lançamento" : "lançamentos"}</span>
              </th>
            </tr>
            {g.linhas.map(m => (
              <MovementRow
                key={m.id}
                m={m}
                eventName={getEventName(m.eventId)}
                canManage={canManage}
                onEdit={onEdit}
                onDelete={onDelete}
                destaque={destaques?.has(m.id)}
              />
            ))}
          </Fragment>
        ))}
      </tbody>
      <tfoot>
        <tr className="fla-pe" data-testid="flash-extrato-totais">
          <th scope="row" colSpan={2} className="fla-td text-left">
            <span className="text-xs font-semibold text-slate-600">{filtrado ? "Total dos lançamentos mostrados" : "Total do extrato"}</span>
          </th>
          <td data-col="entrada" className="fla-td text-right" data-rotulo="Entradas">
            <span className="text-sm font-semibold tabular-nums whitespace-nowrap text-success">+{formatCurrency(entradas)}</span>
          </td>
          <td data-col="saida" className="fla-td text-right" data-rotulo="Saídas">
            <span className="text-sm font-semibold tabular-nums whitespace-nowrap text-foreground">−{formatCurrency(saidas)}</span>
          </td>
          <td className="fla-td fla-pe-vazio" />
          {canManage && <td className="fla-td fla-pe-vazio" />}
        </tr>
      </tfoot>
    </table>
  );
}

export default MovementsTable;
