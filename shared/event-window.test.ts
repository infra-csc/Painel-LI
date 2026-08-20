import { describe, it, expect } from "vitest";
import {
  isEventPast,
  canActOnPastEvent,
  isEventLockedFor,
  toIsoDate,
  todayIsoDate,
  PAST_EVENT_BLOCK_MSG,
  PAST_EVENT_BANNER_MSG,
} from "./event-window";

describe("isEventPast — a virada é no dia seguinte ao término", () => {
  it("no próprio último dia do evento ainda NÃO passou", () => {
    expect(isEventPast("2026-08-20", "2026-08-20")).toBe(false);
  });

  it("durante o evento não passou", () => {
    expect(isEventPast("2026-08-25", "2026-08-20")).toBe(false);
  });

  it("no dia seguinte ao término passou", () => {
    expect(isEventPast("2026-08-20", "2026-08-21")).toBe(true);
  });

  it("meses/anos depois continua passado", () => {
    expect(isEventPast("2025-12-31", "2026-01-01")).toBe(true);
    expect(isEventPast("2026-01-31", "2026-02-01")).toBe(true);
  });

  it("evento sem data de término NÃO bloqueia", () => {
    expect(isEventPast(null, "2030-01-01")).toBe(false);
    expect(isEventPast(undefined, "2030-01-01")).toBe(false);
    expect(isEventPast("", "2030-01-01")).toBe(false);
  });

  it("data ilegível não bloqueia (não inventa passado)", () => {
    expect(isEventPast("data inválida", "2030-01-01")).toBe(false);
    expect(isEventPast(new Date("nada"), "2030-01-01")).toBe(false);
  });
});

describe("formato e fuso", () => {
  it("aceita o timestamp que o JSON devolve", () => {
    expect(isEventPast("2026-08-20T00:00:00.000Z", "2026-08-20")).toBe(false);
    expect(isEventPast("2026-08-20T00:00:00.000Z", "2026-08-21")).toBe(true);
  });

  it("aceita Date (data pura = meia-noite UTC) sem escorregar um dia", () => {
    expect(toIsoDate(new Date("2026-08-20T00:00:00.000Z"))).toBe("2026-08-20");
    expect(isEventPast(new Date("2026-08-20T00:00:00.000Z"), "2026-08-20")).toBe(false);
  });

  it("hoje é calculado no fuso do Brasil, não em UTC", () => {
    // 21/08 00:30 UTC ainda é 20/08 21:30 em São Paulo: o último dia do evento
    // não pode acabar cedo demais para quem está no Brasil.
    const meiaNoiteUtc = new Date("2026-08-21T00:30:00.000Z");
    expect(todayIsoDate(meiaNoiteUtc)).toBe("2026-08-20");
    expect(isEventPast("2026-08-20", meiaNoiteUtc)).toBe(false);
    // Já 21/08 12:00 UTC é 21/08 no Brasil: aí sim passou.
    expect(isEventPast("2026-08-20", new Date("2026-08-21T12:00:00.000Z"))).toBe(true);
  });

  it("toIsoDate corta a hora e devolve null para o que não é data", () => {
    expect(toIsoDate("2026-08-20")).toBe("2026-08-20");
    expect(toIsoDate("2026-08-20T23:59:59Z")).toBe("2026-08-20");
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate("20/08/2026")).toBeNull();
  });
});

describe("canActOnPastEvent — SÓ o administrador", () => {
  it("libera admin (inclusive o alias legado do banco)", () => {
    expect(canActOnPastEvent("admin")).toBe(true);
    expect(canActOnPastEvent("administrador")).toBe(true);
  });

  it("RH/Financeiro NÃO age em evento encerrado (decisão 20/08)", () => {
    // O papel não tem permissão de escalação em evento nenhum — liberá-lo aqui
    // seria prometer um acerto que ele não consegue fazer.
    expect(canActOnPastEvent("financial")).toBe(false);
    expect(canActOnPastEvent("financeiro")).toBe(false);
  });

  it("bloqueia todos os demais papéis", () => {
    for (const role of ["production", "purchasing", "function_area", "logistica_interna", "compras", "area_funcional"]) {
      expect(canActOnPastEvent(role)).toBe(false);
    }
  });

  it("papel ausente ou desconhecido não age", () => {
    expect(canActOnPastEvent(null)).toBe(false);
    expect(canActOnPastEvent(undefined)).toBe(false);
    expect(canActOnPastEvent("qualquer_coisa")).toBe(false);
  });
});

describe("isEventLockedFor", () => {
  it("evento passado trava produção/compras/função", () => {
    expect(isEventLockedFor("2026-08-20", "production", "2026-08-21")).toBe(true);
    expect(isEventLockedFor("2026-08-20", "purchasing", "2026-08-21")).toBe(true);
    expect(isEventLockedFor("2026-08-20", "function_area", "2026-08-21")).toBe(true);
  });

  it("evento passado trava também o RH/Financeiro", () => {
    expect(isEventLockedFor("2026-08-20", "financial", "2026-08-21")).toBe(true);
  });

  it("só o administrador continua agindo", () => {
    expect(isEventLockedFor("2026-08-20", "admin", "2026-08-21")).toBe(false);
    expect(isEventLockedFor("2026-08-20", "administrador", "2026-08-21")).toBe(false);
  });

  it("no último dia ninguém está travado", () => {
    expect(isEventLockedFor("2026-08-20", "production", "2026-08-20")).toBe(false);
  });

  it("evento sem término não trava ninguém", () => {
    expect(isEventLockedFor(null, "production", "2030-01-01")).toBe(false);
  });
});

describe("mensagens", () => {
  it("o bloqueio é a frase acordada com o usuário", () => {
    expect(PAST_EVENT_BLOCK_MSG).toBe(
      "Evento encerrado — só o administrador pode alterar. Fale com o administrador se precisar de um acerto.",
    );
  });

  it("o banner aponta para o mesmo responsável do bloqueio", () => {
    expect(PAST_EVENT_BANNER_MSG).toBe(
      "Evento encerrado — somente leitura. Alterações agora só pelo administrador.",
    );
  });

  it("nenhuma das duas mensagens manda falar com o RH", () => {
    for (const msg of [PAST_EVENT_BLOCK_MSG, PAST_EVENT_BANNER_MSG]) {
      expect(msg).not.toMatch(/RH|Financeiro/i);
    }
  });
});
