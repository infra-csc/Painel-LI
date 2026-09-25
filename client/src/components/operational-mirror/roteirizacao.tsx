/**
 * Roteirização de Uber — uma linha por pessoa, com os dois trechos lado a lado
 * (25/09 — extraída da página).
 *
 * Cada bloco (ida e volta) carrega a régua do próprio cálculo no cabeçalho: o
 * horário do carro não é um palpite, e dizer de onde ele sai evita a pergunta
 * "por que 02:45?" toda vez.
 */
import { CheckCheck, Loader2, Plane, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import type { MirrorRow, MirrorCollaborator, UberGroup } from "@shared/operational-mirror-types";
import { MoverPara } from "./mover-para";
import { diaSemana, fmtDate, memberInfo } from "./mirror-shared";

/**
 * O horário do carro — e de onde ele veio.
 *
 * A cor é a informação: azul quando é o cálculo do sistema, violeta quando
 * alguém corrigiu à mão (com o `title` dizendo o que o cálculo sugeria) e
 * verde quando o carro está confirmado, e então o campo trava. Sem essa
 * distinção, "Refazer sugestões" apagava a correção sem ninguém perceber.
 */
function HorarioDoCarro({ grupo, canEdit, onPatch }: {
  grupo: UberGroup;
  canEdit: boolean;
  onPatch: (id: string, campos: Record<string, unknown>) => void;
}) {
  const manual = !!grupo.manualTime;
  const sugerido = grupo.suggestedTime || null;
  const valor = grupo.time || "";
  const tom = grupo.confirmed
    ? "text-success"
    : manual ? "text-primary" : "text-primary";
  const dica = grupo.confirmed
    ? "Carro confirmado — reabra para ajustar o horário"
    : manual
      ? `Ajustado à mão${sugerido ? ` · o cálculo sugeria ${sugerido}` : ""}`
      : "Calculado a partir dos voos do carro";

  if (!canEdit || grupo.confirmed) {
    return <span className={`font-semibold tabular-nums ${tom}`} title={dica}>{valor || <span className="font-normal text-muted-foreground">a definir</span>}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="time"
        defaultValue={valor}
        title={dica}
        aria-label="Horário do carro"
        onBlur={(e) => {
          const novo = e.target.value;
          if (novo === valor) return;
          onPatch(grupo.id, { manualTime: novo || null });
        }}
        className={`h-7 w-[92px] rounded-md border border-transparent bg-transparent px-1.5 text-xs font-semibold tabular-nums hover:border-input focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tom}`}
        data-testid={`uber-hora-${grupo.id}`}
      />
      {manual && sugerido && (
        <button type="button" title={`Voltar ao horário calculado (${sugerido})`} aria-label="Voltar ao horário calculado"
          onClick={() => onPatch(grupo.id, { manualTime: null })}
          className="text-muted-foreground transition-colors hover:text-primary">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/**
 * Cores dos carros. Aqui a cor É O DADO — quem anda junto —, e é a única
 * exceção à regra "cor = estado" desta tela. É a mesma leitura das faixas
 * coloridas da planilha da equipe, sem o banho de pastel: um filete de 3px.
 */
const COR_DO_CARRO = ["sky", "violet", "amber", "teal", "pink", "lime"] as const;
const FILETE: Record<string, string> = {
  sky: "border-l-info-strong", violet: "border-l-primary", amber: "border-l-warning-strong",
  teal: "border-l-info-strong", pink: "border-l-primary", lime: "border-l-success-strong",
};
const TEXTO_CARRO: Record<string, string> = {
  sky: "text-info", violet: "text-primary", amber: "text-warning",
  teal: "text-info", pink: "text-primary", lime: "text-success",
};
const corDoCarro = (n: number) => COR_DO_CARRO[(n - 1) % COR_DO_CARRO.length];

export interface IndiceDeCarros {
  numero: Map<string, number>;
  porPessoa: Map<string, UberGroup>;
}
export interface LinhaDaRoteirizacao {
  row: MirrorRow;
  ida?: UberGroup;
  volta?: UberGroup;
}

/** Cabeçalho de uma coluna da roteirização. */
function ColRot({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th scope="col" className={`h-7 whitespace-nowrap px-2 text-left align-middle font-medium text-muted-foreground ${className}`}>{children}</th>;
}

type AcoesDoCarro = {
  canEdit: boolean;
  onConfirm: (id: string) => void;
  onPatch: (id: string, campos: Record<string, unknown>) => void;
  onMover: (collaboratorId: string, deGrupoId: string, paraGrupoId: string | null) => void;
  pendingId: string | null | undefined;
  collabById: Map<string, MirrorCollaborator>;
};

export interface RoteirizacaoProps extends AcoesDoCarro {
  linhas: LinhaDaRoteirizacao[];
  naIda: IndiceDeCarros;
  naVolta: IndiceDeCarros;
  totalIda: number;
  totalVolta: number;
  onSkipUber?: (rowId: string, skip: boolean) => void;
  gruposIda: UberGroup[];
  gruposVolta: UberGroup[];
}

export function Roteirizacao({
  linhas, naIda, naVolta, totalIda, totalVolta, collabById, canEdit,
  onConfirm, onPatch, onMover, pendingId, onSkipUber, gruposIda, gruposVolta,
}: RoteirizacaoProps) {
  /** Um carro se descreve por quem já está nele — é assim que se decide mover. */
  const descreve = (g: UberGroup) => {
    const nomes = (g.members || []).map((m) => memberInfo(m, collabById).name.split(" ")[0]);
    return nomes.length ? `Com ${nomes.join(", ")}` : "Carro vazio";
  };
  const jaVisto = { ida: new Set<string>(), volta: new Set<string>() };

  const bloco = (l: LinhaDaRoteirizacao, dir: "ida" | "volta") => {
    const g = dir === "ida" ? l.ida : l.volta;
    const indice = dir === "ida" ? naIda : naVolta;
    const t = l.row.ticket;
    if (!g) {
      return {
        g: null, n: 0, cor: "sky", primeira: false,
        dia: null as string | null, data: null as string | null, aero: "", voo: "", pouso: "",
      };
    }
    const n = indice.numero.get(g.id) ?? 0;
    const primeira = !jaVisto[dir].has(g.id);
    if (primeira) jaVisto[dir].add(g.id);
    return {
      g, n, cor: corDoCarro(n), primeira,
      dia: g.date,
      data: g.date,
      aero: g.date ? (dir === "ida" ? t?.departureAirport : t?.returnDestinationAirport) ?? "" : "",
      voo: (dir === "ida" ? t?.actualDepartureTime : t?.actualReturnTime) ?? "",
      pouso: dir === "volta" ? (t?.returnArrivalTime ?? "") : "",
    };
  };

  return (
    <section className="rounded-lg border bg-card overflow-hidden" data-testid="uber-roteirizacao">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">Roteirização de Uber</h3>
        <p className="text-xs text-muted-foreground">
          Quem coincide em data, aeroporto e voo divide o carro. O titular chama a corrida.
        </p>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {totalIda} {totalIda === 1 ? "carro" : "carros"} na ida · {totalVolta} na volta
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1560px] text-xs">
          <thead>
            <tr className="border-b bg-muted/60">
              <th scope="col" colSpan={2} className="h-8 border-r-2 border-r-slate-300 px-3 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pessoa
              </th>
              <th scope="col" colSpan={6} className="h-8 border-r-2 border-r-slate-300 px-3 text-left">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-slate-700">
                    <Plane className="h-3.5 w-3.5" aria-hidden="true" /> Base × Aeroporto
                  </span>
                  <span className="text-2xs font-normal normal-case tracking-normal text-muted-foreground">
                    mesmo dia e aeroporto, voos em até 90 min → mesmo carro · sai 3h antes do voo mais cedo
                  </span>
                </span>
              </th>
              <th scope="col" colSpan={7} className="h-8 px-3 text-left">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-slate-700">
                    <Plane className="h-3.5 w-3.5 rotate-180" aria-hidden="true" /> Aeroporto × Base
                  </span>
                  <span className="text-2xs font-normal normal-case tracking-normal text-muted-foreground">
                    busca 15 min depois do último pouso do grupo
                  </span>
                </span>
              </th>
            </tr>
            <tr className="border-b bg-muted/30">
              <ColRot className="min-w-[210px]">Nome</ColRot>
              <ColRot className="min-w-[120px] border-r-2 border-r-slate-300">Departamento</ColRot>
              <ColRot>Dia</ColRot><ColRot>Data ida</ColRot><ColRot>Aero</ColRot><ColRot>Voo</ColRot>
              <ColRot>Sair às</ColRot>
              <ColRot className="min-w-[170px] border-r-2 border-r-slate-300">Titular / situação</ColRot>
              <ColRot>Dia</ColRot><ColRot>Data volta</ColRot><ColRot>Aero</ColRot><ColRot>Voo</ColRot><ColRot>Pouso</ColRot>
              <ColRot>Buscar às</ColRot>
              <ColRot className="min-w-[170px]">Titular / situação</ColRot>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const i = bloco(l, "ida");
              const v = bloco(l, "volta");
              return (
                <tr key={l.row.teamInclusionId} className="border-b border-border/40 hover:bg-primary/[0.03]" data-testid={`rot-${l.row.teamInclusionId}`}>
                  <td className="px-2 py-1.5 font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{l.row.collaborator.fullName}</span>
                      {canEdit && onSkipUber && (
                        <button type="button" onClick={() => onSkipUber(l.row.teamInclusionId, true)}
                          title="Tirar da roteirização — não entra em carro nenhum e não gera custo"
                          aria-label={`Tirar ${l.row.collaborator.fullName} da roteirização`}
                          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-warning"
                          data-testid={`skip-uber-${l.row.teamInclusionId}`}>
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="border-r-2 border-r-slate-300 px-2 py-1.5 capitalize text-muted-foreground">
                    {l.row.function.area || l.row.function.name || "—"}
                  </td>

                  {/* Ida */}
                  <CelulasDoTrecho
                    dados={i} dir="ida" pessoa={l.row.collaborator.fullName} collabId={l.row.collaborator.id}
                    grupos={gruposIda} descreve={descreve} canEdit={canEdit}
                    onConfirm={onConfirm} onPatch={onPatch} onMover={onMover} pendingId={pendingId}
                    collabById={collabById}
                  />
                  {/* Volta */}
                  <CelulasDoTrecho
                    dados={v} dir="volta" pessoa={l.row.collaborator.fullName} collabId={l.row.collaborator.id}
                    grupos={gruposVolta} descreve={descreve} canEdit={canEdit}
                    onConfirm={onConfirm} onPatch={onPatch} onMover={onMover} pendingId={pendingId}
                    collabById={collabById}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** As colunas de um trecho (ida ou volta) de uma pessoa. */
function CelulasDoTrecho({
  dados, dir, pessoa, collabId, grupos, descreve, canEdit, onConfirm, onPatch, onMover, pendingId, collabById,
}: AcoesDoCarro & {
  dados: { g: UberGroup | null; n: number; cor: string; primeira: boolean; dia: string | null; data: string | null; aero: string; voo: string; pouso: string };
  dir: "ida" | "volta";
  pessoa: string;
  collabId: string | null;
  grupos: UberGroup[];
  descreve: (g: UberGroup) => string;
}) {
  const fim = dir === "ida" ? "border-r-2 border-r-slate-300" : "";
  if (!dados.g) {
    // Sem trecho nesta direção: dizer isso é melhor do que seis células vazias.
    return (
      <>
        <td colSpan={dir === "ida" ? 5 : 6} className="px-2 py-1.5 text-muted-foreground">sem {dir}</td>
        <td className={`px-2 py-1.5 ${fim}`} />
      </>
    );
  }
  const g = dados.g;
  const membros = (g.members || []).map((m) => memberInfo(m, collabById));
  return (
    <>
      <td className={`border-l-[3px] px-2 py-1.5 text-muted-foreground ${FILETE[dados.cor]}`}>{diaSemana(dados.data)}</td>
      <td className="px-2 py-1.5 tabular-nums">{fmtDate(dados.data)}</td>
      <td className="px-2 py-1.5 font-mono text-2xs uppercase">{dados.aero || <span className="text-muted-foreground">·</span>}</td>
      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{dados.voo || "·"}</td>
      {dir === "volta" && <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{dados.pouso || "·"}</td>}
      <td className="px-2 py-1.5">
        <HorarioDoCarro grupo={g} canEdit={canEdit} onPatch={onPatch} />
      </td>
      <td className={`px-2 py-1.5 ${fim}`}>
        <span className="flex flex-wrap items-center gap-1.5">
          {/* "Carro N" em TODA linha: os carros da volta não ficam contíguos,
              porque a tabela é ordenada pela ida. */}
          <span className={`text-2xs font-semibold uppercase tracking-wide ${TEXTO_CARRO[dados.cor]}`}>Carro {dados.n}</span>
          {dados.primeira ? (
            <>
              {canEdit ? (
                <select
                  value={g.titularCollaboratorId ?? ""}
                  onChange={(e) => onPatch(g.id, { titularCollaboratorId: e.target.value || null })}
                  aria-label={`Titular do carro ${dados.n} da ${dir}`}
                  className="h-6 min-w-[110px] max-w-[130px] rounded border bg-background px-1 text-2xs"
                  data-testid={`uber-titular-${g.id}`}>
                  <option value="">Titular…</option>
                  {membros.map((op, k) => <option key={op.id ?? k} value={op.id ?? ""}>{op.name}</option>)}
                </select>
              ) : (
                <span className="text-2xs">{membros.find((op) => op.id === g.titularCollaboratorId)?.name ?? "sem titular"}</span>
              )}
              {g.confirmed ? (
                canEdit ? (
                  <button type="button" onClick={() => onPatch(g.id, { __reabrir: true })}
                    title="Reabrir — carro confirmado fica de fora do recálculo"
                    className="inline-flex h-6 items-center gap-1 rounded border border-success/25 bg-success-soft px-1.5 text-2xs font-medium text-success">
                    <CheckCheck className="h-3 w-3" aria-hidden="true" /> ok
                  </button>
                ) : <Badge className="h-5 bg-success px-1.5 text-2xs hover:bg-success/90">ok</Badge>
              ) : canEdit ? (
                <MotivoDesabilitado motivo="Confirmar o carro — trava o agrupamento e o horário" desabilitado={pendingId === g.id}>
                  <button type="button" onClick={() => onConfirm(g.id)} disabled={pendingId === g.id}
                  className="inline-flex h-6 items-center gap-1 rounded border border-warning/25 bg-warning-soft px-1.5 text-2xs font-medium text-warning disabled:opacity-60"
                  data-testid={`confirm-uber-${g.id}`}>
                  {pendingId === g.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-3 w-3" aria-hidden="true" />} confirmar
                </button>
                </MotivoDesabilitado>
              ) : <span className="text-2xs text-muted-foreground">sugestão</span>}
            </>
          ) : null}
          {canEdit && collabId && (
            <MoverPara pessoa={pessoa} grupoAtual={g.id} rotuloNovo="Carro só para esta pessoa"
              consequencia="O horário do carro de origem e do destino é recalculado a partir dos voos de quem sobrar em cada um."
              destinos={grupos.filter((o) => o.id !== g.id).map((o) => ({ id: o.id, descricao: descreve(o) }))}
              onMover={(para) => onMover(collabId, g.id, para)} />
          )}
        </span>
      </td>
    </>
  );
}
