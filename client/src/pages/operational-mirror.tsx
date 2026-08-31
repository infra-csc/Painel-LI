import { useState, useRef, useEffect, useMemo, useDeferredValue } from "react";
import { useSearch, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import EventCombobox from "@/components/ui/event-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { hasRoleIn, ROLE_GROUPS } from "@shared/roles";
import type { Event } from "@shared/schema";
import {
  hotelTotalCents, isHotelTotalDerived,
  type MirrorRow, type MirrorTotals, type MirrorResponse, type MirrorSubtotal, type RoomGroup, type UberGroup, type MirrorCollaborator,
} from "@shared/operational-mirror-types";
import { estadoDaCelula, etapaCompleta, type ContextoDaLinha, type EstadoCelula } from "@shared/mirror-cell-state";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditDrawer, ROOM_TYPE_OPTIONS, ROOM_TYPE_LABEL, type DrawerKind, type DrawerSource } from "@/components/operational-mirror-drawers";
import {
  RefreshCw, FileSpreadsheet, AlertTriangle, Plane, BedDouble, Luggage, Car,
  CheckCircle2, Users, Loader2, CheckCheck, MapPin, Clock, Check, CalendarDays,
  SlidersHorizontal, Columns3, Pencil, ChevronDown, ChevronRight, Search, X, LayoutGrid,
  Table2, Building2, Rows3, AlignJustify, Filter, Eraser, UserRound, ChevronUp, ChevronsUpDown,
  Lock, ExternalLink, Landmark, Info, FilterX,
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
// Regra de gênero do quarto (hotel_room_groups.gender_rule)
const GENDER_RULE_LABEL: Record<string, string> = { male: "Masculino", female: "Feminino", mixed: "Misto", none: "Misto" };
// Direção do grupo de Uber (uber_groups.direction) — antes tudo que não era "ida" virava "Volta"
const UBER_DIRECTION_LABEL: Record<string, string> = {
  ida: "Ida", volta: "Volta", interno: "Deslocamento interno",
  aeroporto_hotel: "Aeroporto → Hotel", hotel_evento: "Hotel → Evento",
};
function uberDirectionLabel(direction: string | null | undefined): string {
  if (!direction) return "Trajeto";
  return UBER_DIRECTION_LABEL[direction] ?? direction.replace(/_/g, " → ");
}

type CellType = "text" | "money" | "date" | "time" | "int" | "bool" | "select";
/** Valor de uma célula editável, como vem do servidor e como vai no PATCH. */
type CellValue = string | number | boolean | null | undefined;
type SaveCell = (rowId: string, field: string, value: CellValue, anterior?: CellValue) => Promise<void>;

/** Valor de célula em texto curto, para o toast dizer o de/para do que gravou. */
function textoDoValor(v: CellValue): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "marcado" : "desmarcado";
  if (typeof v === "number") return brl(v);
  return String(v);
}
type OpenDrawer = (kind: DrawerKind, r: MirrorRow) => void;
type SortState = { key: "nome" | "departamento" | null; dir: "asc" | "desc" };

// ---- pendency categories -> matcher ----
/**
 * Os nove filtros booleanos, agrupados pelo que respondem (31/08). Eram dez
 * caixas soltas numa coluna: quem procurava "quem está sem OC" lia a lista
 * inteira. Cada um carrega o próprio predicado — é ele que a lista usa para
 * filtrar E para contar quantas pessoas o filtro devolveria.
 */
const GRUPOS_DE_FILTRO: { titulo: string; itens: { key: string; label: string; match: (r: MirrorRow) => boolean }[] }[] = [
  {
    titulo: "Situação",
    itens: [
      { key: "comPendencia", label: "Com pendência", match: (r) => r.pendencies.length > 0 },
      { key: "semPassagem", label: "Sem passagem", match: (r) => !r.ticket },
      { key: "semHospedagem", label: "Sem hospedagem", match: (r) => !r.accommodation },
    ],
  },
  {
    titulo: "Documento",
    itens: [
      { key: "semLocalizador", label: "Sem localizador", match: (r) => !r.ticket?.locator },
      { key: "semOc", label: "Sem OC", match: (r) => !r.ticket?.purchaseOrderNumber },
      { key: "semConferencia", label: "Sem conferência", match: (r) => !(r.ticket?.checkIn3 && r.accommodation?.checkIn4) },
    ],
  },
  {
    titulo: "Extras",
    itens: [
      { key: "comBagagem", label: "Com bagagem", match: (r) => r.baggage.extraCents > 0 },
      { key: "comUber", label: "Com Uber", match: (r) => r.uber.totalCents > 0 },
      { key: "comLocacao", label: "Com locação", match: (r) => r.carRental.totalCents > 0 },
    ],
  },
];

const PEND_CATS: { key: string; label: string; match: (p: string) => boolean }[] = [
  { key: "passagem", label: "Sem passagem", match: (p) => p === "Sem passagem" },
  { key: "hospedagem", label: "Sem hospedagem", match: (p) => p === "Sem hospedagem" },
  { key: "oc", label: "Sem OC", match: (p) => /sem OC/i.test(p) },
  { key: "localizador", label: "Sem localizador", match: (p) => /localizador/i.test(p) },
  { key: "genero", label: "Sem gênero", match: (p) => /^Sem (gênero|sexo)/i.test(p) },
  { key: "voucher", label: "Sem voucher/anexo", match: (p) => /(voucher|anexo)/i.test(p) },
  { key: "reserva", label: "Sem reserva", match: (p) => /sem reserva/i.test(p) },
  { key: "quarto", label: "Impossível sugerir quarto", match: (p) => /sugerir quarto/i.test(p) },
  { key: "uber", label: "Uber sem grupo", match: (p) => /^Uber sem grupo/i.test(p) },
  { key: "data", label: "Divergência de data", match: (p) => /(≠|diverg)/i.test(p) },
];

// Pendências que só se resolvem em outra tela (anexo/voucher/reserva). As telas de
// Hospedagens/Passagens não leem query params, então o link é simples.
function pendencyLink(p: string): { href: string; label: string } | null {
  if (/^Passagem sem voucher/i.test(p)) return { href: "/tickets", label: "Abrir em Passagens" };
  if (/^Hospedagem sem anexo/i.test(p)) return { href: "/accommodations", label: "Abrir em Hospedagens" };
  return null;
}
function PendencyBadge({ p, withLink = true }: { p: string; withLink?: boolean }) {
  const link = withLink ? pendencyLink(p) : null;
  return (
    <span className="inline-flex items-center gap-1 w-fit">
      <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-700 dark:text-amber-400 w-fit">{p}</Badge>
      {link && (
        <Link href={link.href} title={link.label} aria-label={link.label}
          className="inline-flex items-center gap-0.5 text-[9px] text-primary hover:underline whitespace-nowrap">
          <ExternalLink className="h-2.5 w-2.5" /> {link.label}
        </Link>
      )}
    </span>
  );
}

/**
 * Resumo compacto das pendências de uma linha: 1 badge "N pend." que abre um
 * popover com a lista completa. Sem pendências, mostra o check verde.
 */
function PendencyCountBadge({ pendencies, testId }: { pendencies: string[]; testId?: string }) {
  if (pendencies.length === 0) {
    return <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Sem pendências" />;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          aria-label={`${pendencies.length} pendência(s) — ver lista`}
          className="inline-flex items-center rounded-full border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {pendencies.length} pend.
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-xs p-2">
        <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Pendências</p>
        <div className="flex flex-col gap-1">
          {pendencies.map((p, i) => <PendencyBadge key={i} p={p} />)}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
  reservationNumber: "número da reserva", checkInDate: "data de check-in", checkOutDate: "data de check-out",
  checkInTime: "hora de check-in", checkOutTime: "hora de check-out",
  observations: "observações",
};
function rotuloCampo(field: string): string {
  const partes = field.split(".");
  const nome = NOME_CAMPO[partes[partes.length - 1]] ?? partes[partes.length - 1];
  const grupo = partes.length > 1 ? GRUPO_CAMPO[partes[0]] : undefined;
  return grupo ? `${grupo} — ${nome}` : nome;
}
function EditableCell({
  rowId, field, value, type, onSave, align = "left", compact, onEdit, editMode = true, variant, options, etapa, estado = "preenchido", aoConfirmar,
}: {
  rowId: string; field: string; value: CellValue; type: CellType;
  onSave: (rowId: string, field: string, value: CellValue, anterior?: CellValue) => Promise<void>;
  align?: "left" | "right" | "center"; compact?: boolean; onEdit?: () => void;
  editMode?: boolean; variant?: CellVariant;
  /**
   * O que a célula está dizendo (regra em shared/mirror-cell-state.ts): vazio
   * dispensável cala, vazio que Compras precisa fica âmbar, sugestão não
   * confirmada fica violeta.
   */
  estado?: EstadoCelula;
  /** Célula em "a confirmar": clicar leva para a visão que confirma o grupo. */
  aoConfirmar?: () => void;
  /** Primeira coluna de um bloco: ganha a barra colorida que separa as etapas. */
  etapa?: string;
  /** type === "select": opções permitidas */
  options?: { value: string; label: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tdRef = useRef<HTMLTableCellElement | null>(null);
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
    // Sugestão que ninguém confirmou não é dado: dizer isso evita que o valor
    // calculado seja lido como decisão tomada.
    if (estado === "a_confirmar") return <span className="text-violet-700 dark:text-violet-300">a confirmar</span>;
    if (estado === "nao_usa") return <span className="text-muted-foreground">não usa</span>;
    if (type === "bool") return value ? <Check className="h-3.5 w-3.5 text-emerald-700 mx-auto" /> : <span className="text-muted-foreground">·</span>;
    if (value === null || value === undefined || value === "") {
      // "falta preencher" e "não se aplica" tinham o mesmo travessão cinza: a
      // grade não respondia o que ainda precisa ser comprado.
      return estado === "falta"
        ? <span className="font-medium text-amber-800 dark:text-amber-200">preencher</span>
        : <span className="text-muted-foreground">·</span>;
    }
    if (type === "money") return brl(value as number);
    if (type === "date") return fmtDate(value as string);
    const s = type === "select" ? (options?.find((o) => o.value === String(value))?.label ?? String(value)) : String(value);
    // As pílulas saíram (31/08): eram 112 numa tela de 14 linhas — OC e
    // conferência em cada linha —, e pílula é destaque. Nada aqui é destaque.
    if (variant === "mono" || variant === "oc") return <span className="font-mono text-[11px] tracking-tight">{s}</span>;
    if (variant === "checkin") return <span className="text-[11px] text-emerald-700 dark:text-emerald-300">{s}</span>;
    if (variant === "room") return <span className="text-[11px]">{s}</span>;
    return s;
  }
  function parseDraft(raw: string): CellValue {
    const t = raw.trim();
    if (t === "") return type === "money" || type === "int" ? null : "";
    if (type === "money") { const n = parseFloat(t.replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : null; }
    if (type === "int") { const n = parseInt(t, 10); return Number.isFinite(n) ? n : null; }
    return t;
  }
  /**
   * Navegação estilo planilha (28/08). A posição vem do próprio DOM
   * (cellIndex/sectionRowIndex): não há índice para manter em sincronia quando
   * blocos de coluna são escondidos pelo menu "Exibição".
   * Andando na horizontal, pula o que não aceita foco — assim Tab passa reto
   * pelas colunas fixas de nome/departamento e pelo lápis do detalhe.
   */
  function irPara(dLinha: number, dColuna: number) {
    const td = tdRef.current;
    const tr = td?.parentElement as HTMLTableRowElement | null;
    const tbody = tr?.parentElement as HTMLTableSectionElement | null;
    if (!td || !tr || !tbody) return;
    const linha = tbody.rows[tr.sectionRowIndex + dLinha];
    if (!linha) return;
    const passo = dColuna === 0 ? 0 : dColuna > 0 ? 1 : -1;
    let col = td.cellIndex + dColuna;
    while (col >= 0 && col < linha.cells.length) {
      const alvo = linha.cells[col]?.querySelector<HTMLElement>("[data-cell-focus]");
      if (alvo) { alvo.focus(); return; }
      if (passo === 0) return;
      col += passo;
    }
  }
  /**
   * Move depois que o React trocou input por botão (ou vice-versa).
   * setTimeout em vez de requestAnimationFrame: o rAF não roda com a aba em
   * segundo plano, e aí o foco ficaria perdido ao voltar para a tela.
   */
  function irDepois(dLinha: number, dColuna: number) {
    setTimeout(() => irPara(dLinha, dColuna), 0);
  }
  function focarPropria() {
    setTimeout(() => tdRef.current?.querySelector<HTMLElement>("[data-cell-focus]")?.focus(), 0);
  }

  /** `inicial` vem de quem começou a digitar direto na célula, como no Excel. */
  function startEdit(inicial?: string) { setDraft(inicial ?? toDraft()); editingRef.current = true; setEditing(true); }

  /** Teclas com a célula selecionada (sem estar editando). */
  function teclasNaCelula(e: React.KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case "ArrowRight": e.preventDefault(); irPara(0, 1); return;
      case "ArrowLeft": e.preventDefault(); irPara(0, -1); return;
      case "ArrowDown": e.preventDefault(); irPara(1, 0); return;
      case "ArrowUp": e.preventDefault(); irPara(-1, 0); return;
      case "Tab": e.preventDefault(); irPara(0, e.shiftKey ? -1 : 1); return;
      case "Enter":
      case "F2": e.preventDefault(); if (type !== "bool") startEdit(); return;
      default: {
        // Digitar direto substitui o valor, como numa planilha.
        if (type === "bool" || e.key.length !== 1) return;
        // Numa célula de número, uma letra digitada por engano abriria o campo
        // vazio (o input de number recusa o caractere) e o Enter seguinte
        // apagaria o valor que já estava lá. Letra não abre a edição.
        const numerica = type === "money" || type === "int";
        if (numerica && !/[0-9,.-]/.test(e.key)) return;
        e.preventDefault();
        startEdit(e.key);
      }
    }
  }

  /** Teclas com o campo aberto: confirma e já anda para a próxima célula. */
  function teclasNoCampo(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commit(); irDepois(e.shiftKey ? -1 : 1, 0); return; }
    if (e.key === "Tab") { e.preventDefault(); commit(); irDepois(0, e.shiftKey ? -1 : 1); return; }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); focarPropria(); }
  }
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
    try { await onSave(rowId, field, next, prev as CellValue); setState("saved"); setTimeout(() => setState((s) => s === "saved" ? "idle" : s), 1200); }
    catch { setState("error"); setTimeout(() => setState((s) => s === "error" ? "idle" : s), 2000); }
  }
  async function toggleBool() {
    if (state === "saving") return; // evita duplo clique enquanto a gravação está em voo
    setState("saving");
    try { await onSave(rowId, field, !value, value); setState("saved"); setTimeout(() => setState((s) => s === "saved" ? "idle" : s), 1200); }
    catch { setState("error"); setTimeout(() => setState((s) => s === "error" ? "idle" : s), 2000); }
  }
  const pad = compact ? "px-2 py-1" : "px-2 py-1.5";
  // Barra vertical colorida no começo de cada etapa: é o que faz a pessoa
  // enxergar onde termina "Passagem" e começa "Hospedagem" numa grade de ~36
  // colunas, em vez de um mar de células iguais.
  const div = etapa ? `border-l-[3px] ${etapa}` : "";
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const ring = state === "saving" ? "bg-blue-50/60 dark:bg-blue-950/30"
    : state === "saved" ? "bg-green-50/60 dark:bg-green-950/30"
    : state === "error" ? "ring-1 ring-inset ring-red-400 bg-red-50/60 dark:bg-red-950/30"
    // O âmbar é o que faz a grade responder "o que falta comprar" de longe.
    // Só aparece quando o campo é obrigatório PARA ESTA PESSOA — pintar todo
    // vazio deixaria a tela amarela e a cor viraria ruído.
    : estado === "falta" ? "bg-amber-100/70 dark:bg-amber-950/40" : "";

  if (!editMode) {
    return (
      <td ref={tdRef} className={`relative z-0 border-r border-border/30 ${div} ${pad} text-xs whitespace-nowrap ${alignCls} ${align !== "left" ? "tabular-nums" : ""}`}>
        <span className="truncate inline-block max-w-[180px] align-middle">{display()}</span>
      </td>
    );
  }
  if (type === "bool") {
    return (
      <td ref={tdRef} className={`relative z-0 p-0 border-r border-border/30 ${div} ${ring}`}>
        <button type="button" onClick={toggleBool} disabled={state === "saving"}
          /* Fora da ordem de tabulação: quem anda dentro da grade são as setas.
             Ver a "porta de entrada" em GradeView. */
          data-cell-focus tabIndex={-1} onKeyDown={teclasNaCelula}
          role="switch" aria-checked={!!value} aria-label={rotuloCampo(field)}
          className={`w-full h-full ${pad} hover:bg-muted/50 transition-colors flex items-center justify-center disabled:cursor-wait`}>
          {state === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : display()}
        </button>
      </td>
    );
  }
  if (editing && type === "select") {
    // <select> nativo: cabe na célula e fecha no blur/Esc como o input de texto.
    return (
      <td ref={tdRef} className={`relative z-0 p-0 border-r border-border/30 ${div} ${ring}`}>
        <select autoFocus defaultValue={draft} aria-label={rotuloCampo(field)}
          onChange={(e) => { setDraft(e.target.value); }}
          onBlur={commit}
          onKeyDown={teclasNoCampo}
          className={`w-full min-w-[80px] ${pad} text-xs bg-background outline-none ring-1 ring-inset ring-primary rounded-sm`}>
          <option value="">—</option>
          {(options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
    );
  }
  if (editing) {
    const inputType = type === "date" ? "date" : type === "money" || type === "int" ? "number" : type === "time" ? "time" : "text";
    return (
      <td ref={tdRef} className={`relative z-0 p-0 border-r border-border/30 ${div} ${ring}`}>
        <input ref={inputRef} type={inputType} step={type === "money" ? "0.01" : undefined} defaultValue={draft} aria-label={rotuloCampo(field)}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={teclasNoCampo}
          className={`w-full min-w-[68px] ${pad} text-xs bg-background outline-none ring-1 ring-inset ring-primary rounded-sm ${alignCls}`} />
      </td>
    );
  }
  return (
    <td ref={tdRef} className={`p-0 border-r border-border/30 ${div} relative z-0 group/cell ${ring}`}>
      {/* Sem aria-label aqui de propósito: o nome acessível do botão é o próprio
          valor da célula, que é o que interessa ouvir. */}
      <button
        type="button"
        // Editar aqui seria digitar por cima de uma sugestão que ninguém
        // aprovou: o clique leva para a visão onde ela se confirma.
        onClick={estado === "a_confirmar" && aoConfirmar ? aoConfirmar : () => startEdit()}
        onKeyDown={teclasNaCelula} data-cell-focus tabIndex={-1}
        title={estado === "a_confirmar" && aoConfirmar ? "Sugestão ainda não confirmada — abrir para confirmar" : `Editar ${rotuloCampo(field)}`}
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

/** Barra que abre cada etapa — mesma família de cor do cabeçalho do bloco. */
const BARRA = {
  schedule: "border-l-sky-300 dark:border-l-sky-800",
  ticket: "border-l-indigo-300 dark:border-l-indigo-800",
  hotel: "border-l-emerald-300 dark:border-l-emerald-800",
  baggage: "border-l-amber-300 dark:border-l-amber-800",
  uber: "border-l-fuchsia-300 dark:border-l-fuchsia-800",
  car: "border-l-orange-300 dark:border-l-orange-800",
  pend: "border-l-rose-300 dark:border-l-rose-800",
};

type Block = "passagem" | "hospedagem" | "bagagem" | "uber" | "locacao" | "pendencias";
const ALL_BLOCKS: { key: Block; label: string; colunas: number; ponto: string }[] = [
  { key: "passagem", label: "Passagem", colunas: 9, ponto: "bg-indigo-500" },
  { key: "hospedagem", label: "Hospedagem", colunas: 12, ponto: "bg-emerald-500" },
  { key: "bagagem", label: "Bagagem Extra", colunas: 3, ponto: "bg-amber-500" },
  { key: "uber", label: "Uber", colunas: 3, ponto: "bg-fuchsia-500" },
  { key: "locacao", label: "Locação de Carro", colunas: 4, ponto: "bg-orange-500" },
  { key: "pendencias", label: "Pendências", colunas: 2, ponto: "bg-rose-500" },
];

const VIEWS = [
  { key: "grade", label: "Grade Operacional", icon: Table2 },
  { key: "colaboradores", label: "Colaboradores", icon: UserRound },
  { key: "departamentos", label: "Departamentos", icon: Building2 },
  { key: "quartos", label: "Quartos", icon: BedDouble },
  { key: "uber", label: "Uber", icon: Car },
  { key: "rateio", label: "Rateio", icon: Landmark },
] as const;
type ViewKey = typeof VIEWS[number]["key"];

// v2: só preferências de layout (density/hiddenBlocks/view). Filtros, flags e
// ordenação NÃO persistem — eram carregados de um evento para outro e o usuário
// abria o espelho já filtrado sem perceber.
const LS_KEY = "operational-mirror-prefs-v2";

// Abaixo de `md` (768px) a grade de ~36 colunas é inutilizável: a view padrão
// passa a ser "Colaboradores" (cards) e a preferência salva de view é ignorada.
function isNarrowViewport(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 767px)").matches;
}

export default function OperationalMirror() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const search = useSearch();
  const initialEventId = new URLSearchParams(search).get("eventId") || "";
  const [eventId, setEventId] = useState(initialEventId);

  // Espelha requireRoles(LOGISTICA_ROLES) das rotas PATCH/POST do espelho em
  // server/routes.ts — quem não está no grupo só consulta.
  const canEditMirror = hasRoleIn(user?.role, ROLE_GROUPS.logistica);

  const [view, setView] = useState<ViewKey>(() => isNarrowViewport() ? "colaboradores" : "grade");
  const [editModeWanted, setEditModeWanted] = useState(true);
  const editMode = canEditMirror && editModeWanted;
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [searchText, setSearchText] = useState("");
  // A grade tem ~36 colunas por linha: refiltrar e re-renderizar tudo a cada tecla
  // travava a digitação. O campo responde na hora; a grade acompanha logo atrás.
  const deferredSearch = useDeferredValue(searchText);
  const [deptFilter, setDeptFilter] = useState("all");
  const [hotelFilter, setHotelFilter] = useState("all");
  const [pendCat, setPendCat] = useState<string | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [hiddenBlocks, setHiddenBlocks] = useState<Set<Block>>(new Set());
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<{ kind: DrawerKind | null; rowId: string | null; name?: string; source: DrawerSource }>({ kind: null, rowId: null, source: null });

  // persist prefs (só layout)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.density === "comfortable" || p.density === "compact") setDensity(p.density);
        if (Array.isArray(p.hiddenBlocks)) setHiddenBlocks(new Set(p.hiddenBlocks));
        if (!isNarrowViewport() && VIEWS.some((v) => v.key === p.view)) setView(p.view);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ density, hiddenBlocks: Array.from(hiddenBlocks), view })); } catch {}
  }, [density, hiddenBlocks, view]);

  // Trocar de evento zera filtros/flags/ordenação — cada evento começa "limpo".
  useEffect(() => {
    setSearchText(""); setDeptFilter("all"); setHotelFilter("all"); setPendCat(null); setFlags({});
    setSort({ key: null, dir: "asc" }); setCollapsedDepts(new Set());
  }, [eventId]);

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const mirrorKey = ["/api/events", eventId, "operational-mirror"];
  const { data, isLoading, isError, error } = useQuery<MirrorResponse>({ queryKey: mirrorKey, enabled: !!eventId && eventId !== "all" });

  function saveErrorMessage(err: unknown, fallback: string) {
    const e = err as { status?: number; body?: { message?: string } } | null;
    if (e?.status === 401) return "Sua sessão expirou. Entre novamente para continuar editando.";
    if (e?.status === 403) return "Você não tem permissão para editar este registro.";
    return e?.body?.message || fallback;
  }

  /**
   * Grava uma célula.
   *
   * `anterior` é o valor que estava lá: com ele o toast oferece Desfazer. Sem
   * isso, o único retorno de uma gravação era um fundo verde que some em 1,2s —
   * quem digitou no campo errado descobria depois, sem caminho de volta.
   */
  async function saveCell(rowId: string, field: string, value: CellValue, anterior?: CellValue) {
    try {
      await apiRequest("PATCH", `/api/events/${eventId}/operational-mirror/rows/${rowId}`, { field, value });
    } catch (err) {
      // A célula só piscava em vermelho por 2s e o erro morria aqui.
      toast({
        title: "Não foi possível salvar",
        description: saveErrorMessage(err, "A alteração não foi gravada. Verifique sua conexão e tente novamente."),
        variant: "destructive",
      });
      throw err; // mantém o destaque de erro na célula
    }
    await queryClient.invalidateQueries({ queryKey: mirrorKey });
    if (anterior !== undefined) {
      toast({
        title: `${rotuloCampo(field)} salvo`,
        description: `${textoDoValor(anterior)} → ${textoDoValor(value)}`,
        action: (
          <ToastAction altText="Desfazer a alteração" onClick={() => { void saveCell(rowId, field, anterior); }}>
            Desfazer
          </ToastAction>
        ),
      });
    }
  }

  async function saveMany(rowId: string, changes: Record<string, CellValue>) {
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
    onError: (err: unknown) => toast({
      title: "Erro ao recalcular",
      description: saveErrorMessage(err, "Não foi possível recalcular as sugestões."),
      variant: "destructive",
    }),
  });
  const confirmRoomMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/hotel-room-groups/${id}/confirm`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: mirrorKey }); toast({ title: "Quarto confirmado" }); },
    onError: (err: unknown) => toast({
      title: "Não foi possível confirmar o quarto",
      description: saveErrorMessage(err, "Tente novamente em instantes."),
      variant: "destructive",
    }),
  });
  const patchRoomMutation = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/hotel-room-groups/${id}`, campos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mirrorKey }),
    onError: (err: unknown) => toast({
      title: "Não foi possível salvar o quarto",
      description: saveErrorMessage(err, "Tente novamente em instantes."),
      variant: "destructive",
    }),
  });
  const moverMutation = useMutation({
    mutationFn: async ({ tipo, corpo }: { tipo: "quarto" | "uber"; corpo: Record<string, unknown> }) =>
      apiRequest("POST", tipo === "quarto" ? "/api/hotel-room-groups/mover" : "/api/uber-groups/mover", corpo),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: mirrorKey });
      toast({ title: v.tipo === "quarto" ? "Pessoa movida de quarto" : "Pessoa movida de carro" });
    },
    onError: (err: unknown) => toast({
      title: "Não foi possível mover",
      description: saveErrorMessage(err, "Tente novamente em instantes."),
      variant: "destructive",
    }),
  });
  const separarQuartoMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/hotel-room-groups/${id}/separar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mirrorKey });
      toast({ title: "Quarto separado", description: "Cada ocupante ficou com um quarto individual." });
    },
    onError: (err: unknown) => toast({
      title: "Não foi possível separar",
      description: saveErrorMessage(err, "Tente novamente em instantes."),
      variant: "destructive",
    }),
  });
  const patchUberMutation = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/uber-groups/${id}`, campos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mirrorKey }),
    onError: (err: unknown) => toast({
      title: "Não foi possível salvar o carro",
      description: saveErrorMessage(err, "Tente novamente em instantes."),
      variant: "destructive",
    }),
  });
  const confirmUberMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/uber-groups/${id}/confirm`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: mirrorKey }); toast({ title: "Uber confirmado" }); },
    onError: (err: unknown) => toast({
      title: "Não foi possível confirmar o Uber",
      description: saveErrorMessage(err, "Tente novamente em instantes."),
      variant: "destructive",
    }),
  });

  function handleExport() { if (eventId) window.open(`/api/events/${eventId}/operational-mirror/export`, "_blank"); }

  const totals = data?.totals;
  const ev = data?.event;
  const rows: MirrorRow[] = useMemo(() => data?.rows ?? [], [data]);

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
  /** Pessoas com ao menos uma pendência — "30 pendências em 12 pessoas". */
  const pessoasComPendencia = useMemo(() => rows.filter((r) => r.pendencies.length > 0).length, [rows]);
  const pendCounts = useMemo(() => {
    const c: Record<string, number> = {};
    PEND_CATS.forEach((cat) => { c[cat.key] = 0; });
    rows.forEach((r) => {
      PEND_CATS.forEach((cat) => {
        if (r.pendencies.some((p) => cat.match(p))) c[cat.key]++;
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
      if (activeCat && !r.pendencies.some((p) => activeCat.match(p))) return false;
      if (flags.comPendencia && r.pendencies.length === 0) return false;
      if (flags.semPassagem && r.ticket) return false;
      if (flags.semHospedagem && r.accommodation) return false;
      if (flags.semLocalizador && r.ticket?.locator) return false;
      if (flags.semOc && r.ticket?.purchaseOrderNumber) return false;
      if (flags.semConferencia && r.ticket?.checkIn3 && r.accommodation?.checkIn4) return false;
      if (flags.comBagagem && !(r.baggage.extraCents > 0)) return false;
      if (flags.comUber && !(r.uber.totalCents > 0)) return false;
      if (flags.comLocacao && !(r.carRental.totalCents > 0)) return false;
      return true;
    });
    if (sort.key) {
      const get = (r: MirrorRow) => sort.key === "nome" ? r.collaborator.fullName : (r.function.area || r.function.name || "");
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
    const err = error as { status?: number; body?: { message?: string } } | null;
    if (err?.status === 401) return "Sua sessão expirou. Entre novamente para ver o espelho operacional.";
    if (err?.status === 403) return "Você não tem permissão para consultar o espelho deste evento.";
    return err?.body?.message || "Não foi possível carregar o espelho operacional. Verifique sua conexão e tente novamente.";
  })();

  /**
   * Os filtros ativos, escritos. É o que faz "nenhum resultado" deixar de ser
   * um beco sem saída: sem dizer o que está filtrando, quem chega numa lista
   * vazia não sabe o que desfazer.
   */
  const filtrosAtivos = useMemo(() => {
    const nomes: string[] = [];
    if (searchText) nomes.push(`busca "${searchText}"`);
    if (deptFilter !== "all") nomes.push(`departamento ${deptFilter}`);
    if (hotelFilter !== "all") nomes.push(`hotel ${hotelFilter}`);
    if (pendCat) nomes.push(PEND_CATS.find((c) => c.key === pendCat)?.label.toLowerCase() ?? "pendência");
    for (const g of GRUPOS_DE_FILTRO) {
      for (const item of g.itens) if (flags[item.key]) nomes.push(item.label.toLowerCase());
    }
    return nomes;
  }, [searchText, deptFilter, hotelFilter, pendCat, flags]);

  /**
   * Confirmação para o que não tem volta (31/08). Duas ações sobrescreviam
   * trabalho sem perguntar: "Sugestões" refaz agrupamentos e horários por cima
   * de ajustes feitos à mão, e "Separar" muda o custo de hotelaria do evento.
   * O texto diz a CONSEQUÊNCIA — repetir a pergunta no corpo não ajuda a
   * decidir.
   */
  const [confirmar, setConfirmar] = useState<{ titulo: string; texto: string; rotulo: string; destrutivo?: boolean; acao: () => void } | null>(null);

  const emptyMessage = activeFilterCount > 0
    ? "Nenhum colaborador corresponde aos filtros aplicados."
    : "Nenhum colaborador escalado neste evento.";

  const openDrawer: OpenDrawer = (kind, r) => {
    if (!canEditMirror) return; // somente leitura: sem drawer de edição
    const source: DrawerSource = kind === "ticket" ? r.ticket : kind === "accommodation" ? r.accommodation : r;
    setDrawer({ kind, rowId: r.teamInclusionId, name: r.collaborator.fullName, source });
  };

  const compact = density === "compact";
  // Colaboradores por id — os grupos de quarto/Uber vêm do servidor só com collaboratorId.
  const collabById = useMemo(() => {
    const m = new Map<string, MirrorCollaborator>();
    rows.forEach((r) => { if (r.collaborator.id) m.set(r.collaborator.id, r.collaborator); });
    return m;
  }, [rows]);
  // Linhas cujo total de hotel é DERIVADO (diária × diárias, sem totalCents informado).
  const derivedHotelCount = useMemo(() => rows.filter(isHotelTotalDerived).length, [rows]);
  /**
   * Grupos já confirmados por alguém. É o que separa SUGESTAO de DADO na grade:
   * o valor do Uber e o tipo de quarto vinham calculados pelo sistema e eram
   * lidos como decisão tomada. Agora dizem "a confirmar" até alguém confirmar
   * na visão correspondente.
   */
  /**
   * Le um campo da linha pelo caminho usado na grade ("ticket.value"). E o que
   * permite a regra de obrigatoriedade rodar sobre a linha inteira sem
   * reescrever a lista de campos em dois lugares.
   */
  const lerCampo = (r: MirrorRow, campo: string): unknown => {
    const [grupo, chave] = campo.split(".");
    if (!chave) return (r as unknown as Record<string, unknown>)[grupo];
    if (grupo === "schedule") {
      const sc = r.schedule as unknown as Record<string, unknown>;
      // A grade chama de "departureDate"/"returnDate" o que o schedule guarda
      // com o prefixo do voo.
      if (chave === "departureDate") return sc.flightDepartureDate;
      if (chave === "returnDate") return sc.flightReturnDate;
      return sc[chave];
    }
    if (grupo === "baggage" && chave === "amountCents") return r.baggage.extraCents;
    if (grupo === "uber" && chave === "amountCents") return r.uber.totalCents;
    if (grupo === "carRental" && chave === "amountCents") return r.carRental.totalCents;
    const bloco = (r as unknown as Record<string, unknown>)[grupo] as Record<string, unknown> | null;
    return bloco ? bloco[chave] : null;
  };

  const uberConfirmados = useMemo(
    () => new Set((data?.uberGroups ?? []).filter((g) => g.confirmed).map((g) => g.id)),
    [data?.uberGroups],
  );
  const quartosConfirmados = useMemo(
    () => new Set((data?.roomGroups ?? []).filter((g) => g.confirmed).map((g) => g.id)),
    [data?.roomGroups],
  );

  /**
   * As cinco etapas do fechamento. "Prontas" é quantas pessoas têm TODOS os
   * campos obrigatórios daquela etapa preenchidos — não quantas têm o registro
   * criado. É o número que responde "quanto falta para eu comprar".
   */
  const etapasFechamento = useMemo(() => {
    const defs = [
      { chave: "passagem" as const, rotulo: "Passagem", ponto: "bg-indigo-500", valor: totals?.tickets ?? 0 },
      { chave: "hospedagem" as const, rotulo: "Hospedagem", ponto: "bg-emerald-500", valor: totals?.hotel ?? 0 },
      { chave: "bagagem" as const, rotulo: "Bagagem", ponto: "bg-amber-500", valor: totals?.baggage ?? 0 },
      { chave: "uber" as const, rotulo: "Uber", ponto: "bg-fuchsia-500", valor: totals?.uber ?? 0 },
      { chave: "locacao" as const, rotulo: "Locação", ponto: "bg-orange-500", valor: totals?.carRental ?? 0 },
    ];
    return defs.map((d) => {
      let prontas = 0;
      for (const r of rows) {
        const ctx: ContextoDaLinha = {
          temPassagem: !!r.ticket,
          temHotel: !!r.accommodation?.hotelName,
          bagagemCents: r.baggage.extraCents,
          uberCents: r.uber.totalCents,
          locacaoCents: r.carRental.totalCents,
          uberConfirmado: !!r.uber.suggestedGroupId && uberConfirmados.has(r.uber.suggestedGroupId),
          quartoConfirmado: !!r.suggestedRoomGroupId && quartosConfirmados.has(r.suggestedRoomGroupId),
        };
        if (etapaCompleta(d.chave, (campo) => lerCampo(r, campo), ctx)) prontas += 1;
      }
      return { ...d, prontas, faltam: rows.length - prontas };
    });
  }, [rows, totals, uberConfirmados, quartosConfirmados]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-6 space-y-5 max-w-[1600px] mx-auto" data-testid="page-operational-mirror">
        {/* ===== CABEÇALHO ===== */}
        {/* O breadcrumb já diz "Espelho Operacional": o título aqui é curto e
            quem manda no contexto é o EVENTO escolhido. Os cinco cartões de
            informação viraram uma linha de metadados — "Data" e "Período
            geral" eram o mesmo dado em dois cartões, ambos truncados. */}
        <header className="space-y-4">
          {/* Um andar, não três (31/08): eram ~180px antes do primeiro dado —
              o <h1> repetia o breadcrumb, a tagline explicava o que a própria
              grade mostra, e o nome do evento aparecia duas vezes (no seletor e
              na linha de metadados). Ficou o seletor + o que o evento é. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <div className="w-full sm:w-[380px] shrink-0">
              <EventCombobox events={events} value={eventId} onValueChange={setEventId} placeholder="Selecione um evento" showAllOption={false} />
            </div>
            {ev && (
              <>
              {ev.location && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{ev.location}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {fmtDate(ev.startDate)}{ev.endDate ? ` – ${fmtDate(ev.endDate)}` : ""}
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {rows.length} {rows.length === 1 ? "colaborador" : "colaboradores"}
              </span>
              {!canEditMirror && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="mirror-readonly-notice"
                  title="Somente Admin, Compras e Produção editam o espelho.">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Somente leitura
                </span>
              )}
              </>
            )}
            <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
              {canEditMirror && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-flex items-center gap-2 h-9 px-3 rounded-md border bg-card">
                        <Switch id="mirror-edit-mode" checked={editModeWanted} onCheckedChange={setEditModeWanted} data-testid="button-edit-mode" />
                        <Label htmlFor="mirror-edit-mode" className="text-[13px] cursor-pointer flex items-center gap-1.5">
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edição
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Liga a edição direto nas células da grade</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9" onClick={() => setConfirmar({
                          titulo: "Refazer as sugestões deste evento?",
                          texto: "Os agrupamentos e horários voltam a ser calculados a partir dos voos. Quartos e carros já confirmados são preservados — o resto é sobrescrito, inclusive ajustes feitos à mão.",
                          rotulo: "Refazer sugestões",
                          acao: () => recalcMutation.mutate(),
                        })} disabled={recalcMutation.isPending} data-testid="button-recalc">
                        {recalcMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />}
                        {recalcMutation.isPending ? "Recalculando…" : "Refazer sugestões"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Refaz as sugestões de quarto e Uber (grupos confirmados são preservados)</TooltipContent>
                  </Tooltip>
                </>
              )}
              <Button size="sm" className="h-9" onClick={handleExport} data-testid="button-export">
                <FileSpreadsheet className="h-4 w-4 mr-2" aria-hidden="true" /> Exportar planilha
              </Button>
            </div>
          </div>
        </header>

        {!eventId && (
          <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-16 text-center" data-testid="mirror-empty-no-event">
            <span className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-background border">
              <LayoutGrid className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="font-medium">Escolha um evento para começar</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              O espelho reúne, num lugar só, tudo o que a logística precisa acompanhar por colaborador —
              custos, reservas, pendências e as sugestões de quarto e Uber.
            </p>
          </div>
        )}

        {eventId && isLoading && (
          <div className="space-y-4" data-testid="mirror-loading" aria-busy="true" aria-live="polite">
            <div className="h-[76px] rounded-xl border bg-muted/30 animate-pulse" />
            <div className="h-9 w-full max-w-md rounded-lg bg-muted/40 animate-pulse" />
            <div className="rounded-lg border overflow-hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 border-b last:border-0 bg-muted/20 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
              ))}
            </div>
            <span className="sr-only">Carregando o espelho operacional…</span>
          </div>
        )}

        {eventId && !isLoading && loadErrorMessage && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-12 text-center" role="alert" data-testid="mirror-error">
            <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="font-medium">Não foi possível carregar o espelho operacional</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{loadErrorMessage}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => queryClient.invalidateQueries({ queryKey: mirrorKey })}>
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" /> Tentar de novo
            </Button>
          </div>
        )}

        {eventId && !isLoading && !loadErrorMessage && data && ev && totals && (
          <>
            {/* Faixa de fechamento (31/08): eram três blocos empilhados — custo,
                progresso e pendências. O que Compras precisa saber é UMA coisa:
                quanto falta para fechar cada etapa. O contador é quantas pessoas
                estão PRONTAS (todo campo obrigatório preenchido), não quantas
                têm o registro criado — a diferença entre "13 têm hotel" e "9 dá
                para comprar". */}
            <section className="rounded-lg border bg-card overflow-hidden" aria-label="Fechamento do evento">
              <div className="flex flex-col lg:flex-row">
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0">
                  {etapasFechamento.map((e) => (
                    <button
                      key={e.chave}
                      type="button"
                      onClick={() => setView("grade")}
                      title={`${e.rotulo}: ${e.prontas} de ${rows.length} ${rows.length === 1 ? "pessoa pronta" : "pessoas prontas"}`}
                      className="px-3.5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.ponto}`} aria-hidden="true" />
                        {e.rotulo}
                      </span>
                      <span className="mt-1 flex items-baseline gap-1">
                        <span className="text-[19px] font-semibold tabular-nums leading-none tracking-tight">{e.prontas}</span>
                        <span className="text-xs text-muted-foreground">de {rows.length}</span>
                      </span>
                      <span className="mt-1.5 block h-[3px] w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span
                          className={`block h-full rounded-full ${e.faltam ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${rows.length ? Math.round((e.prontas / rows.length) * 100) : 0}%` }}
                        />
                      </span>
                      <span className="mt-1 block text-xs tabular-nums text-muted-foreground">{brl(e.valor)}</span>
                      <span className={`block text-[11px] font-semibold ${e.faltam ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>
                        {e.faltam ? `${e.faltam} a preencher` : "completo"}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="px-4 py-3 bg-muted/30 lg:border-l lg:w-[210px] shrink-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Custo do evento</p>
                  {/* De 26px para 22px e para o fim da faixa: é o maior número
                      da tela e o que Compras menos usa para decidir. */}
                  <p className="mt-1 text-[22px] font-semibold tracking-tight tabular-nums" data-testid="mirror-total-geral">{brl(totals.grand)}</p>
                  {derivedHotelCount > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Inclui {derivedHotelCount} hotel calculado por diária × noites
                    </p>
                  )}
                </div>
              </div>

              {/* Linha de baixo da MESMA faixa (31/08): eram três blocos
                  empilhados — custo, progresso e pendências. Fechar o evento é
                  uma leitura só: o que já está pronto e o que trava. */}
              {(() => {
              const comPendencia = PEND_CATS.filter((c) => (pendCounts[c.key] ?? 0) > 0);
              if (data.pendingCount === 0) {
                return (
                  <div className="flex items-center gap-2 border-t border-emerald-200 bg-emerald-50/50 px-4 py-2.5 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/20" data-testid="mirror-no-pendencies">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                    <span className="font-medium text-emerald-900 dark:text-emerald-200">Nada pendente neste evento.</span>
                    <span className="text-emerald-700/80 dark:text-emerald-300/70">Passagens, hospedagens e documentos estão completos.</span>
                  </div>
                );
              }
              return (
                <div className="border-t border-amber-200 bg-amber-50/60 px-4 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200 mr-1">
                      <AlertTriangle className="h-[15px] w-[15px] text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                      {data.pendingCount} {data.pendingCount === 1 ? "pendência" : "pendências"} em {pessoasComPendencia} {pessoasComPendencia === 1 ? "pessoa" : "pessoas"}
                    </span>
                    {comPendencia.map((c) => {
                      const count = pendCounts[c.key] ?? 0;
                      const active = pendCat === c.key;
                      return (
                        <button key={c.key} type="button" onClick={() => setPendCat(active ? null : c.key)} data-testid={`chip-${c.key}`}
                          aria-pressed={active}
                          title={`${c.label}: ${count} ${count === 1 ? "colaborador" : "colaboradores"}. Clique para filtrar.`}
                          className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                            active
                              ? "border-amber-600 bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100"
                              : "border-amber-300 bg-background text-amber-800 hover:bg-amber-100/60 dark:text-amber-300 dark:hover:bg-amber-950/40"}`}>
                          {c.label}
                          <span className="font-semibold tabular-nums opacity-75">{count}</span>
                        </button>
                      );
                    })}
                    {pendCat && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs ml-auto" onClick={() => setPendCat(null)}>
                        <X className="h-3 w-3 mr-1" aria-hidden="true" /> Limpar filtro
                      </Button>
                    )}
                  </div>
                </div>
              );
              })()}
            </section>

            {/* ===== BARRA DE TRABALHO (fixa no topo ao rolar) ===== */}
            {/* Antes as abas e a busca sumiam ao rolar a grade e o conteúdo
                passava POR CIMA do cabeçalho da página. Agora a barra
                acompanha e tem camada própria. */}
            <div className="sticky top-0 z-50 -mx-6 px-6 py-2.5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border bg-card p-0.5" role="tablist" aria-label="Visões do espelho">
                  {VIEWS.map((v) => {
                    const Icon = v.icon;
                    const count = v.key === "quartos" ? data.roomGroups.length : v.key === "uber" ? data.uberGroups.length : v.key === "departamentos" ? departments.length : undefined;
                    const activo = view === v.key;
                    return (
                      <button key={v.key} onClick={() => setView(v.key)} data-testid={`view-${v.key}`}
                        role="tab" aria-selected={activo}
                        className={`inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          activo ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden md:inline">{v.label}</span>
                        {count !== undefined && count > 0 && (
                          <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${activo ? "bg-primary-foreground/20" : "bg-muted-foreground/15"}`}>{count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="relative w-full sm:w-auto sm:ml-auto order-last sm:order-none">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
                  <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Buscar colaborador…"
                    aria-label="Buscar colaborador pelo nome" className="pl-8 h-9 w-40 lg:w-52" data-testid="input-search" />
                  {searchText && (
                    <button type="button" onClick={() => setSearchText("")} aria-label="Limpar busca"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9" data-testid="button-filters">
                      <SlidersHorizontal className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                      <span className="hidden sm:inline">Filtros</span>
                      {activeFilterCount > 0 && <Badge className="ml-2 h-5 px-1.5 tabular-nums">{activeFilterCount}</Badge>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[560px] max-w-[92vw]" align="end">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" aria-hidden="true" /> Filtros</span>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters}><Eraser className="h-3 w-3 mr-1" aria-hidden="true" /> Limpar</Button>
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
                      {/* Cada filtro diz quantas pessoas ele devolveria ANTES do
                          clique: sem isso, filtrar era às cegas — marcar, ver a
                          lista vazia, desmarcar. */}
                      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
                        {GRUPOS_DE_FILTRO.map((g) => (
                          <div key={g.titulo} className="space-y-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.titulo}</p>
                            {g.itens.map((item) => {
                              const quantas = rows.filter(item.match).length;
                              return (
                                <label key={item.key}
                                  className={`flex h-7 items-center gap-2 rounded px-1 text-[13px] ${quantas === 0 && !flags[item.key] ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-muted/60"}`}>
                                  <Checkbox checked={!!flags[item.key]} disabled={quantas === 0 && !flags[item.key]}
                                    onCheckedChange={(v) => setFlags((f) => ({ ...f, [item.key]: !!v }))} />
                                  <span className="truncate">{item.label}</span>
                                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{quantas}</span>
                                </label>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {view === "grade" && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9" data-testid="button-columns">
                        <Columns3 className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                        <span className="hidden lg:inline">Exibição</span>
                        {hiddenBlocks.size > 0 && (
                          <Badge variant="secondary" className="ml-2 h-5 px-1.5 tabular-nums">
                            {ALL_BLOCKS.length - hiddenBlocks.size} de {ALL_BLOCKS.length}
                          </Badge>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60" align="end">
                      <div className="space-y-3">
                        <div>
                          <span className="text-sm font-semibold">Densidade</span>
                          <ToggleGroup type="single" value={density} onValueChange={(v) => (v === "comfortable" || v === "compact") && setDensity(v)}
                            className="mt-1.5 grid grid-cols-2 gap-1" aria-label="Densidade da grade">
                            <ToggleGroupItem value="comfortable" className="h-8 text-xs gap-1.5" aria-label="Densidade confortável">
                              <Rows3 className="h-3.5 w-3.5" aria-hidden="true" /> Confortável
                            </ToggleGroupItem>
                            <ToggleGroupItem value="compact" className="h-8 text-xs gap-1.5" aria-label="Densidade compacta">
                              <AlignJustify className="h-3.5 w-3.5" aria-hidden="true" /> Compacta
                            </ToggleGroupItem>
                          </ToggleGroup>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">Blocos da grade</span>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setHiddenBlocks(new Set())}>Mostrar tudo</Button>
                        </div>
                        {/* O ponto é a identidade da etapa (a mesma da faixa de
                            fechamento e do cabeçalho da grade) e "N colunas" diz
                            o que se ganha de espaço ao esconder o bloco. */}
                        {ALL_BLOCKS.map((b) => (
                          <label key={b.key} className="flex h-8 items-center gap-2 text-sm cursor-pointer rounded px-1 hover:bg-muted/60">
                            <Checkbox checked={!hiddenBlocks.has(b.key)} onCheckedChange={(v) => setHiddenBlocks((s) => { const n = new Set(s); if (v) n.delete(b.key); else n.add(b.key); return n; })} />
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${b.ponto}`} aria-hidden="true" />
                            <span className="truncate">{b.label}</span>
                            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{b.colunas} colunas</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

              </div>

              {activeFilterCount > 0 && (
                <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                  <span>Mostrando <strong className="text-foreground tabular-nums">{filteredRows.length}</strong> de {rows.length} colaboradores</span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearFilters}>
                    <Eraser className="h-3 w-3 mr-1" aria-hidden="true" /> Limpar filtros
                  </Button>
                </div>
              )}
            </div>

            {!canEditMirror && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5" data-testid="mirror-readonly-hint">
                <Lock className="h-3 w-3" /> Você está consultando o espelho em modo somente leitura — alterações e recálculo de sugestões são feitos por Admin, Compras ou Produção.
              </p>
            )}

            {/* ===== VIEWS ===== */}
            {/* Lista vazia POR FILTRO é outra coisa de lista vazia por não
                haver ninguém escalado — e é a mais frequente das duas. Dizer o
                que está filtrando é o que dá o caminho de volta. */}
            {filteredRows.length === 0 && rows.length > 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/10 px-6 py-14 text-center" data-testid="mirror-sem-resultados">
                <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border bg-background">
                  <FilterX className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </span>
                <p className="font-medium">Nenhuma pessoa com esses filtros</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  {rows.length} {rows.length === 1 ? "pessoa está escalada" : "pessoas estão escaladas"} neste evento, mas nenhuma passa por{" "}
                  {filtrosAtivos.length ? <span className="text-foreground">{filtrosAtivos.join(" · ")}</span> : "os filtros atuais"}.
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                  <Eraser className="h-4 w-4 mr-2" aria-hidden="true" /> Limpar filtros
                </Button>
              </div>
            ) : (
            <>
            {view === "grade" && <GradeView rows={filteredRows} hiddenBlocks={hiddenBlocks} compact={compact} saveCell={saveCell} openDrawer={openDrawer} sort={sort} onSort={toggleSort} editMode={editMode} canEdit={canEditMirror} emptyMessage={emptyMessage} uberConfirmados={uberConfirmados} quartosConfirmados={quartosConfirmados} irParaVisao={setView} />}
            {view === "colaboradores" && <ColaboradoresView rows={filteredRows} openDrawer={openDrawer} canEdit={canEditMirror} emptyMessage={emptyMessage} />}
            {view === "departamentos" && <DepartamentosView rows={filteredRows} totals={totals} collapsed={collapsedDepts} setCollapsed={setCollapsedDepts} openDrawer={openDrawer} canEdit={canEditMirror} emptyMessage={emptyMessage} />}
            {view === "quartos" && <QuartosView groups={data.roomGroups} collabById={collabById} rows={rows} onMover={(c, de, para) => moverMutation.mutate({ tipo: "quarto", corpo: { collaboratorId: c, deGrupoId: de, paraGrupoId: para } })} onSeparar={(id) => setConfirmar({
              titulo: "Separar em quartos individuais?",
              texto: "Cada ocupante passa a ter um quarto próprio. O custo de hotelaria do evento sobe — a diária individual é maior que a compartilhada.",
              rotulo: "Separar",
              acao: () => separarQuartoMutation.mutate(id),
            })} canEdit={canEditMirror} onPatch={(id, campos) => patchRoomMutation.mutate({ id, campos })} onConfirm={(id: string) => confirmRoomMutation.mutate(id)} pendingId={confirmRoomMutation.isPending ? confirmRoomMutation.variables : null} />}
            {view === "uber" && <UberView groups={data.uberGroups} collabById={collabById} rows={rows} onMover={(c, de, para) => moverMutation.mutate({ tipo: "uber", corpo: { collaboratorId: c, deGrupoId: de, paraGrupoId: para } })} canEdit={canEditMirror} onPatch={(id, campos) => patchUberMutation.mutate({ id, campos })} onConfirm={(id: string) => confirmUberMutation.mutate(id)} pendingId={confirmUberMutation.isPending ? confirmUberMutation.variables : null} />}
            {view === "rateio" && <FooterTotals totals={totals} hotelDerived={derivedHotelCount > 0} />}
            </>
            )}
          </>
        )}

        <AlertDialog open={!!confirmar} onOpenChange={(o) => { if (!o) setConfirmar(null); }}>
          <AlertDialogContent className="max-w-[460px]">
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmar?.titulo}</AlertDialogTitle>
              <AlertDialogDescription>{confirmar?.texto}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className={confirmar?.destrutivo ? "bg-red-600 hover:bg-red-700" : undefined}
                onClick={(e) => { e.preventDefault(); confirmar?.acao(); setConfirmar(null); }}
              >
                {confirmar?.rotulo}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <EditDrawer open={!!drawer.kind} onOpenChange={(o) => !o && setDrawer({ kind: null, rowId: null, source: null })}
          kind={drawer.kind} rowId={drawer.rowId} rowName={drawer.name} source={drawer.source} onSaveMany={saveMany} />
      </div>
    </TooltipProvider>
  );
}

// ============ GRADE VIEW ============
interface GradeViewProps {
  rows: MirrorRow[];
  hiddenBlocks: Set<Block>;
  compact: boolean;
  saveCell: SaveCell;
  openDrawer: OpenDrawer;
  sort: SortState;
  onSort: (key: "nome" | "departamento") => void;
  editMode: boolean;
  canEdit: boolean;
  emptyMessage: string;
  /** Ids de grupos já confirmados — separam sugestão de dado na grade. */
  uberConfirmados: Set<string>;
  quartosConfirmados: Set<string>;
  /** Leva para a visao que confirma o grupo (celula em "a confirmar"). */
  irParaVisao: (v: "uber" | "quartos") => void;
}
function GradeView({ rows, hiddenBlocks, compact, saveCell, openDrawer, sort, onSort, editMode, canEdit, emptyMessage, uberConfirmados, quartosConfirmados, irParaVisao }: GradeViewProps) {
  const show = (b: Block) => !hiddenBlocks.has(b);
  /**
   * O que cada linha tem — é daqui que sai a obrigatoriedade condicional de
   * cada célula (shared/mirror-cell-state.ts).
   */
  const ctxDaLinha = (r: MirrorRow): ContextoDaLinha => ({
    temPassagem: !!r.ticket,
    temHotel: !!r.accommodation?.hotelName,
    bagagemCents: r.baggage.extraCents,
    uberCents: r.uber.totalCents,
    locacaoCents: r.carRental.totalCents,
    uberConfirmado: !!r.uber.suggestedGroupId && uberConfirmados.has(r.uber.suggestedGroupId),
    quartoConfirmado: !!r.suggestedRoomGroupId && quartosConfirmados.has(r.suggestedRoomGroupId),
  });
  // "Bater o olho e entender" (pedido do dono): cada etapa diz quantas pessoas
  // já têm aquilo resolvido. Sem isso, saber o que falta exigia percorrer ~36
  // colunas linha a linha.
  const feito = useMemo(() => ({
    passagem: rows.filter((r) => !!r.ticket).length,
    hospedagem: rows.filter((r) => !!r.accommodation).length,
    bagagem: rows.filter((r) => r.baggage.extraCents > 0).length,
    uber: rows.filter((r) => r.uber.totalCents > 0).length,
    locacao: rows.filter((r) => r.carRental.totalCents > 0).length,
  }), [rows]);
  /** Somas por coluna de dinheiro — o que o rodapé da grade mostra. */
  const soma = useMemo(() => {
    const s = { passagem: 0, hotel: 0, bagagem: 0, uber: 0, locacao: 0 };
    for (const r of rows) {
      s.passagem += r.ticket?.value || 0;
      s.hotel += hotelTotalCents(r);
      s.bagagem += r.baggage.extraCents || 0;
      s.uber += r.uber.totalCents || 0;
      s.locacao += r.carRental.totalCents || 0;
    }
    return s;
  }, [rows]);
  /** Quantas colunas estão à vista — a barra de status diz o tamanho da grade. */
  const colunasVisiveis = useMemo(
    () => 6 + (show("passagem") ? 9 : 0) + (show("hospedagem") ? 12 : 0) + (show("bagagem") ? 3 : 0)
      + (show("uber") ? 3 : 0) + (show("locacao") ? 4 : 0) + (show("pendencias") ? 2 : 0),
    [hiddenBlocks], // eslint-disable-line react-hooks/exhaustive-deps
  );
  /**
   * Rola a grade até o começo de um bloco. A conta desconta as duas colunas
   * congeladas (nome e departamento): sem isso o bloco pararia embaixo delas.
   */
  const rolagemRef = useRef<HTMLDivElement | null>(null);
  const irParaBloco = (bloco: Block) => {
    const caixa = rolagemRef.current;
    const alvo = caixa?.querySelector<HTMLElement>(`[data-bloco="${bloco}"]`);
    if (!caixa || !alvo) return;
    const congeladas = caixa.querySelector<HTMLElement>("thead th")?.offsetWidth ?? 330;
    // Salto, sem animação: visto ao vivo, há navegador que ignora rolagem
    // suave — tanto scrollTo({behavior:"smooth"}) quanto scroll-behavior no CSS
    // — e aí o destino simplesmente nunca chegava. Chegar importa mais do que
    // chegar deslizando.
    caixa.scrollLeft = Math.max(0, alvo.offsetLeft - congeladas);
  };

  /**
   * A porta de entrada da grade.
   *
   * Atravessar a grade custava ~540 paradas de Tab (39 colunas × as linhas):
   * ninguém tabula por isso — e quem usa teclado ficava preso. Agora a grade é
   * UMA parada, sempre a primeira célula; dentro dela quem anda são as setas,
   * que já existiam e ninguém via (a barra de status passou a dizer isso).
   */
  const tabelaRef = useRef<HTMLTableElement | null>(null);
  useEffect(() => {
    const tabela = tabelaRef.current;
    if (!tabela) return;
    if (tabela.querySelector('[data-cell-focus][tabindex="0"]')) return;
    const primeira = tabela.querySelector<HTMLElement>("[data-cell-focus]");
    if (primeira) primeira.tabIndex = 0;
  });
  // Lápis "editar em detalhe" só para quem pode abrir o drawer
  const edit = (kind: DrawerKind, r: MirrorRow) => canEdit ? () => openDrawer(kind, r) : undefined;
  const headPad = compact ? "px-2 py-1" : "px-2 py-1.5";
  const sortIcon = (key: string) => sort?.key === key ? (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  return (
    <>
      {/* "Ir para": 39 colunas não cabem na tela, e rolar às cegas até achar
          "Locação" é o custo diário de quem preenche. Cada botão leva o bloco
          para a esquerda da área visível — sem esconder coluna nenhuma. */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ir para</span>
        {ALL_BLOCKS.filter((b) => show(b.key)).map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => irParaBloco(b.key)}
            className="inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${b.ponto}`} aria-hidden="true" />
            {b.label}
          </button>
        ))}
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <div>
          <div ref={rolagemRef} className="overflow-auto max-h-[calc(100vh-250px)] min-h-[280px]">
            <table ref={tabelaRef} className="text-xs border-collapse w-full" data-testid="operational-grid">
              <thead>
                <tr>
                  <th colSpan={2} className="sticky left-0 top-0 z-40 h-8 py-0 leading-none bg-muted px-2 text-left font-semibold border-r border-b border-border">Colaborador</th>
                  <th colSpan={4} className={`${G.schedule} border px-2 py-0 h-8 leading-none text-center font-bold sticky top-0 z-30`}>Período de Escala</th>
                  {show("passagem") && <th data-bloco="passagem" colSpan={9} className={`${G.ticket} border px-2 py-0 h-8 leading-none text-center font-bold sticky top-0 z-30`}><Progresso rotulo="Passagem" feito={feito.passagem} total={rows.length} /></th>}
                  {show("hospedagem") && <th data-bloco="hospedagem" colSpan={12} className={`${G.hotel} border px-2 py-0 h-8 leading-none text-center font-bold sticky top-0 z-30`}><Progresso rotulo="Hospedagem" feito={feito.hospedagem} total={rows.length} /></th>}
                  {show("bagagem") && <th data-bloco="bagagem" colSpan={3} className={`${G.baggage} border px-2 py-0 h-8 leading-none text-center font-bold sticky top-0 z-30`}><Progresso rotulo="Bagagem" feito={feito.bagagem} total={rows.length} /></th>}
                  {show("uber") && <th data-bloco="uber" colSpan={3} className={`${G.uber} border px-2 py-0 h-8 leading-none text-center font-bold sticky top-0 z-30`}><Progresso rotulo="Uber" feito={feito.uber} total={rows.length} /></th>}
                  {show("locacao") && <th data-bloco="locacao" colSpan={4} className={`${G.car} border px-2 py-0 h-8 leading-none text-center font-bold sticky top-0 z-30`}><Progresso rotulo="Locação" feito={feito.locacao} total={rows.length} /></th>}
                  {show("pendencias") && <th data-bloco="pendencias" colSpan={2} className={`${G.pend} border px-2 py-0 h-8 leading-none text-center font-bold sticky top-0 z-30`}>Pendências</th>}
                </tr>
                <tr className="bg-muted/70">
                  <th className={`sticky left-0 top-8 z-40 bg-muted ${headPad} text-left font-medium border-r border-b border-border min-w-[210px]`}>
                    <button type="button" onClick={() => onSort("nome")} aria-label="Ordenar por nome" className="flex items-center gap-1 hover:text-foreground">Nome {sortIcon("nome")}</button>
                  </th>
                  <th className={`sticky left-[210px] top-8 z-40 bg-muted ${headPad} text-left font-medium border-r border-b border-border min-w-[120px]`}>
                    <button type="button" onClick={() => onSort("departamento")} aria-label="Ordenar por departamento" className="flex items-center gap-1 hover:text-foreground">Departamento {sortIcon("departamento")}</button>
                  </th>
                  {["Início", "Data Ida", "Término", "Data Volta"].map((h) => <ColHead key={h} pad={headPad}>{h}</ColHead>)}
                  {show("passagem") && <>
                    <ColHead pad={headPad}>Passagens R$</ColHead><ColHead pad={headPad}>Aero Ida</ColHead><ColHead pad={headPad}>HR Ida</ColHead><ColHead pad={headPad}>HR Volta</ColHead>
                    <ColHead pad={headPad}>Aero Volta</ColHead><ColHead pad={headPad}>Localizador</ColHead><ColHead pad={headPad}>Empresa</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Conferência</ColHead>
                  </>}
                  {show("hospedagem") && <>
                    <ColHead pad={headPad}>Hotel</ColHead><ColHead pad={headPad}>Reserva</ColHead><ColHead pad={headPad}>Check-in</ColHead><ColHead pad={headPad}>Check-out</ColHead>
                    <ColHead pad={headPad}>Diárias</ColHead><ColHead pad={headPad}>Quarto</ColHead><ColHead pad={headPad}>R$ Diária</ColHead><ColHead pad={headPad}>Late C/Out</ColHead>
                    <ColHead pad={headPad}>Hotel R$</ColHead><ColHead pad={headPad}>Empresa Pgto</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Conferência</ColHead>
                  </>}
                  {show("bagagem") && <><ColHead pad={headPad}>Bagagem R$</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Conferência</ColHead></>}
                  {show("uber") && <><ColHead pad={headPad}>Uber R$</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Conferência</ColHead></>}
                  {show("locacao") && <><ColHead pad={headPad}>Empresa</ColHead><ColHead pad={headPad}>R$</ColHead><ColHead pad={headPad}>OC</ColHead><ColHead pad={headPad}>Conferência</ColHead></>}
                  {show("pendencias") && <><ColHead pad={headPad}>Pendências</ColHead><ColHead pad={headPad}>Observações</ColHead></>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const t: Partial<NonNullable<MirrorRow["ticket"]>> = r.ticket || {};
                  const a: Partial<NonNullable<MirrorRow["accommodation"]>> = r.accommodation || {};
                  const ctx = ctxDaLinha(r);
                  const est = (campo: string, valor: unknown) => estadoDaCelula(campo, valor, ctx);
                  return (
                    <tr key={r.teamInclusionId} className="border-b hover:bg-primary/[0.04] group" data-testid={`row-${r.teamInclusionId}`}>
                      <td className={`sticky left-0 z-20 bg-card group-hover:bg-muted px-2 py-1 font-medium border-r border-border/40 min-w-[210px]`}>
                        <Tooltip><TooltipTrigger asChild><div className="truncate max-w-[196px] leading-tight">{r.collaborator.fullName}</div></TooltipTrigger><TooltipContent>{r.collaborator.fullName}</TooltipContent></Tooltip>
                        {/* A segunda linha só existe quando há o que dizer: antes
                            todas as linhas exibiam "? · —" e isso virava ruído. */}
                        {(() => {
                          const g = r.collaborator.gender && r.collaborator.gender !== "unknown" ? genderLabel[r.collaborator.gender] : null;
                          const uf = r.collaborator.state || null;
                          if (!g && !uf) return null;
                          return <div className="text-[10px] text-muted-foreground/70 leading-tight">{[g, uf].filter(Boolean).join(" · ")}</div>;
                        })()}
                      </td>
                      <td className={`sticky left-[210px] z-20 bg-card group-hover:bg-muted px-2 py-1 border-r border-border/40 min-w-[120px] capitalize`}>{r.function.area || r.function.name || "—"}</td>
                      <EditableCell rowId={r.teamInclusionId} field="schedule.startDate" value={r.schedule.startDate} estado={est("schedule.startDate", r.schedule.startDate)} type="date" onSave={saveCell} compact={compact} editMode={editMode} etapa={BARRA.schedule} />
                      <EditableCell rowId={r.teamInclusionId} field="schedule.departureDate" value={r.schedule.flightDepartureDate} estado={est("schedule.departureDate", r.schedule.flightDepartureDate)} type="date" onSave={saveCell} compact={compact} editMode={editMode} />
                      <EditableCell rowId={r.teamInclusionId} field="schedule.endDate" value={r.schedule.endDate} estado={est("schedule.endDate", r.schedule.endDate)} type="date" onSave={saveCell} compact={compact} editMode={editMode} />
                      <EditableCell rowId={r.teamInclusionId} field="schedule.returnDate" value={r.schedule.flightReturnDate} estado={est("schedule.returnDate", r.schedule.flightReturnDate)} type="date" onSave={saveCell} compact={compact} editMode={editMode} />
                      {show("passagem") && <>
                        <EditableCell rowId={r.teamInclusionId} field="ticket.value" value={t.value} estado={est("ticket.value", t.value)} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" onEdit={edit("ticket", r)} etapa={BARRA.ticket} />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.departureAirport" value={t.departureAirport} estado={est("ticket.departureAirport", t.departureAirport)} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.actualDepartureTime" value={t.actualDepartureTime} estado={est("ticket.actualDepartureTime", t.actualDepartureTime)} type="time" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.actualReturnTime" value={t.actualReturnTime} estado={est("ticket.actualReturnTime", t.actualReturnTime)} type="time" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.returnOriginAirport" value={t.returnOriginAirport} estado={est("ticket.returnOriginAirport", t.returnOriginAirport)} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.locator" value={t.locator} estado={est("ticket.locator", t.locator)} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="mono" />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.ticketCompany" value={t.ticketCompany} estado={est("ticket.ticketCompany", t.ticketCompany)} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.purchaseOrderNumber" value={t.purchaseOrderNumber} estado={est("ticket.purchaseOrderNumber", t.purchaseOrderNumber)} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
                        <EditableCell rowId={r.teamInclusionId} field="ticket.checkIn3" value={t.checkIn3} estado={est("ticket.checkIn3", t.checkIn3)} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
                      </>}
                      {show("hospedagem") && <>
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.hotelName" value={a.hotelName} estado={est("accommodation.hotelName", a.hotelName)} type="text" onSave={saveCell} compact={compact} editMode={editMode} onEdit={edit("accommodation", r)} etapa={BARRA.hotel} />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.reservationNumber" value={a.reservationNumber} estado={est("accommodation.reservationNumber", a.reservationNumber)} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="mono" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.checkInDate" value={a.checkInDate} estado={est("accommodation.checkInDate", a.checkInDate)} type="date" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.checkOutDate" value={a.checkOutDate} estado={est("accommodation.checkOutDate", a.checkOutDate)} type="date" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.nightsCount" value={a.nightsCount} estado={est("accommodation.nightsCount", a.nightsCount)} type="int" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.roomType" value={a.roomType} estado={est("accommodation.roomType", a.roomType)} aoConfirmar={() => irParaVisao("quartos")} type="select" options={ROOM_TYPE_OPTIONS} onSave={saveCell} compact={compact} editMode={editMode} variant="room" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.dailyRate" value={a.dailyRate} estado={est("accommodation.dailyRate", a.dailyRate)} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.lateCheckout" value={a.lateCheckout} estado={est("accommodation.lateCheckout", a.lateCheckout)} type="bool" onSave={saveCell} compact={compact} editMode={editMode} align="center" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.totalCents" value={a.totalCents} estado={est("accommodation.totalCents", a.totalCents)} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.paymentCompany" value={a.paymentCompany} estado={est("accommodation.paymentCompany", a.paymentCompany)} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.hotelOc" value={a.hotelOc} estado={est("accommodation.hotelOc", a.hotelOc)} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
                        <EditableCell rowId={r.teamInclusionId} field="accommodation.checkIn4" value={a.checkIn4} estado={est("accommodation.checkIn4", a.checkIn4)} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
                      </>}
                      {show("bagagem") && <>
                        <EditableCell rowId={r.teamInclusionId} field="baggage.amountCents" value={r.baggage.extraCents} estado={est("baggage.amountCents", r.baggage.extraCents)} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" etapa={BARRA.baggage} />
                        <EditableCell rowId={r.teamInclusionId} field="baggage.oc" value={r.baggage.oc} estado={est("baggage.oc", r.baggage.oc)} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
                        <EditableCell rowId={r.teamInclusionId} field="baggage.checkIn" value={r.baggage.checkIn} estado={est("baggage.checkIn", r.baggage.checkIn)} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
                      </>}
                      {show("uber") && <>
                        <EditableCell rowId={r.teamInclusionId} field="uber.amountCents" value={r.uber.totalCents} estado={est("uber.amountCents", r.uber.totalCents)} aoConfirmar={() => irParaVisao("uber")} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" etapa={BARRA.uber} />
                        <EditableCell rowId={r.teamInclusionId} field="uber.oc" value={r.uber.oc} estado={est("uber.oc", r.uber.oc)} aoConfirmar={() => irParaVisao("uber")} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
                        <EditableCell rowId={r.teamInclusionId} field="uber.checkIn" value={r.uber.checkIn} estado={est("uber.checkIn", r.uber.checkIn)} aoConfirmar={() => irParaVisao("uber")} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
                      </>}
                      {show("locacao") && <>
                        <EditableCell rowId={r.teamInclusionId} field="carRental.company" value={r.carRental.company} estado={est("carRental.company", r.carRental.company)} type="text" onSave={saveCell} compact={compact} editMode={editMode} onEdit={edit("extras", r)} etapa={BARRA.car} />
                        <EditableCell rowId={r.teamInclusionId} field="carRental.amountCents" value={r.carRental.totalCents} estado={est("carRental.amountCents", r.carRental.totalCents)} type="money" onSave={saveCell} compact={compact} editMode={editMode} align="right" />
                        <EditableCell rowId={r.teamInclusionId} field="carRental.oc" value={r.carRental.oc} estado={est("carRental.oc", r.carRental.oc)} type="text" onSave={saveCell} compact={compact} editMode={editMode} variant="oc" />
                        <EditableCell rowId={r.teamInclusionId} field="carRental.checkIn" value={r.carRental.checkIn} estado={est("carRental.checkIn", r.carRental.checkIn)} type="text" onSave={saveCell} compact={compact} editMode={editMode} align="center" variant="checkin" />
                      </>}
                      {show("pendencias") && <>
                        <td className="px-2 py-1 border-r border-border/30 text-center">
                          <PendencyCountBadge pendencies={r.pendencies} testId={`pend-${r.teamInclusionId}`} />
                        </td>
                        <EditableCell rowId={r.teamInclusionId} field="observations" value={r.observations} estado={est("observations", r.observations)} type="text" onSave={saveCell} compact={compact} editMode={editMode} />
                      </>}
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={39} className="p-8 text-center text-muted-foreground">{emptyMessage}</td></tr>}
              </tbody>
              {/* Somar a coluna é o que qualquer planilha faz e o que esta
                  grade não fazia: para saber o gasto de passagens era preciso
                  sair da tela. Só colunas de dinheiro somam. */}
              {rows.length > 0 && (
                <tfoot className="sticky bottom-0 z-20">
                  <tr className="bg-muted/95 backdrop-blur-sm">
                    <th colSpan={2} className="sticky left-0 z-30 bg-muted px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-r border-t border-border">
                      Total do evento
                    </th>
                    <TotalVazio n={4} />
                    {show("passagem") && <><TotalCol valor={soma.passagem} /><TotalVazio n={8} /></>}
                    {/* Hotel, Reserva, Check-in, Check-out, Diarias, Quarto | R$ Diaria (nao soma: e preco unitario) | Late C/Out | Hotel R$ | Empresa Pgto, OC, Conferencia */}
                    {show("hospedagem") && <><TotalVazio n={8} /><TotalCol valor={soma.hotel} /><TotalVazio n={3} /></>}
                    {show("bagagem") && <><TotalCol valor={soma.bagagem} /><TotalVazio n={2} /></>}
                    {show("uber") && <><TotalCol valor={soma.uber} /><TotalVazio n={2} /></>}
                    {show("locacao") && <><TotalVazio n={1} /><TotalCol valor={soma.locacao} /><TotalVazio n={2} /></>}
                    {show("pendencias") && <TotalVazio n={2} />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
        {/* Fora da área de rolagem: a legenda do âmbar e os atalhos da grade.
            A navegação por setas existe no código desde sempre e era invisível
            — dizer que ela existe é metade do ganho. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-card px-3.5 py-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {rows.length} {rows.length === 1 ? "pessoa" : "pessoas"} · {colunasVisiveis} colunas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-100 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/50" aria-hidden="true" />
            falta preencher
          </span>
          {editMode && (
            <span className="ml-auto inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <span><Tecla>Enter</Tecla> edita</span>
              <span><Tecla>Tab</Tecla> avança</span>
              <span><Tecla>↑↓←→</Tecla> navega</span>
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/** Célula de total: só as colunas de dinheiro somam. */
function TotalCol({ valor }: { valor: number }) {
  return (
    <td className="border-r border-t border-border px-2 py-1.5 text-right text-[11px] font-semibold tabular-nums text-foreground whitespace-nowrap">
      {valor > 0 ? brl(valor) : null}
    </td>
  );
}
/** Colunas que não somam nada — vazias de propósito. */
function TotalVazio({ n }: { n: number }) {
  return <>{Array.from({ length: n }, (_, i) => <td key={i} className="border-r border-t border-border" />)}</>;
}
/** Tecla de atalho na barra de status. */
function Tecla({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px] leading-4">{children}</kbd>;
}

/**
 * Rótulo da etapa com quantas pessoas já estão resolvidas nela. Some quando
 * ninguém tem aquilo (bagagem/Uber/locação costumam ser zero num evento
 * local) para não anunciar "0 de 15" em três blocos seguidos.
 */
function Progresso({ rotulo, feito, total }: { rotulo: string; feito: number; total: number }) {
  const completo = total > 0 && feito === total;
  return (
    <span className="inline-flex items-center gap-1.5">
      {rotulo}
      {feito > 0 && (
        <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums ${
          completo ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300" : "bg-background/70"}`}
          title={`${feito} de ${total} ${total === 1 ? "colaborador" : "colaboradores"} com este item preenchido`}>
          {completo ? `${total} ✓` : `${feito}/${total}`}
        </span>
      )}
    </span>
  );
}

function ColHead({ children, pad }: { children: React.ReactNode; pad: string }) {
  return <th className={`${pad} text-left font-medium border-r border-b border-border whitespace-nowrap text-muted-foreground sticky top-8 z-30 bg-muted`}>{children}</th>;
}

// ============ COLABORADORES VIEW ============
interface ColaboradoresViewProps { rows: MirrorRow[]; openDrawer: OpenDrawer; canEdit: boolean; emptyMessage: string }
function ColaboradoresView({ rows, openDrawer, canEdit, emptyMessage }: ColaboradoresViewProps) {
  const edit = (kind: DrawerKind, r: MirrorRow) => canEdit ? () => openDrawer(kind, r) : undefined;
  if (rows.length === 0) return <div className="rounded-lg border border-dashed bg-muted/20 py-14 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {rows.map((r) => {
        const t = r.ticket; const a = r.accommodation;
        const hotelTotal = hotelTotalCents(r);
        const hotelDerived = isHotelTotalDerived(r);
        const indivTotal = (t?.value || 0) + hotelTotal + (r.baggage.extraCents || 0) + (r.uber.totalCents || 0) + (r.carRental.totalCents || 0);
        // Extras zerados viravam três blocos vazios do mesmo tamanho dos que
        // têm dado. Agora só entram na lista quando existem de fato.
        const extras = [
          r.baggage.extraCents > 0 && { icon: <Luggage className="h-3.5 w-3.5" />, titulo: "Bagagem", valor: r.baggage.extraCents, detalhe: r.baggage.oc ? `OC ${r.baggage.oc}` : null, kind: "extras" as DrawerKind },
          r.uber.totalCents > 0 && { icon: <Car className="h-3.5 w-3.5" />, titulo: "Uber", valor: r.uber.totalCents, detalhe: r.uber.groupName || (r.uber.oc ? `OC ${r.uber.oc}` : null), kind: "extras" as DrawerKind },
          r.carRental.totalCents > 0 && { icon: <Car className="h-3.5 w-3.5" />, titulo: "Locação", valor: r.carRental.totalCents, detalhe: r.carRental.company || (r.carRental.oc ? `OC ${r.carRental.oc}` : null), kind: "extras" as DrawerKind },
        ].filter(Boolean) as { icon: React.ReactNode; titulo: string; valor: number; detalhe: string | null; kind: DrawerKind }[];

        return (
          <article key={r.teamInclusionId} className="rounded-lg border bg-card overflow-hidden transition-shadow hover:shadow-sm" data-testid={`collab-card-${r.teamInclusionId}`}>
            <header className="flex items-start justify-between gap-3 px-4 py-3 border-b">
              <div className="flex items-start gap-3 min-w-0">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                  {r.collaborator.fullName.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="font-medium leading-tight truncate" title={r.collaborator.fullName}>{r.collaborator.fullName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    <span className="capitalize">{r.function.area || r.function.name || "Sem função"}</span>
                    {" · "}{fmtDate(r.schedule.startDate)} – {fmtDate(r.schedule.endDate)}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-muted-foreground">Total</p>
                <p className="font-semibold tabular-nums leading-tight">{brl(indivTotal)}</p>
              </div>
            </header>

            <div className="divide-y">
              <LinhaCusto icon={<Plane className="h-3.5 w-3.5" />} titulo="Passagem" valor={t?.value ?? 0}
                detalhes={[t?.locator && `Loc ${t.locator}`, [t?.departureAirport, t?.returnOriginAirport].filter(Boolean).join(" → ") || null, t?.purchaseOrderNumber && `OC ${t.purchaseOrderNumber}`]}
                vazio="Sem passagem registrada" onEdit={edit("ticket", r)} />
              <LinhaCusto icon={<BedDouble className="h-3.5 w-3.5" />} titulo="Hospedagem" valor={hotelTotal} derivado={hotelDerived}
                detalhes={[a?.hotelName, a?.reservationNumber && `Reserva ${a.reservationNumber}`, (a?.checkInDate || a?.checkOutDate) && `${fmtDate(a?.checkInDate)} – ${fmtDate(a?.checkOutDate)}`, a?.nightsCount ? `${a.nightsCount} ${a.nightsCount === 1 ? "noite" : "noites"}${a.roomType ? " · " + (ROOM_TYPE_LABEL[a.roomType] ?? a.roomType) : ""}` : null]}
                vazio="Sem hospedagem registrada" onEdit={edit("accommodation", r)} />
              {extras.map((e) => (
                <LinhaCusto key={e.titulo} icon={e.icon} titulo={e.titulo} valor={e.valor} detalhes={[e.detalhe]} vazio="" onEdit={edit(e.kind, r)} />
              ))}
              {extras.length === 0 && canEdit && (
                <button type="button" onClick={() => openDrawer("extras", r)}
                  className="w-full px-4 py-2.5 text-left text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:bg-muted/40">
                  Sem bagagem, Uber ou locação — <span className="underline underline-offset-2">adicionar</span>
                </button>
              )}
            </div>

            <footer className="px-4 py-2.5 bg-muted/20 border-t">
              {r.pendencies.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Sem pendências
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.pendencies.map((pd, i) => <PendencyBadge key={i} p={pd} />)}
                </div>
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
}

/**
 * Uma linha de custo do colaborador. Substituiu os sub-cartões: dentro de um
 * cartão, mais bordas só criam ruído — o que separa aqui é o divisor e o
 * alinhamento do valor à direita.
 */
function LinhaCusto({ icon, titulo, valor, detalhes = [], vazio, onEdit, derivado }: {
  icon: React.ReactNode;
  titulo: string;
  valor: number;
  detalhes?: SummaryLine[];
  vazio: string;
  onEdit?: () => void;
  derivado?: boolean;
}) {
  const linhas = detalhes.filter(Boolean) as (string | number)[];
  const semNada = !valor && linhas.length === 0;
  const conteudo = (
    <>
      <span className="flex items-start gap-2.5 min-w-0">
        <span className="mt-0.5 text-muted-foreground shrink-0" aria-hidden="true">{icon}</span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium leading-tight">{titulo}</span>
          {semNada ? (
            <span className="block text-[11px] text-muted-foreground/70 leading-tight mt-0.5">{vazio}</span>
          ) : (
            <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5 truncate">{linhas.join(" · ")}</span>
          )}
        </span>
      </span>
      <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${semNada ? "text-muted-foreground" : ""} ${derivado ? "italic" : ""}`}
        title={derivado ? "Valor derivado: diária × noites (total não informado)" : undefined}>
        {brl(valor)}
      </span>
    </>
  );
  if (!onEdit) {
    return <div className="flex items-start justify-between gap-3 px-4 py-2.5">{conteudo}</div>;
  }
  return (
    <button type="button" onClick={onEdit} aria-label={`Editar ${titulo}`}
      className="w-full flex items-start justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40">
      {conteudo}
    </button>
  );
}

type SummaryLine = string | number | false | null | undefined;

// ============ DEPARTAMENTOS VIEW ============
interface DepartamentosViewProps {
  rows: MirrorRow[];
  totals: MirrorTotals;
  collapsed: Set<string>;
  setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>;
  openDrawer: OpenDrawer;
  canEdit: boolean;
  emptyMessage: string;
}
function DepartamentosView({ rows, totals, collapsed, setCollapsed, openDrawer, canEdit, emptyMessage }: DepartamentosViewProps) {
  const groups = useMemo(() => {
    const m = new Map<string, MirrorRow[]>();
    rows.forEach((r) => { const k = r.function.area || r.function.name || "(sem departamento)"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  // Antes: um .find() linear em byDepartment dentro do map dos grupos (O(n×m)).
  // Map preserva "o primeiro registro vence", igual ao find().
  const deptTotals = useMemo(() => {
    const m = new Map<string, MirrorSubtotal>();
    (totals?.byDepartment || []).forEach((d) => { if (!m.has(d.name)) m.set(d.name, d); });
    return m;
  }, [totals]);
  if (groups.length === 0) return <div className="rounded-lg border border-dashed bg-muted/20 py-14 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  return (
    <div className="space-y-3">
      {groups.map(([name, members]) => {
        const dt = deptTotals.get(name);
        const isOpen = !collapsed.has(name);
        const subtotal = dt?.total ?? 0;
        const extrasTotal = members.reduce((s, r) => s + (r.baggage.extraCents || 0) + (r.uber.totalCents || 0) + (r.carRental.totalCents || 0), 0);
        const pendCount = members.reduce((s, r) => s + r.pendencies.length, 0);
        return (
          <Card key={name} data-testid={`dept-${name}`}>
            <Collapsible open={isOpen} onOpenChange={(o) => setCollapsed((s) => { const n = new Set(s); if (o) n.delete(name); else n.add(name); return n; })}>
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
                  {members.map((r) => (
                    <div key={r.teamInclusionId} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 text-sm hover:bg-muted/20">
                      <div className="font-medium min-w-[180px] flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">{r.collaborator.fullName.slice(0, 2).toUpperCase()}</span>
                        {r.collaborator.fullName}
                      </div>
                      <span className="text-xs text-muted-foreground">{fmtDate(r.schedule.startDate)} → {fmtDate(r.schedule.endDate)}</span>
                      <span className="flex items-center gap-1 text-xs"><Plane className="h-3 w-3 text-indigo-500" /> {brl(r.ticket?.value)}</span>
                      <span className={`flex items-center gap-1 text-xs ${isHotelTotalDerived(r) ? "italic" : ""}`} title={isHotelTotalDerived(r) ? "Valor derivado: diária × diárias" : undefined}>
                        <BedDouble className="h-3 w-3 text-emerald-500" /> {brl(hotelTotalCents(r))}
                      </span>
                      <span className="flex items-center gap-1 text-xs"><Luggage className="h-3 w-3 text-amber-500" /> {brl((r.baggage.extraCents || 0) + (r.uber.totalCents || 0) + (r.carRental.totalCents || 0))}</span>
                      {r.pendencies.length > 0 && <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-700 dark:text-amber-400 ml-auto">{r.pendencies.length} pend.</Badge>}
                      {canEdit && <>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openDrawer("ticket", r)}><Pencil className="h-3 w-3 mr-1" /> Passagem</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openDrawer("accommodation", r)}><Pencil className="h-3 w-3 mr-1" /> Hotel</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openDrawer("extras", r)}><Pencil className="h-3 w-3 mr-1" /> Extras</Button>
                      </>}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}

// ============ QUARTOS VIEW ============
// Membros de grupo vêm do servidor como linhas {collaboratorId, ...}; o nome/gênero
// é resolvido pelas linhas do espelho (collabById).
// Aceita a linha de membro (com collaboratorId) ou um id solto; nome/gênero podem
// vir denormalizados no próprio membro em respostas mais antigas.
type GroupMemberLike = string | { collaboratorId?: string | null; id?: string; fullName?: string | null; name?: string | null; gender?: string | null };
interface MemberInfo { id: string | undefined; name: string; gender: string | null; noGender: boolean }
/**
 * Texto editável no lugar, para os campos do grupo (hotel). Salva ao sair do
 * campo ou no Enter; Esc devolve o valor anterior.
 */
function TextoEditavel({ valor, placeholder, aoSalvar, rotulo }: {
  valor: string | null | undefined;
  placeholder: string;
  aoSalvar: (v: string) => void;
  rotulo: string;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  useEffect(() => { setTexto(valor ?? ""); }, [valor]);
  return (
    <input
      value={texto}
      aria-label={rotulo}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => { if ((valor ?? "") !== texto) aoSalvar(texto.trim()); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === "Escape") { e.preventDefault(); setTexto(valor ?? ""); (e.target as HTMLInputElement).blur(); }
      }}
      className="h-8 w-full min-w-[150px] rounded-md border border-input/60 bg-background/60 px-2.5 text-xs transition-colors hover:border-input hover:bg-background focus:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground/60"
    />
  );
}

/**
 * "Puxar uma pessoa para outro" (pedido do dono, 28/08): em cada linha, para
 * onde essa pessoa vai. Os destinos são descritos por quem já está lá — é
 * assim que se decide, não por identificador de grupo.
 */
function MoverPara({ pessoa, grupoAtual, destinos, rotuloNovo, onMover }: {
  pessoa: string;
  grupoAtual: string;
  destinos: { id: string; descricao: string }[];
  rotuloNovo: string;
  onMover: (paraGrupoId: string | null) => void;
}) {
  return (
    <select
      value=""
      aria-label={`Mover ${pessoa} para outro grupo`}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        onMover(v === "__novo__" ? null : v);
        e.target.value = "";
      }}
      className="h-7 max-w-[160px] rounded-md border border-input/50 bg-background/50 px-1.5 text-[11px] text-muted-foreground opacity-0 transition-opacity focus:opacity-100 group-hover/linha:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={`mover-${grupoAtual}`}>
      <option value="">Mover para…</option>
      <option value="__novo__">{rotuloNovo}</option>
      {destinos.map((d) => <option key={d.id} value={d.id}>{d.descricao}</option>)}
    </select>
  );
}

/** "qui", "dom" — as planilhas da equipe abrem cada linha pelo dia da semana. */
function diaSemana(d: string | null | undefined): string {
  if (!d) return "—";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const data = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][data.getDay()] ?? "—";
}

/**
 * Faixas de cor para separar um grupo do outro, como as linhas coloridas da
 * planilha: o que importa é enxergar de relance quem viaja junto / divide
 * quarto, não a cor em si.
 */
const FAIXA = [
  "bg-sky-50/70 dark:bg-sky-950/25",
  "bg-emerald-50/70 dark:bg-emerald-950/25",
  "bg-amber-50/70 dark:bg-amber-950/25",
  "bg-fuchsia-50/70 dark:bg-fuchsia-950/25",
  "bg-orange-50/70 dark:bg-orange-950/25",
  "bg-violet-50/70 dark:bg-violet-950/25",
];

function memberInfo(m: GroupMemberLike, collabById: Map<string, MirrorCollaborator>): MemberInfo {
  const obj = typeof m === "string" ? null : m;
  const id = typeof m === "string" ? m : (obj?.collaboratorId || obj?.id || undefined);
  const c = id ? collabById.get(id) : undefined;
  const name = obj?.fullName || obj?.name || c?.fullName || (id ? `#${String(id).slice(0, 8)}` : "?");
  const gender = obj?.gender ?? c?.gender ?? null;
  return { id, name, gender, noGender: !gender || gender === "unknown" };
}

interface GroupViewProps<G> {
  groups: G[];
  collabById: Map<string, MirrorCollaborator>;
  /** Linhas do espelho: é delas que vêm departamento, datas e voos. */
  rows: MirrorRow[];
  /** Salva campos do grupo (hotel, titular do carro). */
  onPatch: (id: string, campos: Record<string, unknown>) => void;
  /** Só na tela de quartos: desfaz o compartilhamento. */
  onSeparar?: (id: string) => void;
  /** Tira a pessoa deste grupo e põe em outro (ou num novo, se destino nulo). */
  onMover: (collaboratorId: string, deGrupoId: string, paraGrupoId: string | null) => void;
  canEdit: boolean;
  onConfirm: (id: string) => void;
  pendingId: string | null | undefined;
}

function QuartosView({ groups, collabById, rows, canEdit, onConfirm, onPatch, onSeparar, onMover, pendingId }: GroupViewProps<RoomGroup>) {
  const emptyHint = canEdit ? ' Clique em "Sugestões".' : "";
  if (groups.length === 0) return <div className="rounded-lg border border-dashed bg-muted/20 py-12 text-center text-sm text-muted-foreground">Nenhuma sugestão de quarto ainda.{emptyHint}</div>;
  const rowByCollab = new Map(rows.filter((r) => r.collaborator.id).map((r) => [r.collaborator.id as string, r]));
  /** Como cada quarto se descreve na lista de destinos: por quem está nele. */
  const descreve = (g: RoomGroup) => {
    const nomes = (g.members || []).map((m) => memberInfo(m, collabById).name.split(" ")[0]);
    return nomes.length ? `Com ${nomes.join(", ")}` : "Quarto vazio";
  };
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 border-b">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Nome</th>
              <th className="px-3 py-2 font-semibold">Departamento</th>
              <th className="px-3 py-2 font-semibold">Início</th>
              <th className="px-3 py-2 font-semibold">Data ida</th>
              <th className="px-3 py-2 font-semibold">Término</th>
              <th className="px-3 py-2 font-semibold">Data volta</th>
              <th className="px-3 py-2 font-semibold">Hotel</th>
              <th className="px-3 py-2 font-semibold">Quarto</th>
              <th className="px-3 py-2 font-semibold text-right">Situação</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => {
              const membros = (g.members || []).map((m) => memberInfo(m, collabById));
              const faixa = FAIXA[gi % FAIXA.length];
              return membros.map((m, mi) => {
                const r = m.id ? rowByCollab.get(m.id) : undefined;
                const ini = r?.accommodation?.checkInDate || r?.schedule.startDate || g.checkInDate;
                const fim = r?.accommodation?.checkOutDate || r?.schedule.endDate || g.checkOutDate;
                return (
                  <tr key={`${g.id}-${m.id ?? mi}`}
                    className={`group/linha ${faixa} ${mi === membros.length - 1 ? "border-b-2 border-border" : "border-b border-border/40"}`}
                    data-testid={`room-row-${g.id}-${mi}`}>
                    <td className="px-3 py-2 font-medium">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{m.name}</span>
                        {canEdit && m.id && (
                          <MoverPara pessoa={m.name} grupoAtual={g.id} rotuloNovo="Quarto individual"
                            destinos={groups.filter((o) => o.id !== g.id).map((o) => ({ id: o.id, descricao: descreve(o) }))}
                            onMover={(para) => onMover(m.id as string, g.id, para)} />
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 capitalize text-muted-foreground">{r?.function.area || r?.function.name || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{diaSemana(ini)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtDate(ini)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{diaSemana(fim)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtDate(fim)}</td>
                    {/* Hotel e tipo aparecem uma vez por grupo, como na planilha —
                        e são editáveis aqui mesmo, sem abrir outra tela. */}
                    {mi === 0 ? (
                      <td className="px-3 py-2 align-middle" rowSpan={membros.length}>
                        {canEdit ? (
                          <TextoEditavel
                            valor={g.hotelName}
                            placeholder="Definir hotel…"
                            aoSalvar={(v) => onPatch(g.id, { hotelName: v || null })}
                            rotulo="Hotel do quarto"
                          />
                        ) : (g.hotelName || <span className="text-muted-foreground">—</span>)}
                      </td>
                    ) : null}
                    {mi === 0 ? (
                      <td className="px-3 py-2 text-center align-middle" rowSpan={membros.length}>
                        <span className="inline-flex items-center gap-1.5 font-semibold uppercase">
                          {membros.length === 1 ? "Single" : membros.length === 2 ? "Duplo" : membros.length === 3 ? "Triplo" : `${membros.length} pessoas`}
                          <span className="rounded-full bg-background/70 px-1.5 text-[10px] font-normal normal-case tabular-nums text-muted-foreground">
                            {membros.length} {membros.length === 1 ? "pessoa" : "pessoas"}
                          </span>
                        </span>
                        {canEdit && membros.length > 1 && onSeparar && (
                          <button type="button" onClick={() => onSeparar(g.id)}
                            className="mt-1 block mx-auto text-[11px] text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                            data-testid={`separar-${g.id}`}>
                            Separar em individuais
                          </button>
                        )}
                        {g.notes && (
                          <span className="block mt-1 text-[10px] font-normal normal-case text-muted-foreground leading-snug max-w-[190px] mx-auto">{g.notes}</span>
                        )}
                      </td>
                    ) : null}
                    {mi === 0 ? (
                      <td className="px-3 py-2 text-right align-middle" rowSpan={membros.length}>
                        {g.confirmed ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">Confirmado</Badge>
                        ) : canEdit ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onConfirm(g.id)} disabled={pendingId === g.id} data-testid={`confirm-room-${g.id}`}>
                            {pendingId === g.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCheck className="h-3 w-3 mr-1" />} Confirmar
                          </Button>
                        ) : <Badge variant="outline">Sugestão</Badge>}
                      </td>
                    ) : null}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ UBER VIEW ============
/**
 * Uma tabela de roteirização (ida OU volta). A planilha da equipe separa
 * "Norte × Aeroporto" de "Aeroporto × Norte" em blocos distintos — misturar os
 * dois numa lista só obrigava a ler a coluna "Trajeto" linha a linha.
 */
function TabelaUber({ titulo, subtitulo, tom, grupos, rowByCollab, collabById, canEdit, onConfirm, onPatch, onMover, pendingId }: {
  titulo: string;
  subtitulo: string;
  tom: string;
  grupos: UberGroup[];
  rowByCollab: Map<string, MirrorRow>;
  collabById: Map<string, MirrorCollaborator>;
  canEdit: boolean;
  onConfirm: (id: string) => void;
  onPatch: (id: string, campos: Record<string, unknown>) => void;
  onMover: (collaboratorId: string, deGrupoId: string, paraGrupoId: string | null) => void;
  pendingId: string | null | undefined;
}) {
  const ida = titulo.toLowerCase().startsWith("ida");
  /** Cada carro se descreve por quem já está nele — é assim que se decide. */
  const descreve = (g: UberGroup) => {
    const nomes = (g.members || []).map((m) => memberInfo(m, collabById).name.split(" ")[0]);
    return nomes.length ? `Com ${nomes.join(", ")}` : "Carro vazio";
  };
  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <header className={`px-4 py-2.5 border-b ${tom}`}>
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          {ida ? <Plane className="h-3.5 w-3.5" aria-hidden="true" /> : <Plane className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />}
          {titulo}
          <span className="rounded-full bg-background/70 px-1.5 text-[10px] tabular-nums">{grupos.length}</span>
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitulo}</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 border-b">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Nome</th>
              <th className="px-3 py-2 font-semibold">Departamento</th>
              <th className="px-3 py-2 font-semibold border-l">Dia</th>
              <th className="px-3 py-2 font-semibold">Data</th>
              <th className="px-3 py-2 font-semibold">Aeroporto</th>
              <th className="px-3 py-2 font-semibold">Horário</th>
              <th className="px-3 py-2 font-semibold border-l">Titular</th>
              <th className="px-3 py-2 font-semibold text-right">Situação</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g, gi) => {
              const membros = (g.members || []).map((m) => memberInfo(m, collabById));
              const faixa = FAIXA[gi % FAIXA.length];
              return membros.map((m, mi) => {
                const r = m.id ? rowByCollab.get(m.id) : undefined;
                const t = r?.ticket;
                const data = g.date || (ida ? t?.actualDepartureDate : t?.actualReturnDate);
                const aero = ida ? (t?.destinationAirport || g.origin) : (t?.returnOriginAirport || g.destination);
                const hora = g.time || (ida ? t?.actualArrivalTime : t?.actualReturnTime);
                return (
                  <tr key={`${g.id}-${m.id ?? mi}`}
                    className={`group/linha ${faixa} ${mi === membros.length - 1 ? "border-b-2 border-border" : "border-b border-border/40"}`}
                    data-testid={`uber-row-${g.id}-${mi}`}>
                    <td className="px-3 py-2 font-medium">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{m.name}</span>
                        {canEdit && m.id && (
                          <MoverPara pessoa={m.name} grupoAtual={g.id} rotuloNovo="Carro só para ela"
                            destinos={grupos.filter((o) => o.id !== g.id).map((o) => ({ id: o.id, descricao: descreve(o) }))}
                            onMover={(para) => onMover(m.id as string, g.id, para)} />
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 capitalize text-muted-foreground">{r?.function.area || r?.function.name || "—"}</td>
                    <td className="px-3 py-2 border-l text-muted-foreground">{diaSemana(data)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtDate(data)}</td>
                    <td className="px-3 py-2 uppercase">{aero || "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{hora || "—"}</td>
                    {/* TITULAR: quem chama o carro. Escolhido à mão entre os
                        passageiros do grupo — o sistema não sugere. */}
                    {mi === 0 ? (
                      <td className="px-3 py-2 border-l align-middle" rowSpan={membros.length}>
                        {canEdit ? (
                          <select
                            value={g.titularCollaboratorId ?? ""}
                            onChange={(e) => onPatch(g.id, { titularCollaboratorId: e.target.value || null })}
                            aria-label="Titular do carro"
                            className="h-7 w-full min-w-[150px] rounded-md border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            data-testid={`uber-titular-${g.id}`}>
                            <option value="">Escolher…</option>
                            {membros.map((op, i) => (
                              <option key={op.id ?? i} value={op.id ?? ""}>{op.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-medium">
                            {membros.find((op) => op.id === g.titularCollaboratorId)?.name
                              ?? <span className="text-muted-foreground">—</span>}
                          </span>
                        )}
                      </td>
                    ) : null}
                    {mi === 0 ? (
                      <td className="px-3 py-2 text-right align-middle" rowSpan={membros.length}>
                        {g.confirmed ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">Confirmado</Badge>
                        ) : canEdit ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onConfirm(g.id)} disabled={pendingId === g.id} data-testid={`confirm-uber-${g.id}`}>
                            {pendingId === g.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCheck className="h-3 w-3 mr-1" />} Confirmar
                          </Button>
                        ) : <Badge variant="outline">Sugestão</Badge>}
                      </td>
                    ) : null}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UberView({ groups, collabById, rows, canEdit, onConfirm, onPatch, onMover, pendingId }: GroupViewProps<UberGroup>) {
  const emptyHint = canEdit ? ' Clique em "Sugestões".' : "";
  if (groups.length === 0) return <div className="rounded-lg border border-dashed bg-muted/20 py-12 text-center text-sm text-muted-foreground">Nenhuma sugestão de Uber ainda.{emptyHint}</div>;
  const rowByCollab = new Map(rows.filter((r) => r.collaborator.id).map((r) => [r.collaborator.id as string, r]));
  const idas = groups.filter((g) => g.direction === "ida");
  const voltas = groups.filter((g) => g.direction === "volta");
  const internos = groups.filter((g) => g.direction !== "ida" && g.direction !== "volta");

  return (
    <div className="space-y-6">
      {idas.length > 0 && (
        <TabelaUber titulo="Ida — chegada no aeroporto" subtitulo="Cada faixa de cor é um carro. O titular é quem chama a corrida."
          tom="bg-sky-50/60 dark:bg-sky-950/20" grupos={idas} rowByCollab={rowByCollab} collabById={collabById}
          canEdit={canEdit} onConfirm={onConfirm} onPatch={onPatch} onMover={onMover} pendingId={pendingId} />
      )}
      {voltas.length > 0 && (
        <TabelaUber titulo="Volta — saída para o aeroporto" subtitulo="Cada faixa de cor é um carro. O titular é quem chama a corrida."
          tom="bg-orange-50/60 dark:bg-orange-950/20" grupos={voltas} rowByCollab={rowByCollab} collabById={collabById}
          canEdit={canEdit} onConfirm={onConfirm} onPatch={onPatch} onMover={onMover} pendingId={pendingId} />
      )}

      {internos.length > 0 && (
        <section className="rounded-lg border bg-card overflow-hidden">
          <header className="px-4 py-2.5 border-b bg-muted/40">
            <h3 className="text-[13px] font-semibold">Uber no evento</h3>
            <p className="text-[11px] text-muted-foreground">Deslocamentos que não são do aeroporto.</p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 border-b">
                <tr className="text-left">
                  <th className="px-3 py-2 font-semibold">Nome</th>
                  <th className="px-3 py-2 font-semibold">Departamento</th>
                  <th className="px-3 py-2 font-semibold">Trajeto</th>
                  <th className="px-3 py-2 font-semibold">Data</th>
                  <th className="px-3 py-2 font-semibold text-right">Situação</th>
                </tr>
              </thead>
              <tbody>
                {internos.map((g, gi) => {
                  const membros = (g.members || []).map((m) => memberInfo(m, collabById));
                  const faixa = FAIXA[gi % FAIXA.length];
                  return membros.map((m, mi) => {
                    const r = m.id ? rowByCollab.get(m.id) : undefined;
                    return (
                      <tr key={`${g.id}-${m.id ?? mi}`}
                        className={`${faixa} ${mi === membros.length - 1 ? "border-b-2 border-border" : "border-b border-border/40"}`}>
                        <td className="px-3 py-2 font-medium">{m.name}</td>
                        <td className="px-3 py-2 capitalize text-muted-foreground">{r?.function.area || r?.function.name || "—"}</td>
                        <td className="px-3 py-2">{[g.origin, g.destination].filter(Boolean).join(" → ") || uberDirectionLabel(g.direction)}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtDate(g.date)}</td>
                        {mi === 0 ? (
                          <td className="px-3 py-2 text-right align-middle" rowSpan={membros.length}>
                            {g.confirmed ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Confirmado</Badge>
                              : canEdit ? (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onConfirm(g.id)} disabled={pendingId === g.id}>
                                  {pendingId === g.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCheck className="h-3 w-3 mr-1" />} Confirmar
                                </Button>
                              ) : <Badge variant="outline">Sugestão</Badge>}
                          </td>
                        ) : null}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ============ FOOTER TOTALS ============
/**
 * Rateio do evento em DUAS dimensões, como a planilha da equipe (28/08):
 * "Conta" é o rateio contábil com que o financeiro fecha (vários
 * departamentos caem na mesma conta); "Departamento" responde quem gastou.
 * Antes as duas tabelas daqui mostravam a mesma coisa, porque department caía
 * no nome da função quando a área não estava preenchida.
 */
/** Célula de valor: zero fica apagado para o que foi gasto saltar aos olhos. */
function Valor({ v }: { v: number }) {
  return <td className={`p-2 text-right tabular-nums ${v ? "" : "text-muted-foreground"}`}>{brl(v)}</td>;
}

function RateioTabela({ titulo, icone, linhas, vazio }: {
  titulo: string;
  icone: React.ReactNode;
  linhas: MirrorSubtotal[];
  vazio: string;
}) {
  const total = linhas.reduce((acc, l) => acc + l.total, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">{icone} {titulo}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {linhas.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground text-center">{vazio}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 border-y">
                <tr className="text-left">
                  <th className="p-2 font-medium">{titulo.includes("Conta") ? "Conta" : "Departamento"}</th>
                  <th className="p-2 font-medium text-right">Passagem</th><th className="p-2 font-medium text-right">Hotel</th>
                  <th className="p-2 font-medium text-right">Bag.</th><th className="p-2 font-medium text-right">Uber</th>
                  <th className="p-2 font-medium text-right">Locação</th><th className="p-2 font-medium text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((d) => (
                  <tr key={d.name} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-2 capitalize">{d.name}</td>
                    <Valor v={d.tickets} /><Valor v={d.hotel} /><Valor v={d.baggage} /><Valor v={d.uber} /><Valor v={d.carRental} />
                    <td className="p-2 text-right tabular-nums font-semibold">{brl(d.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="p-2">Total</td>
                  <td className="p-2" colSpan={5} />
                  <td className="p-2 text-right tabular-nums">{brl(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FooterTotals({ totals, hotelDerived }: { totals: MirrorTotals; hotelDerived?: boolean }) {
  // Só vale mostrar o rateio por conta quando alguma função tem conta
  // preenchida — senão seria uma tabela com uma linha "(sem conta)".
  const contas = (totals.byAccount || []).filter((c) => c.name !== "(sem conta)");
  const semConta = (totals.byAccount || []).find((c) => c.name === "(sem conta)");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <RateioTabela
          titulo="Rateio por Conta"
          icone={<Landmark className="h-4 w-4" />}
          linhas={totals.byAccount || []}
          vazio="Nenhuma função tem conta definida."
        />
        <RateioTabela
          titulo="Subtotais por Departamento"
          icone={<Building2 className="h-4 w-4" />}
          linhas={totals.byDepartment || []}
          vazio="Sem departamentos."
        />
      </div>

      {contas.length === 0 && semConta && semConta.total > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-900">
            <strong>O rateio por conta está vazio.</strong> Defina a conta de cada função em{" "}
            <Link href="/functions" className="underline font-medium">Funções</Link> — é a coluna
            que diz em qual conta o custo do evento entra (cenotécnica, kit e percurso caem em LI,
            por exemplo). Sem isso, {brl(semConta.total)} ficam sem rateio.
          </p>
        </div>
      )}

    </div>
  );
}

/**
 * Uma categoria de custo dentro da faixa de resumo. Zerado fica apagado de
 * propósito: num evento local, quatro das cinco categorias são R$ 0,00 e não
 * podem ter o mesmo peso visual do que realmente foi gasto.
 */
function CostItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  const zerado = !value;
  return (
    <div className="px-4 py-3">
      <p className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider ${zerado ? "text-muted-foreground" : "text-muted-foreground"}`}>
        <span aria-hidden="true">{icon}</span>{label}
      </p>
      <p className={`mt-1 text-[15px] font-semibold tabular-nums ${zerado ? "text-muted-foreground" : "text-foreground"}`}>
        {brl(value)}
      </p>
    </div>
  );
}

function TotalLine({ label, value, bold, italic, title, muted }: { label: string; value: string; bold?: boolean; italic?: boolean; title?: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "text-[15px] font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${italic ? "italic" : ""} ${muted && !bold ? "text-muted-foreground" : ""}`} title={title}>{value}</span>
    </div>
  );
}
