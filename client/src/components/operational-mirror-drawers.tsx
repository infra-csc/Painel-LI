import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plane, BedDouble, Loader2, Save, Luggage } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type FieldType = "text" | "money" | "time" | "int" | "bool" | "date" | "select";
type DrawerKind = "ticket" | "accommodation" | "extras";

interface FieldDef {
  field: string;
  label: string;
  type: FieldType;
  span?: 1 | 2;
  placeholder?: string;
  get?: (row: any) => any;
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
  { field: "ticket.value", label: "Valor da passagem (R$)", type: "money", span: 2 },
  { field: "ticket.departureAirport", label: "Aeroporto ida", type: "text" },
  { field: "ticket.actualDepartureTime", label: "Hora ida", type: "time" },
  { field: "ticket.returnOriginAirport", label: "Aeroporto volta", type: "text" },
  { field: "ticket.actualReturnTime", label: "Hora volta", type: "time" },
  { field: "ticket.locator", label: "Localizador", type: "text" },
  { field: "ticket.ticketCompany", label: "Empresa", type: "text" },
  { field: "ticket.purchaseOrderNumber", label: "OC", type: "text" },
  { field: "ticket.checkIn3", label: "Check-in 3", type: "text" },
];

const ACC_FIELDS: FieldDef[] = [
  { field: "accommodation.hotelName", label: "Hotel", type: "text", span: 2 },
  { field: "accommodation.reservationNumber", label: "Nº da reserva", type: "text", placeholder: "Ex: RES-123456" },
  { field: "accommodation.roomType", label: "Tipo de quarto", type: "select", options: ROOM_TYPE_OPTIONS },
  { field: "accommodation.checkInDate", label: "Check-in (data)", type: "date" },
  { field: "accommodation.checkInTime", label: "Check-in (hora)", type: "time" },
  { field: "accommodation.checkOutDate", label: "Check-out (data)", type: "date" },
  { field: "accommodation.checkOutTime", label: "Check-out (hora)", type: "time" },
  { field: "accommodation.nightsCount", label: "Diárias (noites)", type: "int" },
  { field: "accommodation.dailyRate", label: "Valor diária (R$)", type: "money" },
  { field: "accommodation.totalCents", label: "Hotel total (R$)", type: "money" },
  { field: "accommodation.paymentCompany", label: "Empresa pagamento", type: "text" },
  { field: "accommodation.hotelOc", label: "OC", type: "text" },
  { field: "accommodation.checkIn4", label: "Check-in 4", type: "text" },
  { field: "accommodation.lateCheckout", label: "Late check-out", type: "bool", span: 2 },
];

const EXTRAS_FIELDS: FieldDef[] = [
  { field: "baggage.amountCents", label: "Bagagem extra (R$)", type: "money", get: (r) => r?.baggage?.extraCents },
  { field: "baggage.oc", label: "OC bagagem", type: "text", get: (r) => r?.baggage?.oc },
  { field: "baggage.checkIn", label: "Check-in bagagem", type: "text", get: (r) => r?.baggage?.checkIn },
  { field: "uber.amountCents", label: "Uber (R$)", type: "money", get: (r) => r?.uber?.totalCents },
  { field: "uber.oc", label: "OC Uber", type: "text", get: (r) => r?.uber?.oc },
  { field: "uber.checkIn", label: "Check-in Uber", type: "text", get: (r) => r?.uber?.checkIn },
  { field: "carRental.company", label: "Empresa locação", type: "text", span: 2, get: (r) => r?.carRental?.company },
  { field: "carRental.amountCents", label: "Locação (R$)", type: "money", get: (r) => r?.carRental?.totalCents },
  { field: "carRental.oc", label: "OC locação", type: "text", get: (r) => r?.carRental?.oc },
  { field: "carRental.checkIn", label: "Check-in locação", type: "text", get: (r) => r?.carRental?.checkIn },
];

function getValue(source: any, field: string): any {
  // field like "ticket.value" — source is the ticket/accommodation object directly
  const key = field.split(".")[1];
  return source ? source[key] : null;
}
function readVal(f: FieldDef, source: any): any {
  return f.get ? f.get(source) : getValue(source, f.field);
}

function toInput(value: any, type: FieldType): string {
  if (value === null || value === undefined) return "";
  if (type === "money") return ((value as number) / 100).toString();
  return String(value);
}

function parseInput(raw: string, type: FieldType): any {
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
  source: any; // ticket / accommodation object, or full row for extras
  onSaveMany: (rowId: string, changes: Record<string, any>) => Promise<void>;
}

export function EditDrawer({ open, onOpenChange, kind, rowId, rowName, source, onSaveMany }: EditDrawerProps) {
  const { toast } = useToast();
  const fields = kind === "ticket" ? TICKET_FIELDS : kind === "accommodation" ? ACC_FIELDS : EXTRAS_FIELDS;
  // O rascunho guarda o TEXTO digitado (e boolean para switches). Antes ele guardava
  // centavos e o input relia toInput(): digitar "10," / "10." era desfeito a cada tecla,
  // impossibilitando informar centavos. A conversão acontece só no salvamento.
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !kind) return;
    const init: Record<string, any> = {};
    for (const f of fields) {
      const v = readVal(f, source);
      init[f.field] = f.type === "bool" ? !!v : toInput(v, f.type);
    }
    setDraft(init);
  }, [open, kind, rowId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!rowId || saving) return;
    const changes: Record<string, any> = {};
    for (const f of fields) {
      const orig = readVal(f, source);
      const next = f.type === "bool" ? !!draft[f.field] : parseInput(draft[f.field] ?? "", f.type);
      const a = f.type === "money" || f.type === "int" ? (orig ?? null) : f.type === "bool" ? !!orig : (orig ?? "");
      if (String(a) !== String(next)) changes[f.field] = next;
    }
    if (Object.keys(changes).length === 0) { onOpenChange(false); return; }
    // Check-out não pode ser antes do check-in (compara YYYY-MM-DD como texto).
    if (kind === "accommodation") {
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
    } catch (err: any) {
      // Os campos são gravados um a um, então a falha pode ser parcial: não afirmar
      // que nada foi salvo. O painel fica aberto com os valores digitados para revisão.
      toast({
        title: "Erro ao salvar",
        description: err?.status === 401
          ? "Sua sessão expirou. Entre novamente — parte dos campos pode não ter sido gravada."
          : (err?.body?.message || "Parte dos campos pode não ter sido gravada. Confira os valores e tente novamente."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {kind === "ticket" ? <Plane className="h-5 w-5 text-indigo-500" /> : kind === "accommodation" ? <BedDouble className="h-5 w-5 text-emerald-500" /> : <Luggage className="h-5 w-5 text-amber-500" />}
            {kind === "ticket" ? "Editar Passagem" : kind === "accommodation" ? "Editar Hospedagem" : "Editar Extras (Bagagem · Uber · Locação)"}
          </SheetTitle>
          <SheetDescription>{rowName || "Colaborador"}</SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3 py-5">
          {fields.map((f) => {
            const inputId = `drawer-${f.field.replace(/\./g, "-")}`;
            return (
              <div key={f.field} className={f.span === 2 ? "col-span-2" : "col-span-1"}>
                <Label htmlFor={inputId} className="text-xs text-muted-foreground">{f.label}</Label>
                {f.type === "bool" ? (
                  <div className="flex items-center gap-2 mt-1.5">
                    <Switch
                      id={inputId}
                      checked={!!draft[f.field]}
                      onCheckedChange={(v) => setDraft((d) => ({ ...d, [f.field]: v }))}
                    />
                    <span className="text-sm">{draft[f.field] ? "Sim" : "Não"}</span>
                  </div>
                ) : f.type === "select" ? (
                  <Select
                    value={draft[f.field] ? String(draft[f.field]) : SELECT_EMPTY}
                    onValueChange={(v) => setDraft((d) => ({ ...d, [f.field]: v === SELECT_EMPTY ? "" : v }))}
                  >
                    <SelectTrigger id={inputId} className="mt-1" aria-label={f.label}><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_EMPTY}>— Não informado —</SelectItem>
                      {(f.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={inputId}
                    className="mt-1"
                    type={f.type === "time" ? "time" : f.type === "date" ? "date" : f.type === "money" || f.type === "int" ? "number" : "text"}
                    step={f.type === "money" ? "0.01" : undefined}
                    value={draft[f.field] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.field]: e.target.value }))}
                  />
                )}
              </div>
            );
          })}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-drawer">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
