/**
 * Colaboradores — configurações, formatadores e peças pequenas compartilhadas
 * pela lista e pelos diálogos (25/09, extraídos de pages/collaborator-management.tsx).
 */
import type { Collaborator } from "@shared/schema";

// ─── Avatar helpers ────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  ["bg-brand-soft", "text-primary"],
  ["bg-brand-soft", "text-primary"],
  ["bg-success-soft", "text-success"],
  ["bg-warning-soft", "text-warning"],
  ["bg-brand-soft", "text-primary"],
  ["bg-info-soft", "text-info"],
  ["bg-warning-soft", "text-warning"],
  ["bg-danger-soft", "text-danger"],
  ["bg-brand-soft", "text-primary"],
  ["bg-info-soft", "text-info"],
];
export function avatarClasses(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
export function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ─── Config ────────────────────────────────────────────────────────────────
export const PAGE_SIZE = 25;

export const STATUS_CFG: Record<string, { label: string; dotCls: string; badgeCls: string }> = {
  pendente:  { label: "Pendente",  dotCls: "bg-warning-strong",   badgeCls: "bg-warning-soft text-warning border border-warning/25" },
  aprovado:  { label: "Aprovado",  dotCls: "bg-success-strong", badgeCls: "bg-success-soft text-success border border-success/25" },
  rejeitado: { label: "Rejeitado", dotCls: "bg-danger-strong",     badgeCls: "bg-danger-soft text-danger border border-danger/25" },
  inativo:   { label: "Inativo",   dotCls: "bg-slate-400",   badgeCls: "bg-muted text-muted-foreground border border-border" },
};

export const TYPE_CFG: Record<string, { label: string; cls: string }> = {
  freela: { label: "Freela", cls: "bg-brand-soft text-primary border border-primary/25" },
  casa:   { label: "Casa",   cls: "bg-surface-muted text-slate-600 border border-border" },
  local:  { label: "Local",  cls: "bg-brand-soft text-primary border border-primary/25" },
};

// `doc` pode vir ausente: GET /api/collaborators só entrega documento, nascimento,
// telefone e endereço para admin, Compras e RH (projeção por papel, 23/09).
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

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pendente;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold ${cfg.badgeCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dotCls}`} />
      {cfg.label}
    </span>
  );
}

// ─── Detail row helper ─────────────────────────────────────────────────────
export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
      <p className="text-sm text-slate-700 font-medium">{value}</p>
    </div>
  );
}

/** Círculo com as iniciais, na cor derivada do nome. `size` = classes de tamanho/fonte. */
export function Avatar({ name, size = "w-9 h-9 text-sm" }: { name: string; size?: string }) {
  const [bg, tx] = avatarClasses(name);
  return (
    <div className={`${size} rounded-full flex items-center justify-center font-bold shrink-0 ${bg} ${tx}`}>
      {initials(name)}
    </div>
  );
}

/** Cartãozinho "quem é" dos diálogos de aprovação e inativação: avatar, nome e documento. */
export function CollaboratorChip({ c, size, rounded = "rounded-lg", nameCls = "text-xs font-semibold text-slate-700" }: {
  c: Collaborator; size: string; rounded?: string; nameCls?: string;
}) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 bg-surface-muted ${rounded} border border-border`}>
      <Avatar name={c.fullName} size={size} />
      <div className="min-w-0">
        <p className={`${nameCls} truncate`}>{toTitleCase(c.fullName)}</p>
        {c.officialDocument && (
          <p className="text-2xs text-muted-foreground font-mono">{formatDocument(c.officialDocument, c.documentType)}</p>
        )}
      </div>
    </div>
  );
}
