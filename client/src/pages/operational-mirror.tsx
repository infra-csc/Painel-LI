import { useState, useRef, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import EventCombobox from "@/components/ui/event-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  RefreshCw, FileSpreadsheet, AlertTriangle, Plane, BedDouble, Luggage, Car,
  CheckCircle2, Users, Loader2, CheckCheck, MapPin, Clock, Check, MapPinned, CalendarDays,
} from "lucide-react";

function brl(cents: number | null | undefined): string {
  if (!cents) return "R$ 0,00";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return d;
}

const genderLabel: Record<string, string> = { male: "M", female: "F", unknown: "?" };

type CellType = "text" | "money" | "date" | "time" | "int" | "bool";

// ---------- Editable cell ----------
function EditableCell({
  rowId, field, value, type, onSave, align = "left",
}: {
  rowId: string;
  field: string;
  value: any;
  type: CellType;
  onSave: (rowId: string, field: string, value: any) => Promise<void>;
  align?: "left" | "right" | "center";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function toDraft(): string {
    if (value === null || value === undefined) return "";
    if (type === "money") return ((value as number) / 100).toString();
    return String(value);
  }

  function display(): React.ReactNode {
    if (type === "bool") return value ? <Check className="h-3.5 w-3.5 text-green-600 mx-auto" /> : <span className="text-muted-foreground/40">—</span>;
    if (value === null || value === undefined || value === "") return <span className="text-muted-foreground/40">—</span>;
    if (type === "money") return brl(value as number);
    if (type === "date") return fmtDate(value as string);
    return String(value);
  }

  function parseDraft(raw: string): any {
    const t = raw.trim();
    if (t === "") return type === "money" || type === "int" ? null : "";
    if (type === "money") {
      // native number input always emits a dot decimal separator
      const n = parseFloat(t.replace(",", "."));
      return Number.isFinite(n) ? Math.round(n * 100) : null;
    }
    if (type === "int") {
      const n = parseInt(t, 10);
      return Number.isFinite(n) ? n : null;
    }
    return t;
  }

  async function commit() {
    setEditing(false);
    const next = parseDraft(draft);
    const prev = type === "money" || type === "int" ? (value ?? null) : (value ?? "");
    if (String(next) === String(prev)) return;
    setState("saving");
    try {
      await onSave(rowId, field, next);
      setState("saved");
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1200);
    } catch {
      setState("error");
      setTimeout(() => setState((s) => (s === "error" ? "idle" : s)), 2000);
    }
  }

  // bool toggles directly
  async function toggleBool() {
    setState("saving");
    try {
      await onSave(rowId, field, !value);
      setState("saved");
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1200);
    } catch {
      setState("error");
      setTimeout(() => setState((s) => (s === "error" ? "idle" : s)), 2000);
    }
  }

  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const ring =
    state === "saving" ? "ring-1 ring-blue-300 bg-blue-50/50 dark:bg-blue-950/30"
    : state === "saved" ? "ring-1 ring-green-300 bg-green-50/50 dark:bg-green-950/30"
    : state === "error" ? "ring-1 ring-red-400 bg-red-50/50 dark:bg-red-950/30"
    : "";

  if (type === "bool") {
    return (
      <td className={`p-0 border-r border-border/40 ${ring}`}>
        <button type="button" onClick={toggleBool} className="w-full h-full px-2 py-1.5 hover:bg-muted/40 transition-colors flex items-center justify-center" title="Alternar">
          {state === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : display()}
        </button>
      </td>
    );
  }

  if (editing) {
    const inputType = type === "date" ? "date" : type === "money" || type === "int" ? "number" : type === "time" ? "time" : "text";
    return (
      <td className={`p-0 border-r border-border/40 ${ring}`}>
        <input
          ref={inputRef}
          type={inputType}
          step={type === "money" ? "0.01" : undefined}
          defaultValue={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setEditing(false); }
          }}
          className={`w-full min-w-[70px] px-2 py-1.5 text-xs bg-transparent outline-none ${alignCls}`}
        />
      </td>
    );
  }

  return (
    <td className={`p-0 border-r border-border/40 ${ring}`}>
      <button
        type="button"
        onClick={() => { setDraft(toDraft()); setEditing(true); }}
        className={`w-full h-full px-2 py-1.5 text-xs hover:bg-muted/40 transition-colors whitespace-nowrap ${alignCls} ${align === "left" ? "" : "tabular-nums"} flex items-center ${align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"} gap-1`}
      >
        {state === "saving" && <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />}
        {state === "saved" && <Check className="h-3 w-3 text-green-600 shrink-0" />}
        <span className="truncate">{display()}</span>
      </button>
    </td>
  );
}

function ReadCell({ children, align = "left", className = "" }: { children: React.ReactNode; align?: "left" | "right" | "center"; className?: string }) {
  const alignCls = align === "right" ? "text-right tabular-nums" : align === "center" ? "text-center" : "text-left";
  return <td className={`px-2 py-1.5 text-xs border-r border-border/40 ${alignCls} ${className}`}>{children}</td>;
}

// group header colors
const G = {
  collab: "bg-slate-100 dark:bg-slate-800",
  schedule: "bg-sky-100 dark:bg-sky-950/50 text-sky-900 dark:text-sky-200",
  ticket: "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200",
  hotel: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200",
  baggage: "bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200",
  uber: "bg-fuchsia-100 dark:bg-fuchsia-950/50 text-fuchsia-900 dark:text-fuchsia-200",
  car: "bg-orange-100 dark:bg-orange-950/50 text-orange-900 dark:text-orange-200",
  pend: "bg-rose-100 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200",
};

export default function OperationalMirror() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const search = useSearch();
  const initialEventId = new URLSearchParams(search).get("eventId") || "";
  const [eventId, setEventId] = useState<string>(initialEventId);

  const { data: events } = useQuery<any[]>({ queryKey: ["/api/events"] });

  const mirrorKey = ["/api/events", eventId, "operational-mirror"];
  const { data, isLoading } = useQuery<any>({
    queryKey: mirrorKey,
    enabled: !!eventId && eventId !== "all",
  });

  async function saveCell(rowId: string, field: string, value: any) {
    await apiRequest("PATCH", `/api/events/${eventId}/operational-mirror/rows/${rowId}`, { field, value });
    await queryClient.invalidateQueries({ queryKey: mirrorKey });
  }

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${eventId}/recalculate-logistics-suggestions`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mirrorKey });
      toast({ title: "Sugestões recalculadas", description: "Grupos confirmados foram preservados." });
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível recalcular.", variant: "destructive" }),
  });

  const confirmRoomMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/hotel-room-groups/${id}/confirm`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: mirrorKey }); toast({ title: "Quarto confirmado" }); },
  });
  const confirmUberMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/uber-groups/${id}/confirm`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: mirrorKey }); toast({ title: "Uber confirmado" }); },
  });

  function handleExport() {
    if (!eventId) return;
    window.open(`/api/events/${eventId}/operational-mirror/export`, "_blank");
  }

  const totals = data?.totals;
  const ev = data?.event;

  return (
    <div className="p-6 space-y-5" data-testid="page-operational-mirror">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Espelho Operacional do Evento</h1>
          <p className="text-sm text-muted-foreground">Grade operacional editável — passagem, hospedagem, bagagem, Uber e locação por colaborador.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => recalcMutation.mutate()} disabled={!eventId || recalcMutation.isPending} data-testid="button-recalc">
            {recalcMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Recalcular sugestões
          </Button>
          <Button onClick={handleExport} disabled={!eventId} data-testid="button-export">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
        </div>
      </div>

      <div className="max-w-md">
        <EventCombobox events={events} value={eventId} onValueChange={setEventId} placeholder="Selecione um evento" showAllOption={false} />
      </div>

      {!eventId && (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Selecione um evento para visualizar o espelho operacional.</CardContent></Card>
      )}

      {eventId && isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...</div>
      )}

      {eventId && !isLoading && data && (
        <>
          {/* Event header */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-card px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPinned className="h-3.5 w-3.5" /> Evento / Projeto</div>
              <div className="font-semibold mt-0.5">{ev.name}</div>
            </div>
            <div className="rounded-lg border bg-card px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> Endereço</div>
              <div className="font-semibold mt-0.5">{ev.location || "—"}</div>
            </div>
            <div className="rounded-lg border bg-card px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Data</div>
              <div className="font-semibold mt-0.5">{fmtDate(ev.startDate)} {ev.endDate ? `→ ${fmtDate(ev.endDate)}` : ""}</div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard icon={<Plane className="h-4 w-4" />} label="Passagens" value={brl(totals.tickets)} />
            <SummaryCard icon={<BedDouble className="h-4 w-4" />} label="Hotelaria" value={brl(totals.hotel)} />
            <SummaryCard icon={<Luggage className="h-4 w-4" />} label="Bagagem" value={brl(totals.baggage)} />
            <SummaryCard icon={<Car className="h-4 w-4" />} label="Uber" value={brl(totals.uber)} />
            <SummaryCard icon={<Car className="h-4 w-4" />} label="Locação" value={brl(totals.carRental)} />
            <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Total Geral" value={brl(totals.grand)} highlight />
          </div>

          {data.pendingCount > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              {data.pendingCount} pendência(s) detectada(s) nas linhas abaixo.
            </div>
          )}

          <Tabs defaultValue="table">
            <TabsList>
              <TabsTrigger value="table" data-testid="tab-table">Grade Operacional</TabsTrigger>
              <TabsTrigger value="rooms" data-testid="tab-rooms">Quartos ({data.roomGroups.length})</TabsTrigger>
              <TabsTrigger value="uber" data-testid="tab-uber">Uber ({data.uberGroups.length})</TabsTrigger>
            </TabsList>

            {/* Editable grid */}
            <TabsContent value="table">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="text-xs border-collapse" data-testid="operational-grid">
                      <thead>
                        {/* group header row */}
                        <tr>
                          <th className={`sticky left-0 z-20 ${G.collab} px-2 py-1.5 text-left font-semibold border-r border-b border-border min-w-[160px]`}>&nbsp;</th>
                          <th className={`${G.collab} px-2 py-1.5 text-left font-semibold border-r border-b border-border`}>&nbsp;</th>
                          <th colSpan={4} className={`${G.schedule} px-2 py-1.5 text-center font-bold border-r border-b border-border`}>Período de Escala</th>
                          <th colSpan={9} className={`${G.ticket} px-2 py-1.5 text-center font-bold border-r border-b border-border`}>Passagem</th>
                          <th colSpan={9} className={`${G.hotel} px-2 py-1.5 text-center font-bold border-r border-b border-border`}>Hospedagem</th>
                          <th colSpan={3} className={`${G.baggage} px-2 py-1.5 text-center font-bold border-r border-b border-border`}>Bagagem Extra</th>
                          <th colSpan={3} className={`${G.uber} px-2 py-1.5 text-center font-bold border-r border-b border-border`}>Uber</th>
                          <th colSpan={4} className={`${G.car} px-2 py-1.5 text-center font-bold border-r border-b border-border`}>Locação de Carro</th>
                          <th colSpan={2} className={`${G.pend} px-2 py-1.5 text-center font-bold border-r border-b border-border`}>Pendências</th>
                        </tr>
                        {/* column header row */}
                        <tr className="bg-muted/60">
                          {[
                            ["NOME", "sticky-first"], ["DEPARTAMENTO", ""],
                            ["INÍCIO", ""], ["DATA IDA", ""], ["TÉRMINO", ""], ["DATA VOLTA", ""],
                            ["PASSAGENS TT R$", ""], ["AERO IDA", ""], ["HR IDA", ""], ["HR VOLTA", ""], ["AERO VOLTA", ""], ["LOCALIZADOR", ""], ["EMPRESA", ""], ["OC", ""], ["CHECK IN 3", ""],
                            ["DIÁRIAS", ""], ["QUARTO", ""], ["R$ DIÁRIA H", ""], ["LATE C/OUT", ""], ["HOTEL TT R$", ""], ["HOTEL", ""], ["EMPRESA PGTO", ""], ["OC", ""], ["CHECK IN 4", ""],
                            ["BAGAGEM TT R$", ""], ["OC", ""], ["CHECK IN 1", ""],
                            ["UBER TT R$", ""], ["OC", ""], ["CHECK IN 2", ""],
                            ["EMPRESA LOCAÇÃO", ""], ["TT R$", ""], ["OC", ""], ["CHECK IN", ""],
                            ["PENDÊNCIAS", ""], ["OBSERVAÇÕES", ""],
                          ].map(([label, kind], i) => (
                            <th
                              key={i}
                              className={`px-2 py-1.5 text-left font-medium border-r border-b border-border whitespace-nowrap ${kind === "sticky-first" ? "sticky left-0 z-20 bg-muted/95 min-w-[160px]" : ""}`}
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((r: any) => {
                          const t = r.ticket || {};
                          const a = r.accommodation || {};
                          return (
                            <tr key={r.teamInclusionId} className="border-b hover:bg-muted/20 group" data-testid={`row-${r.teamInclusionId}`}>
                              {/* sticky name */}
                              <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-2 py-1.5 font-medium border-r border-border/40 min-w-[160px]">
                                <div className="truncate" title={r.collaborator.fullName}>{r.collaborator.fullName}</div>
                                <div className="text-[10px] text-muted-foreground">{genderLabel[r.collaborator.gender || "unknown"]} · {r.collaborator.state || "—"}</div>
                              </td>
                              {/* department */}
                              <EditableCell rowId={r.teamInclusionId} field="function.area" value={r.function.area} type="text" onSave={saveCell} />
                              {/* schedule */}
                              <EditableCell rowId={r.teamInclusionId} field="schedule.startDate" value={r.schedule.startDate} type="date" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="schedule.departureDate" value={r.schedule.flightDepartureDate} type="date" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="schedule.endDate" value={r.schedule.endDate} type="date" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="schedule.returnDate" value={r.schedule.flightReturnDate} type="date" onSave={saveCell} />
                              {/* ticket */}
                              <EditableCell rowId={r.teamInclusionId} field="ticket.value" value={t.value} type="money" onSave={saveCell} align="right" />
                              <EditableCell rowId={r.teamInclusionId} field="ticket.departureAirport" value={t.departureAirport} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="ticket.actualDepartureTime" value={t.actualDepartureTime} type="time" onSave={saveCell} align="center" />
                              <EditableCell rowId={r.teamInclusionId} field="ticket.actualReturnTime" value={t.actualReturnTime} type="time" onSave={saveCell} align="center" />
                              <EditableCell rowId={r.teamInclusionId} field="ticket.returnOriginAirport" value={t.returnOriginAirport} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="ticket.locator" value={t.locator} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="ticket.ticketCompany" value={t.ticketCompany} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="ticket.purchaseOrderNumber" value={t.purchaseOrderNumber} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="ticket.checkIn3" value={t.checkIn3} type="text" onSave={saveCell} align="center" />
                              {/* hotel */}
                              <EditableCell rowId={r.teamInclusionId} field="accommodation.nightsCount" value={a.nightsCount} type="int" onSave={saveCell} align="center" />
                              <EditableCell rowId={r.teamInclusionId} field="accommodation.roomType" value={a.roomType} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="accommodation.dailyRate" value={a.dailyRate} type="money" onSave={saveCell} align="right" />
                              <EditableCell rowId={r.teamInclusionId} field="accommodation.lateCheckout" value={a.lateCheckout} type="bool" onSave={saveCell} align="center" />
                              <EditableCell rowId={r.teamInclusionId} field="accommodation.totalCents" value={a.totalCents} type="money" onSave={saveCell} align="right" />
                              <EditableCell rowId={r.teamInclusionId} field="accommodation.hotelName" value={a.hotelName} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="accommodation.paymentCompany" value={a.paymentCompany} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="accommodation.hotelOc" value={a.hotelOc} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="accommodation.checkIn4" value={a.checkIn4} type="text" onSave={saveCell} align="center" />
                              {/* baggage */}
                              <EditableCell rowId={r.teamInclusionId} field="baggage.amountCents" value={r.baggage.extraCents} type="money" onSave={saveCell} align="right" />
                              <EditableCell rowId={r.teamInclusionId} field="baggage.oc" value={r.baggage.oc} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="baggage.checkIn" value={r.baggage.checkIn} type="text" onSave={saveCell} align="center" />
                              {/* uber */}
                              <EditableCell rowId={r.teamInclusionId} field="uber.amountCents" value={r.uber.totalCents} type="money" onSave={saveCell} align="right" />
                              <EditableCell rowId={r.teamInclusionId} field="uber.oc" value={r.uber.oc} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="uber.checkIn" value={r.uber.checkIn} type="text" onSave={saveCell} align="center" />
                              {/* car rental */}
                              <EditableCell rowId={r.teamInclusionId} field="carRental.company" value={r.carRental.company} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="carRental.amountCents" value={r.carRental.totalCents} type="money" onSave={saveCell} align="right" />
                              <EditableCell rowId={r.teamInclusionId} field="carRental.oc" value={r.carRental.oc} type="text" onSave={saveCell} />
                              <EditableCell rowId={r.teamInclusionId} field="carRental.checkIn" value={r.carRental.checkIn} type="text" onSave={saveCell} align="center" />
                              {/* pendencies (read only) */}
                              <ReadCell>
                                {r.pendencies.length === 0 ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : (
                                  <div className="flex flex-col gap-0.5 min-w-[140px]">
                                    {r.pendencies.map((p: string, i: number) => (
                                      <Badge key={i} variant="outline" className="text-[9px] border-amber-400 text-amber-700 dark:text-amber-400 w-fit">{p}</Badge>
                                    ))}
                                  </div>
                                )}
                              </ReadCell>
                              {/* internal notes */}
                              <EditableCell rowId={r.teamInclusionId} field="observations" value={r.observations} type="text" onSave={saveCell} />
                            </tr>
                          );
                        })}
                        {data.rows.length === 0 && (
                          <tr><td colSpan={36} className="p-8 text-center text-muted-foreground">Nenhum colaborador escalado neste evento.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Totals footer */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Subtotais por Departamento</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 border-y">
                        <tr className="text-left">
                          <th className="p-2 font-medium">Departamento</th>
                          <th className="p-2 font-medium text-right">Passagem</th>
                          <th className="p-2 font-medium text-right">Hotelaria</th>
                          <th className="p-2 font-medium text-right">Bag.</th>
                          <th className="p-2 font-medium text-right">Uber</th>
                          <th className="p-2 font-medium text-right">Locação</th>
                          <th className="p-2 font-medium text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(totals.byDepartment || []).map((d: any) => (
                          <tr key={d.name} className="border-b last:border-0">
                            <td className="p-2 capitalize">{d.name}</td>
                            <td className="p-2 text-right tabular-nums">{brl(d.tickets)}</td>
                            <td className="p-2 text-right tabular-nums">{brl(d.hotel)}</td>
                            <td className="p-2 text-right tabular-nums">{brl(d.baggage)}</td>
                            <td className="p-2 text-right tabular-nums">{brl(d.uber)}</td>
                            <td className="p-2 text-right tabular-nums">{brl(d.carRental)}</td>
                            <td className="p-2 text-right tabular-nums font-semibold">{brl(d.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Totais Gerais</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    <TotalLine label="Total Hotelaria" value={brl(totals.hotel)} />
                    <TotalLine label="Total Passagem" value={brl(totals.tickets)} />
                    <TotalLine label="Total Bagagem Extra" value={brl(totals.baggage)} />
                    <TotalLine label="Total Uber" value={brl(totals.uber)} />
                    <TotalLine label="Total Locação" value={brl(totals.carRental)} />
                    <div className="border-t pt-1.5 mt-1.5">
                      <TotalLine label="Total Geral" value={brl(totals.grand)} bold />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Room groups */}
            <TabsContent value="rooms" className="space-y-3">
              {data.roomGroups.length === 0 && (
                <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma sugestão de quarto. Clique em "Recalcular sugestões".</CardContent></Card>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.roomGroups.map((g: any) => (
                  <Card key={g.id} className={g.confirmed ? "border-green-400" : "border-dashed"} data-testid={`room-${g.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span className="flex items-center gap-2"><BedDouble className="h-4 w-4" /> {g.roomType || "quarto"}</span>
                        {g.confirmed ? <Badge className="bg-green-600">Confirmado</Badge> : <Badge variant="outline">Sugestão</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <div className="text-muted-foreground">{g.hotelName || "Hotel a definir"}</div>
                      <div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> {fmtDate(g.checkInDate)} → {fmtDate(g.checkOutDate)}</div>
                      <div className="flex items-center gap-1"><Users className="h-3 w-3" /> {g.members.length} hóspede(s)</div>
                      {!g.confirmed && (
                        <Button size="sm" className="w-full mt-2" onClick={() => confirmRoomMutation.mutate(g.id)} disabled={confirmRoomMutation.isPending} data-testid={`confirm-room-${g.id}`}>
                          <CheckCheck className="h-3 w-3 mr-1" /> Confirmar
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Uber groups */}
            <TabsContent value="uber" className="space-y-3">
              {data.uberGroups.length === 0 && (
                <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma sugestão de Uber. Clique em "Recalcular sugestões".</CardContent></Card>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.uberGroups.map((g: any) => (
                  <Card key={g.id} className={g.confirmed ? "border-green-400" : "border-dashed"} data-testid={`uber-${g.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span className="flex items-center gap-2"><Car className="h-4 w-4" /> {g.direction === "ida" ? "Ida" : "Volta"}</span>
                        {g.confirmed ? <Badge className="bg-green-600">Confirmado</Badge> : <Badge variant="outline">Sugestão</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" /> {g.origin || "?"} → {g.destination || "?"}</div>
                      <div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> {fmtDate(g.date)} {g.time || ""}</div>
                      <div className="flex items-center gap-1"><Users className="h-3 w-3" /> {g.members.length} passageiro(s)</div>
                      {!g.confirmed && (
                        <Button size="sm" className="w-full mt-2" onClick={() => confirmUberMutation.mutate(g.id)} disabled={confirmUberMutation.isPending} data-testid={`confirm-uber-${g.id}`}>
                          <CheckCheck className="h-3 w-3 mr-1" /> Confirmar
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary bg-primary/5" : ""}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-base font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function TotalLine({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-bold text-base" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
