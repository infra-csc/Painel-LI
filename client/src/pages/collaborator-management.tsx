import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Check, X, Search, Eye, UserPlus, Upload, FileText, Edit, Users,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CollaboratorModal from "@/components/modals/collaborator-modal";
import BulkUploadModal from "@/components/modals/bulk-upload-modal";
import type { Collaborator } from "@shared/schema";

// ─── Avatar helpers ────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-600", "bg-amber-500", "bg-rose-500",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  const fixed = name
    .replace(/Ã§/g, 'ç').replace(/Ã£/g, 'ã').replace(/Ãµ/g, 'õ')
    .replace(/Ã©/g, 'é').replace(/Ã¡/g, 'á').replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú').replace(/Ã /g, 'à')
    .replace(/Ã‰/g, 'É').replace(/Ã"/g, 'Ó').replace(/Ã•/g, 'Õ')
    .replace(/Ã‡/g, 'Ç').replace(/Ãƒ/g, 'Ã')
    .replace(/Ã‚/g, 'Â').replace(/Ãâ/g, 'Â').replace(/â€™/g, "'")
    .replace(/Ã\u0081/g, 'Á').replace(/Ã\u009a/g, 'Ú');
  const parts = fixed.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function toTitleCase(str: string) {
  const fixed = str
    .replace(/Ã§/g, 'ç').replace(/Ã£/g, 'ã').replace(/Ãµ/g, 'õ')
    .replace(/Ã©/g, 'é').replace(/Ã¡/g, 'á').replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú').replace(/Ã /g, 'à')
    .replace(/Ã‰/g, 'É').replace(/Ã"/g, 'Ó').replace(/Ã•/g, 'Õ')
    .replace(/Ã‡/g, 'Ç').replace(/Ãƒ/g, 'Ã')
    .replace(/Ã‚/g, 'Â').replace(/Ãâ/g, 'Â').replace(/â€™/g, "'")
    .replace(/Ã\u0081/g, 'Á').replace(/Ã\u009a/g, 'Ú');
  return fixed.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ─── Config ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pendente:  { label: "Pendente",  cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  aprovado:  { label: "Aprovado",  cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  rejeitado: { label: "Rejeitado", cls: "bg-red-50 text-red-600 ring-1 ring-red-200" },
  inativo:   { label: "Inativo",   cls: "bg-gray-100 text-gray-500 ring-1 ring-gray-200" },
};

const TYPE_CFG: Record<string, { label: string; cls: string }> = {
  freela: { label: "Freela", cls: "bg-blue-50 text-blue-600 ring-1 ring-blue-200" },
  casa:   { label: "Casa",   cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  local:  { label: "Local",  cls: "bg-slate-100 text-slate-600 ring-1 ring-slate-200" },
};

function formatDocument(doc: string, type: string) {
  if (type === "cpf") return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return doc;
}
function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
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
      toast({ title: "Sucesso", description: "Status atualizado" });
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      setShowDetailsModal(false); setShowApprovalModal(false);
      setApprovalNotes(""); setEditCpf(""); setEditRg("");
    },
    onError: () => toast({ title: "Erro", description: "Erro ao atualizar colaborador", variant: "destructive" }),
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

  const pendingCount  = collaborators?.filter(c => c.status === "pendente").length ?? 0;
  const approvedCount = collaborators?.filter(c => c.status === "aprovado").length ?? 0;

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

  function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CFG[status] ?? STATUS_CFG.pendente;
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.cls}`}>{cfg.label}</span>;
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 animate-pulse space-y-4">
        <div className="h-6 bg-slate-100 rounded w-1/3" />
        {[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-slate-50 rounded" />)}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* ── Header ── */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold text-slate-800">Gerenciamento de Colaboradores</h2>
                  {pendingCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                      {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  {approvedCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                      {approvedCount} aprovado{approvedCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Gerencie aprovações e status dos colaboradores</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setBulkUploadModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" /> Importar
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-200 hover:shadow-md hover:shadow-blue-200 transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Novo Colaborador
                </button>
              </div>
            </div>
          </div>

          {/* ── Filters ── */}
          <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <div className="relative flex-[2] min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou documento..."
                value={filters.search}
                onChange={e => setFilter("search", e.target.value)}
                className="pl-9 h-9 text-sm border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
              {filters.search && (
                <button onClick={() => setFilter("search", "")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="w-[160px]">
              <Select value={filters.status} onValueChange={v => setFilter("status", v)}>
                <SelectTrigger className="h-9 text-sm border-gray-200 rounded-lg">
                  <SelectValue placeholder="Todos os Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="rejeitado">Rejeitado</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[150px]">
              <Select value={filters.type} onValueChange={v => setFilter("type", v)}>
                <SelectTrigger className="h-9 text-sm border-gray-200 rounded-lg">
                  <SelectValue placeholder="Todos os Tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="casa">Casa</SelectItem>
                  <SelectItem value="freela">Freela</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1 h-9 px-3 text-xs text-slate-500 hover:text-slate-700 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                <X className="w-3 h-3" /> Limpar
              </button>
            )}
          </div>

          {/* ── Table ── */}
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">Nenhum colaborador encontrado</p>
              <p className="text-xs text-slate-400 mt-1">Tente ajustar os filtros ou cadastre um novo colaborador.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Nome</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Documento</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Tipo</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Cidade</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-right px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c, idx) => {
                    const isPending = c.status === "pendente";
                    const isEven = idx % 2 === 1;
                    const typeCfg = TYPE_CFG[c.type] ?? TYPE_CFG.local;
                    const displayName = toTitleCase(c.fullName);
                    const col = avatarColor(c.fullName);

                    return (
                      <tr
                        key={c.id}
                        className={`border-b border-gray-50 transition-colors group ${
                          isPending
                            ? "bg-amber-50/40 hover:bg-amber-50/70"
                            : isEven
                            ? "bg-slate-50/40 hover:bg-blue-50/40"
                            : "bg-white hover:bg-blue-50/40"
                        }`}
                      >
                        {/* Nome */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${col}`}>
                              {initials(c.fullName)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 leading-tight">{displayName}</p>
                              {c.phone && <p className="text-[11px] text-slate-400 mt-0.5">{c.phone}</p>}
                            </div>
                          </div>
                        </td>

                        {/* Documento */}
                        <td className="px-4 py-4">
                          <div className="font-mono text-[11px] space-y-0.5">
                            <div>
                              <span className="text-slate-400">CPF </span>
                              <span className="text-slate-600">{formatDocument(c.officialDocument, c.documentType)}</span>
                            </div>
                            {c.secondaryDocument && (
                              <div>
                                <span className="text-slate-400">RG </span>
                                <span className="text-slate-600">{c.secondaryDocument}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Tipo */}
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${typeCfg.cls}`}>
                            {typeCfg.label}
                          </span>
                        </td>

                        {/* Cidade */}
                        <td className="px-4 py-4 text-slate-500 text-xs">{c.city}</td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <StatusBadge status={c.status} />
                        </td>

                        {/* Ações */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1 justify-end">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleView(c)}
                                  className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Ver detalhes</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleEdit(c)}
                                  className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Editar</TooltipContent>
                            </Tooltip>

                            {isPending && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleApprove(c)}
                                      disabled={updateMutation.isPending}
                                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Aprovar</TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleReject(c)}
                                      disabled={updateMutation.isPending}
                                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Rejeitar</TooltipContent>
                                </Tooltip>
                              </>
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

          {/* ── Footer / Pagination ── */}
          {filtered.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Exibindo <span className="font-medium text-slate-600">{Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)}</span> de <span className="font-medium text-slate-600">{filtered.length}</span> colaboradores
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs text-slate-500 px-2 tabular-nums">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
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
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                {selectedCollaborator && (
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${avatarColor(selectedCollaborator.fullName)}`}>
                    {initials(selectedCollaborator.fullName)}
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Detalhes do Colaborador</h3>
                  {selectedCollaborator && <p className="text-[11px] text-slate-400 mt-0.5">{toTitleCase(selectedCollaborator.fullName)}</p>}
                </div>
              </div>
              <button onClick={() => setShowDetailsModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {selectedCollaborator && (
              <div className="px-6 py-5 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Nome Completo", value: toTitleCase(selectedCollaborator.fullName) },
                    { label: "Tipo", value: toTitleCase(selectedCollaborator.type) },
                    { label: "Data de Nascimento", value: selectedCollaborator.birthDate ? formatDate(selectedCollaborator.birthDate) : "—" },
                    { label: "Cidade", value: selectedCollaborator.city || "—" },
                    { label: "Telefone", value: selectedCollaborator.phone || "—" },
                  ].map(f => (
                    <div key={f.label}>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{f.label}</p>
                      <p className="text-sm text-slate-700">{f.value}</p>
                    </div>
                  ))}
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Status</p>
                    <StatusBadge status={selectedCollaborator.status} />
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Documentos</p>
                  <div className="font-mono text-xs space-y-1">
                    <div><span className="text-slate-400">CPF </span><span className="text-slate-700">{formatDocument(selectedCollaborator.officialDocument, selectedCollaborator.documentType)}</span></div>
                    {selectedCollaborator.secondaryDocument && (
                      <div><span className="text-slate-400">RG </span><span className="text-slate-700">{selectedCollaborator.secondaryDocument}</span></div>
                    )}
                  </div>
                </div>

                {selectedCollaborator.documentAttachmentId && (
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Documento Anexado</p>
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
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Observações</p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{selectedCollaborator.approvalNotes}</p>
                  </div>
                )}

                {selectedCollaborator.status === "pendente" && (
                  <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                    <button onClick={() => { setShowDetailsModal(false); handleReject(selectedCollaborator); }} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                      <X className="w-3.5 h-3.5" /> Rejeitar
                    </button>
                    <button onClick={() => { setShowDetailsModal(false); handleApprove(selectedCollaborator); }} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">
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
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {approvalAction === "approve" ? "Aprovar Colaborador" : "Rejeitar Colaborador"}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {approvalAction === "approve" ? "Revise os documentos antes de aprovar" : "Informe o motivo da rejeição"}
                </p>
              </div>
              <button onClick={() => setShowApprovalModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {selectedCollaborator && (
              <div className="px-6 py-5 space-y-4">
                <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg border border-gray-200">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${avatarColor(selectedCollaborator.fullName)}`}>
                    {initials(selectedCollaborator.fullName)}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{toTitleCase(selectedCollaborator.fullName)}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{formatDocument(selectedCollaborator.officialDocument, selectedCollaborator.documentType)}</p>
                  </div>
                </div>

                {approvalAction === "approve" && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-600">Documentos</p>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">CPF <span className="text-red-400">*</span></label>
                      <input value={editCpf} onChange={e => setEditCpf(e.target.value)} placeholder="000.000.000-00" data-testid="input-cpf-approval"
                        className="w-full h-9 px-3 font-mono text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">RG <span className="text-slate-400 font-normal">(opcional)</span></label>
                      <input value={editRg} onChange={e => setEditRg(e.target.value)} placeholder="00.000.000-0" data-testid="input-rg-approval"
                        className="w-full h-9 px-3 font-mono text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">
                    Observações <span className="text-slate-400 font-normal">{approvalAction === "approve" ? "(opcional)" : "(recomendado)"}</span>
                  </label>
                  <Textarea value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)}
                    placeholder={approvalAction === "approve" ? "Comentários sobre a aprovação..." : "Motivo da rejeição..."}
                    rows={3} className="text-sm border-gray-200 rounded-lg resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                    data-testid="textarea-approval-notes" />
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <button onClick={() => setShowApprovalModal(false)} disabled={updateMutation.isPending}
                    className="px-4 py-2 text-xs font-medium text-slate-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                    data-testid="button-cancel-approval">
                    Cancelar
                  </button>
                  <button onClick={handleConfirm} disabled={updateMutation.isPending}
                    className={`flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white rounded-lg transition-colors ${approvalAction === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
                    data-testid="button-confirm-approval">
                    {updateMutation.isPending ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : approvalAction === "approve" ? (
                      <><Check className="w-3 h-3" strokeWidth={3} /> Confirmar Aprovação</>
                    ) : (
                      <><X className="w-3 h-3" strokeWidth={3} /> Confirmar Rejeição</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <BulkUploadModal open={showBulkUploadModal} onClose={() => setBulkUploadModal(false)} />
        <CollaboratorModal open={showAddModal} onClose={() => setShowAddModal(false)} />
        <CollaboratorModal open={showEditModal} onClose={() => setShowEditModal(false)} collaborator={selectedCollaborator} isEdit={true} />
      </>
    </TooltipProvider>
  );
}
