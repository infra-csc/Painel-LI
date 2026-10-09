/**
 * Roteirização de Uber — por CARRO (redesenho 09/10).
 *
 * Era uma tabela por PESSOA, com ida e volta lado a lado: "Carro 2" se
 * repetia em linhas soltas (a tabela era ordenada pela ida, então os carros
 * da volta nunca ficavam juntos), o titular e o confirmar só apareciam na
 * primeira linha do carro, e não dava para ver de relance quem vai em qual
 * carro, quantas pessoas e a que horas sai.
 *
 * Agora a unidade é o carro. Ida e volta são ABAS, não colunas: acontecem em
 * dias diferentes, são combinadas separadamente, e o "Carro 1" da ida não tem
 * relação nenhuma com o "Carro 1" da volta — lado a lado, as duas colunas
 * sugeriam uma correspondência que não existe. Cada aba ganha a largura toda.
 *
 * Cada carro é um bloco: no cabeçalho, número, data, a que horas sai,
 * aeroporto, quantas pessoas, titular e confirmar; no corpo, uma
 * pessoa por linha com departamento e o voo dela. Quem ficou fora daquela
 * direção vem num bloco próprio no fim, com o motivo.
 *
 * Regra do dono (09/10): "Na ida é Norte × Aeroporto, na volta Hotel ×
 * Aeroporto." Nas duas abas o carro vai PARA o aeroporto e sai com a
 * antecedência antes do voo mais cedo (shared/uber-routing.ts).
 */
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCheck, Loader2, PlaneLanding, PlaneTakeoff, RefreshCw, UserX, X } from "lucide-react";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import type { MirrorRow, MirrorCollaborator, UberGroup } from "@shared/operational-mirror-types";
import { cn } from "@/lib/utils";
import { MoverPara } from "./mover-para";
import { HOTEL_PADRAO, ORIGEM_NORTE, vooDoCarro } from "@shared/uber-routing";
import { diaSemana, fmtDate, memberInfo, UBER_ROTA } from "./mirror-shared";

type Direcao = "ida" | "volta";

/**
 * O horário do carro — e de onde ele veio.
 *
 * A cor é a informação: azul quando é o cálculo do sistema (ou um ajuste à
 * mão, com o `title` dizendo o que o cálculo sugeria e o botão de voltar ao
 * calculado) e verde quando o carro está confirmado, e então o campo trava.
 * Sem essa distinção, "Refazer sugestões" apagava a correção sem ninguém perceber.
 */
function HorarioDoCarro({ grupo, canEdit, onPatch, rotulo }: {
  grupo: UberGroup;
  canEdit: boolean;
  onPatch: (id: string, campos: Record<string, unknown>) => void;
  /** "Horário de saída do carro 1" — o campo sozinho não diz de qual carro é. */
  rotulo: string;
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
    return (
      <span className={`text-base font-semibold leading-none tabular-nums ${tom}`} title={dica}>
        {valor || <span className="text-sm font-normal text-warning">a definir</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        type="time"
        defaultValue={valor}
        title={dica}
        aria-label={rotulo}
        onBlur={(e) => {
          const novo = e.target.value;
          if (novo === valor) return;
          onPatch(grupo.id, { manualTime: novo || null });
        }}
        className={`esp-alvo h-8 w-[92px] rounded-md border border-transparent bg-transparent px-1 text-base font-semibold tabular-nums transition-colors hover:border-input hover:bg-card focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 ${tom}`}
        data-testid={`uber-hora-${grupo.id}`}
      />
      {manual && sugerido && (
        <button type="button" title={`Voltar ao horário calculado (${sugerido})`} aria-label="Voltar ao horário calculado"
          onClick={() => onPatch(grupo.id, { manualTime: null })}
          className="esp-alvo inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </span>
  );
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
  /** Linhas do espelho: departamento, passagem e "não vai de Uber". */
  rows: MirrorRow[];
  gruposIda: UberGroup[];
  gruposVolta: UberGroup[];
  onSkipUber?: (rowId: string, skip: boolean) => void;
  /** Ação no cabeçalho (Refazer sugestões). */
  acao?: ReactNode;
  /** Quantas pessoas não estão em carro nenhum (nem na ida nem na volta). */
  fora?: number;
  /** Período do evento — para apontar voo com data fora dele. */
  evento?: { startDate: string | null; endDate: string | null } | null;
}

// ─── Datas ────────────────────────────────────────────────────────────────

const DIA_LONGO: Record<string, string> = {
  dom: "Domingo", seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", "sáb": "Sábado",
};
const diaDoAno = (d: string | null | undefined): number | null => {
  const m = String(d ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 : null;
};
/** "20/11" — o ano só aparece quando não é o do evento (é justamente o que chama atenção). */
function dataCurta(d: string | null | undefined, anoDoEvento: string | null): string {
  const m = String(d ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return fmtDate(d);
  return anoDoEvento && m[1] !== anoDoEvento ? `${m[3]}/${m[2]}/${m[1]}` : `${m[3]}/${m[2]}`;
}
/**
 * Voo com data longe do evento — mais de uma semana antes do início ou depois
 * do fim. É quase sempre erro de digitação na passagem (o ano de outro
 * evento, o mês trocado). Só aponta; não muda carro nem horário.
 */
const FOLGA_DIAS = 7;
function criaForaDoEvento(evento: RoteirizacaoProps["evento"]) {
  const ini = diaDoAno(evento?.startDate);
  const fim = diaDoAno(evento?.endDate ?? evento?.startDate);
  return (d: string | null | undefined): boolean => {
    const dia = diaDoAno(d);
    if (dia == null || ini == null || fim == null) return false;
    return dia < ini - FOLGA_DIAS || dia > fim + FOLGA_DIAS;
  };
}

/** "21/11 a 22/11/2026" (ou só "21/11/2026" num evento de um dia). */
function periodo(evento: RoteirizacaoProps["evento"]): string | null {
  const ini = evento?.startDate;
  if (!ini) return null;
  const fim = evento?.endDate || ini;
  if (fim === ini) return fmtDate(ini);
  const mesmoAno = ini.slice(0, 4) === fim.slice(0, 4);
  return `${mesmoAno ? fmtDate(ini).slice(0, 5) : fmtDate(ini)} a ${fmtDate(fim)}`;
}

/** O sinal na linha da pessoa, quando só o voo dela está fora (o carro não). */
function AlertaData() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-2xs font-medium leading-tight text-warning"
      data-testid="uber-alerta-data">
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      data do voo fora do evento — conferir a passagem
    </span>
  );
}

// ─── Regras de apresentação ───────────────────────────────────────────────

/** Ordem de leitura: dia, depois horário — quem sai antes aparece antes. */
const ordenar = (gs: UberGroup[]) =>
  [...gs].sort((a, b) => `${a.date ?? "9"}${a.time || "99"}`.localeCompare(`${b.date ?? "9"}${b.time || "99"}`));

/**
 * Carro da volta montado pela regra ANTIGA (antes de 09/10: aeroporto → Norte,
 * buscando depois do pouso). Só sobra em carro CONFIRMADO — o recálculo não
 * mexe nele —, e é dito como era: aeroporto na origem, "busca às".
 */
const ehAeroporto = (s: string | null | undefined) => /^[A-Z]{3}$/i.test(String(s ?? "").trim());
const voltaAntiga = (g: UberGroup, dir: Direcao) => dir === "volta" && ehAeroporto(g.origin) && !ehAeroporto(g.destination);

/**
 * Regra do dono (09/10): nas duas direções o carro vai PARA o aeroporto —
 * ida da Norte (ou da cidade de saída), volta do hotel do evento.
 */
const aeroportoDoCarro = (g: UberGroup, dir: Direcao) => ((voltaAntiga(g, dir) ? g.origin : g.destination) ?? "").toUpperCase();
/** O outro ponto do carro, quando não é o padrão da aba (Norte na ida; hotel sem nome na volta). */
const localDoCarro = (g: UberGroup, dir: Direcao) => {
  const local = voltaAntiga(g, dir) ? g.destination : g.origin;
  return local && local !== HOTEL_PADRAO && local !== ORIGEM_NORTE ? local : null;
};

/** O voo desta pessoa nesta direção, como está na passagem: data, aeroporto de embarque e partida. */
function vooDaPessoa(r: MirrorRow | undefined, g: UberGroup, dir: Direcao) {
  const v = vooDoCarro(r?.ticket, dir);
  return {
    data: v.data ?? g.date,
    aero: (v.aeroporto || aeroportoDoCarro(g, dir) || "").toUpperCase(),
    decola: v.hora ?? "",
  };
}

/** Por que a pessoa não está em carro nenhum nesta direção. */
function motivoFora(r: MirrorRow, dir: Direcao): { texto: string; tom: "neutro" | "alerta" | "info" } {
  if (r.skipUber) return { texto: "não vai de Uber", tom: "neutro" };
  const t = r.ticket;
  if (!t) return { texto: "sem passagem lançada", tom: "alerta" };
  // A mesma leitura da passagem que o servidor usa para montar o carro.
  const v = vooDoCarro(t, dir);
  if (!v.data) return { texto: `sem voo de ${dir} lançado`, tom: "alerta" };
  if (!v.aeroporto) return { texto: "passagem sem aeroporto", tom: "alerta" };
  return { texto: "ainda sem carro — Refazer sugestões inclui", tom: "info" };
}

const pessoas = (n: number) => `${n} ${n === 1 ? "pessoa" : "pessoas"}`;
const carros = (n: number) => `${n} ${n === 1 ? "carro" : "carros"}`;

// ─── Tela ─────────────────────────────────────────────────────────────────

export function Roteirizacao({
  rows, gruposIda, gruposVolta, collabById, canEdit, onConfirm, onPatch, onMover, pendingId,
  onSkipUber, acao, fora = 0, evento,
}: RoteirizacaoProps) {
  const [aba, setAba] = useState<Direcao>(() => (gruposIda.length === 0 && gruposVolta.length > 0 ? "volta" : "ida"));
  const abas = useRef<Record<Direcao, HTMLButtonElement | null>>({ ida: null, volta: null });
  const foraDoEvento = criaForaDoEvento(evento);
  const anoDoEvento = evento?.startDate?.slice(0, 4) ?? null;
  const periodoDoEvento = periodo(evento);
  const rowByCollab = new Map(rows.filter((r) => r.collaborator.id).map((r) => [r.collaborator.id as string, r]));
  const total = gruposIda.length + gruposVolta.length;
  const confirmados = [...gruposIda, ...gruposVolta].filter((g) => g.confirmed).length;

  const resumoDe = (dir: Direcao) => {
    const gs = dir === "ida" ? gruposIda : gruposVolta;
    const emCarro = new Set<string>();
    let alertas = 0;
    for (const g of gs) {
      if (foraDoEvento(g.date)) alertas++;
      for (const m of g.members || []) {
        if (!m.collaboratorId) continue;
        emCarro.add(m.collaboratorId);
        if (foraDoEvento(vooDaPessoa(rowByCollab.get(m.collaboratorId), g, dir).data) && !foraDoEvento(g.date)) alertas++;
      }
    }
    const foraDaDirecao = rows.filter((r) => r.skipUber || (r.collaborator.id && !emCarro.has(r.collaborator.id)));
    return { gs: ordenar(gs), confirmados: gs.filter((g) => g.confirmed).length, pessoas: emCarro.size, alertas, foraDaDirecao };
  };
  const resumo = { ida: resumoDe("ida"), volta: resumoDe("volta") };
  const atual = resumo[aba];

  // Setas trocam de aba (padrão de tablist); Home/End vão às pontas.
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const alvo: Direcao | null = e.key === "ArrowRight" || e.key === "End" ? "volta"
      : e.key === "ArrowLeft" || e.key === "Home" ? "ida" : null;
    if (!alvo) return;
    e.preventDefault();
    setAba(alvo);
    abas.current[alvo]?.focus();
  };

  return (
    <section className="esp-uber space-y-3" data-testid="uber-roteirizacao" aria-labelledby="uber-titulo">
      {/* Cabeçalho da visão: o que é, o placar e a ação. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h3 id="uber-titulo" className="text-sm font-semibold text-foreground">Roteirização de Uber</h3>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {carros(total)} ·{" "}
            <span className={confirmados === total ? "font-medium text-success" : "font-medium text-foreground"}>{confirmados} de {total} confirmados</span>
            {fora > 0 && <> · <a href="#uber-fora" className="font-medium text-warning underline-offset-2 hover:underline">{fora} fora da roteirização</a></>}
            <span className="hidden xl:inline"> · Quem coincide em data, aeroporto e voo divide o carro. O titular chama a corrida.</span>
          </p>
        </div>
        {acao && <span className="ml-auto">{acao}</span>}
      </header>

      {/* Ida | Volta */}
      <div role="tablist" aria-label="Direção" onKeyDown={teclas}
        className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-muted p-1 sm:inline-grid sm:w-auto">
        {(["ida", "volta"] as const).map((dir) => {
          const ativo = aba === dir;
          const r = resumo[dir];
          const Icone = dir === "ida" ? PlaneTakeoff : PlaneLanding;
          return (
            <button key={dir} type="button" role="tab" id={`uber-aba-${dir}`} aria-selected={ativo} aria-controls={`uber-painel-${dir}`}
              tabIndex={ativo ? 0 : -1} ref={(el) => { abas.current[dir] = el; }}
              onClick={() => setAba(dir)}
              className={cn(
                "esp-uber-aba esp-alvo inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                ativo ? "bg-card text-foreground shadow-1" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
              )}
              data-testid={`uber-aba-${dir}`}>
              <Icone className={cn("h-4 w-4 shrink-0", ativo ? "text-primary" : "")} aria-hidden="true" />
              <span className="truncate">
                {dir === "ida" ? "Ida" : "Volta"}
                <span className="hidden font-normal text-muted-foreground sm:inline"> · {UBER_ROTA[dir]}</span>
              </span>
              <span className={cn("rounded-md px-1.5 text-2xs font-semibold tabular-nums", ativo ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground")}>
                {r.gs.length}
              </span>
              {r.alertas > 0 && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-label={`${r.alertas} ${r.alertas === 1 ? "data" : "datas"} a conferir`} />}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`uber-painel-${aba}`} aria-labelledby={`uber-aba-${aba}`} className="space-y-3" key={aba}>
        {/* A régua do cálculo: o horário do carro não é palpite. */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">
            {carros(atual.gs.length)} · {pessoas(atual.pessoas)} ·{" "}
            <span className={atual.gs.length > 0 && atual.confirmados === atual.gs.length ? "text-success" : ""}>{atual.confirmados} de {atual.gs.length} confirmados</span>
          </span>
          {atual.alertas > 0 && <span className="font-medium text-warning">· {atual.alertas} {atual.alertas === 1 ? "data" : "datas"} a conferir</span>}
          <span>
            · {aba === "ida"
              ? "mesmo dia e aeroporto, voos em até 90 min → mesmo carro · sai 3h antes do voo mais cedo"
              : "mesmo dia, hotel e aeroporto, voos em até 90 min → mesmo carro · sai 3h antes do voo de volta mais cedo"}
          </span>
        </p>

        {atual.gs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground" data-testid={`uber-sem-${aba}`}>
            Nenhum carro de {aba} ainda. {canEdit ? "Refazer sugestões monta os carros a partir dos voos lançados." : ""}
          </div>
        ) : (
          <DiasDeCarros
            dir={aba} grupos={atual.gs} rowByCollab={rowByCollab} foraDoEvento={foraDoEvento} anoDoEvento={anoDoEvento} periodoDoEvento={periodoDoEvento}
            canEdit={canEdit} onConfirm={onConfirm} onPatch={onPatch} onMover={onMover} pendingId={pendingId}
            collabById={collabById} onSkipUber={onSkipUber}
          />
        )}

        {atual.foraDaDirecao.length > 0 && (
          <BlocoFora dir={aba} linhas={atual.foraDaDirecao} canEdit={canEdit} onSkipUber={onSkipUber} />
        )}
      </div>
    </section>
  );
}

// ─── Carros, agrupados por dia ────────────────────────────────────────────

type PropsDosCarros = AcoesDoCarro & {
  dir: Direcao;
  /** Já ordenados por dia e horário; o número do carro é a posição aqui. */
  grupos: UberGroup[];
  rowByCollab: Map<string, MirrorRow>;
  foraDoEvento: (d: string | null | undefined) => boolean;
  anoDoEvento: string | null;
  /** "21/11 a 22/11/2026" — dito no aviso de data estranha. */
  periodoDoEvento: string | null;
  onSkipUber?: (rowId: string, skip: boolean) => void;
};

function DiasDeCarros(props: PropsDosCarros) {
  const { grupos } = props;
  const numero = new Map(grupos.map((g, i) => [g.id, i + 1]));
  const dias: { data: string | null; gs: UberGroup[] }[] = [];
  for (const g of grupos) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.data === g.date) ultimo.gs.push(g);
    else dias.push({ data: g.date, gs: [g] });
  }
  return (
    <div className="space-y-5">
      {dias.map((d) => {
        const n = d.gs.reduce((s, g) => s + (g.members?.length ?? 0), 0);
        const estranha = props.foraDoEvento(d.data);
        return (
          <div key={d.data ?? "sem-data"} className="space-y-2.5">
            <h4 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className={cn("font-semibold", estranha ? "text-warning" : "text-foreground")}>
                {d.data ? `${DIA_LONGO[diaSemana(d.data)] ?? diaSemana(d.data)}, ${fmtDate(d.data)}` : "Sem data"}
              </span>
              <span className="tabular-nums text-muted-foreground">· {carros(d.gs.length)} · {pessoas(n)}</span>
            </h4>
            {d.gs.map((g) => <CartaoDoCarro key={g.id} {...props} g={g} n={numero.get(g.id) ?? 0} />)}
          </div>
        );
      })}
    </div>
  );
}

function CartaoDoCarro({
  g, n, dir, grupos, rowByCollab, foraDoEvento, anoDoEvento, periodoDoEvento, canEdit, onConfirm, onPatch, onMover, pendingId, collabById, onSkipUber,
}: PropsDosCarros & { g: UberGroup; n: number }) {
  const membros = (g.members || []).map((m) => memberInfo(m, collabById));
  const aero = aeroportoDoCarro(g, dir);
  const local = localDoCarro(g, dir);
  // Só carro confirmado da regra antiga (antes de 09/10) ainda "busca".
  const antiga = voltaAntiga(g, dir);
  const estranha = foraDoEvento(g.date);
  const titular = membros.find((m) => m.id && m.id === g.titularCollaboratorId);
  /**
   * Um carro se descreve pelo número que está na tela, quando sai e quem já
   * está nele — é assim que se decide mover ("Carro 4 · 06:50 · com Ana, Bia").
   */
  const descreve = (o: UberGroup) => {
    const nomes = (o.members || []).map((m) => memberInfo(m, collabById).name.split(" ")[0]);
    const quando = [`${diaSemana(o.date)} ${dataCurta(o.date, anoDoEvento)}`, o.time].filter(Boolean).join(" ");
    return `Carro ${grupos.indexOf(o) + 1} · ${quando} · ${nomes.length ? `com ${nomes.join(", ")}` : "vazio"}`;
  };
  const pendente = pendingId === g.id;

  const confirmar = g.confirmed ? (
    canEdit ? (
      <button type="button" onClick={() => onPatch(g.id, { __reabrir: true })}
        title="Reabrir — carro confirmado fica de fora do recálculo"
        className="esp-alvo inline-flex h-8 items-center gap-1.5 rounded-md border border-success/25 bg-success-soft px-2.5 text-xs font-medium text-success transition-colors hover:border-success/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Confirmado
      </button>
    ) : (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-success-soft px-2.5 text-xs font-medium text-success">
        <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Confirmado
      </span>
    )
  ) : canEdit ? (
    <MotivoDesabilitado motivo="Confirmar o carro — trava o agrupamento e o horário" desabilitado={pendente}>
      <button type="button" onClick={() => onConfirm(g.id)} disabled={pendente}
        className="esp-alvo inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        data-testid={`confirm-uber-${g.id}`}>
        {pendente ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
        {pendente ? "Confirmando…" : "Confirmar"}
      </button>
    </MotivoDesabilitado>
  ) : (
    <span className="inline-flex h-7 items-center rounded-md bg-brand-soft px-2.5 text-xs font-medium text-primary">Sugestão</span>
  );

  const seletorTitular = canEdit ? (
    <label className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
      <span className="text-xs text-muted-foreground">Titular</span>
      <select
        value={g.titularCollaboratorId ?? ""}
        onChange={(e) => onPatch(g.id, { titularCollaboratorId: e.target.value || null })}
        aria-label={`Titular do carro ${n} da ${dir}`}
        className={cn("esp-alvo h-8 min-w-0 flex-1 rounded-md border bg-card px-2 text-xs transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[200px] sm:flex-none",
          g.titularCollaboratorId ? "border-border text-foreground" : "border-warning/50 text-warning")}
        data-testid={`uber-titular-${g.id}`}>
        <option value="">Escolher…</option>
        {membros.map((op, k) => <option key={op.id ?? k} value={op.id ?? ""}>{op.name}</option>)}
      </select>
    </label>
  ) : (
    <span className="text-xs">
      <span className="text-muted-foreground">Titular </span>
      {titular ? <span className="font-medium text-foreground">{titular.name}</span> : <span className="text-warning">sem titular</span>}
    </span>
  );

  return (
    <article
      className={cn("esp-uber-carro overflow-hidden rounded-xl border bg-card shadow-1", g.confirmed ? "border-success/30" : "border-border")}
      aria-label={`Carro ${n} da ${dir}`} data-testid={`uber-carro-${g.id}`}>
      <header className={cn("flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b px-4 py-2.5",
        g.confirmed ? "border-success/20 bg-success-soft/40" : "border-border bg-surface-muted/60")}>
        {/* Quem, quando, de onde: o que se lê primeiro. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-foreground">Carro {n}</span>
            <span className={cn("text-xs tabular-nums", estranha ? "font-medium text-warning" : "text-muted-foreground")}>
              {diaSemana(g.date)} {dataCurta(g.date, anoDoEvento)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{antiga ? "busca às" : "sai às"}</span>
            <HorarioDoCarro grupo={g} canEdit={canEdit} onPatch={onPatch}
              rotulo={`Horário ${antiga ? "da busca" : "de saída"} do carro ${n}`} />
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            {aero && <span className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-2xs font-semibold tracking-wide text-foreground">{aero}</span>}
            {local && <span className="max-w-[180px] truncate text-muted-foreground" title={local}>{antiga ? `para ${local}` : `de ${local}`}</span>}
            <span className="tabular-nums text-muted-foreground">{pessoas(membros.length)}</span>
          </span>
        </div>
        {/* Decisões do carro. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          {seletorTitular}
          {confirmar}
        </div>
      </header>
      {estranha && (
        // Fora do cabeçalho de propósito: lá ele empurrava titular e confirmar
        // para outra linha. Aqui diz o problema inteiro, com o período do evento.
        <p className="flex items-start gap-2 border-b border-warning/25 bg-warning-soft/60 px-4 py-2 text-xs text-warning" data-testid="uber-alerta-data">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium">Data do voo fora do evento — conferir a passagem.</span>
            {periodoDoEvento && <> O evento é de {periodoDoEvento}; este carro está em {fmtDate(g.date)}.</>}
          </span>
        </p>
      )}

      <ul className="divide-y divide-border/70">
        {membros.map((m, mi) => {
          const r = m.id ? rowByCollab.get(m.id) : undefined;
          const v = vooDaPessoa(r, g, dir);
          const vooEstranho = foraDoEvento(v.data);
          const ehTitular = !!m.id && m.id === g.titularCollaboratorId;
          return (
            <li key={`${g.id}-${m.id ?? mi}`}
              // Uma grade: no desktop, colunas que alinham de um carro para o
              // outro; no estreito, nome e ações em cima e o resto com a largura
              // toda embaixo (antes as ações comiam a largura de todas as linhas).
              className={cn("esp-uber-pessoa group/linha grid items-center gap-x-4 gap-y-0.5 px-4 py-2.5 transition-colors hover:bg-surface-muted/50",
                canEdit ? "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,15rem)_minmax(0,11rem)_minmax(0,1fr)_auto]" : "grid-cols-1 lg:grid-cols-[minmax(0,15rem)_minmax(0,11rem)_minmax(0,1fr)]")}
              data-testid={r ? `rot-${r.teamInclusionId}` : undefined}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{m.name}</span>
                  {ehTitular && <span className="shrink-0 rounded bg-brand-soft px-1.5 text-2xs font-medium text-primary" title="Chama e responde pela corrida">titular</span>}
                </span>
                <span className="col-span-full truncate text-xs capitalize text-muted-foreground lg:col-span-1">{r?.function.area || r?.function.name || "—"}</span>
                {/* O voo desta pessoa. Cada pedaço quebra inteiro ("· voo 06:30"),
                    nunca no meio. Com o aviso já na faixa do carro, aqui só a cor. */}
                <span className="col-span-full flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs tabular-nums text-muted-foreground lg:col-span-1">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    {/* Nas duas direções é o voo que a pessoa vai PEGAR (09/10). */}
                    <PlaneTakeoff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className={vooEstranho ? "font-medium text-warning" : ""}>{diaSemana(v.data)} {dataCurta(v.data, anoDoEvento)}</span>
                  </span>
                  {v.aero && <span className="whitespace-nowrap"><span className="mr-1.5" aria-hidden="true">·</span><span className="font-mono text-foreground/80">{v.aero}</span></span>}
                  {v.decola && <span className="whitespace-nowrap"><span className="mr-1.5" aria-hidden="true">·</span>voo <span className="text-foreground">{v.decola}</span></span>}
                  {vooEstranho && !estranha && <AlertaData />}
                </span>
              {canEdit && (
                <div className="col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-1 lg:col-start-4">
                  {m.id && (
                    <MoverPara pessoa={m.name} grupoAtual={g.id} rotuloNovo="Carro só para esta pessoa"
                      consequencia="O horário do carro de origem e do destino é recalculado a partir dos voos de quem sobrar em cada um."
                      destinos={grupos.filter((o) => o.id !== g.id).map((o) => ({ id: o.id, descricao: descreve(o) }))}
                      onMover={(para) => onMover(m.id as string, g.id, para)} />
                  )}
                  {r && onSkipUber && (
                    <button type="button" onClick={() => onSkipUber(r.teamInclusionId, true)}
                      title="Tirar da roteirização — não entra em carro nenhum e não gera custo"
                      aria-label={`Tirar ${m.name} da roteirização`}
                      className="esp-alvo inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-warning-soft hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid={`skip-uber-${r.teamInclusionId}`}>
                      <X className="h-3 w-3" aria-hidden="true" /> Tirar
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

// ─── Fora da roteirização (por direção) ───────────────────────────────────

function BlocoFora({ dir, linhas, canEdit, onSkipUber }: {
  dir: Direcao;
  linhas: MirrorRow[];
  canEdit: boolean;
  onSkipUber?: (rowId: string, skip: boolean) => void;
}) {
  const TOM = {
    neutro: "bg-muted text-slate-600",
    alerta: "bg-warning-soft text-warning",
    info: "bg-info-soft text-info",
  } as const;
  return (
    <section id="uber-fora" className="esp-uber-carro scroll-mt-40 overflow-hidden rounded-xl border border-warning/30 bg-card shadow-1" data-testid="uber-fora">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-warning/25 bg-warning-soft/60 px-4 py-2.5">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-warning">
          <UserX className="h-4 w-4" aria-hidden="true" /> Fora da {dir}
          <span className="rounded bg-warning/10 px-1 text-2xs font-semibold tabular-nums">{linhas.length}</span>
        </h4>
        <p className="text-xs text-warning/90">Não entram em carro de {dir} e não geram custo.</p>
      </header>
      <ul className="divide-y divide-border/70">
        {linhas.map((r) => {
          const motivo = motivoFora(r, dir);
          return (
            <li key={r.teamInclusionId} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted/50 lg:items-center">
              <div className="grid min-w-0 flex-1 gap-x-4 gap-y-1 lg:grid-cols-[minmax(0,15rem)_minmax(0,11rem)_minmax(0,1fr)] lg:items-center">
                <span className="truncate text-sm font-medium text-foreground">{r.collaborator.fullName}</span>
                <span className="truncate text-xs capitalize text-muted-foreground">{r.function.area || r.function.name || "Sem área"}</span>
                <span><span className={cn("inline-flex min-h-[22px] items-center rounded-md px-[7px] text-2xs font-medium", TOM[motivo.tom])}>{motivo.texto}</span></span>
              </div>
              {canEdit && r.skipUber && onSkipUber && (
                <button type="button"
                  onClick={() => onSkipUber(r.teamInclusionId, false)}
                  aria-label={`Voltar ${r.collaborator.fullName} para a roteirização`}
                  className="esp-alvo inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`voltar-uber-${r.teamInclusionId}`}>
                  Voltar<span className="hidden sm:inline">&nbsp;para a roteirização</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
