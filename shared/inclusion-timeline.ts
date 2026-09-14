/**
 * Histórico da vaga (dono, 14/09: "no histórico do modal não aparecem todos os
 * status da escalação e está bem confuso na maioria das vezes").
 *
 * O modal lia só `team_inclusion_logs`, e boa parte do que acontece com uma
 * vaga nunca gravou ali: a criação, passagem registrada/comprada/emitida,
 * hospedagem registrada, troca de colaborador pedida/aprovada/recusada, a
 * exclusão. E o que gravava vinha duplicado (a aprovação do gestor gerava
 * "Aprovado pelo gestor" E "Status alterado" no mesmo segundo), com a chave
 * crua como rótulo e detalhes colados com "|".
 *
 * Aqui a linha do tempo é MONTADA a partir de todas as fontes que já existem
 * no banco — por isso funciona também para vagas antigas, sem migração — e
 * limpa: um título curto por acontecimento, a categoria, quem fez, o
 * comentário separado do texto, sem duplicatas.
 */

export type CategoriaDoHistorico =
  | "vaga" | "escala" | "aprovacao" | "passagem" | "hospedagem" | "troca" | "pedido" | "alteracao";

export interface EntradaDoHistorico {
  id: string;
  /** ISO do momento. Em `diaFixo` o horário não é conhecido. */
  at: string;
  /** "YYYY-MM-DD" quando só se sabe o dia (ex.: data de compra da passagem). */
  diaFixo: string | null;
  categoria: CategoriaDoHistorico;
  titulo: string;
  detalhe: string | null;
  /** Detalhe em várias linhas (ex.: dias de trabalho antes/depois). */
  linhas: string[];
  autor: string | null;
  comentario: string | null;
}

type Quando = string | Date | null | undefined;

export interface FontesDoHistorico {
  vaga: {
    id: string;
    createdAt: Quando;
    suggestionSentAt?: Quando;
    validatedAt?: Quando;
    validatedByName?: string | null;
    deletedAt?: Quando;
  };
  logs: { id: string; action: string; details: string | null; previousValue: string | null; newValue: string | null; userName: string | null; createdAt: Quando }[];
  passagens: {
    id: string; createdAt: Quando; purchaseDate?: Quando; emittedAt?: Quando; emittedByName?: string | null;
    ticketStatus?: string | null; transportType?: string | null;
    departureCityOrigin?: string | null; departureCityDestination?: string | null;
  }[];
  hospedagens: { id: string; createdAt: Quando; hotelName?: string | null; checkInDate?: Quando; checkOutDate?: Quando; hotelStatus?: string | null }[];
  trocas: {
    id: string; createdAt: Quando; requestedByName?: string | null; currentCollaboratorName?: string | null; newCollaboratorName?: string | null;
    newCity?: string | null; reason?: string | null; status: string; reviewedAt?: Quando; reviewedByName?: string | null; reviewComment?: string | null;
  }[];
  pedidos: {
    id: string; createdAt: Quando; requestType: string; requestedByName?: string | null; reason?: string | null;
    status: string; reviewedAt?: Quando; reviewedByName?: string | null; reviewComment?: string | null;
  }[];
}

/** Rótulo de cada status gravado — o mesmo vocabulário das telas. */
export const ROTULO_DO_STATUS: Record<string, string> = {
  planejado: "Aguardando escalação",
  pendente: "Pendente",
  confirmado: "Confirmado",
  reaberto: "Reaberto",
  escalacao: "Escalado",
  escalado: "Escalado",
  aguardando_producao: "Aguardando aprovação do gestor",
  passagem: "Aguardando passagem",
  passagem_comprada: "Passagem comprada",
  hospedagem: "Aguardando hospedagem",
  hospedagem_comprada: "Hospedagem reservada",
  hospedagem_passagem_comprada: "Passagem e hospedagem prontas",
  aprovacao: "Em aprovação",
  aprovado: "Aprovado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  sugestao_pendente: "Aguardando validação da área",
  sugestao_validada: "Validada, aguardando aprovador",
  sugestao_ajuste: "Com pedido de ajuste",
  sugestao_negada: "Negada",
};
const rotuloStatus = (s: string | null | undefined) => (s ? ROTULO_DO_STATUS[s] ?? s : "sem status");

const toIso = (q: Quando): string | null => {
  if (!q) return null;
  const d = q instanceof Date ? q : new Date(String(q).length === 10 ? `${q}T12:00:00` : String(q));
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const ymd = (q: Quando): string | null => {
  if (!q) return null;
  if (q instanceof Date) {
    if (isNaN(q.getTime())) return null;
    return `${q.getFullYear()}-${String(q.getMonth() + 1).padStart(2, "0")}-${String(q.getDate()).padStart(2, "0")}`;
  }
  const s = String(q).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const diaBr = (q: Quando) => { const d = ymd(q); return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ""; };

const MARCA_COMENTARIO = ". Comentário: ";
/** Separa "texto fixo. Comentário: fulano disse" em texto + comentário. */
export function separarComentario(details: string | null | undefined): { texto: string; comentario: string | null } {
  const d = details ?? "";
  const i = d.indexOf(MARCA_COMENTARIO);
  if (i < 0) return { texto: d.trim(), comentario: null };
  return { texto: d.slice(0, i).trim(), comentario: d.slice(i + MARCA_COMENTARIO.length).trim() || null };
}

interface MapaDoLog { categoria: CategoriaDoHistorico; titulo: string }
const LOG: Record<string, MapaDoLog> = {
  created: { categoria: "vaga", titulo: "Vaga criada" },
  create: { categoria: "vaga", titulo: "Vaga criada" },
  created_from_change_request: { categoria: "vaga", titulo: "Vaga criada por pedido de inclusão" },
  collaborator_changed: { categoria: "escala", titulo: "Colaborador alterado" },
  confirmed: { categoria: "escala", titulo: "Escalação confirmada" },
  reopened: { categoria: "escala", titulo: "Escalação reaberta" },
  reactivate: { categoria: "vaga", titulo: "Vaga reativada" },
  delete: { categoria: "vaga", titulo: "Vaga excluída" },
  deleted: { categoria: "vaga", titulo: "Vaga excluída" },
  approve_production: { categoria: "aprovacao", titulo: "Aprovada pelo gestor" },
  reject_production: { categoria: "aprovacao", titulo: "Reprovada pelo gestor" },
  suggestion_sent: { categoria: "aprovacao", titulo: "Enviada para validação da área" },
  suggestion_validated: { categoria: "aprovacao", titulo: "Validada pela área" },
  suggestion_approved: { categoria: "aprovacao", titulo: "Aprovada pelo aprovador" },
  suggestion_rejected: { categoria: "aprovacao", titulo: "Reprovada pelo aprovador" },
  suggestion_returned: { categoria: "aprovacao", titulo: "Devolvida para a área" },
  suggestion_bypass_approve: { categoria: "aprovacao", titulo: "Aprovada sem validação da área" },
  suggestion_bypass_reject: { categoria: "aprovacao", titulo: "Reprovada sem validação da área" },
  suggestion_change_requested: { categoria: "pedido", titulo: "Pedido aberto pela área" },
  change_request_approved: { categoria: "pedido", titulo: "Pedido aprovado" },
  change_request_reajustar: { categoria: "pedido", titulo: "Pedido reajustado pelo aprovador" },
  change_request_negar: { categoria: "pedido", titulo: "Pedido negado" },
  dates_changed: { categoria: "alteracao", titulo: "Período alterado" },
  work_days_changed: { categoria: "alteracao", titulo: "Dias de trabalho alterados" },
  daily_rates_changed: { categoria: "alteracao", titulo: "Quantidade de diárias alterada" },
  daily_value_changed: { categoria: "alteracao", titulo: "Valor da diária alterado" },
  travel_dates_changed: { categoria: "alteracao", titulo: "Datas de viagem alteradas" },
  observations_changed: { categoria: "alteracao", titulo: "Observações alteradas" },
  city_changed: { categoria: "alteracao", titulo: "Cidade de saída alterada" },
};

function entradaDoLog(l: FontesDoHistorico["logs"][number]): EntradaDoHistorico | null {
  const at = toIso(l.createdAt);
  if (!at) return null;
  const base = { id: `log-${l.id}`, at, diaFixo: null, autor: l.userName || null, linhas: [] as string[] };
  const { texto, comentario } = separarComentario(l.details);

  if (l.action === "status_changed") {
    return { ...base, categoria: "escala", titulo: `Status: ${rotuloStatus(l.newValue)}`, detalhe: l.previousValue ? `Antes: ${rotuloStatus(l.previousValue)}` : null, comentario: null };
  }
  if (l.action === "collaborator_changed") {
    return { ...base, categoria: "escala", titulo: l.newValue && l.newValue !== "Nenhum" ? `Colaborador: ${l.newValue}` : "Colaborador removido", detalhe: l.previousValue && l.previousValue !== "Nenhum" ? `Antes: ${l.previousValue}` : null, comentario: null };
  }
  if (l.action === "work_days_changed") {
    return { ...base, ...LOG.work_days_changed, detalhe: null, linhas: texto.split(" | ").map((s) => s.trim()).filter(Boolean), comentario: null };
  }
  if (l.action === "travel_dates_changed") {
    return { ...base, ...LOG.travel_dates_changed, detalhe: l.previousValue || l.newValue ? `${l.previousValue ?? "—"} → ${l.newValue ?? "—"}` : null, comentario: null };
  }
  if (l.action === "observations_changed") {
    return { ...base, ...LOG.observations_changed, detalhe: l.newValue ? `Agora: ${l.newValue}` : "Observações apagadas", comentario: null };
  }
  const mapa = LOG[l.action] ?? { categoria: "alteracao" as const, titulo: l.action.replace(/_/g, " ") };
  return { ...base, ...mapa, detalhe: texto || null, comentario };
}

const JANELA_MESMO_ATO_MS = 5_000;
const JANELA_MESMA_FONTE_MS = 120_000;
const ms = (e: EntradaDoHistorico) => new Date(e.at).getTime();

/** Monta a linha do tempo da vaga: todas as fontes, sem duplicatas, mais recente primeiro. */
export function montarHistoricoDaVaga(f: FontesDoHistorico): EntradaDoHistorico[] {
  const doLog = f.logs.map(entradaDoLog).filter((e): e is EntradaDoHistorico => !!e);

  // 1) "Status: X" gravado junto de um ato com nome próprio (aprovação do
  //    gestor, reprovação…) é o mesmo acontecimento — fica só o ato.
  const semEco = doLog.filter((e) => {
    if (!e.id.startsWith("log-") || !e.titulo.startsWith("Status: ")) return true;
    return !doLog.some((o) => o !== e && !o.titulo.startsWith("Status: ") && o.categoria === "aprovacao" && Math.abs(ms(o) - ms(e)) <= JANELA_MESMO_ATO_MS);
  });

  const extras: EntradaDoHistorico[] = [];
  const add = (e: Omit<EntradaDoHistorico, "linhas"> & { linhas?: string[] }) => extras.push({ linhas: [], ...e });
  const temLogPerto = (acoes: string[], quando: string | null) =>
    !!quando && f.logs.some((l) => acoes.includes(l.action) && Math.abs((toIso(l.createdAt) ? new Date(toIso(l.createdAt)!).getTime() : 0) - new Date(quando).getTime()) <= JANELA_MESMA_FONTE_MS);

  // 2) Vaga
  const criada = toIso(f.vaga.createdAt);
  if (criada && !f.logs.some((l) => ["created", "create", "created_from_change_request"].includes(l.action))) {
    add({ id: "vaga-criada", at: criada, diaFixo: null, categoria: "vaga", titulo: "Vaga criada", detalhe: null, autor: null, comentario: null });
  }
  const enviada = toIso(f.vaga.suggestionSentAt);
  if (enviada && !temLogPerto(["suggestion_sent", "suggestion_returned", "change_request_reajustar", "change_request_negar"], enviada)) {
    add({ id: "vaga-enviada", at: enviada, diaFixo: null, categoria: "aprovacao", titulo: "Enviada para validação da área", detalhe: null, autor: null, comentario: null });
  }
  const validada = toIso(f.vaga.validatedAt);
  if (validada && !temLogPerto(["suggestion_validated"], validada)) {
    add({ id: "vaga-validada", at: validada, diaFixo: null, categoria: "aprovacao", titulo: "Validada pela área", detalhe: null, autor: f.vaga.validatedByName ?? null, comentario: null });
  }
  const excluida = toIso(f.vaga.deletedAt);
  if (excluida && !temLogPerto(["delete", "deleted"], excluida)) {
    add({ id: "vaga-excluida", at: excluida, diaFixo: null, categoria: "vaga", titulo: "Vaga excluída", detalhe: null, autor: null, comentario: null });
  }

  // 3) Passagens
  for (const t of f.passagens) {
    const trecho = [t.departureCityOrigin, t.departureCityDestination].filter(Boolean).join(" → ");
    const tipo = t.transportType === "rodoviario" ? "rodoviária" : t.transportType === "aereo" ? "aérea" : null;
    const registrada = toIso(t.createdAt);
    if (registrada) {
      add({ id: `passagem-${t.id}-registrada`, at: registrada, diaFixo: null, categoria: "passagem", titulo: "Passagem registrada",
        detalhe: [tipo ? `Passagem ${tipo}` : null, trecho || null, t.ticketStatus === "cancelada" ? "cancelada depois" : null].filter(Boolean).join(" · ") || null, autor: null, comentario: null });
    }
    const compra = ymd(t.purchaseDate);
    if (compra) {
      add({ id: `passagem-${t.id}-comprada`, at: toIso(compra)!, diaFixo: compra, categoria: "passagem", titulo: "Passagem comprada", detalhe: trecho || null, autor: null, comentario: null });
    }
    const emitida = toIso(t.emittedAt);
    if (emitida) {
      add({ id: `passagem-${t.id}-emitida`, at: emitida, diaFixo: null, categoria: "passagem", titulo: "Passagem emitida", detalhe: trecho || null, autor: t.emittedByName ?? null, comentario: null });
    }
  }

  // 4) Hospedagens
  for (const h of f.hospedagens) {
    const registrada = toIso(h.createdAt);
    if (!registrada) continue;
    const estadia = h.checkInDate || h.checkOutDate ? `${diaBr(h.checkInDate) || "?"} a ${diaBr(h.checkOutDate) || "?"}` : null;
    add({ id: `hospedagem-${h.id}`, at: registrada, diaFixo: null, categoria: "hospedagem", titulo: "Hospedagem registrada",
      detalhe: [h.hotelName || null, estadia, h.hotelStatus === "cancelada" ? "cancelada depois" : null].filter(Boolean).join(" · ") || null, autor: null, comentario: null });
  }

  // 5) Trocas de colaborador (a aprovação grava por SQL direto, sem log)
  for (const s of f.trocas) {
    const pedida = toIso(s.createdAt);
    const para = [s.currentCollaboratorName, s.newCollaboratorName].map((n) => n || "?").join(" → ");
    if (pedida) {
      add({ id: `troca-${s.id}-pedida`, at: pedida, diaFixo: null, categoria: "troca", titulo: "Troca de colaborador pedida",
        detalhe: [para, s.newCity ? `sai de ${s.newCity}` : null].filter(Boolean).join(" · "), autor: s.requestedByName ?? null, comentario: s.reason || null });
    }
    const revista = toIso(s.reviewedAt);
    if (revista && s.status !== "pendente") {
      const titulo = s.status === "aprovado" ? "Troca aprovada" : s.status === "rejeitado" ? "Troca recusada" : s.status === "cancelado" ? "Pedido de troca cancelado" : `Troca ${s.status}`;
      add({ id: `troca-${s.id}-${s.status}`, at: revista, diaFixo: null, categoria: "troca", titulo,
        detalhe: s.status === "aprovado" ? [`Agora: ${s.newCollaboratorName || "?"}`, s.newCity ? `sai de ${s.newCity}` : null].filter(Boolean).join(" · ") : para,
        autor: s.reviewedByName ?? null, comentario: s.reviewComment || null });
    }
  }

  // 6) Pedidos de ajuste/exclusão (só o que o log da vaga ainda não contou)
  const TIPO: Record<string, string> = { ajuste: "ajuste", exclusao: "exclusão", inclusao: "inclusão" };
  const DECISAO: Record<string, string> = { aprovado: "aprovado", reajustado: "reajustado pelo aprovador", negado: "negado", reenviado_validacao: "devolvido para a área" };
  for (const p of f.pedidos) {
    const aberto = toIso(p.createdAt);
    if (aberto && !temLogPerto(["suggestion_change_requested"], aberto)) {
      add({ id: `pedido-${p.id}-aberto`, at: aberto, diaFixo: null, categoria: "pedido", titulo: `Pedido de ${TIPO[p.requestType] ?? p.requestType} aberto`, detalhe: null, autor: p.requestedByName ?? null, comentario: p.reason || null });
    }
    const revisto = toIso(p.reviewedAt);
    if (revisto && p.status !== "pendente" && !temLogPerto(["change_request_approved", "change_request_reajustar", "change_request_negar"], revisto)) {
      add({ id: `pedido-${p.id}-${p.status}`, at: revisto, diaFixo: null, categoria: "pedido", titulo: `Pedido de ${TIPO[p.requestType] ?? p.requestType} ${DECISAO[p.status] ?? p.status}`, detalhe: null, autor: p.reviewedByName ?? null, comentario: p.reviewComment || null });
    }
  }

  return [...semEco, ...extras].sort((a, b) => ms(b) - ms(a) || a.id.localeCompare(b.id));
}
