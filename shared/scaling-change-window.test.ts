import { describe, it, expect } from "vitest";
import {
  changeRequestWindow,
  hasPurchasedTicket,
  isPostValidationInclusion,
  isTicketPurchased,
  CHANGE_WINDOW_BLOCK_MSG,
} from "./scaling-change-window";

const sugestao = { phase: "sugestao", status: "sugestao_pendente" };
const escalada = { phase: "escalacao", status: "confirmado" };

describe("isTicketPurchased", () => {
  it("sem passagem não trava (regra: 'se não tiver, pode sempre')", () => {
    expect(isTicketPurchased(null)).toBe(false);
    expect(isTicketPurchased(undefined)).toBe(false);
    expect(isTicketPurchased({})).toBe(false);
  });

  it("status de compra trava, com folga de caixa e espaço", () => {
    expect(isTicketPurchased({ ticketStatus: "comprada" })).toBe(true);
    expect(isTicketPurchased({ ticketStatus: " Confirmada " })).toBe(true);
  });

  it("pendente não trava e cancelada destrava mesmo com dados da compra", () => {
    expect(isTicketPurchased({ ticketStatus: "pendente" })).toBe(false);
    expect(isTicketPurchased({ ticketStatus: "cancelada", purchaseDate: "2026-08-20" })).toBe(false);
  });

  it("compra preenchida sem status também conta (logística esquece o status)", () => {
    expect(isTicketPurchased({ purchaseDate: "2026-08-20" })).toBe(true);
    expect(isTicketPurchased({ purchaseOrderNumber: "OC-123" })).toBe(true);
    expect(isTicketPurchased({ locator: "ABC123" })).toBe(true);
    expect(isTicketPurchased({ purchaseOrderNumber: "   " })).toBe(false);
  });

  it("hasPurchasedTicket olha ida e volta", () => {
    expect(hasPurchasedTicket([{ ticketStatus: "pendente" }, { ticketStatus: "comprada" }])).toBe(true);
    expect(hasPurchasedTicket([{ ticketStatus: "pendente" }])).toBe(false);
    expect(hasPurchasedTicket(null)).toBe(false);
  });
});

describe("isPostValidationInclusion", () => {
  it("só 'sugestao' é pré-escalação", () => {
    expect(isPostValidationInclusion(sugestao)).toBe(false);
    expect(isPostValidationInclusion(escalada)).toBe(true);
    expect(isPostValidationInclusion({ phase: "inclusao" })).toBe(true);
    expect(isPostValidationInclusion({ phase: "passagem" })).toBe(true);
    expect(isPostValidationInclusion(null)).toBe(false);
  });
});

describe("changeRequestWindow", () => {
  it("vaga em validação: libera sem olhar passagem", () => {
    const w = changeRequestWindow(sugestao, { tickets: [{ ticketStatus: "comprada" }] });
    expect(w.allowed).toBe(true);
    expect(w.postScaling).toBe(false);
    expect(w.adminOverride).toBe(false);
  });

  it("vaga escalada sem passagem: libera em regime pós-escalação", () => {
    const w = changeRequestWindow(escalada);
    expect(w.allowed).toBe(true);
    expect(w.postScaling).toBe(true);
  });

  it("vaga escalada com passagem pendente: ainda libera", () => {
    expect(changeRequestWindow(escalada, { tickets: [{ ticketStatus: "pendente" }] }).allowed).toBe(true);
  });

  it("passagem comprada bloqueia a área com a mensagem da logística", () => {
    const w = changeRequestWindow(escalada, { tickets: [{ ticketStatus: "comprada" }] });
    expect(w.allowed).toBe(false);
    expect(w.block).toBe("passagem_comprada");
    expect(w.message).toBe(CHANGE_WINDOW_BLOCK_MSG.passagem_comprada);
  });

  it("passagem comprada não bloqueia o administrador, mas marca a exceção", () => {
    const w = changeRequestWindow(escalada, { tickets: [{ ticketStatus: "comprada" }], isAdmin: true });
    expect(w.allowed).toBe(true);
    expect(w.adminOverride).toBe(true);
    expect(w.postScaling).toBe(true);
  });

  it("vaga excluída ou cancelada não aceita pedido, nem de admin", () => {
    expect(changeRequestWindow({ ...escalada, deletedAt: new Date() }, { isAdmin: true }).allowed).toBe(false);
    expect(changeRequestWindow({ ...escalada, status: "cancelado" }, { isAdmin: true }).block).toBe("vaga_cancelada");
    expect(changeRequestWindow({ phase: "sugestao", status: "sugestao_negada" }).block).toBe("vaga_cancelada");
    expect(changeRequestWindow(null).allowed).toBe(false);
  });
});
