/**
 * Escolher quem vai para a vaga, DENTRO do cartão (01/09).
 *
 * Antes a escolha morava num popover: a linha do cartão abria uma camada por
 * cima do modal, e a pessoa perdia de vista o período, a função e o evento —
 * justamente o que decide se aquele nome cabe ali.
 *
 * Agora a linha vira campo de busca e os candidatos aparecem como linhas do
 * mesmo cartão. Duas regras do handoff que valem a explicação:
 *
 * - **Ordem alfabética, sempre.** Colaborador não tem função pré-definida:
 *   qualquer um pode ser escalado em qualquer vaga, e não existe "mais
 *   provável" para ordenar por relevância. Uma ordem estável é o que permite
 *   procurar com o olho.
 * - **Conflito de agenda em âmbar, com o botão desabilitado.** Quem já está
 *   escalado no mesmo período aparece na lista — some-lo faria a pessoa
 *   procurar por um nome que existe e não achar, sem entender por quê.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Check, Search, X } from "lucide-react";
import { fixEncoding } from "@/lib/utils";
import type { Collaborator, TeamInclusion } from "@shared/schema";
import { normalizarBusca as normalizar } from "./scaling-queue";

/** Quantos candidatos a lista mostra antes de pedir a busca. */
const POR_VEZ = 4;

const COLLAB_TYPE: Record<string, string> = { casa: "Casa", freela: "Freela", local: "Local" };


export interface EscolherColaboradorProps {
  colaboradores: Collaborator[] | undefined;
  /** A vaga sendo preenchida — referência para o conflito de agenda. */
  inclusion: TeamInclusion;
  /** Conflitos deste colaborador com a agenda dele. */
  getConflitos: (collaboratorId: string, ref: TeamInclusion) => {
    sameEvent: TeamInclusion[];
    dateOverlap: TeamInclusion[];
  };
  getEventName: (eventId: string | null) => string;
  onEscolher: (collaboratorId: string) => void;
  /** Fecha a escolha sem mexer em nada (só quando já havia alguém). */
  onCancelar?: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
}

export default function EscolherColaborador({
  colaboradores, inclusion, getConflitos, getEventName, onEscolher, onCancelar,
  disabled = false, disabledReason,
}: EscolherColaboradorProps) {
  const [busca, setBusca] = useState("");
  const [verTodos, setVerTodos] = useState(false);

  const ordenados = useMemo(
    () => (colaboradores ?? [])
      .filter((c) => c.status === "aprovado" && (c as any).active !== false)
      .sort((a, b) => fixEncoding(a.fullName).localeCompare(fixEncoding(b.fullName), "pt-BR", { sensitivity: "base" })),
    [colaboradores],
  );

  const filtrados = useMemo(() => {
    const q = normalizar(busca);
    if (!q) return ordenados;
    return ordenados.filter((c) => normalizar(fixEncoding(c.fullName)).includes(q));
  }, [ordenados, busca]);

  // O conflito é calculado só para quem está À VISTA: varrer a agenda de
  // centenas de colaboradores a cada tecla seria trabalho jogado fora.
  const visiveis = verTodos || busca.trim() ? filtrados.slice(0, 40) : filtrados.slice(0, POR_VEZ);
  const restantes = filtrados.length - visiveis.length;

  if (disabled) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500" role="status">
        {disabledReason ?? "Não é possível alterar o colaborador desta vaga agora."}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden" data-testid="escolher-colaborador">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-background px-3 py-2">
        <Search className="w-3.5 h-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          autoFocus
          type="text"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setVerTodos(false); }}
          placeholder="Buscar colaborador…"
          aria-label="Buscar colaborador"
          data-testid="input-busca-colaborador"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400"
        />
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            title="Cancelar a troca de colaborador"
            aria-label="Cancelar"
            data-testid="button-cancelar-escolha"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <ul className="divide-y divide-slate-50">
        {visiveis.map((c) => {
          const { sameEvent, dateOverlap } = getConflitos(c.id, inclusion);
          const conflito = sameEvent.length > 0 || dateOverlap.length > 0;
          const ondeConflita = [...sameEvent, ...dateOverlap]
            .slice(0, 2)
            .map((i) => getEventName(i.eventId))
            .join(" · ");
          const nome = fixEncoding(c.fullName);
          const tipo = COLLAB_TYPE[c.type ?? ""] ?? null;
          return (
            <li key={c.id}>
              <button
                type="button"
                disabled={conflito}
                onClick={() => onEscolher(c.id)}
                // "já tem escalação" em vez de "já está escalado": a frase
                // carrega o nome de uma pessoa real, e a forma neutra serve
                // para qualquer uma delas.
                title={conflito
                  ? `${nome} já tem escalação no mesmo período${ondeConflita ? ` (${ondeConflita})` : ""}. Libere a outra antes.`
                  : `Escalar ${nome} nesta vaga`}
                data-testid={`opcao-colaborador-${c.id}`}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  conflito ? "cursor-not-allowed bg-[#FFFBEB]" : "hover:bg-brand-soft"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] ${conflito ? "text-[#92400E]" : "text-slate-900"}`}>{nome}</span>
                  {(c.city || tipo) && (
                    <span className={`block truncate text-[11px] ${conflito ? "text-[#B45309]" : "text-muted-foreground"}`}>
                      {[c.city, tipo].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                {conflito ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold text-[#92400E]">
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" />Conflito
                  </span>
                ) : (
                  <Check className="w-4 h-4 shrink-0 text-primary opacity-0 group-hover:opacity-100" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}

        {visiveis.length === 0 && (
          <li className="px-3 py-4 text-center text-[12px] text-muted-foreground">
            Nenhum colaborador com esse nome.
          </li>
        )}
      </ul>

      {restantes > 0 && (
        <button
          type="button"
          onClick={() => setVerTodos(true)}
          className="w-full border-t border-slate-100 bg-background px-3 py-2 text-left text-[11px] text-muted-foreground hover:text-primary"
          data-testid="button-mais-colaboradores"
        >
          +{restantes} {restantes === 1 ? "colaborador" : "colaboradores"} em ordem alfabética — use a busca
        </button>
      )}
    </div>
  );
}
