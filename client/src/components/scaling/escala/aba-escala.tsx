/**
 * Aba ESCALA da Escalação (04/09; logística em 23/10 — dono, no print do
 * Troféu Brasil 2026 - 4ª etapa: "aqui poderia ter informações de
 * logística"; e depois "além da logística, horários e tudo mais da passagem").
 *
 * 23/10, 2ª rodada (print do 20a Fuga das Ilhas - 2026): "as informações de
 * logística poderiam aparecer aqui de alguma forma" — AQUI é a grade — e "lá
 * embaixo está ruim" (o rodapé e a faixa de horários).
 *
 * O quadro função × dia é o mesmo da Validação. Em volta e dentro dele:
 *  - CÉLULA função × dia: o chip de pessoas e, embaixo, quem chega, quem sai e
 *    se alguém dorme no hotel; um ponto no canto diz se falta algo para alguém
 *    do dia (âmbar) ou se está tudo resolvido (verde). Tooltip com nomes e
 *    horários; clique abre o detalhe da função naquele dia (celula-da-grade).
 *  - quatro colunas por função depois de Pessoas-dia: Sem nome, Passagem,
 *    Carro/van e Hotel ("tem/precisam"), com o total no rodapé;
 *  - RODAPÉ: Chegam e Saem por dia, separando o que já tem passagem do que é
 *    só sugestão (≈); No hotel por noite como reservados/precisam — quem
 *    precisa e ainda não tem reserva conta (antes a linha mostrava "—" quando
 *    nada estava reservado). O total do período fica no rótulo da linha, não
 *    na coluna Pessoas-dia (não é pessoa-dia);
 *  - HORÁRIOS DE CHEGADA E SAÍDA: um bloco por dia com os horários agrupados
 *    ("09:10 ×10"), o que é sugestão e quem está sem horário. É o único lugar
 *    com os horários do dia inteiro à vista (Compras e o Uber/transfer); o
 *    hotel saiu daqui porque já está no rodapé.
 *
 * Mesmo recorte da tela (evento, função, período, futuros/realizados, busca,
 * situações, excluídas); cancelada não entra. A regra é
 * shared/logistica-da-escala.ts. No celular e no tablet, a grade fica só com o
 * chip (os marcadores ficam no detalhe), as colunas de logística viram um
 * resumo por função e os horários viram blocos por dia.
 */
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { AlertTriangle, BedDouble, Check, ChevronRight, PlaneLanding, PlaneTakeoff } from "lucide-react";
import type { Accommodation, TeamInclusion, Ticket } from "@shared/schema";
import { vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import {
  estadoDaContagem, horariosAgrupados, horariosEmTexto, logisticaPorFuncaoEDia, noiteNoHotel, porFonte,
  type Contagem, type LogisticaDoDia, type Movimento,
} from "@shared/logistica-da-escala";
import { somarDiasISO } from "@shared/janela-de-viagem";
import { ScheduleBoard, type BoardExtraColumn, type BoardExtraFooterRow } from "@/components/scaling-validation/schedule-board";
import { workDaysOf, type SuggestionRow } from "@/components/scaling-validation/types";
import { cn } from "@/lib/utils";
import { useLogisticaDaEscala } from "./use-logistica-da-escala";
import { DetalheDaFuncao, DetalheDoDia, type AlvoDaFuncao, type AlvoDoDia, type ContextoDaEscala, type FocoDaFuncao } from "./detalhe-da-logistica";
import { CelulaDaGrade } from "./celula-da-grade";
import { diaCurto, plural, textoDoGrupo } from "./formatos";

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

  // Os dias de trabalho de cada vaga, como o quadro conta (negada não trabalha).
  const diasDeTrabalho = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of rows) if (r.status !== SUGESTAO_STATUS.NEGADA) m.set(r.id, workDaysOf(r));
    return m;
  }, [rows]);

  const { resumo, carregandoTerrestre, erroTerrestre } = useLogisticaDaEscala({
    linhas, tickets, accommodations,
    eventId: eventoUnico?.id ?? null,
    futuros: recorteFuturos && !eventoUnico,
    habilitado: true,
    diasDeTrabalho,
  });
  const celulas = useMemo(() => logisticaPorFuncaoEDia(resumo, (id) => diasDeTrabalho.get(id) ?? []), [resumo, diasDeTrabalho]);

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
    resumo, celulas, vagaPorId,
    nomeDaVaga: (v) => (vagaComEmpreita(v) ? `Empreita · ${v.empreitaEmpresa}` : v.collaboratorId ? getCollaboratorName(v.collaboratorId) : null),
    nomeDaFuncao,
    eventoUnico: eventoUnico ? { id: eventoUnico.id, name: eventoUnico.name } : null,
    onAbrirVaga: props.onAbrirVaga,
    onEscalarFuncao: props.onEscalarFuncao,
  };

  const abrirFuncao = (functionId: string | null, foco: FocoDaFuncao) => setAlvo({ tipo: "funcao", functionId, foco });
  const abrirDia = (dia: string, foco: AlvoDoDia["foco"], functionId: string | null = null) => setAlvo({ tipo: "dia", dia, foco, functionId });

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

  const dias = Array.from(resumo.porDia.values());
  const totalChegam = dias.reduce((a, d) => a + d.chegam.length, 0);
  const totalSaem = dias.reduce((a, d) => a + d.saem.length, 0);
  const extraFooterRows: BoardExtraFooterRow[] = [
    {
      key: "chegam",
      label: <RotuloDoRodape Icone={PlaneLanding} texto="Chegam" total={totalChegam} detalhe="chegada da ida" />,
      cell: (d) => <CelulaDoMovimento movimentos={resumo.porDia.get(d)?.chegam ?? []} rotulo="Chegam" dia={d} onAbrir={() => abrirDia(d, "chegam")} />,
    },
    {
      key: "saem",
      label: <RotuloDoRodape Icone={PlaneTakeoff} texto="Saem" total={totalSaem} detalhe="partida da volta" />,
      cell: (d) => <CelulaDoMovimento movimentos={resumo.porDia.get(d)?.saem ?? []} rotulo="Saem" dia={d} onAbrir={() => abrirDia(d, "saem")} />,
    },
    {
      key: "hotel",
      label: <RotuloDoRodape Icone={BedDouble} texto="No hotel" detalhe="reservados / precisam, por noite" />,
      cell: (d) => <CelulaDaNoite d={resumo.porDia.get(d)} dia={d} onAbrir={() => abrirDia(d, "hotel")} />,
    },
  ];

  const funcoesOrdenadas = useMemo(
    () => Array.from(resumo.porFuncao.values()).sort((a, b) => nomeDaFuncao(a.functionId).localeCompare(nomeDaFuncao(b.functionId), "pt-BR", { sensitivity: "base" })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resumo.porFuncao, functionNameById],
  );
  const diasComMovimento = dias.filter((d) => d.chegam.length > 0 || d.saem.length > 0);
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
        dayColumnClassName="lg:min-w-[4.5rem]"
        renderDayCell={({ functionId, functionName, date, count, chip }) => (
          <CelulaDaGrade
            functionId={functionId} funcao={functionName} dia={date} count={count} chip={chip}
            celula={celulas.get(functionId)?.get(date)} ctx={ctx}
            onAbrir={(foco) => abrirDia(date, foco, functionId)}
          />
        )}
      />

      <Legenda variosEventos={variosEventos} />

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

      {diasComMovimento.length > 0 && <HorariosDoDia dias={diasComMovimento} onAbrir={abrirDia} />}

      {alvo?.tipo === "funcao" && <DetalheDaFuncao alvo={alvo} ctx={ctx} onFechar={() => setAlvo(null)} />}
      {alvo?.tipo === "dia" && <DetalheDoDia key={`${alvo.dia}-${alvo.functionId ?? ""}`} alvo={alvo} ctx={ctx} onFechar={() => setAlvo(null)} />}
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

// ── Legenda ───────────────────────────────────────────────────────────────

/** Duas linhas no máximo: o que aparece na grade (só no desktop) e o que aparece nas colunas e no rodapé. */
const Item = ({ children }: { children: ReactNode }) => <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{children}</span>;

function Legenda({ variosEventos }: { variosEventos: boolean }) {
  return (
    <div className="space-y-1 px-1 text-2xs text-muted-foreground" data-testid="legenda-logistica">
      <p className="hidden flex-wrap items-center gap-x-3.5 gap-y-1 lg:flex">
        <span className="font-semibold text-slate-700">Na grade</span>
        <Item><PlaneLanding className="h-3 w-3 text-slate-600" aria-hidden="true" />chegam</Item>
        <Item><PlaneTakeoff className="h-3 w-3 text-slate-600" aria-hidden="true" />saem</Item>
        <Item><BedDouble className="h-3 w-3 text-slate-500" aria-hidden="true" />dormem no hotel</Item>
        <Item><span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />falta passagem, carro/van ou hotel</Item>
        <Item><span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />tudo resolvido</Item>
        <Item><span className="font-semibold text-slate-600">≈</span>só a sugestão da escala, sem passagem</Item>
      </p>
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:gap-x-3.5">
        <span className="hidden font-semibold text-slate-700 sm:inline">Colunas e rodapé</span>
        <Item><span aria-hidden="true" className="rounded border border-warning/30 bg-warning-soft px-1 font-semibold tabular-nums text-warning">1/2</span>tem / precisam</Item>
        <Item><Check className="h-3 w-3 text-success" aria-hidden="true" />resolvidas</Item>
        <Item>– ninguém precisa</Item>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap lg:hidden"><span className="font-semibold text-slate-600">≈</span>só sugestão</span>
        <span><span className="lg:hidden">Toque</span><span className="hidden lg:inline">Clique</span> num número para ver as vagas · canceladas não entram</span>
        {variosEventos && <span>Escolha um evento no filtro para ver o período inteiro dele.</span>}
      </p>
    </div>
  );
}

// ── Rodapé ────────────────────────────────────────────────────────────────

function RotuloDoRodape({ Icone, texto, total, detalhe }: { Icone: ComponentType<{ className?: string }>; texto: string; total?: number; detalhe: string }) {
  return (
    <span className="flex items-center gap-2">
      <Icone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 leading-tight">
        <span className="flex items-baseline gap-1.5">
          <span className="text-xs font-semibold text-foreground">{texto}</span>
          {total !== undefined && total > 0 && <span className="text-2xs font-normal tabular-nums text-muted-foreground">{total} no período</span>}
        </span>
        <span className="block truncate text-2xs font-normal text-muted-foreground">{detalhe}</span>
      </span>
    </span>
  );
}

const CHIP_DO_RODAPE = "inline-flex h-6 min-w-[2.25rem] items-center justify-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** "10 ≈4": quantos chegam pela passagem e quantos só pela sugestão — sem depender só da borda tracejada. */
function CelulaDoMovimento({ movimentos, rotulo, dia, onAbrir }: { movimentos: readonly Movimento[]; rotulo: string; dia: string; onAbrir: () => void }) {
  const n = movimentos.length;
  if (n === 0) return <span className="text-slate-200">–</span>;
  const { passagem, sugestao } = porFonte(movimentos);
  const origem = [passagem ? `${passagem} pela passagem` : null, sugestao ? `${sugestao} só pela sugestão (≈)` : null].filter(Boolean).join(", ");
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`${diaCurto(dia)} · ${rotulo} ${n} — ${origem}\n${horariosEmTexto(movimentos)}`}
      aria-label={`${rotulo} em ${diaCurto(dia)}: ${n} (${origem}). Ver a lista com os horários`}
      className={cn(CHIP_DO_RODAPE, "bg-card hover:border-primary hover:text-primary", passagem === 0 ? "border-dashed border-slate-400" : "border-border")}
      data-testid={`dia-${rotulo.toLowerCase()}-${dia}`}
    >
      {passagem > 0 && <span className="font-semibold text-foreground">{passagem}</span>}
      {sugestao > 0 && <span className="font-medium text-muted-foreground">≈{sugestao}</span>}
    </button>
  );
}

/** A noite: "0/8" (âmbar) quando alguém precisa sem reserva; "✓ 8" quando todos estão reservados; "–" quando ninguém precisa. */
function CelulaDaNoite({ d, dia, onAbrir }: { d: LogisticaDoDia | undefined; dia: string; onAbrir: () => void }) {
  const noite = noiteNoHotel(d);
  if (noite.estado === "ninguem") return <span className="text-slate-200" data-testid={`dia-hotel-${dia}`}>–</span>;
  const faltam = noite.precisam - noite.reservados;
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`Noite de ${diaCurto(dia)}: ${noite.precisam} ${plural(noite.precisam, "precisa", "precisam")} de hotel · ${noite.reservados} ${plural(noite.reservados, "reservado", "reservados")}${faltam > 0 ? ` · ${faltam} sem reserva` : ""}`}
      aria-label={`No hotel na noite de ${diaCurto(dia)}: ${noite.reservados} de ${noite.precisam} reservados. Ver a lista`}
      className={cn(
        CHIP_DO_RODAPE,
        noite.estado === "falta"
          ? "border-warning/30 bg-warning-soft font-semibold text-warning hover:shadow-[inset_0_0_0_1px_currentColor]"
          : "border-transparent font-semibold text-success hover:bg-success-soft",
      )}
      data-testid={`dia-hotel-${dia}`}
    >
      {noite.estado === "ok" ? <><Check className="h-3 w-3" aria-hidden="true" />{noite.precisam}</> : `${noite.reservados}/${noite.precisam}`}
    </button>
  );
}

// ── Horários do dia ───────────────────────────────────────────────────────

/**
 * Um bloco por dia com os horários agrupados ("09:10 ×10", "≈10:15 ×4",
 * "sem horário ×2"). Clicar abre a lista do dia, por horário.
 */
function HorariosDoDia({ dias, onAbrir }: { dias: LogisticaDoDia[]; onAbrir: (dia: string, foco: "chegam" | "saem") => void }) {
  return (
    <section className="rounded-xl border border-border bg-card" aria-labelledby="titulo-chegadas-saidas" data-testid="chegadas-e-saidas">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border px-4 py-2.5">
        <h3 id="titulo-chegadas-saidas" className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">Horários de chegada e saída</h3>
        <p className="text-2xs text-muted-foreground">Chegada da ida e partida da volta, para o transfer · ≈ sugestão da escala, sem passagem</p>
      </div>
      <div className="hidden grid-cols-[7rem_1fr_1fr] gap-3 border-b border-border bg-surface-muted px-4 py-1.5 text-2xs font-bold uppercase tracking-wide text-muted-foreground sm:grid" aria-hidden="true">
        <span>Dia</span><span>Chegam</span><span>Saem</span>
      </div>
      <ul className="space-y-2 p-2 sm:space-y-0 sm:divide-y sm:divide-border sm:p-0">
        {dias.map((d) => (
          <li key={d.dia} className="rounded-lg border border-border p-1.5 sm:grid sm:grid-cols-[7rem_1fr_1fr] sm:items-start sm:gap-3 sm:rounded-none sm:border-0 sm:px-4 sm:py-1.5" data-testid={`agenda-${d.dia}`}>
            <span className="block px-2 pb-0.5 pt-1.5 text-xs font-semibold tabular-nums text-foreground sm:px-0 sm:py-1.5">{diaCurto(d.dia)}</span>
            <BlocoDoMovimento tipo="chegam" lista={d.chegam} dia={d.dia} onAbrir={() => onAbrir(d.dia, "chegam")} />
            <BlocoDoMovimento tipo="saem" lista={d.saem} dia={d.dia} onAbrir={() => onAbrir(d.dia, "saem")} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BlocoDoMovimento({ tipo, lista, dia, onAbrir }: { tipo: "chegam" | "saem"; lista: readonly Movimento[]; dia: string; onAbrir: () => void }) {
  const Icone = tipo === "chegam" ? PlaneLanding : PlaneTakeoff;
  const rotulo = tipo === "chegam" ? "Chegam" : "Saem";
  if (lista.length === 0) {
    return <span className="hidden px-2 py-1.5 text-xs text-slate-300 sm:block" data-testid={`agenda-${tipo}-${dia}`}>—</span>;
  }
  const grupos = horariosAgrupados(lista);
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group flex w-full min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-11"
      aria-label={`${rotulo} em ${diaCurto(dia)}: ${lista.length} — ${horariosEmTexto(lista)}. Ver a lista`}
      data-testid={`agenda-${tipo}-${dia}`}
    >
      <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-foreground"><span className="sm:sr-only">{rotulo} </span>{lista.length}</span>
      <span className="flex min-w-0 flex-wrap gap-1">
        {grupos.map((g) => (
          <span
            key={`${g.fonte}-${g.hora ?? "sem"}`}
            className={cn(
              "whitespace-nowrap rounded border px-1.5 py-px text-2xs font-medium tabular-nums",
              g.hora === null ? "border-warning/30 bg-warning-soft text-warning"
                : g.fonte === "sugestao" ? "border-dashed border-slate-300 text-muted-foreground"
                  : "border-border bg-surface-muted text-foreground",
            )}
          >
            {textoDoGrupo(g)}
          </span>
        ))}
      </span>
      <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 pl-1 text-2xs font-medium text-slate-400 transition-colors group-hover:text-primary sm:ml-0">
        <span className="hidden group-hover:inline group-focus-visible:inline">ver lista</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </button>
  );
}

// ── Colunas por função ────────────────────────────────────────────────────

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

export default AbaEscala;
