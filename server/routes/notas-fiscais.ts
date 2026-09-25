/**
 * Notas fiscais (invoices): listagem, envio, reenvio, aprovação, devolução,
 * recusa e check-in financeiro, com histórico anexado no banco.
 * Papéis: financeiro (admin/RH).
 */
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { invoices as invoicesTable, insertInvoiceSchema, type Invoice, type HistoricoNfEntrada } from "@shared/schema";
import { eq, and, isNull, sql as drizzleSql } from "drizzle-orm";
import { ZodError } from "zod";
import { isNfEligible, podeAprovarNota, podeDevolverNota, podeFazerCheckin } from "@shared/prestacao-rules";
import { createAuditLog, ehViolacaoDeUnicidade, requireRoles, FINANCE_ROLES, requireFinanceUser } from "./_compartilhado";

export function registrarNotasFiscais(app: Express): void {
  // ── Invoices (Notas Fiscais) ──────────────────────────────────────────────

  // NFs são do fluxo financeiro (a tela /invoices no client é só admin/RH —
  // canAccessFinanceiro). Antes qualquer sessão lia, criava e editava.
  app.get("/api/invoices", async (req, res) => {
    if (!await requireRoles(req, res, FINANCE_ROLES)) return;
    try {
      const eventId = req.query.eventId as string | undefined;
      const result = await storage.getInvoices(eventId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Erro ao buscar notas fiscais" });
    }
  });

  /**
   * Decisão da NF (23/09): UM UPDATE guardado pelo status esperado, com o
   * histórico anexado NO BANCO (append em jsonb) — antes o histórico era lido,
   * alterado em JS e regravado inteiro, e duas decisões simultâneas perdiam
   * uma entrada e gravavam status por cima. 0 linhas → 409.
   */
  /**
   * `history = history || $1::jsonb` (25/09: a coluna É jsonb; o COALESCE cobre
   * notas antigas com NULL até a migração fixar o NOT NULL).
   */
  const anexarAoHistorico = (evento: Record<string, unknown>) => {
    const entrada: HistoricoNfEntrada[] = [{ ...evento, type: String(evento.type), at: new Date().toISOString() }];
    return drizzleSql`COALESCE(${invoicesTable.history}, '[]'::jsonb) || ${JSON.stringify(entrada)}::jsonb`;
  };
  const decidirNota = async (
    invoiceId: string, statusEsperado: string, patch: Partial<Invoice>, evento: Record<string, unknown>,
  ) => {
    const [row] = await db.update(invoicesTable)
      .set({
        ...patch,
        updatedAt: new Date(),
        history: anexarAoHistorico(evento),
      })
      .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.status, statusEsperado)))
      .returning();
    return row;
  };

  // Slide 5 do deck de melhorias: dentro do mesmo evento, lançamentos com a
  // mesma OC precisam ter a mesma nota fiscal anexada (mesmo arquivo/nome).
  // Devolve a mensagem de erro, ou null se estiver consistente.
  const validateOcConsistency = async (
    eventId: string,
    oc: string | null | undefined,
    attachmentName: string | null | undefined,
    ignoreInvoiceId?: string,
  ): Promise<string | null> => {
    const ocNorm = (oc || "").trim().toLowerCase();
    if (!ocNorm) return null;
    const eventInvoices = await storage.getInvoices(eventId);
    const conflicting = eventInvoices.find(inv =>
      inv.id !== ignoreInvoiceId &&
      inv.status !== "recusada" &&
      (inv.oc || "").trim().toLowerCase() === ocNorm &&
      (inv.attachmentName || "") !== (attachmentName || "")
    );
    if (!conflicting) return null;
    return `A OC "${(oc || "").trim()}" já foi usada neste evento com a nota "${conflicting.attachmentName || "sem anexo"}". ` +
      `Lançamentos com a mesma OC precisam ter exatamente a mesma nota fiscal anexada. ` +
      `Confira o número da OC ou anexe o mesmo arquivo.`;
  };

  // O anexo da NF só pode apontar para um anexo NOSSO (23/09): antes
  // `attachmentUrl` aceitava qualquer string, e a tela renderiza o link.
  const ATTACHMENT_URL_RE = /^\/api\/attachments\/ATT-[A-Za-z0-9-]+\/(view|download)$/;
  const anexoDaNotaInvalido = (url: unknown): boolean =>
    url !== undefined && url !== null && url !== "" && !(typeof url === "string" && ATTACHMENT_URL_RE.test(url));

  app.post("/api/invoices", async (req, res) => {
    if (!await requireRoles(req, res, FINANCE_ROLES)) return;
    try {
      // NF não nasce aprovada/paga — envio sempre começa o fluxo
      const { approvedAt: _ap, checkinAt: _ca, checkinBy: _cb, paymentDate: _pd, ...data } = insertInvoiceSchema.parse(req.body);
      if (anexoDaNotaInvalido(data.attachmentUrl)) {
        return res.status(400).json({ message: "Anexo da nota inválido: use um arquivo enviado pelo sistema." });
      }
      if (data.status && data.status !== "enviada" && data.status !== "pendente") {
        data.status = "enviada";
      }
      // Elegibilidade: a prestação precisa existir, ser DESTE evento e estar
      // enviada ou aprovada (devolvida/rejeitada pausa a NF até regularizar)
      if (data.budgetActualId) {
        const actualRef = await storage.getBudgetActualById(data.budgetActualId);
        if (!actualRef) {
          return res.status(400).json({ message: "Prestação (Realizado) não encontrada para esta nota." });
        }
        if (actualRef.eventId !== data.eventId) {
          return res.status(409).json({ message: "A prestação informada pertence a outro evento." });
        }
        const eligible = isNfEligible(actualRef);
        if (!eligible) {
          return res.status(400).json({ message: "Este item do Realizado não está elegível para NF (devolvido, rejeitado ou ainda não enviado)." });
        }
        // Unicidade: uma NF por prestação (constraint no banco cobre corrida)
        const existingInvoices = await storage.getInvoices(data.eventId);
        if (existingInvoices.some(inv => inv.budgetActualId === data.budgetActualId)) {
          return res.status(409).json({ message: "Já existe uma nota fiscal para este item — use o reenvio na nota existente." });
        }
      }
      const ocError = await validateOcConsistency(data.eventId, data.oc, data.attachmentName);
      if (ocError) return res.status(400).json({ message: ocError });
      const firstEvent: HistoricoNfEntrada = { type: "enviado", oc: data.oc || null, attachmentName: data.attachmentName || null, at: new Date().toISOString() };
      const invoice = await storage.createInvoice({ ...data, history: [firstEvent] });
      // A NF não mexe mais no saldo do Flash — só documenta (decisão 19/08,
      // substitui a regra de 17/08 que creditava aqui pelo número da OC). O
      // crédito acontece na aprovação do comparativo (server/flash-credit.ts).
      res.json(invoice);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Dados da nota inválidos. Verifique OC e anexo." });
      }
      if (ehViolacaoDeUnicidade(error)) {
        return res.status(409).json({ message: "Já existe uma nota fiscal para este item." });
      }
      console.error("Error creating invoice:", error);
      res.status(500).json({ message: "Erro ao criar nota fiscal" });
    }
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    if (!await requireRoles(req, res, FINANCE_ROLES)) return;
    try {
      const existing = await storage.getInvoice(req.params.id);
      if (!existing) return res.status(404).json({ message: "Nota fiscal não encontrada" });
      if (anexoDaNotaInvalido(req.body?.attachmentUrl)) {
        return res.status(400).json({ message: "Anexo da nota inválido: use um arquivo enviado pelo sistema." });
      }
      // NF aprovada é imutável por esta rota (check-in tem rota própria)
      if (existing.status === "aprovada") {
        return res.status(400).json({ message: "Nota fiscal aprovada não pode ser alterada." });
      }
      // NF recusada é terminal: a recusa encerra a nota e o client já não
      // oferece reenvio (o Flash não é mais afetado por NF — decisão 19/08).
      if (existing.status === "recusada") {
        return res.status(400).json({ message: "Nota fiscal recusada é definitiva e não pode ser reenviada." });
      }
      // Allowlist: este PATCH serve ao envio/reenvio pelo colaborador.
      // Aprovar/devolver/recusar/check-in têm rotas dedicadas com papel —
      // antes qualquer logado aprovava a própria NF por aqui (IDOR).
      const body: Partial<Invoice> = {};
      for (const k of ["oc", "attachmentUrl", "attachmentName", "paymentText"] as const) {
        if (k in req.body) body[k] = req.body[k];
      }
      if (req.body.status !== undefined) {
        if (req.body.status !== "enviada") {
          return res.status(400).json({ message: "Por esta rota o status só pode ir para 'enviada' (reenvio)." });
        }
        body.status = "enviada";
      }
      let invoice: Invoice;
      // Reenvio (status de volta para enviada): registra "reenviado" com o
      // mesmo append atômico das decisões (antes era ler-alterar-regravar em JS).
      if (body.status === "enviada") {
        const ocError = await validateOcConsistency(
          existing.eventId,
          body.oc !== undefined ? body.oc : existing.oc,
          body.attachmentName !== undefined ? body.attachmentName : existing.attachmentName,
          existing.id,
        );
        if (ocError) return res.status(400).json({ message: ocError });
        // Reenvio limpa o comentário da devolução anterior
        body.returnComment = null;
        [invoice] = await db.update(invoicesTable)
          .set({
            ...body,
            updatedAt: new Date(),
            history: anexarAoHistorico({
              type: "reenviado",
              oc: body.oc ?? existing.oc ?? null,
              attachmentName: body.attachmentName ?? existing.attachmentName ?? null,
            }),
          })
          .where(eq(invoicesTable.id, req.params.id))
          .returning();
      } else {
        invoice = await storage.updateInvoice(req.params.id, body);
      }
      // Reenvio/troca da OC não toca no Flash (decisão 19/08): o saldo vem da
      // aprovação do comparativo, e a nota apenas documenta o pagamento.
      res.json(invoice);
    } catch (error) {
      console.error("Error updating invoice:", error);
      res.status(500).json({ message: "Erro ao atualizar nota fiscal" });
    }
  });

  app.post("/api/invoices/:id/approve", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const inv = await storage.getInvoice(req.params.id);
      const actualRef = inv?.budgetActualId ? await storage.getBudgetActualById(inv.budgetActualId) : null;
      const permissao = podeAprovarNota(inv, actualRef);
      if (!permissao.ok) return res.status(inv ? 400 : 404).json({ message: permissao.motivo });
      const { paymentDate } = req.body;
      const invoice = await decidirNota(req.params.id, "enviada", {
        status: "aprovada",
        ...(paymentDate ? { paymentDate } : {}),
        approvedAt: new Date(),
        returnComment: null,
      }, { type: "aprovado" });
      if (!invoice) return res.status(409).json({ message: "Esta nota acabou de mudar de status — recarregue a lista." });
      await createAuditLog("approve", "invoice", req.params.id, invoice, user.id, user.name, inv, req);
      res.json(invoice);
    } catch (error) {
      console.error("Error approving invoice:", error);
      res.status(500).json({ message: "Erro ao aprovar nota fiscal" });
    }
  });

  app.post("/api/invoices/:id/return", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const inv = await storage.getInvoice(req.params.id);
      const permissao = podeDevolverNota(inv);
      if (!permissao.ok) return res.status(inv ? 400 : 404).json({ message: permissao.motivo });
      const { comment } = req.body;
      // Devolver sem dizer o motivo deixa o colaborador sem saber o que corrigir (24/09).
      if (typeof comment !== "string" || !comment.trim()) {
        return res.status(400).json({ message: "Informe o motivo da devolução para o colaborador saber o que corrigir." });
      }
      const invoice = await decidirNota(req.params.id, "enviada", {
        status: "devolvida",
        returnComment: comment ?? null,
      }, { type: "devolvido", comment: comment || null });
      if (!invoice) return res.status(409).json({ message: "Esta nota acabou de mudar de status — recarregue a lista." });
      await createAuditLog("return", "invoice", req.params.id, invoice, user.id, user.name, inv, req);
      res.json(invoice);
    } catch (error) {
      console.error("Error returning invoice:", error);
      res.status(500).json({ message: "Erro ao devolver nota fiscal" });
    }
  });

  app.post("/api/invoices/:id/reject", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const inv = await storage.getInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Nota fiscal não encontrada" });
      if (inv.status !== "enviada") {
        return res.status(400).json({ message: "Só é possível recusar uma nota com status 'enviada'." });
      }
      const { comment } = req.body;
      const invoice = await decidirNota(req.params.id, "enviada", {
        status: "recusada",
        returnComment: comment ?? null,
      }, { type: "recusado", comment: comment || null });
      if (!invoice) return res.status(409).json({ message: "Esta nota acabou de mudar de status — recarregue a lista." });
      // Recusar a NF não estorna nada no Flash (decisão 19/08): o crédito é do
      // comparativo aprovado, não da nota. O estorno tem UM caminho na tela:
      // Comparativo → "Reabrir comparativo (estorna o Flash)" (chama
      // /api/budget-comparison/:id/return — ver server/flash-credit.ts).
      await createAuditLog("reject", "invoice", req.params.id, invoice, user.id, user.name, inv, req);
      res.json(invoice);
    } catch (error) {
      console.error("Error rejecting invoice:", error);
      res.status(500).json({ message: "Erro ao recusar nota fiscal" });
    }
  });

  app.post("/api/invoices/:id/checkin", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const inv = await storage.getInvoice(req.params.id);
      const { paymentDate } = req.body;
      const permissao = podeFazerCheckin(inv, paymentDate);
      if (!permissao.ok) return res.status(inv ? 400 : 404).json({ message: permissao.motivo });
      // Guarda extra: check-in único (checkin_at ainda nulo) — dois cliques não dobram.
      const [invoice] = await db.update(invoicesTable)
        .set({
          checkinAt: new Date(),
          checkinBy: user.id,
          paymentDate,
          updatedAt: new Date(),
          history: anexarAoHistorico({ type: "checkin", paymentDate }),
        })
        .where(and(eq(invoicesTable.id, req.params.id), eq(invoicesTable.status, "aprovada"), isNull(invoicesTable.checkinAt)))
        .returning();
      if (!invoice) return res.status(409).json({ message: "Esta nota já teve check-in ou mudou de status — recarregue a lista." });
      await createAuditLog("checkin", "invoice", req.params.id, invoice, user.id, user.name, inv, req);
      res.json(invoice);
    } catch (error) {
      console.error("Error doing financial checkin:", error);
      res.status(500).json({ message: "Erro ao fazer check-in financeiro" });
    }
  });
}
