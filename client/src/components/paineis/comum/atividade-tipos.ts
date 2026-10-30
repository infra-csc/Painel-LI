/**
 * Painéis (30/10) — o contrato de GET /api/paineis/atividade (espelho de
 * server/routes/paineis.ts) e as regras de apresentação do feed que as duas
 * telas usam: rótulo de cada tipo, o caminho para a tela de trabalho e os
 * filtros que ficam no client ("atrasados", "só não vistos").
 */
import type { EtapaDoQuadro } from "@/components/scaling/scaling-analytics-data";
import { hasPermission, type RolePermissions } from "@/lib/role-utils";
import type { User } from "@shared/schema";

export type TipoDaAtividade = "inclusao" | "mudanca" | "passagem" | "hotel" | "pedido";
export const TIPOS_DA_ATIVIDADE: TipoDaAtividade[] = ["inclusao", "mudanca", "passagem", "hotel", "pedido"];
export type PeriodoDaAtividade = "hoje" | "24h" | "7d";

export interface VagaDaAtividade {
  id: string;
  numero: number | null;
  funcao: string | null;
  colaborador: string | null;
  fase: "sugestao" | "escalacao";
  status: string;
  excluida: boolean;
  precisaPassagem: boolean;
  precisaHotel: boolean;
  pedidoPendenteId: string | null;
  trocaPendente: boolean;
}

export interface ItemDaAtividade {
  id: string;
  at: string;
  tipo: TipoDaAtividade;
  titulo: string;
  detalhe: string | null;
  linhas: string[];
  comentario: string | null;
  autor: string | null;
  destaque: boolean;
  eventId: string | null;
  eventName: string | null;
  vagas: VagaDaAtividade[];
  quantidade: number;
  funcoes: string[];
  precisaPassagem: boolean;
  precisaHotel: boolean;
  pedidoId: string | null;
  eventStartDate: string | null;
}

export interface RespostaDaAtividade {
  itens: ItemDaAtividade[];
  proximo: string | null;
  total: number;
  resumo: Record<TipoDaAtividade, number>;
  desde: string;
  geradoEm: string;
  cortado: boolean;
}

export const ROTULO_DO_TIPO: Record<TipoDaAtividade, string> = {
  inclusao: "Inclusões",
  mudanca: "Mudanças",
  passagem: "Passagens",
  hotel: "Hotéis",
  pedido: "Pedidos e trocas",
};

export const ROTULO_DO_PERIODO: Record<PeriodoDaAtividade, string> = {
  hoje: "Hoje",
  "24h": "24 h",
  "7d": "7 dias",
};

export interface FiltrosDoServidor {
  periodo: PeriodoDaAtividade;
  eventId: string | null;
  tipo: TipoDaAtividade | null;
  comPassagem: boolean;
  comHotel: boolean;
}

/** URL da página do feed (cursor = página seguinte). */
export function urlDaAtividade(f: FiltrosDoServidor, cursor: string | null = null, limite = 50): string {
  const p = new URLSearchParams({ periodo: f.periodo, limite: String(limite) });
  if (f.eventId) p.set("eventId", f.eventId);
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.comPassagem) p.set("passagem", "1");
  if (f.comHotel) p.set("hotel", "1");
  if (cursor) p.set("cursor", cursor);
  return `/api/paineis/atividade?${p.toString()}`;
}

/** Onde o item se resolve: a tela e o recorte certos. */
export interface DestinoDoItem {
  href: string;
  /** Nome da tela, para o botão/rótulo ("Abrir na Aprovação"). */
  tela: string;
}

const enc = encodeURIComponent;
const pode = (user: User | null, p: keyof RolePermissions) => hasPermission(user, p);

/**
 * O destino de cada item do feed:
 *  - pedido (ajuste/inclusão/exclusão) → Aprovação de escala já no pedido;
 *  - troca → Escalação, bloco "Em análise", no evento;
 *  - passagem → Passagens no evento, com a busca na vaga;
 *  - hotel → Espelho operacional no evento (o mesmo destino do Quadro de prazos);
 *  - vaga ainda na Validação/Aprovação → a tela da etapa, no evento;
 *  - o resto → Escalação no evento, com a busca na vaga.
 * Sem permissão para a tela da etapa, cai na Escalação do evento.
 */
export function destinoDoItem(item: ItemDaAtividade, user: User | null): DestinoDoItem {
  const ev = item.eventId;
  const vaga = item.vagas.length === 1 ? item.vagas[0] : null;
  const busca = vaga?.numero ? `&q=${vaga.numero}` : "";
  const escalacao: DestinoDoItem = { href: ev ? `/scaling?eventId=${enc(ev)}${busca}` : "/scaling", tela: "Escalação" };
  if (!ev) return escalacao;

  const pedidoId = item.pedidoId ?? vaga?.pedidoPendenteId ?? null;
  if (item.tipo === "pedido" && pedidoId && item.titulo.startsWith("Pedido") && pode(user, "canAccessScalingApproval")) {
    return { href: `/scaling-approval?eventId=${enc(ev)}&request=${enc(pedidoId)}`, tela: "Aprovação de escala" };
  }
  if (item.tipo === "pedido" && !item.titulo.startsWith("Pedido")) {
    return { href: `/scaling?eventId=${enc(ev)}&fila=troca`, tela: "Escalação" };
  }
  if (item.tipo === "passagem") return { href: `/tickets?event=${enc(ev)}${vaga?.numero ? `&q=${vaga.numero}` : ""}`, tela: "Passagens" };
  if (item.tipo === "hotel") return { href: `/accommodations?event=${enc(ev)}`, tela: "Hospedagem" };
  if (vaga?.fase === "sugestao") {
    if (vaga.status === "sugestao_validada" && pode(user, "canAccessScalingApproval")) {
      return { href: `/scaling-approval?eventId=${enc(ev)}`, tela: "Aprovação de escala" };
    }
    if (pode(user, "canAccessScalingValidation")) return { href: `/scaling-validation?eventId=${enc(ev)}`, tela: "Validação de escala" };
  }
  return escalacao;
}

/** Item com alguma vaga parada em etapa de prazo vencido (régua do Quadro de prazos). */
export function etapaAtrasadaDoItem(item: ItemDaAtividade, atrasadas: ReadonlyMap<string, EtapaDoQuadro>): EtapaDoQuadro | null {
  for (const v of item.vagas) {
    const e = atrasadas.get(v.id);
    if (e) return e;
  }
  return null;
}

/** O item é novo desde a última visita (sem visita anterior, tudo é novo). */
export function ehNovo(item: Pick<ItemDaAtividade, "at">, ultimaVisita: string | null): boolean {
  return !ultimaVisita || item.at > ultimaVisita;
}
