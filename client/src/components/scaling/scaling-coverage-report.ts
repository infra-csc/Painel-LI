/**
 * Relatório "o que falta escalar" (01/09) — lógica pura.
 *
 * A aba Análises sabia dizer quantas vagas faltam POR EVENTO e quantas faltam
 * POR FUNÇÃO, mas nunca as duas coisas juntas. Quem precisa pedir gente manda
 * exatamente esse cruzamento — "no Dog Race faltam 7 cenotécnicas e 1 sup
 * ceno" — e montava a mensagem à mão, lendo a tela linha por linha.
 *
 * A saída é texto para colar em WhatsApp ou e-mail, porque é assim que esse
 * pedido circula.
 *
 * **Três grupos, e o critério vai escrito no relatório:**
 * - *Eventos com vaga aberta*: já tem gente escalada e falta completar. Lista
 *   função por função, porque é isso que se pede.
 * - *Disponível para escalação*: NENHUMA vaga preenchida. Listar função por
 *   função aqui seria repetir o evento inteiro; o que importa é "este ainda
 *   não foi tocado".
 * - *Falta confirmar* (18/09): nome salvo, escalação não confirmada. Antes o
 *   relatório só contava vaga sem nome — com o filtro "Salvo · falta
 *   confirmar" a tela mostrava 42 vagas e o texto dizia "0" (dono: "só para
 *   enviar para os caras"). Sai com os nomes, por função: é o que se cobra.
 */
import type { TeamInclusion } from "@shared/schema";
import { diaLocal, inicioDoDia } from "./scaling-period";
import { ehSugestao, vagasVivas, type AnalyticsContext } from "./scaling-analytics-data";
import { getScalingStatusKey } from "./scaling-status";

export interface FuncaoFaltando {
  nome: string;
  abertas: number;
}

/** Função com gente salva e escalação por confirmar — com os nomes. */
export interface FuncaoAConfirmar {
  nome: string;
  pessoas: string[];
}

export interface EventoNoRelatorio {
  eventId: string;
  nome: string;
  /**
   * Período do EVENTO — não o da escala, que começa dias antes para a montagem.
   *
   * Sai o período inteiro, e não uma data só, porque o sistema NÃO guarda o dia
   * da prova: o evento é cadastrado como uma janela ("08/09 a 14/09") e o dia
   * em que se corre é conhecimento de quem organiza. Escolher o primeiro dia
   * como se fosse "a data do evento" seria inventar uma precisão que o dado
   * não tem.
   *
   * Cai no período das vagas quando o evento não tem datas cadastradas.
   */
  ini: Date | null;
  fim: Date | null;
  total: number;
  abertas: number;
  /** Só as funções com vaga aberta, da que mais falta para a que menos. */
  funcoes: FuncaoFaltando[];
  /** Nenhuma vaga preenchida — o evento inteiro está livre. */
  intocado: boolean;
  /** A última escala do evento já passou. */
  jaTerminou: boolean;
  /** Vagas com nome salvo e escalação não confirmada. */
  aConfirmar: number;
  /** As funções dessas vagas, com os nomes. */
  funcoesAConfirmar: FuncaoAConfirmar[];
  /** Ainda na Validação de Escala (esperando a área) e na Aprovação (18/09). */
  emValidacao: number;
  funcoesEmValidacao: FuncaoFaltando[];
  emAprovacao: number;
  funcoesEmAprovacao: FuncaoFaltando[];
}

export interface RelatorioDeCobertura {
  comVagaAberta: EventoNoRelatorio[];
  disponiveis: EventoNoRelatorio[];
  /** Eventos com nome salvo por confirmar (18/09). */
  comFaltaConfirmar: EventoNoRelatorio[];
  /** Eventos com vaga ainda na validação / na aprovação (18/09). */
  comValidacao: EventoNoRelatorio[];
  comAprovacao: EventoNoRelatorio[];
  totalAbertas: number;
  totalAConfirmar: number;
  totalValidacao: number;
  totalAprovacao: number;
  totalVagas: number;
  /**
   * Eventos com vaga aberta que JÁ ACONTECERAM. Ficam fora da lista — ninguém
   * escala gente para o passado —, mas o número aparece no rodapé: sumir com
   * eles em silêncio faria a conta do relatório não bater com a da tela.
   */
  jaPassaram: number;
  vagasQueJaPassaram: number;
}

/**
 * Agrupa por evento e, dentro dele, por função. A ordem entre eventos é a
 * mesma da tela — o que começa antes vem primeiro —, para o relatório se ler
 * como a lista que a pessoa acabou de ver.
 */
export function montarRelatorioDeCobertura(
  linhas: TeamInclusion[],
  ctx: AnalyticsContext,
  hoje: Date,
): RelatorioDeCobertura {
  const base = inicioDoDia(hoje).getTime();
  const vivas = vagasVivas(linhas);
  const porEvento = new Map<string, TeamInclusion[]>();
  for (const i of vivas) {
    const lista = porEvento.get(i.eventId);
    if (lista) lista.push(i); else porEvento.set(i.eventId, [i]);
  }

  const eventos: EventoNoRelatorio[] = [];
  porEvento.forEach((doEvento, eventId) => {
    // Sugestão (validação/aprovação) não é "vaga sem nome" da escalação (18/09).
    const naEscalacao = doEvento.filter((i) => !ehSugestao(i));
    const abertas = naEscalacao.filter((i) => !ctx.temNome(i));
    // Nome salvo, escalação não confirmada (18/09).
    const salvas = naEscalacao.filter((i) => ctx.temNome(i) && getScalingStatusKey(i as any) === "salvo");
    const validacao = doEvento.filter((i) => ehSugestao(i) && i.status !== "sugestao_validada");
    const aprovacao = doEvento.filter((i) => i.status === "sugestao_validada");
    if (abertas.length === 0 && salvas.length === 0 && validacao.length === 0 && aprovacao.length === 0) return; // nada falta neste evento
    const contaPorFuncao = (lista: TeamInclusion[]): FuncaoFaltando[] => {
      const m = new Map<string, number>();
      for (const i of lista) { const nome = ctx.getFunctionName(i.functionId); m.set(nome, (m.get(nome) ?? 0) + 1); }
      return Array.from(m.entries()).map(([nome, abertas]) => ({ nome, abertas }))
        .sort((a, b) => b.abertas - a.abertas || a.nome.localeCompare(b.nome, "pt-BR"));
    };

    const porFuncao = new Map<string, number>();
    for (const i of abertas) {
      const nome = ctx.getFunctionName(i.functionId);
      porFuncao.set(nome, (porFuncao.get(nome) ?? 0) + 1);
    }
    const aConfirmarPorFuncao = new Map<string, string[]>();
    for (const i of salvas) {
      const nome = ctx.getFunctionName(i.functionId);
      const pessoas = aConfirmarPorFuncao.get(nome) ?? [];
      pessoas.push(ctx.getCollaboratorName(i.collaboratorId) || "?");
      aConfirmarPorFuncao.set(nome, pessoas);
    }
    const inicios = doEvento.map((i) => diaLocal(i.scheduleStartDate)).filter((d): d is Date => !!d);
    const fins = doEvento
      .map((i) => diaLocal(i.scheduleEndDate) ?? diaLocal(i.scheduleStartDate))
      .filter((d): d is Date => !!d);

    // A data que sai no relatório é a do EVENTO, não a do início da escala: a
    // equipe entra dias antes para montar, e quem pede gente fala do dia do
    // evento. As duas diferem em quase toda linha.
    const datasDoEvento = ctx.getEventDates?.(eventId);
    const dataEvento = diaLocal(datasDoEvento?.startDate);
    const fimEvento = diaLocal(datasDoEvento?.endDate) ?? dataEvento;

    const ultimoDia = fimEvento
      ?? (fins.length > 0 ? new Date(Math.max(...fins.map((d) => d.getTime()))) : null);
    const jaTerminou = !!ultimoDia && ultimoDia.getTime() < base;

    eventos.push({
      jaTerminou,
      eventId,
      nome: ctx.getEventName(eventId),
      ini: dataEvento ?? (inicios.length ? new Date(Math.min(...inicios.map((d) => d.getTime()))) : null),
      fim: fimEvento ?? (fins.length ? new Date(Math.max(...fins.map((d) => d.getTime()))) : null),
      total: doEvento.length,
      abertas: abertas.length,
      funcoes: Array.from(porFuncao.entries())
        .map(([nome, n]) => ({ nome, abertas: n }))
        .sort((a, b) => b.abertas - a.abertas || a.nome.localeCompare(b.nome, "pt-BR")),
      intocado: abertas.length > 0 && abertas.length === naEscalacao.length,
      emValidacao: validacao.length,
      funcoesEmValidacao: contaPorFuncao(validacao),
      emAprovacao: aprovacao.length,
      funcoesEmAprovacao: contaPorFuncao(aprovacao),
      aConfirmar: salvas.length,
      funcoesAConfirmar: Array.from(aConfirmarPorFuncao.entries())
        .map(([nome, pessoas]) => ({ nome, pessoas: pessoas.sort((a, b) => a.localeCompare(b, "pt-BR")) }))
        .sort((a, b) => b.pessoas.length - a.pessoas.length || a.nome.localeCompare(b.nome, "pt-BR")),
    });
  });

  // Sem data no fim: um evento sem período não tem como entrar na ordem de
  // urgência, e some no meio da lista se for tratado como "muito antigo".
  const porData = (a: EventoNoRelatorio, b: EventoNoRelatorio) => {
    if (!a.ini && !b.ini) return a.nome.localeCompare(b.nome, "pt-BR");
    if (!a.ini) return 1;
    if (!b.ini) return -1;
    return a.ini.getTime() - b.ini.getTime();
  };

  const atuais = eventos.filter((e) => !e.jaTerminou);
  const passados = eventos.filter((e) => e.jaTerminou && e.abertas > 0);

  return {
    comVagaAberta: atuais.filter((e) => e.abertas > 0 && !e.intocado).sort(porData),
    disponiveis: atuais.filter((e) => e.abertas > 0 && e.intocado).sort(porData),
    comFaltaConfirmar: atuais.filter((e) => e.aConfirmar > 0).sort(porData),
    comValidacao: atuais.filter((e) => e.emValidacao > 0).sort(porData),
    comAprovacao: atuais.filter((e) => e.emAprovacao > 0).sort(porData),
    totalAbertas: atuais.reduce((s, e) => s + e.abertas, 0),
    totalAConfirmar: atuais.reduce((s, e) => s + e.aConfirmar, 0),
    totalValidacao: atuais.reduce((s, e) => s + e.emValidacao, 0),
    totalAprovacao: atuais.reduce((s, e) => s + e.emAprovacao, 0),
    totalVagas: vivas.length,
    jaPassaram: passados.length,
    vagasQueJaPassaram: passados.reduce((s, e) => s + e.abertas, 0),
  };
}

const dm = (d: Date | null) =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "sem data";

/** "08/09 a 14/09", ou só a data quando o evento é de um dia. */
function periodo(e: { ini: Date | null; fim: Date | null }): string {
  if (!e.ini) return "sem data";
  if (!e.fim || e.fim.getTime() === e.ini.getTime()) return dm(e.ini);
  return `${dm(e.ini)} a ${dm(e.fim)}`;
}

/** O texto pronto para colar. */
export function textoDoRelatorio(rel: RelatorioDeCobertura, hoje: Date, recorte?: string): string {
  const linhas: string[] = [];
  const dataHoje = hoje.toLocaleDateString("pt-BR");
  const abertasTxt = `${rel.totalAbertas} ${rel.totalAbertas === 1 ? "vaga aberta" : "vagas abertas"}`;
  const confirmarTxt = `${rel.totalAConfirmar} ${rel.totalAConfirmar === 1 ? "falta confirmar" : "faltam confirmar"}`;

  linhas.push("ESCALAÇÃO — O QUE FALTA");
  // Validação/aprovação no cabeçalho só quando existem (18/09).
  const antes = [
    rel.totalValidacao > 0 ? `${rel.totalValidacao} em validação` : "",
    rel.totalAprovacao > 0 ? `${rel.totalAprovacao} em aprovação` : "",
  ].filter(Boolean);
  linhas.push(
    rel.totalAConfirmar > 0 || antes.length > 0
      ? [...antes, abertasTxt, ...(rel.totalAConfirmar > 0 ? [confirmarTxt] : []), `de ${rel.totalVagas}`, dataHoje].join(" · ")
      : `${abertasTxt} de ${rel.totalVagas} · ${dataHoje}`,
  );
  if (recorte) linhas.push(recorte);
  linhas.push("");

  if (rel.comVagaAberta.length > 0) {
    linhas.push("EVENTOS");
    for (const e of rel.comVagaAberta) {
      linhas.push(`• ${e.nome} — ${periodo(e)}`);
      for (const f of e.funcoes) linhas.push(`   · ${f.abertas} ${f.nome}`);
    }
    linhas.push("");
  }

  if (rel.disponiveis.length > 0) {
    // O critério vai escrito: quem recebe a mensagem não tem como adivinhar
    // por que estes eventos não vieram detalhados por função.
    linhas.push("DISPONÍVEL PARA ESCALAÇÃO (nenhuma vaga preenchida)");
    for (const e of rel.disponiveis) {
      linhas.push(`• ${e.nome} — ${periodo(e)} · ${e.total} ${e.total === 1 ? "vaga" : "vagas"}`);
    }
    linhas.push("");
  }

  if (rel.comFaltaConfirmar.length > 0) {
    // Nome salvo, escalação não confirmada (18/09): sai com os nomes, porque é
    // o que quem recebe precisa confirmar.
    linhas.push("FALTA CONFIRMAR (nome salvo, escalação não confirmada)");
    for (const e of rel.comFaltaConfirmar) {
      linhas.push(`• ${e.nome} — ${periodo(e)} · ${e.aConfirmar} ${e.aConfirmar === 1 ? "vaga" : "vagas"}`);
      for (const f of e.funcoesAConfirmar) linhas.push(`   · ${f.nome}: ${f.pessoas.join(", ")}`);
    }
    linhas.push("");
  }

  // Antes da escalação (18/09): o que ainda está com a área ou com o aprovador.
  const etapa = (titulo: string, eventos: EventoNoRelatorio[], n: (e: EventoNoRelatorio) => number, f: (e: EventoNoRelatorio) => FuncaoFaltando[]) => {
    if (eventos.length === 0) return;
    linhas.push(titulo);
    for (const e of eventos) {
      linhas.push(`• ${e.nome} — ${periodo(e)} · ${n(e)} ${n(e) === 1 ? "vaga" : "vagas"}`);
      for (const x of f(e)) linhas.push(`   · ${x.abertas} ${x.nome}`);
    }
    linhas.push("");
  };
  etapa("EM VALIDAÇÃO (esperando a área validar)", rel.comValidacao, (e) => e.emValidacao, (e) => e.funcoesEmValidacao);
  etapa("EM APROVAÇÃO (validadas, esperando o aprovador)", rel.comAprovacao, (e) => e.emAprovacao, (e) => e.funcoesEmAprovacao);

  if (rel.comVagaAberta.length === 0 && rel.disponiveis.length === 0 && rel.comFaltaConfirmar.length === 0 && rel.comValidacao.length === 0 && rel.comAprovacao.length === 0) {
    linhas.push("Nada falta escalar nem confirmar em evento que ainda vai acontecer.");
  }

  if (rel.jaPassaram > 0) {
    // O número vai escrito para a conta bater com a da tela: sem isto, quem
    // compara o total da tela com o relatório acha que faltou gente na lista.
    const ev = rel.jaPassaram === 1 ? "evento que já aconteceu ficou" : "eventos que já aconteceram ficaram";
    const vg = rel.vagasQueJaPassaram === 1 ? "vaga" : "vagas";
    linhas.push("");
    linhas.push(rel.jaPassaram + " " + ev + " de fora (" + rel.vagasQueJaPassaram + " " + vg + ").");
  }

  return linhas.join("\n").trimEnd();
}

/** Nome do arquivo quando a pessoa prefere baixar em vez de copiar. */
export function nomeDoArquivo(hoje: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `escalacao-o-que-falta-${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}.txt`;
}
