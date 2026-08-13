import { useState, useRef, useEffect, useMemo, useDeferredValue } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import EventCombobox from "@/components/ui/event-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { EditDrawer } from "@/components/operational-mirror-drawers";
import {
  RefreshCw, FileSpreadsheet, AlertTriangle, Plane, BedDouble, Luggage, Car,
  CheckCircle2, Users, Loader2, CheckCheck, MapPin, Clock, Check, MapPinned, CalendarDays,
  SlidersHorizontal, Columns3, Pencil, ChevronDown, ChevronRight, Search, X, LayoutGrid,
  Table2, Building2, Rows3, AlignJustify, Filter, Eraser, UserRound, ChevronUp, ChevronsUpDown,
} from "lucide-react";

function brl(cents: number | null | undefined): string {
  if (!cents) return "R$ 0,00";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return String(d);
}
const genderLabel: Record<string, string> = { male: "M", female: "F", unknown: "?" };

type CellType = "text" | "money" | "date" | "time" | "int" | "bool";

// ---- pendency categories -> matcher ----
const PEND_CATS: { key: string; label: string; match: (p: string) => boolean }[] = [
  { key: "passagem", label: "Sem passagem", match: (p) => p === "Sem passagem" },
  { key: "hospedagem", label: "Sem hospedagem", match: (p) => p === "Sem hospedagem" },
  { key: "oc", label: "Sem OC", match: (p) => /sem OC/i.test(p) },
  { key: "localizador", label: "Sem localizador", match: (p) => /localizador/i.test(p) },
  { key: "genero", label: "Sem gênero", match: (p) => /(gênero|sexo)/i.test(p) },
  { key: "voucher", label: "Sem voucher/anexo", match: (p) => /(voucher|anexo)/i.test(p) },
  { key: "reserva", label: "Sem reserva", match: (p) => /reserva/i.test(p) },
  { key: "data", label: "Divergência de data", match: (p) => /(≠|diverg)/i.test(p) },
];

// ============ Editable inline cell ============
type CellVariant = "mono" | "oc" | "checkin" | "room";

// Rótulo humano para leitores de tela e tooltips. O `field` é um caminho
// técnico ("accommodation.dailyRate") — anunciar isso em voz alta é pior do
// que não anunciar nada.
const GRUPO_CAMPO: Record<string, string> = {
  schedule: "Período", ticket: "Passagem", accommodation: "Hospedagem",
  uber: "Transporte por app", baggage: "Bagagem", carRental: "Locação de carro",
};
const NOME_CAMPO: Record<string, string> = {
  startDate: "data de início", endDate: "data de término",
  departureDate: "data de ida", returnDate: "data de volta",
  actualDepartureTime: "horário de ida", actualReturnTime: "horário de volta",
  departureAirport: "aeroporto de origem", returnOriginAirport: "aeroporto de retorno",
  locator: "localizador", purchaseOrderNumber: "número da OC", oc: "número da OC",
  hotelOc: "OC do hotel", ticketCompany: "companhia", company: "empresa",
  hotelName: "nome do hotel", roomType: "tipo de quarto", nightsCount: "número de diárias",
  dailyRate: "valor da diária", totalCents: "valor total", amountCents: "valor",
  value: "valor", paymentCompany: "empresa pagadora", lateCheckout: "late checkout",
  checkIn: "check-in", checkIn3: "check-in", checkIn4: "check-in",
  observations: "observações",
};
function rotuloCampo(field: string): string {
  const partes = field.split(".");
  const nome = NOME_CAMPO[partes[partes.length - 1]] ?? partes[partes.length - 1];
  const grupo = partes.length > 1 ? GRUPO_CAMPO[partes[0]] : undefined;
  return grupo ? `${grupo} — ${nome}` : nome;
}
function EditableCell({
  rowId, field, value, type, onSave, align = "left", compact, onEdit, editMode = true, variant,
}: {
  rowId: string; field: string; value: any; type: CellType;
  onSave: (rowId: string, field: string, value: any) => Promise<void>;
  align?: "left" | "right" | "center"; compact?: boolean; onEdit?: () => void;
  editMode?: boolean; variant?: CellVariant;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Fonte da verdade síncrona de "ainda estou editando". Enter chama commit() e a
  // remoção do input pode disparar o blur em seguida — sem esta trava a célula era
  // gravada duas vezes. Também substitui o antigo cancelledRef, que ficava preso em
  // true quando o blur não vinha depois do Esc e engolia silenciosamente a edição seguinte.
  const editingRef = useRef(false);

  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);

  function toDraft() {
    if (value === null || value === undefined) return "";
    if (type === "money") return ((value as number) / 100).toString();
    return String(value);
  }
  function display(): React.ReactNode {
    if (type === "bool") return value ? <Check className="h-3.5 w-3.5 text-green-600 mx-auto" /> : <span className="text-muted-foreground/40">—</span>;
    if (value === null || value === undefined || value === "") return <span className="text-muted-foreground/30">—</span>;
    if (type === "money") return brl(value as number);
    if (type === "date") return fmtDate(value as string);
    const s = String(value);
    if (variant === "mono") return <span className="font-mono text-[11px] tracking-tight">{s}</span>;
    if (variant === "oc") return <Badge variant="outline" className="font-mono text-[9px] px-1 py-0 font-normal">{s}</Badge>;
    if (variant === "room") return <Badge variant="secondary" className="text-[9px] uppercase px-1 py-0">{s}</Badge>;
    if (variant === "checkin") return <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal border-emerald-300 text-emerald-700 dark:text-emerald-300">{s}</Badge>;
    return s;
  }
  function parseDraft(raw: string): any {
    const t = raw.trim();
    if (t === "") return type === "money" || type === "int" ? null : "";
    if (type === "money") { const n = parseFloat(t.replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : null; }
    if (type === "int") { const n = parseInt(t, 10); return Number.isFinite(n) ? n : null; }
    return t;
  }
  function startEdit() { setDraft(toDraft()); editingRef.current = true; setEditing(true); }
  function cancelEdit() { editingRef.current = false; setEditing(false); }
  async function commit() {
    if (!editingRef.current) return; // já comitado (Enter) ou cancelado (Esc)
    editingRef.current = false;
    setEditing(false);
    const next = parseDraft(draft);
    const prev = type === "money" || type === "int" ? (value ?? null) : (value ?? "");
    if (String(next) === String(prev)) return;
    setState("saving");
    // O toast de erro vem de saveCell (uma instância de useToast para a tela inteira);
    // aqui só marcamos a célula em vermelho.
    try { await onSave(rowId, field, next); setState("saved"); setTimeout(() => setState((s) => s === "saved" ? "idle" : s), 1200); }
    catch { setState("error"); setTimeout(() => setState((s) => s === "error" ? "idle" : s), 2000); }
  }
  async function toggleBool() {
    if (state === "saving") return; // evita duplo clique enquanto a gravação está em voo
    setState("saving");
    try { await onSave(rowId, field, !value); setState("saved"); setTimeout(() => setState((s) => s === "saved" ? "idle" : s), 1200); }
    catch { setState("error"); setTimeout(() => setState((s) => s === "error" ? "idle" : s), 2000); }
  }
  const pad = compact ? "px-2 py-1" : "px-2 py-1.5";
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const ring = state === "saving" ? "bg-blue-50/60 dark:bg-blue-950/30"
    : state === "saved" ? "bg-green-50/60 dark:bg-green-950/30"
    : state === "error" ? "ring-1 ring-inset ring-red-400 bg-red-50/60 dark:bg-red-950/30" : "";

  if (!editMode) {
    return (
      <td className={`border-r border-border/30 ${pad} text-xs whitespace-nowrap ${alignCls} ${align !== "left" ? "tabular-nums" : ""}`}>
        <span className="truncate inline-block max-w-[180px] align-middle">{display()}</span>
      </td>
    );
  }
  if (type === "bool") {
    return (
      <td className={`p-0 border-r border-border/30 ${ring}`}>
        <button type="button" onClick={toggleBool} disabled={state === "saving"}
          role="switch" aria-checked={!!value} aria-label={rotuloCampo(field)}
          className={`w-full h-full ${pad} hover:bg-muted/50 transition-colors flex items-center justify-center disabled:cursor-wait`}>
          {state === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : display()}
        </button>
      </td>
    );
  }
  if (editing) {
    const inputType = type === "date" ? "date" : type === "money" || type === "int" ? "number" : type === "time" ? "time" : "text";
    return (
      <td className={`p-0 border-r border-border/30 ${ring}`}>
        <input ref={inputRef} type={inputType} step={type === "money" ? "0.01" : undefined} defaultValue={draft} aria-label={rotuloCampo(field)}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { e.preventDefault(); cancelEdit(); } }}
          className={`w-full min-w-[68px] ${pad} text-xs bg-background outline-none ring-1 ring-inset ring-primary rounded-sm ${alignCls}`} />
      </td>
    );
  }
  return (
    <td className={`p-0 border-r border-border/30 relative group/cell ${ring}`}>
      {/* Sem aria-label aqui de propósito: o nome acessível do botão é o próprio
          valor da célula, que é o que interessa ouvir. */}
      <button type="button" onClick={startEdit} title={`Editar ${rotuloCampo(field)}`}
        className={`w-full h-full ${pad} ${onEdit ? "pr-6" : ""} text-xs hover:bg-muted/50 transition-colors whitespace-nowrap ${align !== "left" ? "tabular-nums" : ""} flex items-center gap-1 ${align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"}`}>
        {state === "saving" && <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />}
        {state === "saved" && <Check className="h-3 w-3 text-green-600 shrink-0" />}
        <span className="truncate max-w-[180px]">{display()}</span>
      </button>
      {onEdit && (
        <button type="button" onClick={onEdit} title="Editar em detalhe" aria-label="Editar em detalhe"
          className="opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100 transition-opacity absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded bg-background border shadow-sm hover:bg-muted">
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </td>
  );
}

const G = {
  schedule: "bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-900",
  ticket: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-900",
  hotel: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900",
  baggage: "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900",
  uber: "bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-800 dark:text-fuchsia-200 border-fuchsia-200 dark:border-fuchsia-900",
  car: "bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-900",
  pend: "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-900",
};

type Block = "passagem" | "hospedagem" | "bagagem" | "uber" | "locacao" | "pendencias";
const ALL_BLOCKS: { key: Block; label: string }[] = [
  { key: "passagem", label: "Passagem" },
  { key: "hospedagem", label: "Hospedagem" },
  { key: "bagagem", label: "Bagagem Extra" },
  { key: "uber", label: "Uber" },
  { key: "locacao", label: "Locação de Carro" },
  { key: "pendencias", label: "Pendências" },
];

const VIEWS = [
  { key: "grade", label: "Grade Operacional", icon: Table2 },
  { key: "colaboradores", label: "Colaboradores", icon: UserRound },
  { key: "departamentos", label: "Departamentos", icon: Building2 },
  { key: "quartos", label: "Quartos", icon: BedDouble },
  { key: "uber", label: "Uber", icon: Car },
] as const;
type ViewKey = typeof VIEWS[number]["key"];

const LS_KEY = "operational-mirror-prefs-v1";

export default function OperationalMirror() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const search = useSearch();
  const initialEventId = new URLSearchParams(search).get("eventId") || "";
  const [eventId, setEventId] = useState(initialEventId);

  const [view, setView] = useState<ViewKey>("grade");
  const [editMode, setEditMode] = useState(true);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [searchText, setSearchText] = useState("");
  // A grade tem ~36 colunas por linha: refiltrar e re-renderizar tudo a cada tecla
  // travava a digitação. O campo responde na hora; a grade acompanha logo atrás.
  const deferredSearch = useDeferredValue(searchText);
  const [deptFilter, setDeptFilter] = useState("all");
  const [hotelFilter, setHotelFilter] = useState("all");
  const [pendCat, setPendCat] = useState<string | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<{ key: "nome" | "departamento" | null; dir: "asc" | "desc" }>({ key: null, dir: "asc" });
  const [hiddenBlocks, setHiddenBlocks] = useState<Set<Block>>(new Set());
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<{ kind: "ticket" | "accommodation" | "extras" | null; rowId: string | null; name?: string; source: any }>({ kind: null, rowId: null, source: null });

  // persist prefs
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.density) setDensity(p.density);
        if (typeof p.editMode === "boolean") setEditMode(p.editMode);
        if (p.hiddenBlocks) setHiddenBlocks(new Set(p.hiddenBlocks));
        if (p.view) setView(p.view);
        if (p.deptFilter) setDeptFilter(p.deptFilter);
        if (p.hotelFilter) setHotelFilter(p.hotelFilter);
        if (p.flags) setFlags(p.flags);
        if (p.sort) setSort(p.sort);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ density, editMode, hiddenBlocks: Array.from(hiddenBlocks), view, deptFilter, hotelFilter, flags, sort })); } catch {}
  }, [density, editMode, hiddenBlocks, view, deptFilter, hotelFilter, flags, sort]);

  const { data: events } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const mirrorKey = ["/api/events", eventId, "operational-mirror"];
  const { data, isLoading, isError, error } = useQuery<any>({ queryKey: mirrorKey, enabled: !!eventId && eventId !== "all" });

  function saveErrorMessage(err: any, fallback: string) {
    if (err?.status === 401) return "Sua sessão expirou. Entre novamente para continuar editando.";
    if (err?.status === 403) return "Você não tem permissão para editar este registro.";
    return err?.body?.message || fallback;
  }

  async function saveCell(rowId: string, field: string, value: any) {
    try {
      await apiRequest("PATCH", `/api/events/${eventId}/operational-mirror/rows/${rowId}`, { field, value });
    } catch (err: any) {
      // A célula só piscava em vermelho por 2s e o erro morria aqui.
      toast({
        title: "Não foi possível salvar",
        description: saveErrorMessage(err, "A alteração não foi gravada. Verifique sua conexão e tente novamente."),
        variant: "destructive",
      });
      throw err; // mantém o destaque de erro na célula
    }
    await queryClient.invalidateQueries({ queryKey: mirrorKey });
  }

  async function saveMany(rowId: string, changes: Record<string, any>) {
    // Sequencial de propósito: o servidor faz "busca a linha; se não existir, insere" a
    // cada campo. Em paralelo, dois campos do mesmo bloco liam "não existe" ao mesmo tempo
    // e criavam linhas duplicadas de hospedagem/passagem/custo extra (custo somado em dobro).
    try {
      for (const [field, value] of Object.entries(changes)) {
        await apiRequest("PATCH", `/api/events/${eventId}/operational-mirror/rows/${rowId}`, { field, value });
      }
    } finally {
      // Mesmo com falha no meio do caminho, parte dos campos pode ter sido gravada.
      await queryClient.invalidateQueries({ queryKey: mirrorKey });
    }
  }

  const recalcMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/events/${eventId}/recalculate-logistics-suggestions`)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: mirrorKey }); toast({ title: "Sugestões recalculadas", description: "Grupos confirmados foram preservados." }); },
    onError: (err: any) => toast({
      title: "Erro ao recalcular",
      description: saveErrorMessage(err, "Não foi possível recalcular as sugestões."),
      variant: "destructive",
    }),
  });
  const confirmRoomMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/hotel-room-groups/${id}/confirm`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: mirrorKey }); toast({ title: "Quarto confirmado" }); },
    onError: (err: any) => toast({
      title: "Não foi possível confirmar o quarto",
      description: saveErrorMessage(err, "Tente novamente em instantes."),
      variant: "destructive",
    }),
  });
  const confirmUberMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/uber-groups/${id}/confirm`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: mirrorKey }); toast({ title: "Uber confirmado" }); },
    onError: (err: any) => toast({
      title: "Não foi possível confirmar o Uber",
      description: saveErrorMessage(err, "Tente novamente em instantes."),
      variant: "destructive",
    }),
  });

  function handleExport() { if (eventId) window.open(`/api/events/${eventId}/operational-mirror/export`, "_blank"); }

  const totals = data?.totals;
  const ev = data?.event;
  const rows: any[] = data?.rows || [];

  const departments = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.function.area || r.function.name || "(sem departamento)"));
    return Array.from(set).sort();
  }, [rows]);

  const hotels = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.accommodation?.hotelName) set.add(r.accommodation.hotelName); });
    return Array.from(set).sort();
  }, [rows]);

  // Conta COLABORADORES, não ocorrências: o chip filtra linhas, e quem tinha
  // "Passagem sem OC" + "Hospedagem sem OC" era contado duas vezes — o número do
  // chip nunca batia com a quantidade de linhas exibidas ao clicar nele.
  const pendCounts = useMemo(() => {
    const c: Record<string, number> = {};
    PEND_CATS.forEach((cat) => { c[cat.key] = 0; });
    rows.forEach((r) => {
      PEND_CATS.forEach((cat) => {
        if (r.pendencies.some((p: string) => cat.match(p))) c[cat.key]++;
      });
    });
    return c;
  }, [rows]);

  const filteredRows = useMemo(() => {
    // Constantes calculadas UMA vez: antes, toLowerCase() da busca e o PEND_CATS.find()
    // rodavam a cada linha, a cada tecla digitada.
    const q = deferredSearch.trim().toLowerCase();
    const activeCat = pendCat ? PEND_CATS.find((c) => c.key === pendCat) : undefined;
    const out = rows.filter((r) => {
      if (q && !r.collaborator.fullName.toLowerCase().includes(q)) return false;
      const dept = r.function.area || r.function.name || "(sem departamento)";
      if (deptFilter !== "all" && dept !== deptFilter) return false;
      if (hotelFilter !== "all" && r.accommodation?.hotelName !== hotelFilter) return false;
      if (activeCat && !r.pendencies.some((p: string) => activeCat.match(p))) return false;
      if (flags.comPendencia && r.pendencies.length === 0) return false;
      if (flags.semPassagem && r.ticket) return false;
      if (flags.semHospedagem && r.accommodation) return false;
      if (flags.semLocalizador && r.ticket?.locator) return false;
      if (flags.semOc && r.ticket?.purchaseOrderNumber) return false;
      if (flags.comBagagem && !(r.baggage?.extraCents > 0)) return false;
      if (flags.comUber && !(r.uber?.totalCents > 0)) return false;
      if (flags.comLocacao && !(r.carRental?.totalCents > 0)) return false;
      if (flags.sugQuarto && !r.suggestedRoomGroupId) return false;
      if (flags.sugUber && !r.uber.suggestedGroupId) return false;
      return true;
    });
    if (sort.key) {
      const get = (r: any) => sort.key === "nome" ? r.collaborator.fullName : (r.function.area || r.function.name || "");
      out.sort((a, b) => String(get(a)).localeCompare(String(get(b)), "pt-BR"));
      if (sort.dir === "desc") out.reverse();
    }
    return out;
  }, [rows, deferredSearch, deptFilter, hotelFilter, pendCat, flags, sort]);

  const activeFilterCount = (searchText ? 1 : 0) + (deptFilter !== "all" ? 1 : 0) + (hotelFilter !== "all" ? 1 : 0) + (pendCat ? 1 : 0) + Object.values(flags).filter(Boolean).length;
  function clearFilters() { setSearchText(""); setDeptFilter("all"); setHotelFilter("all"); setPendCat(null); setFlags({}); }
  function toggleSort(key: "nome" | "departamento") { setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }); }

  // Uma falha de rede/sessão deixava a tela em branco abaixo do seletor, como se o
  // evento não tivesse dados. Agora a causa é dita em voz alta.
  const loadErrorMessage = (() => {
    if (!isError) return null;
    const err = error as any;
    if (err?.status === 401) return "Sua sessão expirou. Entre novamente para ver o espelho operacional.";
    if (err?.status === 403) return "Você não tem permissão para consultar o espelho deste evento.";
    return err?.body?.message || "Não foi possível carregar o espelho operacional. Verifique sua conexão e tente novamente.";
  })();

  const emptyMessage = activeFilterCount > 0
    ? "Nenhum colaborador corresponde aos filtros aplicados."
    : "Nenhum colaborador escalado neste evento.";

  function openDrawer(kind: "ticket" | "accommodation" | "extras", r: any) {
    const source = kind === "ticket" ? r.ticket : kind === "accommodation" ? r.accommodation : r;
    setDrawer({ kind, rowId: r.teamInclusionId, name: r.collaborator.fullName, source });
  }

  const compact = density === "compact";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-6 space-y-5 max-w-[1600px] mx-auto" data-testid="page-operational-mirror">
        {/* ===== HEADER ===== */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><LayoutGrid className="h-5 w-5" /></span>
              Espelho Operacional do Evento
            </h1>
            <p className="text-sm text-muted-foreground">Gestão logística completa — passagem, hospedagem, bagagem, Uber e locação por colaborador.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={editMode ? "default" : "outline"} size="sm" onClick={() => setEditMode((v) => !v)} data-testid="button-edit-mode">
              <Pencil className="h-4 w-4 mr-2" /> {editMode ? "Modo edição: ON" : "Modo edição: OFF"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => recalcMutation.mutate()} disabled={!eventId || recalcMutation.isPending} data-testid="button-recalc">
              {recalcMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Recalcular sugestões
            </Button>
            {/* Filters */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-filters">
                  <SlidersHorizontal className="h-4 w-4 mr-2" /> Filtros
                  {activeFilterCount > 0 && <Badge className="ml-2 h-5 px-1.5">{activeFilterCount}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" /> Filtros</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters}><Eraser className="h-3 w-3 mr-1" /> Limpar</Button>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Departamento</Label>
                    <Select value={deptFilter} onValueChange={setDeptFilter}>
                      <SelectTrigger className="mt-1 h-8" aria-label="Filtrar por departamento"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {departments.map((d) => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {hotels.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Hotel</Label>
                      <Select value={hotelFilter} onValueChange={setHotelFilter}>
                        <SelectTrigger className="mt-1 h-8" aria-label="Filtrar por hotel"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {hotels.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Separator />
                  {[
                    ["comPendencia", "Com pendência"], ["semPassagem", "Sem passagem"], ["semHospedagem", "Sem hospedagem"],
                    ["semLocalizador", "Sem localizador"], ["semOc", "Sem OC"], ["comBagagem", "Com bagagem"],
                    ["comUber", "Com Uber"], ["comLocacao", "Com locação"], ["sugQuarto", "Tem sugestão de quarto"], ["sugUber", "Tem sugestão de Uber"],
                  ].map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={!!flags[k]} onCheckedChange={(v) => setFlags((f) => ({ ...f, [k]: !!v }))} />
                      {label}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {/* Columns */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-columns"><Columns3 className="h-4 w-4 mr-2" /> Colunas</Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="end">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Mostrar blocos</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setHiddenBlocks(new Set())}>Padrão</Button>
                  </div>
                  {ALL_BLOCKS.map((b) => (
                    <label key={b.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={!hiddenBlocks.has(b.key)} onCheckedChange={(v) => setHiddenBlocks((s) => { const n = new Set(s); if (v) n.delete(b.key); else n.add(b.key); return n; })} />
                      {b.label}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button size="sm" onClick={handleExport} disabled={!eventId} data-testid="button-export">
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar Excel
            </Button>
          </div>
        </div>

        <div className="max-w-md">
          <EventCombobox events={events} value={eventId} onValueChange={setEventId} placeholder="Selecione um evento" showAllOption={false} />
        </div>

        {!eventId && <Card><CardContent className="py-16 text-center text-muted-foreground">Selecione um evento para visualizar o espelho operacional.</CardContent></Card>}
        {eventId && isLoading && <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...</div>}
        {eventId && !isLoading && loadErrorMessage && (
          <Card className="border-destructive/50" role="alert">
            <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <p className="font-medium">Não foi possível carregar o espelho operacional</p>
              <p className="text-sm text-muted-foreground max-w-md">{loadErrorMessage}</p>
            </CardContent>
          </Card>
        )}

        {eventId && !isLoading && !loadErrorMessage && data && (
          <>
            {/* ===== EVENT INFO CARDS ===== */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <InfoCard icon={<MapPinned className="h-4 w-4" />} label="Evento / Projeto" value={ev.name} />
              <InfoCard icon={<MapPin className="h-4 w-4" />} label="Endereço" value={ev.location || "—"} />
              <InfoCard icon={<CalendarDays className="h-4 w-4" />} label="Data" value={`${fmtDate(ev.startDate)}${ev.endDate ? " → " + fmtDate(ev.endDate) : ""}`} />
              <InfoCard icon={<Users className="h-4 w-4" />} label="Colaboradores" value={String(rows.length)} />
              <InfoCard icon={<Clock className="h-4 w-4" />} label="Período geral" value={`${fmtDate(ev.startDate)} – ${fmtDate(ev.endDate)}`} />
            </div>

            {/* ===== INDICATOR CARDS ===== */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard icon={<Plane className="h-4 w-4" />} tone="indigo" label="Passagens" value={brl(totals.tickets)} hint="Total em voos" />
              <KpiCard icon={<BedDouble className="h-4 w-4" />} tone="emerald" label="Hotelaria" value={brl(totals.hotel)} hint="Diárias + hotel" />
              <KpiCard icon={<Luggage className="h-4 w-4" />} tone="amber" label="Bagagem" value={brl(totals.baggage)} hint="Bagagem extra" />
              <KpiCard icon={<Car className="h-4 w-4" />} tone="fuchsia" label="Uber" value={brl(totals.uber)} hint="Transporte" />
              <KpiCard icon={<Car className="h-4 w-4" />} tone="orange" label="Locação" value={brl(totals.carRental)} hint="Carros" />
              <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} tone="primary" label="Total Geral" value={brl(totals.grand)} hint="Soma de tudo" highlight />
            </div>

            {/* ===== PENDENCY BAR ===== */}
            <Card className="border-amber-200 dark:border-amber-900/60">
              <CardContent className="py-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 mr-2">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${data.pendingCount > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" : "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"}`}>
                    {data.pendingCount > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  </span>
                  <span className="text-sm font-medium">{data.pendingCount > 0 ? `${data.pendingCount} pendência(s)` : "Sem pendências"}</span>
                </div>
                {PEND_CATS.filter((c) => pendCounts[c.key] > 0).map((c) => (
                  <button key={c.key} onClick={() => setPendCat(pendCat === c.key ? null : c.key)} data-testid={`chip-${c.key}`}
                    aria-pressed={pendCat === c.key}
                    title={`${c.label}: ${pendCounts[c.key]} colaborador(es). Clique para filtrar.`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${pendCat === c.key ? "bg-amber-500 border-amber-500 text-white" : "border-amber-300 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"}`}>
                    {c.label} <span className="font-semibold">{pendCounts[c.key]}</span>
                  </button>
                ))}
                {pendCat && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs ml-auto" onClick={() => setPendCat(null)}><X className="h-3 w-3 mr-1" /> Limpar filtro</Button>}
              </CardContent>
            </Card>

            {/* ===== VIEW SWITCHER + DENSITY + SEARCH ===== */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg border bg-card p-1">
                {VIEWS.map((v) => {
                  const Icon = v.icon;
                  const count = v.key === "quartos" ? data.roomGroups.length : v.key === "uber" ? data.uberGroups.length : v.key === "departamentos" ? departments.length : undefined;
                  return (
                    <button key={v.key} onClick={() => setView(v.key)} data-testid={`view-${v.key}`}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === v.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                      <Icon className="h-4 w-4" /> {v.label}
                      {count !== undefined && <span className={`ml-1 rounded-full px-1.5 text-[10px] ${view === v.key ? "bg-primary-foreground/20" : "bg-muted-foreground/15"}`}>{count}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Buscar colaborador..." aria-label="Buscar colaborador pelo nome" className="pl-8 h-9 w-52" data-testid="input-search" />
                </div>
                {view === "grade" && (
                  <ToggleGroup type="single" value={density} onValueChange={(v) => v && setDensity(v as any)} className="border rounded-md">
                    <ToggleGroupItem value="comfortable" className="h-9 px-2.5" title="Confortável"><Rows3 className="h-4 w-4" /></ToggleGroupItem>
                    <ToggleGroupItem value="compact" className="h-9 px-2.5" title="Compacta"><AlignJustify className="h-4 w-4" /></ToggleGroupItem>
                  </ToggleGroup>
                )}
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Mostrando {filteredRows.length} de {rows.length} colaboradores</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearFilters}><Eraser className="h-3 w-3 mr-1" /> Limpar filtros</Button>
              </div>
            )}

            {/* ===== VIEWS ===== */}
            {view === "grade" && <GradeView rows={filteredRows} hiddenBlocks={hiddenBlocks} compact={compact} saveCell={saveCell} openDrawer={openDrawer} totals={totals} sort={sort} onSort={toggleSort} editMode={editMode} emptyMessage={emptyMessage} />}
            {view === "colaboradores" && <ColaboradoresView rows={filteredRows} openDrawer={openDrawer} emptyMessage={emptyMessage} />}
            {view === "departamentos" && <DepartamentosView rows={filteredRows} totals={totals} collapsed={collapsedDepts} setCollapsed={setCollapsedDepts} openDrawer={openDrawer} emptyMessage={emptyMessage} />}
            {view === "quartos" && <QuartosView groups={data.roomGroups} onConfirm={(id: string) => confirmRoomMutation.mutate(id)} pendingId={confirmRoomMutation.isPending ? confirmRoomMutation.variables : null} />}
            {view === "uber" && <UberView groups={data.uberGroups} onConfirm={(id: string) => confirmUberMutation.mutate(id)} pendingId={confirmUberMutation.isPending ? confirmUberMutation.variables : null} />}
          </>
        )}

        <EditDrawer open={!!drawer.kind} onOpenChange={(o) => !o && setDrawer({ kind: null, rowId: null, source: null })}
          kind={drawer.kind} rowId={drawer.rowId} rowName={drawer.name} source={drawer.source} onSaveMany={saveMany} />
      </div>
    </TooltipProvider>
  );
}

// ============ GRADE VIEW ============
function GradeView({ rows, hiddenBlocks, compact, saveCell, openDrawer, totals, sort, onSort, editMode, emptyMessage }: any) {
  const show = (b: Block) => !hiddenBlocks.has(b);
  const headPad = compact ? "px-2 py-1" : "px-2 py-1.5";
  const sortIcon = (key: string) => sort?.key === key ? (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  return (
    <>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[70vh]">
            <table className="text-xs border-collapse w-full" data-testid="operational-grid">
              <thead>
                <tr>
                  <th colSpan={2} className="sticky left-0 top-0 z-40 bg-muted px-2 py-1.5 text-left font-semibold border-r border-b border-border">Colaborador</th>
                  <th colSpan={4} className={`${G.schedule} border ${headPad} text-center font-bold sticky top-0 z-30`}>Período de Escala</th>
                  {show("passagem") && <th colSpan={9} className={`${G.ticket} border ${headPad} text-center font-bold sticky top-0 z-30`}>Passagem</th>}
                  {show("hospedagem") && <th colSpan={9} className={`${G.hotel} border ${headPad} text-center font-bold sticky top-0 z-30`}>Hospedagem</th>}
                  {show("bagagem") && <th colSpan={3} className={`${G.baggage} border ${headPad} text-center font-bold sticky top-0 z-30`}>Bagagem Extra</th>}
                  {show("uber") && <th colSpan={3} className={`${G.uber} border ${headPad} text-center font-bold sticky top-0 z-30`}>Uber</th>}
                  {show("locacao") && <th colSpan={4} className={`${G.car} border ${headPad} text-center font-bold sticky top-0 z-30`}>Locação de Carro</th>}
                  {show("pendencias") && <th colSpan={2} className={`${G.pend} border ${headPad} text-center font-bold sticky top-0 z-30`}>Pendências</th>}
                </tr>
                <tr className="bg-muted/70">
                  <th className={`sticky left-0 top-[33px] z-40 bg-muted ${headPad} text-left font-medium border-r border-b border-border min-w-[150px]`}>
                    <button type="button" onClick={() => onSort("nome")} aria-label="Ordenar por nome" className="flex items-center gap-1 hover:text-foreground">Nome {sortIcon("nome")}</button>
                  </th>
                  <th className={`sticky left-[150px] top-[33px] z-40 bg-muted ${headPad} text-left font-medium border-r border-b border-border min-w-[120px]`}>
                    <button type="button" onClick={() => onSort("departamento")} aria-label="Ordenar por departamento" className="flex items-center gap-1 hover:text-foreground">Departamento {sortIcon("departamento")}</button>
                  </th>
                  {["Início", "Data Ida", "Término", "Data Volta"].map((h) => <ColHead key={h} pad={headPad}>{h}</ColHead>)}
                  {show("passagem") && <>
                    <ColHead pad={headPad}>Passagens R$</ColHead><ColHead pad={headPad}>Aero Ida</ColHead><ColHead pad={headPad}>HR Ida</ColHead><ColHead pad={headPad}>HR Volta</ColHead>
                    <ColHead pad={headPad}>Aero Volta</ColHead><ColHead pad={headPad}>Localizador</ColHead><ColHead pad={headPad}>Empresa</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Check-in 3</ColHead>
                  </>}
                  {show("hospedagem") && <>
                    <ColHead pad={headPad}>Diárias</ColHead><ColHead pad={headPad}>Quarto</ColHead><ColHead pad={headPad}>R$ Diária</ColHead><ColHead pad={headPad}>Late C/Out</ColHead>
                    <ColHead pad={headPad}>Hotel R$</ColHead><ColHead pad={headPad}>Hotel</ColHead><ColHead pad={headPad}>Empresa Pgto</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Check-in 4</ColHead>
                  </>}
                  {show("bagagem") && <><ColHead pad={headPad}>Bagagem R$</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Check-in 1</ColHead></>}
                  {show("uber") && <><ColHead pad={headPad}>Uber R$</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Check-in 2</ColHead></>}
                  {show("locacao") && <><ColHead pad={headPad}>Empresa</ColHead><ColHead pad={headPad}>R$</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Check-in</ColHead></>}
                  {show("pendencias") && <><ColHead pad={headPad}>Pendências</ColHead><ColHead pad={headPad}>Observações</ColHead></>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, idx: number) => {
                  const t = r.ticket || {}; const a = r.accommodation || {};
                  const zebra = idx % 2 === 1 ? "bg-muted/20" : "";
                  return (
                    <tr key={r.teamInclusionId} className={`border-b hover:bg-primary/[0.04] group ${zebra}`} data-testid={`row-${r.teamInclusionId}`}>
                      <td className={`sticky left-0 z-20 ${idx % 2 ? "bg-[hsl(var(--muted))]" : "bg-card"} group-hover:bg-muted px-2 py-1 font-medium border-r border-border/40 min-w-[150px]`}>
                        <Tooltip><TooltipTrigger asChild><div className="truncate max-w-[140px]">{r.collaborator.fullName}</div></TooltipTrigger><TooltipContent>{r.collaborator.fullName}</TooltipContent></Tooltip>
                        <div className="text-[10px] text-muted-foreground">{genderLabel[r.collaborator.gender || "unknown"]} · {r.collaborator.state || "—"}</div>
                      </td>
                      <td className={`sticky left-[150px] z-20 ${idx % 2 ? "bg-[hsl(var(--muted))]" : "bg-card"} group-hover:bg-muted px-2 py-1 border-r border-border/40 min-w-[120px] capitalize`}>{r.function.area || r.function.name || "—"}</td>
                      <EditableCell rowId={r.teamInclusionId} field="schedule.startDate" value={r.schedule.startDate} type="date" onSave={saveCell} compact={compact} editMode={editMode} />
                      <EditableCell rowId={r.teamInclusionId} field="schedule.departureDate" value={r.schedule.flightDepartureDate} type="date" onSave={saveCell} compact={compact} editMode={editMode} />
                      <EditableCell rowId={r.teamInclusionId} field="schedule.endDate" value={r.schedule.endDate} type="date" onSave={saveCell} compact={compact} editMode={editMode} />
                      <EditableCell rowId={r.teamInclusionId} field="schedule.returnDate" value={r.schedule.flightReturnDate} type="date" onSave={saveCell} compact={compact} editMode={editMode} />
                      {show("passagem") && <>
                        <EditableCell rowId={r.teamInclusionId} field="ticket.value" value={t.value} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" onEdit={() => openDrawer("ticket", r)} />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.departureAirport" value={t.departureAirport} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.actualDepartureTime" value={t.actualDepartureTime} type="time" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.actualReturnTime" value={t.actualReturnTime} type="time" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.returnOriginAirport" value={t.returnOriginAirport} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.locator" value={t.locator} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="mono" />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.ticketCompany" value={t.ticketCompany} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.purchaseOrderNumber" value={t.purchaseOrderNumber} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.checkIn3" value={t.checkIn3} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
                      </>}
                      {show("hospedagem") && <>
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.nightsCount" value={a.nightsCount} type="int" onSave={saveCell} compact={compact} editMode={editMode} align="center" onEdit={() => openDrawer("accommodation", r)} />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.roomType" value={a.roomType} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="room" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.dailyRate" value={a.dailyRate} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.lateCheckout" value={a.lateCheckout} type="bool" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.totalCents" value={a.totalCents} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.hotelName" value={a.hotelName} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.paymentCompany" value={a.paymentCompany} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.hotelOc" value={a.hotelOc} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.checkIn4" value={a.checkIn4} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
                      </>}
                      {show("bagagem") && <>
                        <EditableCell rowId={r.teamInclusionId} field="baggage.amountCents" value={r.baggage.extraCents} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" />
                        <EditableCell rowId={r.teamInclusionId} field="baggage.oc" value={r.baggage.oc} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
                        <EditableCell rowId={r.teamInclusionId} field="baggage.checkIn" value={r.baggage.checkIn} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
                      </>}
                      {show("uber") && <>
                        <EditableCell rowId={r.teamInclusionId} field="uber.amountCents" value={r.uber.totalCents} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" />
                        <EditableCell rowId={r.teamInclusionId} field="uber.oc" value={r.uber.oc} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
                        <EditableCell rowId={r.teamInclusionId} field="uber.checkIn" value={r.uber.checkIn} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
                      </>}
                      {show("locacao") && <>
                        <EditableCell rowId={r.teamInclusionId} field="carRental.company" value={r.carRental.company} type="text" onSave={saveCell} compact={compact} editMode={editMode} onEdit={() => openDrawer("extras", r)} />
                        <EditableCell rowId={r.teamInclusionId} field="carRental.amountCents" value={r.carRental.totalCents} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" />
                        <EditableCell rowId={r.teamInclusionId} field="carRental.oc" value={r.carRental.oc} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
                        <EditableCell rowId={r.teamInclusionId} field="carRental.checkIn" value={r.carRental.checkIn} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
                      </>}
                      {show("pendencias") && <>
                        <td className="px-2 py-1 border-r border-border/30">
                          {r.pendencies.length === 0 ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : (
                            <div className="flex flex-col gap-0.5 min-w-[130px]">{r.pendencies.map((p: string, i: number) => <Badge key={i} variant="outline" className="text-[9px] border-amber-400 text-amber-700 dark:text-amber-400 w-fit">{p}</Badge>)}</div>
                          )}
                        </td>
                        <EditableCell rowId={r.teamInclusionId} field="observations" value={r.observations} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
                      </>}
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={36} className="p-8 text-center text-muted-foreground">{emptyMessage}</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <FooterTotals totals={totals} />
    </>
  );
}

function ColHead({ children, pad }: { children: React.ReactNode; pad: string }) {
  return <th className={`${pad} text-left font-medium border-r border-b border-border whitespace-nowrap text-muted-foreground sticky top-[33px] z-20 bg-muted`}>{children}</th>;
}

// ============ COLABORADORES VIEW ============
function ColaboradoresView({ rows, openDrawer, emptyMessage }: any) {
  if (rows.length === 0) return <Card><CardContent className="py-12 text-center text-muted-foreground">{emptyMessage}</CardContent></Card>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {rows.map((r: any) => {
        const t = r.ticket; const a = r.accommodation;
        const hotelTotal = a?.totalCents || (a?.dailyRate || 0) * (a?.nightsCount || 0);
        const indivTotal = (t?.value || 0) + hotelTotal + (r.baggage.extraCents || 0) + (r.uber.totalCents || 0) + (r.carRental.totalCents || 0);
        return (
          <Card key={r.teamInclusionId} className="overflow-hidden hover:shadow-md transition-shadow" data-testid={`collab-card-${r.teamInclusionId}`}>
            <CardHeader className="pb-3 bg-muted/30">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">{r.collaborator.fullName.slice(0, 2).toUpperCase()}</span>
                    {r.collaborator.fullName}
                  </CardTitle>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">{r.function.area || r.function.name || "—"}</Badge>
                    <span>{fmtDate(r.schedule.startDate)} → {fmtDate(r.schedule.endDate)}</span>
                  </div>
                </div>
                {r.pendencies.length > 0 ? <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">{r.pendencies.length} pend.</Badge> : <Badge className="bg-green-600">OK</Badge>}
              </div>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-2 gap-3 text-sm">
              <SummaryBlock icon={<Plane className="h-3.5 w-3.5 text-indigo-500" />} title="Passagem" value={brl(t?.value)} onEdit={() => openDrawer("ticket", r)}
                lines={[t?.locator && `Loc: ${t.locator}`, (t?.departureAirport || t?.returnOriginAirport) && `${t?.departureAirport || "?"} → ${t?.returnOriginAirport || "?"}`, t?.purchaseOrderNumber && `OC: ${t.purchaseOrderNumber}`]} />
              <SummaryBlock icon={<BedDouble className="h-3.5 w-3.5 text-emerald-500" />} title="Hospedagem" value={brl(a?.totalCents || (a?.dailyRate || 0) * (a?.nightsCount || 0))} onEdit={() => openDrawer("accommodation", r)}
                lines={[a?.hotelName, a?.nightsCount && `${a.nightsCount} diária(s)${a.roomType ? " · " + a.roomType : ""}`, a?.hotelOc && `OC: ${a.hotelOc}`]} />
              <SummaryBlock icon={<Luggage className="h-3.5 w-3.5 text-amber-500" />} title="Bagagem" value={brl(r.baggage.extraCents)} onEdit={() => openDrawer("extras", r)} lines={[r.baggage.oc && `OC: ${r.baggage.oc}`, r.baggage.checkIn && `Check-in: ${r.baggage.checkIn}`]} />
              <SummaryBlock icon={<Car className="h-3.5 w-3.5 text-fuchsia-500" />} title="Uber" value={brl(r.uber.totalCents)} onEdit={() => openDrawer("extras", r)} lines={[r.uber.groupName, r.uber.oc && `OC: ${r.uber.oc}`]} />
              <SummaryBlock icon={<Car className="h-3.5 w-3.5 text-orange-500" />} title="Locação" value={brl(r.carRental.totalCents)} onEdit={() => openDrawer("extras", r)} lines={[r.carRental.company, r.carRental.oc && `OC: ${r.carRental.oc}`]} />
              <div className="rounded-lg border bg-muted/20 p-2.5">
                <div className="text-xs text-muted-foreground mb-1">Pendências</div>
                {r.pendencies.length === 0 ? <div className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> Tudo certo</div> :
                  <div className="flex flex-wrap gap-1">{r.pendencies.map((p: string, i: number) => <Badge key={i} variant="outline" className="text-[9px] border-amber-400 text-amber-700 dark:text-amber-400">{p}</Badge>)}</div>}
              </div>
              <div className="col-span-2 flex items-center justify-between border-t pt-3 mt-1">
                <div>
                  <span className="text-xs text-muted-foreground">Total individual</span>
                  <div className="text-lg font-bold tabular-nums">{brl(indivTotal)}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => openDrawer("ticket", r)}><Plane className="h-3 w-3 mr-1" /> Passagem</Button>
                  <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => openDrawer("accommodation", r)}><BedDouble className="h-3 w-3 mr-1" /> Hotel</Button>
                  <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => openDrawer("extras", r)}><Luggage className="h-3 w-3 mr-1" /> Extras</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SummaryBlock({ icon, title, value, lines = [], onEdit }: { icon: React.ReactNode; title: string; value: string; lines?: any[]; onEdit?: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-2.5 group/sb relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {title}</div>
        {onEdit && <button type="button" onClick={onEdit} title={`Editar ${title}`} aria-label={`Editar ${title}`} className="opacity-0 group-hover/sb:opacity-100 focus-visible:opacity-100 transition-opacity h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted"><Pencil className="h-3 w-3" /></button>}
      </div>
      <div className="font-semibold mt-0.5">{value}</div>
      {lines.filter(Boolean).map((l, i) => <div key={i} className="text-[11px] text-muted-foreground truncate">{l}</div>)}
    </div>
  );
}

// ============ DEPARTAMENTOS VIEW ============
function DepartamentosView({ rows, totals, collapsed, setCollapsed, openDrawer, emptyMessage }: any) {
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    rows.forEach((r: any) => { const k = r.function.area || r.function.name || "(sem departamento)"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  // Antes: um .find() linear em byDepartment dentro do map dos grupos (O(n×m)).
  // Map preserva "o primeiro registro vence", igual ao find().
  const deptTotals = useMemo(() => {
    const m = new Map<string, any>();
    (totals?.byDepartment || []).forEach((d: any) => { if (!m.has(d.name)) m.set(d.name, d); });
    return m;
  }, [totals]);
  if (groups.length === 0) return <Card><CardContent className="py-12 text-center text-muted-foreground">{emptyMessage}</CardContent></Card>;
  return (
    <div className="space-y-3">
      {groups.map(([name, members]) => {
        const dt = deptTotals.get(name);
        const isOpen = !collapsed.has(name);
        const subtotal = dt?.total ?? 0;
        const extrasTotal = members.reduce((s: number, r: any) => s + (r.baggage.extraCents || 0) + (r.uber.totalCents || 0) + (r.carRental.totalCents || 0), 0);
        const pendCount = members.reduce((s: number, r: any) => s + r.pendencies.length, 0);
        return (
          <Card key={name} data-testid={`dept-${name}`}>
            <Collapsible open={isOpen} onOpenChange={(o) => setCollapsed((s: Set<string>) => { const n = new Set(s); if (o) n.delete(name); else n.add(name); return n; })}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="font-semibold capitalize">{name}</span>
                    <Badge variant="secondary">{members.length}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {dt && <>
                      <span className="hidden md:inline text-muted-foreground">Passagem {brl(dt.tickets)}</span>
                      <span className="hidden md:inline text-muted-foreground">Hotel {brl(dt.hotel)}</span>
                    </>}
                    <span className="hidden md:inline text-muted-foreground">Extras {brl(extrasTotal)}</span>
                    {pendCount > 0 && <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">{pendCount} pend.</Badge>}
                    <span className="font-bold">{brl(subtotal)}</span>
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Separator />
                <div className="divide-y">
                  {members.map((r: any) => (
                    <div key={r.teamInclusionId} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 text-sm hover:bg-muted/20">
                      <div className="font-medium min-w-[180px] flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">{r.collaborator.fullName.slice(0, 2).toUpperCase()}</span>
                        {r.collaborator.fullName}
                      </div>
                      <span className="text-xs text-muted-foreground">{fmtDate(r.schedule.startDate)} → {fmtDate(r.schedule.endDate)}</span>
                      <span className="flex items-center gap-1 text-xs"><Plane className="h-3 w-3 text-indigo-500" /> {brl(r.ticket?.value)}</span>
                      <span className="flex items-center gap-1 text-xs"><BedDouble className="h-3 w-3 text-emerald-500" /> {brl(r.accommodation?.totalCents || (r.accommodation?.dailyRate || 0) * (r.accommodation?.nightsCount || 0))}</span>
                      <span className="flex items-center gap-1 text-xs"><Luggage className="h-3 w-3 text-amber-500" /> {brl((r.baggage.extraCents || 0) + (r.uber.totalCents || 0) + (r.carRental.totalCents || 0))}</span>
                      {r.pendencies.length > 0 && <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-700 dark:text-amber-400 ml-auto">{r.pendencies.length} pend.</Badge>}
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openDrawer("ticket", r)}><Pencil className="h-3 w-3 mr-1" /> Passagem</Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openDrawer("accommodation", r)}><Pencil className="h-3 w-3 mr-1" /> Hotel</Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openDrawer("extras", r)}><Pencil className="h-3 w-3 mr-1" /> Extras</Button>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
      <FooterTotals totals={totals} />
    </div>
  );
}

// ============ QUARTOS VIEW ============
function QuartosView({ groups, onConfirm, pendingId }: any) {
  if (groups.length === 0) return <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma sugestão de quarto. Clique em "Recalcular sugestões".</CardContent></Card>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {groups.map((g: any) => (
        <Card key={g.id} className={g.confirmed ? "border-green-400" : "border-dashed"} data-testid={`room-${g.id}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2 capitalize"><BedDouble className="h-4 w-4 text-emerald-500" /> {g.roomType || "quarto"}</span>
              {g.confirmed ? <Badge className="bg-green-600">Confirmado</Badge> : <Badge variant="outline">Sugestão</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="text-muted-foreground">{g.hotelName || "Hotel a definir"}</div>
            <div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> {fmtDate(g.checkInDate)} → {fmtDate(g.checkOutDate)}</div>
            <div className="flex items-center gap-1"><Users className="h-3 w-3" /> {g.members.length} hóspede(s)</div>
            <div className="flex flex-wrap gap-1">{g.members.map((m: any, i: number) => <Badge key={i} variant="secondary" className="text-[10px]">{m.fullName || m.name || m}</Badge>)}</div>
            {!g.confirmed && <Button size="sm" className="w-full mt-2" onClick={() => onConfirm(g.id)} disabled={pendingId === g.id} data-testid={`confirm-room-${g.id}`}>
              {pendingId === g.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCheck className="h-3 w-3 mr-1" />} Confirmar
            </Button>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============ UBER VIEW ============
function UberView({ groups, onConfirm, pendingId }: any) {
  if (groups.length === 0) return <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma sugestão de Uber. Clique em "Recalcular sugestões".</CardContent></Card>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {groups.map((g: any) => (
        <Card key={g.id} className={g.confirmed ? "border-green-400" : "border-dashed"} data-testid={`uber-${g.id}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><Car className="h-4 w-4 text-fuchsia-500" /> {g.direction === "ida" ? "Ida" : "Volta"}</span>
              {g.confirmed ? <Badge className="bg-green-600">Confirmado</Badge> : <Badge variant="outline">Sugestão</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" /> {g.origin || "?"} → {g.destination || "?"}</div>
            <div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> {fmtDate(g.date)} {g.time || ""}</div>
            <div className="flex items-center gap-1"><Users className="h-3 w-3" /> {g.members.length} passageiro(s)</div>
            <div className="flex flex-wrap gap-1">{g.members.map((m: any, i: number) => <Badge key={i} variant="secondary" className="text-[10px]">{m.fullName || m.name || m}</Badge>)}</div>
            {!g.confirmed && <Button size="sm" className="w-full mt-2" onClick={() => onConfirm(g.id)} disabled={pendingId === g.id} data-testid={`confirm-uber-${g.id}`}>
              {pendingId === g.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCheck className="h-3 w-3 mr-1" />} Confirmar
            </Button>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============ FOOTER TOTALS ============
function FooterTotals({ totals }: any) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Subtotais por Departamento</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 border-y">
                <tr className="text-left">
                  <th className="p-2 font-medium">Departamento</th><th className="p-2 font-medium text-right">Passagem</th><th className="p-2 font-medium text-right">Hotel</th>
                  <th className="p-2 font-medium text-right">Bag.</th><th className="p-2 font-medium text-right">Uber</th><th className="p-2 font-medium text-right">Locação</th><th className="p-2 font-medium text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(totals.byDepartment || []).map((d: any) => (
                  <tr key={d.name} className="border-b last:border-0">
                    <td className="p-2 capitalize">{d.name}</td>
                    <td className="p-2 text-right tabular-nums">{brl(d.tickets)}</td><td className="p-2 text-right tabular-nums">{brl(d.hotel)}</td>
                    <td className="p-2 text-right tabular-nums">{brl(d.baggage)}</td><td className="p-2 text-right tabular-nums">{brl(d.uber)}</td>
                    <td className="p-2 text-right tabular-nums">{brl(d.carRental)}</td><td className="p-2 text-right tabular-nums font-semibold">{brl(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Totais Gerais</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <TotalLine label="Total Hotelaria" value={brl(totals.hotel)} />
          <TotalLine label="Total Passagens" value={brl(totals.tickets)} />
          <TotalLine label="Total Bagagem Extra" value={brl(totals.baggage)} />
          <TotalLine label="Total Uber" value={brl(totals.uber)} />
          <TotalLine label="Total Locação" value={brl(totals.carRental)} />
          <div className="border-t pt-1.5 mt-1.5"><TotalLine label="Total Geral" value={brl(totals.grand)} bold /></div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="font-semibold mt-1 truncate" title={value}>{value}</div>
    </div>
  );
}

const TONES: Record<string, string> = {
  indigo: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-300",
  emerald: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300",
  amber: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300",
  fuchsia: "text-fuchsia-600 bg-fuchsia-50 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
  orange: "text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-300",
  primary: "text-primary bg-primary/10",
};
function KpiCard({ icon, label, value, hint, tone, highlight }: { icon: React.ReactNode; label: string; value: string; hint: string; tone: string; highlight?: boolean }) {
  return (
    <Card className={`hover:shadow-md transition-all hover:-translate-y-0.5 ${highlight ? "border-primary/50 bg-primary/[0.03]" : ""}`}>
      <CardContent className="p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${TONES[tone]}`}>{icon}</span>
        </div>
        <div className="text-lg font-bold mt-1.5 tabular-nums">{value}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}
function TotalLine({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex items-center justify-between ${bold ? "font-bold text-base" : ""}`}><span className={bold ? "" : "text-muted-foreground"}>{label}</span><span className="tabular-nums">{value}</span></div>;
}
