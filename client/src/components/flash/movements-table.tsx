// Extraído de flash-account.tsx em 25/09 (modularização): tabela do extrato
// (data, lançamento, valor, saldo e ações). Cada linha é memoizada — a lista
// pode ter centenas de lançamentos e só a linha editada precisa repintar.
// 28/09: sobre o DataTable (cabeçalho fixo, caption, cartões no celular); a
// linha memoizada continua, entregue por `rowRender`, e as células são funções
// compartilhadas com as colunas para o cartão mostrar o mesmo conteúdo.
import { memo } from "react";
import { ArrowDownCircle, ArrowUpCircle, Pencil, Sparkles, Trash2 } from "lucide-react";
import { isAutomaticFlashMovement } from "@shared/flash-rules";
import { DataTable, type ColunaDaTabela } from "@/components/common/data-table";
import { automaticBadgeLabel, fmtDate, formatCurrency, type ExtratoLinha } from "./flash-types";

export interface MovementRowProps {
  m: ExtratoLinha;
  eventName: string;
  canManage: boolean;
  onEdit: (m: ExtratoLinha) => void;
  onDelete: (m: ExtratoLinha) => void;
}

// ─── Células ────────────────────────────────────────────────────────────────

function celulaData(m: ExtratoLinha) {
  return <span className="text-muted-foreground whitespace-nowrap font-mono">{fmtDate(m.movementDate)}</span>;
}

function celulaLancamento(m: ExtratoLinha, eventName: string) {
  const automatico = isAutomaticFlashMovement(m);
  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {m.type === "credito"
          ? <ArrowUpCircle className="w-3.5 h-3.5 text-success-strong shrink-0" aria-hidden="true" />
          : <ArrowDownCircle className="w-3.5 h-3.5 text-danger-strong shrink-0" aria-hidden="true" />}
        <span className={`text-2xs font-bold px-1.5 py-0.5 rounded-full ${m.category === "alimentacao" ? "bg-success-soft text-success" : "bg-brand-soft text-primary"}`}>
          {m.category === "alimentacao" ? "Alimentação" : "Mobilidade"}
        </span>
        {automatico && (
          <span
            className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-brand-soft text-primary inline-flex items-center gap-1"
            title={m.sourceType === "oc"
              ? "Crédito automático legado, gerado pela OC da nota fiscal (regra até 18/08) — somente leitura"
              : "Crédito automático gerado na aprovação do comparativo do evento — somente leitura"}
          >
            <Sparkles className="w-2.5 h-2.5" aria-hidden="true" />
            {automaticBadgeLabel(m)}
          </span>
        )}
      </div>
      {(m.description || m.eventId) && (
        <p className="text-2xs text-muted-foreground mt-1 truncate max-w-[260px]">
          {[eventName, m.description].filter(Boolean).join(" — ")}
        </p>
      )}
    </>
  );
}

function celulaValor(m: ExtratoLinha) {
  return (
    <span className={`font-mono font-semibold whitespace-nowrap ${m.signed >= 0 ? "text-success" : "text-danger-strong"}`}>
      {m.signed >= 0 ? "+" : "−"}{formatCurrency(Math.abs(m.signed))}
    </span>
  );
}

function celulaSaldo(m: ExtratoLinha) {
  return (
    <span className="font-mono text-muted-foreground whitespace-nowrap">
      {formatCurrency(m.category === "alimentacao" ? m.runningFood : m.runningMobility)}
    </span>
  );
}

function celulaAcoes(m: ExtratoLinha, onEdit: (m: ExtratoLinha) => void, onDelete: (m: ExtratoLinha) => void) {
  if (isAutomaticFlashMovement(m)) {
    return (
      <span className="text-2xs text-muted-foreground" title="Lançamento automático: acompanha o Realizado; estorno em Comparativo → Fechamento do comparativo → Reabrir comparativo">
        somente leitura
      </span>
    );
  }
  return (
    <>
      <button
        title="Editar lançamento"
        aria-label="Editar lançamento"
        onClick={() => onEdit(m)}
        className="w-6 h-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-primary-hover hover:bg-brand-soft transition-colors"
      >
        <Pencil className="w-3 h-3" aria-hidden="true" />
      </button>
      <button
        title="Excluir lançamento"
        aria-label="Excluir lançamento"
        onClick={() => onDelete(m)}
        className="w-6 h-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-danger-strong hover:bg-danger-soft transition-colors"
      >
        <Trash2 className="w-3 h-3" aria-hidden="true" />
      </button>
    </>
  );
}

// ─── Linha memoizada ────────────────────────────────────────────────────────

export const MovementRow = memo(function MovementRow({ m, eventName, canManage, onEdit, onDelete }: MovementRowProps) {
  return (
    <tr className="border-t border-border first:border-t-0 hover:bg-surface-muted/60">
      <td className="px-4 py-2.5">{celulaData(m)}</td>
      <td className="px-2 py-2.5">{celulaLancamento(m, eventName)}</td>
      <td className="px-2 py-2.5 text-right">{celulaValor(m)}</td>
      <td className="px-4 py-2.5 text-right">{celulaSaldo(m)}</td>
      {canManage && <td className="px-2 py-2.5 text-right whitespace-nowrap">{celulaAcoes(m, onEdit, onDelete)}</td>}
    </tr>
  );
});

export interface MovementsTableProps {
  extratoVisible: ExtratoLinha[];
  canManage: boolean;
  getEventName: (id?: string | null) => string;
  onEdit: (m: ExtratoLinha) => void;
  onDelete: (m: ExtratoLinha) => void;
}

export function MovementsTable({ extratoVisible, canManage, getEventName, onEdit, onDelete }: MovementsTableProps) {
  const columns: ColunaDaTabela<ExtratoLinha>[] = [
    { key: "data", header: "Data", cell: celulaData, headerClassName: "px-4" },
    { key: "lancamento", header: "Lançamento", papel: "principal", cell: m => celulaLancamento(m, getEventName(m.eventId)), headerClassName: "px-2" },
    { key: "valor", header: "Valor", align: "right", cell: celulaValor, headerClassName: "px-2" },
    { key: "saldo", header: "Saldo", align: "right", cell: celulaSaldo, headerClassName: "px-4" },
    ...(canManage
      ? [{ key: "acoes", header: "", headerLabel: "Ações", align: "right", papel: "acoes", cell: m => celulaAcoes(m, onEdit, onDelete), headerClassName: "px-2" } satisfies ColunaDaTabela<ExtratoLinha>]
      : []),
  ];
  return (
    <DataTable
      columns={columns}
      rows={extratoVisible}
      getRowId={m => m.id}
      caption="Extrato de lançamentos"
      density="compact"
      stickyHeader
      minWidthClassName="min-w-[560px]"
      tableClassName="text-xs"
      // O contêiner que rola (max-h-[470px]) é o da página; o DataTable não
      // pode cortar a rolagem aqui, senão o cabeçalho fixo deixa de grudar.
      className="overflow-visible"
      rowRender={m => <MovementRow key={m.id} m={m} eventName={getEventName(m.eventId)} canManage={canManage} onEdit={onEdit} onDelete={onDelete} />}
    />
  );
}

export default MovementsTable;
