/**
 * Aba ESCALA da Escalação (04/09; logística em 23/10 — dono, no print do
 * Troféu Brasil 2026 - 4ª etapa: "aqui poderia ter informações de
 * logística"; e depois "além da logística, horários e tudo mais da passagem").
 *
 * O quadro função × dia continua o mesmo da Validação. Em volta dele:
 *  - quatro colunas por função depois de Pessoas-dia: Sem nome, Passagem,
 *    Carro/van e Hotel ("tem/precisam"), com o total no rodapé;
 *  - três linhas por dia no rodapé: Chegam, Saem e No hotel (a noite);
 *  - "Chegadas e saídas": os horários de cada dia ("Chegam 4: 09:55 (2),
 *    14:20, 22:05"), para Compras e o Uber/transfer;
 *  - clicar em qualquer número abre a lista que o forma, com a viagem de cada
 *    vaga (ida, volta, companhia, LOC, hotel) ou a Sugestão, marcada.
 *
 * Mesmo recorte da tela (evento, função, período, futuros/realizados, busca,
 * situações, excluídas); cancelada não entra. A regra é
 * shared/logistica-da-escala.ts. No celular, as colunas de logística viram um
 * resumo por função abaixo do quadro e a agenda do dia vira cartões.
 */
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, BedDouble, Check, PlaneLanding, PlaneTakeoff } from "lucide-react";
import type { Accommodation, TeamInclusion, Ticket } from "@shared/schema";
import { vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import { estadoDaContagem, horariosEmTexto, type Contagem, type LogisticaDoDia, type Movimento } from "@shared/logistica-da-escala";
import { somarDiasISO } from "@shared/janela-de-viagem";
import { ScheduleBoard, type BoardExtraColumn, type BoardExtraFooterRow } from "@/components/scaling-validation/schedule-board";
import { workDaysOf, type SuggestionRow } from "@/components/scaling-validation/types";
import { cn } from "@/lib/utils";
import { useLogisticaDaEscala } from "./use-logistica-da-escala";
import { DetalheDaFuncao, DetalheDoDia, type AlvoDaFuncao, type AlvoDoDia, type ContextoDaEscala, type FocoDaFuncao } from "./detalhe-da-logistica";
import { diaCurto, plural } from "./formatos";

/** Dias de viagem fora do período de trabalho que ainda ganham coluna (a véspera, o dia seguinte…). */
const FOLGA_DE_DIAS = 7;

export interface AbaEscalaProps {
  /** As linhas do quadro (o recorte, já no formato do ScheduleBoard). */
  rows: SuggestionRow[];
  /** As mesmas vagas, como vieram (para a logística). */
  linhas: readonly TeamInclusion[];
  functionNameById: Map<string, string>;
  eventoUnico: { id: string; name: string; startDate?: string | null; endDate?: string | null } | undefined;
  /** Vários eventos (ou nenhum) marcados: o rodapé pede para escolher um. */
  variosEventos: boolean;
  recorteFuturos: boolean;
  tickets: readonly Ticket[] | undefined;
  accommodations: readonly Accommodation[] | undefined;
  getCollaboratorName: (id?: string | null) => string;
  onAbrirVaga: (v: TeamInclusion) => void;
  onEscalarFuncao: (nomeDaFuncao: string) => void;
}

type Alvo = AlvoDaFuncao | AlvoDoDia;

export function AbaEscala(props: AbaEscalaProps) {
  const { rows, linhas, functionNameById, eventoUnico, variosEventos, recorteFuturos, tickets, accommodations, getCollaboratorName } = props;
  const [alvo, setAlvo] = useState<Alvo | null>(null);

  const { resumo, carregandoTerrestre, erroTerrestre } = useLogisticaDaEscala({
    linhas, tickets, accommodations,
    eventId: eventoUnico?.id ?? null,
    futuros: recorteFuturos && !eventoUnico,
    habilitado: true,
  });

  const vagaPorId = useMemo(() => new Map(linhas.map((v) => [v.id, v] as const)), [linhas]);
  const nomeDaFuncao = (id: string) => functionNameById.get(id) ?? "Sem função";

  // Dias de viagem que ganham coluna: dentro de ±7 dias do período de trabalho
  // (data de passagem digitada errada não pode esticar o quadro por meses).
  const { extraDates, foraDoQuadro } = useMemo(() => {
    let min = eventoUnico?.startDate ?? "";
    let max = eventoUnico?.endDate ?? "";
    for (const r of rows) {
      if (r.status === SUGESTAO_STATUS.NEGADA) continue;
      const d = workDaysOf(r);
      if (d.length === 0) continue;
      if (!min || d[0] < min) min = d[0];
      if (!max || d[d.length - 1] > max) max = d[d.length - 1];
    }
    if (!min || !max) return { extraDates: [] as string[], foraDoQuadro: 0 };
    const ini = somarDiasISO(min, -FOLGA_DE_DIAS), fim = somarDiasISO(max, FOLGA_DE_DIAS);
    const dentro: string[] = [];
    let fora = 0;
    for (const [dia, d] of Array.from(resumo.porDia)) {
      if (d.chegam.length === 0 && d.saem.length === 0) continue;
      if (dia >= ini && dia <= fim) dentro.push(dia); else fora += d.chegam.length + d.saem.length;
    }
    return { extraDates: dentro, foraDoQuadro: fora };
  }, [rows, eventoUnico?.startDate, eventoUnico?.endDate, resumo.porDia]);

  const ctx: ContextoDaEscala = {
    resumo, vagaPorId,
    nomeDaVaga: (v) => (vagaComEmpreita(v) ? `Empreita · ${v.empreitaEmpresa}` : v.collaboratorId ? getCollaboratorName(v.collaboratorId) : null),
    nomeDaFuncao,
    eventoUnico: eventoUnico ? { id: eventoUnico.id, name: eventoUnico.name } : null,
    onAbrirVaga: props.onAbrirVaga,
    onEscalarFuncao: props.onEscalarFuncao,
  };

  const abrirFuncao = (functionId: string | null, foco: FocoDaFuncao) => setAlvo({ tipo: "funcao", functionId, foco });
  const abrirDia = (dia: string, foco: AlvoDoDia["foco"]) => setAlvo({ tipo: "dia", dia, foco });

  const SO_DESKTOP = "hidden lg:table-cell";
  const colunaDeContagem = (key: "passagem" | "terrestre" | "hotel", rotulo: string): BoardExtraColumn => ({
    key, className: SO_DESKTOP,
    header: <span title={TITULO_DA_COLUNA[key]}>{rotulo}</span>,
    cell: (fid) => {
      const f = resumo.porFuncao.get(fid);
      if (!f) return null;
      return (
        <CelulaDaContagem
          c={f[key]} rotulo={rotulo} funcao={nomeDaFuncao(fid)} carregando={key === "terrestre" && carregandoTerrestre}
          semDados={key === "passagem" ? f.passagem.semDados : 0}
          extra={key === "passagem" ? textoDaJanela(f.primeiraChegada, f.ultimaSaida) : null}
          onAbrir={() => abrirFuncao(fid, key)} testId={`logistica-${key}-${fid}`}
        />
      );
    },
    footer: (
      <CelulaDaContagem
        c={resumo.total[key]} rotulo={rotulo} funcao="o recorte" total carregando={key === "terrestre" && carregandoTerrestre}
        semDados={key === "passagem" ? resumo.total.passagem.semDados : 0}
        onAbrir={() => abrirFuncao(null, key)} testId={`logistica-${key}-total`}
      />
    ),
  });

  const extraColumns: BoardExtraColumn[] = [
    {
      key: "sem_nome", className: SO_DESKTOP,
      header: <span title="Vagas sem colaborador (nem empreita): travam passagem, carro/van e hotel">Sem nome</span>,
      cell: (fid) => <CelulaSemNome n={resumo.porFuncao.get(fid)?.semNome ?? 0} funcao={nomeDaFuncao(fid)} onAbrir={() => abrirFuncao(fid, "sem_nome")} testId={`logistica-sem_nome-${fid}`} />,
      footer: <CelulaSemNome n={resumo.total.semNome} funcao="o recorte" total onAbrir={() => abrirFuncao(null, "sem_nome")} testId="logistica-sem_nome-total" />,
    },
    colunaDeContagem("passagem", "Passagem"),
    colunaDeContagem("terrestre", "Carro/van"),
    colunaDeContagem("hotel", "Hotel"),
  ];

  const totalChegam = Array.from(resumo.porDia.values()).reduce((a, d) => a + d.chegam.length, 0);
  const totalSaem = Array.from(resumo.porDia.values()).reduce((a, d) => a + d.saem.length, 0);
  const extraFooterRows: BoardExtraFooterRow[] = [
    {
      key: "chegam",
      label: <RotuloDoRodape icone={<PlaneLanding className="h-3.5 w-3.5" aria-hidden="true" />} texto="Chegam" />,
      cell: (d) => <CelulaDoDia movimentos={resumo.porDia.get(d)?.chegam ?? []} rotulo="Chegam" dia={d} onAbrir={() => abrirDia(d, "chegam")} />,
      totalCell: totalChegam > 0 ? <span className="font-semibold">{totalChegam}</span> : null,
    },
    {
      key: "saem",
      label: <RotuloDoRodape icone={<PlaneTakeoff className="h-3.5 w-3.5" aria-hidden="true" />} texto="Saem" />,
      cell: (d) => <CelulaDoDia movimentos={resumo.porDia.get(d)?.saem ?? []} rotulo="Saem" dia={d} onAbrir={() => abrirDia(d, "saem")} />,
      totalCell: totalSaem > 0 ? <span className="font-semibold">{totalSaem}</span> : null,
    },
    {
      key: "hotel",
      label: <RotuloDoRodape icone={<BedDouble className="h-3.5 w-3.5" aria-hidden="true" />} texto="No hotel" dica="Pessoas com hotel reservado dormindo nesta noite" />,
      cell: (d) => {
        const n = resumo.porDia.get(d)?.noHotel.length ?? 0;
        return n === 0 ? <span className="text-slate-200">–</span> : (
          <button
            type="button" onClick={() => abrirDia(d, "hotel")}
            className="inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded-md text-xs font-semibold tabular-nums text-slate-700 transition-colors hover:bg-card hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={`${n} ${plural(n, "pessoa", "pessoas")} no hotel na noite de ${diaCurto(d)}`}
            aria-label={`No hotel na noite de ${diaCurto(d)}: ${n}. Ver a lista`}
          >{n}</button>
        );
      },
    },
  ];

  const funcoesOrdenadas = useMemo(
    () => Array.from(resumo.porFuncao.values()).sort((a, b) => nomeDaFuncao(a.functionId).localeCompare(nomeDaFuncao(b.functionId), "pt-BR", { sensitivity: "base" })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resumo.porFuncao, functionNameById],
  );
  const diasComMovimento = Array.from(resumo.porDia.values()).filter((d) => d.chegam.length > 0 || d.saem.length > 0);
  const semDia = new Set([...resumo.semDiaDeChegada, ...resumo.semDiaDeSaida]).size;

  return (
    <div className="space-y-3" data-testid="aba-escala-quadro">
      <ScheduleBoard
        rows={rows}
        functionNameById={functionNameById}
        rangeStart={eventoUnico?.startDate ?? undefined}
        rangeEnd={eventoUnico?.endDate ?? undefined}
        extraColumns={extraColumns}
        extraFooterRows={extraFooterRows}
        extraDates={extraDates}
        hideReadOnlyMark
        onFunctionClick={(fid) => abrirFuncao(fid, "todas")}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-2xs text-muted-foreground" data-testid="legenda-logistica">
        <span className="font-medium text-slate-700">Quadro do recorte atual, somente leitura — vagas canceladas não entram na soma.</span>
        <span className="inline-flex items-center gap-1.5"><Check className="h-3 w-3 text-success" aria-hidden="true" />todas resolvidas</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-warning/30 bg-warning-soft" />tem/precisam — falta</span>
        <span>– ninguém precisa</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-3.5 rounded-sm border border-dashed border-slate-400" />só sugestão da escala (≈), sem passagem</span>
        <span>Clique num número para ver as vagas.</span>
        {variosEventos && <span>Escolha um evento no filtro para ver o período inteiro dele.</span>}
      </div>

      {(erroTerrestre || foraDoQuadro > 0 || semDia > 0) && (
        <div className="space-y-1 px-1 text-xs">
          {erroTerrestre && (
            <p className="flex items-center gap-1.5 text-warning" role="status">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Não foi possível carregar o carro/van registrado — a coluna conta só o que a Sugestão indica.
            </p>
          )}
          {semDia > 0 && (
            <p className="text-slate-600" data-testid="logistica-sem-dia">
              {semDia} {plural(semDia, "vaga viaja", "vagas viajam")} sem dia de chegada ou de saída — nem passagem, nem sugestão.{" "}
              <button type="button" className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded" onClick={() => abrirFuncao(null, "todas")}>Ver as vagas</button>
            </p>
          )}
          {foraDoQuadro > 0 && (
            <p className="text-slate-600">{foraDoQuadro} {plural(foraDoQuadro, "chegada/saída cai", "chegadas/saídas caem")} a mais de {FOLGA_DE_DIAS} dias do período de trabalho e {plural(foraDoQuadro, "ficou", "ficaram")} fora das colunas — confira a data da passagem.</p>
          )}
        </div>
      )}

      {/*
        Celular e tablet: a logística por função num quadro compacto, sem rolar
        de lado (no quadro largo as colunas ficariam escondidas depois dos
        dias). Mesmas células, mesmos cliques.
      */}
      {funcoesOrdenadas.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-card lg:hidden" aria-labelledby="titulo-logistica-funcao" data-testid="logistica-por-funcao-celular">
          <h3 id="titulo-logistica-funcao" className="border-b border-border px-3 py-2.5 text-2xs font-bold uppercase tracking-wide text-muted-foreground">Logística por função</h3>
          <table className="w-full text-sm">
            <caption className="sr-only">Logística por função: sem nome, passagem, carro/van e hotel</caption>
            <thead className="bg-surface-muted">
              <tr className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-left">Função</th>
                <th scope="col" className="px-0.5 py-2 text-center" title="Sem nome"><span aria-hidden="true" className="sm:hidden">S/ nome</span><span className="sr-only sm:not-sr-only">Sem nome</span></th>
                <th scope="col" className="px-0.5 py-2 text-center"><span className="sm:hidden">Passag.</span><span className="hidden sm:inline">Passagem</span></th>
                <th scope="col" className="px-0.5 py-2 text-center" title="Carro/van"><span aria-hidden="true" className="sm:hidden">Carro</span><span className="sr-only sm:not-sr-only">Carro/van</span></th>
                <th scope="col" className="px-0.5 py-2 pr-2 text-center">Hotel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {funcoesOrdenadas.map((f) => (
                <tr key={f.functionId}>
                  <th scope="row" className="max-w-0 px-3 py-1.5 text-left font-normal">
                    <button type="button" onClick={() => abrirFuncao(f.functionId, "todas")} className="block max-w-full truncate rounded text-left text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {nomeDaFuncao(f.functionId)}
                    </button>
                    <span className="block text-2xs tabular-nums text-muted-foreground">{f.vagas} {plural(f.vagas, "vaga", "vagas")}</span>
                  </th>
                  <td className="w-12 px-0.5 text-center sm:w-20"><CelulaSemNome n={f.semNome} funcao={nomeDaFuncao(f.functionId)} onAbrir={() => abrirFuncao(f.functionId, "sem_nome")} testId={`resumo-sem_nome-${f.functionId}`} compacta /></td>
                  {(["passagem", "terrestre", "hotel"] as const).map((k) => (
                    <td key={k} className={cn("w-[3.5rem] px-0.5 text-center sm:w-24", k === "hotel" && "pr-2")}>
                      <CelulaDaContagem
                        c={f[k]} rotulo={k === "passagem" ? "Passagem" : k === "terrestre" ? "Carro/van" : "Hotel"} funcao={nomeDaFuncao(f.functionId)}
                        carregando={k === "terrestre" && carregandoTerrestre} semDados={k === "passagem" ? f.passagem.semDados : 0}
                        onAbrir={() => abrirFuncao(f.functionId, k)} testId={`resumo-${k}-${f.functionId}`} compacta
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {diasComMovimento.length > 0 && (
        <section className="rounded-xl border border-border bg-card" aria-labelledby="titulo-chegadas-saidas" data-testid="chegadas-e-saidas">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border px-4 py-2.5">
            <h3 id="titulo-chegadas-saidas" className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">Chegadas e saídas</h3>
            <p className="text-2xs text-muted-foreground">Horário da passagem — chegada na ida, partida na volta. ≈ = sugestão da escala.</p>
          </div>
          <ul className="space-y-2 p-2 sm:space-y-0 sm:divide-y sm:divide-border sm:p-0">
            {diasComMovimento.map((d) => <LinhaDaAgenda key={d.dia} d={d} onAbrir={(foco) => abrirDia(d.dia, foco)} />)}
          </ul>
        </section>
      )}

      {alvo?.tipo === "funcao" && <DetalheDaFuncao alvo={alvo} ctx={ctx} onFechar={() => setAlvo(null)} />}
      {alvo?.tipo === "dia" && <DetalheDoDia alvo={alvo} ctx={ctx} onFechar={() => setAlvo(null)} />}
    </div>
  );
}

const TITULO_DA_COLUNA = {
  passagem: "Passagem aérea ou rodoviária: emitidas ou compradas ÷ vagas que precisam (quem vai de carro/van não entra)",
  terrestre: "Carro/van registrado em Passagens ÷ vagas que vão de carro/van (pela Sugestão ou já registradas)",
  hotel: "Hospedagem reservada (com hotel, não cancelada) ÷ vagas que precisam de hotel",
} as const;

const hm = (m: Movimento) => `${diaCurto(m.dia)}${m.hora ? ` ${m.fonte === "sugestao" ? "≈" : ""}${m.hora}` : ""}`;
function textoDaJanela(chegada: Movimento | null, saida: Movimento | null): string | null {
  const partes = [chegada ? `1ª chegada ${hm(chegada)}` : null, saida ? `última saída ${hm(saida)}` : null].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

function RotuloDoRodape({ icone, texto, dica }: { icone: ReactNode; texto: string; dica?: string }) {
  return <span className="inline-flex items-center gap-1.5 text-slate-700" title={dica}><span className="text-muted-foreground">{icone}</span>{texto}</span>;
}

const BOTAO = "inline-flex h-7 min-w-[3.25rem] items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold tabular-nums transition-[background-color,box-shadow,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function CelulaDaContagem({ c, rotulo, funcao, carregando, semDados = 0, extra, total = false, compacta = false, onAbrir, testId }: {
  c: Contagem; rotulo: string; funcao: string; carregando?: boolean; semDados?: number; extra?: string | null; total?: boolean; compacta?: boolean; onAbrir: () => void; testId: string;
}) {
  if (carregando) return <span className="text-xs text-muted-foreground" aria-label="Carregando">…</span>;
  const estado = estadoDaContagem(c);
  if (estado === "ninguem") {
    return <span className="text-slate-300" title={`Ninguém em ${funcao} precisa`} data-testid={testId}>–</span>;
  }
  const faltam = c.precisam - c.tem;
  const titulo = [
    `${rotulo}: ${c.tem} de ${c.precisam}${faltam > 0 ? ` — ${plural(faltam, "falta", "faltam")} ${faltam}` : " — todas resolvidas"}`,
    semDados > 0 ? `${semDados} ${plural(semDados, "marcada", "marcadas")} como emitida sem dados` : null,
    extra,
  ].filter(Boolean).join("\n");
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={titulo}
      aria-label={`${rotulo} em ${funcao}: ${c.tem} de ${c.precisam}. Ver as vagas`}
      className={cn(
        BOTAO,
        estado === "ok"
          ? "text-success hover:bg-success-soft"
          : "border border-warning/30 bg-warning-soft text-warning hover:shadow-[inset_0_0_0_1px_currentColor]",
        total && "font-bold",
        compacta && "h-9 w-full min-w-0 gap-0.5 px-1",
      )}
      data-testid={testId}
    >
      {estado === "ok" && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      {c.tem}/{c.precisam}
      {semDados > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
    </button>
  );
}

function CelulaSemNome({ n, funcao, total = false, compacta = false, onAbrir, testId }: { n: number; funcao: string; total?: boolean; compacta?: boolean; onAbrir: () => void; testId: string }) {
  if (n === 0) return <span className="text-slate-300" title={`Todas as vagas de ${funcao} têm nome`} data-testid={testId}>–</span>;
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`${n} ${plural(n, "vaga", "vagas")} sem colaborador — trava passagem, carro/van e hotel`}
      aria-label={`Sem nome em ${funcao}: ${n}. Ver as vagas`}
      className={cn(BOTAO, "min-w-[2.5rem] border border-danger/25 bg-danger-soft text-danger hover:shadow-[inset_0_0_0_1px_currentColor]", total && "font-bold", compacta && "h-9")}
      data-testid={testId}
    >
      {n}
    </button>
  );
}

function CelulaDoDia({ movimentos, rotulo, dia, onAbrir }: { movimentos: readonly Movimento[]; rotulo: string; dia: string; onAbrir: () => void }) {
  const n = movimentos.length;
  if (n === 0) return <span className="text-slate-200">–</span>;
  const soSugestao = movimentos.every((m) => m.fonte === "sugestao");
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`${diaCurto(dia)} · ${rotulo} ${n}: ${horariosEmTexto(movimentos)}`}
      aria-label={`${rotulo} em ${diaCurto(dia)}: ${n}. Ver a lista com os horários`}
      className={cn(
        "inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded-md border bg-card text-xs font-semibold tabular-nums text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        soSugestao ? "border-dashed border-slate-400" : "border-border",
      )}
      data-testid={`dia-${rotulo.toLowerCase()}-${dia}`}
    >
      {n}
    </button>
  );
}

/** Um dia da agenda: "Qua 09/12 · Chegam 4: 09:55 (2), 14:20 · Saem 0 · 6 no hotel". Cartão no celular. */
function LinhaDaAgenda({ d, onAbrir }: { d: LogisticaDoDia; onAbrir: (foco: "chegam" | "saem" | "hotel") => void }) {
  const parte = (tipo: "chegam" | "saem", lista: readonly Movimento[]) => {
    const Icone = tipo === "chegam" ? PlaneLanding : PlaneTakeoff;
    const rotulo = tipo === "chegam" ? "Chegam" : "Saem";
    return (
      <button
        type="button"
        onClick={() => onAbrir(tipo)}
        disabled={lista.length === 0}
        className={cn("group flex min-h-11 min-w-0 flex-1 items-center gap-2 sm:items-start rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent sm:min-h-0", lista.length === 0 && "max-sm:hidden")}
        data-testid={`agenda-${tipo}-${d.dia}`}
      >
        <Icone className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", lista.length ? "text-primary" : "text-slate-300")} aria-hidden="true" />
        <span className="min-w-0 text-xs leading-5">
          <span className={cn("font-semibold", lista.length ? "text-foreground" : "text-muted-foreground")}>{rotulo} {lista.length}</span>
          {lista.length > 0 && <span className="tabular-nums text-slate-600 group-hover:text-foreground"> · {horariosEmTexto(lista)}</span>}
        </span>
      </button>
    );
  };
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border p-2 sm:flex-row sm:items-start sm:gap-3 sm:rounded-none sm:border-0 sm:px-3 sm:py-1.5" data-testid={`agenda-${d.dia}`}>
      <span className="px-2 pt-1.5 text-xs font-semibold tabular-nums text-foreground sm:w-20 sm:shrink-0 sm:px-0">{diaCurto(d.dia)}</span>
      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:gap-2">
        {parte("chegam", d.chegam)}
        {parte("saem", d.saem)}
      </div>
      {/* Largura fixa no desktop: com ou sem hotel, Chegam e Saem ficam alinhados entre os dias. */}
      <div className="flex sm:w-28 sm:shrink-0 sm:justify-end">
        {d.noHotel.length > 0 && (
          <button
            type="button"
            onClick={() => onAbrir("hotel")}
            className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-600 transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
          >
            <BedDouble className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="tabular-nums">{d.noHotel.length} no hotel</span>
          </button>
        )}
      </div>
    </li>
  );
}

export default AbaEscala;
