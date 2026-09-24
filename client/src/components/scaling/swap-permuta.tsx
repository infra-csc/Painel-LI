/**
 * Trocas entre DUAS vagas na Escalação (dono, 14/09) — as peças de tela:
 * escolher a outra vaga da permuta e mostrar quem vai para onde, saindo de
 * onde (permuta e transferência). A regra pura está em shared/swap-permuta.ts.
 */
import { useMemo, useState } from "react";
import { ArrowRight, MapPin, Search } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { periodosSeSobrepoem, rotuloDaVaga } from "@shared/swap-permuta";
import { normalizarBusca } from "./scaling-queue";
import type { NormalizedSwap } from "./scaling-utils";

const ddmm = (d: unknown): string => {
  const s = d ? String(d).slice(0, 10) : "";
  return s.length === 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "";
};

/** "26/09 – 27/09" */
export function periodoCurto(i: Pick<TeamInclusion, "scheduleStartDate" | "scheduleEndDate">): string {
  const a = ddmm(i.scheduleStartDate);
  const b = ddmm(i.scheduleEndDate);
  return a && b ? `${a} – ${b}` : a || b || "sem período";
}

export interface CandidataDaPermuta {
  inc: TeamInclusion;
  mesmoPeriodo: boolean;
}

/**
 * Vagas que podem entrar na permuta: com colaborador (outro que não o desta
 * vaga), ativas e fora da Validação. As do MESMO período vêm primeiro — é o
 * caso que motivou a permuta; as demais continuam na lista, pela data.
 */
export function candidatasDaPermuta(vaga: TeamInclusion, todas: TeamInclusion[]): CandidataDaPermuta[] {
  return todas
    .filter((i) =>
      i.id !== vaga.id
      && !!i.collaboratorId
      && i.collaboratorId !== vaga.collaboratorId
      && !(i as { deletedAt?: unknown }).deletedAt
      && i.status !== "cancelado"
      && i.phase !== "sugestao")
    .map((inc) => ({ inc, mesmoPeriodo: periodosSeSobrepoem(vaga, inc) }))
    .sort((x, y) =>
      Number(y.mesmoPeriodo) - Number(x.mesmoPeriodo)
      || String(x.inc.scheduleStartDate ?? "").localeCompare(String(y.inc.scheduleStartDate ?? "")));
}

const POR_VEZ = 30;

/** Lista com busca das vagas candidatas — nome do colaborador, evento, função ou #número. */
export function EscolherVagaDaPermuta({ candidatas, getCollaboratorName, getEventName, getFunctionName, onEscolher }: {
  candidatas: CandidataDaPermuta[];
  getCollaboratorName: (id?: string | null) => string;
  getEventName: (id: string | null) => string;
  getFunctionName: (id: string | null) => string;
  onEscolher: (vaga: TeamInclusion) => void;
}) {
  const [busca, setBusca] = useState("");
  const filtradas = useMemo(() => {
    const q = normalizarBusca(busca);
    if (!q) return candidatas;
    return candidatas.filter(({ inc }) =>
      normalizarBusca([
        getCollaboratorName(inc.collaboratorId),
        getEventName(inc.eventId),
        getFunctionName(inc.functionId),
        `#${inc.inclusionNumber}`,
      ].join(" ")).includes(q));
    // Os getters mudam de identidade a cada render da página; a lista só
    // depende das candidatas e do texto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatas, busca]);
  const visiveis = filtradas.slice(0, POR_VEZ);

  return (
    <div className="rounded-lg border border-border overflow-hidden" data-testid="escolher-vaga-permuta">
      <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
        <Search className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          autoFocus
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por colaborador, evento ou #vaga…"
          aria-label="Buscar a vaga do outro colaborador"
          data-testid="input-busca-vaga-permuta"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-muted-foreground"
        />
      </div>
      <ul className="max-h-[260px] overflow-y-auto divide-y divide-border">
        {visiveis.map(({ inc, mesmoPeriodo }) => (
          <li key={inc.id}>
            <button
              type="button"
              onClick={() => onEscolher(inc)}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-brand-soft"
              data-testid={`opcao-vaga-permuta-${inc.id}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground break-words">{getCollaboratorName(inc.collaboratorId)}</span>
                <span className="block text-2xs text-muted-foreground break-words">
                  #{inc.inclusionNumber} · {getEventName(inc.eventId)} · {getFunctionName(inc.functionId)} · {periodoCurto(inc)}
                </span>
              </span>
              {mesmoPeriodo && (
                <span className="shrink-0 rounded-md bg-brand-soft px-2 py-0.5 text-2xs font-semibold text-primary">Mesmo período</span>
              )}
            </button>
          </li>
        ))}
        {visiveis.length === 0 && (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            {candidatas.length === 0 ? "Nenhuma outra vaga com colaborador escalado." : "Nenhuma vaga com esse nome."}
          </li>
        )}
      </ul>
      {filtradas.length > visiveis.length && (
        <p className="border-t border-border bg-background px-3 py-2 text-2xs text-muted-foreground">
          Mostrando {visiveis.length} de {filtradas.length} — use a busca.
        </p>
      )}
    </div>
  );
}

/**
 * Quem vai para qual vaga e de onde sai — o mesmo texto nas duas vagas da
 * permuta, sem depender de qual delas está aberta.
 */
export function LinhasDaPermuta({ swap, getCollaboratorName }: {
  swap: NormalizedSwap;
  getCollaboratorName: (id?: string | null) => string;
}) {
  const outraVaga = rotuloDaVaga(swap.pairedInclusionNumber, swap.pairedEventName)
    + (swap.pairedFunctionName ? ` · ${swap.pairedFunctionName}` : "");
  const linhas = [
    { chave: "chega", nome: getCollaboratorName(swap.newCollaboratorId), para: rotuloDaVaga(swap.inclusionNumber, swap.eventName), saiDe: swap.newCity },
    { chave: "sai", nome: getCollaboratorName(swap.currentCollaboratorId), para: outraVaga, saiDe: swap.pairedNewCity },
  ];
  return (
    <ul className="space-y-1.5 text-2xs" data-testid="swap-permuta-linhas">
      {linhas.map((l) => (
        <li key={l.chave} className="flex items-start gap-1.5">
          <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 break-words text-slate-600">
            <span className="font-semibold text-foreground">{l.nome || "?"}</span> vai para a{" "}
            <span className="font-medium text-slate-700">{l.para}</span>
            {l.saiDe && (
              <>
                {" · "}
                <MapPin className="inline h-2.5 w-2.5 -mt-0.5" aria-hidden="true" /> sai de{" "}
                <span className="font-medium text-slate-700">{l.saiDe}</span>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Transferência (14/09): de qual vaga a pessoa sai, para qual vai, de onde sai
 * — e que a vaga de origem fica aberta. Mesmo texto nas duas vagas.
 */
export function LinhasDaTransferencia({ swap, getCollaboratorName }: {
  swap: NormalizedSwap;
  getCollaboratorName: (id?: string | null) => string;
}) {
  const origem = rotuloDaVaga(swap.pairedInclusionNumber, swap.pairedEventName)
    + (swap.pairedFunctionName ? ` · ${swap.pairedFunctionName}` : "");
  const destino = rotuloDaVaga(swap.inclusionNumber, swap.eventName);
  return (
    <div className="space-y-1 text-2xs" data-testid="swap-transferencia-linhas">
      <p className="flex items-start gap-1.5 text-slate-600">
        <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 break-words">
          <span className="font-semibold text-foreground">{getCollaboratorName(swap.newCollaboratorId) || "?"}</span> sai da{" "}
          <span className="font-medium text-slate-700">{origem}</span> e vai para a{" "}
          <span className="font-medium text-slate-700">{destino}</span>
          {swap.newCity && (
            <>
              {" · "}
              <MapPin className="inline h-2.5 w-2.5 -mt-0.5" aria-hidden="true" /> sai de{" "}
              <span className="font-medium text-slate-700">{swap.newCity}</span>
            </>
          )}
        </span>
      </p>
      <p className="pl-[18px] text-muted-foreground">A {origem.split(" · ")[0]} fica aberta — a área escala outra pessoa nela.</p>
    </div>
  );
}
