/**
 * Escolha dos colaboradores atendidos por um contrato (26/10). Uma empreitada
 * atende várias pessoas; um MEI, normalmente uma. Busca por nome, número ou
 * CPF (o DP recebe o CPF do servidor), escolhidos viram etiquetas removíveis.
 * Sem popover: a lista abre embaixo do campo, dentro do próprio formulário —
 * funciona igual no celular e não briga com o foco do diálogo.
 */
import { useMemo, useState } from "react";
import { Check, Search, UserPlus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Collaborator } from "@shared/schema";
import { normalizarBusca } from "@shared/contratos";
import { formatCpf, toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_SUGESTOES = 8;

export function SeletorDeColaboradores({ escolhidos, onChange, id }: { escolhidos: string[]; onChange: (ids: string[]) => void; id?: string }) {
  const [busca, setBusca] = useState("");
  const { data: todos = [], isLoading } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"], staleTime: 60_000 });
  const porId = useMemo(() => new Map(todos.map((c) => [c.id, c])), [todos]);
  const sugestoes = useMemo(() => {
    const q = normalizarBusca(busca);
    if (!q) return [];
    const digitos = busca.replace(/\D/g, "");
    return todos
      .filter((c) => c.active !== false)
      .filter((c) => normalizarBusca(c.fullName).includes(q)
        || (digitos.length >= 3 && String(c.officialDocument ?? "").replace(/\D/g, "").includes(digitos))
        || String(c.collaboratorNumber) === busca.trim())
      .slice(0, MAX_SUGESTOES);
  }, [busca, todos]);

  const alternar = (cid: string) => onChange(escolhidos.includes(cid) ? escolhidos.filter((x) => x !== cid) : [...escolhidos, cid]);

  return (
    <div className="space-y-2">
      {escolhidos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Colaboradores escolhidos">
          {escolhidos.map((cid) => {
            const c = porId.get(cid);
            return (
              <li key={cid} className="ctr-chip inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card pl-2.5 pr-1 text-xs text-foreground">
                <span className="max-w-[220px] truncate">{c ? toTitleCase(c.fullName) : "Colaborador"}</span>
                {c && <span className="tabular-nums text-muted-foreground">nº {c.collaboratorNumber}</span>}
                <button type="button" onClick={() => alternar(cid)} aria-label={`Tirar ${c ? toTitleCase(c.fullName) : "colaborador"}`}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && busca) { e.preventDefault(); e.stopPropagation(); setBusca(""); } }}
          placeholder={isLoading ? "Carregando colaboradores…" : "Buscar por nome, nº ou CPF"}
          aria-label="Buscar colaborador para vincular"
          className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary focus:ring-[3px] focus:ring-primary/12"
          data-testid="ctr-busca-colaborador"
        />
      </div>
      {busca.trim() && (
        <ul className="ctr-entra max-h-[232px] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-1" role="listbox" aria-label="Colaboradores encontrados">
          {sugestoes.length === 0 && <li className="px-3 py-2.5 text-xs text-muted-foreground">Ninguém com “{busca.trim()}”.</li>}
          {sugestoes.map((c) => {
            const on = escolhidos.includes(c.id);
            return (
              <li key={c.id} role="option" aria-selected={on}>
                <button type="button" onClick={() => { alternar(c.id); setBusca(""); }}
                  className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none", on && "text-primary")}>
                  <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", on ? "border-primary bg-primary text-white" : "border-border text-muted-foreground")} aria-hidden="true">
                    {on ? <Check className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{toTitleCase(c.fullName)}</span>
                  <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                    nº {c.collaboratorNumber}{c.documentType === "cpf" && c.officialDocument ? ` · ${formatCpf(c.officialDocument)}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
