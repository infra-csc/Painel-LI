import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isRhOrAdmin } from "@/lib/permissions";
import { parseBrNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Wallet, Search, Plus, Download, Trash2, X, UtensilsCrossed, Bus,
  AlertTriangle, CheckCircle2, ArrowUpCircle, ArrowDownCircle, Sparkles,
} from "lucide-react";

// Valores-alvo do adiantamento: o colaborador deve sempre ter esses saldos
// disponíveis no Flash Benefícios (crédito inicial na admissão; cada evento
// com alimentação/mobilidade é reembolsado para recompor o saldo).
const TARGET_FOOD_CENTS = 35000;     // R$ 350,00 alimentação
const TARGET_MOBILITY_CENTS = 15000; // R$ 150,00 mobilidade

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = String(d).split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}
function toTitleCase(str: string) {
  if (!str) return str;
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
function todayISO() {
  return new Date().toISOString().split("T")[0];
}

type Balance = { food: number; mobility: number; count: number };

export default function FlashAccountPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canManage = isRhOrAdmin(user);

  const [search, setSearch] = useState("");
  const [selectedCollabId, setSelectedCollabId] = useState<string>("");
  const [showForm, setShowForm] = useState(false);

  const { data: collaborators = [] } = useQuery<any[]>({ queryKey: ["/api/collaborators"] });
  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const { data: movements = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/flash-movements"] });

  const getCollabName = (id: string) => collaborators.find(c => c.id === id)?.fullName || "—";
  const getEventName = (id?: string | null) => (events as any[]).find(e => e.id === id)?.name || "";

  // Saldo por colaborador: créditos somam, débitos subtraem
  const balances = useMemo(() => {
    const map = new Map<string, Balance>();
    for (const m of movements) {
      const b = map.get(m.collaboratorId) || { food: 0, mobility: 0, count: 0 };
      const signed = (m.type === "credito" ? 1 : -1) * (m.amountCents || 0);
      if (m.category === "alimentacao") b.food += signed; else b.mobility += signed;
      b.count += 1;
      map.set(m.collaboratorId, b);
    }
    return map;
  }, [movements]);

  const accountRows = useMemo(() => {
    const rows = Array.from(balances.entries()).map(([collaboratorId, b]) => ({
      collaboratorId,
      name: getCollabName(collaboratorId),
      ...b,
      belowTarget: b.food < TARGET_FOOD_CENTS || b.mobility < TARGET_MOBILITY_CENTS,
    }));
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [balances, collaborators, search]);

  const totals = useMemo(() => {
    let food = 0, mobility = 0, below = 0;
    for (const r of Array.from(balances.values())) {
      food += r.food; mobility += r.mobility;
      if (r.food < TARGET_FOOD_CENTS || r.mobility < TARGET_MOBILITY_CENTS) below++;
    }
    return { food, mobility, below, accounts: balances.size };
  }, [balances]);

  const selectedMovements = useMemo(
    () => movements.filter(m => m.collaboratorId === selectedCollabId),
    [movements, selectedCollabId],
  );

  // Extrato com saldo acumulado (por categoria e geral)
  const extrato = useMemo(() => {
    let food = 0, mobility = 0;
    return selectedMovements.map(m => {
      const signed = (m.type === "credito" ? 1 : -1) * (m.amountCents || 0);
      if (m.category === "alimentacao") food += signed; else mobility += signed;
      return { ...m, signed, runningFood: food, runningMobility: mobility };
    });
  }, [selectedMovements]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/flash-movements/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/flash-movements"] });
      toast({ title: "Lançamento excluído" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.body?.message || "Erro ao excluir lançamento", variant: "destructive" }),
  });

  const exportCsv = () => {
    const name = getCollabName(selectedCollabId);
    const header = "Data;Categoria;Tipo;Evento;Descrição;Valor (R$);Saldo Alimentação (R$);Saldo Mobilidade (R$)";
    const lines = extrato.map(m => [
      fmtDate(m.movementDate),
      m.category === "alimentacao" ? "Alimentação" : "Mobilidade",
      m.type === "credito" ? "Crédito" : "Débito",
      getEventName(m.eventId),
      (m.description || "").replace(/;/g, ","),
      (m.signed / 100).toFixed(2).replace(".", ","),
      (m.runningFood / 100).toFixed(2).replace(".", ","),
      (m.runningMobility / 100).toFixed(2).replace(".", ","),
    ].join(";"));
    const blob = new Blob(["﻿" + [header, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `conta-corrente-flash-${name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const selectedBalance = balances.get(selectedCollabId);

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4 text-violet-600" />
              </div>
              Conta Corrente Flash
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 ml-10">
              Controle do saldo de Flash Benefícios por colaborador — alvo de {formatCurrency(TARGET_FOOD_CENTS)} em alimentação e {formatCurrency(TARGET_MOBILITY_CENTS)} em mobilidade
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setShowForm(true)} className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold h-9 px-4 shadow-sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Novo Lançamento
            </Button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Contas ativas" value={String(totals.accounts)} icon={Wallet} color="text-violet-600" bg="bg-violet-50" />
          <SummaryCard label="Saldo alimentação" value={formatCurrency(totals.food)} icon={UtensilsCrossed} color="text-emerald-600" bg="bg-emerald-50" />
          <SummaryCard label="Saldo mobilidade" value={formatCurrency(totals.mobility)} icon={Bus} color="text-blue-600" bg="bg-blue-50" />
          <SummaryCard label="Abaixo do alvo" value={String(totals.below)} icon={AlertTriangle} color="text-amber-600" bg="bg-amber-50" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Lista de contas */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar colaborador..."
                  className="pl-8 h-9 text-xs rounded-xl border-gray-200"
                />
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-50">
              {isLoading ? (
                <p className="text-xs text-slate-400 text-center py-10">Carregando...</p>
              ) : accountRows.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <Wallet className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">
                    {movements.length === 0
                      ? "Nenhum lançamento ainda. Use \"Novo Lançamento\" para registrar o crédito inicial de um colaborador."
                      : "Nenhum colaborador encontrado."}
                  </p>
                </div>
              ) : accountRows.map(row => (
                <button
                  key={row.collaboratorId}
                  onClick={() => setSelectedCollabId(row.collaboratorId)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                    selectedCollabId === row.collaboratorId ? "bg-violet-50" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-700 truncate">{toTitleCase(row.name)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Alim. <span className={`font-mono font-semibold ${row.food < TARGET_FOOD_CENTS ? "text-amber-600" : "text-emerald-600"}`}>{formatCurrency(row.food)}</span>
                      <span className="mx-1.5 text-slate-200">·</span>
                      Mob. <span className={`font-mono font-semibold ${row.mobility < TARGET_MOBILITY_CENTS ? "text-amber-600" : "text-blue-600"}`}>{formatCurrency(row.mobility)}</span>
                    </p>
                  </div>
                  {row.belowTarget
                    ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Extrato */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {!selectedCollabId ? (
              <div className="p-16 text-center">
                <Wallet className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Selecione um colaborador para ver o extrato</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{toTitleCase(getCollabName(selectedCollabId))}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Saldo: <span className="font-mono font-semibold text-emerald-600">{formatCurrency(selectedBalance?.food || 0)}</span> alimentação
                      <span className="mx-1 text-slate-300">·</span>
                      <span className="font-mono font-semibold text-blue-600">{formatCurrency(selectedBalance?.mobility || 0)}</span> mobilidade
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={exportCsv} title="Exportar extrato em CSV" className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <Download className="w-3.5 h-3.5" /> CSV
                    </button>
                    <button onClick={() => setSelectedCollabId("")} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="max-h-[470px] overflow-y-auto">
                  {extrato.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-10">Nenhum lançamento para este colaborador.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="text-left font-bold px-4 py-2.5">Data</th>
                          <th className="text-left font-bold px-2 py-2.5">Lançamento</th>
                          <th className="text-right font-bold px-2 py-2.5">Valor</th>
                          <th className="text-right font-bold px-4 py-2.5">Saldo</th>
                          {canManage && <th className="px-2 py-2.5" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {extrato.map(m => (
                          <tr key={m.id} className="hover:bg-slate-50/60">
                            <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap font-mono">{fmtDate(m.movementDate)}</td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {m.type === "credito"
                                  ? <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  : <ArrowDownCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${m.category === "alimentacao" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                                  {m.category === "alimentacao" ? "Alimentação" : "Mobilidade"}
                                </span>
                              </div>
                              {(m.description || m.eventId) && (
                                <p className="text-[11px] text-slate-400 mt-1 truncate max-w-[260px]">
                                  {[getEventName(m.eventId), m.description].filter(Boolean).join(" — ")}
                                </p>
                              )}
                            </td>
                            <td className={`px-2 py-2.5 text-right font-mono font-semibold whitespace-nowrap ${m.signed >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                              {m.signed >= 0 ? "+" : "−"}{formatCurrency(Math.abs(m.signed))}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-500 whitespace-nowrap">
                              {formatCurrency(m.category === "alimentacao" ? m.runningFood : m.runningMobility)}
                            </td>
                            {canManage && (
                              <td className="px-2 py-2.5 text-right">
                                <button
                                  title="Excluir lançamento"
                                  onClick={() => { if (window.confirm("Excluir este lançamento? O saldo será recalculado.")) deleteMutation.mutate(m.id); }}
                                  className="w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {canManage && (
          <NewMovementDialog
            open={showForm}
            onClose={() => setShowForm(false)}
            collaborators={collaborators}
            events={events as any[]}
            defaultCollaboratorId={selectedCollabId}
            hasAccount={(id: string) => balances.has(id)}
            onCreated={(collabId: string) => {
              qc.invalidateQueries({ queryKey: ["/api/flash-movements"] });
              setSelectedCollabId(collabId);
            }}
          />
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color, bg }: any) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</p>
        <p className="text-base font-bold text-slate-800 font-mono truncate">{value}</p>
      </div>
    </div>
  );
}

function NewMovementDialog({ open, onClose, collaborators, events, defaultCollaboratorId, hasAccount, onCreated }: any) {
  const { toast } = useToast();
  const [collaboratorId, setCollaboratorId] = useState(defaultCollaboratorId || "");
  const [collabSearch, setCollabSearch] = useState("");
  const [category, setCategory] = useState<"alimentacao" | "mobilidade">("alimentacao");
  const [type, setType] = useState<"credito" | "debito">("credito");
  const [amount, setAmount] = useState("");
  const [movementDate, setMovementDate] = useState(todayISO());
  const [eventId, setEventId] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Sincroniza o colaborador pré-selecionado quando o diálogo abre
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setCollaboratorId(defaultCollaboratorId || "");
  }

  const filteredCollabs = useMemo(() => {
    const q = collabSearch.trim().toLowerCase();
    return (collaborators as any[])
      .filter(c => c.active !== false)
      .filter(c => !q || (c.fullName || "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [collaborators, collabSearch]);

  const reset = () => {
    setCategory("alimentacao"); setType("credito"); setAmount("");
    setMovementDate(todayISO()); setEventId(""); setDescription(""); setCollabSearch("");
  };

  const post = (body: any) => apiRequest("POST", "/api/flash-movements", body).then(r => r.json());

  const save = async (initialCredit: boolean) => {
    if (!collaboratorId) { toast({ title: "Selecione o colaborador", variant: "destructive" }); return; }
    try {
      setSaving(true);
      if (initialCredit) {
        // Crédito inicial da admissão: R$ 350 alimentação + R$ 150 mobilidade
        await post({ collaboratorId, category: "alimentacao", type: "credito", amountCents: 35000, movementDate, description: "Crédito inicial — admissão" });
        await post({ collaboratorId, category: "mobilidade", type: "credito", amountCents: 15000, movementDate, description: "Crédito inicial — admissão" });
        toast({ title: "Crédito inicial lançado", description: "R$ 350,00 de alimentação e R$ 150,00 de mobilidade." });
      } else {
        const cents = Math.round(parseBrNumber(amount) * 100);
        if (!cents || cents <= 0) { toast({ title: "Informe um valor válido", variant: "destructive" }); setSaving(false); return; }
        await post({
          collaboratorId, category, type, amountCents: cents, movementDate,
          eventId: eventId || null, description: description.trim() || null,
        });
        toast({ title: "Lançamento registrado" });
      }
      onCreated(collaboratorId);
      reset();
      onClose();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.body?.message || "Erro ao registrar lançamento", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5";

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !saving) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md rounded-2xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4 text-violet-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-800">Novo Lançamento</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Conta corrente Flash</p>
          </div>
          <button onClick={() => { if (!saving) { reset(); onClose(); } }} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className={lbl}>Colaborador</label>
            <Input value={collabSearch} onChange={e => setCollabSearch(e.target.value)} placeholder="Digite para buscar..." className="h-8 text-xs rounded-lg border-gray-200 mb-1.5" />
            <select
              value={collaboratorId}
              onChange={e => setCollaboratorId(e.target.value)}
              className="w-full h-9 text-xs rounded-lg border border-gray-200 px-2 bg-white text-slate-700 focus:outline-none focus:border-violet-400"
            >
              <option value="">Selecione...</option>
              {filteredCollabs.map((c: any) => (
                <option key={c.id} value={c.id}>{toTitleCase(c.fullName)}</option>
              ))}
            </select>
          </div>

          {collaboratorId && !hasAccount(collaboratorId) && (
            <button
              disabled={saving}
              onClick={() => save(true)}
              className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors text-left disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
              <span className="text-xs text-violet-700">
                <span className="font-bold">Lançar crédito inicial da admissão</span><br />
                <span className="text-violet-500">R$ 350,00 alimentação + R$ 150,00 mobilidade</span>
              </span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Categoria</label>
              <select value={category} onChange={e => setCategory(e.target.value as any)} className="w-full h-9 text-xs rounded-lg border border-gray-200 px-2 bg-white text-slate-700 focus:outline-none focus:border-violet-400">
                <option value="alimentacao">Alimentação</option>
                <option value="mobilidade">Mobilidade</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Tipo</label>
              <select value={type} onChange={e => setType(e.target.value as any)} className="w-full h-9 text-xs rounded-lg border border-gray-200 px-2 bg-white text-slate-700 focus:outline-none focus:border-violet-400">
                <option value="credito">Crédito (reembolso/recarga)</option>
                <option value="debito">Débito (consumo/ajuste)</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Valor (R$)</label>
              <Input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" className="h-9 text-xs rounded-lg border-gray-200 font-mono" />
            </div>
            <div>
              <label className={lbl}>Data</label>
              <Input type="date" value={movementDate} onChange={e => setMovementDate(e.target.value)} className="h-9 text-xs rounded-lg border-gray-200" />
            </div>
          </div>

          <div>
            <label className={lbl}>Evento (opcional)</label>
            <select value={eventId} onChange={e => setEventId(e.target.value)} className="w-full h-9 text-xs rounded-lg border border-gray-200 px-2 bg-white text-slate-700 focus:outline-none focus:border-violet-400">
              <option value="">Sem evento vinculado</option>
              {(events as any[]).map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={lbl}>Descrição (opcional)</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: Reembolso alimentação — Night Run" className="h-9 text-xs rounded-lg border-gray-200" />
          </div>
        </div>

        <div className="flex gap-2 justify-end px-5 py-4 border-t border-gray-100 bg-slate-50/50">
          <button onClick={() => { if (!saving) { reset(); onClose(); } }} className="h-9 px-4 text-xs font-medium text-slate-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <Button disabled={saving} onClick={() => save(false)} className="h-9 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold">
            {saving ? "Salvando..." : "Registrar Lançamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
