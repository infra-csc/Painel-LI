/**
 * Tabela de Colaboradores (25/09 — extraída de pages/collaborator-management.tsx;
 * 28/09 — sobre o DataTable): cabeçalho, uma linha por colaborador (memoizada,
 * entregue ao DataTable por `rowRender`) com as ações sempre visíveis, e o
 * rodapé de paginação. As células são funções compartilhadas entre a linha e
 * as colunas — assim o cartão do celular mostra exatamente o que a tabela mostra.
 */
import { memo } from "react";
import { Ban, Check, ChevronLeft, ChevronRight, Edit, Eye, RotateCcw, X } from "lucide-react";
import type { Collaborator } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable, type ColunaDaTabela } from "@/components/common/data-table";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { Avatar, PAGE_SIZE, StatusBadge, TYPE_CFG, formatDocument, toTitleCase } from "./collaborator-shared";
import type { CollaboratorActions } from "./use-collaborator-actions";

const SO_ADMIN_COMPRAS = "Só administradores e Compras podem inativar ou reativar.";
const TD = "px-5 py-3.5";

export interface CollaboratorRowProps {
  c: Collaborator;
  podeVerDadosPessoais: boolean;
  canEdit: boolean;
  canManage: boolean;
  updatePending: boolean;
  reactivatePending: boolean;
  acoes: Pick<CollaboratorActions, "handleApprove" | "handleReject" | "handleView" | "handleEdit" | "handleInactivate">;
  onReactivate: (id: string) => void;
}

type PropsDaLinha = Omit<CollaboratorRowProps, "c" | "podeVerDadosPessoais">;

// ─── Células (usadas pela linha memoizada e pelas colunas/cartão) ────────────

function celulaColaborador(c: Collaborator) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={c.fullName} />
      <div>
        <p className="text-sm font-semibold text-foreground leading-tight">{toTitleCase(c.fullName)}</p>
        {c.phone && <p className="text-2xs text-muted-foreground mt-0.5">{c.phone}</p>}
      </div>
    </div>
  );
}

function celulaDocumento(c: Collaborator) {
  return (
    <div className="font-mono text-2xs text-muted-foreground space-y-0.5">
      <div>{formatDocument(c.officialDocument, c.documentType)}</div>
      {c.secondaryDocument && (
        <div className="text-muted-foreground">
          {(c.secondaryDocumentType || (c.documentType === "cpf" ? "rg" : "cpf")).toUpperCase()}{" "}
          {formatDocument(c.secondaryDocument, c.secondaryDocumentType || "")}
        </div>
      )}
    </div>
  );
}

function celulaTipo(c: Collaborator) {
  const typeCfg = TYPE_CFG[c.type] ?? TYPE_CFG.local;
  return <span className={`text-2xs font-semibold px-2.5 py-1 rounded-full ${typeCfg.cls}`}>{typeCfg.label}</span>;
}

function celulaCidade(c: Collaborator) {
  return <span className="text-sm text-muted-foreground">{c.city || "—"}</span>;
}

function celulaStatus(c: Collaborator) {
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge status={c.status} />
      {c.active === false && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full bg-border text-slate-600 border border-slate-300 cursor-default">
              <Ban className="w-3 h-3" aria-hidden="true" /> Inativo
            </span>
          </TooltipTrigger>
          {c.inactiveReason && <TooltipContent className="max-w-[240px]">{c.inactiveReason}</TooltipContent>}
        </Tooltip>
      )}
    </div>
  );
}

function celulaAcoes(c: Collaborator, { canEdit, canManage, updatePending, reactivatePending, acoes, onReactivate }: PropsDaLinha) {
  const isPending = c.status === "pendente";
  const isInactive = c.active === false;
  const displayName = toTitleCase(c.fullName);
  const acao = "w-7 h-7 rounded-md flex items-center justify-center transition-colors";
  return (
    /* Ações sempre visíveis: escondê-las até o hover deixava o
       usuário sem saber que a linha tinha ações (e some no touch). */
    <div className="flex items-center justify-end gap-1">
      {isPending && canEdit && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => acoes.handleApprove(c)} disabled={updatePending} aria-label={`Aprovar ${displayName}`} className={`${acao} text-success-strong hover:bg-success-soft disabled:opacity-40`}>
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Aprovar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => acoes.handleReject(c)} disabled={updatePending} aria-label={`Rejeitar ${displayName}`} className={`${acao} text-danger-strong hover:bg-danger-soft disabled:opacity-40`}>
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Rejeitar</TooltipContent>
          </Tooltip>
        </>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={() => acoes.handleView(c)} aria-label={`Ver detalhes de ${displayName}`} className={`${acao} text-muted-foreground hover:bg-brand-soft hover:text-primary`}>
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Ver detalhes</TooltipContent>
      </Tooltip>
      {canEdit && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => acoes.handleEdit(c)} aria-label={`Editar ${displayName}`} className={`${acao} text-muted-foreground hover:bg-brand-soft hover:text-primary`}>
              <Edit className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Editar</TooltipContent>
        </Tooltip>
      )}
      {(canManage || canEdit) && (
        isInactive ? (
          <MotivoDesabilitado motivo={canManage ? "Reativar" : SO_ADMIN_COMPRAS} desabilitado={!canManage}>
              <button onClick={() => onReactivate(c.id)} disabled={reactivatePending || !canManage} aria-label={`Reativar ${displayName}`} className={`${acao} text-muted-foreground hover:bg-success-soft hover:text-success disabled:opacity-40`}>
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
          </MotivoDesabilitado>
        ) : (
          <MotivoDesabilitado motivo={canManage ? "Inativar" : SO_ADMIN_COMPRAS} desabilitado={!canManage}>
              <button onClick={() => acoes.handleInactivate(c)} disabled={!canManage} aria-label={`Inativar ${displayName}`} className={`${acao} text-muted-foreground hover:bg-danger-soft hover:text-danger`}>
                <Ban className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
          </MotivoDesabilitado>
        )
      )}
    </div>
  );
}

// ─── Linha memoizada ────────────────────────────────────────────────────────

const CollaboratorRow = memo(function CollaboratorRow({ c, podeVerDadosPessoais, ...props }: CollaboratorRowProps) {
  const isPending = c.status === "pendente";
  const isInactive = c.active === false;
  return (
    <tr className={`group transition-colors border-t border-border first:border-t-0 ${isInactive ? "bg-surface-muted/60 hover:bg-muted/60" : isPending ? "hover:bg-warning-soft/30" : "hover:bg-brand-soft/30"}`}>
      <td className={TD}>{celulaColaborador(c)}</td>
      {/* Documento — coluna inteira some para quem não recebe dados pessoais */}
      {podeVerDadosPessoais && <td className={TD}>{celulaDocumento(c)}</td>}
      <td className={TD}>{celulaTipo(c)}</td>
      <td className={TD}>{celulaCidade(c)}</td>
      <td className={TD}>{celulaStatus(c)}</td>
      <td className={TD}>{celulaAcoes(c, props)}</td>
    </tr>
  );
});

export function CollaboratorsTable({ rows, podeVerDadosPessoais, ...rowProps }: Omit<CollaboratorRowProps, "c"> & { rows: Collaborator[] }) {
  const columns: ColunaDaTabela<Collaborator>[] = [
    { key: "colaborador", header: "Colaborador", papel: "principal", cell: celulaColaborador },
    ...(podeVerDadosPessoais ? [{ key: "documento", header: "Documento", cell: celulaDocumento } satisfies ColunaDaTabela<Collaborator>] : []),
    { key: "tipo", header: "Tipo", cell: celulaTipo },
    { key: "cidade", header: "Cidade", cell: celulaCidade },
    { key: "status", header: "Status", cell: celulaStatus },
    { key: "acoes", header: "Ações", align: "right", papel: "acoes", cell: c => celulaAcoes(c, rowProps) },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={c => c.id}
      caption="Colaboradores cadastrados"
      rowRender={c => <CollaboratorRow key={c.id} c={c} podeVerDadosPessoais={podeVerDadosPessoais} {...rowProps} />}
    />
  );
}

export function CollaboratorsPagination({ total, currentPage, totalPages, setPage }: { total: number; currentPage: number; totalPages: number; setPage: (p: number) => void }) {
  const seta = "w-7 h-7 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-surface-muted disabled:opacity-40 disabled:pointer-events-none transition-colors";
  // A janela acompanha a página atual — antes eram sempre 1..5,
  // e a partir da 6ª página nenhum número ficava destacado.
  const win = Math.min(totalPages, 5);
  const start = Math.max(1, Math.min(currentPage - Math.floor(win / 2), totalPages - win + 1));
  return (
    <div className="px-5 py-2.5 border-t border-border bg-surface-muted/50 flex items-center justify-between">
      <p className="text-2xs text-muted-foreground font-medium">
        Mostrando{" "}
        <span className="text-slate-600 font-semibold">{Math.min((currentPage - 1) * PAGE_SIZE + 1, total)}–{Math.min(currentPage * PAGE_SIZE, total)}</span>
        {" "}de{" "}
        <span className="text-slate-600 font-semibold">{total}</span> colaboradores
      </p>
      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginação">
          <button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label="Página anterior" className={seta}>
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: win }, (_, i) => start + i).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                aria-label={`Página ${p}`}
                aria-current={currentPage === p ? "page" : undefined}
                className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                  currentPage === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} aria-label="Próxima página" className={seta}>
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
