/**
 * Tabela de Colaboradores (25/09 — extraída de pages/collaborator-management.tsx;
 * 28/09 — sobre o DataTable; 07/10 — redesenho).
 *
 * Linha: o NOME é o botão que abre a ficha, e o ::after dele cobre a linha
 * inteira (clicar em qualquer ponto abre; o teclado chega pelo nome) — o
 * "olho" de ver detalhes saiu porque a linha toda faz isso. As ações ficam à
 * vista, discretas até a linha ser apontada; o cadastro pendente ganha um
 * "Aprovar" com texto (era um ✓ verde de 14px que ninguém achava).
 *
 * Tabela ↔ cartão pela LARGURA ÚTIL da lista (o menu compacto muda o espaço
 * sem mudar a janela): abaixo de ~860px viram cartões — em duas colunas no
 * tablet. Os cartões mostram exatamente o que a linha mostra.
 */
import { memo, type ReactNode } from "react";
import { Ban, Check, ChevronLeft, ChevronRight, Loader2, PencilLine, RotateCcw, X } from "lucide-react";
import type { Collaborator } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable, type ColunaDaTabela } from "@/components/common/data-table";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import { cn } from "@/lib/utils";
import {
  Avatar, PAGE_SIZE, SituacaoDoColaborador, TipoBadge, formatDocument, rotuloDoSecundario, toTitleCase,
} from "./collaborator-shared";
import type { CollaboratorActions } from "./use-collaborator-actions";

const SO_ADMIN_COMPRAS = "Só administradores e Compras podem inativar ou reativar.";
const TD = "px-4 py-3 align-middle";

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

// ─── Células (usadas pela linha memoizada e pelo cartão) ─────────────────────

function NomeQueAbre({ c, onAbrir, className }: { c: Collaborator; onAbrir: (c: Collaborator) => void; className?: string }) {
  const nome = toTitleCase(c.fullName);
  return (
    <button
      type="button"
      onClick={() => onAbrir(c)}
      aria-label={`Ver detalhes de ${nome}`}
      title={nome}
      className={cn("col-abrir block max-w-full line-clamp-2 break-words text-left text-sm font-semibold leading-5 text-foreground rounded-sm focus-visible:outline-none", className)}
    >
      {nome}
    </button>
  );
}

function celulaColaborador(c: Collaborator, onAbrir: (c: Collaborator) => void) {
  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <Avatar name={c.fullName} />
      <div className="min-w-0">
        <NomeQueAbre c={c} onAbrir={onAbrir} />
        {c.phone && <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{c.phone}</p>}
      </div>
    </div>
  );
}

function celulaDocumento(c: Collaborator) {
  if (!c.officialDocument && !c.secondaryDocument) return <span className="text-xs text-muted-foreground">Sem documento</span>;
  return (
    <div className="font-mono text-xs tabular-nums leading-5 whitespace-nowrap">
      <div className="text-slate-700">{formatDocument(c.officialDocument, c.documentType)}</div>
      {c.secondaryDocument && (
        <div className="text-muted-foreground">
          <span className="font-sans text-2xs font-medium">{rotuloDoSecundario(c)}</span>{" "}
          {formatDocument(c.secondaryDocument, c.secondaryDocumentType || "")}
        </div>
      )}
    </div>
  );
}

function celulaCidade(c: Collaborator) {
  return c.city
    ? <span className="text-sm text-slate-700 whitespace-nowrap">{c.city}</span>
    : <span className="text-xs text-muted-foreground">Sem cidade</span>;
}

/** Botão de ícone das ações (28px; 44px no toque via pas-alvo). */
function Acao({ rotulo, dica, onClick, disabled, children, className }: {
  rotulo: string; dica: string; onClick: () => void; disabled?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={rotulo}
          className={cn(
            "col-acao pas-alvo inline-flex w-7 h-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:pointer-events-none",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{dica}</TooltipContent>
    </Tooltip>
  );
}

/** Aprovar / Rejeitar do cadastro pendente. `rotulado`: os dois com texto (cartão e ficha). */
function DecisaoPendente({ c, updatePending, acoes, rotulado }: Pick<PropsDaLinha, "updatePending" | "acoes"> & { c: Collaborator; rotulado?: boolean }) {
  const nome = toTitleCase(c.fullName);
  return (
    <>
      {rotulado ? (
        <button
          type="button"
          onClick={() => acoes.handleReject(c)}
          disabled={updatePending}
          aria-label={`Rejeitar ${nome}`}
          className="col-acao pas-alvo inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" /> Rejeitar
        </button>
      ) : (
        <Acao rotulo={`Rejeitar ${nome}`} dica="Rejeitar cadastro" onClick={() => acoes.handleReject(c)} disabled={updatePending} className="hover:bg-danger-soft hover:text-danger">
          <X className="w-4 h-4" aria-hidden="true" />
        </Acao>
      )}
      <button
        type="button"
        onClick={() => acoes.handleApprove(c)}
        disabled={updatePending}
        aria-label={`Aprovar ${nome}`}
        className="col-acao col-aprovar pas-alvo inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-semibold border border-success/30 bg-success-soft text-success hover:border-success/60 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Check className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" /> Aprovar
      </button>
    </>
  );
}

function AcoesDeCadastro({ c, canEdit, canManage, reactivatePending, acoes, onReactivate }: PropsDaLinha & { c: Collaborator }) {
  const nome = toTitleCase(c.fullName);
  const isInactive = c.active === false;
  return (
    <>
      {canEdit && (
        <Acao rotulo={`Editar ${nome}`} dica="Editar cadastro" onClick={() => acoes.handleEdit(c)} className="hover:bg-brand-soft hover:text-primary">
          <PencilLine className="w-4 h-4" aria-hidden="true" />
        </Acao>
      )}
      {(canManage || canEdit) && (
        isInactive ? (
          <MotivoDesabilitado motivo={canManage ? "Reativar" : SO_ADMIN_COMPRAS} desabilitado={!canManage}>
            <button
              type="button"
              onClick={() => onReactivate(c.id)}
              disabled={reactivatePending || !canManage}
              aria-label={`Reativar ${nome}`}
              className="col-acao pas-alvo inline-flex w-7 h-7 items-center justify-center rounded-md text-muted-foreground hover:bg-success-soft hover:text-success disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {reactivatePending
                ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                : <RotateCcw className="w-4 h-4" aria-hidden="true" />}
            </button>
          </MotivoDesabilitado>
        ) : (
          <MotivoDesabilitado motivo={canManage ? "Inativar" : SO_ADMIN_COMPRAS} desabilitado={!canManage}>
            <button
              type="button"
              onClick={() => acoes.handleInactivate(c)}
              disabled={!canManage}
              aria-label={`Inativar ${nome}`}
              className="col-acao pas-alvo inline-flex w-7 h-7 items-center justify-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Ban className="w-4 h-4" aria-hidden="true" />
            </button>
          </MotivoDesabilitado>
        )
      )}
    </>
  );
}

function celulaAcoes(c: Collaborator, props: PropsDaLinha) {
  const isPending = c.status === "pendente";
  return (
    /* Ações sempre à vista (no toque não existe hover): só ficam mais
       discretas até a linha ser apontada. */
    <div className="relative z-[1] flex items-center justify-end gap-1">
      {isPending && props.canEdit && <DecisaoPendente c={c} updatePending={props.updatePending} acoes={props.acoes} />}
      <AcoesDeCadastro c={c} {...props} />
    </div>
  );
}

// ─── Linha memoizada ────────────────────────────────────────────────────────

const CollaboratorRow = memo(function CollaboratorRow({ c, podeVerDadosPessoais, ...props }: CollaboratorRowProps) {
  const isInactive = c.active === false;
  return (
    <tr
      className={cn("col-linha border-t border-border first:border-t-0", isInactive && "col-inativa")}
      data-testid={`col-linha-${c.id}`}
    >
      <td className={cn(TD, "pl-5 col-esmaece")}>{celulaColaborador(c, props.acoes.handleView)}</td>
      {/* Documento — coluna inteira some para quem não recebe dados pessoais */}
      {podeVerDadosPessoais && <td className={cn(TD, "col-esmaece")}>{celulaDocumento(c)}</td>}
      <td className={cn(TD, "col-esmaece")}><TipoBadge type={c.type} /></td>
      <td className={cn(TD, "col-esmaece")}>{celulaCidade(c)}</td>
      <td className={TD}><SituacaoDoColaborador c={c} /></td>
      {/* Quem só consulta (Financeiro/RH) não tem ação: a coluna some — a linha inteira abre a ficha. */}
      {(props.canEdit || props.canManage) && <td className={cn(TD, "pr-4")}>{celulaAcoes(c, props)}</td>}
    </tr>
  );
});

// ─── Cartão (tablet e celular) ──────────────────────────────────────────────

function CartaoDoColaborador({ c, podeVerDadosPessoais, ...props }: CollaboratorRowProps) {
  const isPending = c.status === "pendente";
  const isInactive = c.active === false;
  const temDecisao = isPending && props.canEdit;
  const temCadastro = props.canEdit || props.canManage;
  return (
    <article className={cn("col-cartao relative flex flex-col gap-2.5 h-full rounded-xl border border-border bg-card px-3.5 pt-3 pb-2.5", isInactive && "col-inativa")} data-testid={`col-cartao-${c.id}`}>
      <div className="flex items-start gap-3 min-w-0">
        <Avatar name={c.fullName} size="w-10 h-10 text-sm" />
        <div className="min-w-0 flex-1">
          <NomeQueAbre c={c} onAbrir={props.acoes.handleView} className="text-[15px] leading-5" />
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span>{c.city || "Sem cidade"}</span>
            {c.phone && <><span aria-hidden="true">·</span><span className="tabular-nums">{c.phone}</span></>}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <TipoBadge type={c.type} />
        <SituacaoDoColaborador c={c} empilhar={false} />
      </div>
      {podeVerDadosPessoais && (c.officialDocument || c.secondaryDocument) && (
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs tabular-nums text-slate-700">
          {c.officialDocument && <span><span className="font-sans text-2xs font-medium text-muted-foreground">{(c.documentType || "doc").toUpperCase()}</span> {formatDocument(c.officialDocument, c.documentType)}</span>}
          {c.secondaryDocument && <span><span className="font-sans text-2xs font-medium text-muted-foreground">{rotuloDoSecundario(c)}</span> {formatDocument(c.secondaryDocument, c.secondaryDocumentType || "")}</span>}
        </p>
      )}
      {(temDecisao || temCadastro) && (
        <div className="relative z-[1] mt-auto flex items-center gap-1 border-t border-border pt-2 -mx-1">
          <div className="flex items-center gap-1">
            <AcoesDeCadastro c={c} {...props} />
          </div>
          {temDecisao && (
            <div className="ml-auto flex items-center gap-1">
              <DecisaoPendente c={c} updatePending={props.updatePending} acoes={props.acoes} rotulado />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Lista ──────────────────────────────────────────────────────────────────

export function CollaboratorsTable({ rows, podeVerDadosPessoais, emptyState, rodape, ...rowProps }: Omit<CollaboratorRowProps, "c"> & {
  rows: Collaborator[];
  /** No lugar da lista quando `rows` está vazio. */
  emptyState?: ReactNode;
  /** Paginação — vai dentro da moldura da tabela ou abaixo dos cartões. */
  rodape?: ReactNode;
}) {
  const { ref, largura } = useLarguraUtil<HTMLDivElement>();
  // Antes da primeira medida, a janela decide (evita a tabela piscar no celular).
  const larguraUtil = largura ?? (typeof window !== "undefined" ? window.innerWidth - 32 : 1200);
  const emCartoes = larguraUtil < (podeVerDadosPessoais ? 860 : 760);
  const duasColunas = emCartoes && larguraUtil >= 600;

  const columns: ColunaDaTabela<Collaborator>[] = [
    { key: "colaborador", header: "Colaborador", papel: "principal", cell: c => celulaColaborador(c, rowProps.acoes.handleView), headerClassName: "pl-5" },
    ...(podeVerDadosPessoais ? [{ key: "documento", header: "Documento", cell: celulaDocumento } satisfies ColunaDaTabela<Collaborator>] : []),
    { key: "tipo", header: "Tipo", cell: c => <TipoBadge type={c.type} /> },
    { key: "cidade", header: "Cidade", cell: celulaCidade },
    { key: "status", header: "Situação", width: 124, cell: c => <SituacaoDoColaborador c={c} /> },
    ...(rowProps.canEdit || rowProps.canManage
      ? [{ key: "acoes", header: "Ações", headerLabel: "Ações", align: "right", width: 196, papel: "acoes", cell: (c: Collaborator) => celulaAcoes(c, rowProps), headerClassName: "pr-4" } satisfies ColunaDaTabela<Collaborator>]
      : []),
  ];

  return (
    <div ref={ref} className="min-w-0">
      {rows.length === 0 ? emptyState : emCartoes ? (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={c => c.id}
            caption="Colaboradores cadastrados"
            cardMode="always"
            cardListClassName={cn("gap-2", duasColunas && "grid grid-cols-2")}
            cardRender={c => <CartaoDoColaborador c={c} podeVerDadosPessoais={podeVerDadosPessoais} {...rowProps} />}
            data-testid="col-cartoes"
          />
          {rodape && <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden">{rodape}</div>}
        </>
      ) : (
        <div className="col-moldura rounded-xl border border-border bg-card overflow-hidden">
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={c => c.id}
            caption="Colaboradores cadastrados"
            cardMode="never"
            density="compact"
            className="col-rolagem"
            tableClassName="col-tabela"
            rowRender={c => <CollaboratorRow key={c.id} c={c} podeVerDadosPessoais={podeVerDadosPessoais} {...rowProps} />}
            data-testid="col-tabela"
          />
          {rodape}
        </div>
      )}
    </div>
  );
}

export function CollaboratorsPagination({ total, currentPage, totalPages, setPage }: { total: number; currentPage: number; totalPages: number; setPage: (p: number) => void }) {
  const seta = "pas-alvo w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-card text-slate-600 hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  // A janela acompanha a página atual — antes eram sempre 1..5,
  // e a partir da 6ª página nenhum número ficava destacado.
  const win = Math.min(totalPages, 5);
  const start = Math.max(1, Math.min(currentPage - Math.floor(win / 2), totalPages - win + 1));
  const de = Math.min((currentPage - 1) * PAGE_SIZE + 1, total);
  const ate = Math.min(currentPage * PAGE_SIZE, total);
  return (
    <div className="px-4 sm:px-5 py-2.5 border-t border-border bg-surface-muted flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-testid="col-paginacao">
      <p className="text-xs text-muted-foreground tabular-nums">
        <span className="font-medium text-slate-700">{de}–{ate}</span> de <span className="font-medium text-slate-700">{total}</span> {total === 1 ? "colaborador" : "colaboradores"}
      </p>
      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginação">
          <button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label="Página anterior" className={seta}>
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          {Array.from({ length: win }, (_, i) => start + i).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              aria-label={`Página ${p}`}
              aria-current={currentPage === p ? "page" : undefined}
              className={cn(
                "pas-alvo min-w-8 h-8 px-2 flex items-center justify-center rounded-lg text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                currentPage === p ? "bg-primary text-primary-foreground font-semibold" : "text-slate-600 hover:bg-muted",
              )}
            >
              {p}
            </button>
          ))}
          <button type="button" onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} aria-label="Próxima página" className={seta}>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
