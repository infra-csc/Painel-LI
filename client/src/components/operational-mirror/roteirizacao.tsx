/**
 * Roteirização de Uber — uma linha por pessoa, com os dois trechos lado a lado
 * (25/09 — extraída da página; redesenho 07/10).
 *
 * Cada bloco (ida e volta) carrega a régua do próprio cálculo no cabeçalho: o
 * horário do carro não é um palpite, e dizer de onde ele sai evita a pergunta
 * "por que 02:45?" toda vez.
 *
 * 07/10: eram 15 colunas numa tabela de 1.560px — rolava de lado até em 1920.
 * Agora são 7, em duas linhas por célula, com os mesmos dados: a pessoa (e o
 * departamento embaixo); em cada trecho, o voo (dia e data; aeroporto · voo,
 * e na volta "· pousa 19:55"), o horário do carro e o carro (número e
 * situação; o titular embaixo). Cabe em 1366 sem rolagem lateral.
 */
import { CheckCheck, Loader2, PlaneTakeoff, PlaneLanding, RefreshCw, X } from "lucide-react";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import type { MirrorRow, MirrorCollaborator, UberGroup } from "@shared/operational-mirror-types";
import { cn } from "@/lib/utils";
import { MoverPara } from "./mover-para";
import { diaSemana, fmtDate, memberInfo, useLarguraMinima } from "./mirror-shared";

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
  const tom = grupo.confirmed ? "text-success" : "text-primary";
  const dica = grupo.confirmed
    ? "Carro confirmado — reabra para ajustar o horário"
    : manual
      ? `Ajustado à mão${sugerido ? ` · o cálculo sugeria ${sugerido}` : ""}`
      : "Calculado a partir dos voos do carro";

  if (!canEdit || grupo.confirmed) {
    return <span className={`font-semibold tabular-nums ${tom}`} title={dica}>{valor || <span className="font-normal text-muted-foreground">a definir</span>}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
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
        className={`h-7 w-[84px] rounded-md border border-transparent bg-transparent px-1 text-xs font-semibold tabular-nums transition-colors hover:border-input hover:bg-card focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 ${tom}`}
        data-testid={`uber-hora-${grupo.id}`}
      />
      {manual && sugerido && (
        <button type="button" title={`Voltar ao horário calculado (${sugerido})`} aria-label="Voltar ao horário calculado"
          onClick={() => onPatch(grupo.id, { manualTime: null })}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary">
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
  return <th scope="col" className={`h-8 whitespace-nowrap border-b border-border px-2.5 text-left align-middle text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground ${className}`}>{children}</th>;
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
  /** Ação no cabeçalho (Refazer sugestões). */
  acao?: React.ReactNode;
  /** Quantas pessoas estão fora da roteirização (a lista fica logo abaixo). */
  fora?: number;
}

export function Roteirizacao({
  linhas, naIda, naVolta, totalIda, totalVolta, collabById, canEdit,
  onConfirm, onPatch, onMover, pendingId, onSkipUber, gruposIda, gruposVolta, acao, fora = 0,
}: RoteirizacaoProps) {
  /** Um carro se descreve por quem já está nele — é assim que se decide mover. */
  const descreve = (g: UberGroup) => {
    const nomes = (g.members || []).map((m) => memberInfo(m, collabById).name.split(" ")[0]);
    return nomes.length ? `Com ${nomes.join(", ")}` : "Carro vazio";
  };
  const jaVisto = { ida: new Set<string>(), volta: new Set<string>() };
  const largo = useLarguraMinima(1024);
  const confirmados = [...gruposIda, ...gruposVolta].filter((g) => g.confirmed).length;

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
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-1" data-testid="uber-roteirizacao">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">Roteirização de Uber</h3>
        <p className="text-xs tabular-nums text-muted-foreground">
          {totalIda} {totalIda === 1 ? "carro" : "carros"} na ida · {totalVolta} na volta ·{" "}
          <span className={confirmados === totalIda + totalVolta ? "text-success" : "text-foreground"}>{confirmados} de {totalIda + totalVolta} confirmados</span>
          {fora > 0 && <> · <a href="#uber-fora" className="font-medium text-warning underline-offset-2 hover:underline">{fora} fora da roteirização</a></>}
        </p>
        <p className="hidden text-xs text-muted-foreground 2xl:block">· Quem coincide em data, aeroporto e voo divide o carro. O titular chama a corrida.</p>
        {acao && <span className="ml-auto">{acao}</span>}
      </header>

      {!largo ? (
        // Tablet e celular: um cartão por pessoa, ida em cima e volta embaixo.
        <ul className="divide-y divide-border">
          {linhas.map((l) => {
            const i = bloco(l, "ida");
            const v = bloco(l, "volta");
            const comum = { pessoa: l.row.collaborator.fullName, collabId: l.row.collaborator.id, descreve, canEdit, onConfirm, onPatch, onMover, pendingId, collabById, forma: "cartao" as const };
            return (
              <li key={l.row.teamInclusionId} className="group/linha px-4 py-3" data-testid={`rot-${l.row.teamInclusionId}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{l.row.collaborator.fullName}</p>
                    <p className="text-2xs capitalize text-muted-foreground">{l.row.function.area || l.row.function.name || "—"}</p>
                  </div>
                  {canEdit && onSkipUber && (
                    <button type="button" onClick={() => onSkipUber(l.row.teamInclusionId, true)}
                      title="Tirar da roteirização — não entra em carro nenhum e não gera custo"
                      className="esp-alvo inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-2xs font-medium text-muted-foreground transition-colors hover:bg-warning-soft hover:text-warning"
                      data-testid={`skip-uber-${l.row.teamInclusionId}`}>
                      <X className="h-3 w-3" aria-hidden="true" /> Tirar
                    </button>
                  )}
                </div>
                <div className="mt-2 space-y-1.5">
                  <CelulasDoTrecho dados={i} dir="ida" grupos={gruposIda} {...comum} />
                  <CelulasDoTrecho dados={v} dir="volta" grupos={gruposVolta} {...comum} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] border-separate border-spacing-0 text-xs">
          <thead className="bg-surface-muted">
            <tr>
              <th scope="colgroup" className="h-9 border-b border-border px-4 text-left align-middle text-2xs font-semibold uppercase tracking-[0.06em] text-slate-700">
                Pessoa
              </th>
              <th scope="colgroup" colSpan={3} className="h-9 border-b border-l-2 border-border border-l-info-strong/40 px-3 text-left align-middle">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-slate-700">
                    <PlaneTakeoff className="h-3.5 w-3.5" aria-hidden="true" /> Base × Aeroporto
                  </span>
                  <span className="text-2xs font-normal normal-case tracking-normal text-muted-foreground">
                    mesmo dia e aeroporto, voos em até 90 min → mesmo carro · sai 3h antes do voo mais cedo
                  </span>
                </span>
              </th>
              <th scope="colgroup" colSpan={3} className="h-9 border-b border-l-2 border-border border-l-primary/40 px-3 text-left align-middle">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-slate-700">
                    <PlaneLanding className="h-3.5 w-3.5" aria-hidden="true" /> Aeroporto × Base
                  </span>
                  <span className="text-2xs font-normal normal-case tracking-normal text-muted-foreground">
                    busca 15 min depois do último pouso do grupo
                  </span>
                </span>
              </th>
            </tr>
            <tr>
              <ColRot className="min-w-[160px] pl-4">Nome · departamento</ColRot>
              <ColRot className="border-l-2 border-l-info-strong/40">Voo de ida</ColRot>
              <ColRot>Sair às</ColRot>
              <ColRot className="min-w-[140px]">Carro · titular</ColRot>
              <ColRot className="border-l-2 border-l-primary/40">Voo de volta</ColRot>
              <ColRot>Buscar às</ColRot>
              <ColRot className="min-w-[140px] pr-4">Carro · titular</ColRot>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const i = bloco(l, "ida");
              const v = bloco(l, "volta");
              return (
                <tr key={l.row.teamInclusionId} className="group/linha transition-colors hover:bg-surface-muted/60" data-testid={`rot-${l.row.teamInclusionId}`}>
                  <td className="border-b border-border/60 py-1.5 pl-4 pr-2.5">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <span className="truncate">{l.row.collaborator.fullName}</span>
                      {canEdit && onSkipUber && (
                        <button type="button" onClick={() => onSkipUber(l.row.teamInclusionId, true)}
                          title="Tirar da roteirização — não entra em carro nenhum e não gera custo"
                          aria-label={`Tirar ${l.row.collaborator.fullName} da roteirização`}
                          className="esp-revela inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-warning-soft hover:text-warning focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/linha:opacity-100"
                          data-testid={`skip-uber-${l.row.teamInclusionId}`}>
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                    <span className="block text-2xs capitalize text-muted-foreground">{l.row.function.area || l.row.function.name || "—"}</span>
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
      )}
    </section>
  );
}

/** As colunas de um trecho (ida ou volta) de uma pessoa. */
function CelulasDoTrecho({
  dados, dir, pessoa, collabId, grupos, descreve, canEdit, onConfirm, onPatch, onMover, pendingId, collabById, forma = "tabela",
}: AcoesDoCarro & {
  dados: { g: UberGroup | null; n: number; cor: string; primeira: boolean; dia: string | null; data: string | null; aero: string; voo: string; pouso: string };
  dir: "ida" | "volta";
  pessoa: string;
  collabId: string | null;
  grupos: UberGroup[];
  descreve: (g: UberGroup) => string;
  /** "tabela" (≥1024) devolve <td>s; "cartao" devolve o mesmo conteúdo em blocos. */
  forma?: "tabela" | "cartao";
}) {
  const td = "border-b border-border/60 px-2.5 py-1.5 align-middle";
  const rotuloDoTrecho = (
    <span className="inline-flex w-14 shrink-0 items-center gap-1 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {dir === "ida" ? <PlaneTakeoff className="h-3.5 w-3.5" aria-hidden="true" /> : <PlaneLanding className="h-3.5 w-3.5" aria-hidden="true" />}
      {dir}
    </span>
  );
  const inicio = dir === "ida" ? "border-l-2 border-l-info-strong/40" : "border-l-2 border-l-primary/40";
  if (!dados.g) {
    // Sem trecho nesta direção: dizer isso é melhor do que três células vazias.
    if (forma === "cartao") {
      return (
        <div className="flex items-center gap-2 py-1.5">
          {rotuloDoTrecho}
          <span className="inline-flex h-[22px] items-center rounded-md bg-muted px-[7px] text-2xs font-medium text-muted-foreground">sem {dir}</span>
        </div>
      );
    }
    return (
      <td colSpan={3} className={cn(td, inicio, "text-muted-foreground", dir === "volta" && "pr-4")}>
        <span className="inline-flex h-[22px] items-center rounded-md bg-muted px-[7px] text-2xs font-medium">sem {dir}</span>
      </td>
    );
  }
  const g = dados.g;
  const membros = (g.members || []).map((m) => memberInfo(m, collabById));
  const aero = dados.aero ? dados.aero.toUpperCase() : "";
  const voo = (
    <>
        <span className="block">
          <span className="text-muted-foreground">{diaSemana(dados.data)}</span>{" "}
          <span className="tabular-nums text-foreground">{fmtDate(dados.data)}</span>
        </span>
        <span className="block text-2xs tabular-nums text-muted-foreground">
          {aero || dados.voo ? <><span className="font-mono text-foreground/80">{aero}</span>{aero && dados.voo ? " · " : ""}{dados.voo}</> : "·"}
          {dir === "volta" && dados.pouso && <> · pousa {dados.pouso}</>}
        </span>
    </>
  );
  const horario = <HorarioDoCarro grupo={g} canEdit={canEdit} onPatch={onPatch} />;
  const carro = (
    <>
        <span className="flex items-center gap-1.5">
          {/* "Carro N" em TODA linha: os carros da volta não ficam contíguos,
              porque a tabela é ordenada pela ida. */}
          <span className={`whitespace-nowrap text-2xs font-semibold uppercase tracking-wide ${TEXTO_CARRO[dados.cor]}`}>Carro {dados.n}</span>
          {dados.primeira && (g.confirmed ? (
            canEdit ? (
              <button type="button" onClick={() => onPatch(g.id, { __reabrir: true })}
                title="Reabrir — carro confirmado fica de fora do recálculo"
                className="inline-flex h-5 items-center gap-1 rounded-md border border-success/25 bg-success-soft px-1.5 text-2xs font-medium text-success transition-colors hover:border-success/50">
                <CheckCheck className="h-3 w-3" aria-hidden="true" /> ok
              </button>
            ) : <span className="inline-flex h-5 items-center gap-1 rounded-md bg-success-soft px-1.5 text-2xs font-medium text-success"><CheckCheck className="h-3 w-3" aria-hidden="true" />ok</span>
          ) : canEdit ? (
            <MotivoDesabilitado motivo="Confirmar o carro — trava o agrupamento e o horário" desabilitado={pendingId === g.id}>
              <button type="button" onClick={() => onConfirm(g.id)} disabled={pendingId === g.id}
              className="inline-flex h-5 items-center gap-1 rounded-md border border-border bg-card px-1.5 text-2xs font-medium text-slate-700 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary disabled:opacity-60"
              data-testid={`confirm-uber-${g.id}`}>
              {pendingId === g.id ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCheck className="h-3 w-3" aria-hidden="true" />} confirmar
            </button>
            </MotivoDesabilitado>
          ) : <span className="text-2xs text-muted-foreground">sugestão</span>)}
          {canEdit && collabId && (
            <span className="ml-auto">
              <MoverPara compacto pessoa={pessoa} grupoAtual={g.id} rotuloNovo="Carro só para esta pessoa"
                consequencia="O horário do carro de origem e do destino é recalculado a partir dos voos de quem sobrar em cada um."
                destinos={grupos.filter((o) => o.id !== g.id).map((o) => ({ id: o.id, descricao: descreve(o) }))}
                onMover={(para) => onMover(collabId, g.id, para)} />
            </span>
          )}
        </span>
        {dados.primeira && (canEdit ? (
          <select
            value={g.titularCollaboratorId ?? ""}
            onChange={(e) => onPatch(g.id, { titularCollaboratorId: e.target.value || null })}
            aria-label={`Titular do carro ${dados.n} da ${dir}`}
            className={cn("mt-1 block h-6 w-full max-w-[150px] rounded-md border bg-card px-1 text-2xs transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              g.titularCollaboratorId ? "border-border text-foreground" : "border-warning/40 text-warning")}
            data-testid={`uber-titular-${g.id}`}>
            <option value="">Titular…</option>
            {membros.map((op, k) => <option key={op.id ?? k} value={op.id ?? ""}>{op.name}</option>)}
          </select>
        ) : (
          <span className="mt-0.5 block text-2xs text-foreground">{membros.find((op) => op.id === g.titularCollaboratorId)?.name ?? "sem titular"}</span>
        ))}
    </>
  );
  if (forma === "cartao") {
    return (
      <div className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1.5 border-l-[3px] py-1.5 pl-2.5", FILETE[dados.cor])}>
        {rotuloDoTrecho}
        <div className="min-w-0 text-xs">{voo}</div>
        <span className="text-2xs text-muted-foreground">{dir === "ida" ? "Sair às" : "Buscar às"}</span>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
          <span>{horario}</span>
          <div className="min-w-[160px] flex-1">{carro}</div>
        </div>
      </div>
    );
  }
  return (
    <>
      <td className={cn(td, "whitespace-nowrap border-l-[3px]", FILETE[dados.cor])}>{voo}</td>
      <td className={cn(td, "whitespace-nowrap")}>{horario}</td>
      <td className={cn(td, dir === "volta" && "pr-4")}>{carro}</td>
    </>
  );
}
