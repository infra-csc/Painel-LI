import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plane, BedDouble, Loader2, Save, Luggage, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Ticket, Accommodation } from "@shared/schema";
import type { MirrorRow } from "@shared/operational-mirror-types";

type FieldType = "text" | "money" | "time" | "int" | "bool" | "date" | "select";
export type DrawerKind = "ticket" | "accommodation" | "extras";
/** Objeto de origem do drawer: passagem, hospedagem ou a linha inteira (extras). */
export type DrawerSource = Ticket | Accommodation | MirrorRow | null;
/** Valor de campo como vai no PATCH do espelho. */
export type DrawerValue = string | number | boolean | null;

interface FieldDef {
  field: string;
  label: string;
  type: FieldType;
  /** Seção do formulário — o painel deixou de ser uma grade solta de inputs. */
  group?: string;
  /** Texto de apoio abaixo do campo, quando o rótulo não basta. */
  hint?: string;
  span?: 1 | 2;
  placeholder?: string;
  get?: (row: MirrorRow | null) => DrawerValue | undefined;
  /** opções para type === "select" */
  options?: { value: string; label: string }[];
}

/** Tipos de quarto aceitos pelo servidor (server/operational-mirror.ts). */
export const ROOM_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "double", label: "Duplo" },
  { value: "triple", label: "Triplo" },
];
export const ROOM_TYPE_LABEL: Record<string, string> = Object.fromEntries(ROOM_TYPE_OPTIONS.map((o) => [o.value, o.label]));
// Sentinela do Select: Radix não aceita value="" em SelectItem.
const SELECT_EMPTY = "__none__";

const TICKET_FIELDS: FieldDef[] = [
  { field: "ticket.value", label: "Valor da passagem", type: "money", span: 2, group: "Voo" },
  { field: "ticket.departureAirport", label: "Aeroporto de ida", type: "text", group: "Voo", placeholder: "Ex: CGH" },
  { field: "ticket.actualDepartureTime", label: "Horário de ida", type: "time", group: "Voo" },
  { field: "ticket.returnOriginAirport", label: "Aeroporto de volta", type: "text", group: "Voo", placeholder: "Ex: GRU" },
  { field: "ticket.actualReturnTime", label: "Horário de volta", type: "time", group: "Voo" },
  { field: "ticket.locator", label: "Localizador", type: "text", group: "Compra", placeholder: "Ex: IJQZNW" },
  { field: "ticket.ticketCompany", label: "Companhia", type: "text", group: "Compra", placeholder: "Ex: GOL" },
  { field: "ticket.purchaseOrderNumber", label: "OC", type: "text", group: "Compra" },
  { field: "ticket.checkIn3", label: "Conferência", type: "text", span: 2, group: "Compra", hint: "Quem conferiu esta passagem no fechamento." },
];

const ACC_FIELDS: FieldDef[] = [
  { field: "accommodation.hotelName", label: "Hotel", type: "text", span: 2, group: "Reserva" },
  { field: "accommodation.reservationNumber", label: "Nº da reserva", type: "text", group: "Reserva", placeholder: "Ex: RES-123456" },
  { field: "accommodation.roomType", label: "Tipo de quarto", type: "select", options: ROOM_TYPE_OPTIONS, group: "Reserva" },
  { field: "accommodation.checkInDate", label: "Entrada", type: "date", group: "Período" },
  { field: "accommodation.checkInTime", label: "Hora da entrada", type: "time", group: "Período" },
  { field: "accommodation.checkOutDate", label: "Saída", type: "date", group: "Período" },
  { field: "accommodation.checkOutTime", label: "Hora da saída", type: "time", group: "Período" },
  { field: "accommodation.nightsCount", label: "Noites", type: "int", group: "Período" },
  { field: "accommodation.lateCheckout", label: "Late check-out", type: "bool", group: "Período" },
  { field: "accommodation.dailyRate", label: "Valor da diária", type: "money", group: "Valores" },
  { field: "accommodation.totalCents", label: "Total do hotel", type: "money", group: "Valores", hint: "Em branco, o total é diária × noites." },
  { field: "accommodation.paymentCompany", label: "Empresa de pagamento", type: "text", group: "Valores" },
  { field: "accommodation.hotelOc", label: "OC", type: "text", group: "Valores" },
  { field: "accommodation.checkIn4", label: "Conferência", type: "text", span: 2, group: "Valores", hint: "Quem conferiu esta hospedagem no fechamento." },
];

const EXTRAS_FIELDS: FieldDef[] = [
  { field: "baggage.amountCents", label: "Valor", type: "money", group: "Bagagem extra", get: (r) => r?.baggage?.extraCents },
  { field: "baggage.oc", label: "OC", type: "text", group: "Bagagem extra", get: (r) => r?.baggage?.oc },
  { field: "baggage.checkIn", label: "Conferência", type: "text", span: 2, group: "Bagagem extra", get: (r) => r?.baggage?.checkIn },
  { field: "uber.amountCents", label: "Valor", type: "money", group: "Uber", get: (r) => r?.uber?.totalCents },
  { field: "uber.oc", label: "OC", type: "text", group: "Uber", get: (r) => r?.uber?.oc },
  { field: "uber.checkIn", label: "Conferência", type: "text", span: 2, group: "Uber", get: (r) => r?.uber?.checkIn },
  { field: "carRental.company", label: "Empresa", type: "text", span: 2, group: "Locação de carro", get: (r) => r?.carRental?.company },
  { field: "carRental.amountCents", label: "Valor", type: "money", group: "Locação de carro", get: (r) => r?.carRental?.totalCents },
  { field: "carRental.oc", label: "OC", type: "text", group: "Locação de carro", get: (r) => r?.carRental?.oc },
  { field: "carRental.checkIn", label: "Conferência", type: "text", span: 2, group: "Locação de carro", get: (r) => r?.carRental?.checkIn },
];

function getValue(source: DrawerSource, field: string): DrawerValue | undefined {
  // field like "ticket.value" — source is the ticket/accommodation object directly
  const key = field.split(".")[1];
  return source ? ((source as unknown as Record<string, DrawerValue | undefined>)[key] ?? null) : null;
}
function readVal(f: FieldDef, source: DrawerSource): DrawerValue | undefined {
  return f.get ? f.get(source as MirrorRow | null) : getValue(source, f.field);
}

function toInput(value: DrawerValue | undefined, type: FieldType): string {
  if (value === null || value === undefined) return "";
  if (type === "money") return ((value as number) / 100).toString();
  return String(value);
}

function parseInput(raw: string, type: FieldType): DrawerValue {
  const t = (raw ?? "").trim();
  if (type === "money") {
    if (t === "") return null;
    const n = parseFloat(t.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }
  if (type === "int") {
    if (t === "") return null;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  }
  return t;
}

export interface EditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: DrawerKind | null;
  rowId: string | null;
  rowName?: string;
  source: DrawerSource; // ticket / accommodation object, or full row for extras
  onSaveMany: (rowId: string, changes: Record<string, DrawerValue>) => Promise<void>;
}

/** As três abas do drawer, na ordem em que a compra acontece. */
const ABAS: { chave: DrawerKind; rotulo: string; Icone: typeof Plane; tom: string }[] = [
  { chave: "ticket", rotulo: "Passagem", Icone: Plane, tom: "bg-brand-soft text-primary" },
  { chave: "accommodation", rotulo: "Hospedagem", Icone: BedDouble, tom: "bg-success-soft text-success" },
  { chave: "extras", rotulo: "Extras", Icone: Luggage, tom: "bg-warning-soft text-warning" },
];

export function EditDrawer({ open, onOpenChange, kind, rowId, rowName, source, onSaveMany }: EditDrawerProps) {
  const { toast } = useToast();
  /**
   * Abas de verdade (31/08): o drawer abria UM bloco — o da coluna clicada — e
   * ver a hospedagem da mesma pessoa exigia fechar, achar a coluna certa na
   * grade de 39 colunas e abrir de novo. `kind` virou a aba INICIAL.
   */
  const [aba, setAba] = useState<DrawerKind>(kind ?? "ticket");
  useEffect(() => { if (open && kind) setAba(kind); }, [open, kind]);
  const fields = aba === "ticket" ? TICKET_FIELDS : aba === "accommodation" ? ACC_FIELDS : EXTRAS_FIELDS;
  // O rascunho guarda o TEXTO digitado (e boolean para switches). Antes ele guardava
  // centavos e o input relia toInput(): digitar "10," / "10." era desfeito a cada tecla,
  // impossibilitando informar centavos. A conversão acontece só no salvamento.
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  /**
   * Trocar de aba ou fechar com campos mexidos descartava tudo calado (07/10).
   * Agora a ação fica em espera e o rodapé pergunta — sem diálogo dentro de
   * drawer: "Descartar e sair" ou "Continuar editando".
   */
  const [emEspera, setEmEspera] = useState<{ rotulo: string; acao: () => void } | null>(null);
  useEffect(() => { if (!open) setEmEspera(null); }, [open]);

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string | boolean> = {};
    for (const f of fields) {
      const v = readVal(f, source);
      init[f.field] = f.type === "bool" ? !!v : toInput(v, f.type);
    }
    setDraft(init);
  }, [open, aba, rowId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!rowId || saving) return;
    const changes: Record<string, DrawerValue> = {};
    for (const f of fields) {
      const orig = readVal(f, source);
      const next = f.type === "bool" ? !!draft[f.field] : parseInput(String(draft[f.field] ?? ""), f.type);
      const a = f.type === "money" || f.type === "int" ? (orig ?? null) : f.type === "bool" ? !!orig : (orig ?? "");
      if (String(a) !== String(next)) changes[f.field] = next;
    }
    if (Object.keys(changes).length === 0) { onOpenChange(false); return; }
    // Check-out não pode ser antes do check-in (compara YYYY-MM-DD como texto).
    // Pela ABA aberta, não pela coluna que abriu o drawer: com as abas, a
    // hospedagem pode estar sendo editada mesmo tendo entrado pela passagem.
    if (aba === "accommodation") {
      const ci = String(draft["accommodation.checkInDate"] ?? "").trim();
      const co = String(draft["accommodation.checkOutDate"] ?? "").trim();
      if (ci && co && co < ci) {
        toast({ title: "Datas inválidas", description: "O check-out deve ser igual ou posterior ao check-in.", variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    try {
      await onSaveMany(rowId, changes);
      toast({ title: "Salvo", description: `${Object.keys(changes).length} campo(s) atualizado(s).` });
      onOpenChange(false);
    } catch (err) {
      const e = err as { status?: number; body?: { message?: string } } | null;
      // Os campos são gravados um a um, então a falha pode ser parcial: não afirmar
      // que nada foi salvo. O painel fica aberto com os valores digitados para revisão.
      toast({
        title: "Erro ao salvar",
        description: e?.status === 401
          ? "Sua sessão expirou. Entre novamente — parte dos campos pode não ter sido gravada."
          : (e?.body?.message || "Parte dos campos pode não ter sido gravada. Confira os valores e tente novamente."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  // Quais campos foram mexidos — o rodapé conta e cada campo alterado ganha
  // um ponto, para o operador ver o que está prestes a gravar.
  const alterados = new Set<string>();
  for (const f of fields) {
    const orig = readVal(f, source);
    const next = f.type === "bool" ? !!draft[f.field] : parseInput(String(draft[f.field] ?? ""), f.type);
    const a = f.type === "money" || f.type === "int" ? (orig ?? null) : f.type === "bool" ? !!orig : (orig ?? "");
    if (String(a) !== String(next)) alterados.add(f.field);
  }

  const seguirOuPerguntar = (rotulo: string, acao: () => void) => {
    if (alterados.size === 0 || saving) { acao(); return; }
    setEmEspera({ rotulo, acao });
  };
  const trocarAba = (chave: DrawerKind) => {
    if (chave === aba) return;
    const destino = ABAS.find((x) => x.chave === chave)?.rotulo ?? "";
    seguirOuPerguntar(`Ir para ${destino}`, () => { setEmEspera(null); setAba(chave); });
  };
  const fechar = () => seguirOuPerguntar("Fechar", () => { setEmEspera(null); onOpenChange(false); });

  // Check-out antes do check-in: avisado no próprio campo, enquanto se digita
  // (o toast continua no Salvar — é ele que impede gravar).
  const ci = String(draft["accommodation.checkInDate"] ?? "").trim();
  const co = String(draft["accommodation.checkOutDate"] ?? "").trim();
  const datasInvalidas = aba === "accommodation" && !!ci && !!co && co < ci;

  const abaAtual = ABAS.find((a) => a.chave === aba) ?? ABAS[0];
  const Icone = abaAtual.Icone;
  const tomIcone = abaAtual.tom;

  // Ordem das seções = ordem em que aparecem na lista de campos.
  const secoes: { nome: string; campos: FieldDef[] }[] = [];
  for (const f of fields) {
    const nome = f.group ?? "";
    let sec = secoes.find((x) => x.nome === nome);
    if (!sec) { sec = { nome, campos: [] }; secoes.push(sec); }
    sec.campos.push(f);
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (saving) return; if (o) onOpenChange(o); else fechar(); }}>
      <SheetContent className="w-full sm:max-w-[520px] p-0 flex flex-col gap-0">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); if (alterados.size > 0) void handleSave(); }}>
        <SheetHeader className="px-6 pt-5 pb-0 border-b space-y-0 text-left">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tomIcone}`}>
              <Icone className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              {/* O nome manda: é a pessoa que se edita, e as abas dizem o quê. */}
              <SheetTitle className="text-base leading-tight truncate">{rowName || "Colaborador"}</SheetTitle>
              <SheetDescription className="text-xs">{abaAtual.rotulo} · o que mudar aqui vai para a grade</SheetDescription>
            </div>
          </div>
          <div className="mt-3 flex gap-1" role="tablist" aria-label="Blocos da pessoa">
            {ABAS.map((a) => (
              <button
                key={a.chave}
                type="button"
                role="tab"
                aria-selected={aba === a.chave}
                disabled={saving}
                onClick={() => trocarAba(a.chave)}
                className={`-mb-px h-[38px] border-b-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60 ${
                  aba === a.chave ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
        </SheetHeader>

        <div key={aba} className="pas-entra flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {secoes.map((sec) => (
            <section key={sec.nome || "geral"}>
              {sec.nome && (
                <h3 className="mb-3 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground after:h-px after:flex-1 after:bg-border">
                  {sec.nome}
                </h3>
              )}
              <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
                {sec.campos.map((f) => {
                  const inputId = `drawer-${f.field.replace(/\./g, "-")}`;
                  const mudou = alterados.has(f.field);
                  const invalido = datasInvalidas && f.field === "accommodation.checkOutDate";
                  return (
                    <div key={f.field} className={f.span === 2 ? "col-span-2" : "col-span-1"}>
                      <Label htmlFor={inputId} className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                        {f.label}
                        {mudou && <><span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" /><span className="sr-only">Campo alterado</span></>}
                      </Label>
                      {f.type === "bool" ? (
                        <div className="flex items-center gap-2 mt-2 h-9">
                          <Switch
                            id={inputId}
                            checked={!!draft[f.field]}
                            onCheckedChange={(v) => setDraft((d) => ({ ...d, [f.field]: v }))}
                          />
                          <span className="text-sm text-muted-foreground">{draft[f.field] ? "Sim" : "Não"}</span>
                        </div>
                      ) : f.type === "select" ? (
                        <Select
                          value={draft[f.field] ? String(draft[f.field]) : SELECT_EMPTY}
                          onValueChange={(v) => setDraft((d) => ({ ...d, [f.field]: v === SELECT_EMPTY ? "" : v }))}
                        >
                          <SelectTrigger id={inputId} className="mt-1.5 h-9" aria-label={f.label}><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SELECT_EMPTY}>— Não informado —</SelectItem>
                            {(f.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="relative mt-1.5">
                          {f.type === "money" && (
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                          )}
                          <Input
                            id={inputId}
                            className={`h-9 ${f.type === "money" ? "pl-9" : ""} ${invalido ? "border-danger focus-visible:ring-danger/30" : mudou ? "border-primary/50 bg-brand-soft/40" : ""}`}
                            aria-invalid={invalido || undefined}
                            type={f.type === "time" ? "time" : f.type === "date" ? "date" : f.type === "money" || f.type === "int" ? "number" : "text"}
                            step={f.type === "money" ? "0.01" : undefined}
                            inputMode={f.type === "money" ? "decimal" : f.type === "int" ? "numeric" : undefined}
                            value={typeof draft[f.field] === "string" ? (draft[f.field] as string) : ""}
                            placeholder={f.placeholder}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.field]: e.target.value }))}
                          />
                        </div>
                      )}
                      {invalido && <p className="mt-1 text-2xs font-medium leading-snug text-danger" role="alert">A saída não pode ser antes da entrada.</p>}
                      {f.hint && <p className="mt-1 text-2xs leading-snug text-muted-foreground">{f.hint}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {emEspera ? (
          <div className="pas-entra flex items-center gap-2 border-t border-warning/30 bg-warning-soft px-6 py-3" role="alertdialog" aria-label="Alterações não salvas">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span className="mr-auto min-w-0 text-sm font-medium leading-tight text-warning">
              {alterados.size} {alterados.size === 1 ? "alteração não salva" : "alterações não salvas"}
              <span className="block text-2xs font-normal text-warning/90">{emEspera.rotulo} descarta o que mudou em {abaAtual.rotulo}.</span>
            </span>
            <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setEmEspera(null)} autoFocus>Continuar</Button>
            <Button type="button" size="sm" variant="outline" className="shrink-0 border-warning/40 bg-card text-warning hover:bg-warning/10" onClick={() => emEspera.acao()}>
              Descartar
            </Button>
          </div>
        ) : (
        <SheetFooter className="px-6 py-3.5 border-t bg-surface-muted flex-row items-center gap-2 sm:justify-between sm:space-x-0">
          <span className="text-xs text-muted-foreground mr-auto" aria-live="polite">
            {alterados.size === 0
              ? "Nenhuma alteração"
              : <span className="inline-flex items-center gap-1.5 font-medium text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />{`${alterados.size} ${alterados.size === 1 ? "campo alterado" : "campos alterados"}`}</span>}
          </span>
          <Button type="button" variant="ghost" onClick={fechar} disabled={saving}>Cancelar</Button>
          <Button type="submit" disabled={saving || alterados.size === 0} data-testid="button-save-drawer">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="h-4 w-4 mr-2" aria-hidden="true" />}
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </SheetFooter>
        )}
        </form>
      </SheetContent>
    </Sheet>
  );
}
