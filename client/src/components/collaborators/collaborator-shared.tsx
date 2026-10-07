/**
 * Colaboradores — configurações, formatadores e peças pequenas compartilhadas
 * pela lista e pelos diálogos (25/09, extraídos de pages/collaborator-management.tsx).
 *
 * 07/10 (redesenho): nomes pela regra única de `@/lib/format` (vários registros
 * chegam do RH em CAIXA ALTA — "MARIA DAS GRAÇAS" vira "Maria das Graças", com
 * "da/de/do" minúsculos, o que a cópia local não fazia); pílulas de situação e
 * de tipo no desenho da família Passagens/Hospedagem (cantos de 6px, 22px de
 * altura); a situação junta status + inativo numa peça só.
 */
import { Ban } from "lucide-react";
import type { Collaborator } from "@shared/schema";
import { initials as iniciaisDoNome, toTitleCase as nomeFormatado } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ─── Avatar helpers ────────────────────────────────────────────────────────
// Cores por TOKEN (a paleta de `@/lib/format` usa cores cruas do Tailwind).
// Só tons sem significado (marca, informação, neutro): verde/âmbar/vermelho no
// avatar competiam com as pílulas de situação ao lado ("é pendente?").
const AVATAR_COLORS = [
  ["bg-brand-soft", "text-primary"],
  ["bg-info-soft", "text-info"],
  ["bg-muted", "text-slate-700"],
];
export function avatarClasses(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
export function initials(name: string) {
  return iniciaisDoNome(name);
}
/** "MARIA DAS GRAÇAS" → "Maria das Graças" — a regra única do app (`@/lib/format`). */
export function toTitleCase(str: string) {
  return nomeFormatado(str);
}

// ─── Config ────────────────────────────────────────────────────────────────
export const PAGE_SIZE = 25;

export const STATUS_CFG: Record<string, { label: string; dotCls: string; badgeCls: string }> = {
  pendente:  { label: "Pendente",  dotCls: "bg-warning-strong", badgeCls: "bg-warning-soft text-warning" },
  aprovado:  { label: "Aprovado",  dotCls: "bg-success-strong", badgeCls: "bg-success-soft text-success" },
  rejeitado: { label: "Rejeitado", dotCls: "bg-danger-strong",  badgeCls: "bg-danger-soft text-danger" },
  inativo:   { label: "Inativo",   dotCls: "bg-slate-400",      badgeCls: "bg-muted text-muted-foreground" },
};

/** Tipo de vínculo: etiqueta neutra — o tipo não é bom nem ruim, então não ganha cor. */
export const TYPE_CFG: Record<string, { label: string; cls: string; extenso: string }> = {
  freela: { label: "Freela", cls: "bg-muted text-slate-700", extenso: "Freelancer" },
  casa:   { label: "Casa",   cls: "bg-muted text-slate-700", extenso: "Da casa" },
  local:  { label: "Local",  cls: "bg-muted text-slate-700", extenso: "Contratação local" },
};

// `doc` pode vir ausente: GET /api/collaborators só entrega documento, nascimento,
// telefone e endereço para quem vê dados pessoais (projeção por papel, 23/09).
export function formatDocument(doc: string | null | undefined, type: string | null | undefined) {
  if (!doc) return "";
  if (type === "cpf") return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return doc;
}
export function formatDate(dateStr: string) {
  // Recorta só a parte "YYYY-MM-DD": se vier um ISO completo, o dia sairia
  // como "01T00:00:00". Formatação por string evita o deslocamento de fuso
  // que new Date("YYYY-MM-DD") causa em Brasília.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr).trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dateStr;
}

/** Rótulo do documento secundário (quando o tipo não veio, é o "outro" do principal). */
export function rotuloDoSecundario(c: Pick<Collaborator, "secondaryDocumentType" | "documentType">) {
  return (c.secondaryDocumentType || (c.documentType === "cpf" ? "rg" : "cpf")).toUpperCase();
}

const PILULA = "inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-2xs font-medium whitespace-nowrap";

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pendente;
  return (
    <span className={cn(PILULA, cfg.badgeCls)}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dotCls}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

export function TipoBadge({ type }: { type: string }) {
  const cfg = TYPE_CFG[type] ?? TYPE_CFG.local;
  return <span className={cn(PILULA, cfg.cls)} title={cfg.extenso}>{cfg.label}</span>;
}

/**
 * Situação do cadastro: o status e, quando inativo, a pílula "Inativo" com o
 * motivo no tooltip (a rota /inactivate não mexe no status — as duas coexistem).
 */
export function SituacaoDoColaborador({ c, empilhar = true, semDica = false }: { c: Collaborator; empilhar?: boolean; semDica?: boolean }) {
  return (
    <div className={cn("flex items-start gap-1", empilhar ? "flex-col" : "flex-row flex-wrap items-center")}>
      <StatusBadge status={c.status} />
      {c.active === false && semDica && (
        <span className={cn(PILULA, "bg-muted text-slate-600")}><Ban className="w-3 h-3" aria-hidden="true" /> Inativo</span>
      )}
      {c.active === false && !semDica && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={c.inactiveReason ? 0 : undefined} className={cn(PILULA, "bg-muted text-slate-600 cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
              <Ban className="w-3 h-3" aria-hidden="true" /> Inativo
              {c.inactiveReason && <span className="sr-only">: {c.inactiveReason}</span>}
            </span>
          </TooltipTrigger>
          {c.inactiveReason && <TooltipContent className="max-w-[260px]">{c.inactiveReason}</TooltipContent>}
        </Tooltip>
      )}
    </div>
  );
}

// ─── Detail row helper ─────────────────────────────────────────────────────
/** Par rótulo/valor da ficha. Valor ausente vira "Não informado", em cinza. */
export function DetailRow({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  const vazio = !value || value === "—";
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-2xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 text-sm break-words", vazio ? "text-muted-foreground" : "text-foreground", mono && !vazio && "font-mono tabular-nums text-[13px]")}>
        {vazio ? "Não informado" : value}
      </dd>
    </div>
  );
}

/** Círculo com as iniciais, na cor derivada do nome. `size` = classes de tamanho/fonte. */
export function Avatar({ name, size = "w-9 h-9 text-xs" }: { name: string; size?: string }) {
  const [bg, tx] = avatarClasses(name);
  return (
    <div aria-hidden="true" className={`${size} rounded-full flex items-center justify-center font-semibold tracking-[0.02em] shrink-0 ${bg} ${tx}`}>
      {initials(name)}
    </div>
  );
}

/** Cartãozinho "quem é" dos diálogos de aprovação e inativação: avatar, nome, documento e tipo. */
export function CollaboratorChip({ c, size = "w-9 h-9 text-xs", rounded = "rounded-lg", nameCls = "text-sm font-semibold text-foreground" }: {
  c: Collaborator; size?: string; rounded?: string; nameCls?: string;
}) {
  const tipo = TYPE_CFG[c.type]?.label;
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 bg-surface-muted ${rounded} border border-border`}>
      <Avatar name={c.fullName} size={size} />
      <div className="min-w-0 flex-1">
        <p className={`${nameCls} truncate`}>{toTitleCase(c.fullName)}</p>
        <p className="text-2xs text-muted-foreground truncate">
          {[tipo, c.city].filter(Boolean).join(" · ")}
          {c.officialDocument && <span className="font-mono tabular-nums">{tipo || c.city ? " · " : ""}{formatDocument(c.officialDocument, c.documentType)}</span>}
        </p>
      </div>
    </div>
  );
}
