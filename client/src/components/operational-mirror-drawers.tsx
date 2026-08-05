import { useEffect, useState } from "react";
import { parseBrNumberOrNull } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plane, BedDouble, Loader2, Save, Luggage } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type FieldType = "text" | "money" | "time" | "int" | "bool";
type DrawerKind = "ticket" | "accommodation" | "extras";

interface FieldDef {
  field: string;
  label: string;
  type: FieldType;
  span?: 1 | 2;
  placeholder?: string;
  get?: (row: any) => any;
}

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
  { field: "accommodation.nightsCount", label: "Diárias (noites)", type: "int" },
  { field: "accommodation.roomType", label: "Tipo de quarto", type: "text" },
  { field: "accommodation.dailyRate", label: "Valor diária (R$)", type: "money" },
  { field: "accommodation.totalCents", label: "Hotel total (R$)", type: "money" },
  { field: "accommodation.hotelName", label: "Hotel", type: "text", span: 2 },
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
    // parseBrNumberOrNull entende o separador de milhar; o replace(",", ".")
    // anterior transformava "1.234,56" em 1.234 e gravava R$ 1,23.
    const n = parseBrNumberOrNull(t);
    return n !== null ? Math.round(n * 100) : null;
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
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !kind) return;
    const init: Record<string, any> = {};
    for (const f of fields) init[f.field] = readVal(f, source);
    setDraft(init);
  }, [open, kind, rowId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!rowId) return;
    const changes: Record<string, any> = {};
    for (const f of fields) {
      const orig = readVal(f, source);
      const next = draft[f.field];
      const a = f.type === "money" || f.type === "int" ? (orig ?? null) : f.type === "bool" ? !!orig : (orig ?? "");
      const b = f.type === "bool" ? !!next : next;
      if (String(a) !== String(b)) changes[f.field] = b;
    }
    if (Object.keys(changes).length === 0) { onOpenChange(false); return; }
    setSaving(true);
    try {
      await onSaveMany(rowId, changes);
      toast({ title: "Salvo", description: `${Object.keys(changes).length} campo(s) atualizado(s).` });
      onOpenChange(false);
    } catch {
      toast({ title: "Erro ao salvar", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {kind === "ticket" ? <Plane className="h-5 w-5 text-indigo-500" /> : kind === "accommodation" ? <BedDouble className="h-5 w-5 text-emerald-500" /> : <Luggage className="h-5 w-5 text-amber-500" />}
            {kind === "ticket" ? "Editar Passagem" : kind === "accommodation" ? "Editar Hospedagem" : "Editar Extras (Bagagem · Uber · Locação)"}
          </SheetTitle>
          <SheetDescription>{rowName || "Colaborador"}</SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3 py-5">
          {fields.map((f) => (
            <div key={f.field} className={f.span === 2 ? "col-span-2" : "col-span-1"}>
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              {f.type === "bool" ? (
                <div className="flex items-center gap-2 mt-1.5">
                  <Switch
                    checked={!!draft[f.field]}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, [f.field]: v }))}
                  />
                  <span className="text-sm">{draft[f.field] ? "Sim" : "Não"}</span>
                </div>
              ) : (
                <Input
                  className="mt-1"
                  type={f.type === "time" ? "time" : f.type === "money" || f.type === "int" ? "number" : "text"}
                  step={f.type === "money" ? "0.01" : undefined}
                  value={toInput(draft[f.field], f.type)}
                  placeholder={f.placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.field]: parseInput(e.target.value, f.type) }))}
                />
              )}
            </div>
          ))}
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
