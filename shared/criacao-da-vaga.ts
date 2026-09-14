/**
 * Quem criou a vaga, por onde e quando (dono, 14/09: "o histórico não está
 * completo, não sei quem criou, onde criou e quando").
 *
 * A vaga não guarda o autor: `team_inclusions.user_id` é o RESPONSÁVEL pela
 * função (a grade manda o dono da função), não quem criou. O autor existe em
 * outros registros, que variam com a porta de entrada:
 *
 *  - pedido de inclusão aprovado → log `created_from_change_request` na vaga;
 *  - Sugestão de Escala → log `suggestion_sent` na vaga, na hora da criação;
 *  - criação registrada a partir de 14/09 → log `created` na vaga ("Pela …");
 *  - escalação de emergência (tela Colaboradores) → auditoria `create` com o
 *    id exato da vaga;
 *  - grade da Inclusão de Equipe (antes de 14/09) → UMA auditoria `create`
 *    por lote ({ count }), gravada segundos depois — achada pela hora.
 *
 * A ordem acima é a da confiança: o registro na própria vaga vence a
 * auditoria, e a auditoria exata vence a do lote achada pela hora.
 */

type Quando = string | Date | null | undefined;
const ms = (q: Quando): number => {
  if (!q) return NaN;
  const d = q instanceof Date ? q : new Date(String(q));
  return d.getTime();
};

/** Onde a vaga nasceu — o texto que o Histórico mostra depois de "pela". */
export const ONDE_A_VAGA_NASCEU = {
  inclusao: "tela Inclusão de Equipe",
  emergencia: "tela Colaboradores (escalação de emergência)",
  sugestao: "Sugestão de Escala",
  pedido: "Aprovação de Escala (pedido de inclusão aprovado)",
} as const;

export interface LogDaVagaParaCriacao {
  action: string;
  details?: string | null;
  userName?: string | null;
  createdAt: Quando;
}

export interface AuditoriaDeCriacao {
  entityId: string;
  action: string;
  userName?: string | null;
  newData?: string | null;
  createdAt: Quando;
}

export interface CriacaoDaVaga {
  por: string | null;
  onde: string | null;
}

/** Janela para casar a vaga com a auditoria do lote (gravada logo depois). */
export const JANELA_DA_CRIACAO_MS = 120_000;

function ehLote(newData: string | null | undefined): boolean {
  if (!newData) return false;
  try {
    const o = JSON.parse(newData) as unknown;
    return !!o && typeof o === "object" && "count" in (o as Record<string, unknown>);
  } catch {
    return false;
  }
}

export function origemDaCriacao(p: {
  vagaId: string;
  createdAt: Quando;
  logs: LogDaVagaParaCriacao[];
  auditorias: AuditoriaDeCriacao[];
}): CriacaoDaVaga {
  const criadaMs = ms(p.createdAt);
  const perto = (q: Quando) => !isNaN(criadaMs) && !isNaN(ms(q)) && Math.abs(ms(q) - criadaMs) <= JANELA_DA_CRIACAO_MS;
  const maisAntigo = (acao: string) =>
    p.logs.filter((l) => l.action === acao).sort((a, b) => ms(a.createdAt) - ms(b.createdAt))[0];
  const maisPerto = <T extends { createdAt: Quando }>(lista: T[]) =>
    [...lista].sort((a, b) => Math.abs(ms(a.createdAt) - criadaMs) - Math.abs(ms(b.createdAt) - criadaMs))[0];

  const doPedido = maisAntigo("created_from_change_request");
  if (doPedido) return { por: doPedido.userName ?? null, onde: ONDE_A_VAGA_NASCEU.pedido };

  const criada = maisAntigo("created");
  if (criada) {
    const onde = (criada.details ?? "").replace(/^Pela\s+/i, "").trim();
    return { por: criada.userName ?? null, onde: onde || null };
  }

  const sugerida = maisAntigo("suggestion_sent");
  if (sugerida && perto(sugerida.createdAt)) return { por: sugerida.userName ?? null, onde: ONDE_A_VAGA_NASCEU.sugestao };

  const creates = p.auditorias.filter((a) => a.action === "create");
  const exata = creates.find((a) => a.entityId === p.vagaId);
  if (exata) {
    return { por: exata.userName ?? null, onde: ehLote(exata.newData) ? ONDE_A_VAGA_NASCEU.inclusao : ONDE_A_VAGA_NASCEU.emergencia };
  }

  const lote = maisPerto(creates.filter((a) => ehLote(a.newData) && perto(a.createdAt)));
  if (lote) return { por: lote.userName ?? null, onde: ONDE_A_VAGA_NASCEU.inclusao };

  const sugestaoAuditada = maisPerto(p.auditorias.filter((a) => a.action === "suggestion_sent" && perto(a.createdAt)));
  if (sugestaoAuditada) return { por: sugestaoAuditada.userName ?? null, onde: ONDE_A_VAGA_NASCEU.sugestao };

  return { por: null, onde: null };
}
