import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Check, X, Eye, UserPlus, Upload, FileText,
  ChevronLeft, ChevronRight, Users, Loader2
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CollaboratorModal from "@/components/modals/collaborator-modal";
import BulkUploadModal from "@/components/modals/bulk-upload-modal";
import type { Collaborator } from "@shared/schema";

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

const PAGE_SIZE = 25;

const STATUS_CFG: Record<string, { label: string; dot: string; text: string }> = {
  pendente:  { label: "Pendente",  dot: "bg-amber-400",   text: "text-amber-600" },
  aprovado:  { label: "Aprovado",  dot: "bg-emerald-500", text: "text-emerald-600" },
  rejeitado: { label: "Rejeitado", dot: "bg-red-500",     text: "text-red-600" },
  inativo:   { label: "Inativo",   dot: "bg-slate-400",   text: "text-slate-500" },
};

const TYPE_CFG: Record<string, { label: string; cls: string }> = {
  freela: { label: "Freela", cls: "bg-blue-50 text-blue-600" },
  casa:   { label: "Casa",   cls: "bg-violet-50 text-violet-600" },
  local:  { label: "Local",  cls: "bg-slate-100 text-slate-600" },
};

function formatDocument(doc: string, type: string) {
  if (type === "cpf") return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return doc;
}
function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

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
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: "#E2E8F0" }} className="animate-pulse" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ width: 192, height: 20, background: "#E2E8F0", borderRadius: 6 }} className="animate-pulse" />
            <div style={{ width: 256, height: 12, background: "#F1F5F9", borderRadius: 4 }} className="animate-pulse" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16 }}>
          {[...Array(5)].map((_, i) => <div key={i} style={{ height: 96, background: "white", borderRadius: 16, border: "1px solid #E5E7EB" }} className="animate-pulse" />)}
        </div>
        <div style={{ background: "white", borderRadius: 20, border: "1px solid #E5E7EB", padding: 32, display: "flex", flexDirection: "column", gap: 16 }} className="animate-pulse">
          {[...Array(6)].map((_, i) => <div key={i} style={{ height: 48, background: "#F8FAFC", borderRadius: 12 }} />)}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

        {/* ── Page Header ── */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#004ac6", fontVariationSettings: "'FILL' 1" }}>group</span>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: "#141b2b", margin: 0, letterSpacing: "-0.5px", fontFamily: "Manrope, sans-serif" }}>Colaboradores</h1>
            </div>
            <p style={{ fontSize: 14, color: "#64748B", margin: 0, fontWeight: 500 }}>Gerencie prestadores, motoristas e colaboradores internos</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <button onClick={() => setBulkUploadModal(true)}
              style={{ height: 44, padding: "0 20px", display: "flex", alignItems: "center", gap: 8, border: "1px solid #c3c6d7", borderRadius: 12, background: "white", fontSize: 14, fontWeight: 600, color: "#475569", cursor: "pointer", fontFamily: "inherit" }}
              className="hover:bg-slate-50 transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>upload</span>
              Importar
            </button>
            <button onClick={() => setShowAddModal(true)}
              style={{ height: 44, padding: "0 20px", display: "flex", alignItems: "center", gap: 8, borderRadius: 12, background: "linear-gradient(135deg, #2563eb, #004ac6)", color: "white", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(0,74,198,0.25)" }}
              className="hover:opacity-90 active:scale-95 transition-all">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              Novo Colaborador
            </button>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16 }}>
          {[
            { label: "Total",      value: totalCount,    border: "#94A3B8", icon: "people",        iconBg: "#f1f5f9", iconTxt: "#475569" },
            { label: "Aprovados",  value: approvedCount, border: "#34D399", icon: "verified_user",  iconBg: "#ECFDF5", iconTxt: "#059669" },
            { label: "Pendentes",  value: pendingCount,  border: "#FBBF24", icon: "pending",        iconBg: "#FFFBEB", iconTxt: "#D97706" },
            { label: "Freelancers",value: freelaCount,   border: "#60A5FA", icon: "badge",          iconBg: "#EFF6FF", iconTxt: "#2563EB" },
            { label: "Casa",       value: casaCount,     border: "#A78BFA", icon: "home",           iconBg: "#F5F3FF", iconTxt: "#7C3AED" },
          ].map(card => (
            <div key={card.label} style={{ background: "white", borderRadius: 16, borderLeft: `4px solid ${card.border}`, boxShadow: "0 1px 4px rgba(20,27,43,0.06)", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: card.iconTxt, background: card.iconBg, padding: 8, borderRadius: 10, fontVariationSettings: "'FILL' 1" }}>{card.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: card.iconTxt, textTransform: "uppercase", letterSpacing: "0.1em" }}>{card.label}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#141b2b", lineHeight: 1, fontFamily: "Manrope, sans-serif" }}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* ── Main card ── */}
        <div style={{ background: "white", borderRadius: 20, border: "1px solid #E2E8F0", boxShadow: "0 20px 40px rgba(20,27,43,0.05)", overflow: "hidden" }}>

          {/* Filter bar */}
          <div style={{ padding: "16px 20px", background: "rgba(248,250,252,0.5)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative", width: "100%", maxWidth: 300 }}>
              <span className="material-symbols-outlined" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: "#94A3B8", pointerEvents: "none" }}>search</span>
              <input type="text" placeholder="Buscar colaborador..." value={filters.search}
                onChange={e => setFilter("search", e.target.value)}
                style={{ width: "100%", height: 44, paddingLeft: 44, paddingRight: filters.search ? 36 : 14, border: "none", borderRadius: 12, background: "white", fontSize: 14, color: "#374151", fontFamily: "inherit", boxSizing: "border-box", boxShadow: "0 1px 3px rgba(20,27,43,0.08)", outline: "none" }}
                className="focus:ring-2 focus:ring-blue-600/20" />
              {filters.search && (
                <button onClick={() => setFilter("search", "")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex" }}
                  className="hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>

            <Select value={filters.status} onValueChange={v => setFilter("status", v)}>
              <SelectTrigger style={{ height: 44, minWidth: 150, border: "none", borderRadius: 12, background: "white", boxShadow: "0 1px 3px rgba(20,27,43,0.08)", fontSize: 14, fontWeight: 500 }}
                className="focus:ring-2 focus:ring-blue-600/20">
                <SelectValue placeholder="Status: Todos" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Status: Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="rejeitado">Rejeitado</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.type} onValueChange={v => setFilter("type", v)}>
              <SelectTrigger style={{ height: 44, minWidth: 150, border: "none", borderRadius: 12, background: "white", boxShadow: "0 1px 3px rgba(20,27,43,0.08)", fontSize: 14, fontWeight: 500 }}
                className="focus:ring-2 focus:ring-blue-600/20">
                <SelectValue placeholder="Tipo: Todos" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Tipo: Todos</SelectItem>
                <SelectItem value="casa">Casa</SelectItem>
                <SelectItem value="freela">Freela</SelectItem>
                <SelectItem value="local">Local</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <button onClick={clearFilters}
                style={{ height: 44, padding: "0 16px", display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, color: "#64748B", background: "none", border: "none", cursor: "pointer", marginLeft: "auto", fontFamily: "inherit" }}
                className="hover:text-[#004ac6] transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                Limpar
              </button>
            )}
            {hasFilters && (
              <span style={{ fontSize: 12, color: "#94A3B8" }}>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div style={{ padding: "80px 24px", textAlign: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Users className="w-6 h-6" style={{ color: "#94A3B8" }} />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#475569", margin: 0 }}>Nenhum colaborador encontrado</p>
                  <p style={{ fontSize: 12, color: "#94A3B8", margin: "4px 0 0" }}>Tente ajustar os filtros ou cadastre um novo colaborador.</p>
                </div>
                {hasFilters && (
                  <button onClick={clearFilters} style={{ fontSize: 12, fontWeight: 500, color: "#2563EB", background: "none", border: "none", cursor: "pointer" }}
                    className="hover:text-blue-700">Limpar filtros</button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#F8FAFC", borderTop: "1px solid #F1F5F9", borderBottom: "1px solid #F1F5F9" }}>
                    {["Colaborador","Documento","Tipo","Cidade","Status","Ações"].map((h, i) => (
                      <th key={h} style={{ padding: "14px 24px", fontSize: 11, fontWeight: 900, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: i === 5 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ borderTop: "none" }}>
                  {paginated.map(c => {
                    const st = STATUS_CFG[c.status] ?? STATUS_CFG.pendente;
                    const isPending = c.status === "pendente";
                    const isInactive = c.status === "inativo";
                    const typeCfg = TYPE_CFG[c.type] ?? TYPE_CFG.local;
                    const displayName = toTitleCase(c.fullName);
                    const [bgCls, textCls] = avatarClasses(c.fullName);
                    return (
                      <tr key={c.id} className="group transition-colors hover:bg-slate-50/50"
                        style={{ borderBottom: "1px solid #F1F5F9", opacity: isInactive ? 0.6 : 1 }}>

                        <td style={{ padding: "16px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${bgCls} ${textCls}`}>
                              {initials(c.fullName)}
                            </div>
                            <div>
                              <p style={{ fontSize: 14, fontWeight: 700, color: "#141b2b", margin: 0, lineHeight: 1.3 }}>{displayName}</p>
                              {c.phone && <p style={{ fontSize: 12, color: "#64748B", margin: "2px 0 0" }}>{c.phone}</p>}
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: "16px 24px" }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "#475569" }}>CPF: {formatDocument(c.officialDocument, c.documentType)}</div>
                          {c.secondaryDocument && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>RG: {c.secondaryDocument}</div>}
                        </td>

                        <td style={{ padding: "16px 24px" }}>
                          <span className={`text-xs font-bold py-1 px-2 rounded-lg ${typeCfg.cls}`}>{typeCfg.label}</span>
                        </td>

                        <td style={{ padding: "16px 24px", fontSize: 12, fontWeight: 500, color: "#475569" }}>{c.city || "—"}</td>

                        <td style={{ padding: "16px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }} className={`text-xs font-bold ${st.text}`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                            {st.label}
                          </div>
                        </td>

                        <td style={{ padding: "16px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity">
                            {isPending && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button onClick={() => handleApprove(c)} disabled={updateMutation.isPending}
                                      style={{ padding: 8, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#059669" }}
                                      className="hover:bg-emerald-50 disabled:opacity-40 transition-colors">
                                      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>check_circle</span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Aprovar</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button onClick={() => handleReject(c)} disabled={updateMutation.isPending}
                                      style={{ padding: 8, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#ba1a1a" }}
                                      className="hover:bg-red-50 disabled:opacity-40 transition-colors">
                                      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>cancel</span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Rejeitar</TooltipContent>
                                </Tooltip>
                              </>
                            )}
                            {!isPending && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button onClick={() => handleEdit(c)}
                                    style={{ padding: 8, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8" }}
                                    className="hover:bg-slate-100 transition-colors">
                                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>edit</span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Editar</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button onClick={() => handleView(c)}
                                  style={{ padding: 8, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8" }}
                                  className="hover:bg-slate-100 transition-colors">
                                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>visibility</span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Ver detalhes</TooltipContent>
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
            <div style={{ padding: "20px 24px", borderTop: "1px solid #F1F5F9", background: "rgba(248,250,252,0.5)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontSize: 14, color: "#64748B", fontWeight: 500, margin: 0 }}>
                Mostrando{" "}
                <span style={{ color: "#141b2b", fontWeight: 700 }}>{Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)}</span>
                {" "}de{" "}
                <span style={{ color: "#141b2b", fontWeight: 700 }}>{filtered.length}</span>
              </p>
              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ padding: 8, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8" }}
                    className="hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-colors">
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span>
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setPage(p)}
                      style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, background: page === p ? "#004ac6" : "transparent", color: page === p ? "white" : "#475569" }}
                      className={page !== p ? "hover:bg-slate-200 transition-colors" : ""}>
                      {p}
                    </button>
                  ))}
                  {totalPages > 5 && <span style={{ fontSize: 12, color: "#94A3B8", padding: "0 4px" }}>…</span>}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    style={{ padding: 8, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8" }}
                    className="hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-colors">
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Details Modal ── */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="max-w-3xl rounded-[24px] p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div style={{ padding: "24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between", background: "white", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: "#FFFBEB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#D97706" }}>person_search</span>
                </div>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: "#141b2b", margin: 0, fontFamily: "Manrope, sans-serif" }}>Detalhes do Colaborador</h2>
                  <p style={{ fontSize: 14, color: "#64748B", margin: "3px 0 0", fontWeight: 500 }}>
                    {selectedCollaborator ? toTitleCase(selectedCollaborator.fullName) : ""}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowDetailsModal(false)}
                style={{ padding: 8, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8" }}
                className="hover:bg-slate-100 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>

            {/* Body */}
            {selectedCollaborator && (
              <div style={{ flex: 1, overflowY: "auto", padding: 32 }} className="no-scrollbar">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 32 }}>
                  {/* Left: Profile */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    <div style={{ textAlign: "center" }}>
                      {(() => {
                        const [bg, tx] = avatarClasses(selectedCollaborator.fullName);
                        return (
                          <div className={`w-24 h-24 rounded-3xl mx-auto flex items-center justify-center text-2xl font-bold ${bg} ${tx}`}
                            style={{ margin: "0 auto 16px", boxShadow: "0 0 0 4px #FFFBEB" }}>
                            {initials(selectedCollaborator.fullName)}
                          </div>
                        );
                      })()}
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: "#141b2b", margin: "0 0 8px", fontFamily: "Manrope, sans-serif" }}>{toTitleCase(selectedCollaborator.fullName)}</h3>
                      {(() => {
                        const st = STATUS_CFG[selectedCollaborator.status] ?? STATUS_CFG.pendente;
                        return (
                          <span className={`text-xs font-bold px-3 py-1 rounded-full ${st.text}`}
                            style={{ background: selectedCollaborator.status === "pendente" ? "#FFFBEB" : selectedCollaborator.status === "aprovado" ? "#ECFDF5" : selectedCollaborator.status === "rejeitado" ? "#FEF2F2" : "#F8FAFC" }}>
                            {st.label}
                          </span>
                        );
                      })()}
                    </div>
                    <div style={{ paddingTop: 16, borderTop: "1px solid #F1F5F9", display: "flex", flexDirection: "column", gap: 16 }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 900, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 4 }}>Tipo de Vínculo</label>
                        <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: "#141b2b" }}>{toTitleCase(selectedCollaborator.type)}</p>
                      </div>
                      {selectedCollaborator.phone && (
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 900, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 4 }}>Telefone</label>
                          <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: "#141b2b" }}>{selectedCollaborator.phone}</p>
                        </div>
                      )}
                      {selectedCollaborator.city && (
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 900, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 4 }}>Localização</label>
                          <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: "#141b2b" }}>{selectedCollaborator.city}</p>
                        </div>
                      )}
                      {selectedCollaborator.birthDate && (
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 900, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 4 }}>Nascimento</label>
                          <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: "#141b2b" }}>{formatDate(selectedCollaborator.birthDate)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Documents & Notes */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                    {/* Documentos */}
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 900, color: "#141b2b", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>description</span>
                        Documentos
                      </h4>
                      <div style={{ background: "#F8FAFC", borderRadius: 12, padding: "12px 16px", border: "1px solid #E9EDFF", fontFamily: "monospace", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 13 }}>
                          <span style={{ color: "#94A3B8" }}>CPF  </span>
                          <span style={{ color: "#374151", fontWeight: 600 }}>{formatDocument(selectedCollaborator.officialDocument, selectedCollaborator.documentType)}</span>
                        </div>
                        {selectedCollaborator.secondaryDocument && (
                          <div style={{ fontSize: 13 }}>
                            <span style={{ color: "#94A3B8" }}>RG   </span>
                            <span style={{ color: "#374151", fontWeight: 600 }}>{selectedCollaborator.secondaryDocument}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Anexo */}
                    {selectedCollaborator.documentAttachmentId && (
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 900, color: "#141b2b", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>attach_file</span>
                          Documento Anexado
                        </h4>
                        <div style={{ padding: "16px", background: "#F8FAFC", borderRadius: 12, display: "flex", alignItems: "center", gap: 14, border: "1px solid #E2E8F0" }}
                          className="hover:bg-white hover:ring-1 hover:ring-blue-100 transition-all group">
                          <div style={{ width: 40, height: 40, borderRadius: 8, background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#2563EB" }}>picture_as_pdf</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>CPF/RG — {toTitleCase(selectedCollaborator.fullName)}</p>
                            <p style={{ fontSize: 10, color: "#94A3B8", margin: "2px 0 0" }}>Documento do colaborador</p>
                          </div>
                          <button onClick={() => window.open(`/api/attachments/${selectedCollaborator.documentAttachmentId}/view`, "_blank")}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 12, color: "#2563EB", border: "1px solid #BFDBFE", borderRadius: 8, background: "white", cursor: "pointer" }}
                            className="hover:bg-blue-50 transition-colors">
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span> Ver
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Observações */}
                    {selectedCollaborator.approvalNotes && (
                      <div style={{ padding: 20, background: "#EFF6FF", borderRadius: 16, border: "1px solid #BFDBFE" }}>
                        <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1e40af", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>info</span>
                          Observações
                        </h4>
                        <p style={{ fontSize: 13, color: "#1d4ed8", margin: 0, fontWeight: 500, lineHeight: 1.6 }}>{selectedCollaborator.approvalNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ padding: "20px 24px", background: "#F8FAFC", borderTop: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
              <button onClick={() => setShowDetailsModal(false)}
                style={{ height: 44, padding: "0 24px", fontSize: 14, fontWeight: 700, color: "#64748B", background: "transparent", border: "none", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" }}
                className="hover:bg-slate-200 transition-colors">
                Fechar
              </button>
              {selectedCollaborator?.status === "pendente" && (
                <>
                  <button onClick={() => { setShowDetailsModal(false); handleReject(selectedCollaborator!); }}
                    style={{ height: 44, padding: "0 24px", fontSize: 14, fontWeight: 700, color: "#ba1a1a", background: "transparent", border: "1px solid #ba1a1a", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" }}
                    className="hover:bg-red-50 transition-colors">
                    Rejeitar Cadastro
                  </button>
                  <button onClick={() => { setShowDetailsModal(false); handleApprove(selectedCollaborator!); }}
                    style={{ height: 44, padding: "0 32px", fontSize: 14, fontWeight: 700, color: "white", background: "#004ac6", border: "none", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(0,74,198,0.3)" }}
                    className="hover:bg-blue-700 transition-colors">
                    Aprovar Colaborador
                  </button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Approval Modal ── */}
        <Dialog open={showApprovalModal} onOpenChange={setShowApprovalModal}>
          <DialogContent className="max-w-md rounded-2xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: approvalAction === "approve" ? "#059669" : "#DC2626", boxShadow: approvalAction === "approve" ? "0 4px 12px rgba(5,150,105,0.3)" : "0 4px 12px rgba(220,38,38,0.3)" }}>
                {approvalAction === "approve"
                  ? <Check className="w-5 h-5 text-white" strokeWidth={3} />
                  : <X className="w-5 h-5 text-white" strokeWidth={3} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "#141b2b", margin: 0, fontFamily: "Manrope, sans-serif" }}>
                  {approvalAction === "approve" ? "Aprovar Colaborador" : "Rejeitar Colaborador"}
                </h3>
                <p style={{ fontSize: 12, color: "#94A3B8", margin: "3px 0 0" }}>
                  {approvalAction === "approve" ? "Revise os dados antes de confirmar" : "Informe o motivo da rejeição"}
                </p>
              </div>
              <button onClick={() => setShowApprovalModal(false)}
                style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center" }}
                className="hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedCollaborator && (
              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                {(() => {
                  const [bg, tx] = avatarClasses(selectedCollaborator.fullName);
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#F8FAFC", borderRadius: 10, border: "1px solid #E2E8F0" }}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${bg} ${tx}`}>{initials(selectedCollaborator.fullName)}</div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: 0 }}>{toTitleCase(selectedCollaborator.fullName)}</p>
                        <p style={{ fontSize: 11, color: "#94A3B8", margin: 0, fontFamily: "monospace" }}>{formatDocument(selectedCollaborator.officialDocument, selectedCollaborator.documentType)}</p>
                      </div>
                    </div>
                  );
                })()}

                {approvalAction === "approve" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Documentos</p>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>CPF <span style={{ color: "#EF4444" }}>*</span></label>
                      <input value={editCpf} onChange={e => setEditCpf(e.target.value)} placeholder="000.000.000-00"
                        style={{ width: "100%", height: 40, padding: "0 12px", fontFamily: "monospace", fontSize: 14, border: "1px solid #E5E7EB", borderRadius: 10, outline: "none", boxSizing: "border-box" }}
                        className="focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20" />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>RG <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></label>
                      <input value={editRg} onChange={e => setEditRg(e.target.value)} placeholder="00.000.000-0"
                        style={{ width: "100%", height: 40, padding: "0 12px", fontFamily: "monospace", fontSize: 14, border: "1px solid #E5E7EB", borderRadius: 10, outline: "none", boxSizing: "border-box" }}
                        className="focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20" />
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                    Observações <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{approvalAction === "approve" ? "(opcional)" : "(recomendado)"}</span>
                  </label>
                  <Textarea value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)}
                    placeholder={approvalAction === "approve" ? "Comentários sobre a aprovação..." : "Motivo da rejeição..."}
                    rows={3} className="text-sm border-gray-200 rounded-xl resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20" />
                </div>

                <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                  <button onClick={() => setShowApprovalModal(false)} disabled={updateMutation.isPending}
                    style={{ flex: 1, height: 42, fontSize: 14, fontWeight: 600, color: "#64748B", background: "transparent", border: "1px solid #E5E7EB", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}
                    className="hover:bg-gray-50 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleConfirm} disabled={updateMutation.isPending}
                    style={{ flex: 1, height: 42, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "white", background: approvalAction === "approve" ? "#059669" : "#DC2626", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", boxShadow: approvalAction === "approve" ? "0 2px 8px rgba(5,150,105,0.3)" : "0 2px 8px rgba(220,38,38,0.3)", opacity: updateMutation.isPending ? 0.7 : 1 }}>
                    {updateMutation.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : approvalAction === "approve"
                        ? <><Check className="w-4 h-4" strokeWidth={3} /> Confirmar Aprovação</>
                        : <><X className="w-4 h-4" strokeWidth={3} /> Confirmar Rejeição</>
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
