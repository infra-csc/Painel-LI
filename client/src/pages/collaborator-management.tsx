import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Check, X, Eye, UserPlus, Upload, FileText, Edit, Users,
  ChevronLeft, ChevronRight, Search, UserCheck, AlertCircle,
  Briefcase, Home, LayoutList, Loader2
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CollaboratorModal from "@/components/modals/collaborator-modal";
import BulkUploadModal from "@/components/modals/bulk-upload-modal";
import type { Collaborator } from "@shared/schema";

const BLUE = "#0033CC";

// ─── Avatar helpers ────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  ["bg-blue-100", "text-blue-700"],
  ["bg-violet-100", "text-violet-700"],
  ["bg-emerald-100", "text-emerald-700"],
  ["bg-orange-100", "text-orange-700"],
  ["bg-pink-100", "text-pink-700"],
  ["bg-cyan-100", "text-cyan-700"],
  ["bg-amber-100", "text-amber-700"],
  ["bg-rose-100", "text-rose-700"],
  ["bg-purple-100", "text-purple-700"],
  ["bg-teal-100", "text-teal-700"],
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
  pendente:  { label: "Pendente",  dotCls: "bg-amber-400",   badgeCls: "bg-amber-50 text-amber-700 border border-amber-200" },
  aprovado:  { label: "Aprovado",  dotCls: "bg-emerald-500", badgeCls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  rejeitado: { label: "Rejeitado", dotCls: "bg-red-500",     badgeCls: "bg-red-50 text-red-700 border border-red-200" },
  inativo:   { label: "Inativo",   dotCls: "bg-slate-400",   badgeCls: "bg-slate-100 text-slate-500 border border-slate-200" },
};

const TYPE_CFG: Record<string, { label: string; cls: string }> = {
  freela: { label: "Freela", cls: "bg-blue-50 text-blue-600 border border-blue-200" },
  casa:   { label: "Casa",   cls: "bg-slate-50 text-slate-600 border border-slate-200" },
  local:  { label: "Local",  cls: "bg-violet-50 text-violet-600 border border-violet-200" },
};

function formatDocument(doc: string, type: string) {
  if (type === "cpf") return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return doc;
}
function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pendente;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.badgeCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dotCls}`} />
      {cfg.label}
    </span>
  );
}

// ─── Detail row helper ─────────────────────────────────────────────────────
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-sm text-slate-700 font-medium">{value}</p>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function CollaboratorManagement() {
  const [filters, setFilters] = useState({ status: "all", type: "all", search: "" });
  const [page, setPage] = useState(1);
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
  const { toast } = useToast();

  const { data: collaborators, isLoading } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, approvalNotes, cpf, rg }: { id: string; status: string; approvalNotes?: string; cpf?: string; rg?: string }) => {
      const payload: any = { status };
      if (approvalNotes) { payload.approvalNotes = approvalNotes; payload.approvedAt = new Date().toISOString(); }
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
    onError: () => toast({ title: "Erro ao atualizar colaborador", variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    if (!collaborators) return [];
    return collaborators.filter(c => {
      const statusMatch = filters.status === "all" || c.status === filters.status;
      const typeMatch = filters.type === "all" || c.type === filters.type;
      const q = filters.search.toLowerCase();
      const searchMatch = !q || c.fullName.toLowerCase().includes(q) || c.officialDocument.includes(q);
      return statusMatch && typeMatch && searchMatch;
    });
  }, [collaborators, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const setFilter = (key: string, val: string) => { setFilters(p => ({ ...p, [key]: val })); setPage(1); };
  const clearFilters = () => { setFilters({ status: "all", type: "all", search: "" }); setPage(1); };
  const hasFilters = filters.status !== "all" || filters.type !== "all" || filters.search;

  const totalCount    = collaborators?.length ?? 0;
  const pendingCount  = collaborators?.filter(c => c.status === "pendente").length ?? 0;
  const approvedCount = collaborators?.filter(c => c.status === "aprovado").length ?? 0;
  const freelaCount   = collaborators?.filter(c => c.type === "freela").length ?? 0;
  const casaCount     = collaborators?.filter(c => c.type === "casa").length ?? 0;

  const handleApprove = (c: Collaborator) => {
    setSelectedCollaborator(c); setApprovalAction("approve");
    if (c.documentType === "cpf") { setEditCpf(c.officialDocument || ""); setEditRg(c.secondaryDocument || ""); }
    else { setEditRg(c.officialDocument || ""); setEditCpf(c.secondaryDocument || ""); }
    setShowApprovalModal(true);
  };
  const handleReject  = (c: Collaborator) => { setSelectedCollaborator(c); setApprovalAction("reject"); setShowApprovalModal(true); };
  const handleView    = (c: Collaborator) => { setSelectedCollaborator(c); setShowDetailsModal(true); };
  const handleEdit    = (c: Collaborator) => { setSelectedCollaborator(c); setShowEditModal(true); };
  const handleConfirm = () => {
    if (!selectedCollaborator) return;
    updateMutation.mutate({ id: selectedCollaborator.id, status: approvalAction === "approve" ? "aprovado" : "rejeitado", approvalNotes: approvalNotes.trim() || undefined, cpf: editCpf.trim() || undefined, rg: editRg.trim() || undefined });
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-slate-200 animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="h-3 w-64 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />)}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-8 animate-pulse space-y-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-slate-50 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-5">

        {/* ── Page Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
              style={{ background: BLUE, boxShadow: `0 4px 14px ${BLUE}50` }}
            >
              <span className="material-symbols-outlined text-white" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>group</span>
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-slate-900 leading-tight">Colaboradores</h1>
              <p className="text-xs text-slate-400 mt-0.5">Gerencie prestadores, motoristas e colaboradores internos</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setBulkUploadModal(true)}
              className="h-9 px-3.5 flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg transition-colors bg-white"
            >
              <Upload className="w-3.5 h-3.5" /> Importar
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="h-9 px-4 flex items-center gap-1.5 text-white text-xs font-semibold rounded-lg transition-all"
              style={{ background: BLUE, boxShadow: `0 2px 8px ${BLUE}35` }}
            >
              <UserPlus className="w-3.5 h-3.5" /> Novo Colaborador
            </button>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Total",      value: totalCount,    stripe: "bg-slate-700",   icon: "people",       iconBg: "bg-slate-100", iconTx: "text-slate-600", valTx: "#374151" },
            { label: "Aprovados",  value: approvedCount, stripe: "bg-emerald-500", icon: "verified_user", iconBg: "bg-emerald-50", iconTx: "text-emerald-600", valTx: "#059669" },
            { label: "Pendentes",  value: pendingCount,  stripe: "bg-amber-400",   icon: "pending",      iconBg: "bg-amber-50",  iconTx: "text-amber-500", valTx: "#D97706" },
            { label: "Freelancers", value: freelaCount,  stripe: "bg-blue-500",    icon: "badge",        iconBg: "bg-blue-50",   iconTx: "text-blue-500",  valTx: "#3B82F6" },
            { label: "Casa",       value: casaCount,     stripe: "bg-violet-500",  icon: "home",         iconBg: "bg-violet-50", iconTx: "text-violet-600", valTx: "#7C3AED" },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-1 w-full ${card.stripe}`} />
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.iconBg} ${card.iconTx}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>{card.icon}</span>
                  </div>
                </div>
                <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-0.5">{card.label}</p>
                <p className="text-[26px] font-bold leading-none" style={{ color: card.valTx }}>{card.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main card ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Filter bar */}
          <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2.5 bg-[#FAFBFF]">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome ou documento..."
                value={filters.search}
                onChange={e => setFilter("search", e.target.value)}
                className="w-full h-8 pl-9 pr-8 bg-white border border-gray-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-all"
              />
              {filters.search && (
                <button onClick={() => setFilter("search", "")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Status filter */}
            <Select value={filters.status} onValueChange={v => setFilter("status", v)}>
              <SelectTrigger className="h-8 w-[145px] text-xs border-gray-200 rounded-lg bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20">
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
              <SelectTrigger className="h-8 w-[145px] text-xs border-gray-200 rounded-lg bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20">
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
                className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-slate-500 border border-dashed border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-colors"
              >
                <X className="w-3 h-3" /> Limpar
              </button>
            )}

            {hasFilters && (
              <span className="text-[11px] text-slate-400 ml-1">
                {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Users className="w-6 h-6 text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-600">Nenhum colaborador encontrado</p>
                  <p className="text-xs text-slate-400 mt-1">Tente ajustar os filtros ou cadastre um novo colaborador.</p>
                </div>
                {hasFilters && (
                  <button onClick={clearFilters} className="text-xs text-blue-500 hover:text-blue-700 font-medium">
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr style={{ borderBottom: "2px solid #E2E8F0", background: "#F8FAFC" }}>
                    <th className="px-5 py-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Colaborador</th>
                    <th className="px-5 py-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Documento</th>
                    <th className="px-5 py-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Tipo</th>
                    <th className="px-5 py-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Cidade</th>
                    <th className="px-5 py-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Status</th>
                    <th className="px-5 py-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map(c => {
                    const isPending = c.status === "pendente";
                    const typeCfg = TYPE_CFG[c.type] ?? TYPE_CFG.local;
                    const displayName = toTitleCase(c.fullName);
                    const [bgCls, textCls] = avatarClasses(c.fullName);

                    return (
                      <tr
                        key={c.id}
                        className={`group transition-colors ${isPending ? "hover:bg-amber-50/30" : "hover:bg-blue-50/30"}`}
                      >
                        {/* Colaborador */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${bgCls} ${textCls}`}>
                              {initials(c.fullName)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-800 leading-tight">{displayName}</p>
                              {c.phone && <p className="text-[11px] text-slate-400 mt-0.5">{c.phone}</p>}
                            </div>
                          </div>
                        </td>

                        {/* Documento */}
                        <td className="px-5 py-3.5">
                          <div className="font-mono text-[11px] text-slate-500 space-y-0.5">
                            <div>{formatDocument(c.officialDocument, c.documentType)}</div>
                            {c.secondaryDocument && <div className="text-slate-400">RG {c.secondaryDocument}</div>}
                          </div>
                        </td>

                        {/* Tipo */}
                        <td className="px-5 py-3.5">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${typeCfg.cls}`}>
                            {typeCfg.label}
                          </span>
                        </td>

                        {/* Cidade */}
                        <td className="px-5 py-3.5 text-sm text-slate-500">{c.city || "—"}</td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          <StatusBadge status={c.status} />
                        </td>

                        {/* Ações */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isPending && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button onClick={() => handleApprove(c)} disabled={updateMutation.isPending} className="w-7 h-7 rounded-md flex items-center justify-center text-emerald-500 hover:bg-emerald-50 disabled:opacity-40 transition-colors">
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Aprovar</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button onClick={() => handleReject(c)} disabled={updateMutation.isPending} className="w-7 h-7 rounded-md flex items-center justify-center text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Rejeitar</TooltipContent>
                                </Tooltip>
                              </>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button onClick={() => handleView(c)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Ver detalhes</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button onClick={() => handleEdit(c)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Editar</TooltipContent>
                            </Tooltip>
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
            <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <p className="text-[11px] text-slate-400 font-medium">
                Mostrando{" "}
                <span className="text-slate-600 font-semibold">{Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)}</span>
                {" "}de{" "}
                <span className="text-slate-600 font-semibold">{filtered.length}</span> colaboradores
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const p = i + 1;
                      return (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                            page === p ? "text-white" : "text-slate-500 hover:bg-slate-100"
                          }`}
                          style={page === p ? { background: BLUE } : undefined}
                        >
                          {p}
                        </button>
                      );
                    })}
                    {totalPages > 5 && <span className="px-1 text-slate-400 text-xs">…</span>}
                  </div>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Details Modal ── */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="max-w-xl rounded-2xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              {selectedCollaborator && (() => {
                const [bg, tx] = avatarClasses(selectedCollaborator.fullName);
                return (
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${bg} ${tx}`}>
                    {initials(selectedCollaborator.fullName)}
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-800">Detalhes do Colaborador</h3>
                {selectedCollaborator && (
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{toTitleCase(selectedCollaborator.fullName)}</p>
                )}
              </div>
              {selectedCollaborator && (
                <StatusBadge status={selectedCollaborator.status} />
              )}
              <button onClick={() => setShowDetailsModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedCollaborator && (
              <div className="px-5 py-5 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <DetailRow label="Nome Completo" value={toTitleCase(selectedCollaborator.fullName)} />
                  <DetailRow label="Tipo de Vínculo" value={toTitleCase(selectedCollaborator.type)} />
                  <DetailRow label="Data de Nascimento" value={selectedCollaborator.birthDate ? formatDate(selectedCollaborator.birthDate) : "—"} />
                  <DetailRow label="Cidade" value={selectedCollaborator.city || "—"} />
                  <DetailRow label="Telefone" value={selectedCollaborator.phone || "—"} />
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Documentos</p>
                  <div className="font-mono text-xs space-y-1 bg-slate-50 rounded-lg px-3 py-2.5 border border-gray-100">
                    <div><span className="text-slate-400">CPF </span><span className="text-slate-700 font-medium">{formatDocument(selectedCollaborator.officialDocument, selectedCollaborator.documentType)}</span></div>
                    {selectedCollaborator.secondaryDocument && (
                      <div><span className="text-slate-400">RG  </span><span className="text-slate-700 font-medium">{selectedCollaborator.secondaryDocument}</span></div>
                    )}
                  </div>
                </div>

                {selectedCollaborator.documentAttachmentId && (
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Documento Anexado</p>
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-gray-200">
                      <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">CPF/RG — {toTitleCase(selectedCollaborator.fullName)}</p>
                        <p className="text-[10px] text-slate-400">Documento do colaborador</p>
                      </div>
                      <button
                        onClick={() => window.open(`/api/attachments/${selectedCollaborator.documentAttachmentId}/view`, "_blank")}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        <Eye className="w-3 h-3" /> Ver
                      </button>
                    </div>
                  </div>
                )}

                {selectedCollaborator.approvalNotes && (
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Observações</p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-gray-100">{selectedCollaborator.approvalNotes}</p>
                  </div>
                )}

                {selectedCollaborator.status === "pendente" && (
                  <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                    <button onClick={() => { setShowDetailsModal(false); handleReject(selectedCollaborator); }} className="flex items-center gap-1.5 h-9 px-4 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                      <X className="w-3.5 h-3.5" /> Rejeitar
                    </button>
                    <button onClick={() => { setShowDetailsModal(false); handleApprove(selectedCollaborator); }} className="flex items-center gap-1.5 h-9 px-4 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-sm shadow-emerald-200">
                      <Check className="w-3.5 h-3.5" /> Aprovar
                    </button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Approval Modal ── */}
        <Dialog open={showApprovalModal} onOpenChange={setShowApprovalModal}>
          <DialogContent className="max-w-md rounded-2xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div
                className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0"
                style={{
                  background: approvalAction === "approve" ? "#059669" : "#DC2626",
                  boxShadow: approvalAction === "approve" ? "0 4px 12px #05966940" : "0 4px 12px #DC262640",
                }}
              >
                {approvalAction === "approve"
                  ? <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  : <X className="w-4 h-4 text-white" strokeWidth={3} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-800">
                  {approvalAction === "approve" ? "Aprovar Colaborador" : "Rejeitar Colaborador"}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {approvalAction === "approve" ? "Revise os dados antes de confirmar" : "Informe o motivo da rejeição"}
                </p>
              </div>
              <button onClick={() => setShowApprovalModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedCollaborator && (
              <div className="px-5 py-5 space-y-4">
                {(() => {
                  const [bg, tx] = avatarClasses(selectedCollaborator.fullName);
                  return (
                    <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg border border-gray-200">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${bg} ${tx}`}>
                        {initials(selectedCollaborator.fullName)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{toTitleCase(selectedCollaborator.fullName)}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{formatDocument(selectedCollaborator.officialDocument, selectedCollaborator.documentType)}</p>
                      </div>
                    </div>
                  );
                })()}

                {approvalAction === "approve" && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documentos</p>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1.5">CPF <span className="text-red-400 normal-case tracking-normal">*</span></label>
                      <input value={editCpf} onChange={e => setEditCpf(e.target.value)} placeholder="000.000.000-00"
                        className="w-full h-9 px-3 font-mono text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20" />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1.5">RG <span className="text-slate-400 font-normal normal-case tracking-normal">(opcional)</span></label>
                      <input value={editRg} onChange={e => setEditRg(e.target.value)} placeholder="00.000.000-0"
                        className="w-full h-9 px-3 font-mono text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
                    Observações <span className="text-slate-400 font-normal normal-case tracking-normal">{approvalAction === "approve" ? "(opcional)" : "(recomendado)"}</span>
                  </label>
                  <Textarea value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)}
                    placeholder={approvalAction === "approve" ? "Comentários sobre a aprovação..." : "Motivo da rejeição..."}
                    rows={3} className="text-sm border-gray-200 rounded-lg resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20" />
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowApprovalModal(false)} disabled={updateMutation.isPending}
                    className="flex-1 h-9 text-xs font-medium text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleConfirm} disabled={updateMutation.isPending}
                    className="flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-semibold text-white rounded-lg transition-colors shadow-sm disabled:opacity-60"
                    style={{
                      background: approvalAction === "approve" ? "#059669" : "#DC2626",
                      boxShadow: approvalAction === "approve" ? "0 2px 8px #05966940" : "0 2px 8px #DC262640",
                    }}
                  >
                    {updateMutation.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : approvalAction === "approve"
                        ? <><Check className="w-3.5 h-3.5" strokeWidth={3} /> Confirmar Aprovação</>
                        : <><X className="w-3.5 h-3.5" strokeWidth={3} /> Confirmar Rejeição</>
                    }
                  </button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <BulkUploadModal open={showBulkUploadModal} onClose={() => setBulkUploadModal(false)} />
        <CollaboratorModal open={showAddModal} onClose={() => setShowAddModal(false)} />
        <CollaboratorModal open={showEditModal} onClose={() => setShowEditModal(false)} collaborator={selectedCollaborator} isEdit={true} />

      </div>
    </TooltipProvider>
  );
}
