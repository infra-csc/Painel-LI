/**
 * Consumo da busca de passagens — regra pura da aba "Consumo" (09/10, só admin).
 *
 * Entrada: linhas agregadas de `busca_passagens_consumo` (mês × usuário ×
 * cache/real × tipo). Saída: o mês corrente (reais, links, acertos do cache,
 * projeção até o fim do mês contra o teto), os últimos 6 meses e quem
 * consultou. "Atendido pelo cache" = resultado que alguém recebeu do cache
 * sem gastar (a pessoa que consultou não conta como acerto).
 */
import { situacaoDoTeto, voosDaPerna, type ItinerarioDeVoo, type PernaDaRota } from "./busca-de-passagens";

export interface LinhaDeConsumo {
  /** "AAAA-MM" (São Paulo). */
  mes: string;
  usuarioId: string | null;
  doCache: boolean;
  /** 'ida' | 'volta' | 'ida_e_volta' | 'link' */
  tipo: string;
  n: number;
}

export interface MesDoConsumo { mes: string; rotulo: string; reais: number; cache: number }
export interface UsuarioDoConsumo { usuarioId: string | null; nome: string; reais: number; cache: number }

export interface ResumoDoConsumo {
  mesAtual: {
    mes: string;
    /** Consultas que contam no teto (preços + links). */
    reais: number;
    links: number;
    /** Resultados entregues pelo cache sem gastar. */
    cache: number;
    /** cache ÷ (buscas reais de preço + cache); null sem nenhuma busca. */
    taxaCache: number | null;
    teto: number;
    situacao: "ok" | "alerta" | "atingido";
    /** No ritmo atual, quantas no fim do mês. */
    projecao: number;
    diaDoMes: number;
    diasNoMes: number;
  };
  porMes: MesDoConsumo[];
  porUsuario: UsuarioDoConsumo[];
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1] ?? "?"}/${mes.slice(2, 4)}`;

function mesAnterior(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

export function resumirConsumo(
  linhas: readonly LinhaDeConsumo[],
  ctx: { hoje: string; teto: number; nomes?: Record<string, string>; meses?: number },
): ResumoDoConsumo {
  const mes = ctx.hoje.slice(0, 7);
  const doMes = linhas.filter((l) => l.mes === mes);
  const reais = doMes.filter((l) => !l.doCache).reduce((s, l) => s + l.n, 0);
  const links = doMes.filter((l) => !l.doCache && l.tipo === "link").reduce((s, l) => s + l.n, 0);
  const cache = doMes.filter((l) => l.doCache).reduce((s, l) => s + l.n, 0);
  const buscasReais = reais - links;
  const diaDoMes = Number(ctx.hoje.slice(8, 10));
  const [a, m] = mes.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const projecao = diaDoMes > 0 ? Math.round((reais / diaDoMes) * diasNoMes) : reais;

  const nMeses = ctx.meses ?? 6;
  const porMes: MesDoConsumo[] = [];
  for (let i = nMeses - 1; i >= 0; i--) {
    const mm = mesAnterior(mes, i);
    const l = linhas.filter((x) => x.mes === mm);
    porMes.push({
      mes: mm,
      rotulo: rotuloDoMes(mm),
      reais: l.filter((x) => !x.doCache).reduce((s, x) => s + x.n, 0),
      cache: l.filter((x) => x.doCache).reduce((s, x) => s + x.n, 0),
    });
  }

  const usuarios = new Map<string, UsuarioDoConsumo>();
  for (const l of doMes) {
    const k = l.usuarioId ?? "";
    const u = usuarios.get(k) ?? { usuarioId: l.usuarioId, nome: (l.usuarioId && ctx.nomes?.[l.usuarioId]) || "Usuário removido", reais: 0, cache: 0 };
    if (l.doCache) u.cache += l.n; else u.reais += l.n;
    usuarios.set(k, u);
  }
  const porUsuario = Array.from(usuarios.values()).sort((x, y) => y.reais - x.reais || y.cache - x.cache || x.nome.localeCompare(y.nome, "pt-BR"));

  return {
    mesAtual: {
      mes, reais, links, cache,
      taxaCache: buscasReais + cache > 0 ? cache / (buscasReais + cache) : null,
      teto: ctx.teto,
      situacao: situacaoDoTeto(reais, ctx.teto),
      projecao, diaDoMes, diasNoMes,
    },
    porMes,
    porUsuario,
  };
}

// ── Histórico: o que se guarda de cada consulta real ───────────────────────


export interface OpcaoDoHistorico {
  posicao: number;
  itinerarioId: string;
  companhia: string;
  voos: string;
  idaPartida: string | null;
  idaChegada: string | null;
  voltaPartida: string | null;
  voltaChegada: string | null;
  paradas: number;
  duracaoMin: number | null;
  precoCentavos: number;
}

/**
 * Resumo de uma resposta para o histórico: menor preço geral, menor por
 * companhia e as 10 opções mais baratas (posição 1 = mais barata). A perna
 * única de "volta" fica nas colunas de volta — a análise por horário lê certo.
 */
export function resumoParaHistorico(itinerarios: readonly ItinerarioDeVoo[], perna: PernaDaRota): {
  menorPrecoCentavos: number | null;
  menorPorCia: Record<string, number>;
  opcoes: OpcaoDoHistorico[];
} {
  const validos = itinerarios.filter((i) => i.precoCentavos > 0 && i.pernas.length > 0).slice().sort((a, b) => a.precoCentavos - b.precoCentavos);
  const menorPorCia: Record<string, number> = {};
  for (const i of validos) {
    const cia = i.pernas[0].segmentos[0]?.companhia || i.pernas[0].companhia;
    if (cia && (menorPorCia[cia] === undefined || i.precoCentavos < menorPorCia[cia])) menorPorCia[cia] = i.precoCentavos;
  }
  const opcoes = validos.slice(0, 10).map((i, k): OpcaoDoHistorico => {
    const primeira = i.pernas[0];
    const segunda = i.pernas[1] ?? null;
    const ida = perna === "volta" ? null : primeira;
    const volta = perna === "volta" ? primeira : segunda;
    const duracoes = i.pernas.map((p) => p.duracaoMin);
    return {
      posicao: k + 1,
      itinerarioId: i.id,
      companhia: primeira.segmentos[0]?.companhia || primeira.companhia,
      voos: i.pernas.map((p) => voosDaPerna(p)).join(" / "),
      idaPartida: ida?.segmentos[0]?.partida ?? null,
      idaChegada: ida?.segmentos[ida.segmentos.length - 1]?.chegada ?? null,
      voltaPartida: volta?.segmentos[0]?.partida ?? null,
      voltaChegada: volta?.segmentos[volta.segmentos.length - 1]?.chegada ?? null,
      paradas: Math.max(0, ...i.pernas.map((p) => p.segmentos.length - 1)),
      duracaoMin: duracoes.every((d) => typeof d === "number") ? (duracoes as number[]).reduce((s, d) => s + d, 0) : null,
      precoCentavos: i.precoCentavos,
    };
  });
  return { menorPrecoCentavos: validos[0]?.precoCentavos ?? null, menorPorCia, opcoes };
}
