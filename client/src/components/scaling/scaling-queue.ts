/**
 * Fila de trabalho e filtros por grupo da Escalação (01/09) — lógica pura.
 *
 * Os quatro blocos da fila substituem dois banners ("N aguardando aprovação",
 * "N trocas pendentes") e um filtro de situação que contavam a MESMA pendência
 * duas vezes, em linguagens diferentes. Aqui cada linha é classificada uma vez
 * e todo mundo lê do mesmo lugar.
 *
 * Semântica dos grupos de filtro: **dentro do grupo OU, entre grupos E**. É o
 * que permite pedir "com passagem E sem hospedagem" — a pergunta que a equipe
 * de logística faz todo dia.
 *
 * Nada aqui olha o estado da tela: os contadores do popover precisam
 * responder "quantas linhas sobram se eu marcar ISTO mantendo o resto", o que
 * só é possível avaliando uma configuração passada de fora.
 */
import type { TeamInclusion } from "@shared/schema";
import { getScalingStatusKey } from "./scaling-status";

/** O que a fila precisa saber sobre cada linha, resolvido pela tela. */
export interface QueueContext {
  /** Nome efetivo: o gravado OU o escolhido nesta sessão e ainda não salvo. */
  temNome: (i: TeamInclusion) => boolean;
  /** Troca de colaborador aguardando análise. */
  temTroca: (i: TeamInclusion) => boolean;
  /** Pedido de ajuste/exclusão em aberto. */
  temPedido: (i: TeamInclusion) => boolean;
  /** O usuário atual pode confirmar esta linha (null = pode). */
  bloqueioParaConfirmar: (i: TeamInclusion) => string | null;
  temPassagemComprada: (i: TeamInclusion) => boolean;
  temHospedagemReservada: (i: TeamInclusion) => boolean;
  /** Cenotécnica de empreita — só nessas o tipo de freela é cobrado. */
  ehCenoEmpreita: (i: TeamInclusion) => boolean;
}

export type QueueKey = "escalar" | "gestor" | "troca" | "prontas";

export const QUEUE_META: { key: QueueKey; label: string; sub: string }[] = [
  { key: "escalar", label: "Escalar", sub: "vagas sem nome" },
  { key: "gestor", label: "Com o gestor", sub: "aguardando aprovação" },
  { key: "troca", label: "Em análise", sub: "trocas e ajustes" },
  { key: "prontas", label: "Prontas", sub: "pode confirmar" },
];

export function testeDaFila(key: QueueKey, ctx: QueueContext): (i: TeamInclusion) => boolean {
  switch (key) {
    // "Vaga aberta" é sobre NOME, não sobre o status gravado: uma linha marcada
    // como escalada sem colaborador continua sendo trabalho a fazer.
    case "escalar": return (i) => !ctx.temNome(i) && i.status !== "cancelado";
    case "gestor": return (i) => i.status === "aguardando_producao";
    case "troca": return (i) => ctx.temTroca(i) || ctx.temPedido(i);
    case "prontas": return (i) => !ctx.bloqueioParaConfirmar(i);
  }
}

// ── Filtros por grupo ───────────────────────────────────────────────────────

export type FlagKey =
  | "sit:aberta" | "sit:gestor" | "sit:escalado" | "sit:aprovado" | "sit:cancelada"
  | "pass:precisa" | "pass:nao-precisa" | "pass:comprada" | "pass:nao-comprada"
  | "hosp:precisa" | "hosp:nao-precisa" | "hosp:reservada" | "hosp:nao-reservada"
  | "anal:troca" | "anal:ajuste"
  | "falta:freela" | "falta:nf" | "falta:cidade";

export interface FlagGroup {
  id: string;
  titulo: string;
  opcoes: { key: FlagKey; label: string }[];
}

export const FLAG_GROUPS: FlagGroup[] = [
  {
    id: "sit", titulo: "Situação", opcoes: [
      { key: "sit:aberta", label: "Vaga aberta" },
      { key: "sit:gestor", label: "Aguardando gestor" },
      { key: "sit:escalado", label: "Escalado" },
      { key: "sit:aprovado", label: "Aprovado" },
      { key: "sit:cancelada", label: "Cancelada" },
    ],
  },
  {
    id: "pass", titulo: "Passagem", opcoes: [
      { key: "pass:precisa", label: "Precisa de passagem" },
      { key: "pass:nao-precisa", label: "Não precisa" },
      { key: "pass:comprada", label: "Comprada" },
      { key: "pass:nao-comprada", label: "Não comprada" },
    ],
  },
  {
    id: "hosp", titulo: "Hospedagem", opcoes: [
      { key: "hosp:precisa", label: "Precisa de hotel" },
      { key: "hosp:nao-precisa", label: "Não precisa" },
      { key: "hosp:reservada", label: "Reservada" },
      { key: "hosp:nao-reservada", label: "Não reservada" },
    ],
  },
  {
    id: "anal", titulo: "Em análise", opcoes: [
      { key: "anal:troca", label: "Troca de colaborador" },
      { key: "anal:ajuste", label: "Pedido de ajuste" },
    ],
  },
  {
    id: "falta", titulo: "Falta definir", opcoes: [
      { key: "falta:freela", label: "Tipo de freela (cenotécnica)" },
      { key: "falta:nf", label: "Não emite nota fiscal" },
      { key: "falta:cidade", label: "Sem cidade de saída" },
    ],
  },
];

function testeDaFlag(key: FlagKey, ctx: QueueContext): (i: TeamInclusion) => boolean {
  switch (key) {
    case "sit:aberta": return (i) => !ctx.temNome(i) && i.status !== "cancelado";
    case "sit:gestor": return (i) => i.status === "aguardando_producao";
    case "sit:escalado": return (i) => getScalingStatusKey(i) === "escalado" || getScalingStatusKey(i) === "em_aprovacao";
    case "sit:aprovado": return (i) => getScalingStatusKey(i) === "aprovado";
    case "sit:cancelada": return (i) => i.status === "cancelado";

    case "pass:precisa": return (i) => !!i.needsTicket;
    case "pass:nao-precisa": return (i) => !i.needsTicket;
    case "pass:comprada": return (i) => ctx.temPassagemComprada(i);
    case "pass:nao-comprada": return (i) => !ctx.temPassagemComprada(i);

    case "hosp:precisa": return (i) => !!i.needsAccommodation;
    case "hosp:nao-precisa": return (i) => !i.needsAccommodation;
    case "hosp:reservada": return (i) => ctx.temHospedagemReservada(i);
    case "hosp:nao-reservada": return (i) => !ctx.temHospedagemReservada(i);

    case "anal:troca": return (i) => ctx.temTroca(i);
    case "anal:ajuste": return (i) => ctx.temPedido(i);

    // Só faz sentido cobrar o tipo de freela de quem é cenotécnica de empreita.
    case "falta:freela": return (i) => ctx.ehCenoEmpreita(i) && !i.cenoFreelaTipo;
    case "falta:nf": return (i) => i.emitsNf === false;
    case "falta:cidade": return (i) => !String(i.city ?? "").trim();
  }
}

/**
 * O teste completo de flags, como fábrica. Dentro do grupo OU, entre grupos E:
 * marcar "Comprada" e "Não comprada" no mesmo grupo devolve tudo (é o que a
 * pessoa pediu), enquanto "Precisa de passagem" + "Não reservada" cruza os dois.
 */
export function fazTesteDeFlags(
  ativas: Record<string, boolean>,
  ctx: QueueContext,
): (i: TeamInclusion) => boolean {
  const porGrupo = FLAG_GROUPS
    .map((g) => g.opcoes.filter((o) => ativas[o.key]).map((o) => testeDaFlag(o.key, ctx)))
    .filter((testes) => testes.length > 0);
  if (porGrupo.length === 0) return () => true;
  return (i) => porGrupo.every((testes) => testes.some((t) => t(i)));
}

/**
 * Quantas linhas sobram se eu marcar ISTO mantendo o resto — o número que
 * aparece ao lado de cada opção. Alternar a própria chave e recontar é o que
 * torna o contador honesto: ele responde pela combinação inteira, não pela
 * opção isolada.
 */
export function contarComFlag(
  linhas: TeamInclusion[],
  ativas: Record<string, boolean>,
  key: FlagKey,
  ctx: QueueContext,
): number {
  const hipotese = { ...ativas, [key]: !ativas[key] };
  const teste = fazTesteDeFlags(hipotese, ctx);
  return linhas.filter(teste).length;
}

/** Todas as chaves de flag, na ordem em que aparecem no popover. */
export const TODAS_AS_FLAGS: FlagKey[] = FLAG_GROUPS.flatMap((g) => g.opcoes.map((o) => o.key));

/**
 * Os dezoito contadores de uma vez.
 *
 * A versão ingênua chamava contarComFlag por opção: 18 varreduras da lista
 * inteira, cada uma reconstruindo os predicados e reavaliando coisas caras
 * (status, mapas de troca, conflito). Com 3.700 vagas isso travava a tela a
 * cada clique dentro do popover.
 *
 * Aqui cada linha é avaliada UMA vez contra cada flag; as hipóteses depois
 * trabalham só sobre booleanos.
 */
export function contadoresDasFlags(
  linhas: TeamInclusion[],
  ativas: Record<string, boolean>,
  ctx: QueueContext,
): Record<string, number> {
  const testes = TODAS_AS_FLAGS.map((k) => testeDaFlag(k, ctx));
  // matriz[i][j] = a linha i atende a flag j
  const matriz: boolean[][] = linhas.map((linha) => testes.map((t) => t(linha)));

  // Índices das opções de cada grupo, para o "dentro do grupo OU".
  const gruposIdx = FLAG_GROUPS.map((g) => g.opcoes.map((o) => TODAS_AS_FLAGS.indexOf(o.key)));

  const passa = (linhaIdx: number, marcadas: boolean[]) => {
    for (const grupo of gruposIdx) {
      let temMarcada = false;
      let algumaBate = false;
      for (const j of grupo) {
        if (!marcadas[j]) continue;
        temMarcada = true;
        if (matriz[linhaIdx][j]) { algumaBate = true; break; }
      }
      if (temMarcada && !algumaBate) return false;
    }
    return true;
  };

  const base = TODAS_AS_FLAGS.map((k) => !!ativas[k]);
  const out: Record<string, number> = {};
  TODAS_AS_FLAGS.forEach((k, j) => {
    const hipotese = base.slice();
    hipotese[j] = !hipotese[j];
    let n = 0;
    for (let i = 0; i < linhas.length; i++) if (passa(i, hipotese)) n++;
    out[k] = n;
  });
  return out;
}

export function contarFlagsAtivas(ativas: Record<string, boolean>): number {
  return Object.values(ativas).filter(Boolean).length;
}

/** Busca sem acento e sem caixa — "jose" acha "José". */
export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
