import { useEffect, useMemo, useState } from "react";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Wallet, Search, Plus, Download, Trash2, X, UtensilsCrossed, Bus,
  AlertTriangle, CheckCircle2, ArrowUpCircle, ArrowDownCircle, Sparkles,
  Pencil, UserPlus, ChevronDown,
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

// Formas locais das respostas da API (apenas os campos usados nesta tela)
interface Collaborator {
  id: string;
  fullName: string;
  active?: boolean | null;
}
interface EventItem {
  id: string;
  name: string;
}
interface FlashMovement {
  id: string;
  collaboratorId: string;
  eventId?: string | null;
  category: string; // alimentacao | mobilidade
  type: string;     // credito | debito
  amountCents: number;
  movementDate: string;
  description?: string | null;
  createdAt?: string | null;
}

export default function FlashAccountPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canManage = isRhOrAdmin(user);

  const [search, setSearch] = useState("");
  const [selectedCollabId, setSelectedCollabId] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [formCollabId, setFormCollabId] = useState<string>("");
  const [movementToEdit, setMovementToEdit] = useState<FlashMovement | null>(null);
  const [movementToDelete, setMovementToDelete] = useState<FlashMovement | null>(null);
  const [showNoInitialCredit, setShowNoInitialCredit] = useState(false);

  const { data: collaborators = [] } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const { data: events = [] } = useQuery<EventItem[]>({ queryKey: ["/api/events"] });
  const { data: movements = [], isLoading } = useQuery<FlashMovement[]>({ queryKey: ["/api/flash-movements"] });

  const getCollabName = (id: string) => collaborators.find(c => c.id === id)?.fullName || "—";
  const getEventName = (id?: string | null) => events.find(e => e.id === id)?.name || "";

  // Saldo por colaborador: créditos somam, débitos subtraem
  const balances = useMemo(() => {
    const map = new Map<string, Balance>();
    for (const m of movements) {
      // Categoria desconhecida (dado legado/manual) não pode corromper o saldo
      if (m.category !== "alimentacao" && m.category !== "mobilidade") continue;
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

  // Extrato com saldo acumulado (por categoria e geral).
  // Ordena localmente por data do movimento (createdAt desempata) antes de
  // acumular — o saldo por linha não pode depender da ordem que a API devolve.
  const extrato = useMemo(() => {
    const sorted = [...selectedMovements].sort((a, b) => {
      const byDate = String(a.movementDate || "").localeCompare(String(b.movementDate || ""));
      if (byDate !== 0) return byDate;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
    let food = 0, mobility = 0;
    return sorted.map(m => {
      const signed = (m.type === "credito" ? 1 : -1) * (m.amountCents || 0);
      if (m.category === "alimentacao") food += signed; else mobility += signed;
      return { ...m, signed, runningFood: food, runningMobility: mobility };
    });
  }, [selectedMovements]);

  // Critério único de "tem conta": QUALQUER movimento registrado (mesmo o que o
  // servidor usa para rejeitar o crédito inicial). `balances` não serve — ele
  // ignora categorias desconhecidas e mentiria para dados legados/manuais.
  const collabsWithMovements = useMemo(
    () => new Set(movements.map(m => m.collaboratorId)),
    [movements],
  );

  // Admitidos sem crédito inicial: colaboradores ativos sem NENHUM lançamento
  // (o crédito inicial só vale para conta nova — o servidor rejeita se já houver
  // movimentos). Fecha o fluxo "crédito na admissão".
  const admittedWithoutInitialCredit = useMemo(() => {
    return collaborators
      .filter(c => c.active !== false && !collabsWithMovements.has(c.id))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "pt-BR"));
  }, [collaborators, collabsWithMovements]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/flash-movements/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/flash-movements"] });
      toast({ title: "Lançamento excluído" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.body?.message || "Erro ao excluir lançamento", variant: "destructive" }),
  });

  // Campo CSV seguro: aspas duplas quando houver ; aspas ou quebra de linha
  const csvField = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

  const exportCsv = () => {
    const name = getCollabName(selectedCollabId);
    const header = "Data;Categoria;Tipo;Evento;Descrição;Valor (R$);Saldo Alimentação (R$);Saldo Mobilidade (R$)";
    const lines = extrato.map(m => [
      fmtDate(m.movementDate),
      m.category === "alimentacao" ? "Alimentação" : "Mobilidade",
      m.type === "credito" ? "Crédito" : "Débito",
      csvField(getEventName(m.eventId)),
      csvField(m.description || ""),
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
            <Button onClick={() => { setMovementToEdit(null); setFormCollabId(""); setShowForm(true); }} className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold h-9 px-4 shadow-sm">
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

        {/* Admitidos sem crédito inicial — fecha o fluxo "crédito na admissão" */}
        {canManage && !isLoading && admittedWithoutInitialCredit.length > 0 && (
          <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
            <button
              onClick={() => setShowNoInitialCredit(v => !v)}
              aria-expanded={showNoInitialCredit}
              className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-amber-50/40 transition-colors"
            >
              <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-slate-700">
                  Admitidos sem crédito inicial
                  <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {admittedWithoutInitialCredit.length}
                  </span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Colaboradores ativos sem nenhum lançamento na conta Flash — lance o crédito inicial da admissão
                </p>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${showNoInitialCredit ? "rotate-180" : ""}`} />
            </button>
            {showNoInitialCredit && (
              <div className="max-h-[280px] overflow-y-auto divide-y divide-gray-50 border-t border-gray-100">
                {admittedWithoutInitialCredit.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                    <p className="flex-1 min-w-0 text-xs font-medium text-slate-600 truncate">{toTitleCase(c.fullName)}</p>
                    <button
                      onClick={() => { setFormCollabId(c.id); setMovementToEdit(null); setShowForm(true); }}
                      className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-semibold text-violet-600 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors shrink-0"
                    >
                      <Sparkles className="w-3 h-3" /> Lançar crédito
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
                  aria-current={selectedCollabId === row.collaboratorId ? "true" : undefined}
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
                    <button
                      onClick={() => setSelectedCollabId("")}
                      aria-label="Fechar extrato"
                      title="Fechar extrato"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="max-h-[470px] overflow-y-auto overflow-x-auto">
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
                              <td className="px-2 py-2.5 text-right whitespace-nowrap">
                                <button
                                  title="Editar lançamento"
                                  aria-label="Editar lançamento"
                                  onClick={() => { setMovementToEdit(m); setFormCollabId(""); setShowForm(true); }}
                                  className="w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-300 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  title="Excluir lançamento"
                                  aria-label="Excluir lançamento"
                                  onClick={() => setMovementToDelete(m)}
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

        {/* Confirmação de exclusão (padrão do app — sem window.confirm) */}
        <AlertDialog open={!!movementToDelete} onOpenChange={open => { if (!open) setMovementToDelete(null); }}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
              <AlertDialogDescription>
                {movementToDelete && (
                  <>
                    {movementToDelete.type === "credito" ? "Crédito" : "Débito"} de {formatCurrency(movementToDelete.amountCents || 0)} em{" "}
                    {movementToDelete.category === "alimentacao" ? "alimentação" : "mobilidade"} ({fmtDate(movementToDelete.movementDate)}).
                    {" "}O saldo do colaborador será recalculado e a exclusão fica registrada na auditoria.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-lg">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-lg bg-red-600 hover:bg-red-700"
                onClick={() => { if (movementToDelete) deleteMutation.mutate(movementToDelete.id); setMovementToDelete(null); }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {canManage && (
          <NewMovementDialog
            open={showForm}
            onClose={() => { setShowForm(false); setMovementToEdit(null); setFormCollabId(""); }}
            collaborators={collaborators}
            events={events}
            defaultCollaboratorId={formCollabId || selectedCollabId}
            editing={movementToEdit}
            hasAccount={(id: string) => collabsWithMovements.has(id)}
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

interface NewMovementDialogProps {
  open: boolean;
  onClose: () => void;
  collaborators: Collaborator[];
  events: EventItem[];
  defaultCollaboratorId: string;
  /** Lançamento em edição (salvo via PATCH — atualização in-place, auditada no servidor). */
  editing: FlashMovement | null;
  hasAccount: (id: string) => boolean;
  onCreated: (collabId: string) => void;
}

function NewMovementDialog({ open, onClose, collaborators, events, defaultCollaboratorId, editing, hasAccount, onCreated }: NewMovementDialogProps) {
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

  // Ao abrir: pré-preenche com o lançamento em edição (preservando a data) ou
  // apenas sincroniza o colaborador pré-selecionado. useEffect no lugar do
  // antigo setState durante o render.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCollaboratorId(editing.collaboratorId);
      setCategory(editing.category === "mobilidade" ? "mobilidade" : "alimentacao");
      setType(editing.type === "debito" ? "debito" : "credito");
      setAmount(((editing.amountCents || 0) / 100).toFixed(2).replace(".", ","));
      setMovementDate(String(editing.movementDate || "").split("T")[0] || todayISO());
      setEventId(editing.eventId || "");
      setDescription(editing.description || "");
    } else {
      setCollaboratorId(defaultCollaboratorId || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const filteredCollabs = useMemo(() => {
    const q = collabSearch.trim().toLowerCase();
    return collaborators
      .filter(c => c.active !== false)
      .filter(c => !q || (c.fullName || "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [collaborators, collabSearch]);

  // O colaborador selecionado pode não estar nas options (inativo ou fora do
  // slice de 50) — sem esta injeção o select exibiria "Selecione..." mesmo com
  // um lançamento em edição já vinculado a alguém.
  const optionCollabs = useMemo(() => {
    if (collaboratorId && !filteredCollabs.some(c => c.id === collaboratorId)) {
      const current = collaborators.find(c => c.id === collaboratorId);
      if (current) return [current, ...filteredCollabs];
    }
    return filteredCollabs;
  }, [filteredCollabs, collaborators, collaboratorId]);

  const reset = () => {
    setCategory("alimentacao"); setType("credito"); setAmount("");
    setMovementDate(todayISO()); setEventId(""); setDescription(""); setCollabSearch("");
  };

  const post = (body: any) => apiRequest("POST", "/api/flash-movements", body).then(r => r.json());

  const save = async (initialCredit: boolean) => {
    if (!collaboratorId) { toast({ title: "Selecione o colaborador", variant: "destructive" }); return; }
    if (!movementDate) { toast({ title: "Informe a data do lançamento", variant: "destructive" }); return; }
    try {
      setSaving(true);
      if (initialCredit) {
        // Endpoint transacional: os dois créditos (R$ 350 + R$ 150) nunca
        // ficam pela metade se algo falhar no meio
        await apiRequest("POST", "/api/flash-movements/initial-credit", { collaboratorId, movementDate }).then(r => r.json());
        toast({ title: "Crédito inicial lançado", description: "R$ 350,00 de alimentação e R$ 150,00 de mobilidade." });
      } else {
        const cents = Math.round(parseBrNumber(amount) * 100);
        if (!cents || cents <= 0) { toast({ title: "Informe um valor válido", variant: "destructive" }); setSaving(false); return; }
        const body = {
          collaboratorId, category, type, amountCents: cents, movementDate,
          eventId: eventId || null, description: description.trim() || null,
        };
        if (editing) {
          // Atualização in-place via PATCH: o original só muda se a edição
          // for aceita pelo servidor (nada de excluir + recriar).
          await apiRequest("PATCH", `/api/flash-movements/${editing.id}`, body).then(r => r.json());
        } else {
          await post(body);
        }
        toast({ title: editing ? "Lançamento atualizado" : "Lançamento registrado" });
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
            <h3 className="text-sm font-bold text-slate-800">{editing ? "Editar Lançamento" : "Novo Lançamento"}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {editing ? "A alteração é aplicada ao próprio lançamento e fica registrada na auditoria" : "Conta corrente Flash"}
            </p>
          </div>
          <button onClick={() => { if (!saving) { reset(); onClose(); } }} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label htmlFor="fm-collaborator" className={lbl}>Colaborador</label>
            <Input value={collabSearch} onChange={e => setCollabSearch(e.target.value)} placeholder="Digite para buscar..." aria-label="Buscar colaborador" className="h-8 text-xs rounded-lg border-gray-200 mb-1.5" />
            <select
              id="fm-collaborator"
              value={collaboratorId}
              onChange={e => setCollaboratorId(e.target.value)}
              className="w-full h-9 text-xs rounded-lg border border-gray-200 px-2 bg-white text-slate-700 focus:outline-none focus:border-violet-400"
            >
              <option value="">Selecione...</option>
              {optionCollabs.map((c: any) => (
                <option key={c.id} value={c.id}>{toTitleCase(c.fullName)}</option>
              ))}
            </select>
          </div>

          {!editing && collaboratorId && !hasAccount(collaboratorId) && (
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
              <label htmlFor="fm-category" className={lbl}>Categoria</label>
              <select id="fm-category" value={category} onChange={e => setCategory(e.target.value as any)} className="w-full h-9 text-xs rounded-lg border border-gray-200 px-2 bg-white text-slate-700 focus:outline-none focus:border-violet-400">
                <option value="alimentacao">Alimentação</option>
                <option value="mobilidade">Mobilidade</option>
              </select>
            </div>
            <div>
              <label htmlFor="fm-type" className={lbl}>Tipo</label>
              <select id="fm-type" value={type} onChange={e => setType(e.target.value as any)} className="w-full h-9 text-xs rounded-lg border border-gray-200 px-2 bg-white text-slate-700 focus:outline-none focus:border-violet-400">
                <option value="credito">Crédito (reembolso/recarga)</option>
                <option value="debito">Débito (consumo/ajuste)</option>
              </select>
            </div>
            <div>
              <label htmlFor="fm-amount" className={lbl}>Valor (R$)</label>
              <Input id="fm-amount" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" className="h-9 text-xs rounded-lg border-gray-200 font-mono" />
            </div>
            <div>
              <label htmlFor="fm-date" className={lbl}>Data</label>
              <Input id="fm-date" type="date" value={movementDate} onChange={e => setMovementDate(e.target.value)} className="h-9 text-xs rounded-lg border-gray-200" />
            </div>
          </div>

          <div>
            <label htmlFor="fm-event" className={lbl}>Evento (opcional)</label>
            <select id="fm-event" value={eventId} onChange={e => setEventId(e.target.value)} className="w-full h-9 text-xs rounded-lg border border-gray-200 px-2 bg-white text-slate-700 focus:outline-none focus:border-violet-400">
              <option value="">Sem evento vinculado</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fm-description" className={lbl}>Descrição (opcional)</label>
            <Input id="fm-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: Reembolso alimentação — Night Run" className="h-9 text-xs rounded-lg border-gray-200" />
          </div>
        </div>

        <div className="flex gap-2 justify-end px-5 py-4 border-t border-gray-100 bg-slate-50/50">
          <button onClick={() => { if (!saving) { reset(); onClose(); } }} className="h-9 px-4 text-xs font-medium text-slate-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <Button disabled={saving} onClick={() => save(false)} className="h-9 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold">
            {saving ? "Salvando..." : editing ? "Salvar Alterações" : "Registrar Lançamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
