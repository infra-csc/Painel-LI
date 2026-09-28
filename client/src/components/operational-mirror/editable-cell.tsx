/**
 * Célula editável da grade do espelho (25/09 — extraída da página).
 * Navegação estilo planilha, estados de gravação e o rótulo humano de cada campo.
 */
import { useState, useRef, useEffect } from "react";
import { Loader2, Check, Pencil } from "lucide-react";
import type { EstadoCelula } from "@shared/mirror-cell-state";
import { brl, fmtDate, type CellType, type CellValue } from "./mirror-shared";

export type CellVariant = "mono" | "oc" | "checkin" | "room";

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
export function rotuloCampo(field: string): string {
  const partes = field.split(".");
  const nome = NOME_CAMPO[partes[partes.length - 1]] ?? partes[partes.length - 1];
  const grupo = partes.length > 1 ? GRUPO_CAMPO[partes[0]] : undefined;
  return grupo ? `${grupo} — ${nome}` : nome;
}

export interface EditableCellProps {
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
}

export function EditableCell({
  rowId, field, value, type, onSave, align = "left", compact, onEdit, editMode = true, variant, options, etapa, estado = "preenchido", aoConfirmar,
}: EditableCellProps) {
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
    if (estado === "a_confirmar") return <span className="text-primary">a confirmar</span>;
    if (estado === "nao_usa") return <span className="text-muted-foreground">não usa</span>;
    if (type === "bool") return value ? <Check className="h-3.5 w-3.5 text-success mx-auto" aria-hidden="true" /> : <span className="text-muted-foreground">·</span>;
    if (value === null || value === undefined || value === "") {
      // "falta preencher" e "não se aplica" tinham o mesmo travessão cinza: a
      // grade não respondia o que ainda precisa ser comprado.
      return estado === "falta"
        ? <span className="font-medium text-warning">preencher</span>
        : <span className="text-muted-foreground">·</span>;
    }
    if (type === "money") return brl(value as number);
    if (type === "date") return fmtDate(value as string);
    const s = type === "select" ? (options?.find((o) => o.value === String(value))?.label ?? String(value)) : String(value);
    // As pílulas saíram (31/08): eram 112 numa tela de 14 linhas — OC e
    // conferência em cada linha —, e pílula é destaque. Nada aqui é destaque.
    if (variant === "mono" || variant === "oc") return <span className="font-mono text-2xs tracking-tight">{s}</span>;
    if (variant === "checkin") return <span className="text-2xs text-success">{s}</span>;
    if (variant === "room") return <span className="text-2xs">{s}</span>;
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
  const ring = state === "saving" ? "bg-brand-soft/60"
    : state === "saved" ? "bg-success-soft/60"
    : state === "error" ? "ring-1 ring-inset ring-danger-strong bg-danger-soft/60"
    // O âmbar é o que faz a grade responder "o que falta comprar" de longe.
    // Só aparece quando o campo é obrigatório PARA ESTA PESSOA — pintar todo
    // vazio deixaria a tela amarela e a cor viraria ruído.
    : estado === "falta" ? "bg-warning-soft/70" : "";

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
          {state === "saving" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : display()}
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
        {state === "saving" && <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" aria-hidden="true" />}
        {state === "saved" && <Check className="h-3 w-3 text-success shrink-0" aria-hidden="true" />}
        <span className="truncate max-w-[180px]">{display()}</span>
      </button>
      {onEdit && (
        <button type="button" onClick={onEdit} title="Editar em detalhe" aria-label="Editar em detalhe"
          className="opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100 transition-opacity absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded bg-background border shadow-1 hover:bg-muted">
          <Pencil className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </td>
  );
}
