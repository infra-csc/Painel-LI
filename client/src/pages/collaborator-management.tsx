import { useState, useMemo } from "react";
import { enderecoEmUmaLinha } from "@shared/endereco";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Check, X, Eye, UserPlus, Upload, FileText, Edit, Users,
  ChevronLeft, ChevronRight, Search, AlertCircle,
  Loader2, Ban, AlertTriangle, RotateCcw, ShieldCheck, Clock, IdCard, Home,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import CollaboratorModal, { validateCPF } from "@/components/modals/collaborator-modal";
import BulkUploadModal from "@/components/modals/bulk-upload-modal";
import type { Collaborator } from "@shared/schema";
import { normalizeRole } from "@shared/roles";
import { hasPermission, hasRole } from "@/lib/role-utils";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { PageHeader } from "@/components/common/page-header";
import { PageContainer } from "@/components/common/page-container";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import { campo, useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";
import { RequiredMark } from "@/components/forms/required-mark";


// ─── Avatar helpers ────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  ["bg-brand-soft", "text-primary"],
  ["bg-brand-soft", "text-primary"],
  ["bg-success-soft", "text-success"],
  ["bg-warning-soft", "text-warning"],
  ["bg-brand-soft", "text-primary"],
  ["bg-info-soft", "text-info"],
  ["bg-warning-soft", "text-warning"],
  ["bg-danger-soft", "text-danger"],
  ["bg-brand-soft", "text-primary"],
  ["bg-info-soft", "text-info"],
];
function avatarClasses(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ─── Config ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

const STATUS_CFG: Record<string, { label: string; dotCls: string; badgeCls: string }> = {
  pendente:  { label: "Pendente",  dotCls: "bg-warning-strong",   badgeCls: "bg-warning-soft text-warning border border-warning/25" },
  aprovado:  { label: "Aprovado",  dotCls: "bg-success-strong", badgeCls: "bg-success-soft text-success border border-success/25" },
  rejeitado: { label: "Rejeitado", dotCls: "bg-danger-strong",     badgeCls: "bg-danger-soft text-danger border border-danger/25" },
  inativo:   { label: "Inativo",   dotCls: "bg-slate-400",   badgeCls: "bg-muted text-muted-foreground border border-border" },
};

const TYPE_CFG: Record<string, { label: string; cls: string }> = {
  freela: { label: "Freela", cls: "bg-brand-soft text-primary border border-primary/25" },
  casa:   { label: "Casa",   cls: "bg-surface-muted text-slate-600 border border-border" },
  local:  { label: "Local",  cls: "bg-brand-soft text-primary border border-primary/25" },
};

// `doc` pode vir ausente: GET /api/collaborators só entrega documento, nascimento,
// telefone e endereço para admin, Compras e RH (projeção por papel, 23/09).
function formatDocument(doc: string | null | undefined, type: string | null | undefined) {
  if (!doc) return "";
  if (type === "cpf") return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return doc;
}
function formatDate(dateStr: string) {
  // Recorta só a parte "YYYY-MM-DD": se vier um ISO completo, o dia sairia
  // como "01T00:00:00". Formatação por string evita o deslocamento de fuso
  // que new Date("YYYY-MM-DD") causa em Brasília.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr).trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dateStr;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pendente;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold ${cfg.badgeCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dotCls}`} />
      {cfg.label}
    </span>
  );
}

// ─── Detail row helper ─────────────────────────────────────────────────────
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
      <p className="text-sm text-slate-700 font-medium">{value}</p>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function CollaboratorManagement() {
  usePageTitle("Colaboradores");
  // Busca, status, tipo e página na URL (23/09): abrir um colaborador em outra
  // tela e voltar devolvia a lista zerada e na página 1.
  const [urlState, setUrlState] = useUrlState({
    q: campo.texto(""),
    status: campo.texto("all"),
    type: campo.texto("all"),
    pagina: campo.numero(1),
  });
  const filters = useMemo(
    () => ({ status: urlState.status, type: urlState.type, search: urlState.q }),
    [urlState.status, urlState.type, urlState.q],
  );
  const page = urlState.pagina;
  const setPage = (p: number) => setUrlState({ pagina: p });
  const [selectedCollaborator, setSelectedCollaborator] = useState<Collaborator | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showBulkUploadModal, setBulkUploadModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editRg, setEditRg] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [inactivateReason, setInactivateReason] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();
  // A lista literal deixava de fora papéis legados que o servidor aceita
  // ("compras", "viagens", "Administrador"...): o botão sumia para quem podia agir.
  // Inativar/reativar: POST /api/collaborators/:id/(in|re)activate → só admin e compras.
  const canManage = hasRole(user, "admin", "purchasing");
  const SO_ADMIN_COMPRAS = "Só administradores e Compras podem inativar ou reativar.";
  // Criar/importar/editar/aprovar: espelha POST/PATCH /api/collaborators
  // (cadastro + área de função). RH só visualiza.
  const canEdit = hasPermission(user, "canEditCollaborators");
  // Espelha a projeção do GET /api/collaborators: Logística e Área de Função
  // não recebem documento, nascimento, telefone, endereço nem anexo — a coluna
  // e as seções correspondentes somem em vez de mostrar "—".
  const podeVerDadosPessoais = hasRole(user, "admin", "purchasing", "financial");

  const { data: collaborators, isLoading, isError, error, refetch } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, approvalNotes, cpf, rg }: { id: string; status: string; approvalNotes?: string; cpf?: string; rg?: string }) => {
      // approvedAt/approvedBy vão sempre que o status muda (o servidor também
      // os preenche pela sessão — aqui é só para o cache local ficar coerente).
      const payload: any = { status, approvedAt: new Date().toISOString(), approvedBy: user?.id ?? null };
      if (approvalNotes) payload.approvalNotes = approvalNotes;
      if (cpf) { payload.officialDocument = cpf; payload.documentType = "cpf"; if (rg) { payload.secondaryDocument = rg; payload.secondaryDocumentType = "rg"; } }
      else if (rg) { payload.officialDocument = rg; payload.documentType = "rg"; }
      return (await apiRequest("PATCH", `/api/collaborators/${id}`, payload)).json();
    },
    onSuccess: () => {
      toast({ title: "Status atualizado com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      setShowDetailsModal(false); setShowApprovalModal(false);
      setApprovalNotes(""); setEditCpf(""); setEditRg("");
    },
    onError: (err: any) => toast({ title: "Erro ao atualizar colaborador", description: parseErr(err, "Tente novamente."), variant: "destructive" }),
  });

  // apiRequest já entrega o corpo do erro em err.body — só cai no parse manual
  // quando o servidor devolve algo fora do padrão.
  const parseErr = (err: any, fallback: string) => {
    if (err?.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
    if (err?.status === 403) return "Você não tem permissão para esta ação.";
    if (err?.body?.message) return String(err.body.message);
    const raw = err?.message as string | undefined;
    if (!raw) return fallback;
    const jsonStart = raw.indexOf("{");
    if (jsonStart >= 0) {
      try { return JSON.parse(raw.slice(jsonStart))?.message || fallback; } catch { return raw; }
    }
    return raw;
  };

  const inactivateMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await apiRequest("POST", `/api/collaborators/${id}/inactivate`, { reason })).json(),
    onSuccess: () => {
      toast({ title: "Colaborador inativado com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      setShowDeleteModal(false);
      setSelectedCollaborator(null);
      setInactivateReason("");
    },
    onError: (err: any) => toast({ title: parseErr(err, "Erro ao inativar colaborador"), variant: "destructive" }),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) =>
      (await apiRequest("POST", `/api/collaborators/${id}/reactivate`)).json(),
    onSuccess: () => {
      toast({ title: "Colaborador reativado com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
    },
    onError: (err: any) => toast({ title: parseErr(err, "Erro ao reativar colaborador"), variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    if (!collaborators) return [];
    const q = filters.search.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, "");
    return collaborators.filter(c => {
      // "Inativo" na prática é active === false (a rota /inactivate não mexe em
      // `status`); o valor legado "inativo" em status continua valendo.
      const statusMatch = filters.status === "all"
        ? true
        : filters.status === "inativo"
          ? (c.status === "inativo" || (c as any).active === false)
          : c.status === filters.status;
      const typeMatch = filters.type === "all" || c.type === filters.type;
      // Documento ausente para quem não vê dados pessoais (`c.officialDocument.includes`
      // derrubava a tela inteira com TypeError para production/function_area).
      const documento = c.officialDocument ?? "";
      const searchMatch = !q
        || c.fullName.toLowerCase().includes(q)
        || documento.includes(q)
        // Busca por documento formatado ("123.456") também precisa casar.
        || (!!qDigits && documento.replace(/\D/g, "").includes(qDigits));
      return statusMatch && typeMatch && searchMatch;
    });
  }, [collaborators, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Inativar/filtrar podia encolher a lista e deixar `page` fora do intervalo →
  // tabela vazia com o rodapé dizendo que havia registros.
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  const setFilter = (key: string, val: string) => setUrlState({ [key === "search" ? "q" : key]: val, pagina: 1 });
  const clearFilters = () => setUrlState({ status: "all", type: "all", q: "", pagina: 1 });
  const hasFilters = filters.status !== "all" || filters.type !== "all" || !!filters.search;

  const { totalCount, pendingCount, approvedCount, freelaCount, casaCount } = useMemo(() => {
    let pendente = 0, aprovado = 0, freela = 0, casa = 0;
    for (const c of collaborators ?? []) {
      if (c.status === "pendente") pendente++;
      else if (c.status === "aprovado") aprovado++;
      if (c.type === "freela") freela++;
      else if (c.type === "casa") casa++;
    }
    return {
      totalCount: collaborators?.length ?? 0,
      pendingCount: pendente, approvedCount: aprovado,
      freelaCount: freela, casaCount: casa,
    };
  }, [collaborators]);

  const handleApprove = (c: Collaborator) => {
    setSelectedCollaborator(c); setApprovalAction("approve");
    setApprovalNotes("");
    if (c.documentType === "cpf") { setEditCpf(c.officialDocument || ""); setEditRg(c.secondaryDocument || ""); }
    else { setEditRg(c.officialDocument || ""); setEditCpf(c.secondaryDocument || ""); }
    setShowApprovalModal(true);
  };
  // Cancelar uma aprovação deixava editCpf/editRg/approvalNotes preenchidos com os
  // dados do colaborador anterior; a rejeição seguinte gravava o documento errado.
  const handleReject  = (c: Collaborator) => {
    setSelectedCollaborator(c); setApprovalAction("reject");
    setApprovalNotes(""); setEditCpf(""); setEditRg("");
    setShowApprovalModal(true);
  };
  const handleView    = (c: Collaborator) => { setSelectedCollaborator(c); setShowDetailsModal(true); };
  const handleEdit    = (c: Collaborator) => { setSelectedCollaborator(c); setShowEditModal(true); };
  const handleConfirm = () => {
    if (!selectedCollaborator || updateMutation.isPending) return;
    const isApprove = approvalAction === "approve";
    // Exige ao menos um documento — mas não obriga CPF: cadastros legados
    // aprovados só com RG continuam aprováveis (exigir CPF travaria todos eles).
    // Quem não recebe os documentos do servidor aprova sem mexer neles (o
    // PATCH só leva status/observações e o cadastro mantém o que já tem).
    if (isApprove && podeVerDadosPessoais && !editCpf.trim() && !editRg.trim()) {
      toast({ title: "Informe CPF ou RG para aprovar.", variant: "destructive" });
      return;
    }
    // Mesma validação do modal de cadastro: um CPF inválido não pode virar o
    // documento oficial na aprovação.
    if (isApprove && editCpf.trim() && !validateCPF(editCpf)) {
      toast({ title: "CPF inválido", description: "Confira os dígitos do CPF antes de aprovar.", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: selectedCollaborator.id,
      status: isApprove ? "aprovado" : "rejeitado",
      approvalNotes: approvalNotes.trim() || undefined,
      // Documentos só são gravados no fluxo de aprovação — a rejeição não deve
      // sobrescrever CPF/RG de ninguém.
      cpf: isApprove ? (editCpf.trim() || undefined) : undefined,
      rg:  isApprove ? (editRg.trim()  || undefined) : undefined,
    });
  };

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader icon={Users} title="Colaboradores" subtitle="Gerencie prestadores, motoristas e colaboradores internos" />
        <LoadingState count={8} label="Carregando colaboradores…" />
      </PageContainer>
    );
  }

  // Só troca a tela pelo erro quando NÃO há dados em cache: com
  // refetchOnWindowFocus ligado, um refetch falho em segundo plano não pode
  // apagar uma lista que o usuário está usando.
  if (isError && !collaborators) {
    const err: any = error;
    const msg = err?.status === 401 ? "Sua sessão expirou. Entre novamente para ver os colaboradores."
      : err?.status === 403 ? "Você não tem permissão para ver os colaboradores."
      : err?.body?.message || "Verifique sua conexão e tente novamente.";
    return (
      /* Antes, uma falha de rede caía no estado vazio e dizia "nenhum colaborador". */
      <div role="alert" className="bg-card rounded-xl border border-danger/25 shadow-1 py-16 px-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-danger-soft flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6 text-danger-strong" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-slate-700">Não foi possível carregar os colaboradores</p>
        <p className="text-xs text-muted-foreground mt-1 mb-4">{msg}</p>
        <button onClick={() => refetch()} className="h-9 px-4 text-xs font-semibold text-slate-600 border border-border rounded-lg hover:bg-surface-muted transition-colors">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <PageContainer>

        {/* ── Page Header ── */}
        <PageHeader
          icon={Users}
          title="Colaboradores"
          subtitle="Gerencie prestadores, motoristas e colaboradores internos"
          actions={canEdit && (
            <>
              <button
                onClick={() => setBulkUploadModal(true)}
                className="h-9 px-3.5 flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-border hover:border-slate-300 hover:bg-surface-muted rounded-lg transition-colors bg-card"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" /> Importar
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="h-9 px-4 flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold rounded-lg transition-all shadow-1"
              >
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> Novo colaborador
              </button>
            </>
          )}
        />

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Total",      value: totalCount,    stripe: "bg-slate-700",   icon: Users,          iconBg: "bg-muted", iconTx: "text-slate-600", valTx: "var(--foreground)" },
            { label: "Aprovados",  value: approvedCount, stripe: "bg-success-strong", icon: ShieldCheck,     iconBg: "bg-success-soft", iconTx: "text-success", valTx: "var(--success)" },
            { label: "Pendentes",  value: pendingCount,  stripe: "bg-warning-strong",   icon: Clock,          iconBg: "bg-warning-soft",  iconTx: "text-warning-strong", valTx: "var(--warning)" },
            { label: "Freelancers", value: freelaCount,  stripe: "bg-primary",    icon: IdCard,         iconBg: "bg-brand-soft",   iconTx: "text-primary",  valTx: "var(--primary)" },
            { label: "Casa",       value: casaCount,     stripe: "bg-primary",  icon: Home,           iconBg: "bg-brand-soft", iconTx: "text-primary", valTx: "var(--primary)" },
          ].map(card => (
            <div key={card.label} className="bg-card rounded-xl border border-border shadow-1 overflow-hidden">
              <div className={`h-1 w-full ${card.stripe}`} />
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.iconBg} ${card.iconTx}`}>
                    <card.icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
                <p className="text-2xs font-bold tracking-widest text-muted-foreground uppercase mb-0.5">{card.label}</p>
                <p className="text-2xl font-bold leading-none" style={{ color: card.valTx }}>{card.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main card ── */}
        <div className="bg-card rounded-xl border border-border shadow-1 overflow-hidden">

          {/* Filter bar */}
          <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2.5 bg-muted/30">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              <input
                id="collaborators-search"
                type="text"
                aria-label={podeVerDadosPessoais ? "Buscar por nome ou documento" : "Buscar por nome"}
                placeholder={podeVerDadosPessoais ? "Buscar por nome ou documento…" : "Buscar por nome…"}
                value={filters.search}
                onChange={e => setFilter("search", e.target.value)}
                className="w-full h-8 pl-9 pr-8 bg-card border border-border rounded-lg text-sm text-slate-700 placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring/20 transition-all"
              />
              {filters.search && (
                <button onClick={() => setFilter("search", "")} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600">
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Status filter */}
            <Select value={filters.status} onValueChange={v => setFilter("status", v)}>
              <SelectTrigger aria-label="Filtrar por status" className="h-8 w-[145px] text-xs border-input rounded-lg bg-card focus:border-primary focus:ring-1 focus:ring-ring/20">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="rejeitado">Rejeitado</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>

            {/* Type filter */}
            <Select value={filters.type} onValueChange={v => setFilter("type", v)}>
              <SelectTrigger aria-label="Filtrar por tipo" className="h-8 w-[145px] text-xs border-input rounded-lg bg-card focus:border-primary focus:ring-1 focus:ring-ring/20">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="casa">Casa</SelectItem>
                <SelectItem value="freela">Freela</SelectItem>
                <SelectItem value="local">Local</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-dashed border-slate-300 rounded-lg hover:bg-surface-muted hover:border-slate-400 transition-colors"
              >
                <X className="w-3 h-3" aria-hidden="true" /> Limpar
              </button>
            )}

            {hasFilters && (
              <span className="text-2xs text-muted-foreground ml-1">
                {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Users}
                variant={hasFilters ? "filtered" : "default"}
                title="Nenhum colaborador encontrado"
                description={canEdit ? "Tente ajustar os filtros ou cadastre um novo colaborador." : "Tente ajustar os filtros."}
                onClearFilters={hasFilters ? clearFilters : undefined}
                className="border-0 py-14"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-border bg-muted/40">
                    <th scope="col" className="px-5 py-3 text-2xs font-bold tracking-widest text-muted-foreground uppercase">Colaborador</th>
                    {podeVerDadosPessoais && (
                      <th scope="col" className="px-5 py-3 text-2xs font-bold tracking-widest text-muted-foreground uppercase">Documento</th>
                    )}
                    <th scope="col" className="px-5 py-3 text-2xs font-bold tracking-widest text-muted-foreground uppercase">Tipo</th>
                    <th scope="col" className="px-5 py-3 text-2xs font-bold tracking-widest text-muted-foreground uppercase">Cidade</th>
                    <th scope="col" className="px-5 py-3 text-2xs font-bold tracking-widest text-muted-foreground uppercase">Status</th>
                    <th scope="col" className="px-5 py-3 text-2xs font-bold tracking-widest text-muted-foreground uppercase text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map(c => {
                    const isPending = c.status === "pendente";
                    const isInactive = (c as any).active === false;
                    const typeCfg = TYPE_CFG[c.type] ?? TYPE_CFG.local;
                    const displayName = toTitleCase(c.fullName);
                    const [bgCls, textCls] = avatarClasses(c.fullName);

                    return (
                      <tr
                        key={c.id}
                        className={`group transition-colors ${isInactive ? "bg-surface-muted/60 hover:bg-muted/60" : isPending ? "hover:bg-warning-soft/30" : "hover:bg-brand-soft/30"}`}
                      >
                        {/* Colaborador */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${bgCls} ${textCls}`}>
                              {initials(c.fullName)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground leading-tight">{displayName}</p>
                              {c.phone && <p className="text-2xs text-muted-foreground mt-0.5">{c.phone}</p>}
                            </div>
                          </div>
                        </td>

                        {/* Documento — coluna inteira some para quem não recebe dados pessoais */}
                        {podeVerDadosPessoais && (
                          <td className="px-5 py-3.5">
                            <div className="font-mono text-2xs text-muted-foreground space-y-0.5">
                              <div>{formatDocument(c.officialDocument, c.documentType)}</div>
                              {c.secondaryDocument && (
                                <div className="text-muted-foreground">
                                  {(c.secondaryDocumentType || (c.documentType === "cpf" ? "rg" : "cpf")).toUpperCase()}{" "}
                                  {formatDocument(c.secondaryDocument, c.secondaryDocumentType || "")}
                                </div>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Tipo */}
                        <td className="px-5 py-3.5">
                          <span className={`text-2xs font-semibold px-2.5 py-1 rounded-full ${typeCfg.cls}`}>
                            {typeCfg.label}
                          </span>
                        </td>

                        {/* Cidade */}
                        <td className="px-5 py-3.5 text-sm text-muted-foreground">{c.city || "—"}</td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={c.status} />
                            {isInactive && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full bg-border text-slate-600 border border-slate-300 cursor-default">
                                    <Ban className="w-3 h-3" aria-hidden="true" /> Inativo
                                  </span>
                                </TooltipTrigger>
                                {(c as any).inactiveReason && (
                                  <TooltipContent className="max-w-[240px]">{(c as any).inactiveReason}</TooltipContent>
                                )}
                              </Tooltip>
                            )}
                          </div>
                        </td>

                        {/* Ações */}
                        <td className="px-5 py-3.5">
                          {/* Ações sempre visíveis: escondê-las até o hover deixava o
                              usuário sem saber que a linha tinha ações (e some no touch). */}
                          <div className="flex items-center justify-end gap-1">
                            {isPending && canEdit && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button onClick={() => handleApprove(c)} disabled={updateMutation.isPending} aria-label={`Aprovar ${displayName}`} className="w-7 h-7 rounded-md flex items-center justify-center text-success-strong hover:bg-success-soft disabled:opacity-40 transition-colors">
                                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Aprovar</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button onClick={() => handleReject(c)} disabled={updateMutation.isPending} aria-label={`Rejeitar ${displayName}`} className="w-7 h-7 rounded-md flex items-center justify-center text-danger-strong hover:bg-danger-soft disabled:opacity-40 transition-colors">
                                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Rejeitar</TooltipContent>
                                </Tooltip>
                              </>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button onClick={() => handleView(c)} aria-label={`Ver detalhes de ${displayName}`} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-brand-soft hover:text-primary transition-colors">
                                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Ver detalhes</TooltipContent>
                            </Tooltip>
                            {canEdit && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button onClick={() => handleEdit(c)} aria-label={`Editar ${displayName}`} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-brand-soft hover:text-primary transition-colors">
                                    <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Editar</TooltipContent>
                              </Tooltip>
                            )}
                            {(canManage || canEdit) && (
                              isInactive ? (
                                <MotivoDesabilitado motivo={canManage ? "Reativar" : SO_ADMIN_COMPRAS} desabilitado={!canManage}>
                                    <button onClick={() => reactivateMutation.mutate(c.id)} disabled={reactivateMutation.isPending || !canManage} aria-label={`Reativar ${displayName}`} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-success-soft hover:text-success disabled:opacity-40 transition-colors">
                                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                </MotivoDesabilitado>
                              ) : (
                                <MotivoDesabilitado motivo={canManage ? "Inativar" : SO_ADMIN_COMPRAS} desabilitado={!canManage}>
                                    <button onClick={() => { setSelectedCollaborator(c); setInactivateReason(""); setShowDeleteModal(true); }} disabled={!canManage} aria-label={`Inativar ${displayName}`} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-danger-soft hover:text-danger transition-colors">
                                      <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                </MotivoDesabilitado>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {filtered.length > 0 && (
            <div className="px-5 py-2.5 border-t border-border bg-surface-muted/50 flex items-center justify-between">
              <p className="text-2xs text-muted-foreground font-medium">
                Mostrando{" "}
                <span className="text-slate-600 font-semibold">{Math.min((currentPage - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}</span>
                {" "}de{" "}
                <span className="text-slate-600 font-semibold">{filtered.length}</span> colaboradores
              </p>
              {totalPages > 1 && (
                <nav className="flex items-center gap-1" aria-label="Paginação">
                  <button
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    aria-label="Página anterior"
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-surface-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <div className="flex items-center gap-0.5">
                    {/* A janela acompanha a página atual — antes eram sempre 1..5,
                        e a partir da 6ª página nenhum número ficava destacado. */}
                    {(() => {
                      const win = Math.min(totalPages, 5);
                      const start = Math.max(1, Math.min(currentPage - Math.floor(win / 2), totalPages - win + 1));
                      return Array.from({ length: win }, (_, i) => start + i).map(p => (
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
                      ));
                    })()}
                  </div>
                  <button
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Próxima página"
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-surface-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </nav>
              )}
            </div>
          )}
        </div>

        {/* ── Details Modal ── */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="max-w-xl rounded-xl p-0 gap-0 border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              {selectedCollaborator && (() => {
                const [bg, tx] = avatarClasses(selectedCollaborator.fullName);
                return (
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${bg} ${tx}`}>
                    {initials(selectedCollaborator.fullName)}
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-foreground">Detalhes do Colaborador</h3>
                {selectedCollaborator && (
                  <p className="text-2xs text-muted-foreground mt-0.5 truncate">{toTitleCase(selectedCollaborator.fullName)}</p>
                )}
              </div>
              {selectedCollaborator && (
                <StatusBadge status={selectedCollaborator.status} />
              )}
              <button onClick={() => setShowDetailsModal(false)} aria-label="Fechar detalhes" className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-slate-600 hover:bg-muted transition-colors">
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {selectedCollaborator && (
              <div className="px-5 py-5 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <DetailRow label="Nome Completo" value={toTitleCase(selectedCollaborator.fullName)} />
                  <DetailRow label="Tipo de Vínculo" value={toTitleCase(selectedCollaborator.type)} />
                  {/* Dados pessoais só para quem os recebe do servidor — para os
                      demais papéis a linha some (não existe "—" para dado que não veio). */}
                  {podeVerDadosPessoais && (
                    <DetailRow label="Data de Nascimento" value={selectedCollaborator.birthDate ? formatDate(selectedCollaborator.birthDate) : "—"} />
                  )}
                  <DetailRow label="Cidade" value={selectedCollaborator.city || "—"} />
                  {podeVerDadosPessoais && (
                    <>
                      <DetailRow label="Telefone" value={selectedCollaborator.phone || "—"} />
                      <DetailRow label="Endereço" value={enderecoEmUmaLinha(selectedCollaborator) || "—"} />
                      <DetailRow label="CEP" value={selectedCollaborator.addressZip || "—"} />
                    </>
                  )}
                  <DetailRow label="Criado por" value={selectedCollaborator.createdByName || "—"} />
                </div>

                {podeVerDadosPessoais && (
                  <div className="border-t border-border pt-4">
                    <p className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Documentos</p>
                    <div className="font-mono text-xs space-y-1 bg-surface-muted rounded-lg px-3 py-2.5 border border-border">
                      {/* O rótulo seguia fixo em "CPF" mesmo quando o documento principal era RG. */}
                      <div><span className="text-muted-foreground">{(selectedCollaborator.documentType || "documento").toUpperCase()} </span><span className="text-slate-700 font-medium">{formatDocument(selectedCollaborator.officialDocument, selectedCollaborator.documentType)}</span></div>
                      {selectedCollaborator.secondaryDocument && (
                        <div><span className="text-muted-foreground">{(selectedCollaborator.secondaryDocumentType || (selectedCollaborator.documentType === "cpf" ? "rg" : "cpf")).toUpperCase()} </span><span className="text-slate-700 font-medium">{formatDocument(selectedCollaborator.secondaryDocument, selectedCollaborator.secondaryDocumentType || "")}</span></div>
                      )}
                    </div>
                  </div>
                )}

                {selectedCollaborator.documentAttachmentId && (
                  <div className="border-t border-border pt-4">
                    <p className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Documento Anexado</p>
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-muted border border-border">
                      <FileText className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">CPF/RG — {toTitleCase(selectedCollaborator.fullName)}</p>
                        <p className="text-2xs text-muted-foreground">Documento do colaborador</p>
                      </div>
                      <button
                        onClick={() => window.open(`/api/attachments/${selectedCollaborator.documentAttachmentId}/view`, "_blank")}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-primary border border-primary/25 rounded-lg hover:bg-brand-soft transition-colors"
                      >
                        <Eye className="w-3 h-3" aria-hidden="true" /> Ver
                      </button>
                    </div>
                  </div>
                )}

                {selectedCollaborator.approvalNotes && (
                  <div className="border-t border-border pt-4">
                    <p className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Observações</p>
                    <p className="text-xs text-slate-600 bg-surface-muted rounded-lg px-3 py-2 border border-border">{selectedCollaborator.approvalNotes}</p>
                  </div>
                )}

                {selectedCollaborator.status === "pendente" && canEdit && (
                  <div className="flex gap-2 justify-end pt-2 border-t border-border">
                    <button onClick={() => { setShowDetailsModal(false); handleReject(selectedCollaborator); }} className="flex items-center gap-1.5 h-9 px-4 text-xs font-medium text-danger border border-danger/25 rounded-lg hover:bg-danger-soft transition-colors">
                      <X className="w-3.5 h-3.5" aria-hidden="true" /> Rejeitar
                    </button>
                    <button onClick={() => { setShowDetailsModal(false); handleApprove(selectedCollaborator); }} className="flex items-center gap-1.5 h-9 px-4 text-xs font-semibold bg-success hover:bg-success/90 text-white rounded-lg transition-colors shadow-1">
                      <Check className="w-3.5 h-3.5" aria-hidden="true" /> Aprovar
                    </button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Approval Modal ── */}
        <Dialog open={showApprovalModal} onOpenChange={setShowApprovalModal}>
          <DialogContent className="max-w-md rounded-xl p-0 gap-0 border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <div
                className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", (approvalAction === "approve" ? "bg-success" : "bg-danger"), (approvalAction === "approve" ? "shadow-2" : "shadow-2"))}
              >
                {approvalAction === "approve"
                  ? <Check className="w-4 h-4 text-white" strokeWidth={3} aria-hidden="true" />
                  : <X className="w-4 h-4 text-white" strokeWidth={3} aria-hidden="true" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-foreground">
                  {approvalAction === "approve" ? "Aprovar Colaborador" : "Rejeitar Colaborador"}
                </h3>
                <p className="text-2xs text-muted-foreground mt-0.5">
                  {approvalAction === "approve"
                    ? (podeVerDadosPessoais ? "Revise os dados antes de confirmar" : "Confirme a aprovação do cadastro")
                    : "Informe o motivo da rejeição"}
                </p>
              </div>
              <button onClick={() => setShowApprovalModal(false)} disabled={updateMutation.isPending} aria-label="Fechar" className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-slate-600 hover:bg-muted disabled:opacity-40 transition-colors">
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {selectedCollaborator && (
              <div className="px-5 py-5 space-y-4">
                {(() => {
                  const [bg, tx] = avatarClasses(selectedCollaborator.fullName);
                  return (
                    <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-muted rounded-lg border border-border">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${bg} ${tx}`}>
                        {initials(selectedCollaborator.fullName)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{toTitleCase(selectedCollaborator.fullName)}</p>
                        {selectedCollaborator.officialDocument && (
                          <p className="text-2xs text-muted-foreground font-mono">{formatDocument(selectedCollaborator.officialDocument, selectedCollaborator.documentType)}</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {approvalAction === "approve" && podeVerDadosPessoais && (
                  <div className="space-y-3">
                    <p className="text-2xs font-bold text-muted-foreground uppercase tracking-widest">Documentos</p>
                    <div>
                      <label htmlFor="approval-cpf" className="text-2xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">CPF<RequiredMark /></label>
                      <input id="approval-cpf" value={editCpf} onChange={e => setEditCpf(e.target.value)} placeholder="000.000.000-00"
                        className="w-full h-9 px-3 font-mono text-sm border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring/20" />
                    </div>
                    <div>
                      <label htmlFor="approval-rg" className="text-2xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">RG <span className="text-muted-foreground font-normal normal-case tracking-normal">(opcional)</span></label>
                      <input id="approval-rg" value={editRg} onChange={e => setEditRg(e.target.value)} placeholder="00.000.000-0"
                        className="w-full h-9 px-3 font-mono text-sm border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring/20" />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="approval-notes" className="text-2xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">
                    Observações <span className="text-muted-foreground font-normal normal-case tracking-normal">{approvalAction === "approve" ? "(opcional)" : "(recomendado)"}</span>
                  </label>
                  <Textarea id="approval-notes" value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)}
                    placeholder={approvalAction === "approve" ? "Comentários sobre a aprovação…" : "Motivo da rejeição…"}
                    rows={3} className="text-sm border-border rounded-lg resize-none focus:border-primary focus:ring-1 focus:ring-ring/20" />
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowApprovalModal(false)} disabled={updateMutation.isPending}
                    className="flex-1 h-9 text-xs font-medium text-slate-600 border border-border rounded-lg hover:bg-surface-muted transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleConfirm} disabled={updateMutation.isPending}
                    className={cn("flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-semibold text-white rounded-lg transition-colors shadow-1 disabled:opacity-60", (approvalAction === "approve" ? "bg-success" : "bg-danger"), (approvalAction === "approve" ? "shadow-1" : "shadow-1"))}
                  >
                    {updateMutation.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      : approvalAction === "approve"
                        ? <><Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" /> Confirmar Aprovação</>
                        : <><X className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" /> Confirmar Rejeição</>
                    }
                  </button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Inactivate Confirmation Modal ── */}
        <Dialog open={showDeleteModal} onOpenChange={(open) => { if (!inactivateMutation.isPending) { setShowDeleteModal(open); if (!open) setInactivateReason(""); } }}>
          <DialogContent className="max-w-[420px] rounded-xl p-0 gap-0 border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden">
            <div className="px-6 py-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-danger-soft border border-danger/25 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-danger-strong" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground leading-tight mb-1">Inativar colaborador?</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">Ele deixará de aparecer nas escalações, mas será mantido no histórico. Você pode reativá-lo depois.</p>
                </div>
              </div>

              {selectedCollaborator && (() => {
                const [bg, tx] = avatarClasses(selectedCollaborator.fullName);
                return (
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-muted rounded-xl border border-border">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${bg} ${tx}`}>
                      {initials(selectedCollaborator.fullName)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{toTitleCase(selectedCollaborator.fullName)}</p>
                      {selectedCollaborator.officialDocument && (
                        <p className="text-2xs text-muted-foreground font-mono">{formatDocument(selectedCollaborator.officialDocument, selectedCollaborator.documentType)}</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div>
                <label htmlFor="inactivate-reason" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Motivo da inativação<RequiredMark />
                </label>
                <textarea
                  id="inactivate-reason"
                  value={inactivateReason}
                  onChange={e => setInactivateReason(e.target.value)}
                  placeholder="Ex.: desligamento, encerramento de contrato…"
                  rows={3}
                  disabled={inactivateMutation.isPending}
                  className="w-full text-sm rounded-lg border border-border px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-danger/25 focus:border-danger/25 disabled:opacity-60"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setShowDeleteModal(false); setInactivateReason(""); }}
                  disabled={inactivateMutation.isPending}
                  className="flex-1 h-9 text-xs font-medium text-slate-600 border border-border rounded-lg hover:bg-surface-muted transition-colors disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { if (selectedCollaborator && inactivateReason.trim()) inactivateMutation.mutate({ id: selectedCollaborator.id, reason: inactivateReason.trim() }); }}
                  disabled={inactivateMutation.isPending || !inactivateReason.trim()}
                  className="flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-semibold text-white rounded-lg transition-colors shadow-1 disabled:opacity-60 disabled:cursor-not-allowed bg-danger shadow-1"
                >
                  {inactivateMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    : <><Ban className="w-3.5 h-3.5" aria-hidden="true" /> Inativar</>
                  }
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <BulkUploadModal open={showBulkUploadModal} onClose={() => setBulkUploadModal(false)} />
        <CollaboratorModal open={showAddModal} onClose={() => setShowAddModal(false)} />
        <CollaboratorModal open={showEditModal} onClose={() => setShowEditModal(false)} collaborator={selectedCollaborator} isEdit={true} />

      </PageContainer>
    </TooltipProvider>
  );
}
