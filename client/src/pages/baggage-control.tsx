import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { normalizeRole } from "@shared/roles";
import { parseBrNumber, fixEncoding } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Luggage, Search, Download, Pencil, Trash2, X, Plane, Users,
  CalendarDays, RotateCw, Lock, ClipboardList,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = String(d).split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}
function todayISO() {
  return new Date().toISOString().split("T")[0];
}
function toTitleCase(str: string) {
  if (!str) return str;
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// CPF do colaborador: officialDocument quando documentType === 'cpf',
// senão secondaryDocument quando secondaryDocumentType === 'cpf'.
function getCpf(c: CollaboratorItem): string {
  if (c.documentType === "cpf") return c.officialDocument || "";
  if (c.secondaryDocumentType === "cpf") return c.secondaryDocument || "";
  return "";
}
function formatCpf(cpf: string): string {
  const digits = (cpf || "").replace(/\D/g, "");
  if (digits.length !== 11) return cpf || "";
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

const CIAS_FIXAS = ["Azul", "Gol", "TAM"] as const;
type CiaGroup = "Azul" | "Gol" | "TAM" | "Outros";
function ciaGroup(cia: string): CiaGroup {
  const c = (cia || "").trim().toLowerCase();
  if (c === "azul") return "Azul";
  if (c === "gol") return "Gol";
  if (c === "tam" || c === "latam") return "TAM";
  return "Outros";
}
// Cores do sistema (paleta Tailwind já usada nas outras telas)
const CIA_STYLE: Record<CiaGroup, { stub: string; badge: string }> = {
  Azul:   { stub: "bg-sky-600",     badge: "bg-sky-50 text-sky-700" },
  Gol:    { stub: "bg-orange-500",  badge: "bg-orange-50 text-orange-700" },
  TAM:    { stub: "bg-red-600",     badge: "bg-red-50 text-red-700" },
  Outros: { stub: "bg-slate-500",   badge: "bg-slate-100 text-slate-600" },
};

const AGENCIAS_FIXAS = ["LCA", "Flytour", "Onfly", "Direto no site"] as const;

const TYPE_LABEL: Record<string, string> = { casa: "Casa", freela: "Freela", local: "Local" };

// ── Formas locais das respostas da API (apenas os campos usados) ─────────────

interface CollaboratorItem {
  id: string;
  fullName: string;
  documentType?: string | null;
  officialDocument?: string | null;
  secondaryDocument?: string | null;
  secondaryDocumentType?: string | null;
  type?: string | null;
  status?: string | null;
  active?: boolean | null;
}
interface EventItem {
  id: string;
  name: string;
}
interface BaggageRequestItem {
  id: string;
  eventId: string;
  collaboratorId: string;
  loc: string;
  cia: string;
  valueCents: number;
  os: string;
  quantity: number;
  agency: string;
  requestDate: string;
  boardingDate: string;
  notes?: string | null;
  createdByName?: string | null;
  createdAt?: string | null;
}

type TabId = "solicitacoes" | "colaboradores" | "eventos";

interface FormErrors {
  [field: string]: string | undefined;
}

const emptyForm = {
  eventId: "",
  collaboratorId: "",
  loc: "",
  ciaSelect: "Azul" as string,     // Azul | Gol | TAM | Outros
  ciaOther: "",
  valueText: "",
  os: "",
  quantityText: "1",
  agencySelect: "LCA" as string,   // LCA | Flytour | Onfly | Direto no site | Outros
  agencyOther: "",
  requestDate: todayISO(),
  boardingDate: "",
  notes: "",
};
type FormState = typeof emptyForm;

// ── Página ───────────────────────────────────────────────────────────────────

export default function BaggageControlPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const role = normalizeRole(user?.role);
  const allowed = role === "admin" || role === "purchasing";

  const [tab, setTab] = useState<TabId>("solicitacoes");

  // Filtros da aba 1
  const [filterEventId, setFilterEventId] = useState("");
  const [filterCollabId, setFilterCollabId] = useState("");
  const [listSearch, setListSearch] = useState("");

  // Buscas das abas 2 e 3
  const [collabTabSearch, setCollabTabSearch] = useState("");
  const [eventTabSearch, setEventTabSearch] = useState("");

  // Formulário
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [errors, setErrors] = useState<FormErrors>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collabSearch, setCollabSearch] = useState("");
  const [collabDropdownOpen, setCollabDropdownOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BaggageRequestItem | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const { data: events = [] } = useQuery<EventItem[]>({ queryKey: ["/api/events"], enabled: allowed });
  const { data: collaborators = [] } = useQuery<CollaboratorItem[]>({ queryKey: ["/api/collaborators"], enabled: allowed });
  const {
    data: requests = [], isLoading, isError, refetch,
  } = useQuery<BaggageRequestItem[]>({ queryKey: ["/api/baggage-requests"], enabled: allowed });

  const collabById = useMemo(() => {
    const map = new Map<string, CollaboratorItem>();
    for (const c of collaborators) map.set(c.id, c);
    return map;
  }, [collaborators]);
  const eventById = useMemo(() => {
    const map = new Map<string, EventItem>();
    for (const e of events) map.set(e.id, e);
    return map;
  }, [events]);

  const getCollabName = (id: string) => toTitleCase(fixEncoding(collabById.get(id)?.fullName || "")) || "—";
  const getEventName = (id: string) => fixEncoding(eventById.get(id)?.name || "") || "—";

  // Bagagens já registradas por colaborador, agregadas por CIA (100% derivado
  // dos registros — nada de contador manual)
  const bagsByCollaborator = useMemo(() => {
    const map = new Map<string, { byCia: Record<CiaGroup, number>; totalBags: number; totalCents: number }>();
    for (const r of requests) {
      const agg = map.get(r.collaboratorId) || { byCia: { Azul: 0, Gol: 0, TAM: 0, Outros: 0 }, totalBags: 0, totalCents: 0 };
      agg.byCia[ciaGroup(r.cia)] += r.quantity || 0;
      agg.totalBags += r.quantity || 0;
      agg.totalCents += r.valueCents || 0;
      map.set(r.collaboratorId, agg);
    }
    return map;
  }, [requests]);

  // ── Aba 1: lista filtrada ──
  const filteredRequests = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return requests.filter(r => {
      if (filterEventId && r.eventId !== filterEventId) return false;
      if (filterCollabId && r.collaboratorId !== filterCollabId) return false;
      if (!q) return true;
      const name = (collabById.get(r.collaboratorId)?.fullName || "").toLowerCase();
      return name.includes(q)
        || (r.loc || "").toLowerCase().includes(q)
        || (r.os || "").toLowerCase().includes(q);
    });
  }, [requests, filterEventId, filterCollabId, listSearch, collabById]);

  const filterSummary = useMemo(() => {
    let bags = 0, cents = 0;
    for (const r of filteredRequests) { bags += r.quantity || 0; cents += r.valueCents || 0; }
    return { bags, cents, records: filteredRequests.length };
  }, [filteredRequests]);

  // ── Aba 2: agregado por colaborador ──
  const collabRows = useMemo(() => {
    const q = collabTabSearch.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return Array.from(bagsByCollaborator.entries())
      .map(([collaboratorId, agg]) => {
        const c = collabById.get(collaboratorId);
        return {
          collaboratorId,
          name: c ? toTitleCase(fixEncoding(c.fullName)) : "—",
          cpf: c ? getCpf(c) : "",
          ...agg,
        };
      })
      .filter(r => {
        if (!q) return true;
        if (r.name.toLowerCase().includes(q)) return true;
        return !!qDigits && r.cpf.replace(/\D/g, "").includes(qDigits);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [bagsByCollaborator, collabById, collabTabSearch]);

  // ── Aba 3: agregado por evento ──
  const eventRows = useMemo(() => {
    const q = eventTabSearch.trim().toLowerCase();
    const map = new Map<string, { bags: number; cents: number; records: number }>();
    for (const r of requests) {
      const agg = map.get(r.eventId) || { bags: 0, cents: 0, records: 0 };
      agg.bags += r.quantity || 0;
      agg.cents += r.valueCents || 0;
      agg.records += 1;
      map.set(r.eventId, agg);
    }
    return Array.from(map.entries())
      .map(([eventId, agg]) => ({ eventId, name: getEventName(eventId), ...agg }))
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => b.cents - a.cents);
  }, [requests, eventById, eventTabSearch]);

  const eventTotals = useMemo(() => {
    let bags = 0, cents = 0;
    for (const r of eventRows) { bags += r.bags; cents += r.cents; }
    return { bags, cents };
  }, [eventRows]);

  // ── Autocomplete de colaborador ──
  const collabMatches = useMemo(() => {
    const q = collabSearch.trim().toLowerCase();
    if (!q) return [];
    const qDigits = q.replace(/\D/g, "");
    return collaborators
      .filter(c => c.active !== false)
      .filter(c => {
        const name = fixEncoding(c.fullName || "").toLowerCase();
        if (name.includes(q)) return true;
        const cpf = getCpf(c).replace(/\D/g, "");
        return !!qDigits && cpf.includes(qDigits);
      })
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "pt-BR"))
      .slice(0, 20);
  }, [collaborators, collabSearch]);

  const selectedCollab = form.collaboratorId ? collabById.get(form.collaboratorId) : undefined;
  const selectedCollabBags = form.collaboratorId ? bagsByCollaborator.get(form.collaboratorId) : undefined;

  // ── Validação do formulário ──
  const validate = (f: FormState): FormErrors => {
    const errs: FormErrors = {};
    if (!f.eventId) errs.eventId = "Selecione o evento";
    if (!f.collaboratorId) errs.collaboratorId = "Selecione o colaborador";
    if (!f.loc.trim()) errs.loc = "Informe o localizador (LOC)";
    if (f.ciaSelect === "Outros" && !f.ciaOther.trim()) errs.cia = "Informe a companhia aérea";
    const cents = Math.round(parseBrNumber(f.valueText) * 100);
    if (!f.valueText.trim()) errs.value = "Informe o valor";
    else if (cents < 0) errs.value = "Valor não pode ser negativo";
    if (!f.os.trim()) errs.os = "Informe a OS";
    const qty = parseInt(f.quantityText, 10);
    if (!f.quantityText.trim() || Number.isNaN(qty) || qty < 1) errs.quantity = "Quantidade mínima é 1";
    if (f.agencySelect === "Outros" && !f.agencyOther.trim()) errs.agency = "Informe a agência";
    if (!f.requestDate) errs.requestDate = "Informe a data da solicitação";
    if (!f.boardingDate) errs.boardingDate = "Informe a data do embarque";
    else if (f.requestDate && f.boardingDate < f.requestDate) {
      errs.boardingDate = "O embarque não pode ser anterior à solicitação";
    }
    return errs;
  };

  const buildPayload = (f: FormState) => ({
    eventId: f.eventId,
    collaboratorId: f.collaboratorId,
    loc: f.loc.trim().toUpperCase(),
    cia: f.ciaSelect === "Outros" ? f.ciaOther.trim() : f.ciaSelect,
    valueCents: Math.round(parseBrNumber(f.valueText) * 100),
    os: f.os.trim(),
    quantity: parseInt(f.quantityText, 10),
    agency: f.agencySelect === "Outros" ? f.agencyOther.trim() : f.agencySelect,
    requestDate: f.requestDate,
    boardingDate: f.boardingDate,
    notes: f.notes.trim() || null,
  });

  const resetForm = () => {
    setForm({ ...emptyForm });
    setErrors({});
    setEditingId(null);
    setCollabSearch("");
    setCollabDropdownOpen(false);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof buildPayload>) => {
      const res = editingId
        ? await apiRequest("PATCH", `/api/baggage-requests/${editingId}`, payload)
        : await apiRequest("POST", "/api/baggage-requests", payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/baggage-requests"] });
      toast({ title: editingId ? "Solicitação atualizada" : "Solicitação registrada" });
      resetForm();
    },
    onError: (e: any) => toast({
      title: "Erro",
      description: e?.body?.message || "Erro ao salvar a solicitação",
      variant: "destructive",
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/baggage-requests/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/baggage-requests"] });
      toast({ title: "Solicitação excluída" });
    },
    onError: (e: any) => toast({
      title: "Erro",
      description: e?.body?.message || "Erro ao excluir a solicitação",
      variant: "destructive",
    }),
  });

  const submit = () => {
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    saveMutation.mutate(buildPayload(form));
  };

  const startEdit = (r: BaggageRequestItem) => {
    const group = ciaGroup(r.cia);
    const isFixedCia = CIAS_FIXAS.includes(r.cia as any);
    const isFixedAgency = (AGENCIAS_FIXAS as readonly string[]).includes(r.agency);
    setEditingId(r.id);
    setErrors({});
    setForm({
      eventId: r.eventId,
      collaboratorId: r.collaboratorId,
      loc: r.loc || "",
      ciaSelect: isFixedCia ? r.cia : (group !== "Outros" ? group : "Outros"),
      ciaOther: isFixedCia || group !== "Outros" ? "" : r.cia,
      valueText: ((r.valueCents || 0) / 100).toFixed(2).replace(".", ","),
      os: r.os || "",
      quantityText: String(r.quantity || 1),
      agencySelect: isFixedAgency ? r.agency : "Outros",
      agencyOther: isFixedAgency ? "" : r.agency,
      requestDate: String(r.requestDate || "").split("T")[0],
      boardingDate: String(r.boardingDate || "").split("T")[0],
      notes: r.notes || "",
    });
    setCollabSearch("");
    setTab("solicitacoes");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── Exportar CSV (BOM UTF-8, ';', TODOS os campos entre aspas) ──
  const exportCsv = () => {
    const q = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const header = "LOC;CIA;VALOR;OS;QUANTIDADE;AGENCIA;NOME;CPF;EVENTO;DATA SOLICITACAO;DATA EMBARQUE;OBSERVACOES";
    const lines = filteredRequests.map(r => {
      const c = collabById.get(r.collaboratorId);
      return [
        q(r.loc || ""),
        q(r.cia || ""),
        q(((r.valueCents || 0) / 100).toFixed(2).replace(".", ",")),
        q(r.os || ""),
        q(String(r.quantity || 0)),
        q(r.agency || ""),
        q(c ? toTitleCase(fixEncoding(c.fullName)) : ""),
        q(c ? formatCpf(getCpf(c)) : ""),
        q(getEventName(r.eventId)),
        q(fmtDate(r.requestDate)),
        q(fmtDate(r.boardingDate)),
        q(r.notes || ""),
      ].join(";");
    });
    const blob = new Blob(["﻿" + [header, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `controle-bagagem-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Bloqueio local (além do ProtectedRoute) ──
  if (!allowed) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-100 p-10 max-w-md text-center">
          <Lock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-800">Sem acesso</h2>
          <p className="text-xs text-slate-400 mt-2">
            O Controle de Bagagem é restrito aos papéis Administrador e Compras/Viagens.
            Se você precisa deste acesso, fale com o administrador do sistema.
          </p>
        </div>
      </div>
    );
  }

  const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5";
  const inputCls = "h-9 text-xs rounded-lg border-gray-200";
  const selectCls = "w-full h-9 text-xs rounded-lg border border-gray-200 px-2 bg-white text-slate-700 focus:outline-none focus:border-blue-400";
  const errCls = "text-[10px] text-red-500 mt-1";
  const fieldError = (key: string, id: string) =>
    errors[key] ? <p id={id} className={errCls} role="alert">{errors[key]}</p> : null;

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: "solicitacoes", label: "Solicitações", icon: ClipboardList },
    { id: "colaboradores", label: "Por colaborador", icon: Users },
    { id: "eventos", label: "Resumo por evento", icon: CalendarDays },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Luggage className="w-4 h-4 text-blue-600" />
              </div>
              Controle de Bagagem
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 ml-10">
              Solicitações de bagagem por colaborador e evento — valores, localizadores e embarques
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-2.5 text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total do filtro atual</p>
            <p className="text-base font-bold text-slate-800 font-mono">
              {formatCurrency(filterSummary.cents)}
              <span className="text-xs font-semibold text-slate-400 font-sans ml-2">
                {filterSummary.bags} {filterSummary.bags === 1 ? "bagagem" : "bagagens"}
              </span>
            </p>
          </div>
        </div>

        {/* Abas */}
        <div role="tablist" aria-label="Seções do Controle de Bagagem" className="bg-white rounded-2xl border border-gray-100 p-1.5 inline-flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-xs font-semibold transition-colors ${
                tab === t.id ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* ── Aba 1: Solicitações ── */}
        {tab === "solicitacoes" && (
          <div id="panel-solicitacoes" role="tabpanel" aria-labelledby="tab-solicitacoes" className="space-y-4">
            {/* Formulário */}
            <div ref={formRef} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-bold text-slate-800">
                  {editingId ? "Editar solicitação" : "Nova solicitação"}
                </h2>
                {editingId && (
                  <button
                    onClick={resetForm}
                    className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-semibold text-slate-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <X className="w-3 h-3" /> Cancelar edição
                  </button>
                )}
              </div>

              {/* Região aria-live com o resumo dos erros */}
              <div aria-live="polite" className="sr-only">
                {Object.values(errors).filter(Boolean).join(". ")}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Evento */}
                <div>
                  <label htmlFor="bg-event" className={lbl}>Evento *</label>
                  <select
                    id="bg-event"
                    value={form.eventId}
                    onChange={e => setForm(f => ({ ...f, eventId: e.target.value }))}
                    aria-invalid={!!errors.eventId}
                    aria-describedby={errors.eventId ? "bg-event-err" : undefined}
                    className={selectCls}
                  >
                    <option value="">Selecione o evento...</option>
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>{fixEncoding(ev.name)}</option>
                    ))}
                  </select>
                  {fieldError("eventId", "bg-event-err")}
                </div>

                {/* Colaborador (autocomplete por nome ou CPF) */}
                <div className="relative">
                  <label htmlFor="bg-collab" className={lbl}>Colaborador *</label>
                  {selectedCollab ? (
                    <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-blue-200 bg-blue-50/50">
                      <p className="flex-1 min-w-0 text-xs font-semibold text-slate-700 truncate">
                        {toTitleCase(fixEncoding(selectedCollab.fullName))}
                        {getCpf(selectedCollab) && (
                          <span className="ml-2 font-mono font-normal text-slate-400">{formatCpf(getCpf(selectedCollab))}</span>
                        )}
                      </p>
                      <button
                        onClick={() => setForm(f => ({ ...f, collaboratorId: "" }))}
                        aria-label="Remover colaborador selecionado"
                        className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-white transition-colors shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Input
                        id="bg-collab"
                        value={collabSearch}
                        onChange={e => { setCollabSearch(e.target.value); setCollabDropdownOpen(true); }}
                        onFocus={() => setCollabDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setCollabDropdownOpen(false), 150)}
                        placeholder="Buscar por nome ou CPF..."
                        role="combobox"
                        aria-expanded={collabDropdownOpen && collabMatches.length > 0}
                        aria-autocomplete="list"
                        aria-invalid={!!errors.collaboratorId}
                        aria-describedby={errors.collaboratorId ? "bg-collab-err" : undefined}
                        className={inputCls}
                      />
                      {collabDropdownOpen && collabSearch.trim() && (
                        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-[240px] overflow-y-auto" role="listbox">
                          {collabMatches.length === 0 ? (
                            <p className="text-[11px] text-slate-400 text-center py-3 px-3">Nenhum colaborador encontrado.</p>
                          ) : collabMatches.map(c => {
                            const cpf = getCpf(c);
                            return (
                              <button
                                key={c.id}
                                role="option"
                                aria-selected={false}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                  setForm(f => ({ ...f, collaboratorId: c.id }));
                                  setCollabSearch("");
                                  setCollabDropdownOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                              >
                                <span className="font-semibold text-slate-700">{toTitleCase(fixEncoding(c.fullName))}</span>
                                {cpf && <span className="ml-2 font-mono text-[11px] text-slate-400">{formatCpf(cpf)}</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                  {fieldError("collaboratorId", "bg-collab-err")}
                </div>
              </div>

              {/* Painel de contexto do colaborador selecionado */}
              {selectedCollab && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 border border-gray-100 px-3.5 py-2.5">
                  <p className="text-xs font-semibold text-slate-700">
                    {toTitleCase(fixEncoding(selectedCollab.fullName))}
                  </p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 uppercase tracking-wide">
                    {TYPE_LABEL[selectedCollab.type || ""] || selectedCollab.type || "—"}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {selectedCollabBags
                      ? `${selectedCollabBags.totalBags} ${selectedCollabBags.totalBags === 1 ? "bagagem registrada" : "bagagens registradas"} no sistema`
                      : "Nenhuma bagagem registrada no sistema"}
                  </span>
                  {selectedCollabBags && (
                    <span className="flex items-center gap-1.5">
                      {(Object.keys(selectedCollabBags.byCia) as CiaGroup[])
                        .filter(g => selectedCollabBags.byCia[g] > 0)
                        .map(g => (
                          <span key={g} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CIA_STYLE[g].badge}`}>
                            {g}: {selectedCollabBags.byCia[g]}
                          </span>
                        ))}
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                {/* LOC */}
                <div>
                  <label htmlFor="bg-loc" className={lbl}>LOC *</label>
                  <Input
                    id="bg-loc"
                    value={form.loc}
                    onChange={e => setForm(f => ({ ...f, loc: e.target.value.toUpperCase() }))}
                    placeholder="ABC123"
                    aria-invalid={!!errors.loc}
                    aria-describedby={errors.loc ? "bg-loc-err" : undefined}
                    className={`${inputCls} font-mono uppercase`}
                  />
                  {fieldError("loc", "bg-loc-err")}
                </div>

                {/* CIA */}
                <div>
                  <label htmlFor="bg-cia" className={lbl}>CIA *</label>
                  <select
                    id="bg-cia"
                    value={form.ciaSelect}
                    onChange={e => setForm(f => ({ ...f, ciaSelect: e.target.value }))}
                    className={selectCls}
                  >
                    {CIAS_FIXAS.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="Outros">Outros</option>
                  </select>
                  {form.ciaSelect === "Outros" && (
                    <Input
                      value={form.ciaOther}
                      onChange={e => setForm(f => ({ ...f, ciaOther: e.target.value }))}
                      placeholder="Nome da companhia"
                      aria-label="Nome da companhia aérea"
                      aria-invalid={!!errors.cia}
                      aria-describedby={errors.cia ? "bg-cia-err" : undefined}
                      className={`${inputCls} mt-1.5`}
                    />
                  )}
                  {fieldError("cia", "bg-cia-err")}
                </div>

                {/* Valor */}
                <div>
                  <label htmlFor="bg-value" className={lbl}>Valor (R$) *</label>
                  <Input
                    id="bg-value"
                    value={form.valueText}
                    onChange={e => setForm(f => ({ ...f, valueText: e.target.value }))}
                    inputMode="decimal"
                    placeholder="0,00"
                    aria-invalid={!!errors.value}
                    aria-describedby={errors.value ? "bg-value-err" : undefined}
                    className={`${inputCls} font-mono`}
                  />
                  {fieldError("value", "bg-value-err")}
                </div>

                {/* OS */}
                <div>
                  <label htmlFor="bg-os" className={lbl}>OS *</label>
                  <Input
                    id="bg-os"
                    value={form.os}
                    onChange={e => setForm(f => ({ ...f, os: e.target.value }))}
                    placeholder="Nº da OS"
                    aria-invalid={!!errors.os}
                    aria-describedby={errors.os ? "bg-os-err" : undefined}
                    className={inputCls}
                  />
                  {fieldError("os", "bg-os-err")}
                </div>

                {/* Quantidade */}
                <div>
                  <label htmlFor="bg-qty" className={lbl}>Quantidade *</label>
                  <Input
                    id="bg-qty"
                    type="number"
                    min={1}
                    step={1}
                    value={form.quantityText}
                    onChange={e => setForm(f => ({ ...f, quantityText: e.target.value }))}
                    aria-invalid={!!errors.quantity}
                    aria-describedby={errors.quantity ? "bg-qty-err" : undefined}
                    className={inputCls}
                  />
                  {fieldError("quantity", "bg-qty-err")}
                </div>

                {/* Agência */}
                <div>
                  <label htmlFor="bg-agency" className={lbl}>Agência *</label>
                  <select
                    id="bg-agency"
                    value={form.agencySelect}
                    onChange={e => setForm(f => ({ ...f, agencySelect: e.target.value }))}
                    className={selectCls}
                  >
                    {AGENCIAS_FIXAS.map(a => <option key={a} value={a}>{a}</option>)}
                    <option value="Outros">Outros</option>
                  </select>
                  {form.agencySelect === "Outros" && (
                    <Input
                      value={form.agencyOther}
                      onChange={e => setForm(f => ({ ...f, agencyOther: e.target.value }))}
                      placeholder="Nome da agência"
                      aria-label="Nome da agência"
                      aria-invalid={!!errors.agency}
                      aria-describedby={errors.agency ? "bg-agency-err" : undefined}
                      className={`${inputCls} mt-1.5`}
                    />
                  )}
                  {fieldError("agency", "bg-agency-err")}
                </div>

                {/* Data da solicitação */}
                <div>
                  <label htmlFor="bg-request-date" className={lbl}>Data da solicitação *</label>
                  <Input
                    id="bg-request-date"
                    type="date"
                    value={form.requestDate}
                    onChange={e => setForm(f => ({ ...f, requestDate: e.target.value }))}
                    aria-invalid={!!errors.requestDate}
                    aria-describedby={errors.requestDate ? "bg-request-date-err" : undefined}
                    className={inputCls}
                  />
                  {fieldError("requestDate", "bg-request-date-err")}
                </div>

                {/* Data do embarque */}
                <div>
                  <label htmlFor="bg-boarding-date" className={lbl}>Data do embarque *</label>
                  <Input
                    id="bg-boarding-date"
                    type="date"
                    min={form.requestDate || undefined}
                    value={form.boardingDate}
                    onChange={e => setForm(f => ({ ...f, boardingDate: e.target.value }))}
                    aria-invalid={!!errors.boardingDate}
                    aria-describedby={errors.boardingDate ? "bg-boarding-date-err" : undefined}
                    className={inputCls}
                  />
                  {fieldError("boardingDate", "bg-boarding-date-err")}
                </div>
              </div>

              {/* Observações */}
              <div className="mt-4">
                <label htmlFor="bg-notes" className={lbl}>Observações (opcional)</label>
                <Input
                  id="bg-notes"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Ex.: bagagem extra de equipamento"
                  className={inputCls}
                />
              </div>

              <div className="flex justify-end mt-4">
                <Button
                  disabled={saveMutation.isPending}
                  onClick={submit}
                  className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  {saveMutation.isPending ? "Salvando..." : editingId ? "Salvar alterações" : "Registrar solicitação"}
                </Button>
              </div>
            </div>

            {/* Filtros + lista */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={listSearch}
                    onChange={e => setListSearch(e.target.value)}
                    placeholder="Buscar por nome, LOC ou OS..."
                    aria-label="Buscar solicitações por nome, LOC ou OS"
                    className="pl-8 h-9 text-xs rounded-xl border-gray-200"
                  />
                </div>
                <select
                  value={filterEventId}
                  onChange={e => setFilterEventId(e.target.value)}
                  aria-label="Filtrar por evento"
                  className="h-9 text-xs rounded-xl border border-gray-200 px-2 bg-white text-slate-700 focus:outline-none focus:border-blue-400 min-w-[180px]"
                >
                  <option value="">Todos os eventos</option>
                  {events.map(ev => <option key={ev.id} value={ev.id}>{fixEncoding(ev.name)}</option>)}
                </select>
                {filterCollabId && (
                  <span className="flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl">
                    {getCollabName(filterCollabId)}
                    <button
                      onClick={() => setFilterCollabId("")}
                      aria-label="Remover filtro de colaborador"
                      className="w-4 h-4 flex items-center justify-center rounded hover:bg-blue-100 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                <button
                  onClick={exportCsv}
                  disabled={filteredRequests.length === 0}
                  title="Exportar a lista filtrada em CSV"
                  aria-label="Exportar a lista filtrada em CSV"
                  className="flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              </div>

              {/* Resumo do filtro */}
              <div className="flex items-center gap-3 px-4 py-2 bg-slate-50/60 border-b border-gray-100 text-[11px] text-slate-500">
                <span><strong className="text-slate-700">{filterSummary.records}</strong> {filterSummary.records === 1 ? "registro" : "registros"}</span>
                <span className="text-slate-200">·</span>
                <span><strong className="text-slate-700">{filterSummary.bags}</strong> {filterSummary.bags === 1 ? "bagagem" : "bagagens"}</span>
                <span className="text-slate-200">·</span>
                <span className="font-mono font-semibold text-slate-700">{formatCurrency(filterSummary.cents)}</span>
              </div>

              <div className="p-4 space-y-3">
                {isLoading ? (
                  <div className="space-y-3" aria-hidden="true">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
                    ))}
                  </div>
                ) : isError ? (
                  <div className="text-center py-10">
                    <p className="text-xs text-slate-400 mb-3">Não foi possível carregar as solicitações.</p>
                    <button
                      onClick={() => refetch()}
                      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <RotateCw className="w-3.5 h-3.5" /> Tentar de novo
                    </button>
                  </div>
                ) : filteredRequests.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <Luggage className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">
                      {requests.length === 0
                        ? "Nenhuma solicitação registrada ainda. Preencha o formulário acima para registrar a primeira."
                        : "Nenhuma solicitação encontrada com os filtros atuais."}
                    </p>
                  </div>
                ) : filteredRequests.map(r => {
                  const style = CIA_STYLE[ciaGroup(r.cia)];
                  const c = collabById.get(r.collaboratorId);
                  const cpf = c ? getCpf(c) : "";
                  return (
                    <div key={r.id} className="flex rounded-xl border border-gray-100 overflow-hidden hover:border-blue-200 transition-colors">
                      {/* Stub estilo ticket de embarque */}
                      <div className={`${style.stub} w-24 shrink-0 flex flex-col items-center justify-center gap-0.5 px-2 py-3 text-white`}>
                        <Plane className="w-3.5 h-3.5 opacity-70" />
                        <p className="font-mono font-bold text-sm tracking-wider break-all text-center">{r.loc}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{r.cia}</p>
                      </div>
                      {/* Corpo */}
                      <div className="flex-1 min-w-0 px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {getCollabName(r.collaboratorId)}
                            {cpf && <span className="ml-2 font-mono font-normal text-[11px] text-slate-400">{formatCpf(cpf)}</span>}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              title="Editar solicitação"
                              aria-label={`Editar solicitação LOC ${r.loc}`}
                              onClick={() => startEdit(r)}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Excluir solicitação"
                              aria-label={`Excluir solicitação LOC ${r.loc}`}
                              onClick={() => setDeleteTarget(r)}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-1.5 mt-2 text-[11px]">
                          <div><p className="text-[10px] font-bold text-slate-300 uppercase">OS</p><p className="text-slate-600 font-medium truncate">{r.os}</p></div>
                          <div><p className="text-[10px] font-bold text-slate-300 uppercase">Qtd.</p><p className="text-slate-600 font-medium">{r.quantity}</p></div>
                          <div><p className="text-[10px] font-bold text-slate-300 uppercase">Valor</p><p className="text-slate-700 font-mono font-semibold">{formatCurrency(r.valueCents || 0)}</p></div>
                          <div><p className="text-[10px] font-bold text-slate-300 uppercase">Solicitação</p><p className="text-slate-600 font-medium font-mono">{fmtDate(r.requestDate)}</p></div>
                          <div><p className="text-[10px] font-bold text-slate-300 uppercase">Embarque</p><p className="text-slate-600 font-medium font-mono">{fmtDate(r.boardingDate)}</p></div>
                          <div><p className="text-[10px] font-bold text-slate-300 uppercase">Agência</p><p className="text-slate-600 font-medium truncate">{r.agency}</p></div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5 truncate">
                          {getEventName(r.eventId)}
                          {r.notes && <span className="text-slate-300"> — {r.notes}</span>}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Aba 2: Por colaborador ── */}
        {tab === "colaboradores" && (
          <div id="panel-colaboradores" role="tabpanel" aria-labelledby="tab-colaboradores" className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <div className="relative max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={collabTabSearch}
                  onChange={e => setCollabTabSearch(e.target.value)}
                  placeholder="Buscar por nome ou CPF..."
                  aria-label="Buscar colaborador por nome ou CPF"
                  className="pl-8 h-9 text-xs rounded-xl border-gray-200"
                />
              </div>
            </div>
            {isLoading ? (
              <div className="p-4 space-y-2" aria-hidden="true">
                {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}
              </div>
            ) : collabRows.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">
                  {requests.length === 0
                    ? "Nenhuma solicitação registrada ainda — os totais por colaborador aparecem aqui."
                    : "Nenhum colaborador encontrado."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="text-left font-bold px-4 py-2.5">Colaborador</th>
                      <th className="text-left font-bold px-2 py-2.5">CPF</th>
                      <th className="text-left font-bold px-2 py-2.5">Por CIA</th>
                      <th className="text-right font-bold px-2 py-2.5">Bagagens</th>
                      <th className="text-right font-bold px-4 py-2.5">Valor total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {collabRows.map(row => (
                      <tr
                        key={row.collaboratorId}
                        tabIndex={0}
                        role="button"
                        aria-label={`Ver solicitações de ${row.name}`}
                        onClick={() => { setFilterCollabId(row.collaboratorId); setFilterEventId(""); setListSearch(""); setTab("solicitacoes"); }}
                        onKeyDown={e => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setFilterCollabId(row.collaboratorId); setFilterEventId(""); setListSearch(""); setTab("solicitacoes");
                          }
                        }}
                        className="hover:bg-blue-50/40 cursor-pointer focus:outline-none focus:bg-blue-50/60"
                      >
                        <td className="px-4 py-2.5 font-semibold text-slate-700">{row.name}</td>
                        <td className="px-2 py-2.5 font-mono text-slate-500 whitespace-nowrap">{row.cpf ? formatCpf(row.cpf) : "—"}</td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(Object.keys(row.byCia) as CiaGroup[])
                              .filter(g => row.byCia[g] > 0)
                              .map(g => (
                                <span key={g} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${CIA_STYLE[g].badge}`}>
                                  {g}: {row.byCia[g]}
                                </span>
                              ))}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold text-slate-700">{row.totalBags}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-700 whitespace-nowrap">{formatCurrency(row.totalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Aba 3: Resumo por evento ── */}
        {tab === "eventos" && (
          <div id="panel-eventos" role="tabpanel" aria-labelledby="tab-eventos" className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <div className="relative max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={eventTabSearch}
                  onChange={e => setEventTabSearch(e.target.value)}
                  placeholder="Buscar evento..."
                  aria-label="Buscar evento"
                  className="pl-8 h-9 text-xs rounded-xl border-gray-200"
                />
              </div>
            </div>
            {isLoading ? (
              <div className="p-4 space-y-2" aria-hidden="true">
                {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}
              </div>
            ) : eventRows.length === 0 ? (
              <div className="text-center py-10 px-4">
                <CalendarDays className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">
                  {requests.length === 0
                    ? "Nenhuma solicitação registrada ainda — os totais por evento aparecem aqui."
                    : "Nenhum evento encontrado."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="text-left font-bold px-4 py-2.5">Evento</th>
                      <th className="text-right font-bold px-2 py-2.5">Bagagens</th>
                      <th className="text-right font-bold px-2 py-2.5">Valor total</th>
                      <th className="text-right font-bold px-4 py-2.5">Valor médio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {eventRows.map(row => (
                      <tr key={row.eventId} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-semibold text-slate-700">{row.name}</td>
                        <td className="px-2 py-2.5 text-right font-semibold text-slate-700">{row.bags}</td>
                        <td className="px-2 py-2.5 text-right font-mono font-semibold text-slate-700 whitespace-nowrap">{formatCurrency(row.cents)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-500 whitespace-nowrap">
                          {row.bags > 0 ? formatCurrency(Math.round(row.cents / row.bags)) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-gray-100">
                      <td className="px-4 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Total geral</td>
                      <td className="px-2 py-2.5 text-right font-bold text-slate-800">{eventTotals.bags}</td>
                      <td className="px-2 py-2.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">{formatCurrency(eventTotals.cents)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-500 whitespace-nowrap">
                        {eventTotals.bags > 0 ? formatCurrency(Math.round(eventTotals.cents / eventTotals.bags)) : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Confirmação de exclusão (soft delete no servidor) */}
        <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir solicitação de bagagem?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget && (
                  <>
                    LOC <span className="font-mono font-semibold">{deleteTarget.loc}</span> ({deleteTarget.cia}) —{" "}
                    {getCollabName(deleteTarget.collaboratorId)}, {formatCurrency(deleteTarget.valueCents || 0)},
                    embarque em {fmtDate(deleteTarget.boardingDate)}.
                    {" "}A exclusão fica registrada na auditoria.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-lg">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-lg bg-red-600 hover:bg-red-700"
                onClick={() => {
                  if (deleteTarget) {
                    if (editingId === deleteTarget.id) resetForm();
                    deleteMutation.mutate(deleteTarget.id);
                  }
                  setDeleteTarget(null);
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
